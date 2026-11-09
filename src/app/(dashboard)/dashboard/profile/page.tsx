// @polsia:user-owned — signed-in player's editable profile surface.
import type { Metadata } from 'next';
import Link from 'next/link';
import { PlayerProfileEditor } from '@/components/custom/player-profile-editor';
import { PlayerRoundHistory } from '@/components/custom/player-round-history';
import { SavedRoundHistory } from '@/components/custom/saved-round-history';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Player profile',
  description: 'Manage your private Fairway Friends player profile and favorite discs.',
};

export default function PlayerProfilePage() {
  return (
    <>
      <section className="ff-profile-import-history-link">
        <div>
          <p className="ff-player-profile-kicker">PAST DATA</p>
          <h2>Import history</h2>
          <p>Review and add UDisc CSV exports or structured scorecard records.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/profile/import-history">Open import history</Link>
        </Button>
      </section>
      <PlayerProfileEditor />
      <PlayerRoundHistory />
      <SavedRoundHistory />
    </>
  );
}
