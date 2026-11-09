// @polsia:user-owned — link destination for a Clubhouse invitation.
import type { Metadata } from 'next';
import { ClubhouseInviteJoin } from '@/components/custom/clubhouse-invite-join';

export const metadata: Metadata = {
  title: 'Join a Clubhouse',
  description: 'Accept a Fairway Friends Clubhouse invitation.',
};

export default async function ClubhouseInvitePage({
  params,
}: {
  params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await params;
  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-xl flex-col justify-center gap-5 px-4 py-12">
      <p className="ff-player-profile-kicker">CLUBHOUSE INVITATION</p>
      <h1 className="text-3xl font-semibold tracking-tight">Play with this crew.</h1>
      <p className="text-muted-foreground">
        Sign in or create a player profile to join through this private invite link.
      </p>
      <ClubhouseInviteJoin inviteToken={inviteToken} />
    </main>
  );
}
