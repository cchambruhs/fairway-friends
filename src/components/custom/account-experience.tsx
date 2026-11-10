// @polsia:user-owned — shared Fairway Friends Account experience.
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AccountPublicNamePrivacy } from '@/components/custom/account-public-name-privacy';
import { AccountThemePreference } from '@/components/custom/account-theme-preference';
import { Button } from '@/components/ui/button';
import { authClient, signOut, useIsAdmin, useSession } from '@/lib/auth-client';

export function AccountExperience({ ownerMode = false }: { ownerMode?: boolean }) {
  const { data: session, isPending } = useSession();
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const [passwordLinkPending, setPasswordLinkPending] = useState(false);
  const [passwordLinkSent, setPasswordLinkSent] = useState(false);

  useEffect(() => {
    if (!isPending && !session?.user) router.replace(ownerMode ? '/admin' : '/login');
    if (!isPending && session?.user && ownerMode && !isAdmin) router.replace('/profile');
  }, [isAdmin, isPending, ownerMode, router, session?.user]);

  async function sendPasswordSetupLink() {
    if (!session?.user || passwordLinkPending) return;
    setPasswordLinkPending(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: session.user.email,
        redirectTo: '/reset-password?callbackURL=%2Fadmin',
      });
      if (result.error) {
        toast.error('A password link could not be sent. Please try again.');
        return;
      }
      setPasswordLinkSent(true);
      toast.success('A password link is on its way to the owner email.');
    } catch {
      toast.error('A password link could not be sent. Please try again.');
    } finally {
      setPasswordLinkPending(false);
    }
  }

  if (isPending || !session?.user || (ownerMode && !isAdmin)) {
    return (
      <div className="ff-profile-page" aria-live="polite">
        <p>{isPending ? 'Loading your account…' : 'Taking you to your account…'}</p>
      </div>
    );
  }

  return (
    <div className="ff-profile-page">
      <div className="ff-profile-heading">
        <p className="ff-profile-kicker">{ownerMode ? 'OWNER ACCOUNT' : 'PLAYER ACCOUNT'}</p>
        <h1>Good to see you, {session.user.name}.</h1>
        <p>Your Fairway Friends account is ready for your next round.</p>
      </div>

      <section className="ff-profile-card" aria-labelledby="account-details-title">
        <div className="ff-profile-card-heading">
          <div>
            <p className="ff-profile-card-kicker">YOUR CLUBHOUSE</p>
            <h2 id="account-details-title">Account details</h2>
          </div>
          <span className="ff-profile-avatar" aria-hidden="true">
            {session.user.name?.charAt(0).toUpperCase() ?? 'F'}
          </span>
        </div>
        <dl className="ff-profile-details">
          <div>
            <dt>Player name</dt>
            <dd>{session.user.name}</dd>
          </div>
          <div>
            <dt>Email address</dt>
            <dd>{session.user.email}</dd>
          </div>
        </dl>
        <AccountThemePreference />
        <AccountPublicNamePrivacy />
        {ownerMode ? (
          <section className="ff-profile-security" aria-labelledby="owner-security-title">
            <div>
              <h2 id="owner-security-title">Sign-in security</h2>
              <p>
                Set a password for future sign-ins. The one-hour link will be sent to the owner
                email.
              </p>
              {passwordLinkSent ? (
                <output className="ff-profile-security-status">
                  Check the owner inbox for your password link.
                </output>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={sendPasswordSetupLink}
              disabled={passwordLinkPending}
            >
              {passwordLinkPending
                ? 'Sending…'
                : passwordLinkSent
                  ? 'Send another password link'
                  : 'Set or reset password'}
            </Button>
          </section>
        ) : null}
      </section>

      <div className="ff-profile-actions">
        <Button asChild variant="outline">
          <Link href="/">Back to Fairway Friends</Link>
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
