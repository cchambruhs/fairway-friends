// @polsia:user-owned — persistent current-Clubhouse indicator and quick switch.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { ClubhouseActionResponseSchema, ClubhouseIndexSchema } from '@/lib/contracts/clubhouses';

export function ActiveClubhouseControl() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadClubhouses>> | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await loadClubhouses());
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function change(clubhouseId: string): Promise<void> {
    setBusy(true);
    try {
      await apiFetch('/api/clubhouses/select', {
        method: 'POST',
        body: JSON.stringify({ clubhouseId: clubhouseId || null }),
        schema: ClubhouseActionResponseSchema,
      });
      await reload();
    } catch {
      await reload();
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  const activeName =
    data.memberships.find((house) => house.id === data.activeClubhouseId)?.name ?? 'Unassigned';

  return (
    <div className="ff-active-clubhouse-control">
      <p>
        Active Clubhouse <strong>{activeName}</strong>
      </p>
      <label className="sr-only" htmlFor="workspace-active-clubhouse">
        Switch active Clubhouse
      </label>
      <select
        id="workspace-active-clubhouse"
        value={data.activeClubhouseId ?? ''}
        disabled={busy}
        onChange={(event) => void change(event.currentTarget.value)}
      >
        <option value="">Unassigned</option>
        {data.memberships.map((house) => (
          <option key={house.id} value={house.id}>
            {house.name}
          </option>
        ))}
      </select>
    </div>
  );
}

async function loadClubhouses() {
  const response = await apiFetch('/api/clubhouses', { schema: ClubhouseIndexSchema });
  return response;
}
