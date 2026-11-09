// @polsia:user-owned — transparent profile destination when a source supplied no UDisc username.
'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { UnlinkedScorecardEntrySchema } from '@/lib/contracts/player-identity';

export function UnlinkedScorecardPlayer({ entryId }: { entryId: string }) {
  const [entry, setEntry] = useState<ReturnType<typeof UnlinkedScorecardEntrySchema.parse> | null>(
    null,
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch(`/api/players/entries/${encodeURIComponent(entryId)}`, {
      schema: UnlinkedScorecardEntrySchema,
    })
      .then((result) => {
        if (active) setEntry(result);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [entryId]);

  if (error) return <p role="alert">This scorecard player entry could not be loaded.</p>;
  if (!entry) return <p aria-live="polite">Loading scorecard entry…</p>;
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="ff-player-profile-kicker">UNLINKED SCORECARD ENTRY</p>
      <h1 className="text-3xl font-semibold">{entry.displayName}</h1>
      <p className="mt-3 text-muted-foreground">
        This source card did not include a UDisc username, so Fairway Friends cannot safely combine
        it with another player’s history.
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <dt>Course</dt>
          <dd>{entry.courseName ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{entry.playedOn ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>{entry.totalScore}</dd>
        </div>
      </dl>
      <a
        className="mt-5 inline-block underline underline-offset-4"
        href={entry.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        Open source scorecard
      </a>
    </main>
  );
}
