// @polsia:user-owned — public UDisc scorecard import and history contract.
import { z } from 'zod';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import { UDiscScorecardLinkSchema } from '@/lib/contracts/scorecard-import';

export const SCORECARD_ALREADY_SAVED_MESSAGE = 'This round is already in the database';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const parsSchema = z.array(z.number().int().min(1).max(99).nullable()).min(1).max(36);

export const ImportedScorecardPlayerDraftSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160).nullable(),
    username: z.string().min(1).max(160).nullable(),
    holeScores: z.array(z.number().int().min(1).max(99).nullable()).min(1).max(36),
    totalScore: z.number().int().min(0).max(3564),
    toPar: z.number().int().min(-3564).max(3564).nullable(),
    position: z.string().min(1).max(16).nullable(),
    holesPlayed: z.number().int().min(0).max(36).optional(),
    didNotFinish: z.boolean().optional(),
  })
  .strict();

export const ImportedScorecardPlayerSchema = ImportedScorecardPlayerDraftSchema.extend({
  id: z.string().min(1),
  holesPlayed: z.number().int().min(0).max(36),
  didNotFinish: z.boolean(),
}).strict();

export const ImportedScorecardDraftSchema = z
  .object({
    scorecardId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
    sourceUrl: UDiscScorecardLinkSchema,
    courseName: z.string().trim().min(1).max(160).nullable(),
    courseUrl: z.string().url().max(2048).nullable(),
    layoutName: z.string().trim().min(1).max(120).nullable(),
    playedOn: dateSchema.nullable(),
    location: z.string().trim().min(1).max(160).nullable(),
    holeCount: z.number().int().min(1).max(36).nullable(),
    pars: parsSchema.nullable(),
    totalPar: z.number().int().min(1).max(3564).nullable(),
    players: z.array(ImportedScorecardPlayerDraftSchema).min(1).max(16),
  })
  .strict()
  .superRefine((card, context) => {
    if (card.holeCount !== null && card.pars !== null && card.holeCount !== card.pars.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The hole count does not match the source pars.',
        path: ['pars'],
      });
    }
    const holeCount = card.holeCount ?? card.pars?.length;
    card.players.forEach((player, index) => {
      const expectedHoleCount = holeCount ?? player.holeScores.length;
      if (player.holeScores.length !== expectedHoleCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `The scorecard needs exactly ${expectedHoleCount} cells for each player.`,
          path: ['players', index, 'holeScores'],
        });
      }
      const playedScores = player.holeScores.filter((score): score is number => score !== null);
      const holesPlayed = playedScores.length;
      const didNotFinish = holesPlayed < expectedHoleCount;
      if (player.holesPlayed !== undefined && player.holesPlayed !== holesPlayed) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'The holes played count does not match the recorded hole scores.',
          path: ['players', index, 'holesPlayed'],
        });
      }
      if (player.didNotFinish !== undefined && player.didNotFinish !== didNotFinish) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Did not finish must match the holes with missing scores.',
          path: ['players', index, 'didNotFinish'],
        });
      }
      if (playedScores.reduce((sum, score) => sum + score, 0) !== player.totalScore) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A player total does not match the source hole scores.',
          path: ['players', index, 'totalScore'],
        });
      }
      const playedPars = player.holeScores.flatMap((score, holeIndex) => {
        const par = card.pars?.[holeIndex];
        return score !== null && typeof par === 'number' ? [par] : [];
      });
      const calculatedToPar =
        playedPars.length === holesPlayed
          ? player.totalScore - playedPars.reduce((sum, par) => sum + par, 0)
          : null;
      const expectedToPar = didNotFinish
        ? calculatedToPar
        : card.totalPar !== null
          ? player.totalScore - card.totalPar
          : calculatedToPar;
      if (player.toPar !== null && expectedToPar !== null && expectedToPar !== player.toPar) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A player to-par value does not match the played scores and pars.',
          path: ['players', index, 'toPar'],
        });
      }
    });
    if (
      card.pars?.every((par) => par !== null) &&
      card.totalPar !== null &&
      card.totalPar !== card.pars.reduce((sum, par) => sum + (par ?? 0), 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The source total par does not match the per-hole pars.',
        path: ['totalPar'],
      });
    }
    const usernames = card.players.flatMap((player) =>
      player.username ? [normalizeUDiscUsername(player.username)] : [],
    );
    if (usernames.some((username) => username.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A UDisc username cannot be empty after normalization.',
        path: ['players'],
      });
    }
    if (new Set(usernames).size !== usernames.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The source repeats a UDisc username on this card.',
        path: ['players'],
      });
    }
  });

export const ImportedScorecardItemSchema = z
  .object({
    id: z.string().min(1),
    scorecardId: z.string().min(1),
    sourceUrl: UDiscScorecardLinkSchema,
    courseName: z.string().nullable(),
    courseUrl: z.string().url().nullable(),
    layoutName: z.string().nullable(),
    playedOn: dateSchema.nullable(),
    location: z.string().nullable(),
    holeCount: z.number().int().min(1).max(36).nullable(),
    pars: parsSchema.nullable(),
    totalPar: z.number().int().min(1).max(3564).nullable(),
    players: z.array(ImportedScorecardPlayerSchema),
    createdAt: z.string().datetime(),
    clubhouseId: z.string().nullable(),
    clubhouseName: z.string().nullable(),
    clubhouseIds: z.array(z.string()).optional(),
    clubhouseNames: z.array(z.string()).optional(),
    leagueId: z.string().nullable().optional(),
    leagueName: z.string().nullable().optional(),
    courseLayoutId: z.string().nullable().optional(),
    hasVerifiedChanges: z.boolean().optional(),
    canDelete: z.boolean().optional(),
    finalizedAt: z.string().datetime().nullable(),
    canReassign: z.boolean(),
  })
  .strict();

export const ImportedScorecardListSchema = z.object({
  items: z.array(ImportedScorecardItemSchema),
});

export const ImportedScorecardImportRequestSchema = z
  .object({
    sourceUrl: UDiscScorecardLinkSchema,
    clubhouseIds: z.array(z.string().min(1).max(128)).max(24).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.clubhouseIds).size !== input.clubhouseIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose each Clubhouse only once.',
        path: ['clubhouseIds'],
      });
    }
  });

export const ImportedScorecardImportResponseSchema = z
  .object({
    item: ImportedScorecardItemSchema,
    duplicate: z.boolean().optional(),
    message: z.string().optional(),
  })
  .strict();

export const ImportedScorecardDuplicateResponseSchema = z
  .object({
    duplicate: z.literal(true),
    message: z.literal(SCORECARD_ALREADY_SAVED_MESSAGE),
    item: ImportedScorecardItemSchema,
  })
  .strict();

export type ImportedScorecardDraft = z.infer<typeof ImportedScorecardDraftSchema>;
export type ImportedScorecardItem = z.infer<typeof ImportedScorecardItemSchema>;
export type ImportedScorecardPlayer = z.infer<typeof ImportedScorecardPlayerSchema>;
