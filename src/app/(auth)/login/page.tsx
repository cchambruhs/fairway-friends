// @polsia:user-owned — player sign-in page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthPageShell } from '@/components/custom/auth-page-shell';
import { SignInForm } from '@/components/custom/sign-in-form';
import { safeSameOriginPath } from '@/lib/business/auth-return-path';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Fairway Friends player account.',
};

export default async function LoginPage({
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
      eyebrow="Player sign in"
      title="Welcome back."
      description="Pick up where you left off with your rounds and your crew."
      callbackURL={returnTo}
    >
      <SignInForm callbackURL={returnTo} />
      <p className="ff-auth-switch">
        New to Fairway Friends?{' '}
        <Link href={`/signup?callbackURL=${encodeURIComponent(returnTo)}`}>
          Create your account
        </Link>
      </p>
    </AuthPageShell>
  );
}
