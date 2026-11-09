// @polsia:user-owned — protected Clubhouse detail, membership and standings route.
import type { Metadata } from 'next';
import { ClubhouseDetailWorkspace } from '@/components/custom/dashboard/clubhouse-detail-workspace';

export const metadata: Metadata = {
  title: 'Clubhouse',
  description: 'View Clubhouse members, local standings, invites and assigned scorecards.',
};

export default async function ClubhouseDetailPage({
  params,
}: {
  params: Promise<{ clubhouseId: string }>;
}) {
  const { clubhouseId } = await params;
  return <ClubhouseDetailWorkspace clubhouseId={clubhouseId} />;
}
