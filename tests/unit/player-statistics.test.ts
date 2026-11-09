import { describe, expect, it } from 'vitest';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import { buildPublicPlayerProfile } from '@/lib/business/player-statistics';
import type {
  ImportedScorecardItem,
  ImportedScorecardPlayer,
} from '@/lib/contracts/imported-scorecard';

function player(
  id: string,
  username: string | null,
  holeScores: Array<number | null>,
  position: string | null = null,
  toPar: number | null = null,
): ImportedScorecardPlayer {
  return {
    id,
    username,
    displayName: username?.replace(/^@/u, '') ?? 'Unlinked player',
    holeScores,
    totalScore: holeScores.reduce<number>((sum, score) => sum + (score ?? 0), 0),
    toPar,
    position,
    holesPlayed: holeScores.filter((score) => score !== null).length,
    didNotFinish: holeScores.some((score) => score === null),
  };
}

function card(input: {
  id: string;
  date?: string | null;
  players: ImportedScorecardPlayer[];
  pars?: Array<number | null> | null;
  finalizedAt?: string | null;
  courseName?: string;
  courseUrl?: string | null;
  layoutName?: string | null;
  clubhouseId?: string | null;
}): ImportedScorecardItem {
  const pars = input.pars === undefined ? Array.from({ length: 3 }, () => 3) : input.pars;
  const totalPar = pars?.every((par) => par !== null)
    ? pars.reduce((sum, par) => sum + (par ?? 0), 0)
    : null;
  const date = input.date === undefined ? '2026-01-01' : input.date;
  const id = input.id;
  return {
    id,
    scorecardId: id,
    sourceUrl: `https://udisc.com/scorecards/${id}`,
    courseName: input.courseName ?? 'North Course',
    courseUrl: input.courseUrl === undefined ? 'https://udisc.com/courses/north' : input.courseUrl,
    layoutName: input.layoutName === undefined ? 'Gold' : input.layoutName,
    playedOn: date,
    location: 'Sample location',
    holeCount: pars?.length ?? input.players[0]?.holeScores.length ?? null,
    pars,
    totalPar,
    players: input.players,
    createdAt: `${date ?? '2026-01-01'}T12:00:00.000Z`,
    clubhouseId: input.clubhouseId === undefined ? 'club-north' : input.clubhouseId,
    clubhouseName: input.clubhouseId === null ? null : 'North Crew',
    finalizedAt: input.finalizedAt === undefined ? '2026-01-02T12:00:00.000Z' : input.finalizedAt,
    canReassign: false,
  };
}

function profile(
  cards: readonly ImportedScorecardItem[],
  options: { username?: string | null; identities?: string[] } = {},
) {
  return buildPublicPlayerProfile({
    displayName: 'Fairway Player',
    username: options.username === undefined ? 'fairway' : options.username,
    identityStatus: 'verified',
    identifiedUsernames: options.identities ?? ['fairway', 'rival', 'rivalx'],
    cards,
  });
}

describe('finalized saved-result player statistics', () => {
  it('uses only played holes for DNF to-par and hole stats, and excludes partial scores from round averages and records', () => {
    const partial = card({
      id: 'dnf-round',
      pars: [3, 3, 3],
      players: [player('partial-player', 'fairway', [2, null, 4], null, 0)],
    });
    const result = profile([partial]);
    expect(result.statistics).toMatchObject({
      lifetimeRounds: 1,
      averageScore: null,
      bestScore: null,
      averageToPar: 0,
      birdies: 1,
      knownParHoles: 2,
      unknownParHoles: 0,
    });
    expect(result.bestRounds).toEqual([]);
    expect(result.performance).toEqual([]);
  });

  it('normalizes exact identities and excludes unfinalized, duplicate, and unresolved rows without mutating history', () => {
    const finalized = card({
      id: 'final-a',
      players: [
        player('target-first', '@FAIRWAY', [3, 3, 2], 'T1', 0),
        player('target-duplicate', 'fairway', [1, 1, 1], '1', -6),
        player('unresolved', null, [2, 2, 2], '2', -3),
        player('unregistered', 'name-only', [1, 1, 1], '1', -6),
      ],
    });
    const unfinalized = card({
      id: 'draft-a',
      finalizedAt: null,
      players: [player('draft-player', 'fairway', [1, 1, 1], '1', -6)],
    });
    const history = [finalized, unfinalized, finalized];
    const before = JSON.stringify(history);

    const result = profile(history);

    expect(result.statistics.lifetimeRounds).toBe(1);
    expect(result.statistics.bestScore).toBe(8);
    expect(result.statistics.wins).toBe(1);
    expect(result.rounds.map((item) => item.scorecardId)).toEqual(['final-a']);
    expect(JSON.stringify(history)).toBe(before);
  });

  it('uses recorded placements for tied wins and calculates win percentage over placed rounds', () => {
    const result = profile([
      card({
        id: 'placed-tie',
        date: '2026-01-01',
        players: [player('a', 'fairway', [3, 3, 2], 'T1', -1)],
      }),
      card({
        id: 'placed-second',
        date: '2026-01-02',
        players: [player('b', 'fairway', [3, 3, 3], '2', 0)],
      }),
    ]);

    expect(result.statistics).toMatchObject({
      lifetimeRounds: 2,
      wins: 1,
      winPercentage: 50,
      roundsWithPlacement: 2,
      averageScore: 8.5,
      averageToPar: -0.5,
      bestPlacement: 1,
    });
  });

  it('counts birdies and eagles only on known pars, counts saved aces, and leaves unsupported streaks unavailable', () => {
    const result = profile([
      card({
        id: 'unknown-pars',
        date: null,
        pars: [3, null, 3],
        players: [player('a', 'fairway', [1, 2, 3], null, null)],
      }),
    ]);

    expect(result.statistics).toMatchObject({
      lifetimeRounds: 1,
      wins: null,
      winPercentage: null,
      averageToPar: null,
      birdies: 0,
      eagles: 1,
      knownParHoles: 2,
      unknownParHoles: 1,
      aces: 1,
      longestUnderParHoleStreak: null,
      longestCompetitionWinStreak: null,
      undatedRounds: 1,
    });
    expect(result.performance).toEqual([]);
  });

  it('leaves birdie and eagle counts unavailable when no saved hole has a known par', () => {
    const result = profile([
      card({
        id: 'all-pars-missing',
        pars: [null, null, null],
        players: [player('a', 'fairway', [2, 2, 2], '1', null)],
      }),
    ]);

    expect(result.statistics).toMatchObject({
      birdies: null,
      eagles: null,
      knownParHoles: 0,
      unknownParHoles: 3,
    });
  });

  it('orders dated rounds and resets longest under-par-hole and consecutive-win streaks', () => {
    const result = profile([
      card({
        id: 'win-4',
        date: '2026-01-04',
        players: [player('p4', 'fairway', [3, 3, 3], 'T1', 0)],
      }),
      card({
        id: 'win-2',
        date: '2026-01-02',
        players: [player('p2', 'fairway', [2, 2, 3], '1', -2)],
      }),
      card({
        id: 'loss',
        date: '2026-01-03',
        players: [player('p3', 'fairway', [3, 3, 3], '2', 0)],
      }),
      card({
        id: 'win-1',
        date: '2026-01-01',
        players: [player('p1', 'fairway', [2, 2, 3], 'T1', -2)],
      }),
    ]);

    expect(result.statistics.longestUnderParHoleStreak).toBe(2);
    expect(result.statistics.longestCompetitionWinStreak).toBe(2);
    expect(result.performance.map((point) => point.playedOn)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
  });

  it('requires comparable finalized cards for the same identified course and layout and retains tie evidence', () => {
    const result = profile([
      card({
        id: 'course-first',
        date: '2026-01-01',
        players: [
          player('a', 'fairway', [16, 17, 17], 'T1', -4),
          player('b', 'rival', [16, 17, 17], 'T1', -4),
        ],
      }),
      card({
        id: 'course-second',
        date: '2026-01-02',
        courseUrl: 'https://udisc.com/courses/north?ref=history',
        players: [player('c', 'fairway', [16, 17, 17], '1', -4)],
      }),
      card({
        id: 'different-layout',
        date: '2026-01-03',
        layoutName: 'Blue',
        players: [player('d', 'fairway', [10, 10, 10], '1', -24)],
      }),
      card({
        id: 'different-course',
        date: '2026-01-04',
        courseUrl: 'https://udisc.com/courses/south',
        players: [player('e', 'fairway', [10, 10, 10], '1', -24)],
      }),
      card({
        id: 'same-but-unfinalized',
        date: '2026-01-05',
        finalizedAt: null,
        players: [player('f', 'rival', [1, 1, 1], '1', -6)],
      }),
    ]);

    expect(result.courseRecords).toHaveLength(1);
    expect(result.courseRecords[0]).toMatchObject({
      courseName: 'North Course',
      layoutName: 'Gold',
      score: 50,
      playedOn: '2026-01-01',
      scorecardId: 'course-first',
      sourceUrl: 'https://udisc.com/scorecards/course-first',
      comparisonRounds: 2,
      tiedPlayerCount: 2,
    });
  });

  it('shows no course record when only one comparable finalized scorecard exists', () => {
    const result = profile([
      card({ id: 'one-course-card', players: [player('a', 'fairway', [3, 3, 2], '1', -1)] }),
    ]);

    expect(result.courseRecords).toEqual([]);
    expect(result.statistics.savedCourseRecords).toBe(0);
  });

  it('derives rivals only from exact identified players on shared finalized cards and exposes the basis', () => {
    const result = profile([
      card({
        id: 'shared-first',
        date: '2026-01-01',
        players: [
          player('a', '@Fairway', [3, 3, 2], '1', -1),
          player('b', 'RIVAL', [3, 3, 3], '2', 0),
          player('c', 'rivalx', [2, 2, 2], '1', -3),
          player('d', null, [1, 1, 1], '1', -6),
        ],
      }),
      card({
        id: 'shared-tie',
        date: '2026-01-02',
        players: [
          player('e', 'fairway', [3, 3, 3], 'T1', 0),
          player('f', 'rival', [3, 3, 3], 'T1', 0),
        ],
      }),
      card({
        id: 'not-finalized',
        finalizedAt: null,
        players: [
          player('g', 'fairway', [1, 1, 1], '1', -6),
          player('h', 'rival', [3, 3, 3], '2', 0),
        ],
      }),
    ]);

    expect(result.rivals).toHaveLength(2);
    expect(result.rivals[0]).toMatchObject({
      username: 'rival',
      profileHref: '/players/udisc/rival',
      sharedRounds: 2,
      wins: 1,
      ties: 1,
    });
    expect(result.rivals[0]?.sharedCards.map((shared) => shared.scorecardId)).toEqual([
      'shared-tie',
      'shared-first',
    ]);
    expect(result.rivals[1]).toMatchObject({
      username: 'rivalx',
      sharedRounds: 1,
      wins: 0,
      losses: 1,
      ties: 0,
    });
  });

  it('awards achievements only after saved criteria are met and includes their criteria', () => {
    const tenRounds = Array.from({ length: 10 }, (_, index) =>
      card({
        id: `milestone-${index + 1}`,
        date: `2026-01-${String(index + 1).padStart(2, '0')}`,
        players: [player(`p-${index + 1}`, 'fairway', [2, 3, 3], 'T1', -1)],
      }),
    );
    const first = profile(tenRounds).achievements;
    expect(first.map(({ title }) => title)).toEqual([
      'First finalized round',
      'Ten rounds played',
      'First recorded win',
    ]);
    expect(first.every((achievement) => achievement.criteria.length > 0)).toBe(true);

    const birdieMilestone = profile([
      card({
        id: 'birdie-milestone',
        date: '2026-02-01',
        pars: Array.from({ length: 25 }, () => 3),
        players: [
          player(
            'birdies',
            'fairway',
            Array.from({ length: 25 }, () => 2),
            '1',
            -25,
          ),
        ],
      }),
    ]).achievements;
    expect(birdieMilestone.some(({ id }) => id === 'twenty-five-birdies')).toBe(true);
  });

  it('returns no linked stats when the profile has no exact existing identity', () => {
    const result = profile(
      [card({ id: 'recorded-name', players: [player('a', 'fairway', [3, 3, 3], '1', 0)] })],
      { username: 'fairway', identities: [] },
    );

    expect(result.statistics).toMatchObject({
      lifetimeRounds: 0,
      wins: null,
      averageScore: null,
      birdies: null,
      eagles: null,
      aces: null,
    });
    expect(result.rivals).toEqual([]);
    expect(result.courseRecords).toEqual([]);
    expect(normalizeUDiscUsername('  @Ｆａｉｒｗａｙ_42  ')).toBe('fairway_42');
  });
});
