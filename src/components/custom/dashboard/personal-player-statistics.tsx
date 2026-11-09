// @polsia:user-owned — signed-in player statistics summary.
'use client';

import { useEffect, useState } from 'react';
import { PlayerStatisticsView } from '@/components/custom/player-statistics-view';
import { apiFetch } from '@/lib/api-client';
import {
  type PublicPlayerProfile,
  PublicPlayerProfileResponseSchema,
} from '@/lib/contracts/player-identity';

export function PersonalPlayerStatistics() {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch('/api/player-statistics', { schema: PublicPlayerProfileResponseSchema })
      .then((response) => {
        if (active) setProfile(response.profile);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Statistics could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p role="alert">Your statistics could not be loaded: {error}</p>;
  if (!profile) return <p aria-live="polite">Loading your statistics…</p>;
  return <PlayerStatisticsView profile={profile} />;
}
