// @polsia:user-owned — signup and onboarding choice for exact UDisc identity.
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-client';
import {
  type PlayerIdentityChoice,
  type PlayerIdentitySearch,
  PlayerIdentitySearchSchema,
} from '@/lib/contracts/player-identity';

export function PlayerIdentityPicker({
  value,
  onChange,
}: {
  value: PlayerIdentityChoice | null;
  onChange: (choice: PlayerIdentityChoice | null) => void;
}) {
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<PlayerIdentitySearch | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(): Promise<void> {
    const trimmed = username.trim().replace(/^@/u, '');
    if (!trimmed) {
      setError('Enter your UDisc username first.');
      return;
    }
    setSearching(true);
    setError(null);
    onChange(null);
    try {
      const response = await apiFetch(
        `/api/player-identities/search?username=${encodeURIComponent(trimmed)}`,
        { schema: PlayerIdentitySearchSchema },
      );
      setResult(response);
      if (response.claimStatus === 'claimed') setError('That UDisc username is already claimed.');
      else if (response.claimStatus === 'pending')
        setError('A claim for that username is already awaiting review.');
    } catch {
      setError('The UDisc username search could not be completed. Try again.');
      setResult(null);
    } finally {
      setSearching(false);
    }
  }

  function choose(mode: PlayerIdentityChoice['mode']): void {
    if (!result || !result.isAvailable) return;
    onChange({ username: result.username, mode });
    setError(null);
  }

  return (
    <fieldset className="ff-identity-choice">
      <legend>Choose your player profile</legend>
      <p>
        Search your exact UDisc username. Claims for saved players stay pending until an app admin
        reviews them.
      </p>
      <Label htmlFor="udisc-username-choice">UDisc username</Label>
      <div className="ff-identity-search-row">
        <Input
          id="udisc-username-choice"
          name="udiscUsername"
          autoComplete="off"
          value={username}
          onChange={(event) => {
            setUsername(event.currentTarget.value);
            setResult(null);
            setError(null);
            onChange(null);
          }}
          placeholder="Your UDisc username"
        />
        <Button type="button" variant="outline" disabled={searching} onClick={search}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
      </div>

      {result ? (
        <div className="ff-identity-search-result" aria-live="polite">
          {result.hasExistingRecord ? (
            <>
              <p>
                <strong>Saved player found:</strong> @{result.username}
              </p>
              {result.displayNames.length > 0 ? (
                <p>Scorecards use: {result.displayNames.join(', ')}</p>
              ) : null}
              {result.isAvailable ? (
                <Button
                  type="button"
                  variant={value?.mode === 'claim' ? 'default' : 'outline'}
                  onClick={() => choose('claim')}
                >
                  Claim existing player
                </Button>
              ) : (
                <p>This username is already claimed or awaiting review.</p>
              )}
            </>
          ) : (
            <>
              <p>No saved player matches @{result.username}.</p>
              {result.isAvailable ? (
                <Button
                  type="button"
                  variant={value?.mode === 'create' ? 'default' : 'outline'}
                  onClick={() => choose('create')}
                >
                  Create a new player profile
                </Button>
              ) : (
                <p>This username is already in use.</p>
              )}
            </>
          )}
          {value ? (
            <output>
              Selected: {value.mode === 'claim' ? 'claim the saved player' : 'create a new player'}{' '}
              · @{value.username}
            </output>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="ff-auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
