// @polsia:user-owned — light/dark theme toggle. Reusable; mounted in SiteNav.

'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { useAuthThemePreference } from '@/components/custom/auth-theme-sync';
import { Button } from '@/components/ui/button';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { signedIn, isLoading, savePreference } = useAuthThemePreference();

  async function toggleTheme() {
    const theme = resolvedTheme === 'dark' ? 'light' : 'dark';
    if (!signedIn || isLoading) {
      setTheme(theme);
      return;
    }

    try {
      await savePreference(theme);
    } catch {
      toast.error('Your appearance preference could not be saved.');
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      className={className}
      aria-label="Toggle theme"
      disabled={isLoading}
      onClick={() => void toggleTheme()}
    >
      {/* Visibility is driven by the `.dark` class (set by next-themes outside React),
          not React state — so server and client markup match and there's no flash. */}
      <Sun className="block dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
