// @polsia:user-owned — player account creation page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthPageShell } from '@/components/custom/auth-page-shell';
import { SignUpForm } from '@/components/custom/sign-up-form';
import { safeSameOriginPath } from '@/lib/business/auth-return-path';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a Fairway Friends player account with your email and password.',
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string | string[] }>;
}) {
  const params = await searchParams;
  const callbackURL = Array.isArray(params.callbackURL)
    ? params.callbackURL[0]
    : params.callbackURL;
  const returnTo = safeSameOriginPath(callbackURL, '/dashboard');
  return (
    <AuthPageShell
      eyebrow="Join the clubhouse"
      title="Your crew is here."
      description="Create a player account to bring your rounds and league play together."
      callbackURL={returnTo}
    >
      <SignUpForm callbackURL={returnTo} />
      <p className="ff-auth-switch">
        Already have an account?{' '}
        <Link href={`/login?callbackURL=${encodeURIComponent(returnTo)}`}>Sign in</Link>
      </p>
      <p className="ff-auth-quiet-note">Your account is ready as soon as you sign up.</p>
    </AuthPageShell>
  );
}
