// @polsia:user-owned
//
// POST /api/stripe-billing/checkout
// App-owned runtime checkout route: the browser posts a product id, the server
// prices it from the catalog below, creates a hosted Stripe Checkout session
// through Polsia's payment proxy, and returns the redirect URL.
//
// Adapt CATALOG (or replace it with your own DB lookup) to your app. Keep the
// invariant: the PRICE is always decided on the server. Never accept an amount
// from the request body.

import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import {
  createCheckoutSession,
  StripeBillingConfigurationError,
  StripeBillingNotEnabledError,
  StripeBillingOnboardingError,
} from '@/lib/stripe-billing/client';

export const dynamic = 'force-dynamic';

// Fixed literal products ONLY. If the app stores products/tickets in a DB (a
// Prisma model or admin CRUD that creates them), DELETE this and price from the
// DB instead (`prisma.<model>.findUnique`/`findMany` by id) — a stale CATALOG
// means real product ids miss and the buyer can't check out. Prices are ALWAYS
// server-side; an unknown product returns 404 below, never a throw. See AGENT.md.
// A product with an `interval` is a recurring SUBSCRIPTION (billed each period);
// without one it's a one-time charge. amountUsd is the per-period price for subs.
const CATALOG: Record<string, { name: string; amountUsd: number; interval?: 'month' | 'year' }> = {
  example: { name: 'Example product', amountUsd: 19 },
  'example-monthly': { name: 'Pro (monthly)', amountUsd: 19, interval: 'month' },
};

const checkoutRequestSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99).optional(),
});

/**
 * PUBLIC origin for the Stripe redirects. Do NOT use `new URL(req.url).origin` —
 * behind Polsia's proxy that's the INTERNAL bind host (e.g. localhost:3000) and
 * the redirect breaks. Prefer: Origin header → forwarded host → configured URL.
 */
function resolveOrigin(req: Request): string {
  const origin = req.headers.get('origin');
  if (origin) return origin.replace(/\/+$/, '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${host}`;
  }
  return env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
}

export async function POST(req: Request) {
  const parsed = checkoutRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const product = CATALOG[parsed.data.productId];
  if (!product) {
    return NextResponse.json({ error: 'unknown_product' }, { status: 404 });
  }

  const origin = resolveOrigin(req);
  // Stripe substitutes {CHECKOUT_SESSION_ID}; the success page passes it to
  // /api/stripe-billing/verify.
  const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/checkout/cancelled`;
  try {
    const session = await createCheckoutSession(
      product.interval
        ? {
            // Subscription: a single recurring tier (no cart / quantity).
            amountUsd: product.amountUsd,
            name: product.name,
            recurring: { interval: product.interval },
            successUrl,
            cancelUrl,
          }
        : {
            lineItems: [
              {
                name: product.name,
                amountUsd: product.amountUsd,
                quantity: parsed.data.quantity ?? 1,
              },
            ],
            successUrl,
            cancelUrl,
          },
    );
    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof StripeBillingNotEnabledError) {
      return NextResponse.json({ error: 'payments_not_enabled' }, { status: 503 });
    }
    if (err instanceof StripeBillingOnboardingError) {
      return NextResponse.json({ error: err.code }, { status: 503 });
    }
    if (err instanceof StripeBillingConfigurationError) {
      return NextResponse.json({ error: 'stripe_billing_not_configured' }, { status: 503 });
    }
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
}
