// @polsia:user-owned — signed-in historical-round destination for the CSV module.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { matchCurrentProfilePlayer } from '@/lib/business/round-history-player-match';
import {
  type HistoricalRoundCsvDraft,
  HistoricalRoundCsvDraftSchema,
  type HistoricalRoundInput,
  HistoricalRoundInputSchema,
  historicalRoundDuplicateKey,
  historicalRoundSourceId,
} from '@/lib/contracts/round-history';
import { prisma } from '@/lib/db';
import {
  CsvAccessError,
  CsvImportError,
  type CsvServerTarget,
  type CsvTarget,
  defineCsvTarget,
} from '@/modules/csv-import/server';

const csvFields = [
  {
    key: 'round_json',
    label: 'Validated scorecard preview data',
    required: true,
    aliases: ['scorecard json'],
  },
];

function playerJson(players: NonNullable<HistoricalRoundInput['players']>) {
  return players.map((player, index) => {
    const value: Prisma.InputJsonObject = {
      id: player.id ?? `player-${index + 1}`,
      name: player.name,
      matchedToCurrentProfile: player.matchedToCurrentProfile,
      ...(player.sourcePlayerId ? { sourcePlayerId: player.sourcePlayerId } : {}),
      ...(player.pdgaNumber ? { pdgaNumber: player.pdgaNumber } : {}),
      ...(player.holeScores ? { holeScores: player.holeScores } : {}),
      ...(player.holeScoreEntries ? { holeScoreEntries: player.holeScoreEntries } : {}),
      ...(player.totalScore !== undefined ? { totalScore: player.totalScore } : {}),
    };
    return value;
  });
}

function rowData(round: HistoricalRoundInput, userId: string, duplicateKey: string, id?: string) {
  const sourceId = historicalRoundSourceId(round);
  const playerHoleCount = round.players?.reduce(
    (max, player) => Math.max(max, player.holeScores?.length ?? 0),
    0,
  );
  return {
    ...(id ? { id } : {}),
    userId,
    playedOn: round.playedOn ? new Date(`${round.playedOn}T00:00:00.000Z`) : null,
    courseName: round.courseName ?? null,
    layoutName: round.layoutName ?? null,
    score: round.score ?? null,
    totalPar: round.totalPar ?? null,
    holeCount: round.holeCount ?? round.holePars?.length ?? (playerHoleCount || null),
    holePars: round.holePars ?? Prisma.JsonNull,
    holeParEntries: round.holeParEntries ?? Prisma.JsonNull,
    roundMetadata: round.roundMetadata ?? Prisma.JsonNull,
    players: round.players ? playerJson(round.players) : Prisma.JsonNull,
    sourceUrl: round.sourceUrl ?? null,
    sourceId,
    sourceFileKey: round.sourceFileKey ?? null,
    sourceFileUrl: round.sourceFileUrl ?? null,
    duplicateKey,
    entryMethod: 'csv',
    isHistorical: true,
    isVerified: false,
  };
}

export const historicalRoundsDestination = {
  id: 'historical-rounds',
  label: 'historical scorecards',
  fields: csvFields,
  parseRow(raw) {
    try {
      const decoded: unknown = JSON.parse(raw.round_json ?? '');
      const parsed = HistoricalRoundCsvDraftSchema.safeParse(decoded);
      if (!parsed.success) {
        return {
          ok: false,
          issues: parsed.error.issues.map((issue) => ({
            field: typeof issue.path[0] === 'string' ? issue.path[0] : 'round_json',
            message: issue.message,
          })),
        };
      }
      return { ok: true, value: parsed.data };
    } catch {
      return {
        ok: false,
        issues: [{ field: 'round_json', message: 'Scorecard preview data must be valid JSON.' }],
      };
    }
  },
  keyOf: historicalRoundDuplicateKey,
  async findExistingKeys(keys, context) {
    if (keys.length === 0) return [];
    const existing = await prisma.historicalRound.findMany({
      where: { userId: context.scopeId, duplicateKey: { in: [...keys] } },
      select: { duplicateKey: true },
    });
    return existing.map((row) => row.duplicateKey);
  },
  async insertNewRows(rows, context) {
    const profile = await prisma.playerProfile.findUnique({
      where: { userId: context.scopeId },
      select: { displayName: true, pdgaNumber: true },
    });
    const prepared = rows.map((draft) => {
      const finalInput = HistoricalRoundInputSchema.safeParse({
        ...draft,
        entryMethod: 'csv',
      });
      if (!finalInput.success) {
        throw new CsvImportError(
          422,
          'ROUND_NOT_READY',
          finalInput.error.issues[0]?.message ?? 'The scorecard is missing its uploaded CSV file.',
        );
      }
      if (!profile && finalInput.data.players?.some((player) => player.matchedToCurrentProfile)) {
        throw new CsvImportError(
          422,
          'PLAYER_PROFILE_REQUIRED',
          'Create your player profile before linking a card player.',
        );
      }
      const duplicateKey = historicalRoundDuplicateKey(finalInput.data);
      const matched = matchCurrentProfilePlayer(
        finalInput.data.players ?? [],
        profile?.displayName ?? null,
        profile?.pdgaNumber ?? null,
      );
      const round = HistoricalRoundInputSchema.parse({
        ...finalInput.data,
        score: matched.score,
        players: matched.players,
      });
      return { round, duplicateKey, id: randomUUID(), sourceId: historicalRoundSourceId(round) };
    });

    const created = await prisma.$transaction(async (transaction) => {
      const duplicateKeys = prepared.map((item) => item.duplicateKey);
      const preexistingRounds = duplicateKeys.length
        ? await transaction.historicalRound.findMany({
            where: { userId: context.scopeId, duplicateKey: { in: duplicateKeys } },
            select: { id: true, duplicateKey: true },
          })
        : [];
      const roundIdByDuplicateKey = new Map(
        preexistingRounds.map((round) => [round.duplicateKey, round.id]),
      );
      const sourced = prepared.filter((item) => item.sourceId);
      for (let start = 0; start < sourced.length; start += 500) {
        const batch = sourced.slice(start, start + 500);
        await transaction.historicalRoundSource.createMany({
          data: batch.flatMap((item) =>
            item.sourceId
              ? [
                  {
                    userId: context.scopeId,
                    sourceId: item.sourceId,
                    roundId: roundIdByDuplicateKey.get(item.duplicateKey) ?? item.id,
                  },
                ]
              : [],
          ),
          skipDuplicates: true,
        });
      }

      const sourceIds = sourced.flatMap((item) => (item.sourceId ? [item.sourceId] : []));
      const reservations = sourceIds.length
        ? await transaction.historicalRoundSource.findMany({
            where: { userId: context.scopeId, sourceId: { in: sourceIds } },
            select: { sourceId: true, roundId: true },
          })
        : [];
      const roundIdBySourceId = new Map(reservations.map((item) => [item.sourceId, item.roundId]));
      const newSourced = sourced.filter(
        (item) =>
          !roundIdByDuplicateKey.has(item.duplicateKey) &&
          roundIdBySourceId.get(item.sourceId ?? '') === item.id,
      );
      let inserted = 0;
      for (let start = 0; start < newSourced.length; start += 500) {
        const batch = newSourced.slice(start, start + 500);
        const result = await transaction.historicalRound.createMany({
          data: batch.map((item) =>
            rowData(item.round, context.scopeId, item.duplicateKey, item.id),
          ),
          skipDuplicates: true,
        });
        inserted += result.count;
      }

      const unsourced = prepared.filter(
        (item) => !item.sourceId && !roundIdByDuplicateKey.has(item.duplicateKey),
      );
      for (let start = 0; start < unsourced.length; start += 500) {
        const batch = unsourced.slice(start, start + 500);
        const result = await transaction.historicalRound.createMany({
          data: batch.map((item) =>
            rowData(item.round, context.scopeId, item.duplicateKey, item.id),
          ),
          skipDuplicates: true,
        });
        inserted += result.count;
      }

      const keys = duplicateKeys;
      const readback = keys.length
        ? await transaction.historicalRound.findMany({
            where: { userId: context.scopeId, duplicateKey: { in: keys } },
          })
        : [];
      const everyRoundReadBack = prepared.every((item) => {
        const saved = readback.find((row) => row.duplicateKey === item.duplicateKey);
        if (!saved || saved.sourceId !== item.sourceId) return false;
        if (item.round.sourceUrl && saved.sourceUrl !== item.round.sourceUrl) return false;
        if (saved.id !== item.id) return true;
        const playerHoleCount = item.round.players?.reduce(
          (max, player) => Math.max(max, player.holeScores?.length ?? 0),
          0,
        );
        const expectedHoleCount =
          item.round.holeCount ?? item.round.holePars?.length ?? (playerHoleCount || null);
        return (
          saved.sourceFileKey === item.round.sourceFileKey &&
          saved.sourceFileUrl === item.round.sourceFileUrl &&
          saved.playedOn?.toISOString().slice(0, 10) === (item.round.playedOn ?? undefined) &&
          saved.courseName === (item.round.courseName ?? null) &&
          saved.layoutName === (item.round.layoutName ?? null) &&
          saved.score === (item.round.score ?? null) &&
          saved.totalPar === (item.round.totalPar ?? null) &&
          saved.holeCount === expectedHoleCount &&
          isDeepStrictEqual(saved.holePars, item.round.holePars ?? null) &&
          isDeepStrictEqual(saved.holeParEntries, item.round.holeParEntries ?? null) &&
          isDeepStrictEqual(saved.roundMetadata, item.round.roundMetadata ?? null) &&
          isDeepStrictEqual(
            saved.players,
            item.round.players ? playerJson(item.round.players) : null,
          )
        );
      });
      if (!everyRoundReadBack) {
        throw new Error('A confirmed scorecard failed its transactional database readback check.');
      }
      return inserted;
    });

    return { created, skipped: rows.length - created };
  },
} satisfies CsvTarget<HistoricalRoundCsvDraft>;

const historicalRoundsTarget = defineCsvTarget(historicalRoundsDestination);

export const csvImportTargets: CsvServerTarget[] = [historicalRoundsTarget];

export async function authorizeCsvImport(req: Request, _targetId: string) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) throw new CsvAccessError(401);
  return { actorId: session.user.id, scopeId: session.user.id };
}
