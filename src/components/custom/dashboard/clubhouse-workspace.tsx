// @polsia:user-owned — member-facing Clubhouse creation, joining and selection.
'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import {
  ClubhouseActionResponseSchema,
  type ClubhouseIndex,
  ClubhouseIndexSchema,
} from '@/lib/contracts/clubhouses';

export function ClubhouseWorkspace() {
  const [data, setData] = useState<ClubhouseIndex | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch('/api/clubhouses', { schema: ClubhouseIndexSchema }));
      setError(null);
    } catch {
      setError('Clubhouses could not be loaded. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createClubhouse(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<{ ok: boolean; clubhouseId: string }>('/api/clubhouses', {
        method: 'POST',
        body: JSON.stringify({ name, description: description || null }),
      });
      setName('');
      setDescription('');
      setMessage('Clubhouse created. You are its Owner.');
      await reload();
      window.location.assign(`/dashboard/clubhouses/${result.clubhouseId}`);
    } catch {
      setError('The Clubhouse could not be created. Check the name and try again.');
    } finally {
      setPending(false);
    }
  }

  async function joinByCode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!joinCode.trim()) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch('/api/clubhouses/join', {
        method: 'POST',
        body: JSON.stringify({ kind: 'code', value: joinCode.trim() }),
        schema: ClubhouseActionResponseSchema,
      });
      setJoinCode('');
      setMessage(result.message ?? 'Clubhouse joined.');
      await reload();
    } catch {
      setError('That join code could not be used. Check it with a Clubhouse Owner or Admin.');
    } finally {
      setPending(false);
    }
  }

  async function selectClubhouse(clubhouseId: string | null): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await apiFetch('/api/clubhouses/select', {
        method: 'POST',
        body: JSON.stringify({ clubhouseId }),
        schema: ClubhouseActionResponseSchema,
      });
      setMessage(
        clubhouseId ? 'Active Clubhouse updated.' : 'Imports will be saved as Unassigned.',
      );
      await reload();
    } catch {
      setError('That Clubhouse is not an eligible membership.');
    } finally {
      setPending(false);
    }
  }

  async function reviewRequest(
    clubhouseId: string,
    requestId: string,
    action: 'approve-request' | 'deny-request',
  ) {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/clubhouses/${encodeURIComponent(clubhouseId)}/members`, {
        method: 'POST',
        body: JSON.stringify({ action, requestId }),
        schema: ClubhouseActionResponseSchema,
      });
      setMessage(
        action === 'approve-request'
          ? 'Membership request approved.'
          : 'Membership request declined.',
      );
      await reload();
    } catch {
      setError('The membership request could not be updated. Refresh and try again.');
    } finally {
      setPending(false);
    }
  }

  if (loading && !data) return <p aria-live="polite">Loading Clubhouses…</p>;

  return (
    <div className="ff-clubhouse-workspace">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">YOUR CREWS</p>
        <h1>Clubhouses</h1>
        <p>
          Create a place for your group, join more than one, and choose where new CardCast imports
          are assigned.
        </p>
      </header>

      <section className="ff-clubhouse-active-panel" aria-labelledby="active-clubhouse-title">
        <div>
          <p className="ff-profile-section-kicker">CURRENT IMPORT DESTINATION</p>
          <h2 id="active-clubhouse-title">
            {data?.memberships.find((house) => house.id === data.activeClubhouseId)?.name ??
              'Unassigned'}
          </h2>
          <p>Every new imported scorecard remains shared globally and is also assigned here.</p>
        </div>
        <div className="ff-clubhouse-select-control">
          <label htmlFor="active-clubhouse">Active Clubhouse</label>
          <select
            id="active-clubhouse"
            value={data?.activeClubhouseId ?? ''}
            disabled={pending}
            onChange={(event) => void selectClubhouse(event.currentTarget.value || null)}
          >
            <option value="">Unassigned</option>
            {data?.memberships.map((house) => (
              <option key={house.id} value={house.id}>
                {house.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <p className="ff-auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <output className="text-sm text-muted-foreground">{message}</output> : null}

      <div className="ff-clubhouse-actions-grid">
        <section className="ff-clubhouse-panel" aria-labelledby="create-clubhouse-title">
          <p className="ff-profile-section-kicker">START A CREW</p>
          <h2 id="create-clubhouse-title">Create a Clubhouse</h2>
          <form className="ff-clubhouse-form" onSubmit={(event) => void createClubhouse(event)}>
            <label htmlFor="clubhouse-name">Name</label>
            <input
              id="clubhouse-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.currentTarget.value)}
              required
            />
            <label htmlFor="clubhouse-description">
              Description <span>(optional)</span>
            </label>
            <textarea
              id="clubhouse-description"
              value={description}
              maxLength={500}
              rows={3}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create Clubhouse'}
            </Button>
          </form>
        </section>

        <section className="ff-clubhouse-panel" aria-labelledby="join-code-title">
          <p className="ff-profile-section-kicker">HAVE AN INVITE CODE?</p>
          <h2 id="join-code-title">Join a Clubhouse</h2>
          <form className="ff-clubhouse-form" onSubmit={(event) => void joinByCode(event)}>
            <label htmlFor="clubhouse-join-code">Join code</label>
            <input
              id="clubhouse-join-code"
              autoComplete="off"
              value={joinCode}
              onChange={(event) => setJoinCode(event.currentTarget.value)}
              required
            />
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? 'Joining…' : 'Join with code'}
            </Button>
          </form>
        </section>
      </div>

      <section className="ff-clubhouse-panel" aria-labelledby="memberships-title">
        <div className="ff-clubhouse-section-heading">
          <div>
            <p className="ff-profile-section-kicker">YOUR MEMBERSHIPS</p>
            <h2 id="memberships-title">My Clubhouses</h2>
          </div>
          <span>{data?.memberships.length ?? 0} joined</span>
        </div>
        {data?.memberships.length ? (
          <ul className="ff-clubhouse-card-list">
            {data.memberships.map((house) => (
              <li key={house.id}>
                <Link href={`/dashboard/clubhouses/${house.id}`}>
                  <strong>{house.name}</strong>
                  <span>
                    {house.description ?? 'Disc golf crew'} · {house.memberCount} members ·{' '}
                    {house.role}
                  </span>
                  {house.id === data.activeClubhouseId ? <em>Active for imports</em> : null}
                </Link>
                {house.joinCode ? (
                  <p>
                    Join code <code>{house.joinCode}</code>
                  </p>
                ) : null}
                {house.inviteToken ? (
                  <p>
                    <Link href={`/clubhouses/join/${house.inviteToken}`}>Open invite link</Link>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>You are not in a Clubhouse yet. Create one or join with an invite.</p>
        )}
      </section>

      {data?.publicClubhouses.length ? (
        <section className="ff-clubhouse-panel" aria-labelledby="public-clubhouses-title">
          <p className="ff-profile-section-kicker">OPEN TO REQUESTS</p>
          <h2 id="public-clubhouses-title">Discover Clubhouses</h2>
          <ul className="ff-clubhouse-card-list">
            {data.publicClubhouses.map((house) => (
              <li key={house.id}>
                <div>
                  <strong>{house.name}</strong>
                  <span>
                    {house.description ?? 'A Fairway Friends crew'} · {house.memberCount} members
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    void (async () => {
                      setPending(true);
                      try {
                        await apiFetch('/api/clubhouses/join', {
                          method: 'POST',
                          body: JSON.stringify({ kind: 'request', clubhouseId: house.id }),
                          schema: ClubhouseActionResponseSchema,
                        });
                        setMessage(`Request sent to ${house.name}.`);
                        await reload();
                      } catch {
                        setError('The membership request could not be sent.');
                      } finally {
                        setPending(false);
                      }
                    })()
                  }
                >
                  Request membership
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data?.pendingRequests.length ? (
        <section className="ff-clubhouse-panel" aria-labelledby="membership-requests-title">
          <p className="ff-profile-section-kicker">OWNER / ADMIN TOOLS</p>
          <h2 id="membership-requests-title">Membership requests</h2>
          <ul className="ff-clubhouse-request-list">
            {data.pendingRequests.map((request) => (
              <li key={request.id}>
                <p>
                  <strong>{request.displayName}</strong> requested to join {request.clubhouseName}.
                </p>
                <div>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void reviewRequest(request.clubhouseId, request.id, 'approve-request')
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      void reviewRequest(request.clubhouseId, request.id, 'deny-request')
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
    </div>
  );
}
