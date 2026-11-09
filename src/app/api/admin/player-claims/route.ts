// @polsia:user-owned — application-admin review for UDisc identity claims.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/business/api-authorization.server';
import { findUDiscRecords, linkIdentityHistory } from '@/lib/business/player-identity.server';
import { PlayerClaimListSchema, ReviewPlayerClaimSchema } from '@/lib/contracts/player-identity';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const authorization = await requireAdminApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;

  const claims = await prisma.playerClaim.findMany({
    where: { status: 'PENDING' },
    include: { identity: true },
    orderBy: { requestedAt: 'asc' },
  });
  const claimantIds = [...new Set(claims.map((claim) => claim.claimantUserId))];
  const users = await prisma.user.findMany({
    where: { id: { in: claimantIds } },
    select: { id: true, name: true, email: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  const items = await Promise.all(
    claims.map(async (claim) => {
      const matching = await findUDiscRecords(prisma, claim.identity.normalizedUsername);
      const claimant = userById.get(claim.claimantUserId);
      return {
        id: claim.id,
        username: claim.identity.normalizedUsername,
        displayNames: matching.displayNames,
        claimantName: claimant?.name ?? 'Fairway Friends player',
        claimantEmail: claimant?.email ?? 'Unavailable',
        requestedAt: claim.requestedAt.toISOString(),
      };
    }),
  );
  return NextResponse.json(PlayerClaimListSchema.parse({ claims: items }));
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const authorization = await requireAdminApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = ReviewPlayerClaimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Choose an approval decision.' }, { status: 400 });

  const result = await prisma.$transaction(async (transaction) => {
    const claim = await transaction.playerClaim.findUnique({
      where: { id: parsed.data.claimId },
      include: { identity: true },
    });
    if (!claim || claim.status !== 'PENDING') return 'not-pending' as const;
    const reserved = await transaction.uDiscIdentity.updateMany({
      where: {
        id: claim.identityId,
        ownerUserId: null,
        pendingClaimUserId: claim.claimantUserId,
      },
      data:
        parsed.data.decision === 'approve'
          ? { ownerUserId: claim.claimantUserId, pendingClaimUserId: null }
          : { pendingClaimUserId: null },
    });
    if (reserved.count !== 1) return 'not-pending' as const;

    const changed = await transaction.playerClaim.updateMany({
      where: { id: claim.id, status: 'PENDING' },
      data: {
        status: parsed.data.decision === 'approve' ? 'APPROVED' : 'DENIED',
        reviewedByUserId: authorization.user.id,
        reviewNote: parsed.data.reviewNote ?? null,
        reviewedAt: new Date(),
      },
    });
    if (changed.count !== 1) return 'not-pending' as const;
    if (parsed.data.decision === 'approve') {
      await linkIdentityHistory(transaction, claim.identityId, claim.identity.normalizedUsername);
    }
    return parsed.data.decision;
  });

  if (result === 'not-pending') {
    return NextResponse.json({ error: 'This claim has already been reviewed.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, decision: result });
}
