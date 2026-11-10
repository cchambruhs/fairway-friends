// @polsia:user-owned — "hide my name on public cards" account setting.
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/lib/api-client';
import { PublicNamePrivacySchema } from '@/lib/contracts/player-preferences';

export function AccountPublicNamePrivacy() {
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/api/player-preferences/privacy', { schema: PublicNamePrivacySchema })
      .then((value) => {
        if (active) setHidden(value.hidePublicName);
      })
      .catch(() => {
        if (active) setHidden(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function change(next: boolean) {
    if (saving) return;
    const previous = hidden;
    setHidden(next);
    setSaving(true);
    try {
      await apiFetch('/api/player-preferences/privacy', {
        method: 'PUT',
        body: JSON.stringify({ hidePublicName: next }),
        schema: PublicNamePrivacySchema,
      });
      toast.success(next ? 'Your name is now hidden on public cards.' : 'Your name is now shown.');
    } catch {
      setHidden(previous);
      toast.error('Your privacy setting could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ff-account-theme" aria-labelledby="public-name-privacy-title">
      <div className="ff-account-theme-copy">
        <h2 id="public-name-privacy-title">Public scorecards</h2>
        <p>
          Every scorecard is part of the public Complete History. Turn this on to appear as “Player
          1”, “Player 2” and so on instead of your name and UDisc username. Your Clubhouse friends
          still see your name.
        </p>
      </div>
      <label className="flex items-center gap-3" htmlFor="hide-public-name">
        <Switch
          id="hide-public-name"
          checked={hidden ?? false}
          disabled={hidden === null || saving}
          onCheckedChange={(value) => void change(value)}
        />
        <span>Hide my name on public cards</span>
      </label>
    </section>
  );
}
