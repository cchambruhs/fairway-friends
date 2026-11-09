// @polsia:user-owned — synchronize device and saved player appearance in one place.
'use client';

import { useTheme } from 'next-themes';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiFetch } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { PlayerPreferenceSchema, type PlayerTheme } from '@/lib/contracts/player-preferences';

interface AuthThemeContextValue {
  preference: PlayerTheme;
  isLoading: boolean;
  signedIn: boolean;
  savePreference: (theme: PlayerTheme) => Promise<PlayerTheme>;
}

const AuthThemeContext = createContext<AuthThemeContextValue | null>(null);

export function AuthThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const { setTheme } = useTheme();
  const setThemeRef = useRef(setTheme);
  setThemeRef.current = setTheme;
  const [preference, setPreference] = useState<PlayerTheme>('system');
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const userId = session?.user?.id;
  const signedIn = Boolean(userId);
  const isLoading = isPending || (signedIn && loadedUserId !== userId);

  useEffect(() => {
    if (isPending) return;

    let active = true;
    if (!userId) {
      setPreference('system');
      setLoadedUserId(null);
      setThemeRef.current('system');
      return () => {
        active = false;
      };
    }

    setThemeRef.current('system');
    void apiFetch('/api/player-preferences', { schema: PlayerPreferenceSchema })
      .then((saved) => {
        if (!active) return;
        setPreference(saved.theme);
        setLoadedUserId(userId);
        setThemeRef.current(saved.theme);
      })
      .catch(() => {
        if (!active) return;
        setPreference('system');
        setLoadedUserId(userId);
        setThemeRef.current('system');
      });

    return () => {
      active = false;
    };
  }, [isPending, userId]);

  const savePreference = useCallback(
    async (theme: PlayerTheme): Promise<PlayerTheme> => {
      if (!userId) throw new Error('Sign in before saving an account appearance preference.');

      const saved = await apiFetch('/api/player-preferences', {
        method: 'PUT',
        body: JSON.stringify({ theme }),
        schema: PlayerPreferenceSchema,
      });
      setPreference(saved.theme);
      setLoadedUserId(userId);
      setThemeRef.current(saved.theme);
      return saved.theme;
    },
    [userId],
  );

  const value = useMemo(
    () => ({ preference, isLoading, signedIn, savePreference }),
    [preference, isLoading, signedIn, savePreference],
  );

  return <AuthThemeContext.Provider value={value}>{children}</AuthThemeContext.Provider>;
}

export function useAuthThemePreference(): AuthThemeContextValue {
  const value = useContext(AuthThemeContext);
  if (!value) throw new Error('useAuthThemePreference must be used within AuthThemeProvider.');
  return value;
}
