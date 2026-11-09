// @polsia:user-owned — keep accounts without a chosen player identity in setup.
'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { PlayerIdentityPicker } from '@/components/custom/player-identity-picker';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import type { PlayerIdentityChoice, PlayerIdentityState } from '@/lib/contracts/player-identity';
import {
  PlayerIdentityEnrollResponseSchema,
  PlayerIdentityStateSchema,
} from '@/lib/contracts/player-identity';

export function PlayerIdentityGate({
  children,
  displayName,
}: {
  children: ReactNode;
  displayName: string;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<PlayerIdentityState | null>(null);
  const [choice, setChoice] = useState<PlayerIdentityChoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await apiFetch('/api/player-identity', { schema: PlayerIdentityStateSchema }));
      setError(null);
    } catch {
      setError('Your player profile status could not be loaded. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const dashboardHome = pathname === '/dashboard';

  if (!dashboardHome && loading) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">Checking your player profile…</p>;
  }

  if (!dashboardHome && !loading && !state && error) {
    return (
      <section className="ff-identity-setup mx-auto my-8 max-w-2xl rounded-2xl border border-border bg-card p-5 text-card-foreground sm:p-8">
        <p className="ff-player-profile-kicker">PLAYER SETUP</p>
        <h1 className="text-2xl font-semibold">Your player profile could not be checked</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button type="button" className="mt-4" variant="outline" onClick={() => void loadState()}>
          Retry profile check
        </Button>
      </section>
    );
  }

  async function saveChoice(): Promise<void> {
    if (!choice) {
      setError('Search for and choose a player profile first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/player-identity', {
        method: 'POST',
        body: JSON.stringify(choice),
        schema: PlayerIdentityEnrollResponseSchema,
      });
      setChoice(null);
      await loadState();
    } catch {
      setError(
        'That player choice could not be saved. Search again and choose an available profile.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!loading && state && !state.profileComplete) {
    return (
      <section className="ff-identity-setup mx-auto my-8 max-w-2xl rounded-2xl border border-border bg-card p-5 text-card-foreground sm:p-8">
        <p className="ff-player-profile-kicker">PLAYER SETUP</p>
        <h1 className="text-2xl font-semibold">Choose your player profile, {displayName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This choice is required before the workspace opens. Existing UDisc records need an app
          admin’s approval before they are linked to your account.
        </p>
        <div className="mt-6">
          <PlayerIdentityPicker value={choice} onChange={setChoice} />
        </div>
        {error ? (
          <div className="mt-3 grid gap-2">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <Button type="button" variant="outline" onClick={() => void loadState()}>
              Retry
            </Button>
          </div>
        ) : null}
        {choice ? (
          <Button
            type="button"
            className="mt-4 w-full sm:w-auto"
            disabled={saving}
            onClick={() => void saveChoice()}
          >
            {saving ? 'Saving profile…' : 'Continue to Fairway Friends'}
          </Button>
        ) : null}
      </section>
    );
  }

  const identityNotice = loading ? (
    <output className="ff-player-identity-notice" aria-live="polite">
      Checking your player profile…
    </output>
  ) : error ? (
    <div className="ff-player-identity-notice" role="alert">
      <p>{error}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => void loadState()}>
        Retry profile check
      </Button>
    </div>
  ) : state?.identity?.status === 'pending' ? (
    <output className="ff-player-identity-notice" aria-live="polite">
      Your UDisc claim is pending admin review. Existing player history remains unlinked to your
      account until it is approved.
    </output>
  ) : null;

  return (
    <>
      {!dashboardHome ? identityNotice : null}
      {children}
      {dashboardHome ? identityNotice : null}
    </>
  );
}
