// @polsia:user-owned — member Leagues destination and standings workspace.
import type { Metadata } from 'next';
import { LeagueWorkspace } from '@/components/custom/dashboard/league-workspace';

export const metadata: Metadata = {
  title: 'Leagues',
  description: 'Manage your Fairway Friends League destinations and review finalized standings.',
};

export default function DashboardLeaguesPage() {
  return <LeagueWorkspace />;
}
