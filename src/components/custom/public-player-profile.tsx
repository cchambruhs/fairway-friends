// @polsia:user-owned — public player identity, unofficial stats, and finalized scorecards.
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PlayerStatisticsView } from '@/components/custom/player-statistics-view';
import { apiFetch } from '@/lib/api-client';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import {
  type PublicPlayerProfile as PublicPlayerProfileData,
  PublicPlayerProfileResponseSchema,
} from '@/lib/contracts/player-identity';

function displayDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function PlayerName({
  username,
  displayName,
  entryId,
}: {
  username: string | null;
  displayName: string | null;
  entryId: string;
}) {
  const label = displayName ?? username ?? 'Player';
  const href = username
    ? `/players/udisc/${encodeURIComponent(username)}`
    : `/players/entries/${encodeURIComponent(entryId)}`;
  return (
    <Link href={href} className="font-medium underline-offset-4 hover:underline">
      {label}
    </Link>
  );
}

function ScorecardDetails({ card }: { card: PublicPlayerProfileData['rounds'][number] }) {
  return (
    <details className="ff-public-round-details">
      <summary>Full scorecard · {card.holeCount ?? card.pars?.length ?? '—'} holes</summary>
      <div className="ff-imported-scorecard-table-scroll">
        <table className="ff-imported-scorecard-table">
          <caption className="sr-only">
            Saved UDisc scores at {card.courseName ?? 'an unnamed course'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Player</th>
              {card.pars?.map((_par, index) => (
                <th key={`hole-${index + 1}`} scope="col">
                  {index + 1}
                </th>
              ))}
              <th scope="col">Total</th>
              <th scope="col">Place</th>
            </tr>
            <tr className="ff-imported-scorecard-pars">
              <th scope="row">Par</th>
              {card.pars?.map((par, index) => (
                <td key={`par-${index + 1}`}>{par ?? '—'}</td>
              ))}
              <td>{card.totalPar ?? '—'}</td>
              <td>—</td>
            </tr>
          </thead>
          <tbody>
            {card.players.map((player) => (
              <tr key={player.id}>
                <th scope="row">
                  <PlayerName
                    username={player.username}
                    displayName={player.displayName}
                    entryId={player.id}
                  />
                  {player.didNotFinish ? (
                    <span className="ff-dnf-badge">
                      Did not finish — {player.holesPlayed} of {card.holeCount ?? '—'} holes
                    </span>
                  ) : null}
                </th>
                {player.holeScores.map((score, index) => (
                  <td key={`${player.id}-${index + 1}`}>{score ?? '—'}</td>
                ))}
                <td>{player.holesPlayed ? player.totalScore : '—'}</td>
                <td>{player.position ?? 'Unavailable'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function PublicPlayerProfile({ endpoint }: { endpoint: string }) {
  const [profile, setProfile] = useState<PublicPlayerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch(endpoint, { schema: PublicPlayerProfileResponseSchema })
      .then((response) => {
        if (!active) return;
        const validated = PublicPlayerProfileResponseSchema.parse(response);
        setProfile(validated.profile);
        setFailed(validated.profile === null);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  if (loading) return <p aria-live="polite">Loading saved player statistics…</p>;
  if (failed || !profile) return <p role="alert">This player profile could not be loaded.</p>;

  return (
    <div className="ff-public-player-profile">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">PUBLIC PLAYER PROFILE</p>
        <h1>{profile.displayName}</h1>
        <p>
          {profile.username ? `UDisc · @${profile.username}` : 'Fairway Friends player'}
          {' · '}
          {profile.identityStatus === 'verified'
            ? 'Identity verified'
            : profile.identityStatus === 'pending'
              ? 'Identity claim awaiting admin review'
              : 'UDisc identity not verified'}
        </p>
        <p>Only finalized scorecards linked to this exact identity contribute to these metrics.</p>
      </header>

      <section className="ff-official-rating-note" aria-label="Official rating status">
        <strong>Official PDGA rating: Unavailable</strong>
        <span>
          No authorized verified rating source is connected. Fairway Friends does not calculate one.
        </span>
      </section>

      <PlayerStatisticsView profile={profile} />

      <section
        className="ff-public-profile-section"
        aria-labelledby="player-clubhouse-rankings-title"
      >
        <p className="ff-profile-section-kicker">CLUBHOUSE STANDINGS</p>
        <h2 id="player-clubhouse-rankings-title">Rankings by Clubhouse</h2>
        {profile.clubhouseRankings.length === 0 ? (
          <p>No assigned finalized Clubhouse rounds are available for ranking.</p>
        ) : (
          <ul className="ff-public-record-list">
            {profile.clubhouseRankings.map((standing) => (
              <li key={standing.clubhouseId}>
                <strong>
                  {standing.clubhouseName} · #{standing.rank}
                </strong>
                <span>
                  {standing.rounds} finalized rounds · {standing.wins ?? 'Unavailable'} wins ·
                  {' average '}
                  {standing.averageScore}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ff-public-profile-section" aria-labelledby="player-best-rounds-title">
        <p className="ff-profile-section-kicker">BEST ROUNDS</p>
        <h2 id="player-best-rounds-title">Top finalized rounds</h2>
        {profile.bestRounds.length === 0 ? (
          <p>No finalized saved rounds are linked to this player yet.</p>
        ) : (
          <ol className="ff-public-best-rounds">
            {profile.bestRounds.map((card) => {
              const player = card.players.find(
                (entry) =>
                  entry.username !== null &&
                  profile.username !== null &&
                  normalizeUDiscUsername(entry.username) ===
                    normalizeUDiscUsername(profile.username),
              );
              return (
                <li key={card.id}>
                  {card.courseName ?? 'Course unavailable'} · {displayDate(card.playedOn)} ·{' '}
                  {player?.totalScore ?? 'Unavailable'} ·{' '}
                  <a href={card.sourceUrl} target="_blank" rel="noreferrer">
                    source card
                  </a>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="ff-public-profile-section" aria-labelledby="player-round-history-title">
        <p className="ff-profile-section-kicker">FINALIZED HISTORY</p>
        <h2 id="player-round-history-title">Scorecards</h2>
        {profile.rounds.length === 0 ? (
          <p>No finalized scorecards are linked to this exact player identity.</p>
        ) : (
          <ul className="ff-public-round-list">
            {profile.rounds.map((card) => {
              const player = card.players.find(
                (entry) =>
                  entry.username !== null &&
                  profile.username !== null &&
                  normalizeUDiscUsername(entry.username) ===
                    normalizeUDiscUsername(profile.username),
              );
              return (
                <li key={card.id}>
                  <div className="ff-public-round-heading">
                    <div>
                      <h3>{card.courseName ?? 'Course unavailable'}</h3>
                      <p>
                        {displayDate(card.playedOn)} · {card.layoutName ?? 'Layout unavailable'} ·{' '}
                        {card.clubhouseName ?? 'Unassigned'}
                      </p>
                    </div>
                    <strong>{player?.totalScore ?? 'Unavailable'}</strong>
                  </div>
                  <p>
                    <a href={card.sourceUrl} target="_blank" rel="noreferrer">
                      Open saved source card
                    </a>
                  </p>
                  <ScorecardDetails card={card} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
