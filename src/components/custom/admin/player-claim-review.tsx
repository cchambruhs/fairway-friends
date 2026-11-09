// @polsia:user-owned — app-admin review queue for pending UDisc claims.
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { PlayerClaimListSchema, ReviewPlayerClaimSchema } from '@/lib/contracts/player-identity';

type ClaimList = z.infer<typeof PlayerClaimListSchema>;

export function PlayerClaimReview() {
  const [claims, setClaims] = useState<ClaimList['claims'] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await apiFetch('/api/admin/player-claims', { schema: PlayerClaimListSchema });
      setClaims(result.claims);
      setError(null);
    } catch {
      setError('Player claims could not be loaded. Admin authorization is required.');
      setClaims([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function review(claimId: string, decision: 'approve' | 'deny'): Promise<void> {
    setBusyId(claimId);
    setError(null);
    try {
      const body = ReviewPlayerClaimSchema.parse({ claimId, decision });
      await apiFetch('/api/admin/player-claims', { method: 'POST', body: JSON.stringify(body) });
      await reload();
    } catch {
      setError('The claim could not be reviewed. It may already have been handled.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="ff-admin-claims" aria-labelledby="pending-claims-title">
      <header>
        <p className="ff-player-profile-kicker">IDENTITY REVIEW</p>
        <h1 id="pending-claims-title">Player claims</h1>
        <p>
          Approving links the account to every saved scorecard row with this exact normalized UDisc
          username.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {claims === null ? (
        <p aria-live="polite">Loading pending claims…</p>
      ) : claims.length === 0 ? (
        <p>No claims are waiting for review.</p>
      ) : (
        <ul className="ff-admin-claim-list">
          {claims.map((claim) => (
            <li key={claim.id}>
              <div>
                <p className="ff-profile-section-kicker">@{claim.username}</p>
                <h2>{claim.claimantName}</h2>
                <p>{claim.claimantEmail}</p>
                <p>
                  Existing scorecards show:{' '}
                  {claim.displayNames.join(', ') || 'No display names available'}
                </p>
                <time dateTime={claim.requestedAt}>
                  {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
                    new Date(claim.requestedAt),
                  )}
                </time>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void review(claim.id, 'approve')}
                >
                  {busyId === claim.id ? 'Saving…' : 'Approve claim'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => void review(claim.id, 'deny')}
                >
                  Deny
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
