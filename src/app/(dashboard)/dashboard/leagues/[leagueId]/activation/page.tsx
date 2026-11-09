// @polsia:user-owned — confirms one saved activation checkout before the League is enabled.
import type { Metadata } from 'next';
import { LeagueActivationConfirmationWorkspace } from '@/components/custom/dashboard/league-workspace';

export const metadata: Metadata = {
  title: 'League activation',
  description: 'Confirm Fairway Friends League activation after checkout.',
};

export default async function LeagueActivationPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const [{ leagueId }, query] = await Promise.all([params, searchParams]);
  return (
    <LeagueActivationConfirmationWorkspace
      leagueId={leagueId}
      sessionId={query.session_id ?? null}
    />
  );
}
