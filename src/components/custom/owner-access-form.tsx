// @polsia:user-owned — first access and verification-link recovery for the company owner.
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { OwnerAccessResponse } from '@/lib/contracts/owner-access';

export function OwnerAccessForm({
  callbackURL,
  verificationIssue = false,
}: {
  callbackURL: string;
  verificationIssue?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestAccess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await apiFetch('/api/owner-access', {
        method: 'POST',
        body: JSON.stringify({ callbackURL }),
        schema: OwnerAccessResponse,
      });
      setSent(true);
    } catch {
      setError('We could not send the owner link. Please try again shortly.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="ff-owner-access" aria-labelledby="owner-access-title">
      <div>
        <p className="ff-owner-access-kicker">COMPANY OWNER</p>
        <h3 id="owner-access-title">First access</h3>
        <p className="ff-owner-access-copy">
          A private link goes to the owner email on file. It expires after one hour. If your link
          expired, request a fresh one here.
        </p>
      </div>
      {verificationIssue ? (
        <output className="ff-owner-access-expired">
          That owner link has expired or is invalid. You can request another below.
        </output>
      ) : null}
      {sent ? (
        <output className="ff-auth-feedback" aria-live="polite">
          <p>
            If owner access is available, a fresh link is on its way to the company owner email.
          </p>
          <p className="ff-auth-feedback-note">The link expires after one hour.</p>
        </output>
      ) : null}
      {error ? (
        <p className="ff-auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <form onSubmit={requestAccess}>
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          className="ff-owner-access-button"
        >
          {pending
            ? 'Sending link…'
            : sent || verificationIssue
              ? 'Resend owner link'
              : 'Send owner setup link'}
        </Button>
      </form>
    </section>
  );
}
