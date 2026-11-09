// @polsia:user-owned — typed public Global Stats metrics and scorecard drilldowns.
import { z } from 'zod';

export const GlobalStatMetricSchema = z.enum([
  'aces',
  'eagles',
  'birdies',
  'pars',
  'bogeys',
  'doubleBogeys',
  'triplePlusBogeys',
  'distanceFeet',
  'holesPlayed',
  'roundsPlayed',
  'uniquePlayers',
  'strokesThrown',
]);

export const GlobalStatsMetricsSchema = z.object({
  aces: z.number().int().nonnegative(),
  eagles: z.number().int().nonnegative(),
  birdies: z.number().int().nonnegative(),
  pars: z.number().int().nonnegative(),
  bogeys: z.number().int().nonnegative(),
  doubleBogeys: z.number().int().nonnegative(),
  triplePlusBogeys: z.number().int().nonnegative(),
  distanceFeet: z.number().int().nonnegative(),
  holesPlayed: z.number().int().nonnegative(),
  roundsPlayed: z.number().int().nonnegative(),
  uniquePlayers: z.number().int().nonnegative(),
  strokesThrown: z.number().int().nonnegative(),
});

const GlobalStatsHoleSchema = z.object({
  number: z.number().int().positive(),
  score: z.number().int().positive(),
  par: z.number().int().positive().nullable(),
  distanceFeet: z.number().int().positive().nullable(),
  contributes: z.boolean(),
});

const GlobalStatsCardPlayerSchema = z.object({
  key: z.string().min(1),
  entryId: z.string().min(1),
  label: z.string().min(1),
  username: z.string().nullable(),
  profileHref: z.string().nullable(),
  totalScore: z.number().int().nonnegative().nullable(),
  holesPlayed: z.number().int().nonnegative(),
  didNotFinish: z.boolean(),
  holeCount: z.number().int().positive().nullable(),
  holes: z.array(GlobalStatsHoleSchema),
});

const GlobalStatsScorecardSchema = z.object({
  id: z.string().min(1),
  scorecardId: z.string().min(1),
  sourceUrl: z.string().url(),
  courseName: z.string().nullable(),
  layoutName: z.string().nullable(),
  playedOn: z.string().nullable(),
  holeCount: z.number().int().positive().nullable(),
  clubhouseName: z.string().nullable(),
  leagueName: z.string().nullable(),
  hasVerifiedChanges: z.boolean().optional(),
  players: z.array(GlobalStatsCardPlayerSchema),
});

export const GlobalStatsResponseSchema = z.object({
  updatedAt: z.string().datetime(),
  metrics: GlobalStatsMetricsSchema,
  selectedMetric: GlobalStatMetricSchema,
  contributors: z.object({
    players: z.array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        username: z.string().nullable(),
        profileHref: z.string().nullable(),
        rounds: z.number().int().nonnegative(),
        holes: z.number().int().nonnegative(),
        strokes: z.number().int().nonnegative(),
      }),
    ),
    scorecards: z.array(GlobalStatsScorecardSchema),
  }),
});

export type GlobalStatMetric = z.infer<typeof GlobalStatMetricSchema>;
export type GlobalStatsResponse = z.infer<typeof GlobalStatsResponseSchema>;
