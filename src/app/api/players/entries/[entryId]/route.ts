// @polsia:user-owned — public scorecard entry with no verified UDisc username.
import 'server-only';
import { NextResponse } from 'next/server';
import { UnlinkedScorecardEntrySchema } from '@/lib/contracts/player-identity';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> },
): Promise<Response> {
  const { entryId } = await params;
  const row = await prisma.importedScorecardPlayer.findUnique({
    where: { id: entryId },
    include: { scorecard: true },
  });
  if (!row || row.username)
    return NextResponse.json({ error: 'Unlinked scorecard entry not found.' }, { status: 404 });
  return NextResponse.json(
    UnlinkedScorecardEntrySchema.parse({
      displayName: row.displayName ?? 'Unidentified player',
      courseName: row.scorecard.courseName,
      playedOn: row.scorecard.playedOn?.toISOString().slice(0, 10) ?? null,
      totalScore: row.totalScore,
      sourceUrl: row.scorecard.sourceUrl,
    }),
  );
}
