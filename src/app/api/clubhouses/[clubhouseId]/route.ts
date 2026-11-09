// @polsia:user-owned — authorized Clubhouse members, standings and assigned global scorecards.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { importedScorecardItem } from '@/lib/business/imported-scorecard';
import { ClubhouseDetailSchema } from '@/lib/contracts/clubhouses';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function roleLabel(role: string): 'Owner' | 'Admin' | 'Member' {
  if (role === 'OWNER') return 'Owner';
  if (role === 'ADMIN') return 'Admin';
  return 'Member';
}

function placementRank(position: string | null): number | null {
  if (!position) return null;
  const match = /^T?\s*(\d+)(?:st|nd|rd|th)?$/iu.exec(position.trim());
  const rank = match?.[1] ? Number(match[1]) : Number.NaN;
  return Number.isInteger(rank) && rank > 0 ? rank : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clubhouseId: string }> },
): Promise<Response> {
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { clubhouseId } = await params;
  const membership = await prisma.clubhouseMembership.findUnique({
    where: { clubhouseId_userId: { clubhouseId, userId: authorization.user.id } },
  });
  if (!membership)
    return NextResponse.json({ error: 'Clubhouse membership required.' }, { status: 403 });

  const clubhouse = await prisma.clubhouse.findUnique({
    where: { id: clubhouseId },
    include: { _count: { select: { memberships: true } } },
  });
  if (!clubhouse) return NextResponse.json({ error: 'Clubhouse not found.' }, { status: 404 });
  const manages = membership.role === 'OWNER' || membership.role === 'ADMIN';
  const [memberships, requests, cards, selection] = await Promise.all([
    prisma.clubhouseMembership.findMany({
      where: { clubhouseId },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    }),
    manages
      ? prisma.clubhouseJoinRequest.findMany({
          where: { clubhouseId, status: 'PENDING' },
          orderBy: { requestedAt: 'asc' },
        })
      : Promise.resolve([]),
    prisma.importedScorecard.findMany({
      where: {
        clubhouseLinks: { some: { clubhouseId } },
        deletedAt: null,
      },
      include: {
        players: { orderBy: { sourceOrder: 'asc' } },
        clubhouseLinks: { include: { clubhouse: true } },
        league: true,
        editRequests: { where: { status: 'APPROVED' }, select: { id: true } },
      },
      orderBy: [{ playedOn: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.userClubhouseSelection.findUnique({ where: { userId: authorization.user.id } }),
  ]);
  const memberIds = memberships.map((item) => item.userId);
  const [users, profiles, identities, requestUsers, requestProfiles] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true } }),
    prisma.playerProfile.findMany({
      where: { userId: { in: memberIds } },
      select: { userId: true, displayName: true },
    }),
    prisma.uDiscIdentity.findMany({
      where: { ownerUserId: { in: memberIds } },
      select: { id: true, ownerUserId: true },
    }),
    prisma.user.findMany({
      where: { id: { in: requests.map((item) => item.userId) } },
      select: { id: true, name: true },
    }),
    prisma.playerProfile.findMany({
      where: { userId: { in: requests.map((item) => item.userId) } },
      select: { userId: true, displayName: true },
    }),
  ]);
  const names = new Map(users.map((item) => [item.id, item.name]));
  const profileNames = new Map(profiles.map((item) => [item.userId, item.displayName]));
  const stats = new Map(
    memberIds.map((id) => [
      id,
      { rounds: 0, scoreTotal: 0, placements: 0, wins: 0, holesPlayed: 0, strokesThrown: 0 },
    ]),
  );
  const identityById = new Map(
    identities.flatMap((identity) =>
      identity.ownerUserId ? [[identity.id, identity.ownerUserId] as const] : [],
    ),
  );
  for (const card of cards) {
    const countedUsers = new Set<string>();
    for (const player of card.players) {
      const userId = player.identityId ? identityById.get(player.identityId) : undefined;
      const total = userId ? stats.get(userId) : undefined;
      if (!total || !userId || countedUsers.has(userId)) continue;
      countedUsers.add(userId);
      const playedScores = Array.isArray(player.holeScores)
        ? player.holeScores.filter((score): score is number => typeof score === 'number')
        : [];
      total.holesPlayed += playedScores.length;
      total.strokesThrown += playedScores.reduce((sum, score) => sum + score, 0);
      if (!card.finalizedAt || player.didNotFinish) continue;
      total.rounds += 1;
      total.scoreTotal += player.totalScore;
      const rank = placementRank(player.position);
      if (rank !== null) {
        total.placements += 1;
        if (rank === 1) total.wins += 1;
      }
    }
  }
  const requestNames = new Map(requestUsers.map((item) => [item.id, item.name]));
  const requestProfileNames = new Map(
    requestProfiles.map((item) => [item.userId, item.displayName]),
  );
  const rankedMembers = [...stats.entries()]
    .filter(([, total]) => total.rounds > 0)
    .map(([userId, total]) => ({
      userId,
      wins: total.wins,
      averageScore: Number((total.scoreTotal / total.rounds).toFixed(2)),
      rounds: total.rounds,
    }))
    .sort(
      (left, right) =>
        right.wins - left.wins ||
        left.averageScore - right.averageScore ||
        right.rounds - left.rounds ||
        left.userId.localeCompare(right.userId),
    );
  const rankByUserId = new Map<string, number>();
  let currentRank = 0;
  let priorRankedMember: (typeof rankedMembers)[number] | undefined;
  rankedMembers.forEach((member, index) => {
    if (
      !priorRankedMember ||
      member.wins !== priorRankedMember.wins ||
      member.averageScore !== priorRankedMember.averageScore
    ) {
      currentRank = index + 1;
    }
    rankByUserId.set(member.userId, currentRank);
    priorRankedMember = member;
  });
  const isGlobalAdmin = authorization.user.role === 'admin';

  return NextResponse.json(
    ClubhouseDetailSchema.parse({
      clubhouse: {
        id: clubhouse.id,
        name: clubhouse.name,
        description: clubhouse.description,
        memberCount: clubhouse._count.memberships,
        role: roleLabel(membership.role),
        active: selection?.clubhouseId === clubhouse.id,
        joinCode: manages ? clubhouse.joinCode : null,
        inviteToken: manages ? clubhouse.inviteToken : null,
      },
      members: memberships.map((item) => {
        const memberStats = stats.get(item.userId);
        return {
          userId: item.userId,
          displayName:
            profileNames.get(item.userId) ?? names.get(item.userId) ?? 'Fairway Friends player',
          role: roleLabel(item.role),
          profileHref: `/players/user/${encodeURIComponent(item.userId)}`,
          rank: rankByUserId.get(item.userId) ?? null,
          rounds: memberStats?.rounds ?? 0,
          holesPlayed: memberStats?.holesPlayed ?? 0,
          strokesThrown: memberStats?.strokesThrown ?? 0,
          wins: memberStats && memberStats.placements > 0 ? memberStats.wins : null,
          winPercentage:
            memberStats && memberStats.placements > 0
              ? Number(((memberStats.wins / memberStats.placements) * 100).toFixed(1))
              : null,
          averageScore:
            memberStats && memberStats.rounds > 0
              ? Number((memberStats.scoreTotal / memberStats.rounds).toFixed(2))
              : null,
        };
      }),
      pendingRequests: requests.map((item) => ({
        id: item.id,
        userId: item.userId,
        displayName:
          requestProfileNames.get(item.userId) ??
          requestNames.get(item.userId) ??
          'Fairway Friends player',
        requestedAt: item.requestedAt.toISOString(),
      })),
      scorecards: cards.map((card) =>
        importedScorecardItem(
          card,
          isGlobalAdmin ||
            (card.importedByUserId === authorization.user.id && card.finalizedAt === null),
        ),
      ),
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
