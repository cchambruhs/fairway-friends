// @polsia:user-owned — editable structured scorecard preview and persistent save.
'use client';

import { Check, FileJson2, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import {
  type HistoricalRoundInput,
  HistoricalRoundInputSchema,
  type HistoricalRoundItem,
  HistoricalRoundListSchema,
  HistoricalRoundPlayerInputSchema,
  HistoricalRoundSaveResponseSchema,
  ROUND_HISTORY_UPDATED_EVENT,
} from '@/lib/contracts/round-history';
import {
  type HistoricalRoundPreviewResponse,
  HistoricalRoundPreviewResponseSchema,
} from '@/lib/contracts/round-history-preview';
import { UDiscScorecardLinkSchema, udiscScorecardId } from '@/lib/contracts/scorecard-import';

const JsonRoundShape = z
  .object({
    playedOn: z.string().optional(),
    courseName: z.string().optional(),
    layoutName: z.string().optional(),
    score: z.number().optional(),
    totalPar: z.number().optional(),
    holeCount: z.number().optional(),
    sourceId: z.string().optional(),
    sourceUrl: UDiscScorecardLinkSchema.optional(),
    entryMethod: z.enum(['manual', 'csv', 'json']).optional(),
    holePars: z.array(z.number()).optional(),
    holeParEntries: z
      .array(z.object({ holeNumber: z.number(), par: z.number() }).strict())
      .optional(),
    roundMetadata: z.record(z.string(), z.string()).optional(),
    players: z.array(HistoricalRoundPlayerInputSchema).optional(),
  })
  .strict();

type JsonRound = z.infer<typeof JsonRoundShape>;

interface PlayerDraft {
  key: string;
  id?: string;
  sourcePlayerId: string;
  pdgaNumber: string;
  name: string;
  totalScore: string;
  holeScores: string;
  matchedToCurrentProfile: boolean;
}

interface RoundDraft {
  playedOn: string;
  courseName: string;
  layoutName: string;
  score: string;
  totalPar: string;
  holeCount: string;
  sourceId: string;
  sourceUrl: string;
  holePars: string;
  roundMetadata: string;
  players: PlayerDraft[];
}

interface FieldIssue {
  field: string;
  message: string;
}

function formatHoleValues(
  values: number[] | undefined,
  entries: Array<{ holeNumber: number; score?: number; par?: number }> | undefined,
): string {
  if (values) return values.join(', ');
  return (
    entries?.map((entry) => `${entry.holeNumber}:${entry.score ?? entry.par}`).join(', ') ?? ''
  );
}

function toDraft(round: JsonRound): RoundDraft {
  return {
    playedOn: round.playedOn ?? '',
    courseName: round.courseName ?? '',
    layoutName: round.layoutName ?? '',
    score: round.score === undefined ? '' : String(round.score),
    totalPar: round.totalPar === undefined ? '' : String(round.totalPar),
    holeCount: round.holeCount === undefined ? '' : String(round.holeCount),
    sourceId: round.sourceId ?? '',
    sourceUrl: round.sourceUrl ?? '',
    holePars: formatHoleValues(round.holePars, round.holeParEntries),
    roundMetadata: round.roundMetadata ? JSON.stringify(round.roundMetadata, null, 2) : '',
    players:
      round.players?.map((player) => ({
        key: crypto.randomUUID(),
        ...(player.id ? { id: player.id } : {}),
        sourcePlayerId: player.sourcePlayerId ?? '',
        pdgaNumber: player.pdgaNumber ?? '',
        name: player.name,
        totalScore: player.totalScore === undefined ? '' : String(player.totalScore),
        holeScores: formatHoleValues(player.holeScores, player.holeScoreEntries),
        matchedToCurrentProfile: player.matchedToCurrentProfile,
      })) ?? [],
  };
}

function parseNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  return Number(value);
}

function parseList(
  value: string,
): { values?: number[]; entries?: Array<{ holeNumber: number; value: number }> } | undefined {
  if (!value.trim()) return undefined;
  const parts = value.split(',').map((part) => part.trim());
  if (parts.every((part) => /^\d+\s*[:=]\s*\d+$/.test(part))) {
    return {
      entries: parts.map((part) => {
        const [holeNumber, valueText] = part.split(/\s*[:=]\s*/);
        return { holeNumber: Number(holeNumber), value: Number(valueText) };
      }),
    };
  }
  if (parts.some((part) => part.includes(':') || part.includes('='))) {
    return { values: [Number.NaN] };
  }
  return { values: parts.map((part) => (part ? Number(part) : Number.NaN)) };
}

function makeCandidate(draft: RoundDraft): { value?: HistoricalRoundInput; issues: FieldIssue[] } {
  let metadata: Record<string, string> | undefined;
  if (draft.roundMetadata.trim()) {
    let rawMetadata: unknown;
    try {
      rawMetadata = JSON.parse(draft.roundMetadata);
    } catch {
      return {
        issues: [{ field: 'roundMetadata', message: 'Round metadata must be valid JSON.' }],
      };
    }
    const metadataResult = z
      .record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.string().max(500))
      .safeParse(rawMetadata);
    if (!metadataResult.success) {
      return {
        issues: metadataResult.error.issues.map((issue) => ({
          field: 'roundMetadata',
          message: issue.message,
        })),
      };
    }
    metadata = metadataResult.data;
  }

  const parsedPars = parseList(draft.holePars);
  const players = draft.players.map((player) => {
    const parsedScores = parseList(player.holeScores);
    return {
      ...(player.id ? { id: player.id } : {}),
      name: player.name,
      ...(player.sourcePlayerId ? { sourcePlayerId: player.sourcePlayerId } : {}),
      ...(player.pdgaNumber ? { pdgaNumber: player.pdgaNumber } : {}),
      ...(parsedScores?.values ? { holeScores: parsedScores.values } : {}),
      ...(parsedScores?.entries
        ? {
            holeScoreEntries: parsedScores.entries.map(({ holeNumber, value }) => ({
              holeNumber,
              score: value,
            })),
          }
        : {}),
      ...(parseNumber(player.totalScore) !== undefined
        ? { totalScore: parseNumber(player.totalScore) }
        : {}),
      matchedToCurrentProfile: player.matchedToCurrentProfile,
    };
  });

  const candidate = {
    ...(draft.playedOn ? { playedOn: draft.playedOn } : {}),
    ...(draft.courseName ? { courseName: draft.courseName } : {}),
    ...(draft.layoutName ? { layoutName: draft.layoutName } : {}),
    ...(parseNumber(draft.score) !== undefined ? { score: parseNumber(draft.score) } : {}),
    ...(parseNumber(draft.totalPar) !== undefined ? { totalPar: parseNumber(draft.totalPar) } : {}),
    ...(parseNumber(draft.holeCount) !== undefined
      ? { holeCount: parseNumber(draft.holeCount) }
      : {}),
    ...(draft.sourceId ? { sourceId: draft.sourceId } : {}),
    ...(draft.sourceUrl ? { sourceUrl: draft.sourceUrl } : {}),
    ...(parsedPars?.values ? { holePars: parsedPars.values } : {}),
    ...(parsedPars?.entries
      ? {
          holeParEntries: parsedPars.entries.map(({ holeNumber, value }) => ({
            holeNumber,
            par: value,
          })),
        }
      : {}),
    ...(metadata ? { roundMetadata: metadata } : {}),
    ...(players.length > 0 ? { players } : {}),
    entryMethod: 'json' as const,
  };
  const parsed = HistoricalRoundInputSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.') || 'scorecard',
        message: issue.message,
      })),
    };
  }
  return { value: parsed.data, issues: [] };
}

function playerSum(player: PlayerDraft, holeCount: number | undefined): number | null {
  const parsed = parseList(player.holeScores);
  if (!parsed) return null;
  if (parsed.values) {
    if (parsed.values.some((value) => !Number.isInteger(value))) return null;
    return parsed.values.reduce((sum, value) => sum + value, 0);
  }
  if (!parsed.entries) return null;
  const values = new Map(parsed.entries.map((entry) => [entry.holeNumber, entry.value]));
  if (values.size !== parsed.entries.length) return null;
  if (holeCount !== undefined) {
    const ordered = Array.from({ length: holeCount }, (_, index) => values.get(index + 1));
    if (!ordered.every((value): value is number => value !== undefined)) return null;
  }
  return parsed.entries.reduce((sum, entry) => sum + entry.value, 0);
}

function playerHoleCountMismatch(player: PlayerDraft, holeCount: number | undefined): boolean {
  if (holeCount === undefined) return false;
  const parsed = parseList(player.holeScores);
  if (!parsed) return false;
  if (parsed.values) return parsed.values.length !== holeCount;
  if (!parsed.entries) return false;
  const holes = new Set(parsed.entries.map((entry) => entry.holeNumber));
  return (
    parsed.entries.length !== holeCount ||
    holes.size !== parsed.entries.length ||
    Array.from({ length: holeCount }, (_, index) => holes.has(index + 1)).some((found) => !found)
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([first], [second]) => first.localeCompare(second));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function savedRoundMatches(
  item: HistoricalRoundItem,
  input: HistoricalRoundInput,
  reused = false,
): boolean {
  const linkedPlayer = input.players?.find((player) => player.matchedToCurrentProfile);
  const score = input.score ?? linkedPlayer?.totalScore ?? null;
  const playerHoleCount = input.players?.reduce(
    (maximum, player) => Math.max(maximum, player.holeScores?.length ?? 0),
    0,
  );
  const holeCount = input.holeCount ?? input.holePars?.length ?? (playerHoleCount || null);
  const sourceId = input.sourceId ?? (input.sourceUrl ? udiscScorecardId(input.sourceUrl) : null);
  if (
    item.playedOn !== (input.playedOn ?? null) ||
    item.courseName !== (input.courseName ?? null) ||
    item.layoutName !== (input.layoutName ?? null) ||
    item.score !== score ||
    item.totalPar !== (input.totalPar ?? null) ||
    item.holeCount !== holeCount ||
    item.sourceUrl !== (input.sourceUrl ?? null) ||
    item.sourceId !== sourceId ||
    (!reused && item.entryMethod !== 'json') ||
    item.historyStatus !== 'historical' ||
    item.verificationStatus !== 'unverified' ||
    stableJson(item.holePars) !== stableJson(input.holePars ?? null) ||
    stableJson(item.holeParEntries) !== stableJson(input.holeParEntries ?? null) ||
    stableJson(item.roundMetadata) !== stableJson(input.roundMetadata ?? null)
  ) {
    return false;
  }
  const expectedPlayers = input.players ?? [];
  return (
    item.players.length === expectedPlayers.length &&
    item.players.every((saved, index) => {
      const expected = expectedPlayers[index];
      return Boolean(
        expected &&
          saved.name === expected.name &&
          saved.sourcePlayerId === (expected.sourcePlayerId ?? null) &&
          saved.pdgaNumber === (expected.pdgaNumber ?? null) &&
          saved.totalScore === (expected.totalScore ?? null) &&
          saved.matchedToCurrentProfile === expected.matchedToCurrentProfile &&
          stableJson(saved.holeScores) === stableJson(expected.holeScores ?? null) &&
          stableJson(saved.holeScoreEntries) === stableJson(expected.holeScoreEntries ?? null),
      );
    })
  );
}

function errorIssues(error: unknown): FieldIssue[] {
  if (!(error instanceof Error)) {
    return [
      {
        field: 'scorecard',
        message: 'The scorecard could not be checked. Your data is still here.',
      },
    ];
  }
  if (typeof error.cause !== 'object' || error.cause === null) {
    return [
      {
        field: 'scorecard',
        message: error.message || 'The scorecard could not be checked. Your data is still here.',
      },
    ];
  }
  const body = error.cause as { errors?: unknown; issues?: unknown };
  if (Array.isArray(body.errors)) {
    return body.errors.flatMap((issue) => {
      if (typeof issue !== 'object' || issue === null || !('message' in issue)) return [];
      const value = issue as { field?: unknown; message: unknown };
      return typeof value.message === 'string'
        ? [
            {
              field: typeof value.field === 'string' ? value.field : 'scorecard',
              message: value.message,
            },
          ]
        : [];
    });
  }
  if (typeof body.errors === 'object' && body.errors !== null) {
    return Object.entries(body.errors).flatMap(([field, message]) =>
      typeof message === 'string' ? [{ field, message }] : [],
    );
  }
  return [{ field: 'scorecard', message: error.message || 'The scorecard could not be checked.' }];
}

function stablePlayerKey(): string {
  return crypto.randomUUID();
}

export function StructuredScorecardJsonImport({
  initialSourceUrl = '',
}: {
  initialSourceUrl?: string;
}) {
  const id = useId();
  const [sourceText, setSourceText] = useState('');
  const [draft, setDraft] = useState<RoundDraft | null>(null);
  const [profile, setProfile] = useState({ displayName: 'Signed-in player', exists: false });
  const [serverPreview, setServerPreview] = useState<HistoricalRoundPreviewResponse | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const _currentCandidate = useMemo(() => (draft ? makeCandidate(draft) : null), [draft]);
  const holeCountValue = draft ? parseNumber(draft.holeCount) : undefined;

  useEffect(() => {
    let active = true;
    apiFetch('/api/round-history/preview', { schema: HistoricalRoundPreviewResponseSchema })
      .then((preview) => {
        if (active) setProfile(preview.currentProfile);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function invalidatePreview() {
    setServerPreview(null);
    setIssues([]);
    setStatus(null);
  }

  function parseJson() {
    setIssues([]);
    setServerPreview(null);
    setStatus(null);
    let raw: unknown;
    try {
      raw = JSON.parse(sourceText);
    } catch {
      setIssues([{ field: 'JSON', message: 'Enter valid JSON for one scorecard.' }]);
      setDraft(null);
      return;
    }
    const parsed = JsonRoundShape.safeParse(raw);
    if (!parsed.success) {
      setIssues(
        parsed.error.issues.map((issue) => ({
          field: issue.path.map(String).join('.') || 'JSON',
          message: issue.message,
        })),
      );
      setDraft(null);
      return;
    }
    const next = toDraft(parsed.data);
    if (!next.sourceUrl && initialSourceUrl) next.sourceUrl = initialSourceUrl;
    setDraft(next);
  }

  function editRound(patch: Partial<RoundDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    invalidatePreview();
  }

  function editPlayer(key: string, patch: Partial<PlayerDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const players = current.players.map((player) => ({ ...player }));
      const target = players.find((player) => player.key === key);
      if (!target) return current;
      Object.assign(target, patch);
      if (patch.matchedToCurrentProfile) {
        for (const player of players) {
          if (player.key !== key) player.matchedToCurrentProfile = false;
        }
      }
      return { ...current, players };
    });
    invalidatePreview();
  }

  async function validatePreview() {
    if (!draft) return;
    const candidate = makeCandidate(draft);
    setIssues(candidate.issues);
    setServerPreview(null);
    setStatus(null);
    if (!candidate.value) return;
    setIsChecking(true);
    try {
      const preview = await apiFetch('/api/round-history/preview', {
        method: 'POST',
        body: JSON.stringify(candidate.value),
        schema: HistoricalRoundPreviewResponseSchema,
      });
      setProfile(preview.currentProfile);
      setServerPreview(preview);
      setIssues([]);
    } catch (error) {
      setIssues(errorIssues(error));
    } finally {
      setIsChecking(false);
    }
  }

  async function saveScorecard() {
    if (!draft || !serverPreview || isSaving) return;
    const candidate = makeCandidate(draft);
    setIssues(candidate.issues);
    if (!candidate.value) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const saved = await apiFetch('/api/round-history', {
        method: 'POST',
        body: JSON.stringify(candidate.value),
        schema: HistoricalRoundSaveResponseSchema,
      });
      const history = await apiFetch('/api/round-history', {
        schema: HistoricalRoundListSchema,
      });
      const readback = history.items.find((item) => item.id === saved.item.id);
      if (!readback || !savedRoundMatches(readback, candidate.value, saved.reused)) {
        throw new Error(
          'Persistent round history did not match the scorecard preview. The preview is still available.',
        );
      }
      const unmatched = readback.players
        .filter((player) => !player.matchedToCurrentProfile)
        .map((player) => player.name);
      const unmatchedCopy = unmatched.length ? ` Unlinked players: ${unmatched.join(', ')}.` : '';
      const result = saved.reused ? 'Existing round verified' : 'Scorecard saved and read back';
      setStatus(`${result}. Round ID: ${readback.id}.${unmatchedCopy}`);
      window.dispatchEvent(new Event(ROUND_HISTORY_UPDATED_EVENT));
      toast.success(saved.reused ? 'Existing scorecard verified' : 'Historical scorecard saved');
    } catch (error) {
      setIssues(errorIssues(error));
      toast.error('The scorecard was not confirmed. Your editable preview is still here.');
    } finally {
      setIsSaving(false);
    }
  }

  function addPlayer() {
    setDraft((current) =>
      current
        ? {
            ...current,
            players: [
              ...current.players,
              {
                key: stablePlayerKey(),
                name: '',
                sourcePlayerId: '',
                pdgaNumber: '',
                totalScore: '',
                holeScores: '',
                matchedToCurrentProfile: false,
              },
            ],
          }
        : current,
    );
    invalidatePreview();
  }

  function removePlayer(key: string) {
    setDraft((current) =>
      current
        ? { ...current, players: current.players.filter((player) => player.key !== key) }
        : current,
    );
    invalidatePreview();
  }

  const unlinkedNames =
    draft?.players
      .filter((player) => !player.matchedToCurrentProfile && player.name.trim())
      .map((player) => player.name.trim()) ?? [];

  return (
    <section className="ff-scorecard-json" aria-labelledby={`${id}-title`}>
      <div className="ff-cardcast-export-heading">
        <FileJson2 aria-hidden="true" />
        <div>
          <h3 id={`${id}-title`}>Structured JSON</h3>
          <p>
            Paste one scorecard. Missing fields stay blank, and a source link is stored as
            attribution only.
          </p>
        </div>
      </div>
      <label className="ff-scorecard-json-label" htmlFor={`${id}-source`}>
        Scorecard JSON
      </label>
      <Textarea
        id={`${id}-source`}
        value={sourceText}
        onChange={(event) => setSourceText(event.currentTarget.value)}
        placeholder='{"courseName":"Course name","players":[{"name":"Player","totalScore":58,"holeScores":[3,4,3]}]}'
        rows={5}
        aria-describedby={`${id}-source-help`}
      />
      <p id={`${id}-source-help`} className="ff-cardcast-export-help">
        Include only values you have. A CardCast link by itself is not an import; add scorecard data
        to continue.
      </p>
      <div className="ff-scorecard-json-actions">
        <Button type="button" variant="outline" onClick={parseJson} disabled={!sourceText.trim()}>
          Load scorecard preview
        </Button>
        {draft ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(null);
              setSourceText('');
              setServerPreview(null);
              setIssues([]);
              setStatus(null);
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {issues.length ? (
        <div className="ff-scorecard-json-issues" role="alert">
          <strong>Review these fields</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.field}-${issue.message}-${index}`}>
                {issue.field}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {draft ? (
        <div className="ff-scorecard-json-preview">
          <div className="ff-udisc-preview-heading">
            <div>
              <p className="ff-course-eyebrow">EDITABLE PREVIEW</p>
              <h4>Check every scorecard field</h4>
              <p>
                {serverPreview
                  ? serverPreview.duplicate
                    ? `This source already exists as round ${serverPreview.duplicate.roundId}. Saving will keep that record unchanged.`
                    : 'No matching saved round was found for this account.'
                  : 'Edits must pass validation before they can be saved.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void validatePreview()}
              disabled={isChecking || isSaving}
            >
              {isChecking ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {isChecking ? 'Checking…' : 'Validate preview'}
            </Button>
          </div>

          <div className="ff-scorecard-json-fields">
            <label htmlFor={`${id}-date`}>
              Date
              <Input
                id={`${id}-date`}
                type="date"
                value={draft.playedOn}
                onChange={(event) => editRound({ playedOn: event.currentTarget.value })}
              />
            </label>
            <label htmlFor={`${id}-course`}>
              Course
              <Input
                id={`${id}-course`}
                value={draft.courseName}
                onChange={(event) => editRound({ courseName: event.currentTarget.value })}
              />
            </label>
            <label htmlFor={`${id}-layout`}>
              Layout
              <Input
                id={`${id}-layout`}
                value={draft.layoutName}
                onChange={(event) => editRound({ layoutName: event.currentTarget.value })}
              />
            </label>
            <label htmlFor={`${id}-hole-count`}>
              Hole count
              <Input
                id={`${id}-hole-count`}
                type="number"
                inputMode="numeric"
                value={draft.holeCount}
                onChange={(event) => editRound({ holeCount: event.currentTarget.value })}
              />
            </label>
            <label htmlFor={`${id}-total-par`}>
              Total par
              <Input
                id={`${id}-total-par`}
                type="number"
                inputMode="numeric"
                value={draft.totalPar}
                onChange={(event) => editRound({ totalPar: event.currentTarget.value })}
              />
            </label>
            <label htmlFor={`${id}-round-score`}>
              Your score, if supplied
              <Input
                id={`${id}-round-score`}
                type="number"
                inputMode="numeric"
                value={draft.score}
                onChange={(event) => editRound({ score: event.currentTarget.value })}
              />
            </label>
            <label className="ff-scorecard-json-wide" htmlFor={`${id}-source-url`}>
              Original source URL
              <Input
                id={`${id}-source-url`}
                type="text"
                inputMode="url"
                value={draft.sourceUrl}
                onChange={(event) => editRound({ sourceUrl: event.currentTarget.value })}
              />
            </label>
            <label htmlFor={`${id}-source-id`}>
              Source ID
              <Input
                id={`${id}-source-id`}
                value={draft.sourceId}
                disabled={Boolean(draft.sourceUrl)}
                onChange={(event) => editRound({ sourceId: event.currentTarget.value })}
              />
            </label>
            {draft.sourceUrl ? (
              <p className="ff-cardcast-export-help ff-scorecard-json-wide">
                Source ID from the exact URL:{' '}
                {udiscScorecardId(draft.sourceUrl) ?? 'URL needs validation'}
              </p>
            ) : null}
            <label className="ff-scorecard-json-wide" htmlFor={`${id}-hole-pars`}>
              Hole pars, only if supplied
              <Textarea
                id={`${id}-hole-pars`}
                rows={2}
                value={draft.holePars}
                onChange={(event) => editRound({ holePars: event.currentTarget.value })}
                placeholder="Leave blank when unknown"
              />
            </label>
            <label className="ff-scorecard-json-wide" htmlFor={`${id}-metadata`}>
              Additional metadata as JSON
              <Textarea
                id={`${id}-metadata`}
                rows={3}
                value={draft.roundMetadata}
                onChange={(event) => editRound({ roundMetadata: event.currentTarget.value })}
                placeholder='{"location":"Fort Branch, Indiana","played_time":"12:08 PM"}'
              />
            </label>
          </div>

          <div className="ff-scorecard-json-player-heading">
            <div>
              <h5>Players and scores</h5>
              <p>
                {profile.exists
                  ? `Explicitly link at most one card player to ${profile.displayName}; all other names remain unlinked.`
                  : 'No player profile is available to link. Names and scores remain unlinked.'}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={addPlayer}>
              <Plus aria-hidden="true" /> Add player
            </Button>
          </div>
          <div className="ff-scorecard-json-players">
            {draft.players.map((player) => {
              const sum = playerSum(player, holeCountValue);
              const mismatch =
                player.totalScore && sum !== null && Number(player.totalScore) !== sum;
              const otherLinked = draft.players.some(
                (candidate) => candidate.key !== player.key && candidate.matchedToCurrentProfile,
              );
              const parsedScores = parseList(player.holeScores);
              const scoreCount = parsedScores?.values?.length ?? parsedScores?.entries?.length;
              const holeCountMismatch = playerHoleCountMismatch(player, holeCountValue);
              return (
                <fieldset className="ff-scorecard-json-player" key={player.key}>
                  <legend>{player.name || 'Player'}</legend>
                  <div className="ff-scorecard-json-player-fields">
                    <label htmlFor={`${id}-${player.key}-name`}>
                      Player name
                      <Input
                        id={`${id}-${player.key}-name`}
                        value={player.name}
                        onChange={(event) =>
                          editPlayer(player.key, { name: event.currentTarget.value })
                        }
                      />
                    </label>
                    <label htmlFor={`${id}-${player.key}-total`}>
                      Supplied total
                      <Input
                        id={`${id}-${player.key}-total`}
                        type="number"
                        inputMode="numeric"
                        value={player.totalScore}
                        onChange={(event) =>
                          editPlayer(player.key, { totalScore: event.currentTarget.value })
                        }
                      />
                    </label>
                    <label className="ff-scorecard-json-wide" htmlFor={`${id}-${player.key}-holes`}>
                      Hole scores
                      <Textarea
                        id={`${id}-${player.key}-holes`}
                        rows={2}
                        value={player.holeScores}
                        onChange={(event) =>
                          editPlayer(player.key, { holeScores: event.currentTarget.value })
                        }
                        placeholder="3, 4, 3 or 1:3, 2:4, 3:3"
                      />
                    </label>
                  </div>
                  {player.sourcePlayerId ? (
                    <small>Source player ID: {player.sourcePlayerId}</small>
                  ) : null}
                  {player.pdgaNumber ? <small>PDGA number: {player.pdgaNumber}</small> : null}
                  {mismatch ? (
                    <p className="ff-scorecard-json-warning" role="alert">
                      {player.name}: hole scores sum to {sum}, but the supplied total is{' '}
                      {player.totalScore}. Values are unchanged.
                    </p>
                  ) : null}
                  {holeCountMismatch ? (
                    <p className="ff-scorecard-json-warning" role="alert">
                      {player.name}: {scoreCount} hole scores were supplied for a {holeCountValue}
                      -hole round, or the numbered holes are incomplete. Values are unchanged.
                    </p>
                  ) : null}
                  <div className="ff-scorecard-json-match">
                    <label>
                      <input
                        type="checkbox"
                        checked={player.matchedToCurrentProfile}
                        disabled={
                          !profile.exists || (!player.matchedToCurrentProfile && otherLinked)
                        }
                        onChange={(event) =>
                          editPlayer(player.key, {
                            matchedToCurrentProfile: event.currentTarget.checked,
                          })
                        }
                      />
                      Link this player to {profile.displayName}
                    </label>
                    <span>
                      {player.matchedToCurrentProfile
                        ? 'Linked by your selection'
                        : 'Unlinked name and score are preserved'}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removePlayer(player.key)}
                      aria-label={`Remove ${player.name || 'player'}`}
                    >
                      <Trash2 aria-hidden="true" /> Remove
                    </Button>
                  </div>
                </fieldset>
              );
            })}
          </div>
          {unlinkedNames.length ? (
            <p className="ff-cardcast-export-help">
              Will remain unlinked: {unlinkedNames.join(', ')}.
            </p>
          ) : null}
          {serverPreview?.duplicate ? (
            <p className="ff-cardcast-export-help">
              Existing round ID: <code>{serverPreview.duplicate.roundId}</code>. Existing values
              will not be overwritten.
            </p>
          ) : null}
          <div className="ff-scorecard-json-save">
            <Button
              type="button"
              onClick={() => void saveScorecard()}
              disabled={!serverPreview || isChecking || isSaving}
            >
              {isSaving
                ? 'Saving and reading back…'
                : serverPreview?.duplicate
                  ? 'Verify existing scorecard'
                  : 'Save scorecard'}
            </Button>
            <p>
              Every accepted card remains historical and unverified until the existing verification
              flow finalizes it.
            </p>
          </div>
          {status ? (
            <output className="ff-cardcast-import-success" aria-live="polite">
              {status}
            </output>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
