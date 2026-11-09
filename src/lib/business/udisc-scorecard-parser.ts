// @polsia:user-owned — parse public scorecard values from UDisc's rendered HTML table.
import {
  type ImportedScorecardDraft,
  ImportedScorecardDraftSchema,
} from '@/lib/contracts/imported-scorecard';
import { udiscScorecardId } from '@/lib/contracts/scorecard-import';

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/giu, (entity, value: string) => {
    if (value.startsWith('#x')) return String.fromCodePoint(Number.parseInt(value.slice(2), 16));
    if (value.startsWith('#')) return String.fromCodePoint(Number.parseInt(value.slice(1), 10));
    const named: Record<string, string> = {
      amp: '&',
      quot: '"',
      apos: "'",
      lt: '<',
      gt: '>',
    };
    return named[value.toLowerCase()] ?? entity;
  });
}

function textContent(markup: string): string {
  return decodeEntities(
    markup
      .replace(/<!--[\s\S]*?-->/gu, '')
      .replace(/<svg\b[\s\S]*?<\/svg>/giu, ' ')
      .replace(/<br\s*\/?>/giu, ' ')
      .replace(/<[^>]+>/gu, ' '),
  )
    .replace(/\s+/gu, ' ')
    .trim();
}

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'iu').exec(attributes);
  return match?.[1] ? decodeEntities(match[1]) : null;
}

function anchors(markup: string): Array<{ href: string; text: string }> {
  return [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)].flatMap((match) => {
    const href = attribute(match[1] ?? '', 'href');
    return href ? [{ href, text: textContent(match[2] ?? '') }] : [];
  });
}

function isoDate(markup: string): string | null {
  const match =
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})\b/iu.exec(markup);
  if (!match) return null;
  const month = MONTHS[(match[1] ?? '').toLowerCase()];
  const day = (match[2] ?? '').padStart(2, '0');
  const year = match[3];
  if (!month || !year) return null;
  const value = `${year}-${month}-${day}`;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function findTable(markup: string): string {
  for (const match of markup.matchAll(/<table\b[\s\S]*?<\/table>/giu)) {
    const table = match[0];
    const header = /<thead\b[\s\S]*?<\/thead>/iu.exec(table)?.[0] ?? '';
    const headerText = textContent(header);
    if (/\bName\b/iu.test(headerText) && /\bTotal\b/iu.test(headerText)) return table;
  }
  throw new Error('UDisc did not return a readable scorecard table.');
}

function parsePars(table: string): {
  holeCount: number;
  pars: (number | null)[];
  totalPar: number | null;
} {
  const header = /<thead\b[\s\S]*?<\/thead>/iu.exec(table)?.[0];
  if (!header) throw new Error('UDisc did not return the scorecard hole headers.');
  const row = /<tr\b[\s\S]*?<\/tr>/iu.exec(header)?.[0];
  if (!row) throw new Error('UDisc did not return the scorecard hole headers.');
  const cells = [...row.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/giu)].map((match) => match[1] ?? '');
  const holes: Array<{ number: number; par: number | null }> = [];
  for (const cell of cells) {
    const numberMatch =
      /<div\b[^>]*class="[^"]*text-xxs font-bold[^"]*"[^>]*>\s*(\d+)\s*<\/div>/iu.exec(cell);
    if (!numberMatch) continue;
    const parMatch =
      /<div\b[^>]*class="[^"]*text-xxs font-normal[^"]*"[^>]*>\s*(\d+)\s*<\/div>/iu.exec(cell);
    holes.push({ number: Number(numberMatch[1]), par: parMatch ? Number(parMatch[1]) : null });
  }
  if (
    holes.length === 0 ||
    holes.length > 36 ||
    holes.some((hole, index) => hole.number !== index + 1)
  ) {
    throw new Error('UDisc did not return a complete hole count.');
  }
  const pars = holes.map((hole) => hole.par);
  if (pars.some((par) => par !== null && (!Number.isInteger(par) || par < 1 || par > 99))) {
    throw new Error('UDisc returned invalid hole pars.');
  }
  const totalCell = cells.find((cell) => /^Total\b/iu.test(textContent(cell)));
  const totalNumbers = totalCell ? [...textContent(totalCell).matchAll(/\d+/gu)] : [];
  const totalPar = totalNumbers.length ? Number(totalNumbers[totalNumbers.length - 1]?.[0]) : null;
  if (
    pars.every((par) => par !== null) &&
    totalPar !== null &&
    totalPar !== pars.reduce((sum, par) => sum + (par ?? 0), 0)
  ) {
    throw new Error('UDisc total par does not match the source hole pars.');
  }
  return { holeCount: holes.length, pars, totalPar };
}

function parsePlayer(cell: string): { displayName: string | null; username: string | null } {
  const displayNameCell =
    /<div\b(?=[^>]*class="[^"]*truncate text-medium-strong text-text[^"]*")[^>]*>([\s\S]*?)<\/div>/iu.exec(
      cell,
    );
  const handleCell =
    /<div\b(?=[^>]*class="[^"]*truncate text-medium text-subtle[^"]*")[^>]*>([\s\S]*?)<\/div>/iu.exec(
      cell,
    );
  const displayName = displayNameCell ? textContent(displayNameCell[1] ?? '') : '';
  const handle = handleCell
    ? textContent(handleCell[1] ?? '')
        .replace(/^@/u, '')
        .trim()
    : '';
  return {
    displayName: displayName || null,
    username: /^[A-Za-z0-9_.-]{1,80}$/u.test(handle) ? handle : null,
  };
}

function parseTotal(cell: string): { totalScore: number | null; toPar: number | null } {
  const text = textContent(cell);
  const totalMatch = /\(\s*(\d+)\s*\)/u.exec(text);
  const totalScore = totalMatch ? Number(totalMatch[1]) : null;
  const toParMatch = /^\s*(E|[+-]?\d+)\s*\(/iu.exec(text);
  const toParLabel = toParMatch?.[1];
  const toPar = toParLabel ? (toParLabel.toUpperCase() === 'E' ? 0 : Number(toParLabel)) : null;
  return { totalScore, toPar };
}

function parsePlayers(table: string, holeCount: number, pars: readonly (number | null)[]) {
  const body = /<tbody\b[\s\S]*?<\/tbody>/iu.exec(table)?.[0];
  if (!body) throw new Error('UDisc did not return any player scores.');
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)];
  if (rows.length === 0 || rows.length > 16)
    throw new Error('UDisc returned an unsupported player count.');

  return rows.map((rowMatch) => {
    const cells = [...(rowMatch[1] ?? '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map(
      (match) => match[1] ?? '',
    );
    if (cells.length !== holeCount + 3) {
      throw new Error('UDisc returned an incomplete set of player hole scores.');
    }
    const position = textContent(cells[0] ?? '') || null;
    const { displayName, username } = parsePlayer(cells[1] ?? '');
    const scores = cells.slice(2, -1).map((cell): number | null => {
      const values = [...cell.matchAll(/<span\b[^>]*>\s*(\d+)\s*<\/span>/giu)];
      if (values.length === 0 && textContent(cell) === '') return null;
      if (values.length !== 1) throw new Error('UDisc returned an unavailable hole score.');
      return Number(values[0]?.[1]);
    });
    const sourceTotal = parseTotal(cells[cells.length - 1] ?? '');
    const holesPlayed = scores.filter((score) => score !== null).length;
    const didNotFinish = holesPlayed < holeCount;
    const totalScore = scores.reduce<number>((sum, score) => sum + (score ?? 0), 0);
    if (!didNotFinish && sourceTotal.totalScore !== totalScore) {
      throw new Error('A player total does not match the UDisc hole scores.');
    }
    if (!didNotFinish && sourceTotal.totalScore === null) {
      throw new Error('UDisc did not return a player total.');
    }
    const playedPars = scores.flatMap((score, index) => {
      const par = pars[index];
      return score !== null && typeof par === 'number' ? [par] : [];
    });
    const toPar =
      holesPlayed === 0
        ? null
        : didNotFinish
          ? playedPars.length === holesPlayed
            ? totalScore - playedPars.reduce((sum, par) => sum + par, 0)
            : null
          : sourceTotal.toPar;
    return {
      displayName,
      username,
      holeScores: scores,
      totalScore,
      toPar,
      position,
      holesPlayed,
      didNotFinish,
    };
  });
}

export function parseUDiscScorecardHtml(html: string, sourceUrl: string): ImportedScorecardDraft {
  const scorecardId = udiscScorecardId(sourceUrl);
  if (!scorecardId) throw new Error('Use the exact HTTPS UDisc scorecard share link.');
  if (new TextEncoder().encode(html).byteLength > 2_000_000) {
    throw new Error('The UDisc scorecard page is too large to import.');
  }
  if (!/udisc/iu.test(html)) throw new Error('The page is not a UDisc scorecard.');

  const table = findTable(html);
  const { holeCount, pars, totalPar } = parsePars(table);
  const tableStart = html.indexOf(table);
  const summary = tableStart >= 0 ? html.slice(0, tableStart) : html;
  const pageAnchors = anchors(summary);
  const heading = pageAnchors.find(
    (anchor) => /<h1\b/iu.test(anchor.text) || anchor.href.includes('/courses/'),
  );
  const courseName = heading?.text || null;
  const courseUrl = heading?.href
    ? (() => {
        try {
          const url = new URL(heading.href, 'https://udisc.com');
          return url.origin === 'https://udisc.com' && url.pathname.startsWith('/courses/')
            ? url.toString()
            : null;
        } catch {
          return null;
        }
      })()
    : null;
  const layout = pageAnchors.find((anchor) => anchor.href.includes('/layouts/'));
  const locationIcon =
    /<svg\b[^>]*data-icon="location-dot"[\s\S]*?<\/svg>\s*<a\b[^>]*>([\s\S]*?)<\/a>/iu.exec(
      summary,
    );
  const location = locationIcon ? textContent(locationIcon[1] ?? '') || null : null;
  return ImportedScorecardDraftSchema.parse({
    scorecardId,
    sourceUrl,
    courseName,
    courseUrl,
    layoutName: layout?.text || null,
    playedOn: isoDate(summary),
    location,
    holeCount,
    pars,
    totalPar,
    players: parsePlayers(table, holeCount, pars),
  });
}
