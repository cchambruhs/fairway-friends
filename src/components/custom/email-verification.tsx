// @polsia:user-owned
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export function EmailVerification({
  email,
  callbackURL = '/profile',
}: {
  email: string;
  callbackURL?: string;
}) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  async function resend() {
    setPending(true);
    setSent(false);
    setFailed(false);
    try {
      const result = await authClient.sendVerificationEmail({ email, callbackURL });
      if (result.error) setFailed(true);
      else setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Verify your email</h2>
      <p className="text-sm text-muted-foreground">
        Confirm {email} using a verification link. If you haven’t received an email, request one
        below.
      </p>
      {sent ? <output>Check your inbox for your verification link.</output> : null}
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          We could not send the verification email. Please try again shortly.
        </p>
      ) : null}
      <Button type="button" onClick={resend} disabled={pending}>
        {pending ? 'Sending…' : 'Resend verification email'}
      </Button>
    </div>
  );
}
