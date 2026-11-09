// @polsia:user-owned — shared view for unofficial statistics from saved finalized results.

import Link from 'next/link';
import type { PublicPlayerProfile } from '@/lib/contracts/player-identity';

function displayDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function valueOrUnavailable(value: number | null, suffix = ''): string {
  return value === null ? 'Unavailable' : `${value}${suffix}`;
}

function toParLabel(value: number | null): string {
  if (value === null) return 'Unavailable';
  if (value === 0) return 'Even';
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

function PerformanceGraph({ profile }: { profile: PublicPlayerProfile }) {
  const points = profile.performance;
  if (points.length === 0) return <p>No dated finalized rounds are available to graph yet.</p>;
  const values = points.map((point) => point.score);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const width = 480;
  const height = 150;
  const coordinates = values
    .map((score, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = high === low ? height / 2 : height - ((score - low) / (high - low)) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <figure className="ff-public-performance">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Finalized saved scores range from ${low} to ${high}`}
      >
        <title>Finalized scorecard results by date</title>
        <polyline
          points={coordinates}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <figcaption>
        {points.length} dated finalized rounds · score {low} to {high}. Points follow saved round
        date order.
        {profile.statistics.undatedRounds > 0
          ? ` ${profile.statistics.undatedRounds} finalized ${profile.statistics.undatedRounds === 1 ? 'round has' : 'rounds have'} no date and are not plotted.`
          : ''}
      </figcaption>
    </figure>
  );
}

export function PlayerStatisticsView({ profile }: { profile: PublicPlayerProfile }) {
  const statistics = profile.statistics;
  const metrics = [
    { label: 'Lifetime rounds', value: String(statistics.lifetimeRounds) },
    { label: 'Recorded wins', value: valueOrUnavailable(statistics.wins) },
    {
      label: 'Win percentage',
      value: valueOrUnavailable(statistics.winPercentage, '%'),
      detail: `${statistics.roundsWithPlacement} rounds with a saved placement`,
    },
    { label: 'Average score', value: valueOrUnavailable(statistics.averageScore) },
    { label: 'Average to par', value: toParLabel(statistics.averageToPar) },
    { label: 'Best score', value: valueOrUnavailable(statistics.bestScore) },
    {
      label: 'Birdies',
      value: valueOrUnavailable(statistics.birdies),
      detail: `${statistics.knownParHoles} hole results with known pars`,
    },
    {
      label: 'Eagles',
      value: valueOrUnavailable(statistics.eagles),
      detail: `${statistics.unknownParHoles} hole results without pars are excluded`,
    },
    { label: 'Aces', value: valueOrUnavailable(statistics.aces) },
    {
      label: 'Longest under-par streak',
      value: valueOrUnavailable(statistics.longestUnderParHoleStreak, ' holes'),
      detail: 'Within one complete saved round',
    },
    {
      label: 'Longest consecutive wins',
      value: valueOrUnavailable(statistics.longestCompetitionWinStreak),
      detail: 'Competition streak requires dated placements on every finalized round',
    },
    { label: 'Saved course records', value: String(statistics.savedCourseRecords) },
  ];

  return (
    <div className="ff-player-statistics">
      <div className="ff-statistics-source-note" role="note">
        Unofficial Fairway Friends statistics · calculated from finalized saved scorecards linked to
        this exact player identity. Birdies and eagles use only holes with known pars.
      </div>

      <section
        className="ff-public-stat-grid ff-player-statistics-grid"
        aria-label="Player statistics"
      >
        {metrics.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            {'detail' in metric && metric.detail ? <small>{metric.detail}</small> : null}
          </article>
        ))}
      </section>

      {statistics.lifetimeRounds === 0 ? (
        <p className="ff-statistics-empty-note">
          No finalized scorecards are linked to this exact player identity yet. Unsupported values
          remain unavailable.
        </p>
      ) : null}

      <section className="ff-public-profile-section" aria-labelledby="player-performance-title">
        <p className="ff-profile-section-kicker">PERFORMANCE</p>
        <h2 id="player-performance-title">Score trend</h2>
        <PerformanceGraph profile={profile} />
      </section>

      <section className="ff-public-profile-section" aria-labelledby="player-records-title">
        <p className="ff-profile-section-kicker">SAVED RESULT RECORDS</p>
        <h2 id="player-records-title">Course records</h2>
        {profile.courseRecords.length === 0 ? (
          <p>No course record is supported by comparable finalized saved results yet.</p>
        ) : (
          <ul className="ff-public-record-list">
            {profile.courseRecords.map((record) => (
              <li key={`${record.scorecardId}-${record.layoutName ?? 'layout'}`}>
                <div>
                  <strong>{record.courseName}</strong>
                  <span>
                    {record.layoutName ?? 'Layout unavailable'} · score {record.score} ·{' '}
                    {displayDate(record.playedOn)}
                  </span>
                  <span>
                    Fairway Friends saved-result record · compared across {record.comparisonRounds}{' '}
                    finalized cards
                    {record.tiedPlayerCount > 1
                      ? ` · tied among ${record.tiedPlayerCount} identified players`
                      : ''}
                  </span>
                </div>
                <a href={record.sourceUrl} target="_blank" rel="noreferrer">
                  Open supporting scorecard
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ff-public-profile-section" aria-labelledby="player-achievements-title">
        <p className="ff-profile-section-kicker">MILESTONES</p>
        <h2 id="player-achievements-title">Achievements</h2>
        {profile.achievements.length === 0 ? (
          <p>No saved-result milestone has been reached yet.</p>
        ) : (
          <ul className="ff-statistics-achievement-list">
            {profile.achievements.map((achievement) => (
              <li key={achievement.id}>
                <strong>{achievement.title}</strong>
                <span>{achievement.criteria}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ff-public-profile-section" aria-labelledby="player-rivals-title">
        <p className="ff-profile-section-kicker">SHARED FINALIZED CARDS</p>
        <h2 id="player-rivals-title">Rivals</h2>
        <p className="ff-statistics-section-note">
          Head-to-head results compare saved scores on the same finalized scorecard. Lower scores
          count as a win; equal scores count as a tie.
        </p>
        {profile.rivals.length === 0 ? (
          <p>No other identified players share a finalized scorecard yet.</p>
        ) : (
          <ul className="ff-statistics-rival-list">
            {profile.rivals.map((rival) => (
              <li key={rival.username}>
                <div className="ff-statistics-rival-heading">
                  <Link href={rival.profileHref}>{rival.displayName}</Link>
                  <span>
                    {rival.sharedRounds} shared finalized cards · {rival.wins} wins · {rival.losses}{' '}
                    losses · {rival.ties} ties
                  </span>
                </div>
                <ul>
                  {rival.sharedCards.slice(0, 3).map((shared) => (
                    <li key={shared.scorecardId}>
                      <span>
                        {shared.courseName ?? 'Course unavailable'} · {displayDate(shared.playedOn)}{' '}
                        · {shared.playerScore}–{shared.rivalScore}
                      </span>
                      <a href={shared.sourceUrl} target="_blank" rel="noreferrer">
                        View saved card
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
