// @polsia:user-owned — editable, confirmed UDisc CSV imports through the CSV and upload modules.
'use client';

import { FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { apiFetch } from '@/lib/api-client';
import { parseUDiscScorecardsCsv } from '@/lib/business/udisc-scorecard-csv';
import type { HistoricalRoundPlayerInput } from '@/lib/contracts/round-history';
import {
  type HistoricalRoundCsvDraft,
  HistoricalRoundCsvDraftSchema,
  type HistoricalRoundItem,
  HistoricalRoundListSchema,
  ROUND_HISTORY_UPDATED_EVENT,
} from '@/lib/contracts/round-history';
import { HistoricalRoundPreviewResponseSchema } from '@/lib/contracts/round-history-preview';
import { UDiscScorecardLinkSchema, udiscScorecardId } from '@/lib/contracts/scorecard-import';
import {
  CSV_LIMITS,
  commitResponseSchema,
  previewResponseSchema,
} from '@/modules/csv-import/contracts';
import { decodeCsv } from '@/modules/csv-import/parser';
import { FileUploadError, uploadFile } from '@/modules/file-upload/client';

const MAX_CSV_BYTES = CSV_LIMITS.bytes;
const CSV_TARGET_ID = 'historical-rounds';

interface EditableRound {
  key: string;
  value: HistoricalRoundCsvDraft;
}

type CsvPreview = z.infer<typeof previewResponseSchema>;
type UploadedCsv = Awaited<ReturnType<typeof uploadFile>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof FileUploadError) return error.message;
  if (error instanceof Error) {
    if (isRecord(error.cause) && isRecord(error.cause.error)) {
      const message = error.cause.error.message;
      if (typeof message === 'string') return message;
    }
    return error.message || fallback;
  }
  return fallback;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function normalizedCsv(rounds: readonly HistoricalRoundCsvDraft[]): string {
  return ['round_json', ...rounds.map((round) => csvCell(JSON.stringify(round)))].join('\r\n');
}

function createRequest(rounds: readonly HistoricalRoundCsvDraft[], action: 'preview' | 'commit') {
  return {
    action,
    targetId: CSV_TARGET_ID,
    csv: normalizedCsv(rounds),
    delimiter: ',' as const,
    mapping: { round_json: 0 },
  };
}

function roundKey(round: HistoricalRoundCsvDraft): string {
  const sourceId = round.sourceId ?? (round.sourceUrl ? udiscScorecardId(round.sourceUrl) : null);
  if (sourceId) return `source-${sourceId}`;
  return `round-${JSON.stringify([
    round.playedOn ?? '',
    round.courseName ?? '',
    round.layoutName ?? '',
    round.roundMetadata ?? {},
    round.players?.map((player) => [
      player.sourcePlayerId ?? '',
      player.pdgaNumber ?? '',
      player.name,
    ]),
  ])}`;
}

function playerKey(player: {
  id?: string | null;
  name: string;
  sourcePlayerId?: string | null;
  pdgaNumber?: string | null;
}): string {
  return player.id ?? player.sourcePlayerId ?? player.pdgaNumber ?? player.name;
}

function previewFieldId(inputId: string, roundIndex: number, field: string, subject = ''): string {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${safe(inputId)}-round-${roundIndex}${subject ? `-${safe(subject)}` : ''}-${safe(field)}`;
}

function holeValuesText(
  values: number[] | undefined,
  entries: Array<{ holeNumber: number; value: number }> | undefined,
): string {
  if (values) return values.join(', ');
  return entries?.map((entry) => `${entry.holeNumber}:${entry.value}`).join(', ') ?? '';
}

function parseScoreText(value: string):
  | { holeScores: number[]; holeScoreEntries?: never }
  | {
      holeScores?: never;
      holeScoreEntries: NonNullable<HistoricalRoundPlayerInput['holeScoreEntries']>;
    }
  | null {
  if (!value.trim()) return null;
  const parts = value.split(',').map((part) => part.trim());
  const numbered = parts.every((part) => /^\d+\s*[:=]\s*\d+$/.test(part));
  if (numbered) {
    return {
      holeScoreEntries: parts.map((part) => {
        const [holeNumber, rawValue] = part.split(/\s*[:=]\s*/);
        return { holeNumber: Number(holeNumber), score: Number(rawValue) };
      }),
    };
  }
  if (parts.some((part) => part.includes(':') || part.includes('='))) return null;
  return { holeScores: parts.map((part) => (part ? Number(part) : Number.NaN)) };
}

function parseParText(
  value: string,
):
  | { holePars: number[]; holeParEntries?: never }
  | { holePars?: never; holeParEntries: NonNullable<HistoricalRoundCsvDraft['holeParEntries']> }
  | null {
  if (!value.trim()) return null;
  const parts = value.split(',').map((part) => part.trim());
  const numbered = parts.every((part) => /^\d+\s*[:=]\s*\d+$/.test(part));
  if (numbered) {
    return {
      holeParEntries: parts.map((part) => {
        const [holeNumber, rawValue] = part.split(/\s*[:=]\s*/);
        return { holeNumber: Number(holeNumber), par: Number(rawValue) };
      }),
    };
  }
  if (parts.some((part) => part.includes(':') || part.includes('='))) return null;
  return { holePars: parts.map((part) => (part ? Number(part) : Number.NaN)) };
}

function saveMatchesDraft(item: HistoricalRoundItem, draft: HistoricalRoundCsvDraft): boolean {
  const sourceId = draft.sourceId ?? (draft.sourceUrl ? udiscScorecardId(draft.sourceUrl) : null);
  if (
    item.playedOn !== (draft.playedOn ?? null) ||
    item.courseName !== (draft.courseName ?? null) ||
    item.layoutName !== (draft.layoutName ?? null) ||
    item.totalPar !== (draft.totalPar ?? null) ||
    item.holeCount !== (draft.holeCount ?? null) ||
    item.sourceId !== sourceId ||
    item.sourceUrl !== (draft.sourceUrl ?? null) ||
    JSON.stringify(item.roundMetadata) !== JSON.stringify(draft.roundMetadata ?? null) ||
    JSON.stringify(item.holePars) !== JSON.stringify(draft.holePars ?? null) ||
    JSON.stringify(item.holeParEntries) !== JSON.stringify(draft.holeParEntries ?? null)
  ) {
    return false;
  }
  if (item.players.length !== (draft.players?.length ?? 0)) return false;
  const savedPlayers = new Map(item.players.map((player) => [playerKey(player), player]));
  return (draft.players ?? []).every((player) => {
    const saved = savedPlayers.get(playerKey(player));
    if (!saved) return false;
    const savedScores = saved.holeScores
      ? saved.holeScores
      : saved.holeScoreEntries?.map((entry) => entry.score);
    const draftScores = player.holeScores
      ? player.holeScores
      : player.holeScoreEntries?.map((entry) => entry.score);
    return (
      saved.name === player.name &&
      saved.sourcePlayerId === (player.sourcePlayerId ?? null) &&
      saved.pdgaNumber === (player.pdgaNumber ?? null) &&
      saved.totalScore === (player.totalScore ?? null) &&
      JSON.stringify(savedScores ?? null) === JSON.stringify(draftScores ?? null) &&
      JSON.stringify(saved.holeScoreEntries) === JSON.stringify(player.holeScoreEntries ?? null)
    );
  });
}

function missingFields(round: HistoricalRoundCsvDraft): string[] {
  const missing: string[] = [];
  if (!round.playedOn) missing.push('date');
  if (!round.courseName) missing.push('course');
  if (!round.layoutName) missing.push('layout');
  if (!round.holeCount) missing.push('hole count');
  if (!round.holePars && !round.holeParEntries) missing.push('hole pars');
  if (
    round.players?.some(
      (player) => !player.totalScore && !player.holeScores && !player.holeScoreEntries,
    )
  ) {
    missing.push('one or more player scores');
  }
  return missing;
}

function consistencyWarnings(round: HistoricalRoundCsvDraft): string[] {
  const warnings: string[] = [];
  const expectedHoleCount = round.holeCount;
  const parCount = round.holePars?.length ?? round.holeParEntries?.length;
  if (expectedHoleCount !== undefined && parCount !== undefined && parCount !== expectedHoleCount) {
    warnings.push(
      `The round declares ${expectedHoleCount} holes, while ${parCount} pars were supplied. No pars were added or removed.`,
    );
  }

  for (const player of round.players ?? []) {
    const scores = player.holeScores ?? player.holeScoreEntries?.map((entry) => entry.score);
    if (expectedHoleCount !== undefined && scores && scores.length !== expectedHoleCount) {
      warnings.push(
        `${player.name}: ${scores.length} hole scores were supplied for a ${expectedHoleCount}-hole round. Values are unchanged.`,
      );
    }
    if (scores && player.totalScore !== undefined) {
      const sum = scores.reduce((total, score) => total + score, 0);
      if (sum !== player.totalScore) {
        warnings.push(
          `${player.name}: hole scores sum to ${sum}, but the supplied total is ${player.totalScore}. Values are unchanged.`,
        );
      }
    }
  }
  return warnings;
}

export function UDiscExportImport({ initialSourceUrl }: { initialSourceUrl: string }) {
  const inputId = useId();
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl);
  const [file, setFile] = useState<File | null>(null);
  const [rounds, setRounds] = useState<EditableRound[]>([]);
  const [serverPreview, setServerPreview] = useState<CsvPreview | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedCsv | null>(null);
  const [currentProfile, setCurrentProfile] = useState({
    displayName: 'Signed-in player',
    exists: false,
  });

  useEffect(() => {
    let active = true;
    apiFetch('/api/round-history/preview', { schema: HistoricalRoundPreviewResponseSchema })
      .then((preview) => {
        if (active) setCurrentProfile(preview.currentProfile);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function clearSelectedFile() {
    setFile(null);
    setRounds([]);
    setServerPreview(null);
    setFileError(null);
    setSaveError(null);
    setSavedSummary(null);
    setUploadProgress(null);
    setUploaded(null);
  }

  async function requestPreview(drafts: readonly HistoricalRoundCsvDraft[]): Promise<CsvPreview> {
    return apiFetch('/api/csv-import', {
      method: 'POST',
      body: JSON.stringify(createRequest(drafts, 'preview')),
      schema: previewResponseSchema,
    });
  }

  async function selectFile(selected: File | undefined) {
    if (!selected || isParsing || isSaving) return;
    setFile(selected);
    setRounds([]);
    setServerPreview(null);
    setUploaded(null);
    setFileError(null);
    setSaveError(null);
    setSavedSummary(null);

    if (!selected.name.toLocaleLowerCase('en-US').endsWith('.csv')) {
      setFileError(
        'Choose a UDisc CSV export. PDF, image, and spreadsheet files are not supported.',
      );
      return;
    }
    if (selected.size === 0 || selected.size > MAX_CSV_BYTES) {
      setFileError('Choose a non-empty CSV export smaller than 10 MiB.');
      return;
    }

    setIsParsing(true);
    try {
      let text: string;
      try {
        text = decodeCsv(new Uint8Array(await selected.arrayBuffer()));
      } catch (error) {
        throw new Error(errorMessage(error, 'The selected file is not a UTF-8 CSV export.'));
      }
      const link = sourceUrl.trim();
      const validLink = link ? UDiscScorecardLinkSchema.safeParse(link) : null;
      if (validLink && !validLink.success) {
        throw new Error('Correct the CardCast link above or clear it before previewing this CSV.');
      }
      const parsed = parseUDiscScorecardsCsv(text, validLink?.success ? validLink.data : undefined);
      const keys = parsed.map(roundKey);
      if (new Set(keys).size !== keys.length) {
        throw new Error(
          'Two rounds in this export have no distinct source ID or metadata. Export them separately to avoid merging scores.',
        );
      }
      const validated = parsed.map((value) => {
        const result = HistoricalRoundCsvDraftSchema.safeParse(value);
        if (!result.success) {
          throw new Error(
            result.error.issues[0]?.message ?? 'A scorecard in this export is invalid.',
          );
        }
        return result.data;
      });
      const preview = await requestPreview(validated);
      setRounds(validated.map((value, index) => ({ key: keys[index] ?? roundKey(value), value })));
      setServerPreview(preview);
      if (preview.data.issueCount > 0) {
        setFileError(
          preview.data.issues[0]?.message ??
            'Correct the highlighted scorecard fields before saving.',
        );
      }
    } catch (error) {
      setFileError(
        errorMessage(
          error,
          'This export could not be parsed. Keep the file and try a supported UDisc CSV export.',
        ),
      );
    } finally {
      setIsParsing(false);
    }
  }

  function updateRound(
    key: string,
    update: (round: HistoricalRoundCsvDraft) => HistoricalRoundCsvDraft,
  ) {
    setRounds((current) =>
      current.map((item) => (item.key === key ? { ...item, value: update(item.value) } : item)),
    );
    setServerPreview(null);
    setFileError(null);
    setSaveError(null);
  }

  function updatePlayer(
    roundKeyValue: string,
    key: string,
    update: (
      player: NonNullable<HistoricalRoundCsvDraft['players']>[number],
    ) => NonNullable<HistoricalRoundCsvDraft['players']>[number],
  ) {
    updateRound(roundKeyValue, (round) => ({
      ...round,
      players: round.players?.map((player) =>
        playerKey(player) === key ? update(player) : player,
      ),
    }));
  }

  async function validateEdits() {
    setFileError(null);
    setSaveError(null);
    setServerPreview(null);
    const parsed = rounds.map((item) => HistoricalRoundCsvDraftSchema.safeParse(item.value));
    const invalid = parsed.find((item) => !item.success);
    if (invalid && !invalid.success) {
      setFileError(invalid.error.issues[0]?.message ?? 'Correct the invalid scorecard fields.');
      return;
    }
    const valid = parsed.flatMap((item) => (item.success ? [item.data] : []));
    try {
      const preview = await requestPreview(valid);
      setServerPreview(preview);
      if (preview.data.issueCount > 0) {
        setFileError(
          preview.data.issues[0]?.message ?? 'Correct the invalid scorecard fields before saving.',
        );
      }
    } catch (error) {
      setFileError(
        errorMessage(
          error,
          'The edited scorecards could not be validated. Your file and edits are still here.',
        ),
      );
    }
  }

  async function confirmImport() {
    if (!file || rounds.length === 0 || !serverPreview || isSaving) return;
    if (serverPreview.data.issueCount > 0 || serverPreview.data.invalid > 0) {
      setFileError(
        'Resolve every validation issue and preview the edited scorecards again before saving.',
      );
      return;
    }
    if (serverPreview.data.toCreate === 0) {
      try {
        const history = await apiFetch('/api/round-history', { schema: HistoricalRoundListSchema });
        const missing = rounds.some(({ value }) => {
          const sourceId =
            value.sourceId ?? (value.sourceUrl ? udiscScorecardId(value.sourceUrl) : null);
          const matches = sourceId
            ? history.items.filter((round) => round.sourceId === sourceId)
            : history.items.filter(
                (round) => round.sourceId === null && saveMatchesDraft(round, value),
              );
          return (
            matches.length !== 1 ||
            (sourceId !== null && matches[0]?.sourceUrl !== (value.sourceUrl ?? null))
          );
        });
        if (missing) {
          throw new Error(
            'A scorecard marked as existing was not found with its exact source attribution in round history. No new data was saved; keep the CSV and review your history.',
          );
        }
        setSavedSummary(
          `No new round was added. Read back ${rounds.length} existing scorecard${rounds.length === 1 ? '' : 's'}; saved records were left unchanged.`,
        );
      } catch (error) {
        const message = errorMessage(
          error,
          'Existing scorecards could not be verified in round history. No data was saved; keep the CSV and try again.',
        );
        setSaveError(message);
        toast.error(message);
      }
      return;
    }

    setIsSaving(true);
    setFileError(null);
    setSaveError(null);
    setSavedSummary(null);
    try {
      const attachment = uploaded ?? (await uploadFile(file, { onProgress: setUploadProgress }));
      setUploaded(attachment);
      const finalRounds = rounds.map((item) =>
        HistoricalRoundCsvDraftSchema.parse({
          ...item.value,
          entryMethod: 'csv',
          sourceFileKey: attachment.key,
          sourceFileUrl: attachment.url,
        }),
      );
      const commit = await apiFetch('/api/csv-import', {
        method: 'POST',
        body: JSON.stringify(createRequest(finalRounds, 'commit')),
        schema: commitResponseSchema,
      });
      const history = await apiFetch('/api/round-history', { schema: HistoricalRoundListSchema });
      const readback = new Map(history.items.map((item) => [item.id, item]));
      const unresolved: string[] = [];
      const unlinkedNames = new Set<string>();
      for (const item of rounds) {
        const draft = item.value;
        const sourceId =
          draft.sourceId ?? (draft.sourceUrl ? udiscScorecardId(draft.sourceUrl) : null);
        const saved = sourceId
          ? history.items.find((round) => round.sourceId === sourceId)
          : (history.items.find(
              (round) =>
                round.sourceFileKey === attachment.key &&
                round.courseName === (draft.courseName ?? null) &&
                round.playedOn === (draft.playedOn ?? null) &&
                round.layoutName === (draft.layoutName ?? null),
            ) ??
            history.items.find(
              (round) => round.sourceId === null && saveMatchesDraft(round, draft),
            ));
        if (!saved || !readback.has(saved.id)) {
          unresolved.push(sourceId ?? item.key);
          continue;
        }
        for (const player of saved.players) {
          if (!player.matchedToCurrentProfile) unlinkedNames.add(player.name);
        }
        if (
          sourceId &&
          (saved.sourceId !== sourceId || (draft.sourceUrl && saved.sourceUrl !== draft.sourceUrl))
        ) {
          unresolved.push(sourceId);
          continue;
        }
        if (!saveMatchesDraft(saved, draft)) {
          unresolved.push(sourceId ?? item.key);
        }
      }
      if (unresolved.length > 0) {
        throw new Error(
          `Database readback did not match these scorecards: ${unresolved.join(', ')}. No success was reported; check round history before retrying.`,
        );
      }
      window.dispatchEvent(new Event(ROUND_HISTORY_UPDATED_EVENT));
      const { created, skipped } = commit.data;
      const summary =
        created > 0
          ? `Saved ${created} historical round${created === 1 ? '' : 's'} and read the saved records back. ${skipped} duplicate${skipped === 1 ? '' : 's'} left existing history unchanged.${unlinkedNames.size ? ` Unlinked players: ${[...unlinkedNames].join(', ')}.` : ''}`
          : 'No new round was added. Existing source records were read back and left unchanged.';
      setSavedSummary(summary);
      toast.success(
        created > 0
          ? `${created} historical round${created === 1 ? '' : 's'} saved`
          : 'Existing rounds left unchanged',
      );
      if (created > 0) {
        setRounds([]);
        setServerPreview(null);
        setFile(null);
        setUploaded(null);
      }
    } catch (error) {
      const message = errorMessage(
        error,
        'The import was not confirmed. Your file and preview remain available; check round history before retrying.',
      );
      setSaveError(message);
      toast.error(message);
    } finally {
      setUploadProgress(null);
      setIsSaving(false);
    }
  }

  const canConfirm = Boolean(
    file &&
      serverPreview &&
      rounds.length > 0 &&
      serverPreview.data.invalid === 0 &&
      serverPreview.data.issueCount === 0,
  );

  return (
    <section className="ff-cardcast-export-import" aria-labelledby="udisc-csv-title">
      <div className="ff-cardcast-export-heading">
        <FileSpreadsheet aria-hidden="true" />
        <div>
          <h3 id="udisc-csv-title">Import UDisc scorecard CSVs</h3>
          <p>
            Choose a single-card or bulk UDisc CSV export. Nothing is saved until you review and
            confirm it.
          </p>
        </div>
      </div>
      <p className="ff-cardcast-export-help">
        The preview keeps only fields in the export: player names and scores, course, layout, date,
        hole pars, totals, source IDs and available round metadata. Fields absent from the file stay
        blank. A single CardCast link can accompany one scorecard. Bulk files retain exported IDs
        and URLs; without those, the preview uses only date, course, layout, time and repeated par
        rows to separate rounds. No source URL or ID is invented. The original CSV is attached to
        saved rounds.
      </p>
      <div className="ff-cardcast-source-field">
        <label htmlFor="udisc-cardcast-source-url">Original UDisc CardCast link (optional)</label>
        <Input
          id="udisc-cardcast-source-url"
          type="url"
          autoComplete="url"
          inputMode="url"
          placeholder="https://udisc.com/scorecards/N78XJtdFmZ"
          value={sourceUrl}
          disabled={file !== null || isSaving}
          onChange={(event) => setSourceUrl(event.target.value)}
          aria-describedby="udisc-cardcast-source-help"
        />
        <p id="udisc-cardcast-source-help" className="ff-cardcast-export-help">
          A link alone cannot import scores. Add it before choosing a single-card CSV to preserve
          the exact URL and source ID. Clear the selected file to change this link.
        </p>
      </div>
      <label className="ff-cardcast-file-label" htmlFor={inputId}>
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          disabled={isParsing || isSaving}
          onChange={(event) => {
            void selectFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
          className="ff-cardcast-file-input"
        />
        <span className="ff-cardcast-file-action">
          {isParsing || isSaving ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          {isParsing
            ? 'Parsing and checking…'
            : isSaving
              ? 'Uploading and saving…'
              : file
                ? 'Choose a different CSV'
                : 'Choose UDisc CSV'}
        </span>
      </label>
      {file ? (
        <p className="ff-cardcast-export-help">
          Selected file: <strong>{file.name}</strong>
        </p>
      ) : null}
      {file ? (
        <Button
          type="button"
          variant="outline"
          onClick={clearSelectedFile}
          disabled={isParsing || isSaving}
        >
          Clear selected CSV
        </Button>
      ) : null}
      {uploadProgress !== null ? (
        <Progress value={uploadProgress} aria-label={`Uploading CSV: ${uploadProgress}%`} />
      ) : null}

      {fileError ? (
        <p className="ff-cardcast-import-error" role="alert">
          {fileError}
        </p>
      ) : null}
      {saveError ? (
        <p className="ff-cardcast-import-error" role="alert">
          {saveError}
        </p>
      ) : null}

      {rounds.length > 0 ? (
        <section className="ff-udisc-preview" aria-labelledby="udisc-preview-title">
          <div className="ff-udisc-preview-heading">
            <div>
              <p className="ff-course-eyebrow">REVIEW BEFORE SAVING</p>
              <h4 id="udisc-preview-title">
                {rounds.length} scorecard{rounds.length === 1 ? '' : 's'} found
              </h4>
              <p>
                {serverPreview
                  ? `${serverPreview.data.toCreate} new · ${serverPreview.data.existing} already saved · ${serverPreview.data.issueCount} validation issue${serverPreview.data.issueCount === 1 ? '' : 's'}`
                  : 'Edits need a fresh validation preview before confirmation.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void validateEdits()}
              disabled={isParsing || isSaving}
            >
              Validate edits
            </Button>
          </div>
          {serverPreview?.data.issues.length ? (
            <ul className="ff-udisc-preview-issues" aria-label="CSV validation issues">
              {serverPreview.data.issues.map((issue) => (
                <li key={`${issue.record ?? 'file'}-${issue.field ?? 'row'}-${issue.message}`}>
                  {issue.record ? `Row ${issue.record}: ` : ''}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="ff-udisc-round-list">
            {rounds.map(({ key, value }, roundIndex) => (
              <article className="ff-udisc-round-card" key={key}>
                <div className="ff-udisc-round-card-heading">
                  <h5>{value.courseName ?? 'Course not in export'}</h5>
                  <span>
                    {value.sourceId ? `Source ID ${value.sourceId}` : 'No source ID in export'}
                  </span>
                </div>
                {consistencyWarnings(value).length ? (
                  <ul
                    className="ff-udisc-preview-issues"
                    aria-label="Scorecard consistency warnings"
                  >
                    {consistencyWarnings(value).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                {value.sourceUrl ? (
                  <p className="ff-udisc-source-link">
                    Original URL: <code>{value.sourceUrl}</code>
                  </p>
                ) : null}
                {!value.sourceUrl && value.sourceId ? (
                  <p className="ff-cardcast-export-help">
                    The export supplied an ID but no original URL; no URL was constructed.
                  </p>
                ) : null}
                <div className="ff-udisc-round-fields">
                  <label htmlFor={previewFieldId(inputId, roundIndex, 'date')}>
                    Date
                    <Input
                      id={previewFieldId(inputId, roundIndex, 'date')}
                      type="date"
                      value={value.playedOn ?? ''}
                      onChange={(event) =>
                        updateRound(key, (round) => ({
                          ...round,
                          playedOn: event.target.value || undefined,
                        }))
                      }
                    />
                  </label>
                  <label htmlFor={previewFieldId(inputId, roundIndex, 'course')}>
                    Course
                    <Input
                      id={previewFieldId(inputId, roundIndex, 'course')}
                      value={value.courseName ?? ''}
                      placeholder="Not included in export"
                      onChange={(event) =>
                        updateRound(key, (round) => ({
                          ...round,
                          courseName: event.target.value || undefined,
                        }))
                      }
                    />
                  </label>
                  <label htmlFor={previewFieldId(inputId, roundIndex, 'layout')}>
                    Layout
                    <Input
                      id={previewFieldId(inputId, roundIndex, 'layout')}
                      value={value.layoutName ?? ''}
                      placeholder="Not included in export"
                      onChange={(event) =>
                        updateRound(key, (round) => ({
                          ...round,
                          layoutName: event.target.value || undefined,
                        }))
                      }
                    />
                  </label>
                  <label htmlFor={previewFieldId(inputId, roundIndex, 'hole-count')}>
                    Hole count
                    <Input
                      id={previewFieldId(inputId, roundIndex, 'hole-count')}
                      inputMode="numeric"
                      value={value.holeCount ?? ''}
                      placeholder="Not included"
                      onChange={(event) =>
                        updateRound(key, (round) => ({
                          ...round,
                          holeCount: event.target.value ? Number(event.target.value) : undefined,
                        }))
                      }
                    />
                  </label>
                  <label htmlFor={previewFieldId(inputId, roundIndex, 'total-par')}>
                    Total par
                    <Input
                      id={previewFieldId(inputId, roundIndex, 'total-par')}
                      inputMode="numeric"
                      value={value.totalPar ?? ''}
                      placeholder="Not included"
                      onChange={(event) =>
                        updateRound(key, (round) => ({
                          ...round,
                          totalPar: event.target.value ? Number(event.target.value) : undefined,
                        }))
                      }
                    />
                  </label>
                  <label
                    className="ff-udisc-round-fields-wide"
                    htmlFor={previewFieldId(inputId, roundIndex, 'source-url')}
                  >
                    Original source URL
                    <Input
                      id={previewFieldId(inputId, roundIndex, 'source-url')}
                      type="text"
                      inputMode="url"
                      value={value.sourceUrl ?? ''}
                      placeholder="Not included in export"
                      onChange={(event) =>
                        updateRound(key, (round) => ({
                          ...round,
                          sourceUrl: event.target.value || undefined,
                        }))
                      }
                    />
                  </label>
                  <label
                    className="ff-udisc-round-fields-wide"
                    htmlFor={previewFieldId(inputId, roundIndex, 'hole-pars')}
                  >
                    Pars by hole
                    <Input
                      id={previewFieldId(inputId, roundIndex, 'hole-pars')}
                      value={holeValuesText(
                        value.holePars,
                        value.holeParEntries?.map((entry) => ({
                          holeNumber: entry.holeNumber,
                          value: entry.par,
                        })),
                      )}
                      placeholder="Not included; use 3, 3, 4 or hole:par pairs"
                      onChange={(event) =>
                        updateRound(key, (round) => {
                          const parsed = parseParText(event.target.value);
                          if (parsed === null && event.target.value.trim()) return round;
                          return {
                            ...round,
                            holePars: parsed?.holePars,
                            holeParEntries: parsed?.holeParEntries,
                          };
                        })
                      }
                    />
                  </label>
                </div>
                {value.roundMetadata ? (
                  <fieldset className="ff-udisc-metadata">
                    <legend>Round metadata from export</legend>
                    {Object.entries(value.roundMetadata).map(([name, metadataValue]) => (
                      <label
                        key={name}
                        htmlFor={previewFieldId(inputId, roundIndex, `metadata-${name}`)}
                      >
                        {name.replaceAll('_', ' ')}
                        <Input
                          id={previewFieldId(inputId, roundIndex, `metadata-${name}`)}
                          value={metadataValue}
                          onChange={(event) =>
                            updateRound(key, (round) => ({
                              ...round,
                              roundMetadata: { ...round.roundMetadata, [name]: event.target.value },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <p className="ff-cardcast-export-help">No round metadata columns were present.</p>
                )}
                <div className="ff-udisc-player-list">
                  {(value.players ?? []).map((player) => {
                    const playerId = playerKey(player);
                    return (
                      <fieldset className="ff-udisc-player-card" key={playerId}>
                        <legend>{player.name || 'Unnamed player'}</legend>
                        <div className="ff-udisc-round-fields">
                          <label htmlFor={previewFieldId(inputId, roundIndex, 'name', playerId)}>
                            Player name
                            <Input
                              id={previewFieldId(inputId, roundIndex, 'name', playerId)}
                              value={player.name}
                              onChange={(event) =>
                                updatePlayer(key, playerId, (current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label
                            htmlFor={previewFieldId(inputId, roundIndex, 'total-strokes', playerId)}
                          >
                            Total strokes
                            <Input
                              id={previewFieldId(inputId, roundIndex, 'total-strokes', playerId)}
                              inputMode="numeric"
                              value={player.totalScore ?? ''}
                              placeholder="Not included"
                              onChange={(event) =>
                                updatePlayer(key, playerId, (current) => ({
                                  ...current,
                                  totalScore: event.target.value
                                    ? Number(event.target.value)
                                    : undefined,
                                }))
                              }
                            />
                          </label>
                          <label
                            className="ff-udisc-round-fields-wide"
                            htmlFor={previewFieldId(inputId, roundIndex, 'hole-scores', playerId)}
                          >
                            Hole scores
                            <Input
                              id={previewFieldId(inputId, roundIndex, 'hole-scores', playerId)}
                              value={holeValuesText(
                                player.holeScores,
                                player.holeScoreEntries?.map((entry) => ({
                                  holeNumber: entry.holeNumber,
                                  value: entry.score,
                                })),
                              )}
                              placeholder="Not included; use 3, 4, 3 or hole:score pairs"
                              onChange={(event) =>
                                updatePlayer(key, playerId, (current) => {
                                  const parsed = parseScoreText(event.target.value);
                                  if (parsed === null && event.target.value.trim()) return current;
                                  return {
                                    ...current,
                                    holeScores: parsed?.holeScores,
                                    holeScoreEntries: parsed?.holeScoreEntries,
                                  };
                                })
                              }
                            />
                          </label>
                        </div>
                        {player.sourcePlayerId ? (
                          <small>UDisc player ID: {player.sourcePlayerId}</small>
                        ) : null}
                        {player.pdgaNumber ? <small>PDGA number: {player.pdgaNumber}</small> : null}
                        <label className="ff-udisc-player-match">
                          <input
                            type="checkbox"
                            checked={player.matchedToCurrentProfile ?? false}
                            disabled={
                              !currentProfile.exists ||
                              (!(player.matchedToCurrentProfile ?? false) &&
                                (value.players ?? []).some(
                                  (candidate) =>
                                    playerKey(candidate) !== playerId &&
                                    candidate.matchedToCurrentProfile,
                                ))
                            }
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              updateRound(key, (round) => ({
                                ...round,
                                players: round.players?.map((candidate) =>
                                  playerKey(candidate) === playerId
                                    ? { ...candidate, matchedToCurrentProfile: checked }
                                    : checked
                                      ? { ...candidate, matchedToCurrentProfile: false }
                                      : candidate,
                                ),
                              }));
                            }}
                          />
                          Link to {currentProfile.displayName}
                        </label>
                        <small>
                          {player.matchedToCurrentProfile
                            ? `Linked to ${currentProfile.displayName} by your selection.`
                            : 'Unlinked; this name and score will be preserved.'}
                        </small>
                      </fieldset>
                    );
                  })}
                </div>
                {missingFields(value).length ? (
                  <p className="ff-udisc-missing-fields">
                    Not in export: {missingFields(value).join(', ')}. Leave unknown values blank;
                    add only facts you can verify.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
          <div className="ff-udisc-confirm-row">
            <Button
              type="button"
              onClick={() => void confirmImport()}
              disabled={!canConfirm || isSaving}
            >
              {isSaving
                ? 'Saving confirmed rounds…'
                : serverPreview?.data.toCreate
                  ? `Confirm ${serverPreview.data.toCreate} new round${serverPreview.data.toCreate === 1 ? '' : 's'}`
                  : `Verify ${rounds.length} existing round${rounds.length === 1 ? '' : 's'}`}
            </Button>
            <p>
              Confirmation attaches the selected CSV, then saves valid rounds once. Existing source
              IDs are never overwritten.
            </p>
          </div>
        </section>
      ) : null}

      {savedSummary ? (
        <output className="ff-cardcast-import-success" aria-live="polite">
          <span>{savedSummary}</span>
          <Link href="/dashboard/rounds">View round history</Link>
        </output>
      ) : null}
    </section>
  );
}
