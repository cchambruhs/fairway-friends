// @polsia:user-owned — authorized app-admin assignment of legacy scorecards.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import {
  type AdminLegacyScorecards,
  AdminLegacyScorecardsSchema,
  ClubhouseActionResponseSchema,
} from '@/lib/contracts/clubhouses';

export function LegacyScorecardAssignments() {
  const [data, setData] = useState<AdminLegacyScorecards | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(
        await apiFetch('/api/admin/legacy-scorecards', { schema: AdminLegacyScorecardsSchema }),
      );
      setError(null);
    } catch {
      setData({ items: [], destinations: [] });
      setError('Legacy scorecards require app-admin access.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function assign(scorecardId: string): Promise<void> {
    const clubhouseId = selections[scorecardId];
    if (!clubhouseId) return;
    setBusyId(scorecardId);
    setError(null);
    try {
      await apiFetch(`/api/udisc-scorecards/${encodeURIComponent(scorecardId)}/clubhouse`, {
        method: 'PATCH',
        body: JSON.stringify({ clubhouseId }),
        schema: ClubhouseActionResponseSchema,
      });
      await reload();
    } catch {
      setError('The scorecard could not be assigned. Confirm the destination and try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="ff-admin-legacy-cards" aria-labelledby="legacy-cards-title">
      <header>
        <p className="ff-player-profile-kicker">PRESERVED HISTORY</p>
        <h1 id="legacy-cards-title">Unassigned scorecards</h1>
        <p>
          Older cards stay global and Unassigned until an app admin verifies their destination.
          Their original score data is not changed.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!data ? (
        <p aria-live="polite">Loading legacy cards…</p>
      ) : data.items.length === 0 ? (
        <p>No unassigned legacy scorecards need review.</p>
      ) : (
        <ul className="ff-admin-legacy-list">
          {data.items.map((card) => (
            <li key={card.id}>
              <div>
                <h2>
                  {card.courseName ?? 'Course unavailable'} · {card.playedOn ?? 'Date unavailable'}
                </h2>
                {card.hasVerifiedChanges ? (
                  <span className="ff-scorecard-verified">Verified (!)</span>
                ) : null}
                <a href={card.sourceUrl} target="_blank" rel="noreferrer">
                  Open UDisc source
                </a>
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href={`/scorecards/${encodeURIComponent(card.id)}/edit`}>
                    Edit Scorecard
                  </Link>
                </Button>
                <ul aria-label="Players on this scorecard">
                  {card.players.map((player) => (
                    <li key={player.id}>
                      <Link
                        href={
                          player.username
                            ? `/players/udisc/${encodeURIComponent(player.username)}`
                            : `/players/entries/${encodeURIComponent(player.id)}`
                        }
                      >
                        {player.displayName ?? player.username ?? 'Username unavailable'}
                      </Link>
                      <span> · {player.totalScore}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="ff-clubhouse-select-control">
                <label htmlFor={`legacy-destination-${card.id}`}>Assign to Clubhouse</label>
                <select
                  id={`legacy-destination-${card.id}`}
                  value={selections[card.id] ?? ''}
                  onChange={(event) =>
                    setSelections((previous) => ({
                      ...previous,
                      [card.id]: event.currentTarget.value,
                    }))
                  }
                >
                  <option value="">Choose a Clubhouse</option>
                  {data.destinations.map((destination) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  disabled={!selections[card.id] || busyId !== null}
                  onClick={() => void assign(card.id)}
                >
                  {busyId === card.id ? 'Saving…' : 'Assign card'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
