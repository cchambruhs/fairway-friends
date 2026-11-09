// @polsia:user-owned — unlinked scorecard player entry route.
import type { Metadata } from 'next';
import { UnlinkedScorecardPlayer } from '@/components/custom/unlinked-scorecard-player';

export const metadata: Metadata = {
  title: 'Unlinked scorecard entry',
  description: 'A saved scorecard player entry without a UDisc username for exact matching.',
};

export default async function UnlinkedPlayerEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  return <UnlinkedScorecardPlayer entryId={entryId} />;
}
