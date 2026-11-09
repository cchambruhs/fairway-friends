// @polsia:user-owned
'use client';

import { Disc3, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActiveClubhouseControl } from '@/components/custom/dashboard/active-clubhouse-control';
import { PlayerIdentityGate } from '@/components/custom/dashboard/player-identity-gate';
import { useSession } from '@/lib/auth-client';
import { DashboardNav, MobileDashboardTabs } from './dashboard-nav';

export interface DashboardShellProps {
  children: ReactNode;
}

function hasRole(role: string | null | undefined, expected: string) {
  return (
    role
      ?.split(',')
      .map((item) => item.trim())
      .includes(expected) ?? false
  );
}

export function DashboardShell({ children }: DashboardShellProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isAdmin = hasRole(session?.user?.role, 'admin');

  useEffect(() => {
    if (!isPending && !session?.user) {
      const callbackURL = `${pathname}${window.location.search}`;
      router.replace(`/login?callbackURL=${encodeURIComponent(callbackURL)}`);
    }
  }, [isPending, pathname, router, session?.user]);

  useEffect(() => {
    if (!mobileOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  if (isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-gutter">
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      </main>
    );
  }

  if (!session?.user) {
    // The effect above redirects to /login; this is the brief transition state,
    // not a stable screen.
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-gutter">
        <p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
      </main>
    );
  }

  return (
    <div className="ff-workspace min-h-dvh bg-background text-foreground">
      <header className="ff-workspace-header">
        <div className="ff-workspace-header-inner mx-auto w-full max-w-7xl px-gutter">
          <Link href="/dashboard" className="ff-workspace-brand">
            <span className="ff-workspace-mark">
              <Disc3 aria-hidden="true" className="size-5" />
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              Fairway <span>Friends</span>
            </span>
          </Link>
          <button
            type="button"
            ref={menuButtonRef}
            className="ff-workspace-menu-toggle"
            aria-label={mobileOpen ? 'Close workspace menu' : 'Open workspace menu'}
            aria-controls="player-workspace-navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            <span>{mobileOpen ? 'Close' : 'Menu'}</span>
          </button>
          <DashboardNav
            isAdmin={isAdmin}
            mobileOpen={mobileOpen}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      </header>

      <main className="ff-workspace-body mx-auto w-full max-w-7xl flex-1 px-gutter">
        {pathname !== '/dashboard' && !pathname.startsWith('/dashboard/clubhouses') ? (
          <ActiveClubhouseControl />
        ) : null}
        <section className="ff-workspace-content min-w-0">
          <PlayerIdentityGate displayName={session.user.name}>{children}</PlayerIdentityGate>
        </section>
      </main>
      {!pathname.startsWith('/admin') ? <MobileDashboardTabs /> : null}
    </div>
  );
}
