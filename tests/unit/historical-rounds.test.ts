import { describe, expect, it } from 'vitest';
import {
  HistoricalRoundCsvDraftSchema,
  HistoricalRoundInputSchema,
  historicalRoundDuplicateKey,
  historicalRoundItem,
} from '@/lib/contracts/round-history';

describe('historical round records', () => {
  it('continues to read existing full-hole scorecards after adding partial-hole storage', () => {
    const item = historicalRoundItem({
      id: 'legacy-stored-round',
      playedOn: new Date('2026-10-01T00:00:00.000Z'),
      courseName: 'Fixture Course',
      layoutName: 'Fixture Layout',
      score: 10,
      totalPar: 9,
      holeCount: 3,
      holePars: [3, 3, 3],
      holeParEntries: null,
      players: [
        {
          id: 'player-1',
          name: 'Import Test Player',
          holeScores: [3, 4, 3],
          totalScore: 10,
          matchedToCurrentProfile: true,
        },
        {
          id: 'player-2',
          name: 'Unmatched Cardmate',
          holeScores: [4, 4, 3],
          totalScore: 11,
          matchedToCurrentProfile: false,
        },
      ],
      sourceUrl: 'https://udisc.com/scorecards/e2e-fixture-1793403638426',
      sourceId: 'e2e-fixture-1793403638426',
      entryMethod: 'csv',
      isHistorical: true,
      isVerified: false,
      createdAt: new Date('2026-10-30T23:40:39.122Z'),
    });

    expect(item.players).toHaveLength(2);
    expect(item.holePars).toEqual([3, 3, 3]);
    expect(item.holeParEntries).toBeNull();
  });

  it('reads legacy and partial numbered player data without discarding either', () => {
    const savedAt = new Date('2026-06-02T12:00:00.000Z');
    const item = historicalRoundItem({
      id: 'stored-round',
      playedOn: new Date('2026-06-01T00:00:00.000Z'),
      courseName: 'Sample course',
      layoutName: 'Sample layout',
      score: 12,
      totalPar: 12,
      holeCount: 4,
      holePars: null,
      holeParEntries: [
        { holeNumber: 1, par: 3 },
        { holeNumber: 3, par: 3 },
      ],
      players: [
        {
          id: 'player-1',
          name: 'Partial player',
          matchedToCurrentProfile: true,
          sourcePlayerId: 'source-player-1',
          pdgaNumber: '123456',
          holeScoreEntries: [
            { holeNumber: 1, score: 3 },
            { holeNumber: 3, score: 4 },
          ],
          totalScore: 12,
        },
        { id: 'player-2', name: 'Legacy player', matchedToCurrentProfile: false, totalScore: 13 },
      ],
      sourceUrl: 'https://udisc.com/scorecards/N78XJtdFmZ',
      sourceId: 'N78XJtdFmZ',
      entryMethod: 'csv',
      isHistorical: true,
      isVerified: false,
      createdAt: savedAt,
    });

    expect(item.holeParEntries).toEqual([
      { holeNumber: 1, par: 3 },
      { holeNumber: 3, par: 3 },
    ]);
    expect(item.players).toEqual([
      {
        id: 'player-1',
        name: 'Partial player',
        matchedToCurrentProfile: true,
        sourcePlayerId: 'source-player-1',
        pdgaNumber: '123456',
        holeScores: null,
        holeScoreEntries: [
          { holeNumber: 1, score: 3 },
          { holeNumber: 3, score: 4 },
        ],
        totalScore: 12,
      },
      {
        id: 'player-2',
        name: 'Legacy player',
        matchedToCurrentProfile: false,
        sourcePlayerId: null,
        pdgaNumber: null,
        holeScores: null,
        holeScoreEntries: null,
        totalScore: 13,
      },
    ]);
  });

  it('matches duplicate course, date, layout, and score despite case and whitespace differences', () => {
    const first = HistoricalRoundInputSchema.parse({
      playedOn: '2026-06-12',
      courseName: '  Cedar   Ridge ',
      layoutName: 'Gold Layout',
      score: 58,
    });
    const repeated = HistoricalRoundInputSchema.parse({
      playedOn: '2026-06-12',
      courseName: 'cedar ridge',
      layoutName: ' gold   layout ',
      score: 58,
    });

    expect(historicalRoundDuplicateKey(first)).toBe(historicalRoundDuplicateKey(repeated));
  });

  it('keeps records distinct when a round detail that identifies the attempt changes', () => {
    const first = HistoricalRoundInputSchema.parse({
      playedOn: '2026-06-12',
      courseName: 'Cedar Ridge',
      layoutName: 'Gold',
      score: 58,
    });
    const secondRound = { ...first, score: 59 };
    const otherLayout = { ...first, layoutName: 'Blue' };

    expect(historicalRoundDuplicateKey(first)).not.toBe(historicalRoundDuplicateKey(secondRound));
    expect(historicalRoundDuplicateKey(first)).not.toBe(historicalRoundDuplicateKey(otherLayout));
  });

  it('keeps optional details absent and rejects an entirely empty scorecard', () => {
    const partial = HistoricalRoundInputSchema.parse({
      playedOn: '2026-06-12',
      courseName: 'Cedar Ridge',
      score: 58,
    });

    expect(partial).not.toHaveProperty('layoutName');
    expect(partial).not.toHaveProperty('totalPar');
    expect(HistoricalRoundInputSchema.safeParse({}).success).toBe(false);
  });

  it('uses a stable CardCast source ID as the duplicate key even if entered details differ', () => {
    const first = HistoricalRoundInputSchema.parse({
      sourceUrl: 'https://udisc.com/scorecards/N78XJtdFmZ',
      playedOn: '2026-03-22',
      courseName: 'Red Tail Ridge',
      layoutName: 'Blue',
    });
    const repeated = HistoricalRoundInputSchema.parse({
      sourceUrl: 'https://udisc.com/scorecards/N78XJtdFmZ',
      courseName: 'Corrected course name',
      players: [{ name: 'Unmatched player', holeScores: [3, 4, 3] }],
    });

    expect(historicalRoundDuplicateKey(first)).toBe(historicalRoundDuplicateKey(repeated));
  });

  it('keeps both supplied UDisc IDs stable across retries with changed import details', () => {
    const sampleUrls = [
      'https://udisc.com/scorecards/scorecard_mns8y9vb4afhk4v7lafcmk8n',
      'https://udisc.com/scorecards/N78XJtdFmZ',
    ];

    for (const sourceUrl of sampleUrls) {
      const first = HistoricalRoundInputSchema.parse({ sourceUrl, courseName: 'Sample course' });
      const retry = HistoricalRoundInputSchema.parse({
        sourceUrl,
        courseName: 'Changed details on retry',
        players: [{ name: 'Retried Player', totalScore: 58 }],
      });
      expect(historicalRoundDuplicateKey(first)).toBe(historicalRoundDuplicateKey(retry));
    }
  });

  it('deduplicates exported source IDs even when the export does not contain a share URL', () => {
    const first = HistoricalRoundInputSchema.parse({
      entryMethod: 'csv',
      sourceId: 'exported-card-1',
      sourceFileKey: 'synthetic-test-file-key',
      sourceFileUrl: 'https://example.test/synthetic-export.csv',
      courseName: 'Sample Course',
      players: [{ name: 'Sample Player', totalScore: 54 }],
    });
    const retry = HistoricalRoundInputSchema.parse({
      entryMethod: 'csv',
      sourceId: 'exported-card-1',
      sourceFileKey: 'another-synthetic-file-key',
      sourceFileUrl: 'https://example.test/retry.csv',
      courseName: 'Edited details on retry',
      players: [{ name: 'Different draft', totalScore: 60 }],
    });

    expect(historicalRoundDuplicateKey(first)).toBe(historicalRoundDuplicateKey(retry));
    expect(first.sourceUrl).toBeUndefined();
    expect(first.sourceId).toBe('exported-card-1');
  });

  it('requires an attached file for a confirmed CSV record and keeps URL/source IDs consistent', () => {
    const base = {
      entryMethod: 'csv' as const,
      sourceId: 'test-card-a',
      courseName: 'Sample Course',
      players: [{ name: 'Sample Player', totalScore: 54 }],
    };
    expect(HistoricalRoundInputSchema.safeParse(base).success).toBe(false);
    expect(
      HistoricalRoundInputSchema.safeParse({
        ...base,
        sourceUrl: 'https://udisc.com/scorecards/test-card-b',
        sourceFileKey: 'synthetic-test-file-key',
        sourceFileUrl: 'https://example.test/synthetic-export.csv',
      }).success,
    ).toBe(false);
    expect(
      HistoricalRoundInputSchema.safeParse({
        ...base,
        sourceFileKey: 'synthetic-test-file-key',
        sourceFileUrl: 'https://example.test/synthetic-export.csv',
      }).success,
    ).toBe(true);
  });

  it('accepts normalized CSV commit rows with an attachment and rejects scoreless drafts before confirmation', () => {
    const draft = {
      sourceId: 'exported-card-1',
      courseName: 'Sample Course',
      players: [{ name: 'Sample Player', totalScore: 54 }],
    };

    expect(HistoricalRoundCsvDraftSchema.safeParse(draft).success).toBe(true);
    expect(
      HistoricalRoundCsvDraftSchema.safeParse({
        ...draft,
        entryMethod: 'csv',
        sourceFileKey: 'synthetic-test-file-key',
        sourceFileUrl: 'https://example.test/synthetic-export.csv',
      }).success,
    ).toBe(true);
    expect(
      HistoricalRoundCsvDraftSchema.safeParse({
        courseName: 'Sample Course',
        players: [{ name: 'Sample Player' }],
      }).success,
    ).toBe(false);
    expect(
      HistoricalRoundCsvDraftSchema.safeParse({
        ...draft,
        entryMethod: 'csv',
      }).success,
    ).toBe(false);
  });

  it('keeps entered hole scores, pars, and names editable while rejecting inconsistent totals', () => {
    const valid = HistoricalRoundInputSchema.parse({
      playedOn: '2026-03-22',
      courseName: 'Red Tail Ridge',
      layoutName: 'Blue',
      holeCount: 3,
      holePars: [3, 4, 3],
      totalPar: 10,
      players: [{ name: 'Player entered by user', holeScores: [3, 4, 3], totalScore: 10 }],
    });
    expect(valid.players?.[0]?.holeScores).toEqual([3, 4, 3]);
    expect(valid.players?.[0]?.name).toBe('Player entered by user');

    expect(
      HistoricalRoundInputSchema.safeParse({
        ...valid,
        players: [{ name: 'Player entered by user', holeScores: [3, 4, 3], totalScore: 11 }],
      }).success,
    ).toBe(false);
    expect(HistoricalRoundInputSchema.safeParse({ ...valid, holeCount: 18 }).success).toBe(false);
  });

  it('accepts valid 18-hole totals above 99 and checks the linked player against the round score', () => {
    const round = {
      holeCount: 18,
      score: 105,
      players: [{ name: 'Current player', totalScore: 105, matchedToCurrentProfile: true }],
    };

    expect(HistoricalRoundInputSchema.safeParse(round).success).toBe(true);
    expect(HistoricalRoundInputSchema.safeParse({ ...round, score: 106 }).success).toBe(false);
  });

  it('allows unknown facts to remain absent but does not save a link with no scorecard details', () => {
    expect(
      HistoricalRoundInputSchema.safeParse({
        sourceUrl: 'https://udisc.com/scorecards/N78XJtdFmZ',
        courseName: 'Red Tail Ridge',
      }).success,
    ).toBe(true);
    expect(
      HistoricalRoundInputSchema.safeParse({
        sourceUrl: 'https://udisc.com/scorecards/N78XJtdFmZ',
      }).success,
    ).toBe(false);
  });
});
