import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importedScorecardFingerprint } from '@/lib/business/imported-scorecard';
import { parseUDiscScorecardHtml } from '@/lib/business/udisc-scorecard-parser';
import { HistoricalRoundInputSchema, historicalRoundSourceId } from '@/lib/contracts/round-history';
import { UDiscScorecardLinkSchema, udiscScorecardId } from '@/lib/contracts/scorecard-import';

interface ScorecardFixturePlayer {
  username: string;
  displayName: string;
  position: string;
  toPar: number;
  totalScore: number;
  holeScores: number[];
}

interface ScorecardFixture {
  scorecardId: string;
  sourceUrl: string;
  courseName: string;
  courseUrl: string;
  layoutName: string;
  playedOn: string;
  location: string;
  holeCount: number;
  pars: number[];
  totalPar: number;
  players: ScorecardFixturePlayer[];
}

const scorecardFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/udisc-scorecard.json'), 'utf8'),
) as ScorecardFixture;

function scorecardHtml(
  dateLabel = 'Mar 22, 2026',
  blankedHolesByPlayer: Readonly<Record<number, readonly number[]>> = {},
): string {
  const holeHeaders = scorecardFixture.pars
    .map(
      (par, index) =>
        `<th><div><div class="text-xxs font-bold">${index + 1}</div><div class="text-xxs font-normal">${par}</div></div></th>`,
    )
    .join('');
  const totalHeader = `<th><div><div>Total</div><div>57</div></div></th>`;
  const playerRows = scorecardFixture.players
    .map((player, playerIndex) => {
      const handle = player.username;
      const blankedHoles = new Set(blankedHolesByPlayer[playerIndex] ?? []);
      const scores = player.holeScores
        .map((score, holeIndex) =>
          blankedHoles.has(holeIndex + 1)
            ? '<td><div></div></td>'
            : `<td><div><span>${score}</span></div></td>`,
        )
        .join('');
      return `<tr><td>${player.position}</td><td><button><div><div class="truncate text-medium-strong text-text">${player.displayName}</div><div class="truncate text-medium text-subtle">@<!-- -->${handle}</div></div></button></td>${scores}<td><div><div>+${player.toPar}</div><div>(<!-- -->${player.totalScore}<!-- -->)</div></div></td></tr>`;
    })
    .join('');
  return `<title>UDisc Scorecard</title><a href="/courses/red-tail-ridge-9PTX"><h1>Red Tail Ridge</h1></a><a href="/courses/red-tail-ridge-9PTX/layouts/21955/caddie-book">Blue</a><span>${dateLabel} 12:08 PM</span><svg data-icon="location-dot"></svg><a href="/places/us/indiana/fort-branch-in">Fort Branch, Indiana</a><p>Weather is not part of this import.</p><table><thead><tr><th>Name</th>${holeHeaders}${totalHeader}</tr></thead><tbody>${playerRows}</tbody></table>`;
}

const ownerSuppliedUrls = [
  'https://udisc.com/scorecards/scorecard_mns8y9vb4afhk4v7lafcmk8n',
  'https://udisc.com/scorecards/N78XJtdFmZ',
  'https://udisc.com/scorecards/Q3PDBwEOAv',
  'https://udisc.com/scorecards/1dXXNZvwDG',
];

describe('UDisc CardCast source references', () => {
  it('accepts all four supplied scorecard URLs and preserves their exact IDs', () => {
    for (const sourceUrl of ownerSuppliedUrls) {
      expect(UDiscScorecardLinkSchema.parse(sourceUrl)).toBe(sourceUrl);
      expect(udiscScorecardId(sourceUrl)).toBe(
        sourceUrl.slice('https://udisc.com/scorecards/'.length),
      );
    }
  });

  it('rejects altered hosts, paths, queries, and non-HTTPS links', () => {
    for (const sourceUrl of [
      'http://udisc.com/scorecards/N78XJtdFmZ',
      'https://example.com/scorecards/N78XJtdFmZ',
      'https://udisc.com/scorecards/N78XJtdFmZ?share=1',
      'https://udisc.com/scorecards/',
    ]) {
      expect(UDiscScorecardLinkSchema.safeParse(sourceUrl).success).toBe(false);
    }
  });
});

describe('owner-supplied N78XJtdFmZ structured card', () => {
  const sourceUrl = 'https://udisc.com/scorecards/N78XJtdFmZ';
  const actualCard = {
    playedOn: '2026-03-22',
    courseName: 'Red Tail Ridge',
    layoutName: 'Blue',
    holeCount: 18,
    totalPar: 57,
    sourceUrl,
    roundMetadata: { location: 'Fort Branch, Indiana', played_time: '12:08 PM' },
    entryMethod: 'json' as const,
    players: [
      {
        name: 'Dad',
        holeScores: [3, 3, 3, 3, 3, 2, 4, 3, 4, 3, 5, 4, 4, 3, 3, 3, 3, 3],
        totalScore: 59,
      },
      {
        name: 'Mdub1807',
        holeScores: [2, 3, 3, 3, 3, 3, 3, 4, 4, 3, 5, 3, 4, 4, 3, 3, 3, 3],
        totalScore: 59,
      },
      {
        name: 'Connor',
        holeScores: [4, 4, 4, 3, 4, 3, 3, 3, 3, 3, 4, 5, 3, 2, 2, 3, 4, 3],
        totalScore: 60,
      },
      {
        name: 'Z-Dub',
        holeScores: [3, 3, 3, 2, 3, 3, 3, 3, 5, 3, 4, 4, 4, 5, 3, 3, 4, 4],
        totalScore: 62,
      },
      {
        name: 'TG',
        holeScores: [4, 4, 3, 2, 4, 3, 4, 3, 4, 3, 6, 4, 3, 4, 3, 3, 4, 4],
        totalScore: 65,
      },
      {
        name: 'Will',
        holeScores: [3, 5, 4, 3, 2, 3, 4, 4, 5, 3, 5, 5, 3, 4, 4, 5, 3, 4],
        totalScore: 69,
      },
      {
        name: 'Byron',
        holeScores: [4, 4, 3, 3, 3, 3, 4, 3, 6, 4, 4, 5, 4, 3, 3, 5, 5, 4],
        totalScore: 70,
      },
    ],
  };

  it('validates all supplied scores and totals without adding hole pars', () => {
    const parsed = HistoricalRoundInputSchema.parse(actualCard);
    expect(parsed).toMatchObject({
      playedOn: '2026-03-22',
      courseName: 'Red Tail Ridge',
      layoutName: 'Blue',
      holeCount: 18,
      totalPar: 57,
      sourceUrl,
      roundMetadata: { location: 'Fort Branch, Indiana', played_time: '12:08 PM' },
    });
    expect(historicalRoundSourceId(parsed)).toBe('N78XJtdFmZ');
    expect(parsed.holePars).toBeUndefined();
    expect(parsed.players?.map((player) => player.totalScore)).toEqual([
      59, 59, 60, 62, 65, 69, 70,
    ]);
    expect(
      parsed.players?.map((player) => player.holeScores?.reduce((sum, score) => sum + score, 0)),
    ).toEqual([59, 59, 60, 62, 65, 69, 70]);
    expect(parsed.players?.every((player) => player.holeScores?.length === 18)).toBe(true);
  });

  it('rejects a link without card data and keeps an edited mismatch visible without correcting it', () => {
    expect(HistoricalRoundInputSchema.safeParse({ sourceUrl }).success).toBe(false);
    const edited = {
      ...actualCard,
      players: actualCard.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              holeScores: player.holeScores.map((score, hole) => (hole === 0 ? 4 : score)),
            }
          : player,
      ),
    };
    const parsed = HistoricalRoundInputSchema.safeParse(edited);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['players', 0, 'totalScore'],
          message: 'This total does not match the entered hole scores.',
        }),
      );
    }
    expect(edited.players[0]?.holeScores[0]).toBe(4);
    expect(edited.players[0]?.totalScore).toBe(59);
  });

  it('preserves partial numbered entries without filling unknown holes or changing totals', () => {
    const first = actualCard.players[0];
    expect(first).toBeDefined();
    if (!first) return;
    const numberedScores = first.holeScores.map((score, index) => ({
      holeNumber: index + 1,
      score,
    }));
    const incomplete = HistoricalRoundInputSchema.safeParse({
      ...actualCard,
      players: [
        {
          name: first.name,
          totalScore: first.totalScore,
          holeScoreEntries: numberedScores.slice(1),
        },
      ],
    });
    expect(incomplete.success).toBe(true);
    if (incomplete.success) {
      expect(incomplete.data.players?.[0]?.holeScoreEntries).toEqual(numberedScores.slice(1));
      expect(incomplete.data.players?.[0]?.totalScore).toBe(59);
    }
    expect(numberedScores[0]?.score).toBe(3);
    expect(first.totalScore).toBe(59);
  });
});

describe('public UDisc scorecard HTML', () => {
  it('parses the source course, link, date, layout, location, pars, usernames and hole results', () => {
    const card = parseUDiscScorecardHtml(scorecardHtml(), scorecardFixture.sourceUrl);
    expect(card).toMatchObject({
      scorecardId: 'N78XJtdFmZ',
      sourceUrl: scorecardFixture.sourceUrl,
      courseName: 'Red Tail Ridge',
      courseUrl: 'https://udisc.com/courses/red-tail-ridge-9PTX',
      layoutName: 'Blue',
      playedOn: '2026-03-22',
      location: 'Fort Branch, Indiana',
      holeCount: 18,
      pars: [3, 3, 3, 3, 3, 3, 3, 3, 4, 3, 4, 4, 3, 3, 3, 3, 3, 3],
      totalPar: 57,
    });
    expect(card.players).toEqual(
      scorecardFixture.players.map(
        ({ username, displayName, position, toPar, totalScore, holeScores }) => ({
          displayName,
          username,
          position,
          toPar,
          totalScore,
          holeScores,
          holesPlayed: scorecardFixture.holeCount,
          didNotFinish: false,
        }),
      ),
    );
    expect(JSON.stringify(card)).not.toContain('Weather');
  });

  it('parses six blank cells as unplayed and scores only the remaining holes', () => {
    const card = parseUDiscScorecardHtml(
      scorecardHtml('Mar 22, 2026', { 0: [1, 2, 3, 4, 5, 6] }),
      scorecardFixture.sourceUrl,
    );
    const player = card.players[0];
    const source = scorecardFixture.players[0];
    expect(player).toBeDefined();
    expect(source).toBeDefined();
    if (!player || !source) return;
    expect(player.holeScores.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(player.holesPlayed).toBe(12);
    expect(player.didNotFinish).toBe(true);
    expect(player.totalScore).toBe(
      source.holeScores.slice(6).reduce((sum, score) => sum + score, 0),
    );
    expect(player.toPar).toBe(
      player.totalScore - scorecardFixture.pars.slice(6).reduce((sum, par) => sum + par, 0),
    );
  });

  it('accepts a player with every hole cell blank without inventing strokes', () => {
    const card = parseUDiscScorecardHtml(
      scorecardHtml('Mar 22, 2026', { 0: scorecardFixture.pars.map((_, index) => index + 1) }),
      scorecardFixture.sourceUrl,
    );
    expect(card.players[0]).toMatchObject({
      holeScores: Array.from({ length: scorecardFixture.holeCount }, () => null),
      holesPlayed: 0,
      didNotFinish: true,
      totalScore: 0,
      toPar: null,
    });
  });

  it('rejects a wrong number of hole cells and a non-UDisc page', () => {
    const oneScoreCell = `<td><div><span>${scorecardFixture.players[0]?.holeScores[0]}</span></div></td>`;
    expect(() =>
      parseUDiscScorecardHtml(
        scorecardHtml().replace(oneScoreCell, ''),
        scorecardFixture.sourceUrl,
      ),
    ).toThrow(/incomplete set of player hole scores/u);
    expect(() =>
      parseUDiscScorecardHtml(
        '<html><title>Other scorecard</title><table></table></html>',
        scorecardFixture.sourceUrl,
      ),
    ).toThrow(/not a UDisc scorecard/u);
  });

  it('keeps unavailable metadata and usernames unavailable without guessing them', () => {
    const html = scorecardHtml()
      .replace(
        'href="/courses/red-tail-ridge-9PTX/layouts/21955/caddie-book">Blue',
        'href="/layouts/">',
      )
      .replace('Mar 22, 2026 12:08 PM', 'time unavailable')
      .replace(
        '<svg data-icon="location-dot"></svg><a href="/places/us/indiana/fort-branch-in">Fort Branch, Indiana</a>',
        '',
      )
      .replace('@<!-- -->cchambruhs', '');
    const card = parseUDiscScorecardHtml(html, scorecardFixture.sourceUrl);
    expect(card.layoutName).toBeNull();
    expect(card.playedOn).toBeNull();
    expect(card.location).toBeNull();
    expect(card.players[0]?.displayName).toBe('Dad');
    expect(card.players[0]?.username).toBeNull();
  });

  it('preserves an unavailable hole par without discarding the other source pars', () => {
    const html = scorecardHtml().replace(
      'class="text-xxs font-normal">3</div>',
      'class="text-xxs font-normal">—</div>',
    );
    const card = parseUDiscScorecardHtml(html, scorecardFixture.sourceUrl);
    expect(card.pars).toHaveLength(18);
    expect(card.pars?.[0]).toBeNull();
    expect(card.pars?.[1]).toBe(3);
    expect(card.totalPar).toBe(57);
  });

  it('rejects incomplete scores, totals that disagree with scores, and total pars that disagree with holes', () => {
    expect(() =>
      parseUDiscScorecardHtml(
        scorecardHtml().replace('<span>3</span>', '<span>3'),
        scorecardFixture.sourceUrl,
      ),
    ).toThrow(/unavailable hole score/u);
    expect(() =>
      parseUDiscScorecardHtml(
        scorecardHtml().replace('<!-- -->59<!-- -->', '<!-- -->60<!-- -->'),
        scorecardFixture.sourceUrl,
      ),
    ).toThrow(/does not match the UDisc hole scores/u);
    expect(() =>
      parseUDiscScorecardHtml(
        scorecardHtml().replace('<div>Total</div><div>57</div>', '<div>Total</div><div>58</div>'),
        scorecardFixture.sourceUrl,
      ),
    ).toThrow(/total par does not match/u);
  });

  it('fingerprints the layout, date, pars and all username-score pairs independent of player order', () => {
    const card = parseUDiscScorecardHtml(scorecardHtml(), scorecardFixture.sourceUrl);
    const reordered = { ...card, players: [...card.players].reverse() };
    expect(importedScorecardFingerprint(card)).toBe(importedScorecardFingerprint(reordered));
    expect(importedScorecardFingerprint(card)).not.toBe(
      importedScorecardFingerprint({ ...card, layoutName: 'Red' }),
    );
  });
});
