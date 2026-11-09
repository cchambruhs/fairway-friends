// @polsia:user-owned
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn } from '@/lib/auth-client';
import { safeSameOriginPath } from '@/lib/business/auth-return-path';

// Email + password sign-in. Composes the template's base shadcn primitives
// (Button/Input/Label) styled through the theme tokens. Restyle freely — this
// file is user-owned. Calls better-auth's authClient.signIn.email; on success
// the session cookie is set by the catch-all route handler and the page reloads.
export function SignInForm({ callbackURL = '/dashboard' }: { callbackURL?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const { error: signInError } = await signIn.email({ email, password });
    setPending(false);
    if (signInError) {
      setError(signInError.message ?? 'Could not sign in. Check your details.');
      return;
    }
    window.location.assign(safeSameOriginPath(callbackURL, '/dashboard'));
  }

  return (
    <form onSubmit={handleSubmit} className="ff-auth-form" noValidate>
      <Label htmlFor="sign-in-email">Email address</Label>
      <Input
        id="sign-in-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
      />
      <Label htmlFor="sign-in-password">Password</Label>
      <Input
        id="sign-in-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
      />
      <div className="flex justify-end -mt-1">
        <Link className="ff-auth-back-link" href="/forgot-password">
          Forgot password?
        </Link>
      </div>
      {error ? (
        <p className="ff-auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="ff-auth-submit">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
