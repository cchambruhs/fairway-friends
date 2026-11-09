// @polsia:user-owned — edit proposals, approvals, destination options and league summaries.
import { z } from 'zod';
import {
  ImportedScorecardItemSchema,
  ImportedScorecardPlayerDraftSchema,
} from '@/lib/contracts/imported-scorecard';

export const ScorecardEditDraftSchema = z
  .object({
    courseName: z.string().trim().min(1).max(160).nullable(),
    courseUrl: z.string().url().max(2048).nullable(),
    layoutName: z.string().trim().min(1).max(120).nullable(),
    playedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    location: z.string().trim().min(1).max(160).nullable(),
    holeCount: z.number().int().min(1).max(36).nullable(),
    pars: z.array(z.number().int().min(1).max(99).nullable()).min(1).max(36).nullable(),
    totalPar: z.number().int().min(1).max(3564).nullable(),
    courseLayoutId: z.string().nullable(),
    players: z.array(ImportedScorecardPlayerDraftSchema).min(1).max(16),
  })
  .strict();

export const ScorecardEditSnapshotSchema = ScorecardEditDraftSchema;

const ScorecardEditHistoryItemSchema = z.object({
  id: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  baseRevision: z.number().int().nonnegative(),
  proposedByName: z.string(),
  proposedAt: z.string().datetime(),
  appliedAt: z.string().datetime().nullable(),
  submitterApprovedByName: z.string().nullable(),
  submitterApprovedAt: z.string().datetime().nullable(),
  leagueApprovedByName: z.string().nullable(),
  leagueApprovedAt: z.string().datetime().nullable(),
  rejectedByName: z.string().nullable(),
  rejectedAt: z.string().datetime().nullable(),
  rejectionReason: z.string().nullable(),
  assignmentOnly: z.boolean(),
  proposedClubhouseName: z.string().nullable(),
  proposedLeagueName: z.string().nullable(),
  beforeSnapshot: ScorecardEditSnapshotSchema,
  proposedSnapshot: ScorecardEditSnapshotSchema,
});

export const ScorecardEditBundleSchema = z.object({
  item: ImportedScorecardItemSchema,
  canEdit: z.boolean(),
  canApproveSubmitter: z.boolean(),
  canApproveLeague: z.boolean(),
  editHistory: z.array(ScorecardEditHistoryItemSchema),
});

export const ScorecardEditRequestResponseSchema = z.object({
  id: z.string(),
  status: z.literal('PENDING'),
  message: z.string(),
});

export const ScorecardEditApprovalSchema = z.object({
  role: z.enum(['submitter', 'leagueLeader']),
});

export const ScorecardEditActionResponseSchema = z.object({
  ok: z.literal(true),
  applied: z.boolean(),
  message: z.string(),
});

export const ScorecardEditRejectResponseSchema = z.object({
  ok: z.literal(true),
  message: z.string(),
});

export const ScorecardAssignmentActionResponseSchema = z.object({
  ok: z.literal(true),
  clubhouseId: z.string().nullable(),
  leagueId: z.string().nullable(),
  unchanged: z.boolean().optional(),
  pending: z.boolean().optional(),
  message: z.string().optional(),
});

export const ScorecardAssignmentUpdateSchema = z
  .object({
    clubhouseId: z.string().nullable(),
    leagueId: z.string().nullable(),
  })
  .strict();

export const ScorecardDestinationsSchema = z.object({
  clubhouses: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
  leagues: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        role: z.enum(['LEADER', 'SCOREKEEPER']),
      })
      .strict(),
  ),
  courseLayouts: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        courseName: z.string(),
        location: z.string(),
        holes: z.array(
          z
            .object({
              number: z.number().int().positive(),
              par: z.number().int().positive(),
              lengthFeet: z.number().int().positive().nullable(),
              lengthVerified: z.boolean(),
            })
            .strict(),
        ),
      })
      .strict(),
  ),
});

export const LeagueSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    role: z.enum(['LEADER', 'SCOREKEEPER', 'PLAYER']),
    joinCode: z.string().nullable(),
    finalizedRounds: z.number().int().nonnegative(),
    standings: z.array(
      z.object({
        playerKey: z.string(),
        label: z.string(),
        username: z.string().nullable(),
        profileHref: z.string().nullable(),
        rounds: z.number().int().positive(),
        totalStrokes: z.number().int().positive(),
        averageStrokes: z.number().finite(),
        averageToPar: z.number().finite(),
        eagles: z.number().int().nonnegative(),
        birdies: z.number().int().nonnegative(),
        aces: z.number().int().nonnegative(),
      }),
    ),
  })
  .strict();

export const LeagueListSchema = z.object({ items: z.array(LeagueSummarySchema) });
export const LeagueCreateSchema = z.object({ name: z.string().trim().min(2).max(100) }).strict();
export const LeagueCreateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.literal('LEADER'),
});
export const LeagueJoinResponseSchema = z.object({
  ok: z.literal(true),
  league: z.object({ id: z.string(), name: z.string() }),
});

export type ScorecardEditDraft = z.infer<typeof ScorecardEditDraftSchema>;
export type ScorecardEditBundle = z.infer<typeof ScorecardEditBundleSchema>;
export type ScorecardDestinations = z.infer<typeof ScorecardDestinationsSchema>;
export type LeagueSummary = z.infer<typeof LeagueSummarySchema>;
