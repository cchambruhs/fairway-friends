// @polsia:user-owned — account-level display preference control.
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAuthThemePreference } from '@/components/custom/auth-theme-sync';
import type { PlayerTheme } from '@/lib/contracts/player-preferences';

const choices: { value: PlayerTheme; label: string; description: string }[] = [
  { value: 'system', label: 'Device', description: 'Follow your device setting.' },
  { value: 'light', label: 'Light', description: 'Use the light clubhouse.' },
  { value: 'dark', label: 'Dark', description: 'Use the dark clubhouse.' },
];

export function AccountThemePreference() {
  const [saving, setSaving] = useState(false);
  const { preference, isLoading: pending, savePreference } = useAuthThemePreference();

  async function chooseTheme(theme: PlayerTheme) {
    if (saving || pending) return;
    setSaving(true);
    try {
      await savePreference(theme);
    } catch {
      toast.error('Your appearance preference could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const description = choices.find((choice) => choice.value === preference)?.description;

  return (
    <section className="ff-account-theme" aria-labelledby="theme-preference-title">
      <div className="ff-account-theme-copy">
        <h2 id="theme-preference-title">Appearance</h2>
        <p>{pending ? 'Loading your saved setting…' : description}</p>
      </div>
      <fieldset className="ff-theme-options">
        <legend className="sr-only">Saved appearance preference</legend>
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={preference === choice.value}
            disabled={pending || saving}
            onClick={() => void chooseTheme(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </fieldset>
    </section>
  );
}
