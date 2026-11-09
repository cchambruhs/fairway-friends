// @polsia:user-owned — pure score math and current role decisions for saved rounds.
import type { SavedRoundItem } from '@/lib/contracts/saved-round';

export type SavedRoundStatus = 'IN_PROGRESS' | 'FINALIZED';
export type SavedRoundRole = 'LEADER' | 'SCOREKEEPER' | 'PLAYER' | null;

export type ScoreRowInput = {
  userId: string;
  holeScores: readonly (number | null)[];
};

export type CalculatedPlayer = {
  userId: string;
  holeScores: (number | null)[];
  totalStrokes: number;
  holesPlayed: number;
  toPar: number | null;
  position: number;
};

export function calculateSavedRound(
  holePars: readonly number[],
  rows: readonly ScoreRowInput[],
): { totalPar: number; participants: CalculatedPlayer[] } {
  const totalPar = holePars.reduce((sum, par) => sum + par, 0);
  const calculated = rows.map((row) => {
    const holeScores = [...row.holeScores];
    const holesPlayed = holeScores.filter((score) => score !== null).length;
    const totalStrokes = holeScores.reduce<number>((sum, score) => sum + (score ?? 0), 0);
    const toPar = holeScores.reduce<number>((sum, score, index) => {
      const par = holePars[index];
      return score !== null && par !== undefined ? sum + score - par : sum;
    }, 0);
    return {
      userId: row.userId,
      holeScores,
      totalStrokes,
      holesPlayed,
      toPar: holesPlayed === 0 ? null : toPar,
    };
  });

  return {
    totalPar,
    participants: calculated
      .map((player) => ({
        ...player,
        position: 1 + calculated.filter((other) => compareLiveScores(other, player) < 0).length,
      }))
      .sort(
        (left, right) => left.position - right.position || left.userId.localeCompare(right.userId),
      ),
  };
}

function compareLiveScores(
  left: Pick<CalculatedPlayer, 'holesPlayed' | 'toPar' | 'totalStrokes'>,
  right: Pick<CalculatedPlayer, 'holesPlayed' | 'toPar' | 'totalStrokes'>,
): number {
  if (left.holesPlayed === 0 && right.holesPlayed > 0) return 1;
  if (right.holesPlayed === 0 && left.holesPlayed > 0) return -1;
  if (left.holesPlayed > 0 && right.holesPlayed > 0) {
    const leftAverage = (left.toPar ?? 0) / left.holesPlayed;
    const rightAverage = (right.toPar ?? 0) / right.holesPlayed;
    if (leftAverage !== rightAverage) return leftAverage - rightAverage;
  }
  return left.totalStrokes - right.totalStrokes;
}

export function scoresAreComplete(rows: readonly ScoreRowInput[], holeCount: number): boolean {
  return (
    rows.length > 0 &&
    rows.every(
      (row) =>
        row.holeScores.length === holeCount && row.holeScores.every((score) => score !== null),
    )
  );
}

export function savedRoundPermissions(input: {
  status: SavedRoundStatus;
  isParticipant: boolean;
  role: SavedRoundRole;
  hasLeague: boolean;
}): Pick<SavedRoundItem['viewer'], 'canEdit' | 'canFinalize' | 'canCorrect'> {
  if (!input.hasLeague) {
    const canParticipate = input.isParticipant;
    return {
      canEdit: canParticipate,
      canFinalize: input.status === 'IN_PROGRESS' && canParticipate,
      canCorrect: input.status === 'FINALIZED' && canParticipate,
    };
  }

  const canEnterLeagueScores =
    input.role === 'LEADER' ||
    input.role === 'SCOREKEEPER' ||
    (input.role === 'PLAYER' && input.isParticipant);
  return {
    canEdit:
      input.status === 'IN_PROGRESS'
        ? canEnterLeagueScores
        : input.status === 'FINALIZED' && input.role === 'LEADER',
    canFinalize: input.status === 'IN_PROGRESS' && input.role === 'LEADER',
    canCorrect: input.status === 'FINALIZED' && input.role === 'LEADER',
  };
}
