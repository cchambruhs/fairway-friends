// @polsia:user-owned — public registered-player profile route.
import type { Metadata } from 'next';
import { PublicPlayerProfile } from '@/components/custom/public-player-profile';

export const metadata: Metadata = {
  title: 'Fairway Friends player profile',
  description: 'Saved UDisc scorecard statistics and round history for a Fairway Friends player.',
};

export default async function PublicRegisteredPlayerPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <PublicPlayerProfile endpoint={`/api/players/user/${encodeURIComponent(userId)}`} />;
}
