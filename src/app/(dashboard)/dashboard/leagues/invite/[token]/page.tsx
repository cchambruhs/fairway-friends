// @polsia:user-owned — signed-in recipient preview and acceptance for League invitations.
import type { Metadata } from 'next';
import { LeagueInvitationWorkspace } from '@/components/custom/dashboard/league-workspace';

export const metadata: Metadata = {
  title: 'League invitation',
  description: 'Review and accept a Fairway Friends League invitation.',
};

export default async function LeagueInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <LeagueInvitationWorkspace token={token} />;
}
