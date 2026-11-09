// @polsia:user-owned — redeem a password reset link.
import type { Metadata } from 'next';
import { AuthPageShell } from '@/components/custom/auth-page-shell';
import { ResetPasswordForm } from '@/components/custom/reset-password-form';

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new password for your Fairway Friends player account.',
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; callbackURL?: string }>;
}) {
  const params = await searchParams;
  const token = params.error ? undefined : params.token;

  return (
    <AuthPageShell
      eyebrow="Account recovery"
      title="Set a new password."
      description="Choose a password you haven’t used before. Reset links expire after one hour."
    >
      <ResetPasswordForm token={token} callbackURL={params.callbackURL} />
    </AuthPageShell>
  );
}
