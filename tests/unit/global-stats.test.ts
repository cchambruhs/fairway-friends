import { describe, expect, it } from 'vitest';
import { aggregateGlobalStats, type GlobalStatsCardRecord } from '@/lib/business/global-stats';
import { importedScorecardFingerprint } from '@/lib/business/imported-scorecard';
import type { ImportedScorecardDraft } from '@/lib/contracts/imported-scorecard';

function makeCard(input: {
  id: string;
  scorecardId: string;
  playedOn: string | null;
  layoutName: string | null;
  pars: Array<number | null> | null;
  holeCount: number;
  players: Array<{
    id: string;
    username: string | null;
    displayName: string | null;
    identityId?: string | null;
    normalizedUsername?: string | null;
    identityOwnerUserId?: string | null;
    holeScores: Array<number | null>;
  }>;
  verifiedLengths?: Array<{ number: number; lengthFeet: number; verified: boolean }>;
}): GlobalStatsCardRecord {
  const sourceUrl = `https://udisc.com/scorecards/${input.scorecardId}`;
  const players = input.players.map((player) => {
    const holesPlayed = player.holeScores.filter((score) => score !== null).length;
    const didNotFinish = holesPlayed < player.holeScores.length;
    const totalScore = player.holeScores.reduce<number>((sum, score) => sum + (score ?? 0), 0);
    const playedPars = player.holeScores.flatMap((score, index) => {
      const par = input.pars?.[index];
      return score !== null && typeof par === 'number' ? [par] : [];
    });
    return {
      displayName: player.displayName,
      username: player.username,
      holeScores: player.holeScores,
      holesPlayed,
      didNotFinish,
      totalScore,
      toPar:
        holesPlayed > 0 && playedPars.length === holesPlayed
          ? totalScore - playedPars.reduce<number>((sum, par) => sum + par, 0)
          : null,
      position: null,
    };
  });
  const draft: ImportedScorecardDraft = {
    scorecardId: input.scorecardId,
    sourceUrl,
    courseName: 'Woodland Course',
    courseUrl: null,
    layoutName: input.layoutName,
    playedOn: input.playedOn,
    location: 'Indiana',
    holeCount: input.holeCount,
    pars: input.pars,
    totalPar: null,
    players: players.map((player) => ({ ...player, toPar: null })),
  };
  const fingerprint = importedScorecardFingerprint(draft);
  return {
    id: input.id,
    scorecardId: input.scorecardId,
    sourceUrl,
    fingerprint,
    courseName: 'Woodland Course',
    courseUrl: null,
    layoutName: input.layoutName,
    playedOn: input.playedOn ? new Date(`${input.playedOn}T00:00:00.000Z`) : null,
    location: 'Indiana',
    holeCount: input.holeCount,
    totalPar: null,
    pars: input.pars,
    clubhouseName: null,
    leagueName: null,
    courseHoles: (input.verifiedLengths ?? []).map((hole) => ({
      number: hole.number,
      lengthFeet: hole.lengthFeet,
      lengthVerifiedAt: hole.verified ? new Date('2026-11-06T00:00:00.000Z') : null,
      lengthVerifiedByUserId: hole.verified ? 'admin-user' : null,
    })),
    players: input.players.map((player) => ({
      id: player.id,
      identityId: player.identityId ?? null,
      identityOwnerUserId: player.identityOwnerUserId ?? null,
      normalizedUsername: player.normalizedUsername ?? null,
      displayName: player.displayName,
      username: player.username,
      holeScores: player.holeScores,
      holesPlayed: player.holeScores.filter((score) => score !== null).length,
      didNotFinish: player.holeScores.some((score) => score === null),
      totalScore: player.holeScores.reduce<number>((sum, score) => sum + (score ?? 0), 0),
      toPar: null,
      position: null,
    })),
  };
}

describe('Global Stats aggregation', () => {
  it('counts player-hole metrics, a multiplayer round, canonical players, and verified distance', () => {
    const card = makeCard({
      id: 'card-1',
      scorecardId: 'round-one',
      playedOn: '2026-11-01',
      layoutName: 'Gold',
      holeCount: 3,
      pars: [3, 4, 3],
      players: [
        {
          id: 'alice-row',
          username: 'Alice',
          normalizedUsername: 'alice',
          displayName: 'Sam',
          holeScores: [1, 2, 6],
        },
        {
          id: 'bob-row',
          username: 'Bob',
          normalizedUsername: 'bob',
          displayName: 'Sam',
          holeScores: [3, 5, 4],
        },
      ],
      verifiedLengths: [
        { number: 1, lengthFeet: 300, verified: true },
        { number: 2, lengthFeet: 420, verified: true },
        { number: 3, lengthFeet: 700, verified: false },
      ],
    });
    const stats = aggregateGlobalStats([card], 'aces', new Date('2026-11-06T12:00:00.000Z'));

    expect(stats.metrics).toEqual({
      aces: 1,
      eagles: 2,
      birdies: 0,
      pars: 1,
      bogeys: 2,
      doubleBogeys: 0,
      triplePlusBogeys: 1,
      distanceFeet: 1440,
      holesPlayed: 6,
      roundsPlayed: 1,
      uniquePlayers: 2,
      strokesThrown: 21,
    });
    expect(stats.contributors.scorecards).toHaveLength(1);
    expect(stats.contributors.scorecards[0]?.players).toHaveLength(2);
    expect(stats.contributors.scorecards[0]?.players[0]?.holes[0]).toMatchObject({
      number: 1,
      score: 1,
      par: 3,
      distanceFeet: 300,
      contributes: true,
    });
  });

  it('counts completed scores when pars are absent, excludes incomplete cards, and does not merge name-only entries', () => {
    const noPars = makeCard({
      id: 'no-pars',
      scorecardId: 'no-pars-round',
      playedOn: '2026-10-20',
      layoutName: 'Unknown',
      holeCount: 2,
      pars: null,
      players: [
        { id: 'name-one', username: null, displayName: 'Riley', holeScores: [1, 3] },
        { id: 'name-two', username: null, displayName: 'Riley', holeScores: [2, 4] },
      ],
    });
    const incomplete = makeCard({
      id: 'incomplete',
      scorecardId: 'incomplete-round',
      playedOn: '2026-10-21',
      layoutName: 'Short',
      holeCount: 3,
      pars: [3, 3, 3],
      players: [{ id: 'partial', username: 'partial', displayName: 'Partial', holeScores: [2, 3] }],
    });
    const stats = aggregateGlobalStats([noPars, incomplete], 'aces');

    expect(stats.metrics).toMatchObject({
      aces: 1,
      eagles: 0,
      birdies: 0,
      holesPlayed: 4,
      roundsPlayed: 1,
      uniquePlayers: 2,
      strokesThrown: 10,
    });
    expect(stats.contributors.players.map((player) => player.key)).toEqual(['entry:name-one']);
  });

  it('classifies the exact score relative to each saved hole par', () => {
    const card = makeCard({
      id: 'category-definition',
      scorecardId: 'category-definition-round',
      playedOn: '2026-10-18',
      layoutName: 'Scoring definitions',
      holeCount: 6,
      pars: [3, 3, 3, 4, 3, 3],
      players: [
        {
          id: 'category-player',
          username: 'category-player',
          displayName: 'Category Player',
          holeScores: [1, 2, 3, 3, 5, 6],
        },
      ],
    });
    const stats = aggregateGlobalStats([card], 'doubleBogeys');

    expect(stats.metrics).toMatchObject({
      aces: 1,
      eagles: 1,
      birdies: 2,
      pars: 1,
      bogeys: 0,
      doubleBogeys: 1,
      triplePlusBogeys: 1,
      holesPlayed: 6,
      strokesThrown: 20,
    });
    expect(
      stats.contributors.scorecards[0]?.players[0]?.holes.map((hole) => hole.contributes),
    ).toEqual([false, false, false, false, true, false]);
  });

  it('deduplicates by fingerprint and merges linked canonical identities across usernames', () => {
    const first = makeCard({
      id: 'first-record',
      scorecardId: 'first-card',
      playedOn: '2026-08-01',
      layoutName: 'Park',
      holeCount: 1,
      pars: [3],
      players: [
        {
          id: 'first-player',
          username: 'oldname',
          normalizedUsername: 'oldname',
          displayName: 'Taylor',
          holeScores: [2],
        },
      ],
    });
    const second = makeCard({
      id: 'second-record',
      scorecardId: 'second-card',
      playedOn: '2026-08-02',
      layoutName: 'Park',
      holeCount: 1,
      pars: [3],
      players: [
        {
          id: 'second-player',
          username: 'newname',
          normalizedUsername: 'newname',
          identityId: 'canonical-taylor',
          displayName: 'T. Player',
          holeScores: [3],
        },
      ],
    });
    const canonicalFirst = {
      ...first,
      players: first.players.map((player) => ({ ...player, identityId: 'canonical-taylor' })),
    };
    const duplicate = { ...canonicalFirst, id: 'duplicate-record' };
    const stats = aggregateGlobalStats([canonicalFirst, duplicate, second], 'uniquePlayers');

    expect(stats.metrics).toMatchObject({ roundsPlayed: 2, uniquePlayers: 1, holesPlayed: 2 });
    expect(stats.contributors.players).toHaveLength(1);
    expect(stats.contributors.players[0]).toMatchObject({
      key: 'identity:canonical-taylor',
      rounds: 2,
    });
    expect(stats.contributors.scorecards).toHaveLength(2);
  });

  it('counts only played holes from a partial scorecard and represents an all-blank total as unavailable', () => {
    const partial = makeCard({
      id: 'partial-card',
      scorecardId: 'partial-round',
      playedOn: '2026-11-01',
      layoutName: 'Short',
      holeCount: 3,
      pars: [3, 3, 3],
      players: [
        {
          id: 'partial-player',
          username: 'partial-player',
          displayName: 'Partial Player',
          holeScores: [2, null, 4],
        },
      ],
    });
    const blank = makeCard({
      id: 'blank-card',
      scorecardId: 'blank-round',
      playedOn: '2026-11-02',
      layoutName: 'Short',
      holeCount: 3,
      pars: [3, 3, 3],
      players: [
        {
          id: 'blank-player',
          username: 'blank-player',
          displayName: 'Blank Player',
          holeScores: [null, null, null],
        },
      ],
    });

    const stats = aggregateGlobalStats([partial, blank], 'roundsPlayed');
    expect(stats.metrics).toMatchObject({
      roundsPlayed: 2,
      holesPlayed: 2,
      strokesThrown: 6,
      birdies: 1,
      bogeys: 1,
    });
    expect(stats.contributors.scorecards[0]?.players[0]).toMatchObject({
      totalScore: 6,
      holesPlayed: 2,
      didNotFinish: true,
      holeCount: 3,
    });
    expect(stats.contributors.scorecards[0]?.players[0]?.holes.map((hole) => hole.number)).toEqual([
      1, 3,
    ]);
    expect(stats.contributors.scorecards[1]?.players[0]).toMatchObject({
      totalScore: null,
      holesPlayed: 0,
      didNotFinish: true,
      holes: [],
    });
  });
});
