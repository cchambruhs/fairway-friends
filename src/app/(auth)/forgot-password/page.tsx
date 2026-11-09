// @polsia:user-owned — request password recovery from Fairway Friends.
import type { Metadata } from 'next';
import { AuthPageShell } from '@/components/custom/auth-page-shell';
import { ForgotPasswordForm } from '@/components/custom/forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Request a password reset link for your Fairway Friends player account.',
};

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell
      eyebrow="Account recovery"
      title="Get back in the game."
      description="Enter the email address on your account and we’ll send a secure reset link."
    >
      <ForgotPasswordForm />
    </AuthPageShell>
  );
}
