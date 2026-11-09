// @polsia:user-owned — seeded by polsia/modules/better-auth; restyle freely.
'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsAdmin, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export function AuthNav({
  presentation = 'standard',
  callbackURL,
}: {
  presentation?: 'standard' | 'landing' | 'auth';
  callbackURL?: string;
}) {
  const { data: session, isPending } = useSession();
  const isAdmin = useIsAdmin();
  const pathname = usePathname();
  const authLink = (path: '/login' | '/signup') =>
    callbackURL ? `${path}?callbackURL=${encodeURIComponent(callbackURL)}` : path;

  // Render nothing until the session resolves — avoids a Sign-in→Profile flash.
  if (isPending) return null;

  if (!session?.user) {
    const landing = presentation === 'landing';
    const authPage = presentation === 'auth';
    const recoveryPage = pathname === '/forgot-password' || pathname === '/reset-password';
    const showSignIn = pathname !== '/login';
    const showSignUp = pathname !== '/signup' && !recoveryPage;
    return (
      <nav
        className={cn(
          'flex items-center gap-2',
          landing && 'ff-account-nav ff-account-nav-landing',
          authPage && 'ff-account-nav ff-account-nav-auth',
        )}
      >
        <div
          className={
            presentation === 'standard'
              ? 'hidden items-center gap-2 md:flex'
              : 'flex items-center gap-2'
          }
        >
          {showSignIn ? (
            <Button asChild variant="ghost" className={landing ? 'ff-sign-in' : undefined}>
              <Link href={authLink('/login')}>Sign in</Link>
            </Button>
          ) : null}
          {showSignUp ? (
            <Button asChild className={landing ? 'ff-header-cta' : undefined}>
              <Link href={authLink('/signup')}>Create account</Link>
            </Button>
          ) : null}
        </div>
        {presentation === 'standard' ? (
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" aria-label="Account menu">
                  Account
                  <ChevronDown className="ml-1 size-4 opacity-60" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {showSignIn ? (
                  <DropdownMenuItem asChild>
                    <Link href={authLink('/login')}>Sign in</Link>
                  </DropdownMenuItem>
                ) : null}
                {showSignUp ? (
                  <DropdownMenuItem asChild>
                    <Link href={authLink('/signup')}>Create account</Link>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </nav>
    );
  }

  return (
    <nav className={cn('flex items-center gap-2', presentation !== 'standard' && 'ff-account-nav')}>
      <div
        className={
          presentation === 'standard'
            ? 'hidden items-center gap-2 md:flex'
            : 'flex items-center gap-2'
        }
      >
        <Button asChild variant="ghost">
          <Link href="/dashboard">Workspace</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard/account">Account</Link>
        </Button>
        {isAdmin ? (
          <Button asChild variant="ghost">
            <Link href="/admin">Owner access</Link>
          </Button>
        ) : null}
      </div>
      {presentation === 'standard' ? (
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" aria-label="Account menu">
                Account
                <ChevronDown className="ml-1 size-4 opacity-60" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/dashboard">Workspace</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/account">Account</Link>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem asChild>
                  <Link href="/admin">Owner access</Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </nav>
  );
}
