// @polsia:user-owned — accept an invite token after sign-in and player setup.
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { ClubhouseActionResponseSchema } from '@/lib/contracts/clubhouses';

export function ClubhouseInviteJoin({ inviteToken }: { inviteToken: string }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await apiFetch('/api/clubhouses/join', {
        method: 'POST',
        body: JSON.stringify({ kind: 'invite', value: inviteToken }),
        schema: ClubhouseActionResponseSchema,
      });
      if (result.clubhouseId) router.push(`/dashboard/clubhouses/${result.clubhouseId}`);
    } catch (cause) {
      const responseBody = cause instanceof Error ? cause.cause : null;
      const message =
        typeof responseBody === 'object' && responseBody !== null && 'error' in responseBody
          ? String(responseBody.error)
          : 'This invite could not be accepted. Sign in and try again.';
      setError(message);
    } finally {
      setPending(false);
    }
  }

  const returnPath = `/clubhouses/join/${encodeURIComponent(inviteToken)}`;
  if (isPending) return <p aria-live="polite">Checking your account…</p>;
  if (!session?.user) {
    const callback = encodeURIComponent(returnPath);
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href={`/login?callbackURL=${callback}`}>Sign in to join</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/signup?callbackURL=${callback}`}>Create an account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" disabled={pending} onClick={() => void join()}>
        {pending ? 'Joining…' : 'Join this Clubhouse'}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}{' '}
          {error.includes('profile') ? (
            <Link className="underline" href="/dashboard">
              Complete player setup
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
