// @polsia:user-owned — live, public aggregates from validated shared scorecards.
import 'server-only';
import { NextResponse } from 'next/server';
import { aggregateGlobalStats, type GlobalStatsCardRecord } from '@/lib/business/global-stats';
import { maskHiddenPublicNames } from '@/lib/business/public-name-privacy';
import { loadHiddenOwnerIds } from '@/lib/business/public-name-privacy.server';
import { GlobalStatMetricSchema, GlobalStatsResponseSchema } from '@/lib/contracts/global-stats';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).searchParams.get('metric');
  const parsedMetric = GlobalStatMetricSchema.safeParse(search ?? 'aces');
  if (!parsedMetric.success) {
    return NextResponse.json({ error: 'Choose a valid statistics metric.' }, { status: 400 });
  }

  const rows = await prisma.importedScorecard.findMany({
    where: { deletedAt: null },
    orderBy: [{ playedOn: 'desc' }, { createdAt: 'desc' }],
    include: {
      players: { orderBy: { sourceOrder: 'asc' } },
      clubhouseLinks: { include: { clubhouse: { select: { name: true } } } },
      league: { select: { name: true } },
      editRequests: { where: { status: 'APPROVED' }, select: { id: true } },
      courseLayout: {
        include: {
          holes: {
            orderBy: { number: 'asc' },
            select: {
              number: true,
              lengthFeet: true,
              lengthVerifiedAt: true,
              lengthVerifiedByUserId: true,
            },
          },
        },
      },
    },
  });
  const identityIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.players.flatMap((player) => (player.identityId ? [player.identityId] : [])),
      ),
    ),
  ];
  const identities = identityIds.length
    ? await prisma.uDiscIdentity.findMany({
        where: { id: { in: identityIds } },
        select: { id: true, ownerUserId: true },
      })
    : [];
  const owners = new Map(identities.map((identity) => [identity.id, identity.ownerUserId]));
  const hiddenOwnerIds = await loadHiddenOwnerIds(prisma, owners.values());
  const sourceCards: GlobalStatsCardRecord[] = rows.map((row) => ({
    id: row.id,
    scorecardId: row.scorecardId,
    sourceUrl: row.sourceUrl,
    fingerprint: row.fingerprint,
    courseName: row.courseName,
    courseUrl: row.courseUrl,
    layoutName: row.layoutName,
    playedOn: row.playedOn,
    location: row.location,
    holeCount: row.holeCount,
    totalPar: row.totalPar,
    pars: row.pars,
    clubhouseName: row.clubhouseLinks.map((link) => link.clubhouse.name).join(', ') || null,
    leagueName: row.league?.name ?? null,
    hasVerifiedChanges: row.editRequests.length > 0,
    courseHoles: row.courseLayout?.holes ?? [],
    players: maskHiddenPublicNames(
      row.players.map((player) => ({
        id: player.id,
        identityId: player.identityId,
        identityOwnerUserId: player.identityId ? (owners.get(player.identityId) ?? null) : null,
        normalizedUsername: player.normalizedUsername,
        displayName: player.displayName,
        username: player.username,
        holeScores: player.holeScores,
        holesPlayed: player.holesPlayed,
        didNotFinish: player.didNotFinish,
        totalScore: player.totalScore,
        toPar: player.toPar,
        position: player.position,
      })),
      hiddenOwnerIds,
    ),
  }));

  return NextResponse.json(
    GlobalStatsResponseSchema.parse(aggregateGlobalStats(sourceCards, parsedMetric.data)),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
