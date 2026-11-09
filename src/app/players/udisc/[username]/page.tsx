// @polsia:user-owned — public UDisc player profile route.
import type { Metadata } from 'next';
import { PublicPlayerProfile } from '@/components/custom/public-player-profile';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} player profile`,
    description: `Saved UDisc scorecard statistics and round history for @${username} on Fairway Friends.`,
  };
}

export default async function PublicUDiscPlayerPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <PublicPlayerProfile endpoint={`/api/players/udisc/${encodeURIComponent(username)}`} />;
}
