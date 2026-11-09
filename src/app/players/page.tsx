// @polsia:user-owned — public registered-player directory.
import type { Metadata } from 'next';
import { PublicPlayerDirectory } from '@/components/custom/public-player-directory';

export const metadata: Metadata = {
  title: 'Player profiles',
  description: 'Browse Fairway Friends player profiles and saved UDisc round statistics.',
};

export default function PlayersPage() {
  return <PublicPlayerDirectory />;
}
