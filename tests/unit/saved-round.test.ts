import { describe, expect, it } from 'vitest';
import { buildPublicPlayerProfile } from '@/lib/business/player-statistics';
import {
  calculateSavedRound,
  savedRoundPermissions,
  scoresAreComplete,
} from '@/lib/business/saved-round';
import { mergeSavedRoundStatistics } from '@/lib/business/saved-round-statistics';

describe('saved round score math and permissions', () => {
  it('calculates total par, partial totals, to-par, and live standings', () => {
    const result = calculateSavedRound(
      [3, 3, 4],
      [
        { userId: 'player-a', holeScores: [2, 3, null] },
        { userId: 'player-b', holeScores: [3, 3, 4] },
      ],
    );

    expect(result.totalPar).toBe(10);
    expect(result.participants).toEqual([
      {
        userId: 'player-a',
        holeScores: [2, 3, null],
        totalStrokes: 5,
        holesPlayed: 2,
        toPar: -1,
        position: 1,
      },
      {
        userId: 'player-b',
        holeScores: [3, 3, 4],
        totalStrokes: 10,
        holesPlayed: 3,
        toPar: 0,
        position: 2,
      },
    ]);
  });

  it('requires complete scores before finalization', () => {
    expect(scoresAreComplete([{ userId: 'a', holeScores: [3, null] }], 2)).toBe(false);
    expect(scoresAreComplete([{ userId: 'a', holeScores: [3, 4] }], 2)).toBe(true);
  });

  it('allows casual participants to finalize and correct while denying outsiders', () => {
    expect(
      savedRoundPermissions({
        status: 'IN_PROGRESS',
        isParticipant: true,
        role: null,
        hasLeague: false,
      }).canFinalize,
    ).toBe(true);
    expect(
      savedRoundPermissions({
        status: 'IN_PROGRESS',
        isParticipant: false,
        role: null,
        hasLeague: false,
      }).canFinalize,
    ).toBe(false);
    expect(
      savedRoundPermissions({
        status: 'FINALIZED',
        isParticipant: true,
        role: null,
        hasLeague: false,
      }).canCorrect,
    ).toBe(true);
    expect(
      savedRoundPermissions({
        status: 'FINALIZED',
        isParticipant: false,
        role: null,
        hasLeague: false,
      }).canCorrect,
    ).toBe(false);
  });

  it('applies League score entry and finalization only to current authorized roles', () => {
    expect(
      savedRoundPermissions({
        status: 'IN_PROGRESS',
        isParticipant: false,
        role: 'SCOREKEEPER',
        hasLeague: true,
      }).canEdit,
    ).toBe(true);
    expect(
      savedRoundPermissions({
        status: 'IN_PROGRESS',
        isParticipant: true,
        role: 'PLAYER',
        hasLeague: true,
      }).canEdit,
    ).toBe(true);
    expect(
      savedRoundPermissions({
        status: 'IN_PROGRESS',
        isParticipant: false,
        role: 'PLAYER',
        hasLeague: true,
      }).canEdit,
    ).toBe(false);
    expect(
      savedRoundPermissions({
        status: 'IN_PROGRESS',
        isParticipant: true,
        role: 'SCOREKEEPER',
        hasLeague: true,
      }).canFinalize,
    ).toBe(false);
    expect(
      savedRoundPermissions({
        status: 'IN_PROGRESS',
        isParticipant: false,
        role: 'LEADER',
        hasLeague: true,
      }).canFinalize,
    ).toBe(true);
    expect(
      savedRoundPermissions({
        status: 'FINALIZED',
        isParticipant: true,
        role: 'LEADER',
        hasLeague: true,
      }).canCorrect,
    ).toBe(true);
    expect(
      savedRoundPermissions({
        status: 'FINALIZED',
        isParticipant: true,
        role: 'SCOREKEEPER',
        hasLeague: true,
      }).canCorrect,
    ).toBe(false);
  });
});

describe('saved round player statistics', () => {
  const baseProfile = buildPublicPlayerProfile({
    displayName: 'Player One',
    username: null,
    identityStatus: 'unclaimed',
    identifiedUsernames: [],
    cards: [],
  });
  const finishedRound = {
    id: 'round-1',
    playedOn: '2026-10-01',
    courseName: 'Course One',
    status: 'FINALIZED' as const,
    holePars: [3, 4, 3],
    participants: [
      { userId: 'user-1', displayName: 'Player One', holeScores: [2, 4, 1] },
      { userId: 'user-2', displayName: 'Player Two', holeScores: [3, 4, 2] },
    ],
  };

  it('counts finalized rounds, while unfinished rounds do not change player statistics', () => {
    const unfinished = { ...finishedRound, id: 'round-2', status: 'IN_PROGRESS' as const };
    const result = mergeSavedRoundStatistics(baseProfile, 'user-1', [unfinished]);
    expect(result.statistics.lifetimeRounds).toBe(0);
    expect(result.statistics.averageScore).toBeNull();
  });

  it('recomputes totals and hole statistics after an authorized correction', () => {
    const firstParticipant = finishedRound.participants[0];
    const secondParticipant = finishedRound.participants[1];
    if (!firstParticipant || !secondParticipant) {
      throw new Error('The statistics fixture requires two participants.');
    }
    const before = mergeSavedRoundStatistics(baseProfile, 'user-1', [finishedRound]);
    const corrected = mergeSavedRoundStatistics(baseProfile, 'user-1', [
      {
        ...finishedRound,
        participants: [{ ...firstParticipant, holeScores: [3, 4, 1] }, secondParticipant],
      },
    ]);

    expect(before.statistics).toMatchObject({
      lifetimeRounds: 1,
      wins: 1,
      averageScore: 7,
      averageToPar: -3,
      birdies: 1,
      eagles: 1,
      aces: 1,
    });
    expect(corrected.statistics).toMatchObject({
      lifetimeRounds: 1,
      wins: 1,
      averageScore: 8,
      averageToPar: -2,
      birdies: 0,
      eagles: 1,
      aces: 1,
    });
  });
});
