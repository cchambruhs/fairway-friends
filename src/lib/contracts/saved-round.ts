// @polsia:user-owned — live round creation, score entry, authorization, and history contract.
import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const parArraySchema = z.array(z.number().int().min(1).max(99)).min(1).max(36);
const playerIdsSchema = z.array(z.string().trim().min(1).max(128)).min(1).max(16);

const sharedCreateShape = {
  playedOn: dateSchema,
  leagueId: z.string().trim().min(1).max(128).nullable(),
  participantUserIds: playerIdsSchema,
};

export const SavedRoundCreateSchema = z.discriminatedUnion('layoutType', [
  z
    .object({
      ...sharedCreateShape,
      layoutType: z.literal('course'),
      courseLayoutId: z.string().trim().min(1).max(128),
    })
    .strict(),
  z
    .object({
      ...sharedCreateShape,
      layoutType: z.literal('custom'),
      courseName: z.string().trim().max(120).nullable(),
      layoutName: z.string().trim().max(120).nullable(),
      holePars: parArraySchema,
    })
    .strict(),
]);

export const SavedRoundStatusSchema = z.enum(['IN_PROGRESS', 'FINALIZED']);
export const SavedRoundVerificationSchema = z.enum([
  'NOT_FINALIZED',
  'CASUAL_UNVERIFIED',
  'LEAGUE_VERIFIED',
]);

export const SavedRoundItemSchema = z
  .object({
    id: z.string(),
    courseName: z.string().nullable(),
    layoutName: z.string().nullable(),
    courseLayoutId: z.string().nullable(),
    leagueId: z.string().nullable(),
    leagueName: z.string().nullable(),
    playedOn: dateSchema,
    holePars: parArraySchema,
    totalPar: z.number().int().positive(),
    status: SavedRoundStatusSchema,
    verificationStatus: SavedRoundVerificationSchema,
    finalizedAt: z.string().datetime().nullable(),
    verifiedAt: z.string().datetime().nullable(),
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    participants: z
      .array(
        z
          .object({
            userId: z.string(),
            displayName: z.string(),
            holeScores: z.array(z.number().int().min(1).max(99).nullable()).min(1).max(36),
            totalStrokes: z.number().int().nonnegative(),
            holesPlayed: z.number().int().nonnegative(),
            toPar: z.number().int().nullable(),
            position: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(16),
    viewer: z
      .object({
        role: z.enum(['LEADER', 'SCOREKEEPER', 'PLAYER']).nullable(),
        isParticipant: z.boolean(),
        canEdit: z.boolean(),
        canFinalize: z.boolean(),
        canCorrect: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const SavedRoundListSchema = z.object({ items: z.array(SavedRoundItemSchema) }).strict();
export const SavedRoundResponseSchema = z.object({ item: SavedRoundItemSchema }).strict();

export const SavedRoundUpdateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    participants: z
      .array(
        z
          .object({
            userId: z.string().trim().min(1).max(128),
            holeScores: z.array(z.number().int().min(1).max(99).nullable()).min(1).max(36),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict();

export const SavedRoundFinalizeSchema = z
  .object({ revision: z.number().int().nonnegative() })
  .strict();

export const SavedRoundOptionsSchema = z
  .object({
    currentUserId: z.string(),
    players: z.array(z.object({ userId: z.string(), displayName: z.string() }).strict()),
    leagues: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          role: z.enum(['LEADER', 'SCOREKEEPER', 'PLAYER']),
        })
        .strict(),
    ),
    courseLayouts: z.array(
      z
        .object({
          id: z.string(),
          courseName: z.string(),
          layoutName: z.string(),
          location: z.string(),
          holes: z.array(
            z
              .object({ number: z.number().int().positive(), par: z.number().int().min(1).max(99) })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

export type SavedRoundCreate = z.infer<typeof SavedRoundCreateSchema>;
export type SavedRoundItem = z.infer<typeof SavedRoundItemSchema>;
export type SavedRoundUpdate = z.infer<typeof SavedRoundUpdateSchema>;
export type SavedRoundOptions = z.infer<typeof SavedRoundOptionsSchema>;
