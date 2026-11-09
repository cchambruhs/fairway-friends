// @polsia:user-owned — shared saved-scorecard result and hole-by-hole display.
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ScorecardAssignmentControl } from '@/components/custom/scorecard-assignment-control';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import type { ClubhouseIndex } from '@/lib/contracts/clubhouses';
import { ClubhouseActionResponseSchema } from '@/lib/contracts/clubhouses';
import type { ImportedScorecardItem } from '@/lib/contracts/imported-scorecard';

function displayDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function toParLabel(value: number | null): string {
  if (value === null) return 'Unavailable';
  if (value === 0) return 'Even';
  return value > 0 ? `+${value}` : String(value);
}

export function ImportedScorecardCard({
  item,
  destinations,
  leagueDestinations,
  onSaved,
}: {
  item: ImportedScorecardItem;
  destinations: ClubhouseIndex['assignmentDestinations'];
  leagueDestinations?: ClubhouseIndex['leagueAssignmentDestinations'];
  onSaved: () => void;
}) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const holeCount = item.holeCount ?? item.pars?.length ?? 0;
  const holes = Array.from({ length: holeCount }, (_, index) => index + 1);
  const parRow = item.pars ?? holes.map(() => null);

  return (
    <article className="ff-imported-scorecard" id={`scorecard-${item.id}`}>
      <header className="ff-imported-scorecard-heading">
        <div>
          <p className="ff-imported-scorecard-kicker">
            {item.finalizedAt
              ? 'FINALIZED SAVED SCORECARD'
              : 'SAVED UDISC SCORECARD · NOT FINALIZED'}
          </p>
          {item.hasVerifiedChanges ? (
            <span className="ff-scorecard-verified" title="Approved scorecard edit">
              Verified (!)
            </span>
          ) : null}
          <h3>
            {item.courseName && item.courseUrl ? (
              <a href={item.courseUrl} target="_blank" rel="noreferrer">
                {item.courseName}
              </a>
            ) : (
              (item.courseName ?? 'Course unavailable')
            )}
          </h3>
          <p className="ff-imported-scorecard-meta">
            {displayDate(item.playedOn)} <span aria-hidden="true">·</span>{' '}
            {item.location ?? 'Location unavailable'} <span aria-hidden="true">·</span>{' '}
            {item.layoutName ?? 'Layout unavailable'} <span aria-hidden="true">·</span>{' '}
            {item.holeCount === null ? 'Hole count unavailable' : `${item.holeCount} holes`}{' '}
            <span aria-hidden="true">·</span>{' '}
            {item.totalPar === null ? 'Par unavailable' : `Par ${item.totalPar}`}
          </p>
        </div>
        <a
          className="ff-imported-scorecard-source"
          href={item.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          UDisc source
        </a>
      </header>

      <section
        className="ff-imported-scorecard-table-scroll"
        aria-label={`Hole-by-hole scores for ${item.courseName ?? 'UDisc scorecard'}`}
      >
        <table className="ff-imported-scorecard-table">
          <caption className="sr-only">
            {item.courseName ?? 'UDisc scorecard'} scores from {displayDate(item.playedOn)}
          </caption>
          <thead>
            <tr>
              <th scope="col">UDisc username</th>
              {holes.map((hole) => (
                <th key={hole} scope="col">
                  {hole}
                </th>
              ))}
              <th scope="col">Total</th>
              <th scope="col">To par</th>
              <th scope="col">Position</th>
            </tr>
            <tr className="ff-imported-scorecard-pars">
              <th scope="row">Par</th>
              {holes.map((hole, index) => (
                <td key={hole}>{parRow[index] ?? '—'}</td>
              ))}
              <td>{item.totalPar ?? '—'}</td>
              <td>—</td>
              <td>—</td>
            </tr>
          </thead>
          <tbody>
            {item.players.map((player) => (
              <tr key={player.id}>
                <th scope="row">
                  <span className="ff-scorecard-player-label">
                    <Link
                      href={
                        player.username
                          ? `/players/udisc/${encodeURIComponent(player.username)}`
                          : `/players/entries/${encodeURIComponent(player.id)}`
                      }
                    >
                      {player.username
                        ? player.displayName
                          ? `${player.displayName} @${player.username}`
                          : player.username
                        : (player.displayName ?? 'Username unavailable')}
                    </Link>
                    {player.didNotFinish ? (
                      <span className="ff-dnf-badge">
                        Did not finish — {player.holesPlayed} of {item.holeCount ?? '—'} holes
                      </span>
                    ) : null}
                  </span>
                </th>
                {player.holeScores.map((score, index) => (
                  <td key={`${player.id}-hole-${index + 1}`}>{score ?? '—'}</td>
                ))}
                <td>{player.holesPlayed ? player.totalScore : '—'}</td>
                <td>{toParLabel(player.toPar)}</td>
                <td>{player.position ?? 'Unavailable'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="ff-scorecard-mobile-players" aria-label="Player scores">
        {item.players.map((player) => (
          <article className="ff-scorecard-mobile-player" key={player.id}>
            <header>
              <Link
                href={
                  player.username
                    ? `/players/udisc/${encodeURIComponent(player.username)}`
                    : `/players/entries/${encodeURIComponent(player.id)}`
                }
              >
                {player.username
                  ? player.displayName
                    ? `${player.displayName} @${player.username}`
                    : player.username
                  : (player.displayName ?? 'Username unavailable')}
              </Link>
              {player.didNotFinish ? (
                <span className="ff-dnf-badge">
                  Did not finish — {player.holesPlayed} of {item.holeCount ?? '—'} holes
                </span>
              ) : null}
            </header>
            <dl className="ff-scorecard-mobile-hole-grid">
              {player.holeScores.map((score, index) => (
                <div key={`${player.id}-mobile-hole-${index + 1}`}>
                  <dt>Hole {index + 1}</dt>
                  <dd>{score ?? '—'}</dd>
                  <span className="ff-scorecard-mobile-hole-par">
                    {typeof parRow[index] === 'number' ? `Par ${parRow[index]}` : 'Par unavailable'}
                  </span>
                </div>
              ))}
              <div>
                <dt>Total</dt>
                <dd>{player.holesPlayed ? player.totalScore : '—'}</dd>
              </div>
              <div>
                <dt>To par</dt>
                <dd>{toParLabel(player.toPar)}</dd>
              </div>
              <div>
                <dt>Position</dt>
                <dd>{player.position ?? 'Unavailable'}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
      <p className="ff-imported-scorecard-scroll-hint">
        Scroll the scorecard to see all holes, totals, and recorded placements.
      </p>
      <div className="ff-scorecard-actions">
        <Button asChild size="sm" variant="outline">
          <Link href={`/scorecards/${encodeURIComponent(item.id)}/edit`}>Edit Scorecard</Link>
        </Button>
        {item.canDelete ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              if (
                !window.confirm(
                  'Remove this scorecard from public Global Stats? The original record will be retained.',
                )
              )
                return;
              void apiFetch(`/api/udisc-scorecards/${encodeURIComponent(item.id)}`, {
                method: 'DELETE',
                schema: ClubhouseActionResponseSchema,
              })
                .then(() => onSaved())
                .catch((reason: unknown) => {
                  setDeleteError(
                    reason instanceof Error ? reason.message : 'Scorecard removal failed.',
                  );
                });
            }}
          >
            Remove from public stats
          </Button>
        ) : null}
      </div>
      {deleteError ? (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      ) : null}
      <ScorecardAssignmentControl
        item={item}
        destinations={destinations}
        leagueDestinations={leagueDestinations}
        onSaved={onSaved}
      />
    </article>
  );
}
