// @polsia:user-owned — responsive player rounds, Clubhouses and personal statistics.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import {
  DashboardOverviewSchema,
  type DashboardOverview as Overview,
} from '@/lib/contracts/dashboard-overview';

function dateLabel(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function toParLabel(value: number | null): string {
  if (value === null) return 'To par unavailable';
  if (value === 0) return 'Even';
  return value > 0 ? `+${value}` : String(value);
}

function failureMessage(reason: unknown): string {
  if (reason instanceof Error) {
    const cause = reason.cause;
    if (typeof cause === 'object' && cause !== null) {
      if ('message' in cause && typeof cause.message === 'string') return cause.message;
      if ('error' in cause && typeof cause.error === 'string') return cause.error;
    }
    return reason.message;
  }
  return 'Dashboard data could not be loaded.';
}

export function DashboardOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await apiFetch('/api/dashboard/overview', { schema: DashboardOverviewSchema }));
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="ff-overview-sections" aria-live="polite">
      <section className="ff-overview-section" aria-labelledby="recent-rounds-heading">
        <header className="ff-overview-section-heading">
          <div>
            <p className="ff-profile-kicker">YOUR SCORECARDS</p>
            <h2 id="recent-rounds-heading">Recent rounds</h2>
          </div>
          <Link href="/dashboard/rounds">All rounds</Link>
        </header>
        {loading ? (
          <p className="ff-overview-state">Loading your recent rounds…</p>
        ) : error ? (
          <div className="ff-overview-state ff-overview-error" role="alert">
            <p>{error}</p>
            <Button size="sm" type="button" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : overview?.recentRounds.length ? (
          <ol className="ff-recent-round-list">
            {overview.recentRounds.map((round) => (
              <li key={round.id} id={`scorecard-${round.id}`}>
                <Link href={`/dashboard/rounds#scorecard-${round.id}`} className="ff-recent-round">
                  <span className="ff-recent-round-main">
                    <strong>{round.courseName ?? 'Course unavailable'}</strong>
                    <span>
                      {dateLabel(round.playedOn)} · {round.playerName}
                    </span>
                    {round.didNotFinish ? (
                      <span className="ff-dnf-badge">
                        Did not finish — {round.holesPlayed} of {round.holeCount ?? '—'} holes
                      </span>
                    ) : null}
                  </span>
                  <span className="ff-recent-round-score">
                    <strong>{round.holesPlayed ? round.totalScore : '—'}</strong>
                    <span>{toParLabel(round.toPar)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ff-overview-state">
            No rounds yet. Import a UDisc CardCast scorecard above to start your history.
          </p>
        )}
      </section>

      <section className="ff-overview-section" aria-labelledby="my-clubhouses-heading">
        <header className="ff-overview-section-heading">
          <div>
            <p className="ff-profile-kicker">PLAY TOGETHER</p>
            <h2 id="my-clubhouses-heading">My Clubhouses</h2>
          </div>
          <Link href="/dashboard/clubhouses">Browse</Link>
        </header>
        {loading ? (
          <p className="ff-overview-state">Loading your Clubhouses…</p>
        ) : error ? (
          <div className="ff-overview-state ff-overview-error" role="alert">
            <p>Clubhouses could not be loaded: {error}</p>
            <Button size="sm" type="button" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : overview?.clubhouses.length ? (
          <ul className="ff-my-clubhouses">
            {overview.clubhouses.map((clubhouse) => (
              <li key={clubhouse.id}>
                <Link href={`/dashboard/clubhouses/${encodeURIComponent(clubhouse.id)}`}>
                  {clubhouse.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ff-overview-state">You have not joined a Clubhouse yet.</p>
        )}
      </section>

      <section className="ff-overview-section" aria-labelledby="quick-stats-heading">
        <header className="ff-overview-section-heading">
          <div>
            <p className="ff-profile-kicker">PERSONAL STATS</p>
            <h2 id="quick-stats-heading">Quick stats</h2>
          </div>
          <Link href="/dashboard/stats">Full statistics</Link>
        </header>
        {loading ? (
          <p className="ff-overview-state">Loading your statistics…</p>
        ) : error ? (
          <div className="ff-overview-state ff-overview-error" role="alert">
            <p>Quick stats could not be loaded: {error}</p>
            <Button size="sm" type="button" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : (
          <dl className="ff-quick-stats">
            <div>
              <dt>Rounds played</dt>
              <dd>{overview?.roundsPlayed ?? 0}</dd>
            </div>
            <div>
              <dt>Best round</dt>
              <dd>{overview?.bestRound ?? '—'}</dd>
            </div>
            <div>
              <dt>Average score</dt>
              <dd>
                {overview?.averageScore === null || overview?.averageScore === undefined
                  ? '—'
                  : overview.averageScore.toFixed(1)}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}
