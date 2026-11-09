// @polsia:user-owned — per-Clubhouse memberships, standings and global scorecards.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';
import { ImportedScorecardCard } from '@/components/custom/imported-scorecard-card';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import {
  ClubhouseActionResponseSchema,
  type ClubhouseDetail,
  ClubhouseDetailSchema,
  type ClubhouseIndex,
  ClubhouseIndexSchema,
  type ClubhouseRoleSchema,
} from '@/lib/contracts/clubhouses';

type ClubhouseRole = z.infer<typeof ClubhouseRoleSchema>;

function displayDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

export function ClubhouseDetailWorkspace({ clubhouseId }: { clubhouseId: string }) {
  const [detail, setDetail] = useState<ClubhouseDetail | null>(null);
  const [index, setIndex] = useState<ClubhouseIndex | null>(null);
  const [roleChoices, setRoleChoices] = useState<Record<string, ClubhouseRole>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [clubhouse, clubs] = await Promise.all([
        apiFetch(`/api/clubhouses/${encodeURIComponent(clubhouseId)}`, {
          schema: ClubhouseDetailSchema,
        }),
        apiFetch('/api/clubhouses', { schema: ClubhouseIndexSchema }),
      ]);
      setDetail(clubhouse);
      setIndex(clubs);
      setError(null);
    } catch {
      setError('This Clubhouse could not be loaded. Check your membership and try again.');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [clubhouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function runAction(body: Record<string, string>, success: string): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/clubhouses/${encodeURIComponent(clubhouseId)}/members`, {
        method: 'POST',
        body: JSON.stringify(body),
        schema: ClubhouseActionResponseSchema,
      });
      setMessage(success);
      await reload();
    } catch {
      setError('That Clubhouse action is not allowed or could not be saved.');
    } finally {
      setPending(false);
    }
  }

  async function selectActive(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await apiFetch('/api/clubhouses/select', {
        method: 'POST',
        body: JSON.stringify({ clubhouseId: detail?.clubhouse.active ? null : clubhouseId }),
        schema: ClubhouseActionResponseSchema,
      });
      setMessage(
        detail?.clubhouse.active
          ? 'Imports will be Unassigned.'
          : 'This Clubhouse is now active for imports.',
      );
      await reload();
    } catch {
      setError('This Clubhouse is no longer an eligible membership.');
    } finally {
      setPending(false);
    }
  }

  async function copyInvite(): Promise<void> {
    if (!detail?.clubhouse.inviteToken) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/clubhouses/join/${detail.clubhouse.inviteToken}`,
      );
      setMessage('Invite link copied.');
    } catch {
      setError(
        'Clipboard access is unavailable. Copy the invitation URL from your browser address bar.',
      );
    }
  }

  if (loading && !detail) return <p aria-live="polite">Loading Clubhouse…</p>;
  if (!detail) return <p role="alert">{error ?? 'Clubhouse unavailable.'}</p>;

  const manages = detail.clubhouse.role === 'Owner' || detail.clubhouse.role === 'Admin';
  const owns = detail.clubhouse.role === 'Owner';

  return (
    <div className="ff-clubhouse-detail">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">
          CLUBHOUSE · {detail.clubhouse.role.toUpperCase()}
        </p>
        <h1>{detail.clubhouse.name}</h1>
        <p>{detail.clubhouse.description ?? 'A Fairway Friends crew.'}</p>
        <p>
          {detail.clubhouse.active
            ? 'Active import destination'
            : 'Not the current import destination'}{' '}
          · {detail.clubhouse.memberCount} members
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={detail.clubhouse.active ? 'outline' : 'default'}
            disabled={pending}
            onClick={() => void selectActive()}
          >
            {detail.clubhouse.active ? 'Set imports to Unassigned' : 'Use for new imports'}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href="/dashboard/clubhouses">All Clubhouses</Link>
          </Button>
        </div>
      </header>

      {error ? (
        <p className="ff-auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <output className="text-sm text-muted-foreground">{message}</output> : null}

      {manages ? (
        <section className="ff-clubhouse-panel" aria-labelledby="clubhouse-invite-title">
          <p className="ff-profile-section-kicker">INVITATIONS</p>
          <h2 id="clubhouse-invite-title">Bring in your crew</h2>
          <p>
            Join code <code>{detail.clubhouse.joinCode}</code>
          </p>
          <p className="break-all">
            Invite path <code>{`/clubhouses/join/${detail.clubhouse.inviteToken}`}</code>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void copyInvite()}>
              Copy invite link
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                void runAction({ action: 'rotate-invite' }, 'New invite code and link created.')
              }
            >
              Rotate invite
            </Button>
          </div>
        </section>
      ) : null}

      {detail.pendingRequests.length > 0 ? (
        <section className="ff-clubhouse-panel" aria-labelledby="clubhouse-requests-title">
          <p className="ff-profile-section-kicker">OWNER / ADMIN TOOLS</p>
          <h2 id="clubhouse-requests-title">Membership requests</h2>
          <ul className="ff-clubhouse-request-list">
            {detail.pendingRequests.map((request) => (
              <li key={request.id}>
                <p>
                  <strong>{request.displayName}</strong> · requested{' '}
                  {displayDate(request.requestedAt.slice(0, 10))}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void runAction(
                        { action: 'approve-request', requestId: request.id },
                        'Membership approved.',
                      )
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      void runAction(
                        { action: 'deny-request', requestId: request.id },
                        'Membership request declined.',
                      )
                    }
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="ff-clubhouse-panel" aria-labelledby="clubhouse-roster-title">
        <div className="ff-clubhouse-section-heading">
          <div>
            <p className="ff-profile-section-kicker">ROSTER</p>
            <h2 id="clubhouse-roster-title">Members &amp; standings</h2>
          </div>
          <span>Ranks, wins, and average use finalized complete rounds</span>
        </div>
        <section className="ff-clubhouse-roster-scroll" aria-label="Clubhouse standings">
          <table className="ff-clubhouse-roster">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                <th scope="col">Role</th>
                <th scope="col">Rounds</th>
                <th scope="col">Holes</th>
                <th scope="col">Strokes</th>
                <th scope="col">Wins</th>
                <th scope="col">Win rate</th>
                <th scope="col">Average</th>
                {manages ? <th scope="col">Membership</th> : null}
              </tr>
            </thead>
            <tbody>
              {detail.members.map((member) => (
                <tr key={member.userId}>
                  <td data-label="Rank">{member.rank === null ? '—' : `#${member.rank}`}</td>
                  <th data-label="Player" scope="row">
                    <Link href={member.profileHref}>{member.displayName}</Link>
                  </th>
                  <td data-label="Role">{member.role}</td>
                  <td data-label="Rounds">{member.rounds}</td>
                  <td data-label="Holes played">{member.holesPlayed}</td>
                  <td data-label="Strokes thrown">{member.strokesThrown}</td>
                  <td data-label="Wins">{member.wins ?? 'Unavailable'}</td>
                  <td data-label="Win rate">
                    {member.winPercentage === null ? 'Unavailable' : `${member.winPercentage}%`}
                  </td>
                  <td data-label="Average">{member.averageScore ?? 'Unavailable'}</td>
                  {manages ? (
                    <td data-label="Membership">
                      {member.role === 'Owner' || (!owns && member.role === 'Admin') ? (
                        `${member.role} · owner management only`
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label={`Role for ${member.displayName}`}
                            value={roleChoices[member.userId] ?? member.role}
                            onChange={(event) =>
                              setRoleChoices((current) => ({
                                ...current,
                                [member.userId]: event.currentTarget.value as ClubhouseRole,
                              }))
                            }
                          >
                            <option value="Member">Member</option>
                            {owns ? <option value="Admin">Admin</option> : null}
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              pending || (roleChoices[member.userId] ?? member.role) === member.role
                            }
                            onClick={() =>
                              void runAction(
                                {
                                  action: 'set-role',
                                  userId: member.userId,
                                  role: roleChoices[member.userId] ?? member.role,
                                },
                                'Member role updated.',
                              )
                            }
                          >
                            Save role
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending || (!owns && member.role !== 'Member')}
                            onClick={() =>
                              void runAction(
                                { action: 'remove-member', userId: member.userId },
                                'Member removed.',
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <p className="ff-clubhouse-roster-scroll-hint">
          Holes and strokes include linked DNF cards. Ranks, wins, and average use finalized
          complete rounds.
        </p>
      </section>

      <section className="ff-clubhouse-panel" aria-labelledby="clubhouse-scorecards-title">
        <p className="ff-profile-section-kicker">LINKED SAVED RESULTS</p>
        <h2 id="clubhouse-scorecards-title">Clubhouse scorecards</h2>
        {detail.scorecards.length === 0 ? (
          <p>No scorecards are assigned to this Clubhouse yet.</p>
        ) : (
          <ul className="ff-clubhouse-scorecards">
            {detail.scorecards.map((card) => (
              <li key={card.id}>
                <ImportedScorecardCard
                  item={card}
                  destinations={index?.assignmentDestinations ?? []}
                  leagueDestinations={index?.leagueAssignmentDestinations ?? []}
                  onSaved={() => void reload()}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
