// @polsia:user-owned — compact signed-in UDisc importer with optional JSON and CSV tools.
'use client';

import { Link2, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import {
  ImportedScorecardImportResponseSchema,
  ImportedScorecardListSchema,
  SCORECARD_ALREADY_SAVED_MESSAGE,
} from '@/lib/contracts/imported-scorecard';
import { ScorecardDestinationsSchema } from '@/lib/contracts/scorecard-governance';
import { UDiscScorecardLinkSchema } from '@/lib/contracts/scorecard-import';

type ImportStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'duplicate'; message: string; itemId: string }
  | { kind: 'success'; message: string };

function errorPayload(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof Error) || typeof error.cause !== 'object' || error.cause === null) {
    return null;
  }
  return error.cause as Record<string, unknown>;
}

function displayDate(value: string | null): string {
  if (!value) return 'date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

export function CardCastImportForm({
  headingLevel = 'h2',
  initialShareUrl = '',
}: {
  headingLevel?: 'h1' | 'h2';
  initialShareUrl?: string;
}) {
  const Heading = headingLevel;
  const [sourceUrl, setSourceUrl] = useState(initialShareUrl);
  const [clubhouseIds, setClubhouseIds] = useState<string[]>([]);
  const [clubhouses, setClubhouses] = useState<Array<{ id: string; name: string }>>([]);
  const [destinationsLoading, setDestinationsLoading] = useState(true);
  const [destinationsError, setDestinationsError] = useState<string | null>(null);
  const [status, setStatus] = useState<ImportStatus>({ kind: 'idle' });

  const loadClubhouses = useCallback(async () => {
    setDestinationsLoading(true);
    setDestinationsError(null);
    try {
      const result = await apiFetch('/api/scorecard-destinations', {
        schema: ScorecardDestinationsSchema,
      });
      setClubhouses(result.clubhouses);
      const onlyClubhouse = result.clubhouses[0];
      if (result.clubhouses.length === 1 && onlyClubhouse) {
        setClubhouseIds([onlyClubhouse.id]);
      }
    } catch (reason) {
      setDestinationsError(
        reason instanceof Error ? reason.message : 'Clubhouse destinations could not be loaded.',
      );
    } finally {
      setDestinationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClubhouses();
  }, [loadClubhouses]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === 'loading') return;
    const value = sourceUrl.trim();
    const validated = UDiscScorecardLinkSchema.safeParse(value);
    if (!validated.success) {
      setStatus({
        kind: 'invalid',
        message: validated.error.issues[0]?.message ?? 'Paste a valid UDisc scorecard link.',
      });
      return;
    }

    setStatus({ kind: 'loading' });
    try {
      const result = await apiFetch('/api/udisc-scorecards', {
        method: 'POST',
        body: JSON.stringify({ sourceUrl: validated.data, clubhouseIds }),
        schema: ImportedScorecardImportResponseSchema,
      });
      const history = await apiFetch('/api/udisc-scorecards', {
        schema: ImportedScorecardListSchema,
      });
      const saved = history.items.find((item) => item.id === result.item.id);
      if (!saved || JSON.stringify(saved) !== JSON.stringify(result.item)) {
        throw new Error(
          'The scorecard was saved, but its database readback did not match. Check round history.',
        );
      }

      window.dispatchEvent(new Event('fairway-udisc-scorecards-updated'));
      if (result.duplicate) {
        setStatus({
          kind: 'duplicate',
          message: SCORECARD_ALREADY_SAVED_MESSAGE,
          itemId: result.item.id,
        });
        return;
      }
      setSourceUrl('');
      setStatus({
        kind: 'success',
        message: `Saved and verified from database readback: ${result.item.courseName ?? 'UDisc scorecard'} · ${displayDate(result.item.playedOn)} · ${result.item.players.length} players.`,
      });
    } catch (error) {
      const payload = errorPayload(error);
      const errors = payload?.errors;
      if (typeof errors === 'object' && errors !== null && 'sourceUrl' in errors) {
        const message = (errors as { sourceUrl?: unknown }).sourceUrl;
        setStatus({
          kind: 'invalid',
          message: typeof message === 'string' ? message : 'Paste a valid UDisc scorecard link.',
        });
        return;
      }
      const message = payload?.message;
      const serverError = payload?.error;
      setStatus({
        kind: 'failed',
        message:
          typeof message === 'string'
            ? message
            : typeof serverError === 'string'
              ? serverError
              : 'The public UDisc scorecard could not be fetched, parsed, and verified. Try again later.',
      });
    }
  }

  const statusMessage = status.kind === 'idle' || status.kind === 'loading' ? null : status.message;

  return (
    <section className="ff-cardcast-panel" aria-labelledby="scorecard-link-title">
      <header className="ff-cardcast-heading">
        <span className="ff-round-section-icon ff-cardcast-icon">
          <Link2 aria-hidden="true" />
        </span>
        <div>
          <p className="ff-cardcast-kicker">UDISC IMPORT · ADD A ROUND</p>
          <Heading id="scorecard-link-title">Add a scorecard</Heading>
          <p className="ff-cardcast-intro">
            Paste a public UDisc CardCast link to add the full round.
          </p>
        </div>
      </header>

      <form className="ff-cardcast-form" onSubmit={submit} noValidate>
        <div className="ff-cardcast-field">
          <label htmlFor="udisc-scorecard-url">UDisc / CardCast URL</label>
          <Input
            autoComplete="url"
            disabled={status.kind === 'loading'}
            id="udisc-scorecard-url"
            inputMode="url"
            onChange={(event) => {
              setSourceUrl(event.target.value);
              if (status.kind !== 'loading') setStatus({ kind: 'idle' });
            }}
            placeholder="https://udisc.com/scorecards/N78XJtdFmZ"
            type="url"
            value={sourceUrl}
            aria-invalid={status.kind === 'invalid'}
            aria-describedby={status.kind === 'invalid' ? 'udisc-scorecard-status' : undefined}
          />
        </div>
        <div className="ff-cardcast-field">
          <label htmlFor="udisc-scorecard-clubhouses">Add to clubhouse(s)</label>
          <select
            aria-describedby={destinationsError ? 'udisc-clubhouses-error' : undefined}
            disabled={
              status.kind === 'loading' || destinationsLoading || Boolean(destinationsError)
            }
            id="udisc-scorecard-clubhouses"
            multiple
            onChange={(event) => {
              const selected = [...event.currentTarget.selectedOptions].map(
                (option) => option.value,
              );
              setClubhouseIds(selected.includes('personal') ? [] : selected);
              if (status.kind !== 'loading') setStatus({ kind: 'idle' });
            }}
            value={clubhouseIds.length ? clubhouseIds : ['personal']}
            size={Math.min(4, Math.max(2, clubhouses.length + 1))}
          >
            <option value="personal">Personal only</option>
            {clubhouses.map((clubhouse) => (
              <option key={clubhouse.id} value={clubhouse.id}>
                {clubhouse.name}
              </option>
            ))}
          </select>
          {destinationsLoading ? (
            <p className="ff-cardcast-hint">Loading your Clubhouses…</p>
          ) : null}
          {destinationsError ? (
            <div>
              <p className="ff-cardcast-field-error" id="udisc-clubhouses-error" role="alert">
                Eligible Clubhouses could not be loaded: {destinationsError}
              </p>
              <Button
                className="mt-2"
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadClubhouses()}
              >
                Retry Clubhouses
              </Button>
            </div>
          ) : null}
          {!destinationsLoading && !destinationsError && clubhouses.length === 0 ? (
            <p className="ff-cardcast-hint">No memberships yet. This round will stay personal.</p>
          ) : null}
        </div>
        <Button
          className="ff-cardcast-submit"
          disabled={status.kind === 'loading' || destinationsLoading || Boolean(destinationsError)}
          type="submit"
        >
          {status.kind === 'loading' ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : null}
          Import scorecard
        </Button>
      </form>

      {status.kind === 'loading' ? (
        <output className="ff-cardcast-live-status" aria-live="polite">
          Fetching the public UDisc card and saving its scores…
        </output>
      ) : statusMessage ? (
        <output
          className={`ff-cardcast-live-status ff-cardcast-live-status-${status.kind}`}
          id="udisc-scorecard-status"
          aria-live={status.kind === 'invalid' || status.kind === 'failed' ? 'assertive' : 'polite'}
        >
          {statusMessage}
        </output>
      ) : null}

      {status.kind === 'duplicate' ? (
        <p className="ff-cardcast-duplicate-link">
          <Link href={`/dashboard/rounds#scorecard-${status.itemId}`}>
            Open the existing scorecard
          </Link>
          <span>Choose more Clubhouses above and submit this link again to add them.</span>
        </p>
      ) : null}

      <p className="ff-cardcast-alternatives">
        <Link href="/dashboard/profile/import-history#csv-import">or paste a CSV instead</Link>
      </p>
    </section>
  );
}
