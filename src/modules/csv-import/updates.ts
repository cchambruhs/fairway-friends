// @polsia:framework-owned

import type {
  CsvFieldChange,
  CsvInput,
  CsvIssue,
  CsvPreview,
  CsvVersions,
  ImportCounts,
} from './contracts';
import {
  CSV_LIMITS,
  CSV_MAX_BODY_BYTES,
  CSV_SNAPSHOT_BYTES,
  commitResponseSchema,
} from './contracts';
import { mapCsv, parseCsv } from './parser';
import type { CsvRoundTrip } from './reimport';
import { decodeReimport, validateRoundTrip } from './reimport';
import type { CsvTarget, ImportContext } from './server';
import { CsvImportError } from './server';
import type { RowValidation } from './validation';

export interface CsvChange<Row> {
  action: 'create' | 'update';
  key: string;
  value: Row;
  expectedVersion: string | null;
  fields: readonly string[];
}
export interface CsvExistingRow<Row> {
  key: string;
  value: Row;
  version: string;
}
export interface CsvUpdates<Row> {
  keyFields: readonly string[];
  writableFields: readonly string[];
  identify(raw: Record<string, string>): RowValidation<string>;
  serialize(row: Row): Record<string, string | null>;
  parseRow?(raw: Record<string, string | null>): RowValidation<Row>;
  roundTrip?: CsvRoundTrip;
  findExistingRows(keys: readonly string[], context: ImportContext): Promise<CsvExistingRow<Row>[]>;
  applyChanges(
    changes: readonly CsvChange<Row>[],
    context: ImportContext,
  ): Promise<Required<ImportCounts>>;
}

export function validateUpdates<Row>(target: CsvTarget<Row>): void {
  const updates = target.updates;
  if (!updates) return;
  const keys = target.fields.map((field) => field.key);
  for (const list of [updates.keyFields, updates.writableFields]) {
    if (
      !Array.isArray(list) ||
      list.length === 0 ||
      new Set(list).size !== list.length ||
      list.some((key) => !keys.includes(key))
    ) {
      throw new Error('Invalid CSV update configuration.');
    }
  }
  if (
    updates.keyFields.some((key) => updates.writableFields.includes(key)) ||
    [updates.identify, updates.serialize, updates.findExistingRows, updates.applyChanges].some(
      (fn) => typeof fn !== 'function',
    ) ||
    (updates.parseRow !== undefined && typeof updates.parseRow !== 'function')
  ) {
    throw new Error('Invalid CSV update configuration.');
  }
  validateRoundTrip(updates.roundTrip, keys, updates.writableFields);
}

function adapterError(): never {
  throw new Error('Invalid CSV update adapter result.');
}
function serialize<Row>(value: Row, target: CsvTarget<Row>, updates: CsvUpdates<Row>) {
  const raw = updates.serialize(value);
  const result: Record<string, string | null> = Object.create(null);
  for (const field of target.fields) {
    const cell = raw[field.key];
    if (cell !== null && (typeof cell !== 'string' || cell.length > CSV_LIMITS.cellCharacters))
      adapterError();
    result[field.key] = cell;
  }
  return result;
}
function parseComplete<Row>(
  raw: Record<string, string | null>,
  target: CsvTarget<Row>,
  updates: CsvUpdates<Row>,
): RowValidation<Row> {
  const issues: Array<{ field: string; message: string }> = [];
  for (const field of target.fields) {
    const value = raw[field.key];
    const nullable = updates.roundTrip?.columns.some(
      (column) => column.key === field.key && column.nullable,
    );
    if (field.required && (value === undefined || (value === null ? !nullable : !value.trim()))) {
      issues.push({ field: field.key, message: `The "${field.label}" field is required.` });
    }
  }
  if (issues.length) return { ok: false, issues };
  if (updates.parseRow) return updates.parseRow(raw);
  const strings: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(raw)) {
    if (value === null)
      return {
        ok: false,
        issues: [
          {
            field: key,
            message: 'This destination must define a parser for null values.',
          },
        ],
      };
    strings[key] = value;
  }
  return target.parseRow(strings);
}

export async function prepareUpdates<Row>(
  input: CsvInput,
  target: CsvTarget<Row>,
  context: ImportContext,
) {
  if (input.targetId !== target.id)
    throw new CsvImportError(400, 'TARGET_MISMATCH', 'The destination does not match.');
  const updates = target.updates;
  if (!updates)
    throw new CsvImportError(400, 'UNSUPPORTED_MODE', 'This destination only accepts new records.');
  const mode = input.mode ?? 'create';
  let parsed: ReturnType<typeof parseCsv>;
  let decoded: ReturnType<typeof decodeReimport>;
  let mapped: ReturnType<typeof mapCsv>;
  try {
    parsed = parseCsv(input.csv, input.delimiter);
    decoded = decodeReimport(parsed, updates.roundTrip, target.id, context.scopeId);
    const fields = target.fields.map((field) => ({
      ...field,
      required: !decoded && updates.keyFields.includes(field.key),
    }));
    mapped = mapCsv(parsed, fields, input.mapping);
    if (decoded) {
      for (const [field, column] of Object.entries(input.mapping)) {
        if (parsed.headers[column] !== field || !decoded.columns.includes(field)) {
          throw new Error('Exported columns must keep their original mapping.');
        }
      }
    }
  } catch (error) {
    throw new CsvImportError(
      400,
      'INVALID_CSV',
      error instanceof Error ? error.message : 'The CSV file is invalid.',
    );
  }

  const issues: CsvIssue[] = [];
  const invalidRecords = new Set<number>();
  const rows: Array<{
    record: number;
    key: string;
    raw: Record<string, string | null>;
    exported: boolean;
    version: string;
    newIdentity: boolean;
  }> = [];
  function issue(record: number, message: string, field: string | null = null) {
    invalidRecords.add(record);
    issues.push({ record, field, message });
  }
  function parsedIssues(record: number, errors: Array<{ field: string | null; message: string }>) {
    if (!errors.length) issue(record, 'This record is invalid.');
    for (const error of errors) issue(record, error.message, error.field);
  }
  for (const row of mapped) {
    const exported = decoded?.rows.get(row.record);
    const raw: Record<string, string | null> = Object.create(null);
    for (const [field, value] of Object.entries(row.values))
      raw[field] = exported ? (exported.values[field] ?? null) : value;
    let key: string;
    if (exported?.key) key = exported.key;
    else if (exported) {
      if (mode === 'update') {
        issue(row.record, 'A new row cannot be imported in update mode.');
        continue;
      }
      const value = parseComplete(raw, target, updates);
      if (!value.ok) {
        parsedIssues(row.record, value.issues);
        continue;
      }
      key = target.keyOf(value.value);
    } else {
      const identity = updates.identify(row.values);
      if (!identity.ok) {
        parsedIssues(row.record, identity.issues);
        continue;
      }
      key = identity.value;
    }
    if (
      typeof key !== 'string' ||
      !key.trim() ||
      key.length > CSV_LIMITS.cellCharacters ||
      ['__proto__', 'constructor', 'prototype'].includes(key)
    ) {
      issue(row.record, 'The business key of this record is invalid.');
      continue;
    }
    rows.push({
      record: row.record,
      key,
      raw,
      exported: !!exported,
      version: exported?.version ?? '',
      newIdentity: !!exported && !exported.key,
    });
  }
  const recordsByKey = new Map<string, number[]>();
  for (const row of rows)
    recordsByKey.set(row.key, [...(recordsByKey.get(row.key) ?? []), row.record]);
  for (const records of recordsByKey.values())
    if (records.length > 1)
      for (const record of records)
        issue(record, 'This business key appears more than once in the file.');
  const candidates = rows.filter((row) => !invalidRecords.has(row.record));
  const existing = new Map<string, CsvExistingRow<Row>>();
  let snapshotBytes = 2;
  let snapshotEntries = 0;
  function accountVersion(key: string, version: string | null) {
    snapshotBytes +=
      new TextEncoder().encode(`${JSON.stringify(key)}:${JSON.stringify(version)}`).byteLength +
      (snapshotEntries++ ? 1 : 0);
    if (snapshotBytes > CSV_SNAPSHOT_BYTES)
      throw new CsvImportError(
        413,
        'SNAPSHOT_TOO_LARGE',
        'The keys and versions exceed the 4 MiB limit. Make the file smaller.',
      );
  }
  for (let offset = 0; offset < candidates.length; offset += 500) {
    const keys = candidates.slice(offset, offset + 500).map((row) => row.key);
    for (const found of await updates.findExistingRows(keys, context)) {
      if (
        !keys.includes(found.key) ||
        existing.has(found.key) ||
        typeof found.version !== 'string' ||
        !found.version.trim() ||
        found.version.length > CSV_LIMITS.cellCharacters ||
        target.keyOf(found.value) !== found.key
      )
        adapterError();
      accountVersion(found.key, found.version);
      existing.set(found.key, found);
    }
  }
  const expectedVersions: CsvVersions = {};
  const changes: CsvChange<Row>[] = [];
  const display = new Map<number, CsvPreview['rows'][number]>();
  let skipped = 0;
  let conflict = false;
  for (const row of candidates) {
    const found = existing.get(row.key);
    expectedVersions[row.key] = found?.version ?? null;
    if (!found) accountVersion(row.key, null);
    if (
      row.exported &&
      ((!row.newIdentity && !found) ||
        (row.newIdentity && found && mode !== 'create') ||
        (found && mode !== 'create' && row.version !== found.version))
    ) {
      conflict = true;
      issue(row.record, 'The exported version no longer matches. Export this data again.');
      continue;
    }
    if (!found && mode === 'update') {
      issue(row.record, 'This key does not match any authorized record.');
      continue;
    }
    const before = found ? serialize(found.value, target, updates) : undefined;
    // Create-only protected reimports skip existing data without modifying it.
    if (found && mode === 'create') {
      skipped++;
      display.set(row.record, {
        record: row.record,
        values: Object.fromEntries(
          Object.entries(row.raw).map(([key, value]) => [key, value ?? '∅']),
        ),
        status: 'skip',
      });
      continue;
    }
    if (!found && row.exported) {
      for (const key of Object.keys(row.raw)) {
        if (!updates.writableFields.includes(key) && !updates.keyFields.includes(key)) {
          issue(
            row.record,
            'This read-only field must come from the application, not the file.',
            key,
          );
        }
      }
      if (invalidRecords.has(row.record)) continue;
    }
    const merged = { ...before, ...row.raw };
    const value = parseComplete(merged, target, updates);
    if (!value.ok) {
      parsedIssues(row.record, value.issues);
      continue;
    }
    if (target.keyOf(value.value) !== row.key) {
      issue(row.record, 'The business key cannot be changed.');
      continue;
    }
    const after = serialize(value.value, target, updates);
    const differences: CsvFieldChange[] = [];
    if (before) {
      for (const field of target.fields) {
        const key = field.key;
        if (after[key] === before[key]) continue;
        if (!Object.hasOwn(row.raw, key) || !updates.writableFields.includes(key)) {
          issue(row.record, 'This field cannot be changed by this import.', key);
          continue;
        }
        differences.push({ field: key, before: before[key] ?? null, after: after[key] ?? null });
      }
    }
    if (invalidRecords.has(row.record)) continue;
    const action = found ? (differences.length ? 'update' : 'skip') : 'create';
    display.set(row.record, {
      record: row.record,
      values: Object.fromEntries(Object.entries(after).map(([key, cell]) => [key, cell ?? '∅'])),
      status: action,
      ...(action === 'update' ? { changes: differences } : {}),
    });
    if (action === 'skip') skipped++;
    else
      changes.push({
        action,
        key: row.key,
        value: value.value,
        expectedVersion: found?.version ?? null,
        fields:
          action === 'update' ? differences.map((change) => change.field) : Object.keys(row.raw),
      });
  }
  if (
    (input.mode ?? 'create') !== 'create' &&
    new TextEncoder().encode(JSON.stringify({ ...input, action: 'commit', expectedVersions }))
      .byteLength > CSV_MAX_BODY_BYTES
  ) {
    throw new CsvImportError(
      413,
      'BODY_TOO_LARGE',
      'The file and its versions exceed the transport limit. Make the file smaller.',
    );
  }
  const preview: CsvPreview = {
    total: mapped.length,
    valid: mapped.length - invalidRecords.size,
    invalid: invalidRecords.size,
    existing: existing.size,
    toCreate: changes.filter((change) => change.action === 'create').length,
    toUpdate: changes.filter((change) => change.action === 'update').length,
    expectedVersions,
    rows: mapped
      .slice(0, 20)
      .map((row) =>
        invalidRecords.has(row.record)
          ? { record: row.record, values: {}, status: 'error' }
          : (display.get(row.record) ?? { record: row.record, values: {}, status: 'error' }),
      ),
    issues: issues.slice(0, 100),
    issueCount: issues.length,
  };
  return { preview, changes, skipped, updates, conflict };
}

export async function commitUpdates<Row>(
  input: CsvInput,
  target: CsvTarget<Row>,
  context: ImportContext,
): Promise<ImportCounts> {
  const prepared = await prepareUpdates(input, target, context);
  if (prepared.conflict)
    throw new CsvImportError(
      409,
      'VERSION_CONFLICT',
      'The exported data has changed. Generate a new export.',
      prepared.preview.issues,
    );
  if ((input.mode ?? 'create') !== 'create') {
    const expected = input.expectedVersions;
    const actual = prepared.preview.expectedVersions ?? {};
    if (!expected)
      throw new CsvImportError(
        400,
        'PREVIEW_REQUIRED',
        'Check the file before confirming the changes.',
      );
    if (
      Object.keys(expected).length !== Object.keys(actual).length ||
      Object.entries(actual).some(
        ([key, version]) => !Object.hasOwn(expected, key) || expected[key] !== version,
      )
    ) {
      throw new CsvImportError(
        409,
        'VERSION_CONFLICT',
        'The data has changed. Check the file again.',
      );
    }
  }
  if (prepared.preview.invalid)
    throw new CsvImportError(
      422,
      'INVALID_ROWS',
      'Correct the invalid records before importing.',
      prepared.preview.issues,
    );
  if (!prepared.changes.length) return { created: 0, updated: 0, skipped: prepared.skipped };
  const result = await prepared.updates.applyChanges(prepared.changes, context);
  const checked = commitResponseSchema.parse({ ok: true, data: result }).data;
  const creates = prepared.changes.filter((change) => change.action === 'create').length;
  const updates = prepared.changes.length - creates;
  if (checked.updated !== updates || checked.created !== creates || checked.skipped !== 0)
    adapterError();
  return { ...checked, skipped: prepared.skipped };
}
