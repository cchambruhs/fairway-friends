// @polsia:user-owned — protected admin claim review route.
import type { Metadata } from 'next';
import { PlayerClaimReview } from '@/components/custom/admin/player-claim-review';

export const metadata: Metadata = {
  title: 'Player claims',
  description: 'Review pending UDisc player identity claims.',
};

export default function PlayerClaimsPage() {
  return <PlayerClaimReview />;
}
