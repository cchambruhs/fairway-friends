// @polsia:user-owned — resume and reopen the same saved scorecard from player and League history.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { type SavedRoundItem, SavedRoundListSchema } from '@/lib/contracts/saved-round';

export function SavedRoundHistory({ leagueId }: { leagueId?: string }) {
  const [items, setItems] = useState<SavedRoundItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const endpoint = leagueId
    ? `/api/rounds?leagueId=${encodeURIComponent(leagueId)}`
    : '/api/rounds';

  const load = useCallback(async () => {
    try {
      const result = await apiFetch(endpoint, { schema: SavedRoundListSchema });
      setItems(result.items);
      setLoadError(false);
    } catch {
      setLoadError(true);
      setItems([]);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = leagueId ? 'League scorecards' : 'Saved rounds';
  const titleId = leagueId ? `saved-league-rounds-${leagueId}` : 'saved-player-rounds';

  return (
    <section className="ff-saved-round-history" aria-labelledby={titleId}>
      <header className="ff-saved-round-history-heading">
        <div>
          <p className="ff-profile-section-kicker">
            {leagueId ? 'LEAGUE HISTORY' : 'LIVE SCORECARDS'}
          </p>
          <h2 id={titleId}>{title}</h2>
        </div>
        {!leagueId ? <Link href="/dashboard/rounds">Rounds workspace</Link> : null}
      </header>

      {loadError ? (
        <p role="alert">Saved rounds could not be loaded. Try again from the rounds workspace.</p>
      ) : items === null ? (
        <output aria-live="polite">Loading saved rounds…</output>
      ) : items.length === 0 ? (
        <p className="ff-saved-round-history-empty">
          {leagueId
            ? 'No saved League scorecards yet.'
            : 'No saved live rounds yet. Start a round to see it here.'}
        </p>
      ) : (
        <ul className="ff-saved-round-history-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="ff-saved-round-history-main">
                <p>{new Date(`${item.playedOn}T00:00:00`).toLocaleDateString()}</p>
                <h3>{item.courseName ?? 'Course not entered'}</h3>
                <span>{item.layoutName ?? `${item.holePars.length} holes`}</span>
              </div>
              <div className="ff-saved-round-history-players">
                {item.participants.map((participant) => (
                  <span key={participant.userId}>
                    {participant.displayName} · {participant.totalStrokes || '—'}
                    {participant.holesPlayed < item.holePars.length
                      ? ` (${participant.holesPlayed}/${item.holePars.length})`
                      : ''}
                  </span>
                ))}
              </div>
              <span
                className={`ff-saved-round-badge ${item.status === 'FINALIZED' ? 'is-finalized' : 'is-progress'}`}
              >
                {item.status === 'IN_PROGRESS'
                  ? 'In progress · saved'
                  : item.verificationStatus === 'LEAGUE_VERIFIED'
                    ? 'League verified · finalized'
                    : 'Casual · finalized · unverified'}
              </span>
              <Link
                className="ff-saved-round-open"
                href={`/dashboard/rounds/${encodeURIComponent(item.id)}`}
              >
                {item.status === 'IN_PROGRESS' ? 'Resume scorecard' : 'Open scorecard'}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {loadError ? (
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          Retry saved rounds
        </Button>
      ) : null}
    </section>
  );
}
