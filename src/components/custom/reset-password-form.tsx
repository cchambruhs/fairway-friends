// @polsia:user-owned — redeem a single-use password reset token.
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { safeSameOriginPath } from '@/lib/business/auth-return-path';

export function ResetPasswordForm({
  token,
  callbackURL,
}: {
  token: string | undefined;
  callbackURL?: string;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnTo = safeSameOriginPath(callbackURL, '/login');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError('This reset link is expired or invalid. Request a new one to continue.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setPending(true);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? 'This reset link is expired or invalid.');
      return;
    }
    setComplete(true);
  }

  if (complete) {
    return (
      <output className="ff-auth-feedback">
        <p>Your password has been updated.</p>
        <Link href={returnTo}>
          {returnTo === '/login' ? 'Sign in with your new password' : 'Continue to your account'}
        </Link>
      </output>
    );
  }

  return (
    <form className="ff-auth-form" onSubmit={submit}>
      <label htmlFor="reset-password">New password</label>
      <input
        id="reset-password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <label htmlFor="reset-password-confirmation">Confirm new password</label>
      <input
        id="reset-password-confirmation"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        required
      />
      {error ? (
        <p className="ff-auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="ff-auth-submit" type="submit" disabled={pending}>
        {pending ? 'Updating password…' : 'Update password'}
      </button>
    </form>
  );
}
