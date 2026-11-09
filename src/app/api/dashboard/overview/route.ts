// @polsia:user-owned — own-player dashboard summary and membership list.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { DashboardOverviewSchema } from '@/lib/contracts/dashboard-overview';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { user } = authorization;
  const [identities, memberships, profile] = await Promise.all([
    prisma.uDiscIdentity.findMany({
      where: { ownerUserId: user.id },
      select: { id: true },
    }),
    prisma.clubhouseMembership.findMany({
      where: { userId: user.id },
      orderBy: { joinedAt: 'asc' },
      include: { clubhouse: { select: { id: true, name: true } } },
    }),
    prisma.playerProfile.findUnique({ where: { userId: user.id }, select: { displayName: true } }),
  ]);
  const identityIds = identities.map((identity) => identity.id);
  const cards = identityIds.length
    ? await prisma.importedScorecard.findMany({
        where: {
          deletedAt: null,
          players: { some: { identityId: { in: identityIds } } },
        },
        orderBy: [{ playedOn: 'desc' }, { createdAt: 'desc' }],
        include: { players: { orderBy: { sourceOrder: 'asc' } } },
      })
    : [];
  const rounds = cards.flatMap((card) => {
    const player = card.players.find(
      (entry) => entry.identityId && identityIds.includes(entry.identityId),
    );
    return player ? [{ card, player }] : [];
  });
  const fullRounds = rounds.filter(({ player }) => !player.didNotFinish);
  const fullScores = fullRounds.map(({ player }) => player.totalScore);
  const items = DashboardOverviewSchema.parse({
    roundsPlayed: rounds.length,
    bestRound: fullScores.length ? Math.min(...fullScores) : null,
    averageScore: fullScores.length
      ? Number((fullScores.reduce((sum, score) => sum + score, 0) / fullScores.length).toFixed(1))
      : null,
    recentRounds: rounds.slice(0, 5).map(({ card, player }) => ({
      id: card.id,
      scorecardId: card.scorecardId,
      playedOn: card.playedOn?.toISOString().slice(0, 10) ?? null,
      courseName: card.courseName,
      playerName: profile?.displayName ?? user.name ?? 'You',
      totalScore: player.totalScore,
      toPar: player.toPar,
      holesPlayed: player.holesPlayed,
      holeCount: card.holeCount,
      didNotFinish: player.didNotFinish,
      sourceUrl: card.sourceUrl,
    })),
    clubhouses: memberships.map(({ clubhouse }) => clubhouse),
  });
  return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } });
}
