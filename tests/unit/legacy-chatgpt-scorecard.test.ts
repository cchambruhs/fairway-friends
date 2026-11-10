// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  convertLegacyChatGptRound,
  type LegacyChatGptRound,
  legacyCourseUrl,
  legacyRoundsFrom,
} from '@/lib/business/legacy-chatgpt-scorecard';

const seed = JSON.parse(readFileSync(join(process.cwd(), 'data/legacy-chatgpt/seed.json'), 'utf8'));
const rounds = legacyRoundsFrom(seed);

describe('legacy ChatGPT scorecard conversion', () => {
  it('converts every bundled seed card with the live importer validation', () => {
    expect(rounds).toHaveLength(22);
    const failures = rounds.map(convertLegacyChatGptRound).filter((result) => !result.ok);
    expect(failures).toEqual([]);
  });

  it('reproduces the PRD Angel Mounds reference card exactly', () => {
    const round = rounds.find((item) => item.id === 'scorecard_mns8y9vb4afhk4v7lafcmk8n');
    expect(round).toBeDefined();
    const result = convertLegacyChatGptRound(round as LegacyChatGptRound);
    if (!result.ok) throw new Error(result.reason);
    const { card } = result;
    expect(card.courseName).toBe('Angel Mounds Disc Golf Course');
    expect(card.layoutName).toBe('Blue Tees');
    expect(card.playedOn).toBe('2026-10-20');
    expect(card.holeCount).toBe(18);
    expect(card.totalPar).toBe(55);
    expect(
      card.players.map((player) => [player.username, player.totalScore, player.toPar]),
    ).toEqual([
      ['devin47', 45, -10],
      ['cchambruhs', 46, -9],
      ['mdub1807', 50, -5],
      ['rashad032', 51, -4],
      ['mk3492', 53, -2],
    ]);
  });

  it('never invents a location or finishing position', () => {
    const result = convertLegacyChatGptRound(rounds[0] as LegacyChatGptRound);
    if (!result.ok) throw new Error(result.reason);
    expect(result.card.location).toBeNull();
    expect(result.card.players.every((player) => player.position === null)).toBe(true);
  });

  it('keeps unfinished rounds as did-not-finish with missing holes empty', () => {
    const base = rounds[0] as LegacyChatGptRound;
    const pars = base.pars;
    const scores = pars.map((par, index) => (index < 12 ? (par ?? 3) : null));
    const total = scores.reduce<number>((sum, score) => sum + (score ?? 0), 0);
    const playedPar = pars.slice(0, 12).reduce<number>((sum, par) => sum + (par ?? 0), 0);
    const result = convertLegacyChatGptRound({
      ...base,
      players: [
        {
          username: 'example',
          name: 'Example',
          scores,
          total,
          relative: total - playedPar,
          complete: false,
          holesPlayed: 12,
        },
      ],
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.card.players[0]?.didNotFinish).toBe(true);
    expect(result.card.players[0]?.holesPlayed).toBe(12);
  });

  it('rejects a card whose totals do not add up instead of saving it', () => {
    const base = rounds[0] as LegacyChatGptRound;
    const first = base.players[0];
    if (!first) throw new Error('fixture has no players');
    const result = convertLegacyChatGptRound({
      ...base,
      players: [{ ...first, total: first.total + 1 }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-UDisc link', () => {
    const base = rounds[0] as LegacyChatGptRound;
    const result = convertLegacyChatGptRound({ ...base, url: 'https://example.com/scorecards/x' });
    expect(result.ok).toBe(false);
  });

  it('derives the course page only from the source layout path', () => {
    expect(
      legacyCourseUrl('/courses/angel-mounds-disc-golf-course-dJv8/layouts/58398/caddie-book'),
    ).toBe('https://udisc.com/courses/angel-mounds-disc-golf-course-dJv8');
    expect(legacyCourseUrl(null)).toBeNull();
    expect(legacyCourseUrl('https://evil.example/courses/x')).toBeNull();
  });
});
