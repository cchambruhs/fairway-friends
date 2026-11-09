// @polsia:framework-owned - DO NOT EDIT. Code installed by polsia/modules/stripe-billing@0.8.0. Drift = commit rejected.
//
// Server-only Polsia billing helpers. No Stripe SDK, no Stripe secrets in the
// app — checkout, customer portal, verify, and payment events go through the proxy.
// Full usage guide in AGENT.md.

import 'server-only';
import { env } from '@/lib/env';
import {
  type CheckoutSessionResult,
  type CheckoutVerificationResult,
  type CreateCheckoutSessionInput,
  type CreateCustomerPortalSessionInput,
  type CustomerPortalSessionResult,
  checkoutSessionResultSchema,
  checkoutVerificationResultSchema,
  createCheckoutSessionInputSchema,
  createCustomerPortalSessionInputSchema,
  customerPortalSessionResultSchema,
  type PaymentEventsResult,
  type PaymentEventType,
  paymentEventsResultSchema,
  type SubscriptionStatusResult,
  subscriptionStatusResultSchema,
} from '@/lib/stripe-billing/schema';

export class StripeBillingConfigurationError extends Error {
  constructor(message = 'Stripe billing is not configured for this app.') {
    super(message);
    this.name = 'StripeBillingConfigurationError';
  }
}

// Runtime payments not enabled for this company. Surface this — NEVER fall back
// to a raw Stripe SDK integration or a hardcoded Stripe URL.
export class StripeBillingNotEnabledError extends Error {
  constructor(
    message = 'Runtime payments are not enabled for this app yet. Ask the owner to finish Stripe onboarding on the Polsia dashboard Payments page, or contact Polsia support.',
  ) {
    super(message);
    this.name = 'StripeBillingNotEnabledError';
  }
}

// Owner hasn't finished Stripe onboarding. Surface to the owner — not an app bug.
export class StripeBillingOnboardingError extends Error {
  readonly code: 'stripe_not_configured' | 'stripe_not_onboarded';

  constructor(code: 'stripe_not_configured' | 'stripe_not_onboarded') {
    super(
      code === 'stripe_not_configured'
        ? 'Stripe is not set up for this business yet. The owner must connect Stripe from the Polsia dashboard Payments page.'
        : 'Stripe onboarding is incomplete for this business. The owner must finish onboarding from the Polsia dashboard Payments page before payments can be accepted.',
    );
    this.name = 'StripeBillingOnboardingError';
    this.code = code;
  }
}

export interface VerifyCheckoutSessionInput {
  sessionId: string;
}

export interface GetSubscriptionStatusInput {
  email: string;
}

export interface ListPaymentEventsInput {
  /** Return events with id > sinceCursor. Persist nextCursor between calls. */
  sinceCursor?: number;
  /** 1..100, default 50. */
  limit?: number;
  /** Event types to return; omitted → the platform default (`payment_received` only). */
  types?: readonly PaymentEventType[];
}

/** Separator of the `types` query param expected by the events endpoint. */
const EVENT_TYPES_SEPARATOR = ',';

function polsiaApiBaseUrl() {
  return env.POLSIA_API_BASE_URL.replace(/\/+$/, '');
}

function polsiaApiKey() {
  const key = env.POLSIA_API_KEY ?? env.POLSIA_API_TOKEN;
  if (!key) {
    throw new StripeBillingConfigurationError(
      'POLSIA_API_KEY is missing. Polsia injects it into deployed apps; local dev must set it manually.',
    );
  }
  return key;
}

function buildUrl(path: string, searchParams: Record<string, string> = {}) {
  const base = polsiaApiBaseUrl();
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function throwTypedError(status: number, body: unknown): never {
  const detail =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : '';
  if (status === 404 && detail === 'not_enabled') {
    throw new StripeBillingNotEnabledError();
  }
  if (status === 409 && (detail === 'stripe_not_configured' || detail === 'stripe_not_onboarded')) {
    throw new StripeBillingOnboardingError(detail);
  }
  throw new Error(`Polsia billing API request failed: ${status} ${detail}`.trim());
}

async function polsiaJson(
  path: string,
  init: { method: 'GET' | 'POST'; searchParams?: Record<string, string>; body?: unknown },
) {
  const res = await fetch(buildUrl(path, init.searchParams ?? {}), {
    method: init.method,
    headers: {
      authorization: `Bearer ${polsiaApiKey()}`,
      accept: 'application/json',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throwTypedError(res.status, body);
  }
  return body;
}

export async function verifyCheckoutSession(
  input: VerifyCheckoutSessionInput,
): Promise<CheckoutVerificationResult> {
  const body = await polsiaJson('/api/company-payments/verify', {
    method: 'GET',
    searchParams: { session_id: input.sessionId },
  });
  return checkoutVerificationResultSchema.parse(body);
}

/**
 * Subscription access verdict + state for one customer email. The platform
 * response is validated and returned AS-IS: `active` is the platform's access
 * verdict (true for `active` and `trialing` only) and `status` is Stripe's
 * subscription status passed through verbatim (`trialing`, `past_due`,
 * `unpaid`, `canceled`, `paused`, ... or `not_found`) — never remapped here.
 * Gate on `active`; render the subscriber's state from `status`. `plan`,
 * `monthly_amount`, `current_period_end` and `customer_email` are only present
 * while `active` is true.
 */
export async function getSubscriptionStatus(
  input: GetSubscriptionStatusInput,
): Promise<SubscriptionStatusResult> {
  const body = await polsiaJson('/api/company-payments/subscription-status', {
    method: 'GET',
    searchParams: { email: input.email },
  });
  return subscriptionStatusResultSchema.parse(body);
}

/**
 * Runtime Stripe Checkout session → hosted checkout URL. Handles both:
 *   - one-time: a dynamic amount (`amountUsd`) or a cart (`lineItems`);
 *   - subscription: pass `recurring: { interval: 'month' | 'year' }` with
 *     `amountUsd` (the per-period price) — a recurring checkout, 20% per invoice.
 * Prices MUST be computed server-side — never trust an amount from the browser.
 * Put `?session_id={CHECKOUT_SESSION_ID}` in successUrl so the success page can
 * call verifyCheckoutSession. For subscription access control later, poll
 * getSubscriptionStatus({ email }).
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  const parsed = createCheckoutSessionInputSchema.parse(input);
  const body = await polsiaJson('/api/v2/app-payments/checkout-session', {
    method: 'POST',
    body: {
      ...(parsed.lineItems
        ? {
            line_items: parsed.lineItems.map((item) => ({
              name: item.name,
              amount: item.amountUsd,
              ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
            })),
          }
        : { amount: parsed.amountUsd }),
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      success_url: parsed.successUrl,
      cancel_url: parsed.cancelUrl,
      ...(parsed.customerEmail !== undefined ? { customer_email: parsed.customerEmail } : {}),
      ...(parsed.recurring !== undefined
        ? { recurring: { interval: parsed.recurring.interval } }
        : {}),
      ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
      ...(parsed.collectShippingAddress !== undefined
        ? { collect_shipping_address: parsed.collectShippingAddress }
        : {}),
      ...(parsed.shippingCountries !== undefined
        ? { shipping_countries: parsed.shippingCountries }
        : {}),
      ...(parsed.allowPromotionCodes !== undefined
        ? { allow_promotion_codes: parsed.allowPromotionCodes }
        : {}),
      ...(parsed.clientReferenceId !== undefined
        ? { client_reference_id: parsed.clientReferenceId }
        : {}),
      ...(parsed.locale !== undefined ? { locale: parsed.locale } : {}),
      ...(parsed.billingAddressCollection !== undefined
        ? { billing_address_collection: parsed.billingAddressCollection }
        : {}),
      ...(parsed.collectPhoneNumber !== undefined
        ? { collect_phone_number: parsed.collectPhoneNumber }
        : {}),
      ...(parsed.submitType !== undefined ? { submit_type: parsed.submitType } : {}),
      ...(parsed.trialPeriodDays !== undefined
        ? { trial_period_days: parsed.trialPeriodDays }
        : {}),
    },
  });
  const session = (body as { checkout_session?: unknown })?.checkout_session;
  const raw = session as {
    id: number;
    stripe_session_id: string;
    url: string;
    total_amount_usd: number;
    company_receives: number;
    platform_fee: number;
    billing_interval?: 'month' | 'year';
    recurring?: boolean;
  };
  return checkoutSessionResultSchema.parse({
    id: raw.id,
    stripeSessionId: raw.stripe_session_id,
    url: raw.url,
    totalAmountUsd: raw.total_amount_usd,
    companyReceives: raw.company_receives,
    platformFee: raw.platform_fee,
    ...(raw.billing_interval !== undefined ? { billingInterval: raw.billing_interval } : {}),
    ...(raw.recurring !== undefined ? { recurring: raw.recurring } : {}),
  });
}

/**
 * Creates a short-lived Stripe-hosted portal session for an authenticated
 * subscriber. Call this only from an app-owned server route protected by the
 * app's auth module. Derive customerEmail from the authenticated user and
 * returnUrl from the app origin — never accept either value from the browser.
 */
export async function createCustomerPortalSession(
  input: CreateCustomerPortalSessionInput,
): Promise<CustomerPortalSessionResult> {
  const parsed = createCustomerPortalSessionInputSchema.parse(input);
  const body = await polsiaJson('/api/v2/app-payments/customer-portal-session', {
    method: 'POST',
    body: {
      customer_email: parsed.customerEmail,
      return_url: parsed.returnUrl,
    },
  });
  return customerPortalSessionResultSchema.parse(body);
}

/**
 * Cursor feed of the company's payment events — how the app learns a payment
 * landed WITHOUT any inbound Stripe callback. Persist nextCursor, poll from it,
 * process each event idempotently (dedupe on id / stripeCheckoutSessionId).
 * `grossAmountUsd` is what the buyer paid; legacy `amountUsd` remains the
 * seller's recorded proceeds after applicable fees. Pass
 * `types: ['payment_received', 'payment_refunded']` to also read refunds.
 */
export async function listPaymentEvents(
  input: ListPaymentEventsInput = {},
): Promise<PaymentEventsResult> {
  const body = await polsiaJson('/api/v2/app-payments/events', {
    method: 'GET',
    searchParams: {
      ...(input.sinceCursor !== undefined ? { since: String(input.sinceCursor) } : {}),
      ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
      ...(input.types?.length ? { types: input.types.join(EVENT_TYPES_SEPARATOR) } : {}),
    },
  });
  type RawShipping = {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
  const raw = body as {
    events: Array<{
      id: number;
      type: string;
      amount_usd: number | null;
      gross_amount_usd?: number | null;
      customer_email: string | null;
      description: string | null;
      stripe_payment_intent_id: string | null;
      stripe_checkout_session_id: string | null;
      shipping?: RawShipping;
      occurred_at: string;
    }>;
    next_cursor: number;
  };
  return paymentEventsResultSchema.parse({
    events: (raw.events ?? []).map((e) => ({
      id: e.id,
      type: e.type,
      amountUsd: e.amount_usd,
      ...(e.gross_amount_usd !== undefined ? { grossAmountUsd: e.gross_amount_usd } : {}),
      customerEmail: e.customer_email,
      description: e.description,
      stripePaymentIntentId: e.stripe_payment_intent_id,
      stripeCheckoutSessionId: e.stripe_checkout_session_id,
      shipping: e.shipping
        ? {
            name: e.shipping.name,
            line1: e.shipping.line1,
            line2: e.shipping.line2,
            city: e.shipping.city,
            state: e.shipping.state,
            postalCode: e.shipping.postal_code,
            country: e.shipping.country,
          }
        : null,
      occurredAt: e.occurred_at,
    })),
    nextCursor: raw.next_cursor,
  });
}
