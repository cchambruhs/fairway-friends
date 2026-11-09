// @polsia:user-owned — scorecard corrections stay pending until every required approver acts.
import 'server-only';
import { NextResponse } from 'next/server';
import { importedScorecardItem } from '@/lib/business/imported-scorecard';
import {
  recomputeScorecardEditMetrics,
  scorecardEditDraftFromRow,
} from '@/lib/business/scorecard-governance.server';
import { ImportedScorecardDraftSchema } from '@/lib/contracts/imported-scorecard';
import {
  ScorecardEditBundleSchema,
  ScorecardEditDraftSchema,
  ScorecardEditRequestResponseSchema,
  ScorecardEditSnapshotSchema,
} from '@/lib/contracts/scorecard-governance';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scorecardId: string }> },
): Promise<Response> {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const { scorecardId } = await params;
  const card = await prisma.importedScorecard.findFirst({
    where: { id: scorecardId, deletedAt: null },
    include: {
      players: { orderBy: { sourceOrder: 'asc' } },
      clubhouseLinks: { include: { clubhouse: true } },
      league: true,
      editRequests: { where: { status: 'APPROVED' }, select: { id: true } },
    },
  });
  if (!card) return NextResponse.json({ error: 'Scorecard not found.' }, { status: 404 });
  const leagueMembership = card.leagueId
    ? await prisma.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId: card.leagueId, userId: user.id } },
        select: { role: true },
      })
    : null;
  if (card.leagueId && !leagueMembership)
    return NextResponse.json({ error: 'You are not a current League member.' }, { status: 403 });
  const edits = await prisma.scorecardEditRequest.findMany({
    where: { scorecardId: card.id },
    orderBy: { createdAt: 'desc' },
  });
  const actorIds = [
    ...new Set(
      edits.flatMap((edit) =>
        [
          edit.proposedByUserId,
          edit.submitterApprovedByUserId,
          edit.leagueApprovedByUserId,
          edit.rejectedByUserId,
        ].filter((id): id is string => id !== null),
      ),
    ),
  ];
  const proposedClubhouseIds = [
    ...new Set(
      edits.flatMap((edit) => (edit.proposedClubhouseId ? [edit.proposedClubhouseId] : [])),
    ),
  ];
  const proposedLeagueIds = [
    ...new Set(edits.flatMap((edit) => (edit.proposedLeagueId ? [edit.proposedLeagueId] : []))),
  ];
  const [users, profiles, proposedClubhouses, proposedLeagues] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }),
    prisma.playerProfile.findMany({
      where: { userId: { in: actorIds } },
      select: { userId: true, displayName: true },
    }),
    prisma.clubhouse.findMany({
      where: { id: { in: proposedClubhouseIds } },
      select: { id: true, name: true },
    }),
    prisma.league.findMany({
      where: { id: { in: proposedLeagueIds } },
      select: { id: true, name: true },
    }),
  ]);
  const userNames = new Map(users.map((actor) => [actor.id, actor.name]));
  const profileNames = new Map(profiles.map((profile) => [profile.userId, profile.displayName]));
  const proposedClubhouseNames = new Map(
    proposedClubhouses.map((clubhouse) => [clubhouse.id, clubhouse.name]),
  );
  const proposedLeagueNames = new Map(proposedLeagues.map((league) => [league.id, league.name]));
  const actorName = (id: string | null) =>
    id ? (profileNames.get(id) ?? userNames.get(id) ?? 'Fairway Friends player') : null;
  const editHistory = edits.flatMap((edit) => {
    const before = ScorecardEditSnapshotSchema.safeParse(edit.beforeSnapshot);
    const proposed = ScorecardEditSnapshotSchema.safeParse(edit.proposedSnapshot);
    if (!before.success || !proposed.success) return [];
    return [
      {
        id: edit.id,
        status: edit.status,
        baseRevision: edit.baseRevision,
        proposedByName: actorName(edit.proposedByUserId) ?? 'Fairway Friends player',
        proposedAt: edit.createdAt.toISOString(),
        appliedAt: edit.appliedAt?.toISOString() ?? null,
        submitterApprovedByName: actorName(edit.submitterApprovedByUserId),
        submitterApprovedAt: edit.submitterApprovedAt?.toISOString() ?? null,
        leagueApprovedByName: actorName(edit.leagueApprovedByUserId),
        leagueApprovedAt: edit.leagueApprovedAt?.toISOString() ?? null,
        rejectedByName: actorName(edit.rejectedByUserId),
        rejectedAt: edit.rejectedAt?.toISOString() ?? null,
        rejectionReason: edit.rejectionReason,
        assignmentOnly: edit.assignmentOnly,
        proposedClubhouseName: edit.proposedClubhouseId
          ? (proposedClubhouseNames.get(edit.proposedClubhouseId) ?? 'Clubhouse removed')
          : null,
        proposedLeagueName: edit.proposedLeagueId
          ? (proposedLeagueNames.get(edit.proposedLeagueId) ?? 'League removed')
          : null,
        beforeSnapshot: before.data,
        proposedSnapshot: proposed.data,
      },
    ];
  });
  const isAdmin = user.role === 'admin';
  const canActForSubmitter = isAdmin || card.importedByUserId === user.id;
  return NextResponse.json(
    ScorecardEditBundleSchema.parse({
      item: importedScorecardItem(card, isAdmin || card.importedByUserId === user.id, isAdmin),
      canEdit: canActForSubmitter,
      canApproveSubmitter: canActForSubmitter,
      canApproveLeague: Boolean(card.finalizedAt && leagueMembership?.role === 'LEADER'),
      editHistory,
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(
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
  const input = ScorecardEditDraftSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ errors: input.error.flatten().fieldErrors }, { status: 400 });
  }
  const { scorecardId } = await params;
  const card = await prisma.importedScorecard.findFirst({
    where: { id: scorecardId, deletedAt: null },
    include: { players: { orderBy: { sourceOrder: 'asc' } } },
  });
  if (!card) return NextResponse.json({ error: 'Scorecard not found.' }, { status: 404 });
  if (card.leagueId) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId: card.leagueId, userId: user.id } },
      select: { id: true },
    });
    if (!membership)
      return NextResponse.json({ error: 'You are not a current League member.' }, { status: 403 });
  }
  if (user.role !== 'admin' && card.importedByUserId !== user.id) {
    return NextResponse.json(
      { error: 'Only the original submitter or an app admin can propose this scorecard edit.' },
      { status: 403 },
    );
  }
  if (card.finalizedAt && !card.leagueId) {
    return NextResponse.json(
      {
        error:
          'This finalized result must be assigned to a real League before its required League Leader can approve a score edit.',
      },
      { status: 409 },
    );
  }

  const proposal = recomputeScorecardEditMetrics(input.data);
  const { courseLayoutId, ...draftData } = proposal;
  const validatedProposal = ImportedScorecardDraftSchema.safeParse({
    scorecardId: card.scorecardId,
    sourceUrl: card.sourceUrl,
    ...draftData,
  });
  if (!validatedProposal.success) {
    return NextResponse.json(
      { errors: validatedProposal.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const currentSnapshot = ScorecardEditDraftSchema.safeParse(scorecardEditDraftFromRow(card));
  if (!currentSnapshot.success)
    return NextResponse.json(
      { error: 'This saved scorecard cannot be safely edited until its source data is repaired.' },
      { status: 409 },
    );
  if (JSON.stringify(currentSnapshot.data) === JSON.stringify(proposal)) {
    return NextResponse.json(
      { error: 'Make a change before submitting an edit request.' },
      { status: 400 },
    );
  }
  const pending = await prisma.scorecardEditRequest.findFirst({
    where: { scorecardId, status: 'PENDING' },
    select: { id: true },
  });
  if (pending)
    return NextResponse.json(
      { error: 'A scorecard edit is already awaiting approval.' },
      { status: 409 },
    );

  if (courseLayoutId) {
    const layout = await prisma.courseLayout.findUnique({
      where: { id: courseLayoutId },
      include: {
        course: { select: { archivedAt: true } },
        holes: { orderBy: { number: 'asc' }, select: { par: true } },
      },
    });
    if (!layout || layout.course.archivedAt)
      return NextResponse.json({ error: 'Choose a saved course layout.' }, { status: 400 });
    if (
      !proposal.pars ||
      layout.holes.length !== proposal.pars.length ||
      proposal.holeCount !== layout.holes.length ||
      layout.holes.some((hole, index) => hole.par !== proposal.pars?.[index])
    ) {
      return NextResponse.json(
        { error: 'The selected course layout must have the same saved pars as this scorecard.' },
        { status: 400 },
      );
    }
  }

  const created = await prisma.scorecardEditRequest.create({
    data: {
      scorecardId,
      proposedByUserId: user.id,
      baseRevision: card.revision,
      requiredLeagueId: card.finalizedAt ? card.leagueId : null,
      beforeSnapshot: currentSnapshot.data,
      proposedSnapshot: proposal,
    },
    select: { id: true, status: true },
  });
  return NextResponse.json(
    ScorecardEditRequestResponseSchema.parse({
      ...created,
      message: card.finalizedAt
        ? 'Waiting for submitter/admin and League Leader approval.'
        : 'Waiting for submitter/admin approval.',
    }),
    { status: 201 },
  );
}
