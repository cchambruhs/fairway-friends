// @polsia:user-owned — typed, private historical scorecard input and response.
import { z } from 'zod';
import { UDiscScorecardLinkSchema, udiscScorecardId } from '@/lib/contracts/scorecard-import';

export const ROUND_HISTORY_UPDATED_EVENT = 'fairway-round-history-updated';

const MAX_HOLES = 36;
const MAX_TOTAL_SCORE = MAX_HOLES * 99;
const holeScoreSchema = z.number().int().min(1, 'Scores must be positive whole numbers.').max(99);
const totalScoreSchema = z
  .number()
  .int()
  .min(1, 'Scores must be positive whole numbers.')
  .max(MAX_TOTAL_SCORE);
const holesSchema = z.array(holeScoreSchema).min(1).max(MAX_HOLES);
const holeScoreEntrySchema = z
  .object({
    holeNumber: z.number().int().min(1).max(MAX_HOLES),
    score: holeScoreSchema,
  })
  .strict();
const holeParEntrySchema = z
  .object({
    holeNumber: z.number().int().min(1).max(MAX_HOLES),
    par: z.number().int().min(1).max(99),
  })
  .strict();
const holeScoreEntriesSchema = z.array(holeScoreEntrySchema).min(1).max(MAX_HOLES);
const holeParEntriesSchema = z.array(holeParEntrySchema).min(1).max(MAX_HOLES);
const playedOnSchema = z
  .string()
  .refine(isCalendarDate, 'Enter a valid date that is not in the future.');
const uploadUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'), 'Uploaded files must use HTTPS.');
const sourceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'The source scorecard ID is invalid.');
const roundMetadataSchema = z
  .record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.string().max(500))
  .refine((metadata) => Object.keys(metadata).length <= 20);

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const today = new Date().toISOString().slice(0, 10);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value <= today
  );
}

export const HistoricalRoundPlayerInputSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    name: z.string().trim().min(1, 'Enter a player name.').max(80),
    sourcePlayerId: z.string().trim().min(1).max(128).optional(),
    pdgaNumber: z.string().trim().min(1).max(32).optional(),
    holeScores: holesSchema.optional(),
    holeScoreEntries: holeScoreEntriesSchema.optional(),
    totalScore: totalScoreSchema.optional(),
    matchedToCurrentProfile: z.boolean().optional().default(false),
  })
  .strict();

const roundDetailsShape = {
  playedOn: playedOnSchema.optional(),
  courseName: z.string().trim().min(1).max(120).optional(),
  layoutName: z.string().trim().min(1).max(120).optional(),
  score: totalScoreSchema.optional(),
  totalPar: z.number().int().min(1).max(MAX_TOTAL_SCORE).optional(),
  holeCount: z.number().int().min(1).max(MAX_HOLES).optional(),
  sourceId: sourceIdSchema.optional(),
  roundMetadata: roundMetadataSchema.optional(),
  holePars: holesSchema.optional(),
  holeParEntries: holeParEntriesSchema.optional(),
  players: z.array(HistoricalRoundPlayerInputSchema).min(1).max(16).optional(),
  sourceUrl: UDiscScorecardLinkSchema.optional(),
};

type RoundValidationInput = {
  playedOn?: string;
  courseName?: string;
  layoutName?: string;
  sourceUrl?: string;
  sourceId?: string;
  roundMetadata?: Record<string, string>;
  score?: number;
  totalPar?: number;
  holeCount?: number;
  holePars?: number[];
  holeParEntries?: Array<z.infer<typeof holeParEntrySchema>>;
  players?: Array<z.infer<typeof HistoricalRoundPlayerInputSchema>>;
  entryMethod?: 'manual' | 'csv' | 'json';
  sourceFileKey?: string;
  sourceFileUrl?: string;
};

function validateRoundDetails(round: RoundValidationInput, context: z.RefinementCtx): void {
  const hasScorecardDetails = Boolean(
    round.playedOn ||
      round.courseName ||
      round.layoutName ||
      round.score !== undefined ||
      round.totalPar !== undefined ||
      round.holeCount !== undefined ||
      round.holePars ||
      round.holeParEntries?.length ||
      round.players?.length,
  );
  if (!hasScorecardDetails) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enter at least one scorecard detail before saving.',
      path: ['courseName'],
    });
  }

  if (round.sourceUrl && round.sourceId && udiscScorecardId(round.sourceUrl) !== round.sourceId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'The source ID does not match the original UDisc scorecard URL.',
      path: ['sourceId'],
    });
  }

  const matchedPlayers = round.players?.filter((player) => player.matchedToCurrentProfile) ?? [];
  if (matchedPlayers.length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only one card player can be matched to your profile.',
      path: ['players'],
    });
  }

  const matchedPlayer = matchedPlayers[0];
  if (round.score !== undefined && matchedPlayer) {
    const matchedPlayerTotal =
      matchedPlayer.totalScore ??
      matchedPlayer.holeScores?.reduce((total, value) => total + value, 0);
    if (matchedPlayerTotal !== undefined && matchedPlayerTotal !== round.score) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Your score must match the player total linked to your profile.',
        path: ['score'],
      });
    }
  }

  if (
    round.holeCount !== undefined &&
    round.holePars &&
    round.holeCount !== round.holePars.length
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'The hole count must match the number of pars entered.',
      path: ['holePars'],
    });
  }

  const expectedHoleCount = round.holeCount ?? round.holePars?.length;
  const validateEntryNumbers = (
    entries: Array<{ holeNumber: number }> | undefined,
    label: string,
    path: Array<string | number>,
  ) => {
    if (!entries) return;
    const seen = new Set<number>();
    entries.forEach((entry, index) => {
      if (seen.has(entry.holeNumber)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} contain a duplicate hole number.`,
          path: [...path, index, 'holeNumber'],
        });
      }
      seen.add(entry.holeNumber);
      if (expectedHoleCount !== undefined && entry.holeNumber > expectedHoleCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} contain a hole number greater than the declared hole count.`,
          path: [...path, index, 'holeNumber'],
        });
      }
    });
  };
  validateEntryNumbers(round.holeParEntries, 'Hole pars', ['holeParEntries']);
  round.players?.forEach((player, index) => {
    if (
      expectedHoleCount !== undefined &&
      player.holeScores &&
      player.holeScores.length !== expectedHoleCount
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Enter exactly ${expectedHoleCount} hole scores for this player.`,
        path: ['players', index, 'holeScores'],
      });
    }
    if (player.holeScores && player.totalScore !== undefined) {
      const calculated = player.holeScores.reduce((total, value) => total + value, 0);
      if (calculated !== player.totalScore) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'This total does not match the entered hole scores.',
          path: ['players', index, 'totalScore'],
        });
      }
    }
    validateEntryNumbers(player.holeScoreEntries, `Hole scores for ${player.name}`, [
      'players',
      index,
      'holeScoreEntries',
    ]);
    if (
      expectedHoleCount !== undefined &&
      player.holeScoreEntries?.length === expectedHoleCount &&
      player.totalScore !== undefined
    ) {
      const scoresByHole = new Map(
        player.holeScoreEntries.map((entry) => [entry.holeNumber, entry.score]),
      );
      const completeScores = Array.from({ length: expectedHoleCount }, (_, hole) =>
        scoresByHole.get(hole + 1),
      );
      if (completeScores.every((value): value is number => value !== undefined)) {
        const calculated = completeScores.reduce((total, value) => total + value, 0);
        if (calculated !== player.totalScore) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'This total does not match the entered hole scores.',
            path: ['players', index, 'totalScore'],
          });
        }
      }
    }
  });

  if (round.totalPar !== undefined && round.holePars) {
    const calculatedPar = round.holePars.reduce((total, value) => total + value, 0);
    if (calculatedPar !== round.totalPar) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Total par does not match the entered hole pars.',
        path: ['totalPar'],
      });
    }
  }
  if (round.totalPar !== undefined && round.holeParEntries) {
    const parCount = round.holeCount ?? round.holeParEntries.length;
    const parsByHole = new Map(round.holeParEntries.map((entry) => [entry.holeNumber, entry.par]));
    const completePars = Array.from({ length: parCount }, (_, hole) => parsByHole.get(hole + 1));
    if (completePars.every((value): value is number => value !== undefined)) {
      const calculatedPar = completePars.reduce((total, value) => total + value, 0);
      if (calculatedPar !== round.totalPar) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Total par does not match the entered hole pars.',
          path: ['totalPar'],
        });
      }
    }
  }

  if (round.entryMethod === 'csv') {
    if (!round.sourceFileKey || !round.sourceFileUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The authorized export file could not be attached to this import.',
        path: ['sourceFileKey'],
      });
    }
    if (
      round.players?.length &&
      round.players.some((player) => {
        const total =
          player.totalScore ?? player.holeScores?.reduce((sum, value) => sum + value, 0);
        return total === undefined && !player.holeScoreEntries?.length;
      })
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Every imported player needs a saved total or hole-by-hole score.',
        path: ['players'],
      });
    }
  } else if (round.sourceFileKey || round.sourceFileUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'An uploaded export file can only be attached to a CSV import.',
      path: ['sourceFileKey'],
    });
  }
}

const historicalRoundFieldsSchema = z
  .object({
    ...roundDetailsShape,
    entryMethod: z.enum(['manual', 'csv', 'json']).optional().default('manual'),
    sourceFileKey: z.string().trim().min(1).max(1024).optional(),
    sourceFileUrl: uploadUrlSchema.optional(),
  })
  .strict();

export const HistoricalRoundInputSchema =
  historicalRoundFieldsSchema.superRefine(validateRoundDetails);

export const HistoricalRoundCsvDraftSchema = z
  .object({
    ...roundDetailsShape,
    entryMethod: z.literal('csv').optional(),
    sourceFileKey: z.string().trim().min(1).max(1024).optional(),
    sourceFileUrl: uploadUrlSchema.optional(),
  })
  .strict()
  .superRefine((round, context) => {
    validateRoundDetails(round, context);
    if (
      round.entryMethod !== 'csv' &&
      round.players?.some((player) => {
        const total =
          player.totalScore ?? player.holeScores?.reduce((sum, value) => sum + value, 0);
        return total === undefined && !player.holeScoreEntries?.length;
      })
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Every imported player needs a saved total or hole-by-hole score.',
        path: ['players'],
      });
    }
  });

export const UDiscScorecardDraftSchema = HistoricalRoundCsvDraftSchema;

export type HistoricalRoundCsvDraft = z.infer<typeof HistoricalRoundCsvDraftSchema>;
export type UDiscScorecardDraft = HistoricalRoundCsvDraft;

export const HistoricalRoundPlayerItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourcePlayerId: z.string().nullable(),
  pdgaNumber: z.string().nullable(),
  holeScores: holesSchema.nullable(),
  holeScoreEntries: holeScoreEntriesSchema.nullable(),
  totalScore: totalScoreSchema.nullable(),
  matchedToCurrentProfile: z.boolean(),
});

export const HistoricalRoundItemSchema = z.object({
  id: z.string(),
  playedOn: z.string().nullable(),
  courseName: z.string().nullable(),
  layoutName: z.string().nullable(),
  score: z.number().int().nullable(),
  totalPar: z.number().int().nullable(),
  holeCount: z.number().int().nullable(),
  holePars: holesSchema.nullable(),
  holeParEntries: holeParEntriesSchema.nullable(),
  players: z.array(HistoricalRoundPlayerItemSchema),
  sourceUrl: UDiscScorecardLinkSchema.nullable(),
  sourceId: z.string().nullable(),
  sourceFileKey: z.string().nullable(),
  sourceFileUrl: uploadUrlSchema.nullable(),
  roundMetadata: roundMetadataSchema.nullable(),
  entryMethod: z.enum(['manual', 'csv', 'json']),
  historyStatus: z.literal('historical'),
  verificationStatus: z.literal('unverified'),
  createdAt: z.string().datetime(),
});

export const HistoricalRoundListSchema = z.object({
  items: z.array(HistoricalRoundItemSchema),
  currentProfile: z.object({ userId: z.string(), displayName: z.string(), exists: z.boolean() }),
});

export const HistoricalRoundSaveResponseSchema = z.object({
  item: HistoricalRoundItemSchema,
  reused: z.boolean(),
});

export type HistoricalRoundInput = z.infer<typeof HistoricalRoundInputSchema>;
export type HistoricalRoundPlayerInput = z.infer<typeof HistoricalRoundPlayerInputSchema>;
export type HistoricalRoundPlayerItem = z.infer<typeof HistoricalRoundPlayerItemSchema>;
export type HistoricalRoundItem = z.infer<typeof HistoricalRoundItemSchema>;

export function historicalRoundSourceId(
  round: Pick<HistoricalRoundInput, 'sourceUrl' | 'sourceId'>,
): string | null {
  return round.sourceId ?? (round.sourceUrl ? udiscScorecardId(round.sourceUrl) : null);
}

export function historicalRoundDuplicateKey(
  round: HistoricalRoundInput | HistoricalRoundCsvDraft,
): string {
  const normalize = (value: string) =>
    value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
  const sourceId = historicalRoundSourceId(round);
  if (sourceId) return JSON.stringify(['udisc-cardcast', sourceId]);

  return JSON.stringify([
    round.playedOn ?? '',
    normalize(round.courseName ?? ''),
    normalize(round.layoutName ?? ''),
    round.score ?? null,
    round.totalPar ?? null,
    round.holeCount ?? null,
    round.holePars ?? [],
    round.holeParEntries ?? [],
    round.players?.map((player) => [
      normalize(player.name),
      player.sourcePlayerId ?? null,
      player.pdgaNumber ?? null,
      player.holeScores ?? [],
      player.holeScoreEntries ?? [],
      player.totalScore ?? null,
      player.matchedToCurrentProfile ?? false,
    ]) ?? [],
  ]);
}

export function historicalRoundItem(row: {
  id: string;
  playedOn: Date | null;
  courseName: string | null;
  layoutName: string | null;
  score: number | null;
  totalPar: number | null;
  holeCount: number | null;
  holePars: unknown;
  holeParEntries?: unknown;
  players: unknown;
  sourceUrl: string | null;
  sourceId: string | null;
  sourceFileKey?: string | null;
  sourceFileUrl?: string | null;
  roundMetadata?: unknown;
  entryMethod: string;
  isHistorical: boolean;
  isVerified: boolean;
  createdAt: Date;
}): HistoricalRoundItem {
  if (!row.isHistorical || row.isVerified) {
    throw new Error('Historical round status is inconsistent.');
  }

  const storedPlayers = z
    .array(
      HistoricalRoundPlayerItemSchema.extend({
        id: z.string().optional(),
        sourcePlayerId: z.string().nullable().optional(),
        pdgaNumber: z.string().nullable().optional(),
        holeScores: holesSchema.nullable().optional(),
        holeScoreEntries: holeScoreEntriesSchema.nullable().optional(),
        totalScore: totalScoreSchema.nullable().optional(),
      }),
    )
    .safeParse(row.players);
  const players = storedPlayers.success
    ? storedPlayers.data.map((player, index) => ({
        ...player,
        id: player.id ?? `player-${index + 1}`,
        sourcePlayerId: player.sourcePlayerId ?? null,
        pdgaNumber: player.pdgaNumber ?? null,
        holeScores: player.holeScores ?? null,
        holeScoreEntries: player.holeScoreEntries ?? null,
        totalScore: player.totalScore ?? null,
      }))
    : [];
  const storedHoleParEntries = holeParEntriesSchema.nullable().safeParse(row.holeParEntries);

  return HistoricalRoundItemSchema.parse({
    id: row.id,
    playedOn: row.playedOn?.toISOString().slice(0, 10) ?? null,
    courseName: row.courseName,
    layoutName: row.layoutName,
    score: row.score,
    totalPar: row.totalPar,
    holeCount: row.holeCount,
    holePars: row.holePars,
    holeParEntries: storedHoleParEntries.success ? storedHoleParEntries.data : null,
    roundMetadata: row.roundMetadata == null ? null : roundMetadataSchema.parse(row.roundMetadata),
    players,
    sourceUrl: row.sourceUrl,
    sourceId: row.sourceId,
    sourceFileKey: row.sourceFileKey ?? null,
    sourceFileUrl: row.sourceFileUrl ?? null,
    entryMethod: row.entryMethod,
    historyStatus: 'historical',
    verificationStatus: 'unverified',
    createdAt: row.createdAt.toISOString(),
  });
}
