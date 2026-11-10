// @polsia:user-owned — signed-in users can add cards; saved imports are shared across users.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import {
  importedScorecardFingerprint,
  importedScorecardItem,
} from '@/lib/business/imported-scorecard';
import {
  isUniqueConflict,
  persistImportedScorecard,
} from '@/lib/business/persist-imported-scorecard.server';
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

  let createdId: string;
  try {
    const outcome = await prisma.$transaction(async (transaction) => {
      if (!(await checkMemberships(transaction))) throw new Error('clubhouse_membership_required');
      // Keep the id and URL the player submitted, exactly as before the refactor.
      return persistImportedScorecard(transaction, {
        card: { ...card, scorecardId, sourceUrl },
        importedByUserId: user.id,
        clubhouseIds,
      });
    });
    if (outcome.status === 'duplicate') return saveDuplicate(outcome.id);
    createdId = outcome.id;
  } catch (error) {
    if (error instanceof Error && error.message === 'clubhouse_membership_required') {
      return NextResponse.json({ error: 'Clubhouse membership required.' }, { status: 403 });
    }
    if (isUniqueConflict(error)) {
      const duplicate = await prisma.importedScorecard.findFirst({
        where: {
          OR: [
            { scorecardId },
            { sourceUrl },
            { fingerprint: importedScorecardFingerprint({ ...card, scorecardId, sourceUrl }) },
          ],
        },
        select: { id: true },
      });
      if (duplicate) return saveDuplicate(duplicate.id);
    }
    throw error;
  }

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
