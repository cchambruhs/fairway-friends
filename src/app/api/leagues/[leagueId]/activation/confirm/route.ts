// @polsia:user-owned — activation changes only after verified payment for its saved checkout.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { lockLeagueForCapacity } from '@/lib/business/league-management.server';
import {
  LeagueActivationConfirmSchema,
  LeagueActivationResultSchema,
} from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';
import {
  StripeBillingConfigurationError,
  StripeBillingNotEnabledError,
  StripeBillingOnboardingError,
  verifyCheckoutSession,
} from '@/lib/stripe-billing/client';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = LeagueActivationConfirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { leagueId } = await params;
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
    select: { role: true },
  });
  if (membership?.role !== 'LEADER') {
    return NextResponse.json(
      { error: 'Only the League Leader can complete activation.' },
      { status: 403 },
    );
  }
  const attempt = await prisma.leagueActivationAttempt.findUnique({
    where: { stripeSessionId: parsed.data.sessionId },
    select: {
      id: true,
      leagueId: true,
      userId: true,
      amountUsd: true,
      tier: true,
      completedAt: true,
    },
  });
  if (!attempt || attempt.leagueId !== leagueId || attempt.userId !== authorization.user.id) {
    return NextResponse.json(
      { error: 'No matching League activation checkout was found.' },
      { status: 404 },
    );
  }
  if (attempt.completedAt) {
    return NextResponse.json(
      LeagueActivationResultSchema.parse({ activated: true, alreadyActivated: true }),
    );
  }

  try {
    const verification = await verifyCheckoutSession({ sessionId: parsed.data.sessionId });
    if (!verification.verified || verification.payment?.gross_amount_usd !== attempt.amountUsd) {
      return NextResponse.json(
        { error: 'Payment is not verified for this activation offer.' },
        { status: 409 },
      );
    }
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
    return NextResponse.json({ error: 'payment_verification_failed' }, { status: 502 });
  }

  const activated = await prisma.$transaction(async (transaction) => {
    await lockLeagueForCapacity(transaction, leagueId);
    const currentMembership = await transaction.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
      select: { role: true },
    });
    if (currentMembership?.role !== 'LEADER') return 'forbidden' as const;
    const currentAttempt = await transaction.leagueActivationAttempt.findUnique({
      where: { stripeSessionId: parsed.data.sessionId },
      select: { id: true, completedAt: true },
    });
    if (!currentAttempt) return 'missing' as const;
    if (currentAttempt.completedAt) return 'already' as const;
    const saved = await transaction.league.updateMany({
      where: { id: leagueId, activatedAt: null },
      data: { activatedAt: new Date(), activationTier: attempt.tier },
    });
    if (saved.count !== 1) return 'already' as const;
    await transaction.leagueActivationAttempt.update({
      where: { id: currentAttempt.id },
      data: { completedAt: new Date() },
    });
    return 'activated' as const;
  });
  if (activated === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (activated === 'missing')
    return NextResponse.json({ error: 'Activation checkout not found.' }, { status: 404 });
  return NextResponse.json(
    LeagueActivationResultSchema.parse({
      activated: activated === 'activated' || activated === 'already',
      alreadyActivated: activated === 'already',
    }),
  );
}
