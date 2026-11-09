// @polsia:user-owned — full details and role-aware actions for one League.
import type { Metadata } from 'next';
import { LeagueDetailWorkspace } from '@/components/custom/dashboard/league-workspace';

export const metadata: Metadata = {
  title: 'League details',
  description:
    'Review Fairway Friends League settings, courses, members, invitations, and standings.',
};

export default async function DashboardLeagueDetailPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <LeagueDetailWorkspace leagueId={leagueId} />;
}
