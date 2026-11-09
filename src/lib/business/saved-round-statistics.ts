// @polsia:user-owned — combine finalized live rounds with the existing unofficial player stats.

import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import { calculateSavedRound } from '@/lib/business/saved-round';
import type {
  ImportedScorecardItem,
  ImportedScorecardPlayer,
} from '@/lib/contracts/imported-scorecard';
import type { PublicPlayerProfile } from '@/lib/contracts/player-identity';

export type SavedRoundStatisticsInput = {
  id: string;
  playedOn: string;
  courseName: string | null;
  status: 'IN_PROGRESS' | 'FINALIZED';
  holePars: number[];
  participants: Array<{
    userId: string;
    displayName: string;
    holeScores: (number | null)[];
  }>;
};

type PlayerRoundMetrics = {
  id: string;
  playedOn: string | null;
  score: number | null;
  toPar: number | null;
  position: string | null;
  holeResults: Array<{ score: number | null; par: number | null }>;
};

function placementRank(position: string | null): number | null {
  if (!position) return null;
  const match = /^T?\s*(\d+)(?:st|nd|rd|th)?$/iu.exec(position.trim());
  const value = match?.[1] ? Number(match[1]) : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

function importedMetrics(profile: PublicPlayerProfile): PlayerRoundMetrics[] {
  const username = profile.username ? normalizeUDiscUsername(profile.username) : null;
  if (!username) return [];
  return profile.rounds.flatMap((card) => {
    const player = card.players.find(
      (candidate) => normalizeUDiscUsername(candidate.username ?? '') === username,
    );
    return player ? [metricsFromImportedCard(card, player)] : [];
  });
}

function metricsFromImportedCard(
  card: ImportedScorecardItem,
  player: ImportedScorecardPlayer,
): PlayerRoundMetrics {
  const pars = card.pars ?? [];
  const playedHoleResults = player.holeScores.flatMap((score, index) => {
    if (score === null) return [];
    return [{ score, par: pars[index] ?? null }];
  });
  const score = playedHoleResults.reduce<number>((sum, hole) => sum + hole.score, 0);
  const calculatedToPar =
    playedHoleResults.length > 0 && playedHoleResults.every((hole) => hole.par !== null)
      ? score - playedHoleResults.reduce<number>((sum, hole) => sum + (hole.par ?? 0), 0)
      : null;
  return {
    id: card.scorecardId,
    playedOn: card.playedOn,
    score: playedHoleResults.length > 0 ? score : null,
    toPar: player.toPar ?? calculatedToPar,
    position: player.position,
    holeResults: player.holeScores.map((score, index) => ({ score, par: pars[index] ?? null })),
  };
}

function savedMetrics(
  userId: string,
  rounds: readonly SavedRoundStatisticsInput[],
): PlayerRoundMetrics[] {
  return rounds
    .filter((round) => round.status === 'FINALIZED')
    .flatMap((round) => {
      const ownPlayer = round.participants.find((participant) => participant.userId === userId);
      if (!ownPlayer || ownPlayer.holeScores.some((score) => score === null)) return [];
      const calculated = calculateSavedRound(
        round.holePars,
        round.participants.map((participant) => ({
          userId: participant.userId,
          holeScores: participant.holeScores,
        })),
      );
      const player = calculated.participants.find((participant) => participant.userId === userId);
      if (!player) return [];
      const tiedCount = calculated.participants.filter(
        (candidate) => candidate.position === player.position,
      ).length;
      return [
        {
          id: round.id,
          playedOn: round.playedOn,
          score: player.totalStrokes,
          toPar: player.toPar,
          position: tiedCount > 1 ? `T${player.position}` : String(player.position),
          holeResults: player.holeScores.flatMap((score, index) => {
            const par = round.holePars[index];
            return score !== null && par !== undefined ? [{ score, par }] : [];
          }),
        },
      ];
    });
}

function longestUnderParStreak(rounds: readonly PlayerRoundMetrics[]): number | null {
  if (
    rounds.length === 0 ||
    rounds.some((round) => round.holeResults.some((hole) => hole.par === null))
  ) {
    return null;
  }
  let longest = 0;
  let current = 0;
  for (const round of orderByDate(rounds)) {
    for (const hole of round.holeResults) {
      if (hole.score === null) {
        current = 0;
        continue;
      }
      if (hole.score < (hole.par ?? hole.score)) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }
  }
  return longest;
}

function longestWinStreak(rounds: readonly PlayerRoundMetrics[]): number | null {
  if (
    rounds.length === 0 ||
    rounds.some((round) => !round.playedOn || placementRank(round.position) === null)
  ) {
    return null;
  }
  let longest = 0;
  let current = 0;
  for (const round of orderByDate(rounds)) {
    if (placementRank(round.position) === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function orderByDate(rounds: readonly PlayerRoundMetrics[]): PlayerRoundMetrics[] {
  return [...rounds].sort((left, right) => {
    const leftDate = left.playedOn ? Date.parse(`${left.playedOn}T00:00:00.000Z`) : null;
    const rightDate = right.playedOn ? Date.parse(`${right.playedOn}T00:00:00.000Z`) : null;
    if (leftDate !== null && rightDate !== null && leftDate !== rightDate)
      return leftDate - rightDate;
    if (leftDate !== null && rightDate === null) return -1;
    if (leftDate === null && rightDate !== null) return 1;
    return left.id.localeCompare(right.id);
  });
}

function achievements(
  statistics: PublicPlayerProfile['statistics'],
): PublicPlayerProfile['achievements'] {
  const result: PublicPlayerProfile['achievements'] = [];
  if (statistics.lifetimeRounds >= 1) {
    result.push({
      id: 'first-finalized-round',
      title: 'First finalized round',
      criteria: 'Earned after 1 finalized scorecard.',
    });
  }
  if (statistics.lifetimeRounds >= 10) {
    result.push({
      id: 'ten-finalized-rounds',
      title: 'Ten rounds played',
      criteria: 'Earned after 10 finalized scorecards.',
    });
  }
  if (statistics.wins !== null && statistics.wins > 0) {
    result.push({
      id: 'first-recorded-win',
      title: 'First recorded win',
      criteria: 'Earned when a finalized scorecard records a first-place finish, including a tie.',
    });
  }
  if (statistics.aces !== null && statistics.aces > 0) {
    result.push({
      id: 'first-ace',
      title: 'Ace recorded',
      criteria: 'Earned when a finalized scorecard contains a saved hole score of 1.',
    });
  }
  if (statistics.birdies !== null && statistics.birdies >= 25) {
    result.push({
      id: 'twenty-five-birdies',
      title: '25 birdies recorded',
      criteria: 'Earned after 25 saved holes score exactly one under a known par.',
    });
  }
  return result;
}

export function mergeSavedRoundStatistics(
  profile: PublicPlayerProfile,
  userId: string,
  savedRounds: readonly SavedRoundStatisticsInput[],
): PublicPlayerProfile {
  const rounds = [...importedMetrics(profile), ...savedMetrics(userId, savedRounds)];
  const placements = rounds
    .map((round) => placementRank(round.position))
    .filter((rank): rank is number => rank !== null);
  const wins = placements.filter((rank) => rank === 1).length;
  const toParRounds = rounds
    .map((round) => round.toPar)
    .filter((value): value is number => value !== null);
  const knownHoleResults = rounds.flatMap((round) =>
    round.holeResults.filter((hole) => hole.par !== null && hole.score !== null),
  );
  const totalScoredHoles = rounds.reduce(
    (total, round) => total + round.holeResults.filter((hole) => hole.score !== null).length,
    0,
  );
  const scores = rounds
    .map((round) => round.score)
    .filter((score): score is number => score !== null);
  const statistics: PublicPlayerProfile['statistics'] = {
    ...profile.statistics,
    lifetimeRounds: rounds.length,
    wins: placements.length === 0 ? null : wins,
    winPercentage:
      placements.length === 0 ? null : Number(((wins / placements.length) * 100).toFixed(1)),
    averageScore:
      scores.length === 0
        ? null
        : Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)),
    averageToPar:
      toParRounds.length === 0
        ? null
        : Number(
            (toParRounds.reduce((sum, value) => sum + value, 0) / toParRounds.length).toFixed(2),
          ),
    bestScore: scores.length === 0 ? null : Math.min(...scores),
    bestPlacement: placements.length === 0 ? null : Math.min(...placements),
    roundsWithPlacement: placements.length,
    birdies:
      knownHoleResults.length === 0
        ? null
        : knownHoleResults.filter((hole) => hole.score === (hole.par ?? 0) - 1).length,
    eagles:
      knownHoleResults.length === 0
        ? null
        : knownHoleResults.filter((hole) => hole.score === (hole.par ?? 0) - 2).length,
    knownParHoles: knownHoleResults.length,
    unknownParHoles: Math.max(0, totalScoredHoles - knownHoleResults.length),
    aces:
      rounds.length === 0
        ? null
        : rounds.reduce(
            (total, round) => total + round.holeResults.filter((hole) => hole.score === 1).length,
            0,
          ),
    longestUnderParHoleStreak: longestUnderParStreak(rounds),
    longestCompetitionWinStreak: longestWinStreak(rounds),
    undatedRounds: rounds.filter((round) => round.playedOn === null).length,
  };
  const savedPerformance = savedRounds.flatMap((round) => {
    const player = round.participants.find((participant) => participant.userId === userId);
    if (!player || player.holeScores.some((score) => score === null)) return [];
    const score = player.holeScores.reduce<number>((total, hole) => total + (hole ?? 0), 0);
    return [{ playedOn: round.playedOn, courseName: round.courseName, score }];
  });
  const importedPerformance = profile.performance;
  const combinedPerformance = [...importedPerformance, ...savedPerformance].sort((left, right) =>
    (left.playedOn ?? '').localeCompare(right.playedOn ?? ''),
  );

  return {
    ...profile,
    statistics,
    achievements: achievements(statistics),
    performance: combinedPerformance,
  };
}
