// @polsia:user-owned — reassign one global scorecard without changing its source or player rows.
import 'server-only';
import { NextResponse } from 'next/server';
import { replaceScorecardClubhouseLinks } from '@/lib/business/scorecard-clubhouses.server';
import { ScorecardReassignmentSchema } from '@/lib/contracts/clubhouses';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

type AuthenticatedUser = Awaited<ReturnType<typeof requireAuth>>;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ scorecardId: string }> },
): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let user: AuthenticatedUser;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const parsed = ScorecardReassignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Choose a valid Clubhouse.' }, { status: 400 });
  const { scorecardId } = await params;
  const scorecard = await prisma.importedScorecard.findFirst({
    where: { id: scorecardId, deletedAt: null },
    include: { clubhouseLinks: { select: { clubhouseId: true, createdAt: true } } },
  });
  if (!scorecard) return NextResponse.json({ error: 'Scorecard not found.' }, { status: 404 });
  const currentClubhouseId =
    [...scorecard.clubhouseLinks].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    )[0]?.clubhouseId ?? null;
  const isAdmin = user.role === 'admin';
  if (!isAdmin && scorecard.importedByUserId !== user.id) {
    return NextResponse.json(
      { error: 'Only the scorecard submitter or an app admin can reassign it.' },
      { status: 403 },
    );
  }
  if (scorecard.finalizedAt && !isAdmin) {
    return NextResponse.json(
      { error: 'Finalized league results require app-admin reassignment.' },
      { status: 403 },
    );
  }
  if (parsed.data.clubhouseId) {
    const destination = await prisma.clubhouse.findUnique({
      where: { id: parsed.data.clubhouseId },
      select: { id: true },
    });
    if (!destination)
      return NextResponse.json({ error: 'Destination Clubhouse not found.' }, { status: 404 });
    if (!isAdmin) {
      const membership = await prisma.clubhouseMembership.findUnique({
        where: {
          clubhouseId_userId: {
            clubhouseId: destination.id,
            userId: user.id,
          },
        },
        select: { id: true },
      });
      if (!membership)
        return NextResponse.json(
          { error: 'Join the destination Clubhouse before assigning this card.' },
          { status: 403 },
        );
    }
  }
  if (currentClubhouseId === parsed.data.clubhouseId && scorecard.clubhouseLinks.length <= 1) {
    return NextResponse.json({ ok: true, clubhouseId: currentClubhouseId, unchanged: true });
  }

  const changed = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.importedScorecard.updateMany({
      where: { id: scorecard.id, clubhouseId: scorecard.clubhouseId, deletedAt: null },
      data: { clubhouseId: parsed.data.clubhouseId },
    });
    if (updated.count !== 1) return false;
    await replaceScorecardClubhouseLinks(transaction, scorecard.id, parsed.data.clubhouseId);
    await transaction.scorecardAssignmentAudit.create({
      data: {
        scorecardId: scorecard.id,
        actorUserId: user.id,
        oldClubhouseId: currentClubhouseId,
        newClubhouseId: parsed.data.clubhouseId,
      },
    });
    return true;
  });
  if (!changed)
    return NextResponse.json(
      { error: 'This scorecard changed during reassignment. Refresh and try again.' },
      { status: 409 },
    );
  return NextResponse.json({ ok: true, clubhouseId: parsed.data.clubhouseId });
}
