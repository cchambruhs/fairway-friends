// @polsia:user-owned — parses a single authorized UDisc scorecard export without mapping UI.

import {
  type HistoricalRoundCsvDraft,
  HistoricalRoundCsvDraftSchema,
} from '@/lib/contracts/round-history';
import { UDiscScorecardLinkSchema, udiscScorecardId } from '@/lib/contracts/scorecard-import';
import type { CsvDelimiter } from '@/modules/csv-import/contracts';
import { parseCsv } from '@/modules/csv-import/parser';

interface CsvRow {
  record: number;
  cells: string[];
}

interface PlayerScores {
  name: string;
  sourcePlayerId?: string;
  pdgaNumber?: string;
  totalScore?: number;
  holeScores: Map<number, number>;
  holePars: Map<number, number>;
}

const HEADER_ALIASES = {
  date: ['date', 'round date', 'played on', 'played date', 'scorecard date'],
  course: ['course', 'course name'],
  layout: ['layout', 'layout name', 'course layout'],
  player: ['player', 'player name', 'name', 'player nickname'],
  playerId: ['player id', 'source player id', 'udisc player id'],
  pdgaNumber: ['pdga number', 'pdga #', 'pdga number if exists'],
  source: [
    'scorecard id',
    'cardcast id',
    'card cast id',
    'card id',
    'source id',
    'udisc scorecard id',
  ],
  sourceUrl: ['scorecard url', 'cardcast url', 'card cast url', 'source url', 'udisc url'],
  total: ['total score', 'round total', 'total strokes', 'strokes total', 'total'],
  genericScore: ['score'],
  totalPar: ['total par', 'par total'],
  holeNumber: ['hole number', 'hole no', 'hole #', 'hole'],
  holeScore: ['hole score', 'strokes', 'throws'],
  holePar: ['hole par', 'par'],
  holeCount: ['hole count', 'number of holes', 'holes played'],
  roundName: ['round name', 'scorecard name'],
  eventName: ['event', 'event name', 'tournament'],
  startedAt: ['started at', 'start time', 'round start', 'round started'],
  completedAt: ['completed at', 'end time', 'round end', 'round completed'],
  notes: ['round notes', 'scorecard notes'],
} as const;

const ROUND_METADATA_FIELDS = [
  ['round_name', HEADER_ALIASES.roundName],
  ['event_name', HEADER_ALIASES.eventName],
  ['started_at', HEADER_ALIASES.startedAt],
  ['completed_at', HEADER_ALIASES.completedAt],
  ['notes', HEADER_ALIASES.notes],
] as const;

function normalizeHeader(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function headerIndex(headers: string[], aliases: readonly string[]): number | undefined {
  const names = new Set(aliases.map(normalizeHeader));
  const index = headers.findIndex((header) => names.has(normalizeHeader(header)));
  return index >= 0 ? index : undefined;
}

function headerColumns(headers: string[], kind: 'score' | 'par'): Map<number, number> {
  const columns = new Map<number, number>();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const scoreMatch = /^(?:hole|h)\s*(\d{1,2})(?:\s*(?:score|strokes|throws))?$/.exec(normalized);
    const parMatch =
      /^(?:(?:hole)\s*)?par\s*(\d{1,2})$/.exec(normalized) ??
      /^hole\s*(\d{1,2})\s*par$/.exec(normalized);
    const numericScoreMatch = kind === 'score' ? /^(\d{1,2})$/.exec(normalized) : null;
    const match = kind === 'score' ? scoreMatch : parMatch;
    const holeNumber = match?.[1]
      ? Number(match[1])
      : numericScoreMatch?.[1]
        ? Number(numericScoreMatch[1])
        : null;
    if (holeNumber !== null && holeNumber >= 1 && holeNumber <= 36) {
      columns.set(holeNumber, index);
    }
  });
  return columns;
}

function cell(row: CsvRow, index: number | undefined): string {
  return index === undefined ? '' : (row.cells[index] ?? '').trim();
}

function normalizeValue(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function stablePlayerId(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `player-${(hash >>> 0).toString(36)}`;
}

function parsePositiveInteger(value: string, label: string, max = 99): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return parsed;
}

function parseDate(value: string): string | undefined {
  if (!value) return undefined;
  const isoDate = /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/.exec(value);
  if (isoDate?.[1]) value = isoDate[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (usDate?.[1] && usDate[2] && usDate[3]) {
    const month = Number(usDate[1]);
    const day = Number(usDate[2]);
    const year = Number(usDate[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date.toISOString().slice(0, 10);
    }
  }

  const namedDate = /^(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(value);
  if (namedDate?.[1] && namedDate[2] && namedDate[3]) {
    const date = new Date(`${namedDate[1]} ${namedDate[2]}, ${namedDate[3]} UTC`);
    if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
  }
  throw new Error('The export has an unsupported or invalid date format.');
}

function parseIdentifier(value: string): string | null {
  const link = UDiscScorecardLinkSchema.safeParse(value);
  if (link.success) return udiscScorecardId(link.data);
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

function parseSourceUrl(value: string): string | undefined {
  const parsed = UDiscScorecardLinkSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseTable(text: string): { headers: string[]; rows: CsvRow[]; delimiter: CsvDelimiter } {
  const candidates: Array<{ headers: string[]; rows: CsvRow[]; delimiter: CsvDelimiter }> = [];
  const failures: unknown[] = [];

  for (const delimiter of [',', ';'] as const satisfies readonly CsvDelimiter[]) {
    try {
      const parsed = parseCsv(text, delimiter);
      if (parsed.rows.length > 0) {
        candidates.push({ headers: parsed.headers, rows: parsed.rows, delimiter });
      }
    } catch (error) {
      failures.push(error);
    }
  }

  candidates.sort((first, second) => second.headers.length - first.headers.length);
  const result = candidates[0];
  if (result) return result;
  if (failures.length === 0) throw new Error('The export contains no scorecard rows.');
  throw new Error('This file is not a supported UTF-8 CSV export.');
}

function assertSameValues(rows: CsvRow[], index: number | undefined, label: string): string {
  const values = rows.map((row) => cell(row, index)).filter(Boolean);
  const unique = new Set(values.map(normalizeValue));
  if (unique.size > 1) {
    throw new Error(`The export has conflicting ${label} values for this scorecard.`);
  }
  return values[0] ?? '';
}

function contiguousValues(values: Map<number, number>): number[] | undefined {
  if (values.size === 0) return undefined;
  const maximum = Math.max(...values.keys());
  if (values.size !== maximum) return undefined;
  return Array.from({ length: maximum }, (_, index) => values.get(index + 1) ?? Number.NaN);
}

function numberedScoreEntries(values: Map<number, number>) {
  return [...values.entries()]
    .sort(([first], [second]) => first - second)
    .map(([holeNumber, score]) => ({ holeNumber, score }));
}

function numberedParEntries(values: Map<number, number>) {
  return [...values.entries()]
    .sort(([first], [second]) => first - second)
    .map(([holeNumber, par]) => ({ holeNumber, par }));
}

function addHoleValue(
  values: Map<number, number>,
  holeNumber: number,
  value: number,
  label: string,
): void {
  const existing = values.get(holeNumber);
  if (existing !== undefined && existing !== value) {
    throw new Error(`The export has conflicting ${label} for hole ${holeNumber}.`);
  }
  values.set(holeNumber, value);
}

function roundGroupKey(
  row: CsvRow,
  indices: {
    date?: number;
    course?: number;
    layout?: number;
    startedAt?: number;
    roundName?: number;
  },
): string {
  return [indices.date, indices.course, indices.layout, indices.startedAt, indices.roundName]
    .map((index) => normalizeValue(cell(row, index)))
    .join('\u001f');
}

function parseUDiscScorecardCsvGroup(
  text: string,
  sourceUrlValue?: string,
  expectedSourceId?: string,
): HistoricalRoundCsvDraft {
  const source = sourceUrlValue ? UDiscScorecardLinkSchema.safeParse(sourceUrlValue) : undefined;
  if (source && !source.success) {
    throw new Error('Use the exact HTTPS UDisc CardCast link for this scorecard.');
  }
  const requestedSourceId =
    expectedSourceId ?? (source?.success ? udiscScorecardId(source.data) : null);
  const { headers, rows: allRows } = parseTable(text);
  const indices = {
    date: headerIndex(headers, HEADER_ALIASES.date),
    course: headerIndex(headers, HEADER_ALIASES.course),
    layout: headerIndex(headers, HEADER_ALIASES.layout),
    startedAt: headerIndex(headers, HEADER_ALIASES.startedAt),
    roundName: headerIndex(headers, HEADER_ALIASES.roundName),
  };
  const sourceIdIndex = headerIndex(headers, HEADER_ALIASES.source);
  const sourceUrlIndex = headerIndex(headers, HEADER_ALIASES.sourceUrl);
  const sourceIndex = sourceIdIndex ?? sourceUrlIndex;
  let rows = allRows;
  let sourceId = requestedSourceId ?? undefined;
  let hasMatchingSourceId = false;

  if (sourceIndex !== undefined) {
    const sourceRows = allRows.filter((row) => cell(row, sourceIndex));
    const ids = new Set(
      sourceRows
        .map((row) => parseIdentifier(cell(row, sourceIndex)))
        .filter((value): value is string => value !== null),
    );
    if (sourceRows.some((row) => parseIdentifier(cell(row, sourceIndex)) === null)) {
      throw new Error('The export contains an unsupported scorecard ID or URL.');
    }
    if (sourceId && ids.size > 0 && !ids.has(sourceId)) {
      throw new Error('The export scorecard ID does not match the CardCast link you pasted.');
    }
    if (!sourceId && ids.size > 1) {
      throw new Error('Choose one scorecard ID at a time or use the bulk import preview.');
    }
    if (!sourceId && ids.size === 1) {
      sourceId = [...ids][0];
    }
    if (sourceId) {
      rows = allRows.filter(
        (row) => !cell(row, sourceIndex) || parseIdentifier(cell(row, sourceIndex)) === sourceId,
      );
      hasMatchingSourceId = ids.has(sourceId);
    }
  }

  const groups = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const key = roundGroupKey(row, indices);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  if (groups.size > 1) {
    throw new Error(
      'This export contains multiple scorecards. Use the bulk import preview or choose one matching scorecard.',
    );
  }
  const selectedRows = [...groups.values()][0];
  if (!selectedRows?.length) {
    throw new Error('No rows in this export match the CardCast scorecard.');
  }

  const courseName = assertSameValues(selectedRows, indices.course, 'course');
  const layoutName = assertSameValues(selectedRows, indices.layout, 'layout');
  const playedOnValue = assertSameValues(selectedRows, indices.date, 'date');
  const playedOn = parseDate(playedOnValue);
  if (!hasMatchingSourceId && !playedOn && !courseName && !layoutName) {
    throw new Error('The export needs a date, course, layout, or matching scorecard ID.');
  }

  const playerIndex = headerIndex(headers, HEADER_ALIASES.player);
  if (playerIndex === undefined) {
    throw new Error('The export is missing a player-name column.');
  }
  const playerIdIndex = headerIndex(headers, HEADER_ALIASES.playerId);
  const pdgaNumberIndex = headerIndex(headers, HEADER_ALIASES.pdgaNumber);
  const wideScores = headerColumns(headers, 'score');
  const widePars = headerColumns(headers, 'par');
  const longHoleIndex = headerIndex(headers, HEADER_ALIASES.holeNumber);
  const longHoleScoreIndex = headerIndex(headers, HEADER_ALIASES.holeScore);
  const longParIndex = headerIndex(headers, HEADER_ALIASES.holePar);
  const longFormat =
    longHoleIndex !== undefined && (longHoleScoreIndex !== undefined || longParIndex !== undefined);
  const explicitTotalIndex = headerIndex(headers, HEADER_ALIASES.total);
  const genericScoreIndex = headerIndex(headers, HEADER_ALIASES.genericScore);
  const totalIndex = explicitTotalIndex ?? (longFormat ? undefined : genericScoreIndex);
  const totalParIndex = headerIndex(headers, HEADER_ALIASES.totalPar);
  const holeCountIndex = headerIndex(headers, HEADER_ALIASES.holeCount);
  const players = new Map<string, PlayerScores>();
  const roundPars = new Map<number, number>();

  for (const row of selectedRows) {
    const name = cell(row, playerIndex);
    if (!name) throw new Error(`Record ${row.record} is missing a player name.`);
    const isParRow =
      !longFormat &&
      normalizeValue(name) === 'par' &&
      !cell(row, playerIdIndex) &&
      !cell(row, pdgaNumberIndex);
    if (isParRow) {
      for (const [holeNumber, column] of wideScores) {
        const value = parsePositiveInteger(cell(row, column), `Hole ${holeNumber} par`);
        if (value !== undefined) addHoleValue(roundPars, holeNumber, value, 'pars');
      }
      for (const [holeNumber, column] of widePars) {
        const value = parsePositiveInteger(cell(row, column), `Hole ${holeNumber} par`);
        if (value !== undefined) addHoleValue(roundPars, holeNumber, value, 'pars');
      }
      continue;
    }
    const sourcePlayerId = cell(row, playerIdIndex);
    const pdgaNumber = cell(row, pdgaNumberIndex);
    const key = sourcePlayerId || normalizeValue(name);
    const current = players.get(key) ?? {
      name,
      ...(sourcePlayerId ? { sourcePlayerId } : {}),
      ...(pdgaNumber ? { pdgaNumber } : {}),
      holeScores: new Map<number, number>(),
      holePars: new Map<number, number>(),
    };
    if (normalizeValue(current.name) !== normalizeValue(name)) {
      throw new Error('The export uses one player ID for multiple player names.');
    }
    if (current.pdgaNumber && pdgaNumber && current.pdgaNumber !== pdgaNumber) {
      throw new Error(`The export has conflicting PDGA numbers for ${name}.`);
    }
    if (!current.pdgaNumber && pdgaNumber) current.pdgaNumber = pdgaNumber;

    const total = parsePositiveInteger(cell(row, totalIndex), `Record ${row.record} total`, 3564);
    if (total !== undefined && current.totalScore !== undefined && current.totalScore !== total) {
      throw new Error(`The export has conflicting totals for ${name}.`);
    }
    if (total !== undefined) current.totalScore = total;

    if (longFormat) {
      const holeNumber = parsePositiveInteger(cell(row, longHoleIndex), 'Hole number', 36);
      if (holeNumber === undefined)
        throw new Error(`Record ${row.record} is missing a hole number.`);
      const holeScore = parsePositiveInteger(cell(row, longHoleScoreIndex), 'Hole score');
      if (holeScore !== undefined) {
        if (current.holeScores.has(holeNumber)) {
          throw new Error(`The export repeats hole ${holeNumber} for ${name}.`);
        }
        addHoleValue(current.holeScores, holeNumber, holeScore, 'scores');
      }
      const holePar = parsePositiveInteger(cell(row, longParIndex), 'Hole par');
      if (holePar !== undefined) {
        if (current.holePars.has(holeNumber)) {
          throw new Error(`The export repeats the par for hole ${holeNumber}.`);
        }
        addHoleValue(current.holePars, holeNumber, holePar, 'pars');
      }
    } else {
      for (const [holeNumber, column] of wideScores) {
        const value = parsePositiveInteger(cell(row, column), `Hole ${holeNumber} score`);
        if (value !== undefined) addHoleValue(current.holeScores, holeNumber, value, 'scores');
      }
      for (const [holeNumber, column] of widePars) {
        const value = parsePositiveInteger(cell(row, column), `Hole ${holeNumber} par`);
        if (value !== undefined) addHoleValue(roundPars, holeNumber, value, 'pars');
      }
    }

    if (players.has(key) && !longFormat) {
      throw new Error(
        `The export has multiple scorecard rows for ${name} without hole identifiers.`,
      );
    }
    players.set(key, current);
  }

  if (players.size === 0 || players.size > 16) {
    throw new Error('The export must contain between 1 and 16 players.');
  }

  if (longFormat) {
    const playerParMaps = [...players.values()].map((player) => player.holePars);
    for (const playerPars of playerParMaps) {
      for (const [holeNumber, par] of playerPars) {
        addHoleValue(roundPars, holeNumber, par, 'pars');
      }
    }
  }

  const declaredHoleCount =
    parsePositiveInteger(
      assertSameValues(selectedRows, holeCountIndex, 'hole count'),
      'Hole count',
      36,
    ) ??
    (() => {
      const maximum = Math.max(0, ...wideScores.keys());
      return maximum > 0 && wideScores.size === maximum ? maximum : undefined;
    })();

  const contiguousPars = contiguousValues(roundPars);
  const holePars =
    contiguousPars &&
    (declaredHoleCount === undefined || contiguousPars.length === declaredHoleCount)
      ? contiguousPars
      : undefined;
  const holeParEntries = holePars ? undefined : numberedParEntries(roundPars);
  const normalizedPlayers = [...players.values()].map((player) => {
    const contiguousScores = contiguousValues(player.holeScores);
    const holeScores =
      contiguousScores &&
      (declaredHoleCount === undefined || contiguousScores.length === declaredHoleCount)
        ? contiguousScores
        : undefined;
    const holeScoreEntries = holeScores ? undefined : numberedScoreEntries(player.holeScores);
    const totalScore = player.totalScore;
    if (holeScores) {
      const calculated = holeScores.reduce((sum, value) => sum + value, 0);
      if (totalScore !== undefined && totalScore !== calculated) {
        throw new Error(`The total for ${player.name} does not match the hole-by-hole scores.`);
      }
    }
    if (
      declaredHoleCount !== undefined &&
      [...player.holeScores.keys()].some((holeNumber) => holeNumber > declaredHoleCount)
    ) {
      throw new Error(
        `The scores for ${player.name} include a hole number greater than the declared hole count.`,
      );
    }
    if (totalScore === undefined && !holeScoreEntries?.length && !holeScores?.length) {
      throw new Error(`The export has no total or hole-by-hole scores for ${player.name}.`);
    }
    return {
      id: stablePlayerId(
        player.sourcePlayerId
          ? `source:${player.sourcePlayerId}`
          : player.pdgaNumber
            ? `pdga:${player.pdgaNumber}`
            : `name:${normalizeValue(player.name)}`,
      ),
      name: player.name,
      ...(player.sourcePlayerId ? { sourcePlayerId: player.sourcePlayerId } : {}),
      ...(player.pdgaNumber ? { pdgaNumber: player.pdgaNumber } : {}),
      ...(totalScore !== undefined ? { totalScore } : {}),
      ...(holeScores ? { holeScores } : {}),
      ...(holeScoreEntries?.length ? { holeScoreEntries } : {}),
      matchedToCurrentProfile: false,
    };
  });

  const totalParValue = assertSameValues(selectedRows, totalParIndex, 'total par');
  const parsedTotalPar = parsePositiveInteger(totalParValue, 'Total par', 3564);
  const computedTotalPar = holePars?.reduce((sum, value) => sum + value, 0);
  if (
    parsedTotalPar !== undefined &&
    computedTotalPar !== undefined &&
    parsedTotalPar !== computedTotalPar
  ) {
    throw new Error('The total par does not match the hole-by-hole pars.');
  }
  if (
    declaredHoleCount !== undefined &&
    [...roundPars.keys()].some((holeNumber) => holeNumber > declaredHoleCount)
  ) {
    throw new Error('The pars include a hole number greater than the declared hole count.');
  }
  const scoreHoleCount = normalizedPlayers.find((player) => player.holeScores)?.holeScores?.length;
  const holeCount = declaredHoleCount ?? scoreHoleCount ?? holePars?.length;

  const roundMetadata = Object.fromEntries(
    ROUND_METADATA_FIELDS.flatMap(([key, aliases]) => {
      const index = headerIndex(headers, aliases);
      if (index === undefined) return [];
      const value = assertSameValues(selectedRows, index, key);
      return value ? [[key, value]] : [];
    }),
  );
  if (playedOnValue && playedOnValue !== playedOn) {
    roundMetadata.source_date = playedOnValue;
  }
  const rowSourceUrlIndex = sourceUrlIndex ?? sourceIndex;
  const rowSourceUrl =
    rowSourceUrlIndex === undefined
      ? undefined
      : selectedRows.map((row) => parseSourceUrl(cell(row, rowSourceUrlIndex))).find(Boolean);
  if (rowSourceUrl && sourceId && udiscScorecardId(rowSourceUrl) !== sourceId) {
    throw new Error('The export scorecard ID does not match its original CardCast URL.');
  }
  const finalSourceUrl = source?.success ? source.data : rowSourceUrl;
  if (finalSourceUrl && sourceId && udiscScorecardId(finalSourceUrl) !== sourceId) {
    throw new Error('The export scorecard ID does not match the CardCast link you pasted.');
  }

  const result = HistoricalRoundCsvDraftSchema.safeParse({
    ...(playedOn ? { playedOn } : {}),
    ...(courseName ? { courseName } : {}),
    ...(layoutName ? { layoutName } : {}),
    ...(parsedTotalPar !== undefined ? { totalPar: parsedTotalPar } : {}),
    ...(holeCount ? { holeCount } : {}),
    ...(holePars ? { holePars } : {}),
    ...(holeParEntries?.length ? { holeParEntries } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(roundMetadata && Object.keys(roundMetadata).length ? { roundMetadata } : {}),
    players: normalizedPlayers,
    ...(finalSourceUrl ? { sourceUrl: finalSourceUrl } : {}),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'The scorecard export is incomplete.');
  }
  return result.data;
}

function encodeCsvCell(value: string, delimiter: CsvDelimiter): string {
  return /["\r\n]/.test(value) || value.includes(delimiter)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

function encodeRows(headers: string[], rows: CsvRow[], delimiter: CsvDelimiter): string {
  return [headers, ...rows.map((row) => row.cells)]
    .map((row) => row.map((value) => encodeCsvCell(value, delimiter)).join(delimiter))
    .join('\r\n');
}

function splitOnRepeatedParRows(rows: CsvRow[], headers: string[]): CsvRow[][] {
  const playerIndex = headerIndex(headers, HEADER_ALIASES.player);
  if (playerIndex === undefined) return [rows];
  const playerIdIndex = headerIndex(headers, HEADER_ALIASES.playerId);
  const pdgaNumberIndex = headerIndex(headers, HEADER_ALIASES.pdgaNumber);
  const isParRow = (row: CsvRow) =>
    normalizeValue(cell(row, playerIndex)) === 'par' &&
    !cell(row, playerIdIndex) &&
    !cell(row, pdgaNumberIndex);
  if (rows.filter(isParRow).length < 2) return [rows];

  const groups: CsvRow[][] = [];
  let current: CsvRow[] = [];
  let sawParRow = false;
  for (const row of rows) {
    if (isParRow(row) && sawParRow) {
      groups.push(current);
      current = [];
    }
    if (isParRow(row)) sawParRow = true;
    current.push(row);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export function parseUDiscScorecardsCsv(
  text: string,
  sourceUrlValue?: string,
): HistoricalRoundCsvDraft[] {
  const source = sourceUrlValue ? UDiscScorecardLinkSchema.safeParse(sourceUrlValue) : undefined;
  if (source && !source.success) {
    throw new Error('Use the exact HTTPS UDisc CardCast link for this scorecard.');
  }
  const { headers, rows, delimiter } = parseTable(text);
  const sourceIdIndex = headerIndex(headers, HEADER_ALIASES.source);
  const sourceUrlIndex = headerIndex(headers, HEADER_ALIASES.sourceUrl);
  const sourceIndex = sourceIdIndex ?? sourceUrlIndex;
  const indices = {
    date: headerIndex(headers, HEADER_ALIASES.date),
    course: headerIndex(headers, HEADER_ALIASES.course),
    layout: headerIndex(headers, HEADER_ALIASES.layout),
    startedAt: headerIndex(headers, HEADER_ALIASES.startedAt),
    roundName: headerIndex(headers, HEADER_ALIASES.roundName),
  };
  const buckets = new Map<string, CsvRow[]>();
  const ids = new Set<string>();
  if (sourceIndex !== undefined) {
    for (const row of rows) {
      const value = cell(row, sourceIndex);
      if (!value) continue;
      const id = parseIdentifier(value);
      if (!id) throw new Error('The export contains an unsupported scorecard ID or URL.');
      ids.add(id);
    }
  }
  const requestedId = source?.success ? udiscScorecardId(source.data) : null;
  if (requestedId && ids.size > 0 && !ids.has(requestedId)) {
    throw new Error('The export scorecard ID does not match the CardCast link you pasted.');
  }
  if (sourceIndex !== undefined && requestedId) {
    const selectedRows = rows.filter(
      (row) => !cell(row, sourceIndex) || parseIdentifier(cell(row, sourceIndex)) === requestedId,
    );
    buckets.set(`source:${requestedId}`, selectedRows);
  } else if (sourceIndex !== undefined && ids.size > 1) {
    for (const row of rows) {
      const value = cell(row, sourceIndex);
      const key = value ? `source:${parseIdentifier(value)}` : 'source:blank';
      buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }
    const blankRows = buckets.get('source:blank') ?? [];
    if (blankRows.length > 0) {
      throw new Error(
        'Some rows in this bulk export are missing a scorecard ID, so their round association is ambiguous.',
      );
    }
  } else {
    const groupedRows =
      sourceIndex !== undefined && ids.size === 1
        ? rows.filter(
            (row) =>
              !cell(row, sourceIndex) || parseIdentifier(cell(row, sourceIndex)) === [...ids][0],
          )
        : rows;
    for (const row of groupedRows) {
      const id = sourceIndex === undefined ? null : parseIdentifier(cell(row, sourceIndex));
      const key = id ? `source:${id}` : `details:${roundGroupKey(row, indices)}`;
      buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }
  }
  if (buckets.size === 0) throw new Error('The export contains no scorecard rows.');
  if (requestedId && sourceIndex === undefined && buckets.size > 1) {
    throw new Error(
      'This export contains multiple scorecards. Use a separate CardCast link for each round.',
    );
  }

  const drafts: HistoricalRoundCsvDraft[] = [];
  for (const [key, groupRows] of buckets) {
    const sourceId = key.startsWith('source:') ? key.slice('source:'.length) : undefined;
    const cardGroups =
      sourceId || ids.size > 0 ? [groupRows] : splitOnRepeatedParRows(groupRows, headers);
    if (source?.success && cardGroups.length > 1) {
      throw new Error(
        'This export contains multiple scorecards. Use a separate CardCast link for each round.',
      );
    }
    for (const cardRows of cardGroups) {
      const rowUrlIndex = sourceUrlIndex ?? sourceIndex;
      const rowUrl =
        rowUrlIndex === undefined
          ? undefined
          : cardRows.map((row) => parseSourceUrl(cell(row, rowUrlIndex))).find(Boolean);
      const sourceUrl = source?.success ? source.data : rowUrl;
      if (sourceUrl && sourceId && udiscScorecardId(sourceUrl) !== sourceId) {
        throw new Error('The export scorecard ID does not match the CardCast link you pasted.');
      }
      const roundText = encodeRows(headers, cardRows, delimiter);
      drafts.push(parseUDiscScorecardCsvGroup(roundText, sourceUrl, sourceId));
    }
  }
  return drafts;
}

export function parseUDiscScorecardCsv(text: string, sourceUrl: string): HistoricalRoundCsvDraft {
  const drafts = parseUDiscScorecardsCsv(text, sourceUrl);
  if (drafts.length !== 1) {
    throw new Error(
      'This export contains multiple scorecards. Choose one card or import the bulk file without a single CardCast link.',
    );
  }
  const draft = drafts[0];
  if (!draft) throw new Error('No rows in this export match the CardCast scorecard.');
  return draft;
}
