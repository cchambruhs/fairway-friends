// @polsia:user-owned — the signed-in player's own historical scorecards on their profile.
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { type HistoricalRoundItem, HistoricalRoundListSchema } from '@/lib/contracts/round-history';

function displayDate(date: string | null): string {
  if (!date) return 'Date not entered';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00.000Z`),
  );
}

export function PlayerRoundHistory() {
  const [rounds, setRounds] = useState<HistoricalRoundItem[] | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/api/round-history', { schema: HistoricalRoundListSchema })
      .then((response) => {
        if (active) setRounds(response.items);
      })
      .catch(() => {
        if (active) setHasError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="ff-profile-round-history" aria-labelledby="profile-round-history-title">
      <div className="ff-profile-round-history-heading">
        <div>
          <p className="ff-profile-section-kicker">YOUR HISTORY</p>
          <h2 id="profile-round-history-title">Historical scorecards</h2>
        </div>
        <Button asChild type="button" variant="outline">
          <Link href="/dashboard/rounds">Manage rounds</Link>
        </Button>
      </div>
      {hasError ? (
        <p role="alert">Your scorecards could not be loaded. Try again from rounds.</p>
      ) : rounds === null ? (
        <p aria-live="polite">Loading your scorecards…</p>
      ) : rounds.length === 0 ? (
        <p>
          No historical scorecards yet. JSON, manual, and CSV entries will appear here after you
          confirm them.
        </p>
      ) : (
        <ul className="ff-profile-round-history-list">
          {rounds.map((round) => (
            <li key={round.id}>
              <div>
                <p>{displayDate(round.playedOn)}</p>
                <h3>{round.courseName ?? 'Course not entered'}</h3>
                {round.layoutName ? <span>{round.layoutName}</span> : null}
              </div>
              <div className="ff-profile-round-history-score">
                <strong>{round.score ?? '—'}</strong>
                <span>{round.totalPar === null ? 'score' : `Par ${round.totalPar}`}</span>
              </div>
              <span className="ff-profile-round-history-status">Historical · Unverified</span>
              {round.sourceUrl ? (
                <a href={round.sourceUrl} target="_blank" rel="noreferrer">
                  CardCast source
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
