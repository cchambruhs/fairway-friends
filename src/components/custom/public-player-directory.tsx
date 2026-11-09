// @polsia:user-owned — searchable public directory of registered player profiles.
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PublicPlayerDirectorySchema } from '@/lib/contracts/player-identity';

export function PublicPlayerDirectory() {
  const [players, setPlayers] = useState<Awaited<ReturnType<typeof loadPlayers>> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    loadPlayers()
      .then((result) => {
        if (active) setPlayers(result);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">FAIRWAY FRIENDS</p>
        <h1>Player profiles</h1>
        <p>Open registered player pages with lifetime numbers drawn from saved UDisc rounds.</p>
      </header>
      {error ? (
        <p role="alert">Players could not be loaded. Try again later.</p>
      ) : players === null ? (
        <p aria-live="polite">Loading player profiles…</p>
      ) : players.length === 0 ? (
        <p>No registered player profiles yet.</p>
      ) : (
        <ul className="ff-public-directory-list">
          {players.map((player) => (
            <li key={player.userId}>
              <Link href={player.profileHref}>
                <strong>{player.displayName}</strong>
                <span>
                  {player.username ? `@${player.username}` : 'UDisc identity pending'} ·{' '}
                  {player.rounds} verified rounds
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

async function loadPlayers() {
  const response = await apiFetch('/api/players', { schema: PublicPlayerDirectorySchema });
  return response.items;
}
