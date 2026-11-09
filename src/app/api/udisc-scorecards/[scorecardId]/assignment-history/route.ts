// @polsia:user-owned — transparent audit history for shared scorecard assignments.
import 'server-only';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scorecardId: string }> },
): Promise<Response> {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const { scorecardId } = await params;
  const card = await prisma.importedScorecard.findUnique({
    where: { id: scorecardId },
    select: { id: true, leagueId: true },
  });
  if (!card) return NextResponse.json({ error: 'Scorecard not found.' }, { status: 404 });
  if (card.leagueId && user.role !== 'admin') {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId: card.leagueId, userId: user.id } },
      select: { id: true },
    });
    if (!membership)
      return NextResponse.json({ error: 'You are not a current League member.' }, { status: 403 });
  }
  const rows = await prisma.scorecardAssignmentAudit.findMany({
    where: { scorecardId },
    orderBy: { createdAt: 'desc' },
  });
  const userIds = [...new Set(rows.map((row) => row.actorUserId))];
  const clubhouseIds = [
    ...new Set(
      rows.flatMap((row) =>
        [row.oldClubhouseId, row.newClubhouseId].filter((id): id is string => id !== null),
      ),
    ),
  ];
  const leagueIds = [
    ...new Set(
      rows.flatMap((row) =>
        [row.oldLeagueId, row.newLeagueId].filter((id): id is string => id !== null),
      ),
    ),
  ];
  const leagueMemberships = leagueIds.length
    ? await prisma.leagueMembership.findMany({
        where: { userId: user.id, leagueId: { in: leagueIds } },
        select: { leagueId: true },
      })
    : [];
  const [users, profiles, clubhouses, leagues] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    prisma.playerProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, displayName: true },
    }),
    prisma.clubhouse.findMany({
      where: { id: { in: clubhouseIds } },
      select: { id: true, name: true },
    }),
    prisma.league.findMany({
      where: { id: { in: leagueMemberships.map((membership) => membership.leagueId) } },
      select: { id: true, name: true },
    }),
  ]);
  const userNames = new Map(users.map((user) => [user.id, user.name]));
  const profileNames = new Map(profiles.map((profile) => [profile.userId, profile.displayName]));
  const clubNames = new Map(clubhouses.map((clubhouse) => [clubhouse.id, clubhouse.name]));
  const leagueNames = new Map(leagues.map((league) => [league.id, league.name]));
  return NextResponse.json(
    {
      items: rows.map((row) => ({
        id: row.id,
        oldClubhouseName: row.oldClubhouseId
          ? (clubNames.get(row.oldClubhouseId) ?? 'Clubhouse removed')
          : 'Unassigned',
        newClubhouseName: row.newClubhouseId
          ? (clubNames.get(row.newClubhouseId) ?? 'Clubhouse removed')
          : 'Unassigned',
        oldLeagueName: row.oldLeagueId
          ? (leagueNames.get(row.oldLeagueId) ?? 'League unavailable')
          : 'Unassigned',
        newLeagueName: row.newLeagueId
          ? (leagueNames.get(row.newLeagueId) ?? 'League unavailable')
          : 'Unassigned',
        actorName:
          profileNames.get(row.actorUserId) ??
          userNames.get(row.actorUserId) ??
          'Fairway Friends admin',
        changedAt: row.createdAt.toISOString(),
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
