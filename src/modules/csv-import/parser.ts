// @polsia:framework-owned

import Papa from 'papaparse';
import type { CsvDelimiter, CsvField, CsvMapping } from './contracts';
import { CSV_LIMITS } from './contracts';

export interface ParsedCsv {
  headers: string[];
  rows: Array<{ record: number; cells: string[] }>;
}

export interface MappedCsvRow {
  record: number;
  values: Record<string, string>;
}

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function csvError(message: string): Error {
  return new Error(message);
}

function validateCsvByteLength(text: string): void {
  if (new TextEncoder().encode(text).byteLength > CSV_LIMITS.bytes) {
    throw csvError('The CSV file exceeds the 10 MiB limit.');
  }
}

function removeTerminalRecordTerminator(text: string): string {
  if (text.endsWith('\r\n')) {
    return text.slice(0, -2);
  }
  if (text.endsWith('\n') || text.endsWith('\r')) {
    return text.slice(0, -1);
  }
  return text;
}

function validateHeaders(row: readonly string[]): string[] {
  if (row.length > CSV_LIMITS.columns) {
    throw csvError(`The CSV file exceeds the limit of ${CSV_LIMITS.columns} columns.`);
  }

  const protectedHeaders = row.some((header) => header.trim().startsWith('__polsia_'));
  const headers = protectedHeaders ? [...row] : row.map((header) => header.trim());
  if (headers.length === 0 || headers.some((header) => header.length === 0)) {
    throw csvError('Every CSV column must have a header.');
  }
  if (headers.some((header) => header.length > CSV_LIMITS.cellCharacters)) {
    throw csvError(
      `A CSV header exceeds the limit of ${CSV_LIMITS.cellCharacters.toLocaleString('en-US')} characters.`,
    );
  }
  if (new Set(headers).size !== headers.length) {
    throw csvError('The CSV file contains a duplicate header.');
  }
  return headers;
}

function validateFields(fields: readonly CsvField[]): void {
  const keys = new Set<string>();
  for (const field of fields) {
    if (RESERVED_KEYS.has(field.key)) {
      throw csvError(`The field key "${field.key}" is reserved.`);
    }
    if (!FIELD_KEY_PATTERN.test(field.key)) {
      throw csvError(`The field key "${field.key}" is invalid.`);
    }
    if (keys.has(field.key)) {
      throw csvError(`The field key "${field.key}" is duplicated.`);
    }
    keys.add(field.key);
  }
}

function firstParsedRecord(text: string, delimiter: CsvDelimiter): string[] {
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const result = Papa.parse<string[]>(source, {
    delimiter,
    dynamicTyping: false,
    header: false,
    preview: 1,
    skipEmptyLines: false,
  });
  if (result.errors.length > 0) {
    throw csvError('The CSV file is invalid.');
  }
  const row = result.data[0];
  if (!row || (row.length === 1 && row[0] === '')) {
    throw csvError('The CSV file must contain a header.');
  }
  return row;
}

export function parseCsv(text: string, delimiter: CsvDelimiter): ParsedCsv {
  validateCsvByteLength(text);
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const source = removeTerminalRecordTerminator(withoutBom);
  let headers: string[] | undefined;
  const rows: ParsedCsv['rows'] = [];
  let record = 0;
  let dataRecords = 0;
  let failure: Error | undefined;

  Papa.parse<string[]>(source, {
    delimiter,
    dynamicTyping: false,
    header: false,
    skipEmptyLines: false,
    step(result, parser) {
      record += 1;
      if (result.errors.length > 0) {
        failure = csvError('The CSV file is invalid.');
        parser.abort();
        return;
      }

      const cells = result.data;
      if (!headers) {
        try {
          headers = validateHeaders(cells);
        } catch (error) {
          failure = error instanceof Error ? error : csvError('The CSV file is invalid.');
          parser.abort();
        }
        return;
      }

      dataRecords += 1;
      if (dataRecords > CSV_LIMITS.records) {
        failure = csvError(
          `The file exceeds the limit of ${CSV_LIMITS.records.toLocaleString('en-US')} records.`,
        );
        parser.abort();
        return;
      }

      if (cells.every((cell) => cell === '')) {
        return;
      }
      if (cells.length !== headers.length) {
        failure = csvError(`Record ${record} has the wrong number of columns.`);
        parser.abort();
        return;
      }
      if (cells.some((cell) => cell.length > CSV_LIMITS.cellCharacters)) {
        failure = csvError(
          `Record ${record} contains a cell longer than ${CSV_LIMITS.cellCharacters.toLocaleString('en-US')} characters.`,
        );
        parser.abort();
        return;
      }

      rows.push({ record, cells });
    },
  });

  if (failure) {
    throw failure;
  }
  if (!headers) {
    throw csvError('The CSV file must contain a header.');
  }
  return { headers, rows };
}

export function decodeCsv(bytes: Uint8Array): string {
  if (bytes.byteLength > CSV_LIMITS.bytes) {
    throw csvError('The CSV file exceeds the 10 MiB limit.');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw csvError('The file must be UTF-8 encoded.');
  }
}

export function readCsvHeaders(text: string, delimiter: CsvDelimiter): string[] {
  validateCsvByteLength(text);
  return validateHeaders(firstParsedRecord(text, delimiter));
}

export function suggestMapping(
  headers: readonly string[],
  fields: readonly CsvField[],
): CsvMapping {
  validateFields(fields);
  const normalizedHeaders = headers.map((header) => header.trim().toLocaleLowerCase());
  const candidates = fields.map((field) => {
    const names = new Set(
      [field.key, field.label, ...(field.aliases ?? [])].map((name) =>
        name.trim().toLocaleLowerCase(),
      ),
    );
    return normalizedHeaders
      .map((header, index) => (names.has(header) ? index : -1))
      .filter((index) => index >= 0);
  });

  const mapping: CsvMapping = Object.create(null);
  fields.forEach((field, fieldIndex) => {
    const matches = candidates[fieldIndex] ?? [];
    if (matches.length !== 1) {
      return;
    }
    const column = matches[0];
    if (column === undefined) {
      return;
    }
    const matchingFields = candidates.filter((other) => other.includes(column));
    if (matchingFields.length === 1) {
      mapping[field.key] = column;
    }
  });
  return mapping;
}

export function mapCsv(
  parsed: ParsedCsv,
  fields: readonly CsvField[],
  mapping: CsvMapping,
): MappedCsvRow[] {
  validateFields(fields);
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const columns = new Set<number>();

  for (const [fieldKey, column] of Object.entries(mapping)) {
    if (RESERVED_KEYS.has(fieldKey)) {
      throw csvError(`The mapping key "${fieldKey}" is reserved.`);
    }
    if (!fieldsByKey.has(fieldKey)) {
      throw csvError(`The mapping contains the unknown field "${fieldKey}".`);
    }
    if (!Number.isInteger(column) || column < 0 || column >= parsed.headers.length) {
      throw csvError(`The mapping for field "${fieldKey}" uses an invalid index.`);
    }
    if (columns.has(column)) {
      throw csvError(`Column ${column} is reused in the mapping.`);
    }
    columns.add(column);
  }

  for (const field of fields) {
    if (field.required && !Object.hasOwn(mapping, field.key)) {
      throw csvError(`The required field "${field.label}" must be mapped.`);
    }
  }

  return parsed.rows.map(({ record, cells }) => {
    const values: Record<string, string> = Object.create(null);
    for (const [fieldKey, column] of Object.entries(mapping)) {
      const value = cells[column];
      if (value === undefined) {
        throw csvError(`The mapping for field "${fieldKey}" uses an invalid index.`);
      }
      values[fieldKey] = value;
    }
    return { record, values };
  });
}

export function createExampleCsv(fields: readonly CsvField[], delimiter: CsvDelimiter): string {
  validateFields(fields);
  return Papa.unparse(
    [fields.map((field) => field.label), fields.map((field) => field.example ?? '')],
    { delimiter, escapeFormulae: true },
  );
}
