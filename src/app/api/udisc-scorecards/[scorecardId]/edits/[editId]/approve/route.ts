// @polsia:user-owned — server-verified scorecard edit approvals and atomic application.
import 'server-only';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { importedScorecardFingerprint } from '@/lib/business/imported-scorecard';
import { replaceScorecardClubhouseLinks } from '@/lib/business/scorecard-clubhouses.server';
import {
  importedDraftFromEdit,
  replaceScorecardPlayers,
} from '@/lib/business/scorecard-governance.server';
import {
  ScorecardEditActionResponseSchema,
  ScorecardEditApprovalSchema,
  ScorecardEditSnapshotSchema,
} from '@/lib/contracts/scorecard-governance';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ scorecardId: string; editId: string }> },
): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const input = ScorecardEditApprovalSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: 'Choose an available approval role.' }, { status: 400 });
  const { scorecardId, editId } = await params;
  const edit = await prisma.scorecardEditRequest.findFirst({
    where: { id: editId, scorecardId },
    include: {
      scorecard: {
        select: {
          id: true,
          importedByUserId: true,
          revision: true,
          leagueId: true,
          finalizedAt: true,
          deletedAt: true,
          scorecardId: true,
          sourceUrl: true,
        },
      },
    },
  });
  if (!edit || edit.scorecard.deletedAt)
    return NextResponse.json({ error: 'Pending scorecard edit not found.' }, { status: 404 });
  if (edit.status !== 'PENDING')
    return NextResponse.json({ error: 'This edit request is no longer pending.' }, { status: 409 });

  const isAdmin = user.role === 'admin';
  if (input.data.role === 'submitter') {
    if (!isAdmin && edit.scorecard.importedByUserId !== user.id) {
      return NextResponse.json(
        { error: 'Only the original submitter or an app admin can approve this score edit.' },
        { status: 403 },
      );
    }
  } else {
    if (
      !edit.requiredLeagueId ||
      edit.scorecard.leagueId !== edit.requiredLeagueId ||
      !edit.scorecard.finalizedAt
    ) {
      return NextResponse.json(
        { error: 'This edit does not have a current finalized League result to approve.' },
        { status: 409 },
      );
    }
    const leader = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId: edit.requiredLeagueId, userId: user.id } },
      select: { role: true },
    });
    if (leader?.role !== 'LEADER')
      return NextResponse.json(
        { error: 'Only an authorized League Leader can approve this finalized result.' },
        { status: 403 },
      );
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const currentEdit = await transaction.scorecardEditRequest.findUnique({
        where: { id: edit.id },
        include: {
          scorecard: {
            include: {
              players: { orderBy: { sourceOrder: 'asc' } },
              clubhouseLinks: { select: { clubhouseId: true, createdAt: true } },
            },
          },
        },
      });
      if (!currentEdit || currentEdit.status !== 'PENDING') throw new Error('EDIT_NOT_PENDING');
      const card = currentEdit.scorecard;
      if (card.deletedAt) throw new Error('CARD_REMOVED');
      if (card.revision !== currentEdit.baseRevision) throw new Error('CARD_REVISION_CHANGED');
      if (
        currentEdit.requiredLeagueId &&
        (card.leagueId !== currentEdit.requiredLeagueId || !card.finalizedAt)
      ) {
        throw new Error('LEAGUE_ASSIGNMENT_CHANGED');
      }
      if (input.data.role === 'leagueLeader' && currentEdit.requiredLeagueId) {
        const leader = await transaction.leagueMembership.findUnique({
          where: { leagueId_userId: { leagueId: currentEdit.requiredLeagueId, userId: user.id } },
          select: { role: true },
        });
        if (leader?.role !== 'LEADER') throw new Error('LEADER_PERMISSION_CHANGED');
      }

      const snapshot = ScorecardEditSnapshotSchema.safeParse(currentEdit.proposedSnapshot);
      if (!snapshot.success) throw new Error('INVALID_SNAPSHOT');
      if (!currentEdit.assignmentOnly) {
        const draft = importedDraftFromEdit(card.scorecardId, card.sourceUrl, snapshot.data);
        const fingerprint = importedScorecardFingerprint(draft);
        const collision = await transaction.importedScorecard.findFirst({
          where: {
            id: { not: card.id },
            OR: [
              { scorecardId: draft.scorecardId },
              { sourceUrl: draft.sourceUrl },
              { fingerprint },
            ],
          },
          select: { id: true },
        });
        if (collision) throw new Error('DUPLICATE_SCORECARD');
      }

      const approvedAt = new Date();
      if (input.data.role === 'submitter') {
        await transaction.scorecardEditRequest.updateMany({
          where: { id: currentEdit.id, status: 'PENDING', submitterApprovedAt: null },
          data: { submitterApprovedByUserId: user.id, submitterApprovedAt: approvedAt },
        });
      } else {
        await transaction.scorecardEditRequest.updateMany({
          where: { id: currentEdit.id, status: 'PENDING', leagueApprovedAt: null },
          data: { leagueApprovedByUserId: user.id, leagueApprovedAt: approvedAt },
        });
      }
      const approvals = await transaction.scorecardEditRequest.findUnique({
        where: { id: currentEdit.id },
        select: {
          status: true,
          submitterApprovedByUserId: true,
          submitterApprovedAt: true,
          leagueApprovedByUserId: true,
          leagueApprovedAt: true,
        },
      });
      if (!approvals || approvals.status !== 'PENDING') throw new Error('EDIT_NOT_PENDING');
      const needsLeagueLeader = currentEdit.requiredLeagueId !== null;
      const hasSubmitterApproval = approvals.submitterApprovedByUserId !== null;
      const hasLeagueApproval = !needsLeagueLeader || approvals.leagueApprovedByUserId !== null;
      if (!hasSubmitterApproval || !hasLeagueApproval) {
        return { applied: false };
      }

      if (currentEdit.assignmentOnly) {
        if (currentEdit.proposedLeagueId !== card.leagueId) {
          throw new Error('LEAGUE_ASSIGNMENT_CHANGED');
        }
        if (currentEdit.proposedClubhouseId) {
          const destination = await transaction.clubhouse.findUnique({
            where: { id: currentEdit.proposedClubhouseId },
            select: { id: true },
          });
          if (!destination) throw new Error('ASSIGNMENT_DESTINATION_REMOVED');
        }
        const changed = await transaction.importedScorecard.updateMany({
          where: {
            id: card.id,
            revision: currentEdit.baseRevision,
            clubhouseId: card.clubhouseId,
            leagueId: card.leagueId,
            deletedAt: null,
          },
          data: {
            clubhouseId: currentEdit.proposedClubhouseId,
            revision: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new Error('CARD_REVISION_CHANGED');
        await replaceScorecardClubhouseLinks(transaction, card.id, currentEdit.proposedClubhouseId);
        await transaction.scorecardAssignmentAudit.create({
          data: {
            scorecardId: card.id,
            actorUserId: currentEdit.proposedByUserId,
            oldClubhouseId:
              [...card.clubhouseLinks].sort(
                (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
              )[0]?.clubhouseId ?? null,
            newClubhouseId: currentEdit.proposedClubhouseId,
            oldLeagueId: card.leagueId,
            newLeagueId: card.leagueId,
          },
        });
        await transaction.scorecardEditRequest.update({
          where: { id: currentEdit.id },
          data: {
            status: 'APPROVED',
            appliedAt: new Date(),
          },
        });
        return { applied: true };
      }

      const draft = importedDraftFromEdit(card.scorecardId, card.sourceUrl, snapshot.data);
      const fingerprint = importedScorecardFingerprint(draft);
      const changed = await transaction.importedScorecard.updateMany({
        where: { id: card.id, revision: currentEdit.baseRevision, deletedAt: null },
        data: {
          courseName: draft.courseName,
          courseUrl: draft.courseUrl,
          layoutName: draft.layoutName,
          playedOn: draft.playedOn ? new Date(`${draft.playedOn}T00:00:00.000Z`) : null,
          location: draft.location,
          holeCount: draft.holeCount,
          totalPar: draft.totalPar,
          pars: draft.pars ?? Prisma.DbNull,
          courseLayoutId: snapshot.data.courseLayoutId,
          fingerprint,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('CARD_REVISION_CHANGED');
      await replaceScorecardPlayers(transaction, card.id, draft.players);
      await transaction.scorecardEditRequest.update({
        where: { id: currentEdit.id },
        data: {
          status: 'APPROVED',
          appliedAt: new Date(),
        },
      });
      return { applied: true };
    });
    return NextResponse.json(
      ScorecardEditActionResponseSchema.parse({
        ok: true,
        applied: result.applied,
        message: result.applied
          ? 'Approved edit applied to the existing scorecard.'
          : 'Approval recorded. The scorecard remains unchanged until the other required approval arrives.',
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'DUPLICATE_SCORECARD') {
      await prisma.scorecardEditRequest.updateMany({
        where: { id: edit.id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          rejectedByUserId: user.id,
          rejectedAt: new Date(),
          rejectionReason:
            'Edit rejected because its SHA-256 fingerprint matches another saved scorecard.',
        },
      });
      return NextResponse.json(
        {
          error:
            'This edit duplicates another saved scorecard. Both existing scorecards were preserved.',
        },
        { status: 409 },
      );
    }
    if (reason === 'EDIT_NOT_PENDING')
      return NextResponse.json(
        { error: 'This edit request is no longer pending.' },
        { status: 409 },
      );
    if (reason === 'LEADER_PERMISSION_CHANGED')
      return NextResponse.json(
        { error: 'League Leader access changed before approval was recorded.' },
        { status: 403 },
      );
    if (reason === 'CARD_REMOVED')
      return NextResponse.json(
        { error: 'This scorecard has been removed from public statistics.' },
        { status: 410 },
      );
    if (reason === 'CARD_REVISION_CHANGED' || reason === 'LEAGUE_ASSIGNMENT_CHANGED') {
      await prisma.scorecardEditRequest.updateMany({
        where: { id: edit.id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          rejectedByUserId: user.id,
          rejectedAt: new Date(),
          rejectionReason: 'The scorecard changed after this proposal. Submit a new edit request.',
        },
      });
      return NextResponse.json(
        {
          error:
            'The scorecard or League assignment changed after this proposal. Submit a new edit request.',
        },
        { status: 409 },
      );
    }
    if (reason === 'INVALID_SNAPSHOT')
      return NextResponse.json(
        { error: 'This edit proposal is invalid and could not be applied.' },
        { status: 409 },
      );
    if (reason === 'ASSIGNMENT_DESTINATION_REMOVED')
      return NextResponse.json(
        { error: 'The proposed Clubhouse was removed before approval.' },
        { status: 409 },
      );
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      await prisma.scorecardEditRequest.updateMany({
        where: { id: edit.id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          rejectedByUserId: user.id,
          rejectedAt: new Date(),
          rejectionReason: 'Edit rejected because another scorecard now uses the same fingerprint.',
        },
      });
      return NextResponse.json(
        {
          error:
            'This edit duplicates another saved scorecard. The original records remain unchanged.',
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
