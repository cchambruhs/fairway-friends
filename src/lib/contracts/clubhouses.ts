// @polsia:user-owned — client/server contracts for multi-Clubhouse membership and rounds.

import { z } from 'zod';
import { ImportedScorecardItemSchema } from '@/lib/contracts/imported-scorecard';

export const ClubhouseRoleSchema = z.enum(['Owner', 'Admin', 'Member']);

const ClubhouseSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    memberCount: z.number().int().nonnegative(),
  })
  .strict();

export const ClubhouseIndexSchema = z
  .object({
    activeClubhouseId: z.string().nullable(),
    memberships: z.array(
      ClubhouseSummarySchema.extend({
        role: ClubhouseRoleSchema,
        joinCode: z.string().nullable(),
        inviteToken: z.string().nullable(),
      }).strict(),
    ),
    publicClubhouses: z.array(ClubhouseSummarySchema),
    assignmentDestinations: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    leagueAssignmentDestinations: z.array(
      z
        .object({ id: z.string(), name: z.string(), role: z.enum(['LEADER', 'SCOREKEEPER']) })
        .strict(),
    ),
    pendingRequests: z.array(
      z
        .object({
          id: z.string(),
          clubhouseId: z.string(),
          clubhouseName: z.string(),
          userId: z.string(),
          displayName: z.string(),
          requestedAt: z.string().datetime(),
        })
        .strict(),
    ),
  })
  .strict();

export const ClubhouseJoinRequestSchema = z
  .object({
    kind: z.enum(['invite', 'code', 'request']),
    value: z.string().optional(),
    clubhouseId: z.string().optional(),
    leagueId: z.string().optional(),
  })
  .strict();

export const CreateClubhouseSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const ClubhouseSelectionSchema = z.object({ clubhouseId: z.string().nullable() }).strict();

export const ClubhouseManageSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve-request'), requestId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('deny-request'), requestId: z.string().min(1) }).strict(),
  z
    .object({
      action: z.literal('set-role'),
      userId: z.string().min(1),
      role: ClubhouseRoleSchema,
    })
    .strict(),
  z.object({ action: z.literal('remove-member'), userId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('rotate-invite') }).strict(),
]);

export const ClubhouseDetailSchema = z
  .object({
    clubhouse: ClubhouseSummarySchema.extend({
      role: ClubhouseRoleSchema,
      active: z.boolean(),
      joinCode: z.string().nullable(),
      inviteToken: z.string().nullable(),
    }).strict(),
    members: z.array(
      z
        .object({
          userId: z.string(),
          displayName: z.string(),
          role: ClubhouseRoleSchema,
          profileHref: z.string(),
          rank: z.number().int().positive().nullable(),
          rounds: z.number().int().nonnegative(),
          holesPlayed: z.number().int().nonnegative(),
          strokesThrown: z.number().int().nonnegative(),
          wins: z.number().int().nonnegative().nullable(),
          winPercentage: z.number().finite().min(0).max(100).nullable(),
          averageScore: z.number().finite().nullable(),
        })
        .strict(),
    ),
    pendingRequests: z.array(
      z
        .object({
          id: z.string(),
          userId: z.string(),
          displayName: z.string(),
          requestedAt: z.string().datetime(),
        })
        .strict(),
    ),
    scorecards: z.array(ImportedScorecardItemSchema),
  })
  .strict();

export const ClubhouseActionResponseSchema = z
  .object({
    ok: z.boolean(),
    message: z.string().optional(),
    clubhouseId: z.string().optional(),
  })
  .strict();

export const ScorecardReassignmentSchema = z
  .object({ clubhouseId: z.string().nullable() })
  .strict();

export const ScorecardAssignmentHistorySchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string(),
          oldClubhouseName: z.string(),
          newClubhouseName: z.string(),
          oldLeagueName: z.string().optional(),
          newLeagueName: z.string().optional(),
          actorName: z.string(),
          changedAt: z.string().datetime(),
        })
        .strict(),
    ),
  })
  .strict();

export const AdminLegacyScorecardsSchema = z
  .object({
    items: z.array(ImportedScorecardItemSchema),
    destinations: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
  })
  .strict();

export type ClubhouseIndex = z.infer<typeof ClubhouseIndexSchema>;
export type ClubhouseDetail = z.infer<typeof ClubhouseDetailSchema>;
export type AdminLegacyScorecards = z.infer<typeof AdminLegacyScorecardsSchema>;
export type ScorecardAssignmentHistory = z.infer<typeof ScorecardAssignmentHistorySchema>;
