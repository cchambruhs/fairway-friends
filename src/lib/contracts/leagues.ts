// @polsia:user-owned — shared request and response shapes for League management.
import { z } from 'zod';

export const LeagueRoleSchema = z.enum(['LEADER', 'SCOREKEEPER', 'PLAYER']);
export const LeagueVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);
export const LeagueScoringFormatSchema = z.enum(['FIXED', 'FIELD_SIZE']);

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.');
const FixedPointsSchema = z
  .array(z.number().finite().min(0).max(1000))
  .min(1, 'Enter at least one placement value.')
  .max(100);
const LeagueCourseSelectionSchema = z
  .object({ courseId: z.string().trim().min(1), layoutId: z.string().trim().min(1) })
  .strict();

export const LeagueSettingsSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a League name.').max(100),
    visibility: LeagueVisibilitySchema,
    schedule: z.string().trim().min(1, 'Enter the League schedule.').max(240),
    seasonStart: DateOnlySchema,
    seasonEnd: DateOnlySchema,
    participantCapacity: z.number().int().min(2).max(10_000),
    scoringFormat: LeagueScoringFormatSchema,
    fixedPoints: FixedPointsSchema,
    plainRules: z.string().trim().max(10_000),
    courses: z.array(LeagueCourseSelectionSchema).max(50),
  })
  .strict();

export const LeagueCreateSchema = LeagueSettingsSchema;
export const LeagueLogoUpdateSchema = z
  .object({
    file: z
      .object({ key: z.string().min(1).max(1000), url: z.string().url().max(2048) })
      .strict()
      .nullable(),
  })
  .strict();

const LeagueCourseSchema = z
  .object({
    courseId: z.string(),
    courseName: z.string(),
    layoutId: z.string(),
    layoutName: z.string(),
    location: z.string(),
    holes: z.number().int().positive(),
  })
  .strict();

const LeagueSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    visibility: LeagueVisibilitySchema,
    schedule: z.string().nullable(),
    seasonStart: DateOnlySchema.nullable(),
    seasonEnd: DateOnlySchema.nullable(),
    participantCapacity: z.number().int().positive(),
    memberCount: z.number().int().nonnegative(),
    availablePlaces: z.number().int().nonnegative(),
    scoringFormat: LeagueScoringFormatSchema,
    logoUrl: z.string().url().nullable(),
    activated: z.boolean(),
    role: LeagueRoleSchema.nullable(),
    isMember: z.boolean(),
    canJoin: z.boolean(),
    isFull: z.boolean(),
  })
  .strict();

export const LeagueIndexSchema = z.object({ items: z.array(LeagueSummarySchema) }).strict();

const LeagueMemberSchema = z
  .object({
    userId: z.string(),
    displayName: z.string(),
    role: LeagueRoleSchema,
    joinedAt: z.string().datetime(),
  })
  .strict();

const LeagueInvitationSchema = z
  .object({
    id: z.string(),
    token: z.string(),
    role: z.enum(['SCOREKEEPER', 'PLAYER']),
    createdAt: z.string().datetime(),
  })
  .strict();

const LeagueStandingSchema = z
  .object({
    rank: z.number().int().positive(),
    playerKey: z.string(),
    userId: z.string().nullable(),
    displayName: z.string(),
    role: LeagueRoleSchema,
    points: z.number().finite(),
    wins: z.number().int().nonnegative(),
    seconds: z.number().int().nonnegative(),
    averagePlace: z.number().finite().nullable(),
    rounds: z.number().int().nonnegative(),
    totalStrokes: z.number().int().nonnegative(),
    averageToPar: z.number().finite().nullable(),
  })
  .strict();

export const LeagueDetailResponseSchema = z
  .object({
    league: z
      .object({
        ...LeagueSummarySchema.shape,
        fixedPoints: FixedPointsSchema,
        plainRules: z.string().nullable(),
        logoKey: z.string().nullable(),
        courses: z.array(LeagueCourseSchema),
        members: z.array(LeagueMemberSchema),
        invitations: z.array(LeagueInvitationSchema),
        standings: z.array(LeagueStandingSchema),
        tieBreakers: z.array(z.string()),
        activationOffers: z.array(
          z
            .object({
              id: z.enum(['one', 'five', 'fifty']),
              amountUsd: z.number().int().positive(),
              capacityLimit: z.number().int().positive().nullable(),
              upgradeAmountUsd: z.number().int().positive().nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export const LeagueInvitationPreviewSchema = z
  .object({ leagueName: z.string(), role: z.enum(['SCOREKEEPER', 'PLAYER']) })
  .strict();
export const LeagueInvitationCreateSchema = z
  .object({ action: z.enum(['issue', 'rotate']), role: z.enum(['SCOREKEEPER', 'PLAYER']) })
  .strict();
export const LeagueInvitationResponseSchema = z
  .object({ id: z.string(), token: z.string(), role: z.enum(['SCOREKEEPER', 'PLAYER']) })
  .strict();
export const LeagueInvitationAcceptSchema = z
  .object({ joined: z.boolean(), leagueId: z.string(), leagueName: z.string() })
  .strict();
export const LeagueMemberRoleUpdateSchema = z
  .object({ userId: z.string().min(1), role: z.enum(['SCOREKEEPER', 'PLAYER']) })
  .strict();
export const LeagueActivationRequestSchema = z
  .object({ offerId: z.enum(['one', 'five', 'fifty']) })
  .strict();
export const LeagueActivationCheckoutSchema = z.object({ url: z.string().url() }).strict();
export const LeagueActivationConfirmSchema = z.object({ sessionId: z.string().min(1) }).strict();
export const LeagueActivationResultSchema = z
  .object({ activated: z.boolean(), alreadyActivated: z.boolean() })
  .strict();
export const LeagueMutationResponseSchema = z.object({ ok: z.literal(true) }).strict();
export const LeagueLogoResponseSchema = z.object({ logoUrl: z.string().url().nullable() }).strict();
export const LeagueJoinResponseSchema = z
  .object({ joined: z.boolean(), leagueId: z.string(), leagueName: z.string() })
  .strict();

export type LeagueSettings = z.infer<typeof LeagueSettingsSchema>;
export type LeagueSummary = z.infer<typeof LeagueSummarySchema>;
export type LeagueDetail = z.infer<typeof LeagueDetailResponseSchema>['league'];
export type LeagueRole = z.infer<typeof LeagueRoleSchema>;
export type LeagueScoringFormat = z.infer<typeof LeagueScoringFormatSchema>;
export type LeagueInvitationPreview = z.infer<typeof LeagueInvitationPreviewSchema>;
export const LeagueCreateResponseSchema = z.object({ id: z.string(), name: z.string() }).strict();
