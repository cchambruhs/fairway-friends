import { describe, expect, it } from 'vitest';
import { matchCurrentProfilePlayer } from '@/lib/business/round-history-player-match';
import {
  parseUDiscScorecardCsv,
  parseUDiscScorecardsCsv,
} from '@/lib/business/udisc-scorecard-csv';

const sourceUrl = 'https://udisc.com/scorecards/test-scorecard-1';

describe('authorized UDisc scorecard CSV parsing', () => {
  it('parses supplied totals and holes without deriving an absent total par', () => {
    const csv = [
      'Date,Course,Layout,Scorecard ID,Player,Total Score,Par 1,Par 2,Par 3,Hole 1 Score,Hole 2 Score,Hole 3 Score',
      '2026-06-01,Sample Course,Blue,test-scorecard-1,Alex Player,10,3,3,3,3,4,3',
      '2026-06-01,Sample Course,Blue,test-scorecard-1,Jamie Player,11,3,3,3,4,4,3',
    ].join('\n');

    const result = parseUDiscScorecardCsv(csv, sourceUrl);
    expect(result).toMatchObject({
      playedOn: '2026-06-01',
      courseName: 'Sample Course',
      layoutName: 'Blue',
      holeCount: 3,
      holePars: [3, 3, 3],
      sourceUrl,
      players: [
        { name: 'Alex Player', totalScore: 10, holeScores: [3, 4, 3] },
        { name: 'Jamie Player', totalScore: 11, holeScores: [4, 4, 3] },
      ],
    });
    expect(result).not.toHaveProperty('totalPar');
  });

  it('preserves source player IDs and PDGA numbers supplied by the export', () => {
    const csv = [
      'Date,Course,Scorecard ID,Player ID,PDGA #,Player,Total Score',
      '2026-06-01,Sample Course,test-scorecard-1,udisc-player-42,123456,Alex Player,58',
    ].join('\n');

    const imported = parseUDiscScorecardCsv(csv, sourceUrl).players;
    expect(imported).toHaveLength(1);
    expect(imported?.[0]).toMatchObject({
      name: 'Alex Player',
      sourcePlayerId: 'udisc-player-42',
      pdgaNumber: '123456',
      totalScore: 58,
      matchedToCurrentProfile: false,
    });
    expect(imported?.[0]?.id).toMatch(/^player-/u);
  });

  it('parses semicolon delimited long-form scores and selects the matching source ID', () => {
    const csv = [
      'Date;Course;Layout;Scorecard ID;Player;Hole Number;Hole Score;Hole Par',
      '2026-06-02;Sample Course;Red;test-scorecard-1;Alex Player;1;3;3',
      '2026-06-02;Sample Course;Red;test-scorecard-1;Alex Player;2;4;3',
      '2026-06-02;Sample Course;Red;test-scorecard-1;Jamie Player;1;4;3',
      '2026-06-02;Sample Course;Red;test-scorecard-1;Jamie Player;2;3;3',
      '2026-06-03;Other Course;Blue;other-card;Other Player;1;5;3',
    ].join('\n');

    const result = parseUDiscScorecardCsv(csv, sourceUrl);
    expect(result.playedOn).toBe('2026-06-02');
    expect(result.players).toEqual([
      expect.objectContaining({
        name: 'Alex Player',
        holeScores: [3, 4],
        matchedToCurrentProfile: false,
      }),
      expect.objectContaining({
        name: 'Jamie Player',
        holeScores: [4, 3],
        matchedToCurrentProfile: false,
      }),
    ]);
    expect(result.players?.map((player) => player.totalScore)).toEqual([undefined, undefined]);
    expect(result.holePars).toEqual([3, 3]);
  });

  it('preserves partial numbered scores and pars without filling missing holes', () => {
    const csv = [
      'Date,Course,Scorecard ID,Player,Hole Count,Hole Number,Hole Score,Hole Par,Total Score,Total Par',
      '2026-06-02,Sample Course,test-scorecard-1,Alex Player,4,1,3,3,12,12',
      '2026-06-02,Sample Course,test-scorecard-1,Alex Player,4,3,4,3,12,12',
    ].join('\n');

    const result = parseUDiscScorecardCsv(csv, sourceUrl);
    expect(result).toMatchObject({
      holeCount: 4,
      totalPar: 12,
      holeParEntries: [
        { holeNumber: 1, par: 3 },
        { holeNumber: 3, par: 3 },
      ],
      players: [
        {
          name: 'Alex Player',
          totalScore: 12,
          holeScoreEntries: [
            { holeNumber: 1, score: 3 },
            { holeNumber: 3, score: 4 },
          ],
        },
      ],
    });
    expect(result).not.toHaveProperty('holePars');
    expect(result.players?.[0]).not.toHaveProperty('holeScores');
  });

  it('rejects numbered entries outside a declared hole count', () => {
    expect(() =>
      parseUDiscScorecardCsv(
        [
          'Date,Course,Scorecard ID,Player,Hole Count,Hole Number,Hole Score',
          '2026-06-02,Sample Course,test-scorecard-1,Alex Player,3,4,4',
        ].join('\n'),
        sourceUrl,
      ),
    ).toThrow(/greater than the declared hole count/u);
  });

  it('accepts a total-only export and leaves unavailable hole details absent', () => {
    const result = parseUDiscScorecardCsv(
      'Date,Course,Player,Total Score\n2026-06-04,Sample Course,Alex Player,58',
      sourceUrl,
    );

    expect(result.players?.[0]).toMatchObject({
      name: 'Alex Player',
      totalScore: 58,
      matchedToCurrentProfile: false,
    });
    expect(result).not.toHaveProperty('holePars');
    expect(result).not.toHaveProperty('holeCount');
  });

  it('parses the UDisc wide scorecard export shape and keeps absent pars blank', () => {
    const csv = [
      'Date,Course,Layout,Scorecard ID,Player,To Par,Score,1,2,3,Round Name,Event,Start Time',
      '2026-06-05,Sample Course,Blue,bulk-card-a,Alex Player,-1,8,3,2,3,Friday round,Weekly league,2026-06-05 09:15',
    ].join('\n');

    const result = parseUDiscScorecardsCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sourceId: 'bulk-card-a',
      playedOn: '2026-06-05',
      courseName: 'Sample Course',
      layoutName: 'Blue',
      holeCount: 3,
      players: [{ name: 'Alex Player', totalScore: 8, holeScores: [3, 2, 3] }],
      roundMetadata: {
        round_name: 'Friday round',
        event_name: 'Weekly league',
        started_at: '2026-06-05 09:15',
      },
    });
    expect(result[0]).not.toHaveProperty('holePars');
  });

  it('parses the published UDisc scorecard export headers and treats its Par row as pars', () => {
    const csv = [
      'PlayerName,CourseName,LayoutName,Date,Total,+/-,Hole1,Hole2,Hole3',
      'Par,Sample Course,Blue,2024-03-15 1014,9,,3,3,3',
      'Sample Player,Sample Course,Blue,2024-03-15 1014,10,1,3,4,3',
    ].join('\n');

    const imported = parseUDiscScorecardCsv(csv, sourceUrl);
    expect(imported).toMatchObject({
      playedOn: '2024-03-15',
      courseName: 'Sample Course',
      layoutName: 'Blue',
      holeCount: 3,
      holePars: [3, 3, 3],
      sourceId: 'test-scorecard-1',
      sourceUrl,
      roundMetadata: { source_date: '2024-03-15 1014' },
      players: [{ name: 'Sample Player', totalScore: 10, holeScores: [3, 4, 3] }],
    });
    expect(imported).not.toHaveProperty('totalPar');
    expect(imported.players).toHaveLength(1);
  });

  it('previews multiple cards separately by their exported IDs and exact URLs', () => {
    const csv = [
      'Date,Course,Layout,Scorecard ID,CardCast URL,Player,Total Score,Par 1,Par 2,Hole 1 Score,Hole 2 Score',
      '2026-06-06,Sample Course,Blue,bulk-card-a,https://udisc.com/scorecards/bulk-card-a,Alex Player,7,3,3,3,4',
      '2026-06-06,Sample Course,Red,bulk-card-b,https://udisc.com/scorecards/bulk-card-b,Jamie Player,8,4,3,4,4',
    ].join('\n');

    const result = parseUDiscScorecardsCsv(csv);
    expect(result).toHaveLength(2);
    expect(result.map((round) => [round.sourceId, round.sourceUrl])).toEqual([
      ['bulk-card-a', 'https://udisc.com/scorecards/bulk-card-a'],
      ['bulk-card-b', 'https://udisc.com/scorecards/bulk-card-b'],
    ]);
    expect(result[0]?.players?.[0]?.totalScore).toBe(7);
    expect(result[1]?.players?.[0]?.totalScore).toBe(8);
  });

  it('keeps an exact UDisc URL when it occupies the export source-ID column', () => {
    const originalUrl = 'https://udisc.com/scorecards/bulk-card-a';
    const csv = [
      'Date,Course,Scorecard ID,Player,Total Score,Hole 1 Score',
      `2026-06-06,Sample Course,${originalUrl},Alex Player,7,7`,
    ].join('\n');

    expect(parseUDiscScorecardsCsv(csv)).toMatchObject([
      { sourceId: 'bulk-card-a', sourceUrl: originalUrl },
    ]);
  });

  it('selects only the matching source ID when a one-card link accompanies a bulk export', () => {
    const csv = [
      'Date,Course,Scorecard ID,Player,Total Score',
      '2026-06-06,Sample Course,bulk-card-a,Alex Player,51',
      '2026-06-07,Another Course,bulk-card-b,Jamie Player,52',
    ].join('\n');

    const selected = parseUDiscScorecardsCsv(csv, 'https://udisc.com/scorecards/bulk-card-a');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ sourceId: 'bulk-card-a', courseName: 'Sample Course' });
  });

  it('keeps bulk rounds separate by the source date value without inventing source IDs or URLs', () => {
    const csv = [
      'PlayerName,CourseName,LayoutName,Date,Total,+/-,Hole1,Hole2,Hole3',
      'Par,Sample Course,Blue,2026-06-06 1014,9,,3,3,3',
      'First Round Player,Sample Course,Blue,2026-06-06 1014,10,1,3,4,3',
      'Par,Sample Course,Blue,2026-06-06 1330,9,,3,3,3',
      'Second Round Player,Sample Course,Blue,2026-06-06 1330,11,2,4,4,3',
    ].join('\n');

    const rounds = parseUDiscScorecardsCsv(csv);
    expect(rounds).toHaveLength(2);
    expect(
      rounds.map((round) => [round.sourceId, round.sourceUrl, round.roundMetadata?.source_date]),
    ).toEqual([
      [undefined, undefined, '2026-06-06 1014'],
      [undefined, undefined, '2026-06-06 1330'],
    ]);
    expect(rounds.map((round) => round.players?.[0]?.name)).toEqual([
      'First Round Player',
      'Second Round Player',
    ]);
  });

  it('splits same-course, same-date bulk cards at repeated par rows instead of merging players', () => {
    const csv = [
      'PlayerName,CourseName,LayoutName,Date,Total,+/-,Hole1,Hole2,Hole3',
      'Par,Sample Course,Blue,2026-06-06,9,,3,3,3',
      'First Card Player,Sample Course,Blue,2026-06-06,10,1,3,4,3',
      'Par,Sample Course,Blue,2026-06-06,9,,3,3,3',
      'Second Card Player,Sample Course,Blue,2026-06-06,11,2,4,4,3',
    ].join('\n');

    const rounds = parseUDiscScorecardsCsv(csv);
    expect(rounds).toHaveLength(2);
    expect(rounds.map((round) => round.players?.[0]?.name)).toEqual([
      'First Card Player',
      'Second Card Player',
    ]);
    expect(rounds.every((round) => !round.sourceId && !round.sourceUrl)).toBe(true);
  });

  it('rejects mismatched CardCast IDs, inconsistent totals, incomplete scores, and multiple unlinked rounds', () => {
    expect(() =>
      parseUDiscScorecardCsv(
        'Date,Course,Scorecard ID,Player,Total Score\n2026-06-01,Sample Course,other-card,Alex,50',
        sourceUrl,
      ),
    ).toThrow(/does not match/u);

    expect(() =>
      parseUDiscScorecardCsv(
        [
          'Date,Course,Player,Total Score,Hole 1 Score,Hole 2 Score',
          '2026-06-01,Sample Course,Alex Player,10,3,4',
        ].join('\n'),
        sourceUrl,
      ),
    ).toThrow(/does not match/u);

    expect(() =>
      parseUDiscScorecardCsv('Date,Course,Player\n2026-06-01,Sample Course,Alex Player', sourceUrl),
    ).toThrow(/no total or hole-by-hole scores/u);

    expect(() =>
      parseUDiscScorecardCsv(
        [
          'Date,Course,Player,Total Score',
          '2026-06-01,Sample Course,Alex Player,50',
          '2026-06-02,Another Course,Jamie Player,52',
        ].join('\n'),
        sourceUrl,
      ),
    ).toThrow(/multiple scorecards/u);
  });
});

describe('current profile player matching', () => {
  it('does not guess from a display-name match and honors an explicit selection', () => {
    const players = [
      { name: 'Alex Player', totalScore: 58, matchedToCurrentProfile: false },
      { name: 'Jamie Player', totalScore: 61, matchedToCurrentProfile: false },
    ];
    const result = matchCurrentProfilePlayer(players, 'Alex Player');

    expect(result.score).toBeUndefined();
    expect(result.players.map((player) => player.matchedToCurrentProfile)).toEqual([false, false]);
    expect(
      matchCurrentProfilePlayer(
        [{ name: 'Alex Player', totalScore: 58, matchedToCurrentProfile: true }],
        'Different profile name',
      ),
    ).toMatchObject({ score: 58, players: [{ matchedToCurrentProfile: true }] });
  });

  it('leaves non-matching or ambiguous names unlinked', () => {
    const players = [
      { name: 'Alex Player', totalScore: 58, matchedToCurrentProfile: false },
      { name: 'Alex Player', totalScore: 59, matchedToCurrentProfile: false },
    ];

    expect(matchCurrentProfilePlayer(players, 'Different Name')).toMatchObject({
      players: [{ matchedToCurrentProfile: false }, { matchedToCurrentProfile: false }],
    });
    expect(matchCurrentProfilePlayer(players, 'Alex Player')).toMatchObject({
      players: [{ matchedToCurrentProfile: false }, { matchedToCurrentProfile: false }],
    });
  });

  it('uses an exact PDGA number when available and leaves conflicting identity data unlinked', () => {
    const sourcePlayers = [
      {
        name: 'CardCast Alias',
        pdgaNumber: '123-456',
        totalScore: 58,
        matchedToCurrentProfile: false,
      },
    ];

    expect(matchCurrentProfilePlayer(sourcePlayers, 'Different Name', '123456')).toMatchObject({
      score: 58,
      players: [{ matchedToCurrentProfile: true }],
    });
    expect(matchCurrentProfilePlayer(sourcePlayers, 'CardCast Alias', '654321')).toMatchObject({
      players: [{ matchedToCurrentProfile: false }],
    });
  });
});
