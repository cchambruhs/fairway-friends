import { describe, expect, it } from 'vitest';
import {
  accumulateLeaguePoints,
  awardLeaguePoints,
  compareLeagueStandings,
  fieldSizePointsForPlace,
  fixedPointsForPlace,
  sharedStandingRanks,
} from '@/lib/business/league-scoring';

const field = (...strokes: number[]) =>
  strokes.map((totalStrokes, index) => ({
    playerKey: String.fromCharCode(97 + index),
    totalStrokes,
  }));

describe('PRD v4 fixed placement points', () => {
  it('awards 25, 20, 16, 13, 11, 10, 9, 8, 7, 6 for places 1–10', () => {
    const awards = awardLeaguePoints(field(50, 51, 52, 53, 54, 55, 56, 57, 58, 59), 'FIXED');
    expect(awards.map((award) => award.points)).toEqual([25, 20, 16, 13, 11, 10, 9, 8, 7, 6]);
  });

  it('drops one point per place from 11th with a minimum of 1', () => {
    expect(fixedPointsForPlace(11, [25, 20, 16, 13, 11, 10, 9, 8, 7, 6])).toBe(5);
    expect(fixedPointsForPlace(15, [25, 20, 16, 13, 11, 10, 9, 8, 7, 6])).toBe(1);
    expect(fixedPointsForPlace(40, [25, 20, 16, 13, 11, 10, 9, 8, 7, 6])).toBe(1);
  });

  it('averages the points of every occupied place for a tie, rounded to two decimals', () => {
    expect(awardLeaguePoints(field(50, 50, 55), 'FIXED')).toEqual([
      { playerKey: 'a', place: 1, points: 22.5 },
      { playerKey: 'b', place: 1, points: 22.5 },
      { playerKey: 'c', place: 3, points: 16 },
    ]);
    // 2nd–4th tied: (20 + 16 + 13) / 3 = 16.333… → 16.33
    expect(awardLeaguePoints(field(48, 50, 50, 50), 'FIXED').map((a) => a.points)).toEqual([
      25, 16.33, 16.33, 16.33,
    ]);
  });

  it('gives a one-player round first-place points', () => {
    expect(awardLeaguePoints(field(54), 'FIXED')).toEqual([
      { playerKey: 'a', place: 1, points: 25 },
    ]);
  });
});

describe('PRD v4 field-size adjusted points', () => {
  it('uses 25 × (N − P) / (N − 1)', () => {
    expect(awardLeaguePoints(field(50, 52, 54, 56, 58), 'FIELD_SIZE').map((a) => a.points)).toEqual(
      [25, 18.75, 12.5, 6.25, 0],
    );
  });

  it('gives a lone finisher 25 and last place 0 when N > 1', () => {
    expect(fieldSizePointsForPlace(1, 1)).toBe(25);
    expect(fieldSizePointsForPlace(2, 2)).toBe(0);
  });

  it('averages tied places', () => {
    // N = 4; places 1 and 2 tied → (25 + 16.666…) / 2 = 20.83
    expect(awardLeaguePoints(field(50, 50, 55, 58), 'FIELD_SIZE')).toEqual([
      { playerKey: 'a', place: 1, points: 20.83 },
      { playerKey: 'b', place: 1, points: 20.83 },
      { playerKey: 'c', place: 3, points: 8.33 },
      { playerKey: 'd', place: 4, points: 0 },
    ]);
  });
});

describe('Season totals and tie-breaks', () => {
  it('sums every finalized round with no points for a missed round', () => {
    const totals = accumulateLeaguePoints(
      ['played', 'missed'],
      [
        awardLeaguePoints([{ playerKey: 'played', totalStrokes: 50 }], 'FIXED'),
        awardLeaguePoints([{ playerKey: 'played', totalStrokes: 52 }], 'FIXED'),
      ],
    );
    expect(totals.get('played')).toBe(50);
    expect(totals.get('missed')).toBe(0);
  });

  it('breaks equal points by wins, then second places, then average placement', () => {
    const base = { points: 40, wins: 1, seconds: 0, averagePlace: 2 };
    expect(compareLeagueStandings({ ...base, wins: 2 }, base)).toBeLessThan(0);
    expect(compareLeagueStandings({ ...base, seconds: 1 }, base)).toBeLessThan(0);
    expect(compareLeagueStandings({ ...base, averagePlace: 1.5 }, base)).toBeLessThan(0);
    expect(compareLeagueStandings(base, { ...base })).toBe(0);
  });

  it('shares a standing when every tie-break is equal', () => {
    const tied = { points: 40, wins: 1, seconds: 1, averagePlace: 2 };
    const sorted = [{ ...tied, points: 50 }, tied, { ...tied }, { ...tied, points: 10 }];
    expect(sharedStandingRanks(sorted)).toEqual([1, 2, 2, 4]);
  });
});
