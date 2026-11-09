// @polsia:user-owned — protected admin assignment route for preserved legacy cards.
import type { Metadata } from 'next';
import { LegacyScorecardAssignments } from '@/components/custom/admin/legacy-scorecard-assignments';

export const metadata: Metadata = {
  title: 'Legacy scorecards',
  description: 'Review and assign preserved legacy scorecards to verified Clubhouses.',
};

export default function AdminLegacyScorecardsPage() {
  return <LegacyScorecardAssignments />;
}
