// @polsia:user-owned — routes company-owner sign-in and first access into Account.
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AccountExperience } from '@/components/custom/account-experience';
import { AuthPageShell } from '@/components/custom/auth-page-shell';
import { OwnerAccessForm } from '@/components/custom/owner-access-form';
import { SignInForm } from '@/components/custom/sign-in-form';
import { useIsAdmin, useSession } from '@/lib/auth-client';

export function OwnerAccessScreen({
  callbackURL,
  verificationIssue = false,
}: {
  callbackURL: string;
  verificationIssue?: boolean;
}) {
  const { data: session, isPending } = useSession();
  const isAdmin = useIsAdmin();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && session?.user && !isAdmin) router.replace('/profile');
  }, [isAdmin, isPending, router, session?.user]);

  if (isPending) {
    return (
      <main className="ff-profile-page" aria-live="polite">
        <p>Checking your account…</p>
      </main>
    );
  }

  if (session?.user && isAdmin) return <AccountExperience ownerMode />;

  if (session?.user) {
    return (
      <main className="ff-profile-page" aria-live="polite">
        <p>Taking you to your player account…</p>
      </main>
    );
  }

  return (
    <AuthPageShell
      eyebrow="Owner access"
      title="Welcome back."
      description="Sign in to your Fairway Friends account. Company owner access is verified through the owner email on file."
      showAuthNav={false}
    >
      <SignInForm callbackURL={callbackURL} />
      <div className="ff-owner-access-divider" aria-hidden="true">
        <span />
        <span>or</span>
        <span />
      </div>
      <OwnerAccessForm callbackURL={callbackURL} verificationIssue={verificationIssue} />
    </AuthPageShell>
  );
}
