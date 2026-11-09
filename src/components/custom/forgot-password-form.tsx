// @polsia:user-owned — request a time-limited password reset link.
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedEmail = new FormData(event.currentTarget).get('email');
    if (typeof submittedEmail !== 'string' || !submittedEmail.trim()) {
      setError('Enter the email address for your account.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await authClient.requestPasswordReset({
        email: submittedEmail.trim(),
        redirectTo: '/reset-password',
      });
      if (result.error) {
        setError(result.error.message || 'The reset link could not be sent. Try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('The reset link could not be sent. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <output className="ff-auth-feedback">
        <p>If that email belongs to a Fairway Friends account, a reset link is on its way.</p>
        <p className="ff-auth-feedback-note">The link expires after one hour.</p>
        <Link href="/login">Back to sign in</Link>
      </output>
    );
  }

  return (
    <form className="ff-auth-form" noValidate onSubmit={submit}>
      <label htmlFor="forgot-email">Email address</label>
      <input
        id="forgot-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
      />
      {error ? (
        <p className="ff-auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="ff-auth-submit" type="submit" disabled={pending}>
        {pending ? 'Sending link…' : 'Send reset link'}
      </button>
      <Link className="ff-auth-back-link" href="/login">
        Back to sign in
      </Link>
    </form>
  );
}
