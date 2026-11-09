// @polsia:user-owned — signed-in dashboard summary response.
import { z } from 'zod';

export const DashboardOverviewSchema = z
  .object({
    roundsPlayed: z.number().int().nonnegative(),
    bestRound: z.number().int().nonnegative().nullable(),
    averageScore: z.number().finite().nullable(),
    recentRounds: z.array(
      z
        .object({
          id: z.string(),
          scorecardId: z.string(),
          playedOn: z.string().nullable(),
          courseName: z.string().nullable(),
          playerName: z.string(),
          totalScore: z.number().int().nonnegative(),
          toPar: z.number().int().nullable(),
          holesPlayed: z.number().int().nonnegative(),
          holeCount: z.number().int().positive().nullable(),
          didNotFinish: z.boolean(),
          sourceUrl: z.string().url(),
        })
        .strict(),
    ),
    clubhouses: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
  })
  .strict();

export type DashboardOverview = z.infer<typeof DashboardOverviewSchema>;
