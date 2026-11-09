// @polsia:user-owned — show public imported scorecards without exposing account data.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ImportedScorecardCard } from '@/components/custom/imported-scorecard-card';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { type ClubhouseIndex, ClubhouseIndexSchema } from '@/lib/contracts/clubhouses';
import {
  type ImportedScorecardItem,
  ImportedScorecardListSchema,
} from '@/lib/contracts/imported-scorecard';

const IMPORTS_UPDATED_EVENT = 'fairway-udisc-scorecards-updated';

export function ImportedScorecardHistory({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<ImportedScorecardItem[] | null>(null);
  const [destinations, setDestinations] = useState<ClubhouseIndex['assignmentDestinations']>([]);
  const [leagueDestinations, setLeagueDestinations] = useState<
    ClubhouseIndex['leagueAssignmentDestinations']
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [destinationsError, setDestinationsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const [scorecards, clubsResult] = await Promise.all([
        apiFetch('/api/udisc-scorecards', { schema: ImportedScorecardListSchema }),
        apiFetch('/api/clubhouses', { schema: ClubhouseIndexSchema })
          .then((data) => ({ data, error: null }))
          .catch((reason: unknown) => ({ data: null, error: errorMessage(reason) })),
      ]);
      setItems(scorecards.items);
      setDestinations(clubsResult.data?.assignmentDestinations ?? []);
      setLeagueDestinations(clubsResult.data?.leagueAssignmentDestinations ?? []);
      setDestinationsError(clubsResult.error);
      setLoadError(null);
    } catch (reason) {
      setLoadError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadItems();
    const refresh = () => {
      if (active) void loadItems();
    };
    window.addEventListener(IMPORTS_UPDATED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(IMPORTS_UPDATED_EVENT, refresh);
    };
  }, [loadItems]);

  const visibleItems = compact ? (items ?? []).slice(0, 2) : (items ?? []);

  return (
    <section
      className="ff-imported-scorecards"
      aria-labelledby={compact ? 'recent-imports-title' : 'public-imports-title'}
    >
      <header className="ff-imported-scorecards-heading">
        <div>
          <p className="ff-profile-section-kicker">SHARED SCORECARDS</p>
          <h2 id={compact ? 'recent-imports-title' : 'public-imports-title'}>
            {compact ? 'Recently imported' : 'Public UDisc scorecards'}
          </h2>
        </div>
        {compact ? <Link href="/dashboard/rounds">View all rounds</Link> : null}
      </header>

      {loadError ? (
        <div className="ff-overview-state ff-overview-error" role="alert">
          <p>Saved UDisc scorecards could not be loaded: {loadError}</p>
          <Button size="sm" type="button" variant="outline" onClick={() => void loadItems()}>
            Try again
          </Button>
        </div>
      ) : loading && items === null ? (
        <output aria-live="polite">Loading shared scorecards…</output>
      ) : null}
      {destinationsError ? (
        <div className="ff-overview-state ff-overview-error" role="alert">
          <p>Eligible Clubhouses could not be loaded: {destinationsError}</p>
          <Button size="sm" type="button" variant="outline" onClick={() => void loadItems()}>
            Retry Clubhouse options
          </Button>
        </div>
      ) : null}
      {!loadError && items && visibleItems.length === 0 ? (
        <p className="ff-imported-scorecards-empty">
          No UDisc scorecards have been imported yet. Submitted public cards will appear here for
          every player.
        </p>
      ) : null}
      {!loadError && visibleItems.length > 0 ? (
        <div className="ff-imported-scorecards-list">
          {visibleItems.map((item) => (
            <ImportedScorecardCard
              key={item.id}
              item={item}
              destinations={destinations}
              leagueDestinations={leagueDestinations}
              onSaved={() => void loadItems()}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    const cause = reason.cause;
    if (typeof cause === 'object' && cause !== null) {
      if ('message' in cause && typeof cause.message === 'string') return cause.message;
      if ('error' in cause && typeof cause.error === 'string') return cause.error;
    }
    return reason.message;
  }
  return 'The request failed. Check your connection and try again.';
}
