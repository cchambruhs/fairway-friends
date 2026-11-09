// @polsia:user-owned — signed-in player identity choice and approval status.
import 'server-only';
import { NextResponse } from 'next/server';
import {
  PlayerIdentityConflict,
  registerPlayerIdentity,
} from '@/lib/business/player-identity.server';
import {
  PlayerIdentityChoiceSchema,
  PlayerIdentityEnrollResponseSchema,
  PlayerIdentityStateSchema,
} from '@/lib/contracts/player-identity';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

async function signedInUser(request: Request) {
  try {
    return await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
}

export async function GET(request: Request): Promise<Response> {
  const user = await signedInUser(request);
  if (user instanceof Response) return user;

  const identity = await prisma.uDiscIdentity.findFirst({
    where: { OR: [{ ownerUserId: user.id }, { pendingClaimUserId: user.id }] },
  });
  if (!identity) {
    return NextResponse.json(
      PlayerIdentityStateSchema.parse({ identity: null, profileComplete: false }),
    );
  }
  const pending = identity.pendingClaimUserId === user.id;
  const latestClaim = await prisma.playerClaim.findFirst({
    where: { identityId: identity.id, claimantUserId: user.id },
    orderBy: { requestedAt: 'desc' },
    select: { status: true },
  });
  return NextResponse.json(
    PlayerIdentityStateSchema.parse({
      identity: {
        id: identity.id,
        username: identity.normalizedUsername,
        status: pending ? 'pending' : 'verified',
        claimStatus: pending
          ? 'pending'
          : (latestClaim?.status.toLocaleLowerCase('en-US') ?? 'none'),
      },
      profileComplete: true,
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const user = await signedInUser(request);
  if (user instanceof Response) return user;
  const parsed = PlayerIdentityChoiceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Choose a valid player profile.' }, { status: 400 });

  try {
    const result = await prisma.$transaction((transaction) =>
      registerPlayerIdentity(transaction, { id: user.id, name: user.name }, parsed.data),
    );
    return NextResponse.json(PlayerIdentityEnrollResponseSchema.parse(result), { status: 201 });
  } catch (error) {
    if (error instanceof PlayerIdentityConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'That player profile is already in use.' },
        { status: 409 },
      );
    }
    throw error;
  }
}
