// @polsia:user-owned — authenticated scorecard editor route with server metadata only.
import type { Metadata } from 'next';
import { ScorecardEditor } from '@/components/custom/scorecard-editor';

export const metadata: Metadata = {
  title: 'Edit Scorecard',
  description:
    'Propose corrections to a saved Fairway Friends scorecard and review its approval history.',
};

export default async function EditScorecardPage({
  params,
}: {
  params: Promise<{ scorecardId: string }>;
}) {
  const { scorecardId } = await params;
  return <ScorecardEditor scorecardId={scorecardId} />;
}
