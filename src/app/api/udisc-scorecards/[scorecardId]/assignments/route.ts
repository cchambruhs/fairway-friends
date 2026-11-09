// @polsia:user-owned — atomically move one scorecard between verified Clubhouse and League records.
import 'server-only';
import { NextResponse } from 'next/server';
import { replaceScorecardClubhouseLinks } from '@/lib/business/scorecard-clubhouses.server';
import { scorecardEditDraftFromRow } from '@/lib/business/scorecard-governance.server';
import { ScorecardAssignmentUpdateSchema } from '@/lib/contracts/scorecard-governance';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ scorecardId: string }> },
): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const parsed = ScorecardAssignmentUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Choose valid assignment destinations.' }, { status: 400 });
  const { scorecardId } = await params;
  const scorecard = await prisma.importedScorecard.findFirst({
    where: { id: scorecardId, deletedAt: null },
    include: {
      players: { orderBy: { sourceOrder: 'asc' } },
      clubhouseLinks: { select: { clubhouseId: true, createdAt: true } },
    },
  });
  if (!scorecard) return NextResponse.json({ error: 'Scorecard not found.' }, { status: 404 });
  const scorecardClubhouseId =
    [...scorecard.clubhouseLinks].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    )[0]?.clubhouseId ?? null;
  const isAdmin = user.role === 'admin';
  if (!isAdmin && scorecard.importedByUserId !== user.id) {
    return NextResponse.json(
      { error: 'Only the original submitter or an app admin can reassign this scorecard.' },
      { status: 403 },
    );
  }
  if (
    scorecard.finalizedAt &&
    scorecard.leagueId !== null &&
    parsed.data.leagueId !== scorecard.leagueId
  ) {
    return NextResponse.json(
      {
        error:
          'A finalized result must stay in its League. Correct its score through the required League approval flow.',
      },
      { status: 409 },
    );
  }
  if (scorecard.finalizedAt && scorecard.leagueId === null && parsed.data.leagueId && !isAdmin) {
    return NextResponse.json(
      { error: 'Only an app admin can assign a finalized legacy result to its verified League.' },
      { status: 403 },
    );
  }

  if (parsed.data.clubhouseId) {
    const destination = await prisma.clubhouse.findUnique({
      where: { id: parsed.data.clubhouseId },
      select: { id: true },
    });
    if (!destination)
      return NextResponse.json({ error: 'Choose an existing Clubhouse.' }, { status: 404 });
    if (!isAdmin) {
      const membership = await prisma.clubhouseMembership.findUnique({
        where: { clubhouseId_userId: { clubhouseId: destination.id, userId: user.id } },
        select: { id: true },
      });
      if (!membership)
        return NextResponse.json(
          { error: 'Join the destination Clubhouse before assigning this card.' },
          { status: 403 },
        );
    }
  }

  if (parsed.data.leagueId) {
    const destination = await prisma.league.findUnique({
      where: { id: parsed.data.leagueId },
      select: { id: true },
    });
    if (!destination)
      return NextResponse.json({ error: 'Choose an existing League.' }, { status: 404 });
    if (!isAdmin) {
      const membership = await prisma.leagueMembership.findFirst({
        where: {
          leagueId: destination.id,
          userId: user.id,
          role: { in: ['LEADER', 'SCOREKEEPER'] },
        },
        select: { id: true },
      });
      if (!membership)
        return NextResponse.json(
          { error: 'A League Leader or Scorekeeper membership is required for this assignment.' },
          { status: 403 },
        );
    }
  }

  if (
    scorecardClubhouseId === parsed.data.clubhouseId &&
    scorecard.clubhouseLinks.length <= 1 &&
    scorecard.leagueId === parsed.data.leagueId
  ) {
    return NextResponse.json({
      ok: true,
      clubhouseId: scorecardClubhouseId,
      leagueId: scorecard.leagueId,
      unchanged: true,
    });
  }
  if (scorecard.finalizedAt && scorecard.leagueId !== null) {
    const pending = await prisma.scorecardEditRequest.findFirst({
      where: { scorecardId: scorecard.id, status: 'PENDING' },
      select: { id: true },
    });
    if (pending)
      return NextResponse.json(
        { error: 'A scorecard change is already awaiting approval.' },
        { status: 409 },
      );
    const beforeSnapshot = scorecardEditDraftFromRow(scorecard);
    await prisma.scorecardEditRequest.create({
      data: {
        scorecardId: scorecard.id,
        proposedByUserId: user.id,
        baseRevision: scorecard.revision,
        requiredLeagueId: scorecard.leagueId,
        assignmentOnly: true,
        proposedClubhouseId: parsed.data.clubhouseId,
        proposedLeagueId: parsed.data.leagueId,
        beforeSnapshot,
        proposedSnapshot: beforeSnapshot,
      },
    });
    return NextResponse.json({
      ok: true,
      clubhouseId: scorecardClubhouseId,
      leagueId: scorecard.leagueId,
      pending: true,
      message: 'Assignment change is pending submitter/admin and League Leader approval.',
    });
  }
  const updated = await prisma.$transaction(async (transaction) => {
    const current = await transaction.importedScorecard.findUnique({
      where: { id: scorecard.id },
      select: {
        id: true,
        importedByUserId: true,
        clubhouseId: true,
        clubhouseLinks: { select: { clubhouseId: true, createdAt: true } },
        leagueId: true,
        finalizedAt: true,
        deletedAt: true,
      },
    });
    if (!current || current.deletedAt) return { status: 'missing' as const };
    if (!isAdmin && current.importedByUserId !== user.id) return { status: 'forbidden' as const };
    if (
      (current.clubhouseLinks.sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )[0]?.clubhouseId ?? null) === parsed.data.clubhouseId &&
      current.clubhouseLinks.length <= 1 &&
      current.leagueId === parsed.data.leagueId
    ) {
      return { status: 'unchanged' as const };
    }
    if (
      current.finalizedAt &&
      current.leagueId !== null &&
      parsed.data.leagueId !== current.leagueId
    ) {
      return { status: 'league_locked' as const };
    }
    if (
      current.finalizedAt &&
      current.leagueId === null &&
      parsed.data.leagueId !== null &&
      !isAdmin
    ) {
      return { status: 'forbidden' as const };
    }

    if (parsed.data.clubhouseId) {
      const destination = await transaction.clubhouse.findUnique({
        where: { id: parsed.data.clubhouseId },
        select: { id: true },
      });
      if (!destination) return { status: 'clubhouse_missing' as const };
      if (!isAdmin) {
        const membership = await transaction.clubhouseMembership.findUnique({
          where: { clubhouseId_userId: { clubhouseId: destination.id, userId: user.id } },
          select: { id: true },
        });
        if (!membership) return { status: 'forbidden' as const };
      }
    }

    if (parsed.data.leagueId) {
      const destination = await transaction.league.findUnique({
        where: { id: parsed.data.leagueId },
        select: { id: true },
      });
      if (!destination) return { status: 'league_missing' as const };
      if (!isAdmin) {
        const membership = await transaction.leagueMembership.findFirst({
          where: {
            leagueId: destination.id,
            userId: user.id,
            role: { in: ['LEADER', 'SCOREKEEPER'] },
          },
          select: { id: true },
        });
        if (!membership) return { status: 'forbidden' as const };
      }
    }

    if (current.finalizedAt && current.leagueId && !isAdmin) {
      const leader = await transaction.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId: current.leagueId, userId: user.id } },
        select: { role: true },
      });
      if (leader?.role !== 'LEADER') return { status: 'forbidden' as const };
    }

    const changed = await transaction.importedScorecard.updateMany({
      where: {
        id: scorecard.id,
        clubhouseId: current.clubhouseId,
        leagueId: current.leagueId,
        finalizedAt: current.finalizedAt,
        deletedAt: null,
      },
      data: { clubhouseId: parsed.data.clubhouseId, leagueId: parsed.data.leagueId },
    });
    if (changed.count !== 1) return { status: 'changed' as const };
    await replaceScorecardClubhouseLinks(transaction, scorecard.id, parsed.data.clubhouseId);
    await transaction.scorecardAssignmentAudit.create({
      data: {
        scorecardId: scorecard.id,
        actorUserId: user.id,
        oldClubhouseId:
          current.clubhouseLinks.sort(
            (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
          )[0]?.clubhouseId ?? null,
        newClubhouseId: parsed.data.clubhouseId,
        oldLeagueId: current.leagueId,
        newLeagueId: parsed.data.leagueId,
      },
    });
    return { status: 'updated' as const };
  });
  if (updated.status === 'missing')
    return NextResponse.json({ error: 'Scorecard not found.' }, { status: 404 });
  if (updated.status === 'forbidden')
    return NextResponse.json(
      { error: 'Assignment authorization changed. Refresh and try again.' },
      { status: 403 },
    );
  if (updated.status === 'clubhouse_missing' || updated.status === 'league_missing') {
    return NextResponse.json(
      { error: 'The destination was removed before the assignment completed.' },
      { status: 404 },
    );
  }
  if (updated.status === 'changed')
    return NextResponse.json(
      { error: 'This scorecard changed during reassignment. Refresh and try again.' },
      { status: 409 },
    );
  if (updated.status === 'league_locked')
    return NextResponse.json(
      {
        error:
          'A finalized result must stay in its League. Correct its score through the required League approval flow.',
      },
      { status: 409 },
    );
  return NextResponse.json({
    ok: true,
    clubhouseId: parsed.data.clubhouseId,
    leagueId: parsed.data.leagueId,
  });
}
