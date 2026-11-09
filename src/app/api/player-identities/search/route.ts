// @polsia:user-owned — exact, public UDisc username search used before signup.
import 'server-only';
import { NextResponse } from 'next/server';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import { findUDiscRecords } from '@/lib/business/player-identity.server';
import { PlayerIdentitySearchSchema } from '@/lib/contracts/player-identity';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const username = new URL(request.url).searchParams.get('username')?.trim() ?? '';
  const normalizedUsername = normalizeUDiscUsername(username);
  if (!normalizedUsername) {
    return NextResponse.json({ error: 'Enter a UDisc username to search.' }, { status: 400 });
  }

  const [records, identity, reservation] = await Promise.all([
    findUDiscRecords(prisma, normalizedUsername),
    prisma.uDiscIdentity.findUnique({ where: { normalizedUsername } }),
    prisma.playerRegistrationChoice.findUnique({ where: { normalizedUsername } }),
  ]);
  if (reservation && reservation.expiresAt.getTime() <= Date.now()) {
    await prisma.playerRegistrationChoice.deleteMany({ where: { id: reservation.id } });
  }
  const reservationActive = reservation !== null && reservation.expiresAt.getTime() > Date.now();
  const claimStatus = identity?.ownerUserId
    ? 'claimed'
    : identity?.pendingClaimUserId || reservationActive
      ? 'pending'
      : 'none';
  const isAvailable = claimStatus === 'none';

  return NextResponse.json(
    PlayerIdentitySearchSchema.parse({
      username: username.trim().replace(/^@/u, ''),
      normalizedUsername,
      hasExistingRecord: records.exists,
      isAvailable,
      claimStatus,
      displayNames: records.displayNames,
    }),
  );
}
