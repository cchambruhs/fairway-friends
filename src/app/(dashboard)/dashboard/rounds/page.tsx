// @polsia:user-owned — signed-in player scorecard history and import status.

import { ArrowRight, MapPinned } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ImportedScorecardHistory } from '@/components/custom/imported-scorecard-history';
import { SavedRoundHistory } from '@/components/custom/saved-round-history';
import { SavedRoundStart } from '@/components/custom/saved-round-start';
import { ScorecardImportWorkspace } from '@/components/custom/scorecard-import-workspace';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Rounds & scorecards',
  description:
    'Start and resume Fairway Friends rounds, finalize scorecards, or import and revisit past rounds.',
};

export default async function RoundsPage({
  searchParams,
}: {
  searchParams: Promise<{ sourceUrl?: string | string[] }>;
}) {
  const params = await searchParams;
  const sourceUrl = Array.isArray(params.sourceUrl)
    ? (params.sourceUrl[0] ?? '')
    : (params.sourceUrl ?? '');
  return (
    <div className="ff-rounds-page">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">ROUND HISTORY</p>
        <h1>Rounds &amp; scorecards</h1>
        <p>
          Start a live round with existing players, save it as you play, and reopen the same
          scorecard later. Past UDisc, JSON, CSV, and manual entries remain in their own history.
        </p>
      </header>
      <section className="ff-course-round-bridge" aria-labelledby="round-course-heading">
        <div className="ff-course-round-icon">
          <MapPinned aria-hidden="true" />
        </div>
        <div>
          <p className="ff-course-eyebrow">COURSE DIRECTORY</p>
          <h2 id="round-course-heading">Find a course and layout</h2>
          <p>
            Saved layouts use their recorded pars in a new scorecard. You can also enter pars for a
            custom layout below.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/courses">
            Browse courses <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
      <SavedRoundStart />
      <SavedRoundHistory />
      <ImportedScorecardHistory />
      <ScorecardImportWorkspace sourceUrl={sourceUrl} />
    </div>
  );
}
