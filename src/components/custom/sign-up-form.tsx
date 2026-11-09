// @polsia:user-owned
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PlayerIdentityPicker } from '@/components/custom/player-identity-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-client';
import { signUp } from '@/lib/auth-client';
import { safeSameOriginPath } from '@/lib/business/auth-return-path';
import type { PlayerIdentityChoice } from '@/lib/contracts/player-identity';
import {
  PlayerIdentityEnrollResponseSchema,
  PlayerRegistrationChoiceResponseSchema,
} from '@/lib/contracts/player-identity';

type SignUpFailure = {
  message: string;
  accountHelp: boolean;
};

function getSignUpFailure(code: string | undefined): SignUpFailure {
  switch (code) {
    case 'INVALID_EMAIL':
      return { message: 'Enter a valid email address.', accountHelp: false };
    case 'PASSWORD_TOO_SHORT':
      return { message: 'Choose a password with at least 8 characters.', accountHelp: false };
    case 'PASSWORD_TOO_LONG':
      return { message: 'Choose a shorter password and try again.', accountHelp: false };
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return {
        message: 'This email may already have an account.',
        accountHelp: true,
      };
    default:
      return {
        message: 'We couldn’t create your account. Check your details and try again.',
        accountHelp: true,
      };
  }
}

// Email + password sign-up. Composes the template's base shadcn primitives
// (Button/Input/Label) styled through the theme tokens. Restyle freely — this
// file is user-owned. Calls better-auth's authClient.signUp.email; better-auth
// requires a name field, so we collect one. On success the session cookie is
// set by the catch-all route handler and the page reloads.
export function SignUpForm({ callbackURL = '/dashboard' }: { callbackURL?: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [identityChoice, setIdentityChoice] = useState<PlayerIdentityChoice | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<SignUpFailure | undefined>(undefined);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setFailure(undefined);

    if (!identityChoice) {
      setFailure({
        message: 'Search for and choose your UDisc player profile before creating an account.',
        accountHelp: false,
      });
      setPending(false);
      return;
    }

    try {
      await apiFetch('/api/player-identity/registration-choice', {
        method: 'POST',
        body: JSON.stringify({ email, ...identityChoice }),
        schema: PlayerRegistrationChoiceResponseSchema,
      });
      const { error: signUpError } = await signUp.email({
        name,
        email,
        password,
        callbackURL,
      });

      if (signUpError) {
        setFailure(getSignUpFailure(signUpError.code));
        return;
      }

      await apiFetch('/api/player-identity', {
        method: 'POST',
        body: JSON.stringify(identityChoice),
        schema: PlayerIdentityEnrollResponseSchema,
      });
      window.location.assign(safeSameOriginPath(callbackURL, '/dashboard'));
    } catch {
      setFailure(getSignUpFailure(undefined));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ff-auth-form" noValidate>
      <Label htmlFor="sign-up-name">Name</Label>
      <Input
        id="sign-up-name"
        name="name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setFailure(undefined);
        }}
        required
      />
      <Label htmlFor="sign-up-email">Email address</Label>
      <Input
        id="sign-up-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setFailure(undefined);
        }}
        required
      />
      <Label htmlFor="sign-up-password">Password</Label>
      <Input
        id="sign-up-password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setFailure(undefined);
        }}
        required
      />
      <PlayerIdentityPicker value={identityChoice} onChange={setIdentityChoice} />
      {failure ? (
        <p className="ff-auth-error" role="alert">
          {failure.message}{' '}
          {failure.accountHelp ? (
            <>
              <Link href="/login">Sign in</Link> or{' '}
              <Link href="/forgot-password">reset your password</Link>, then try again.
            </>
          ) : null}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="ff-auth-submit">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
