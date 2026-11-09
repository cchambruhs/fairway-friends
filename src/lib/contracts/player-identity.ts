// @polsia:user-owned — shared identity selection, claim review and public stats contracts.

import { z } from 'zod';
import { ImportedScorecardItemSchema } from '@/lib/contracts/imported-scorecard';

export const PlayerIdentityChoiceSchema = z
  .object({
    username: z.string().trim().min(1).max(160),
    mode: z.enum(['claim', 'create']),
  })
  .strict();

export const PlayerRegistrationChoiceRequestSchema = PlayerIdentityChoiceSchema.extend({
  email: z.string().trim().email().max(254),
}).strict();

export const PlayerIdentitySearchSchema = z
  .object({
    username: z.string(),
    normalizedUsername: z.string(),
    hasExistingRecord: z.boolean(),
    isAvailable: z.boolean(),
    claimStatus: z.enum(['none', 'pending', 'claimed']),
    displayNames: z.array(z.string()),
  })
  .strict();

export const PlayerIdentityStateSchema = z
  .object({
    identity: z
      .object({
        id: z.string(),
        username: z.string(),
        status: z.enum(['verified', 'pending']),
        claimStatus: z.enum(['none', 'pending', 'approved', 'denied']),
      })
      .nullable(),
    profileComplete: z.boolean(),
  })
  .strict();

export const PlayerIdentityEnrollResponseSchema = z
  .object({
    identity: z.object({
      id: z.string(),
      username: z.string(),
      status: z.enum(['verified', 'pending']),
      claimStatus: z.enum(['none', 'pending', 'approved']),
    }),
  })
  .strict();

export const PlayerRegistrationChoiceResponseSchema = z.object({ ok: z.literal(true) }).strict();

export const PlayerClaimListSchema = z
  .object({
    claims: z.array(
      z.object({
        id: z.string(),
        username: z.string(),
        displayNames: z.array(z.string()),
        claimantName: z.string(),
        claimantEmail: z.string(),
        requestedAt: z.string().datetime(),
      }),
    ),
  })
  .strict();

export const ReviewPlayerClaimSchema = z
  .object({
    claimId: z.string().min(1),
    decision: z.enum(['approve', 'deny']),
    reviewNote: z.string().trim().max(500).optional(),
  })
  .strict();

export const PlayerStatisticsSchema = z
  .object({
    lifetimeRounds: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative().nullable(),
    winPercentage: z.number().finite().min(0).max(100).nullable(),
    averageScore: z.number().finite().nullable(),
    averageToPar: z.number().finite().nullable(),
    bestScore: z.number().int().positive().nullable(),
    bestPlacement: z.number().int().positive().nullable(),
    roundsWithPlacement: z.number().int().nonnegative(),
    birdies: z.number().int().nonnegative().nullable(),
    eagles: z.number().int().nonnegative().nullable(),
    knownParHoles: z.number().int().nonnegative(),
    unknownParHoles: z.number().int().nonnegative(),
    aces: z.number().int().nonnegative().nullable(),
    longestUnderParHoleStreak: z.number().int().nonnegative().nullable(),
    longestCompetitionWinStreak: z.number().int().nonnegative().nullable(),
    savedCourseRecords: z.number().int().nonnegative(),
    undatedRounds: z.number().int().nonnegative(),
  })
  .strict();

const PerformancePointSchema = z
  .object({
    playedOn: z.string().nullable(),
    courseName: z.string().nullable(),
    score: z.number().int().positive(),
  })
  .strict();

const CourseRecordSchema = z
  .object({
    courseName: z.string(),
    layoutName: z.string().nullable(),
    score: z.number().int().positive(),
    playedOn: z.string().nullable(),
    scorecardId: z.string(),
    sourceUrl: z.string().url(),
    comparisonRounds: z.number().int().positive(),
    tiedPlayerCount: z.number().int().positive(),
  })
  .strict();

const PlayerAchievementSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    criteria: z.string().min(1),
  })
  .strict();

const RivalSharedCardSchema = z
  .object({
    scorecardId: z.string().min(1),
    courseName: z.string().nullable(),
    playedOn: z.string().nullable(),
    sourceUrl: z.string().url(),
    playerScore: z.number().int().positive(),
    rivalScore: z.number().int().positive(),
  })
  .strict();

const PlayerRivalSchema = z
  .object({
    username: z.string().min(1),
    displayName: z.string().min(1),
    profileHref: z.string().min(1),
    sharedRounds: z.number().int().positive(),
    wins: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
    ties: z.number().int().nonnegative(),
    sharedCards: z.array(RivalSharedCardSchema),
  })
  .strict();

export const PublicPlayerProfileSchema = z
  .object({
    displayName: z.string(),
    username: z.string().nullable(),
    identityStatus: z.enum(['verified', 'pending', 'unclaimed']),
    statistics: PlayerStatisticsSchema,
    clubhouseRankings: z.array(
      z
        .object({
          clubhouseId: z.string(),
          clubhouseName: z.string(),
          rank: z.number().int().positive(),
          rounds: z.number().int().positive(),
          wins: z.number().int().nonnegative().nullable(),
          averageScore: z.number().finite(),
        })
        .strict(),
    ),
    bestRounds: z.array(ImportedScorecardItemSchema),
    courseRecords: z.array(CourseRecordSchema),
    achievements: z.array(PlayerAchievementSchema),
    rivals: z.array(PlayerRivalSchema),
    performance: z.array(PerformancePointSchema),
    rounds: z.array(ImportedScorecardItemSchema),
  })
  .strict();

export const PublicPlayerProfileResponseSchema = z
  .object({ profile: PublicPlayerProfileSchema.nullable() })
  .strict();

export const PublicPlayerDirectorySchema = z
  .object({
    items: z.array(
      z
        .object({
          userId: z.string(),
          displayName: z.string(),
          username: z.string().nullable(),
          rounds: z.number().int().nonnegative(),
          profileHref: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const UnlinkedScorecardEntrySchema = z
  .object({
    displayName: z.string(),
    courseName: z.string().nullable(),
    playedOn: z.string().nullable(),
    totalScore: z.number().int().positive(),
    sourceUrl: z.string().url(),
  })
  .strict();

export type PlayerIdentityChoice = z.infer<typeof PlayerIdentityChoiceSchema>;
export type PlayerIdentitySearch = z.infer<typeof PlayerIdentitySearchSchema>;
export type PlayerIdentityState = z.infer<typeof PlayerIdentityStateSchema>;
export type PublicPlayerProfile = z.infer<typeof PublicPlayerProfileSchema>;
