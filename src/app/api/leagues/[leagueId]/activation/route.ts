// @polsia:user-owned — protected hosted checkout for the League activation offers.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { LEAGUE_ACTIVATION_OFFERS } from '@/lib/business/league-management.server';
import {
  LeagueActivationCheckoutSchema,
  LeagueActivationRequestSchema,
} from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { sameOrigin } from '@/lib/same-origin';
import {
  createCheckoutSession,
  StripeBillingConfigurationError,
  StripeBillingNotEnabledError,
  StripeBillingOnboardingError,
} from '@/lib/stripe-billing/client';

export const dynamic = 'force-dynamic';

function resolveOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin) return origin.replace(/\/+$/, '');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host) return `${request.headers.get('x-forwarded-proto') ?? 'https'}://${host}`;
  return env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = LeagueActivationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { leagueId } = await params;
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
    select: { role: true },
  });
  if (membership?.role !== 'LEADER') {
    return NextResponse.json(
      { error: 'Only the League Leader can activate this League.' },
      { status: 403 },
    );
  }
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, activatedAt: true },
  });
  if (!league) return NextResponse.json({ error: 'League not found.' }, { status: 404 });
  if (league.activatedAt)
    return NextResponse.json({ error: 'This League is already active.' }, { status: 409 });
  const offer = LEAGUE_ACTIVATION_OFFERS.find((item) => item.id === parsed.data.offerId);
  if (!offer)
    return NextResponse.json({ error: 'Choose a listed activation offer.' }, { status: 400 });
  const pending = await prisma.leagueActivationAttempt.findFirst({
    where: {
      leagueId,
      userId: authorization.user.id,
      amountUsd: offer.amountUsd,
      completedAt: null,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    select: { checkoutUrl: true },
  });
  if (pending)
    return NextResponse.json(LeagueActivationCheckoutSchema.parse({ url: pending.checkoutUrl }));

  const origin = resolveOrigin(request);
  try {
    const session = await createCheckoutSession({
      amountUsd: offer.amountUsd,
      name: `Fairway Friends League activation — $${offer.amountUsd}`,
      description: `One-time activation for ${league.name}`,
      successUrl: `${origin}/dashboard/leagues/${encodeURIComponent(leagueId)}/activation?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/dashboard/leagues/${encodeURIComponent(leagueId)}`,
      customerEmail: authorization.user.email,
      metadata: { leagueId, userId: authorization.user.id, offerId: offer.id },
    });
    await prisma.leagueActivationAttempt.create({
      data: {
        leagueId,
        userId: authorization.user.id,
        stripeSessionId: session.stripeSessionId,
        checkoutUrl: session.url,
        amountUsd: offer.amountUsd,
        tier: offer.id,
      },
    });
    return NextResponse.json(LeagueActivationCheckoutSchema.parse({ url: session.url }));
  } catch (error) {
    if (error instanceof StripeBillingNotEnabledError) {
      return NextResponse.json({ error: 'payments_not_enabled' }, { status: 503 });
    }
    if (error instanceof StripeBillingOnboardingError) {
      return NextResponse.json({ error: error.code }, { status: 503 });
    }
    if (error instanceof StripeBillingConfigurationError) {
      return NextResponse.json({ error: 'stripe_billing_not_configured' }, { status: 503 });
    }
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
}
