// @polsia:user-owned — championship points and transparent League tie-breaks (PRD v4 §5).
import type { LeagueScoringFormat } from '@/lib/contracts/leagues';

/** PRD v4 fixed placement points for 1st–10th. From 11th: one fewer per place, minimum 1. */
export const DEFAULT_FIXED_POINTS = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6] as const;

/** Field-size adjusted maximum: 25 × (N − P) / (N − 1). */
export const FIELD_SIZE_MAX_POINTS = 25;

export interface LeagueFinish {
  playerKey: string;
  totalStrokes: number;
}

export interface LeagueAward {
  playerKey: string;
  /** Competition rank: tied players share the best occupied place (1, 1, 3). */
  place: number;
  points: number;
}

/** Round to cents-style two decimals without binary drift (e.g. 1.005 → 1.01). */
export function roundPoints(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Points for one place under a fixed table, extended past its end by −1 per place (min 1). */
export function fixedPointsForPlace(place: number, table: readonly number[]): number {
  const listed = table[place - 1];
  if (listed !== undefined) return listed;
  const last = table.at(-1);
  if (last === undefined) return 0;
  return Math.max(1, last - (place - table.length));
}

/** Field-size adjusted points: one-player field gets the maximum; last place gets 0 when N > 1. */
export function fieldSizePointsForPlace(place: number, fieldSize: number): number {
  if (fieldSize <= 1) return FIELD_SIZE_MAX_POINTS;
  return (FIELD_SIZE_MAX_POINTS * (fieldSize - place)) / (fieldSize - 1);
}

export function awardLeaguePoints(
  finishes: readonly LeagueFinish[],
  format: LeagueScoringFormat,
  fixedPoints: readonly number[] = DEFAULT_FIXED_POINTS,
): LeagueAward[] {
  const ordered = [...finishes].sort(
    (left, right) =>
      left.totalStrokes - right.totalStrokes || left.playerKey.localeCompare(right.playerKey),
  );
  const fieldSize = ordered.length;
  const awards: LeagueAward[] = [];
  let cursor = 0;

  while (cursor < ordered.length) {
    const first = ordered[cursor];
    if (!first) break;
    let end = cursor + 1;
    while (end < ordered.length && ordered[end]?.totalStrokes === first.totalStrokes) end += 1;
    const place = cursor + 1;
    const occupiedPlaces = Array.from({ length: end - cursor }, (_, offset) => place + offset);
    const pointsFor = (rank: number) =>
      format === 'FIELD_SIZE'
        ? fieldSizePointsForPlace(rank, fieldSize)
        : fixedPointsForPlace(rank, fixedPoints);
    const points = roundPoints(
      occupiedPlaces.reduce((sum, rank) => sum + pointsFor(rank), 0) / occupiedPlaces.length,
    );

    for (const finish of ordered.slice(cursor, end)) {
      awards.push({ playerKey: finish.playerKey, place, points });
    }
    cursor = end;
  }
  return awards;
}

/** Season total = sum of every eligible finalized round. No drops, no missed-round points. */
export function accumulateLeaguePoints(
  playerKeys: readonly string[],
  completedRoundAwards: readonly (readonly LeagueAward[])[],
) {
  const totals = new Map<string, number>(playerKeys.map((playerKey) => [playerKey, 0]));
  for (const awards of completedRoundAwards) {
    for (const award of awards) {
      totals.set(award.playerKey, roundPoints((totals.get(award.playerKey) ?? 0) + award.points));
    }
  }
  return totals;
}

export interface LeagueStandingSortInput {
  points: number;
  wins: number;
  seconds: number;
  /** Mean competition place across counted rounds; null when no rounds. */
  averagePlace: number | null;
}

/**
 * PRD v4 season tie-breaks: points → most wins → most second places → best average placement.
 * Returns 0 when all are equal: those players share the standing.
 */
export function compareLeagueStandings(
  left: LeagueStandingSortInput,
  right: LeagueStandingSortInput,
) {
  return (
    right.points - left.points ||
    right.wins - left.wins ||
    right.seconds - left.seconds ||
    (left.averagePlace ?? Number.POSITIVE_INFINITY) -
      (right.averagePlace ?? Number.POSITIVE_INFINITY)
  );
}

/** Competition ranks (1, 1, 3) for a list already sorted with compareLeagueStandings. */
export function sharedStandingRanks<T extends LeagueStandingSortInput>(sorted: readonly T[]) {
  const ranks: number[] = [];
  sorted.forEach((standing, index) => {
    const previous = index > 0 ? sorted[index - 1] : undefined;
    const previousRank = ranks.at(-1);
    ranks.push(
      previous && previousRank !== undefined && compareLeagueStandings(previous, standing) === 0
        ? previousRank
        : index + 1,
    );
  });
  return ranks;
}

export const LEAGUE_TIE_BREAKERS = [
  'Total championship points',
  'Most round wins',
  'Most second-place finishes',
  'Best average placement',
  'Otherwise the standing is shared',
] as const;
