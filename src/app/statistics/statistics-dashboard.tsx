// @polsia:user-owned — public, live scorecard statistics and metric drilldowns.
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import {
  type GlobalStatMetric,
  type GlobalStatsResponse,
  GlobalStatsResponseSchema,
} from '@/lib/contracts/global-stats';
import './statistics.css';

const fairwayImage =
  'https://cdn.polsia.com/generated-media/company_973904/df90d1e2-f25c-4c92-bdaf-0ec9943d2546.png';

const metricCards: Array<{
  key: GlobalStatMetric;
  label: string;
  short: string;
  note: string;
  color: string;
}> = [
  { key: 'aces', label: 'Aces', short: 'ACE', note: 'Hole-in-ones', color: 'lime' },
  {
    key: 'eagles',
    label: 'Eagles & better',
    short: '−2+',
    note: 'Two or more under par',
    color: 'gold',
  },
  { key: 'birdies', label: 'Birdies', short: '−1', note: 'One under par', color: 'green' },
  { key: 'pars', label: 'Pars', short: 'E', note: 'Even with par', color: 'blue' },
  { key: 'bogeys', label: 'Bogeys', short: '+1', note: 'One over par', color: 'amber' },
  {
    key: 'doubleBogeys',
    label: 'Double bogeys',
    short: '+2',
    note: 'Two over par',
    color: 'orange',
  },
  {
    key: 'triplePlusBogeys',
    label: 'Triple+ bogeys',
    short: '+3',
    note: 'Three or more over par',
    color: 'rose',
  },
  {
    key: 'distanceFeet',
    label: 'Distance estimate',
    short: 'FT',
    note: 'Verified hole lengths only',
    color: 'gold',
  },
  {
    key: 'holesPlayed',
    label: 'Holes played',
    short: 'HOLES',
    note: 'Completed player-hole plays',
    color: 'green',
  },
  {
    key: 'roundsPlayed',
    label: 'Rounds played',
    short: 'ROUNDS',
    note: 'One count per scorecard',
    color: 'blue',
  },
  {
    key: 'uniquePlayers',
    label: 'Unique players',
    short: 'PLAYERS',
    note: 'Canonical identity or UDisc username',
    color: 'lime',
  },
  {
    key: 'strokesThrown',
    label: 'Strokes thrown',
    short: 'STROKES',
    note: 'Sum of completed hole scores',
    color: 'orange',
  },
];

function number(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function scoreLabel(score: number, par: number | null): string {
  if (score === 1) return 'Ace';
  if (par === null) return `${score} strokes`;
  const delta = score - par;
  if (delta <= -2) return 'Eagle or better';
  if (delta === -1) return 'Birdie';
  if (delta === 0) return 'Par';
  if (delta === 1) return 'Bogey';
  if (delta === 2) return 'Double bogey';
  return 'Triple+ bogey';
}

export function GlobalStatsDashboard() {
  const [selectedMetric, setSelectedMetric] = useState<GlobalStatMetric>('aces');
  const [data, setData] = useState<GlobalStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (metric: GlobalStatMetric) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/global-stats?metric=${metric}`, {
        schema: GlobalStatsResponseSchema,
      });
      setData(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Global statistics could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(selectedMetric);
  }, [load, selectedMetric]);

  const metrics = data?.metrics;
  const chartMax = Math.max(
    1,
    ...(metrics
      ? [
          metrics.aces,
          metrics.eagles,
          metrics.birdies,
          metrics.pars,
          metrics.bogeys,
          metrics.doubleBogeys,
          metrics.triplePlusBogeys,
        ]
      : [1]),
  );
  const selected = metricCards.find((metric) => metric.key === selectedMetric) ?? {
    key: 'aces',
    label: 'Aces',
    short: 'ACE',
    note: 'Hole-in-ones',
    color: 'lime',
  };

  return (
    <main className="ff-global-stats">
      <section className="ff-stats-hero" aria-labelledby="global-stats-title">
        <Image
          src={fairwayImage}
          alt="A player lining up a throw on a wooded disc golf course"
          fill
          priority
          sizes="(max-width: 760px) 100vw, 1200px"
          className="ff-stats-hero-image"
        />
        <div className="ff-stats-hero-shade" aria-hidden="true" />
        <div className="ff-stats-hero-copy">
          <p className="ff-stats-eyebrow">
            <span /> FAIRWAY FRIENDS · GLOBAL STATS
          </p>
          <h1 id="global-stats-title">
            The course,
            <br />
            <em>in numbers.</em>
          </h1>
          <p>
            Every recorded round adds another line to the story. Explore the public scorecards
            behind the totals.
          </p>
          <p className="ff-stats-updated">
            {data
              ? `Updated ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.updatedAt))}`
              : 'Live totals from saved public scorecards'}
          </p>
        </div>
        <div className="ff-stats-hero-mark" aria-hidden="true">
          FF<span>·</span>
        </div>
      </section>

      <div className="ff-stats-content">
        {error ? (
          <div className="ff-stats-state ff-stats-error" role="alert">
            <strong>Statistics are unavailable right now.</strong>
            <span>{error}</span>
            <Button type="button" variant="outline" onClick={() => void load(selectedMetric)}>
              Try again
            </Button>
          </div>
        ) : null}

        <section className="ff-stats-metric-section" aria-labelledby="stats-overview-title">
          <div className="ff-stats-section-heading">
            <div>
              <p className="ff-stats-overline">THE BIG PICTURE</p>
              <h2 id="stats-overview-title">A community at play</h2>
            </div>
            <p>Choose a stat to see the scorecards and players that shape it.</p>
          </div>

          <div className="ff-stats-grid">
            {metricCards.map((metric) => {
              const value = metrics?.[metric.key];
              return (
                <button
                  key={metric.key}
                  type="button"
                  className={`ff-stat-card ff-stat-${metric.color}${selectedMetric === metric.key ? ' is-selected' : ''}`}
                  onClick={() => setSelectedMetric(metric.key)}
                  aria-pressed={selectedMetric === metric.key}
                >
                  <span className="ff-stat-card-top">
                    <span>{metric.short}</span>
                    <span aria-hidden="true">↗</span>
                  </span>
                  <strong>
                    {loading && value === undefined ? '—' : number(value ?? 0)}
                    {metric.key === 'distanceFeet' ? <small> ft</small> : null}
                  </strong>
                  <span className="ff-stat-card-label">{metric.label}</span>
                  <span className="ff-stat-card-note">{metric.note}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="ff-stats-breakdown" aria-labelledby="score-breakdown-title">
          <div className="ff-stats-section-heading">
            <div>
              <p className="ff-stats-overline">SCORE DISTRIBUTION</p>
              <h2 id="score-breakdown-title">Every hole tells a story</h2>
            </div>
            <span className="ff-stats-chart-caption">
              Completed player-hole plays with a saved par
            </span>
          </div>
          <fieldset className="ff-stats-chart">
            <legend className="sr-only">Choose a score category</legend>
            {metricCards.slice(1, 7).map((metric) => {
              const value = metrics?.[metric.key] ?? 0;
              const height = metrics
                ? Math.max(value > 0 ? 7 : 2, Math.round((value / chartMax) * 100))
                : 0;
              return (
                <button
                  key={metric.key}
                  type="button"
                  className={`ff-stats-bar ff-stat-${metric.color}${selectedMetric === metric.key ? ' is-selected' : ''}`}
                  onClick={() => setSelectedMetric(metric.key)}
                  aria-label={`${metric.label}: ${number(value)}. View contributing records.`}
                  aria-pressed={selectedMetric === metric.key}
                >
                  <span className="ff-stats-bar-value">
                    {loading && !metrics ? '—' : number(value)}
                  </span>
                  <span className="ff-stats-bar-rail">
                    <span style={{ height: `${height}%` }} />
                  </span>
                  <span className="ff-stats-bar-label">{metric.label}</span>
                </button>
              );
            })}
          </fieldset>
          <p className="ff-stats-distance-note">
            Distance is an estimate in feet. It includes only completed player-hole plays on layouts
            with administrator-verified lengths.
          </p>
        </section>

        <section
          className="ff-stats-records"
          aria-labelledby="metric-records-title"
          aria-live="polite"
        >
          <div className="ff-stats-record-heading">
            <div>
              <p className="ff-stats-overline">METRIC EXPLORER</p>
              <h2 id="metric-records-title">
                {selected.label}
                <span>{selected.key === 'distanceFeet' ? ' · estimated feet' : ''}</span>
              </h2>
            </div>
            <span className="ff-stats-record-total">
              {number(metrics?.[selectedMetric] ?? 0)}{' '}
              <small>
                {selected.key === 'distanceFeet' ? 'ft estimated' : selected.label.toLowerCase()}
              </small>
            </span>
          </div>

          {loading ? (
            <output className="ff-stats-state" aria-live="polite">
              Loading contributing records…
            </output>
          ) : data?.contributors.players.length && data.contributors.scorecards.length ? (
            <div className="ff-stats-drilldown">
              <section className="ff-stats-player-list" aria-label="Contributing players">
                <h3>Players in the record</h3>
                <ol>
                  {data.contributors.players.map((player) => (
                    <li key={player.key}>
                      <span className="ff-stats-player-mark" aria-hidden="true">
                        {player.label.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="ff-stats-player-info">
                        {player.profileHref ? (
                          <Link href={player.profileHref}>{player.label}</Link>
                        ) : (
                          <strong>{player.label}</strong>
                        )}
                        <small>
                          {number(player.rounds)} {player.rounds === 1 ? 'round' : 'rounds'} ·{' '}
                          {number(player.holes)} holes · {number(player.strokes)} strokes
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="ff-stats-card-list" aria-label="Contributing scorecards">
                <h3>Scorecards and hole records</h3>
                {data.contributors.scorecards.map((card) => (
                  <article key={card.id} className="ff-stats-scorecard">
                    <header>
                      <div>
                        <p>
                          {formatDate(card.playedOn)}
                          {card.layoutName ? ` · ${card.layoutName}` : ''}
                        </p>
                        <h4>{card.courseName ?? 'Course unavailable'}</h4>
                        {card.hasVerifiedChanges ? (
                          <span className="ff-scorecard-verified">Verified (!)</span>
                        ) : null}
                        <span>
                          {card.clubhouseName ?? 'Unassigned'}
                          {card.leagueName ? ` · ${card.leagueName}` : ''}
                        </span>
                      </div>
                      <div className="ff-stats-card-actions">
                        <a href={card.sourceUrl} target="_blank" rel="noreferrer">
                          UDisc source
                        </a>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/scorecards/${encodeURIComponent(card.id)}/edit`}>
                            Edit Scorecard
                          </Link>
                        </Button>
                      </div>
                    </header>
                    <div className="ff-stats-scorecard-players">
                      {card.players.map((player) => (
                        <div key={player.entryId} className="ff-stats-scorecard-player">
                          <div className="ff-stats-scorecard-player-name">
                            {player.profileHref ? (
                              <Link href={player.profileHref}>{player.label}</Link>
                            ) : (
                              <strong>{player.label}</strong>
                            )}
                            <span>
                              {player.totalScore === null
                                ? 'No holes played'
                                : `${number(player.totalScore)} strokes`}
                            </span>
                            {player.didNotFinish ? (
                              <span className="ff-dnf-badge">
                                Did not finish — {player.holesPlayed} of {player.holeCount ?? '—'}{' '}
                                holes
                              </span>
                            ) : null}
                          </div>
                          <ol aria-label={`${player.label} hole scores`}>
                            {player.holes.map((hole) => (
                              <li
                                key={hole.number}
                                className={hole.contributes ? 'is-contributing' : undefined}
                              >
                                <span>H{hole.number}</span>
                                <strong>{hole.score}</strong>
                                <small>
                                  {scoreLabel(hole.score, hole.par)}
                                  {hole.distanceFeet ? ` · ${hole.distanceFeet} ft` : ''}
                                </small>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            </div>
          ) : (
            <div className="ff-stats-empty">
              <span aria-hidden="true">◎</span>
              <h3>No records contribute to this metric yet.</h3>
              <p>
                When a valid public scorecard adds to {selected.label.toLowerCase()}, it will appear
                here.
              </p>
              <Link href="/players">Explore player profiles</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
