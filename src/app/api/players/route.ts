// @polsia:user-owned — public player directory contains display names and verified round counts only.
import 'server-only';
import { NextResponse } from 'next/server';
import { loadHiddenOwnerIds } from '@/lib/business/public-name-privacy.server';
import { PublicPlayerDirectorySchema } from '@/lib/contracts/player-identity';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const profiles = await prisma.playerProfile.findMany({
    select: { userId: true, displayName: true },
    orderBy: { displayName: 'asc' },
    take: 500,
  });
  const userIds = profiles.map((profile) => profile.userId);
  const identities = await prisma.uDiscIdentity.findMany({
    where: { OR: [{ ownerUserId: { in: userIds } }, { pendingClaimUserId: { in: userIds } }] },
    select: { id: true, normalizedUsername: true, ownerUserId: true, pendingClaimUserId: true },
  });
  const identitiesByUser = new Map(
    identities.flatMap((identity) => {
      const userId = identity.ownerUserId ?? identity.pendingClaimUserId;
      return userId ? [[userId, identity] as const] : [];
    }),
  );
  const identityIds = identities.flatMap((identity) => (identity.ownerUserId ? [identity.id] : []));
  const roundCounts = identityIds.length
    ? await prisma.importedScorecardPlayer.groupBy({
        by: ['identityId'],
        where: {
          identityId: { in: identityIds },
          scorecard: { is: { finalizedAt: { not: null } } },
        },
        _count: { id: true },
      })
    : [];
  const roundsByIdentity = new Map(roundCounts.map((item) => [item.identityId, item._count.id]));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });
  const existingUsers = new Set(users.map((user) => user.id));
  // Players who hid their public name are left out of the public directory.
  const hiddenUsers = await loadHiddenOwnerIds(prisma, userIds);
  return NextResponse.json(
    PublicPlayerDirectorySchema.parse({
      items: profiles
        .filter((profile) => existingUsers.has(profile.userId) && !hiddenUsers.has(profile.userId))
        .map((profile) => {
          const identity = identitiesByUser.get(profile.userId);
          return {
            userId: profile.userId,
            displayName: profile.displayName,
            username: identity?.normalizedUsername ?? null,
            rounds: identity?.ownerUserId ? (roundsByIdentity.get(identity.id) ?? 0) : 0,
            profileHref: `/players/user/${encodeURIComponent(profile.userId)}`,
          };
        }),
    }),
  );
}
