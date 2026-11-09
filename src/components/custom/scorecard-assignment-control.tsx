// @polsia:user-owned — reassignment and audit controls for shared UDisc cards.
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import {
  type ScorecardAssignmentHistory,
  ScorecardAssignmentHistorySchema,
} from '@/lib/contracts/clubhouses';
import {
  type ImportedScorecardItem,
  ImportedScorecardListSchema,
} from '@/lib/contracts/imported-scorecard';
import {
  ScorecardAssignmentActionResponseSchema,
  ScorecardAssignmentUpdateSchema,
} from '@/lib/contracts/scorecard-governance';

type Destination = { id: string; name: string };

export function ScorecardAssignmentControl({
  item,
  destinations,
  leagueDestinations = [],
  onSaved,
}: {
  item: ImportedScorecardItem;
  destinations: readonly Destination[];
  leagueDestinations?: readonly Destination[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState(item.clubhouseId ?? '');
  const [selectedLeague, setSelectedLeague] = useState(item.leagueId ?? '');
  const [clubhouseSearch, setClubhouseSearch] = useState('');
  const [leagueSearch, setLeagueSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScorecardAssignmentHistory['items'] | null>(null);
  const assignedClubhouses = item.clubhouseNames?.length
    ? item.clubhouseNames.join(', ')
    : (item.clubhouseName ?? 'Unassigned');

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch(
        `/api/udisc-scorecards/${encodeURIComponent(item.id)}/assignments`,
        {
          method: 'PATCH',
          body: JSON.stringify(
            ScorecardAssignmentUpdateSchema.parse({
              clubhouseId: selected || null,
              leagueId: selectedLeague || null,
            }),
          ),
          schema: ScorecardAssignmentActionResponseSchema,
        },
      );
      if (result.pending) {
        setMessage(
          result.message ?? 'This finalized League result needs approval before it can move.',
        );
        onSaved();
        return;
      }

      const readback = await apiFetch('/api/udisc-scorecards', {
        schema: ImportedScorecardListSchema,
      });
      const saved = readback.items.find((scorecard) => scorecard.id === item.id);
      if (
        !saved ||
        saved.clubhouseId !== (selected || null) ||
        saved.leagueId !== (selectedLeague || null)
      ) {
        throw new Error('The assignment was saved but did not match the database readback.');
      }
      setMessage(
        `Change confirmed from database readback: ${saved.clubhouseName ?? 'Personal only'}.`,
      );
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(): Promise<void> {
    try {
      const response = await apiFetch(
        `/api/udisc-scorecards/${encodeURIComponent(item.id)}/assignment-history`,
        { schema: ScorecardAssignmentHistorySchema },
      );
      setHistory(response.items);
    } catch {
      setError('Assignment history could not be loaded.');
    }
  }

  return (
    <div className="ff-scorecard-assignment">
      <p>
        Clubhouses: <strong>{assignedClubhouses}</strong>
        {' · '}League: <strong>{item.leagueName ?? 'Unassigned'}</strong>
      </p>
      {item.canReassign ? (
        <div className="ff-scorecard-assignment-controls">
          <div className="ff-scorecard-assignment-destination">
            <label htmlFor={`card-clubhouse-search-${item.id}`}>Search Clubhouses</label>
            <input
              id={`card-clubhouse-search-${item.id}`}
              type="search"
              value={clubhouseSearch}
              placeholder="Filter your Clubhouses"
              onChange={(event) => setClubhouseSearch(event.currentTarget.value)}
            />
            <label htmlFor={`card-clubhouse-${item.id}`}>Change Clubhouse</label>
            <select
              id={`card-clubhouse-${item.id}`}
              value={selected}
              disabled={busy}
              onChange={(event) => setSelected(event.currentTarget.value)}
            >
              <option value="">Unassigned</option>
              {item.clubhouseId &&
              !destinations.some((itemDestination) => itemDestination.id === item.clubhouseId) ? (
                <option value={item.clubhouseId} disabled>
                  {item.clubhouseName ?? 'Current Clubhouse'} · current
                </option>
              ) : null}
              {destinations
                .filter(
                  (destination) =>
                    destination.id === selected ||
                    destination.name.toLowerCase().includes(clubhouseSearch.toLowerCase()),
                )
                .map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="ff-scorecard-assignment-destination">
            <label htmlFor={`card-league-search-${item.id}`}>Search Leagues</label>
            <input
              id={`card-league-search-${item.id}`}
              type="search"
              value={leagueSearch}
              placeholder="Filter your Leagues"
              onChange={(event) => setLeagueSearch(event.currentTarget.value)}
            />
            <label htmlFor={`card-league-${item.id}`}>Change League</label>
            <select
              id={`card-league-${item.id}`}
              value={selectedLeague}
              disabled={busy}
              onChange={(event) => setSelectedLeague(event.currentTarget.value)}
            >
              <option value="">Unassigned</option>
              {item.leagueId &&
              !leagueDestinations.some((destination) => destination.id === item.leagueId) ? (
                <option value={item.leagueId} disabled>
                  {item.leagueName ?? 'Current League'} · current
                </option>
              ) : null}
              {leagueDestinations
                .filter(
                  (destination) =>
                    destination.id === selectedLeague ||
                    destination.name.toLowerCase().includes(leagueSearch.toLowerCase()),
                )
                .map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name}
                  </option>
                ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              busy ||
              (selected === (item.clubhouseId ?? '') && selectedLeague === (item.leagueId ?? ''))
            }
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save assignment'}
          </Button>
        </div>
      ) : null}
      {item.finalizedAt ? (
        <p className="text-xs text-muted-foreground">
          {item.leagueId
            ? 'Finalized League result · changes follow the League approval flow.'
            : 'Finalized legacy result · only its original submitter or an app admin can change the Clubhouse.'}
        </p>
      ) : null}
      {message ? <output className="text-xs text-muted-foreground">{message}</output> : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <details
        className="ff-scorecard-audit"
        onToggle={(event) => {
          if (event.currentTarget.open && history === null) void loadHistory();
        }}
      >
        <summary>Assignment history</summary>
        {history === null ? (
          <p>Open to load audit history.</p>
        ) : history.length === 0 ? (
          <p>No reassignment changes recorded.</p>
        ) : (
          <ol>
            {history.map((entry) => (
              <li key={entry.id}>
                {entry.actorName}{' '}
                {entry.oldClubhouseName === 'Unassigned' && entry.newClubhouseName !== 'Unassigned'
                  ? `added it to ${entry.newClubhouseName}`
                  : `moved it from ${entry.oldClubhouseName} to ${entry.newClubhouseName}`}
                {' · '}
                {entry.oldLeagueName === entry.newLeagueName
                  ? `League: ${entry.newLeagueName ?? 'League unavailable'}`
                  : `${entry.oldLeagueName ?? 'League unavailable'} to ${entry.newLeagueName ?? 'League unavailable'}`}
                {' · '}
                {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
                  new Date(entry.changedAt),
                )}
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    const cause = reason.cause;
    if (typeof cause === 'object' && cause !== null && 'error' in cause) {
      const error = cause.error;
      if (typeof error === 'string') return error;
    }
    return reason.message;
  }
  return 'Assignment could not be saved. Check Clubhouse membership and try again.';
}
