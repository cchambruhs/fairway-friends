// @polsia:user-owned — signed-in users can add cards; saved imports are shared across users.
import 'server-only';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import {
  importedScorecardFingerprint,
  importedScorecardItem,
} from '@/lib/business/imported-scorecard';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import { addScorecardClubhouseLinks } from '@/lib/business/scorecard-clubhouses.server';
import {
  fetchUDiscScorecard,
  UDiscScorecardFetchError,
} from '@/lib/business/udisc-scorecard-fetch';
import {
  type ImportedScorecardDraft,
  ImportedScorecardImportRequestSchema,
  ImportedScorecardImportResponseSchema,
  ImportedScorecardListSchema,
  SCORECARD_ALREADY_SAVED_MESSAGE,
} from '@/lib/contracts/imported-scorecard';
import { udiscScorecardId } from '@/lib/contracts/scorecard-import';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function GET(request: Request): Promise<Response> {
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { user } = authorization;
  const memberships = await prisma.leagueMembership.findMany({
    where: { userId: user.id },
    select: { leagueId: true },
  });

  const rows = await prisma.importedScorecard.findMany({
    where: {
      deletedAt: null,
      OR: [
        { leagueId: null },
        { leagueId: { in: memberships.map((membership) => membership.leagueId) } },
      ],
    },
    orderBy: [{ playedOn: 'desc' }, { createdAt: 'desc' }],
    include: {
      players: { orderBy: { sourceOrder: 'asc' } },
      clubhouseLinks: { include: { clubhouse: true } },
      league: true,
      editRequests: { where: { status: 'APPROVED' }, select: { id: true } },
    },
  });
  const isAdmin = user.role === 'admin';
  return NextResponse.json(
    ImportedScorecardListSchema.parse({
      items: rows.map((row) =>
        importedScorecardItem(row, isAdmin || row.importedByUserId === user.id, isAdmin),
      ),
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { user } = authorization;

  const input = ImportedScorecardImportRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    const errors: Record<string, string> = {};
    for (const issue of input.error.issues) {
      const field = issue.path.map(String).join('.') || 'sourceUrl';
      errors[field] ??= issue.message;
    }
    return NextResponse.json({ errors }, { status: 400 });
  }

  const sourceUrl = input.data.sourceUrl;
  const clubhouseIds = input.data.clubhouseIds;
  const scorecardId = udiscScorecardId(sourceUrl);
  if (!scorecardId)
    return NextResponse.json({ error: 'Invalid UDisc scorecard URL.' }, { status: 400 });

  async function checkMemberships(transaction: Prisma.TransactionClient): Promise<boolean> {
    if (!clubhouseIds.length) return true;
    const memberships = await transaction.clubhouseMembership.findMany({
      where: { userId: user.id, clubhouseId: { in: clubhouseIds } },
      select: { clubhouseId: true },
    });
    return memberships.length === new Set(clubhouseIds).size;
  }

  async function saveDuplicate(id: string): Promise<Response> {
    const result = await prisma.$transaction(async (transaction) => {
      if (!(await checkMemberships(transaction))) return 'membership' as const;
      const existing = await transaction.importedScorecard.findUnique({
        where: { id },
        select: { id: true, leagueId: true, deletedAt: true },
      });
      if (!existing || existing.deletedAt) return 'missing' as const;

      const addedClubhouseIds: string[] = [];
      for (const clubhouseId of new Set(clubhouseIds)) {
        const added = await transaction.importedScorecardClubhouse.createMany({
          data: [{ scorecardId: id, clubhouseId }],
          skipDuplicates: true,
        });
        if (added.count > 0) addedClubhouseIds.push(clubhouseId);
      }
      if (addedClubhouseIds.length > 0) {
        await transaction.scorecardAssignmentAudit.createMany({
          data: addedClubhouseIds.map((clubhouseId) => ({
            scorecardId: id,
            actorUserId: user.id,
            oldClubhouseId: null,
            newClubhouseId: clubhouseId,
            oldLeagueId: existing.leagueId,
            newLeagueId: existing.leagueId,
          })),
        });
      }
      return 'saved' as const;
    });
    if (result === 'membership')
      return NextResponse.json({ error: 'Clubhouse membership required.' }, { status: 403 });
    if (result === 'missing')
      return NextResponse.json({ error: 'Scorecard not found.' }, { status: 404 });
    const saved = await prisma.importedScorecard.findUnique({
      where: { id },
      include: {
        players: { orderBy: { sourceOrder: 'asc' } },
        clubhouseLinks: { include: { clubhouse: true } },
        league: true,
        editRequests: { where: { status: 'APPROVED' }, select: { id: true } },
      },
    });
    if (!saved) return NextResponse.json({ error: 'Scorecard readback failed.' }, { status: 500 });
    return NextResponse.json(
      ImportedScorecardImportResponseSchema.parse({
        item: importedScorecardItem(
          saved,
          user.role === 'admin' ||
            (saved.importedByUserId === user.id && saved.finalizedAt === null),
          user.role === 'admin',
        ),
        duplicate: true,
        message: SCORECARD_ALREADY_SAVED_MESSAGE,
      }),
    );
  }

  const existingSource = await prisma.importedScorecard.findFirst({
    where: { OR: [{ scorecardId }, { sourceUrl }] },
    select: { id: true },
  });
  if (existingSource) return saveDuplicate(existingSource.id);

  let card: ImportedScorecardDraft;
  try {
    card = await fetchUDiscScorecard(sourceUrl);
  } catch (error) {
    if (error instanceof UDiscScorecardFetchError) {
      return NextResponse.json(
        { error: 'scorecard_unavailable', message: error.message },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: 'scorecard_unavailable', message: 'The UDisc scorecard could not be imported.' },
      { status: 502 },
    );
  }

  const fingerprint = importedScorecardFingerprint(card);
  let createdId: string | null;
  try {
    createdId = await prisma.$transaction(async (transaction) => {
      if (!(await checkMemberships(transaction))) throw new Error('clubhouse_membership_required');
      const existing = await transaction.importedScorecard.findFirst({
        where: { OR: [{ scorecardId }, { sourceUrl }, { fingerprint }] },
        select: { id: true },
      });
      if (existing) {
        await addScorecardClubhouseLinks(transaction, existing.id, clubhouseIds);
        return `duplicate:${existing.id}`;
      }

      const playerIds = new Map<string, string>();
      const identityIds = new Map<string, string>();
      const normalizedUsernames = new Map<string, string>();
      for (const player of card.players) {
        if (!player.username) continue;
        const normalizedUsername = normalizeUDiscUsername(player.username);
        const identity = await transaction.uDiscIdentity.upsert({
          where: { normalizedUsername },
          create: { normalizedUsername },
          update: {},
          select: { id: true, udiscPlayerId: true, ownerUserId: true },
        });
        const existingPlayers = await transaction.uDiscPlayer.findMany({
          where: { OR: [{ normalizedUsername }, { normalizedUsername: null }] },
          select: { id: true, username: true, normalizedUsername: true },
        });
        const playerRecord = existingPlayers.find(
          (candidate) => normalizeUDiscUsername(candidate.username) === normalizedUsername,
        );
        let record: { id: string };
        if (playerRecord) {
          record = await transaction.uDiscPlayer.update({
            where: { id: playerRecord.id },
            data: { normalizedUsername },
            select: { id: true },
          });
        } else {
          await transaction.uDiscPlayer.createMany({
            data: [{ username: player.username, normalizedUsername }],
            skipDuplicates: true,
          });
          const exactPlayer = await transaction.uDiscPlayer.findUnique({
            where: { username: player.username },
            select: { id: true },
          });
          if (!exactPlayer) throw new Error('udisc_player_save_failed');
          record = exactPlayer;
        }
        if (!identity.udiscPlayerId) {
          await transaction.uDiscIdentity.updateMany({
            where: { id: identity.id, udiscPlayerId: null },
            data: { udiscPlayerId: record.id },
          });
        }
        playerIds.set(player.username, record.id);
        // Pending claims remain unlinked until an app admin approves them.
        if (identity.ownerUserId) identityIds.set(player.username, identity.id);
        normalizedUsernames.set(player.username, normalizedUsername);
      }

      const created = await transaction.importedScorecard.create({
        data: {
          scorecardId,
          sourceUrl,
          fingerprint,
          courseName: card.courseName,
          courseUrl: card.courseUrl,
          layoutName: card.layoutName,
          playedOn: card.playedOn ? new Date(`${card.playedOn}T00:00:00.000Z`) : null,
          location: card.location,
          holeCount: card.holeCount,
          totalPar: card.totalPar,
          pars: card.pars ?? Prisma.DbNull,
          importedByUserId: user.id,
          clubhouseId: clubhouseIds.length === 1 ? clubhouseIds[0] : null,
          players: {
            create: card.players.map((player, sourceOrder) => ({
              sourceOrder,
              displayName: player.displayName,
              username: player.username,
              normalizedUsername: player.username
                ? (normalizedUsernames.get(player.username) ?? null)
                : null,
              ...(player.username && playerIds.has(player.username)
                ? { udiscPlayerId: playerIds.get(player.username) }
                : {}),
              ...(player.username && identityIds.has(player.username)
                ? { identityId: identityIds.get(player.username) }
                : {}),
              holeScores: player.holeScores,
              totalScore: player.totalScore,
              toPar: player.toPar,
              holesPlayed:
                player.holesPlayed ?? player.holeScores.filter((score) => score !== null).length,
              didNotFinish:
                player.didNotFinish ?? player.holeScores.some((score) => score === null),
              position: player.position,
            })),
          },
        },
        select: { id: true },
      });
      await addScorecardClubhouseLinks(transaction, created.id, clubhouseIds);
      return created.id;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'clubhouse_membership_required') {
      return NextResponse.json({ error: 'Clubhouse membership required.' }, { status: 403 });
    }
    if (isUniqueConflict(error)) {
      const duplicate = await prisma.importedScorecard.findFirst({
        where: { OR: [{ scorecardId }, { sourceUrl }, { fingerprint }] },
        select: { id: true },
      });
      if (duplicate) return saveDuplicate(duplicate.id);
    }
    throw error;
  }
  if (createdId?.startsWith('duplicate:'))
    return saveDuplicate(createdId.slice('duplicate:'.length));
  if (!createdId) return NextResponse.json({ error: 'Scorecard save failed.' }, { status: 500 });

  const saved = await prisma.importedScorecard.findUnique({
    where: { id: createdId },
    include: {
      players: { orderBy: { sourceOrder: 'asc' } },
      clubhouseLinks: { include: { clubhouse: true } },
      league: true,
      editRequests: { where: { status: 'APPROVED' }, select: { id: true } },
    },
  });
  if (!saved) {
    return NextResponse.json(
      {
        error: 'scorecard_readback_failed',
        message: 'The scorecard was saved but could not be read back.',
      },
      { status: 500 },
    );
  }
  return NextResponse.json(
    ImportedScorecardImportResponseSchema.parse({
      item: importedScorecardItem(saved, true, user.role === 'admin'),
    }),
    { status: 201 },
  );
}
