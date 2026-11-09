// @polsia:user-owned — live scorecard workspace page.
import type { Metadata } from 'next';
import { SavedRoundEditor } from '@/components/custom/saved-round-editor';

export const metadata: Metadata = {
  title: 'Saved scorecard',
  description: 'Enter, resume, and review a Fairway Friends round scorecard.',
};

export default async function SavedRoundPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  return <SavedRoundEditor roundId={roundId} />;
}
