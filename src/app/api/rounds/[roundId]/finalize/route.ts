// @polsia:user-owned — participant or League Leader finalization with current-role checks.
import 'server-only';
import { NextResponse } from 'next/server';
import {
  type SavedRoundRole,
  savedRoundPermissions,
  scoresAreComplete,
} from '@/lib/business/saved-round';
import { savedRoundInclude, savedRoundItem } from '@/lib/business/saved-round.server';
import { SavedRoundFinalizeSchema, SavedRoundResponseSchema } from '@/lib/contracts/saved-round';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roundId: string }> },
): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const parsed = SavedRoundFinalizeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { roundId } = await params;

  const result = await prisma.$transaction(async (transaction) => {
    const row = await transaction.savedRound.findUnique({
      where: { id: roundId },
      include: savedRoundInclude,
    });
    if (!row) return { error: { status: 404, message: 'Saved round not found.' } } as const;
    const membership = row.leagueId
      ? await transaction.leagueMembership.findUnique({
          where: { leagueId_userId: { leagueId: row.leagueId, userId: user.id } },
          select: { role: true },
        })
      : null;
    const role: SavedRoundRole = membership?.role ?? null;
    const isParticipant = row.participants.some((participant) => participant.userId === user.id);
    const permissions = savedRoundPermissions({
      status: row.status === 'FINALIZED' ? 'FINALIZED' : 'IN_PROGRESS',
      isParticipant,
      role,
      hasLeague: row.leagueId !== null,
    });
    if (!permissions.canFinalize) {
      return {
        error: {
          status: 403,
          message: 'Your current round permissions do not allow finalization.',
        },
      } as const;
    }
    if (row.status !== 'IN_PROGRESS') {
      return { error: { status: 409, message: 'This scorecard is already finalized.' } } as const;
    }
    const holePars = Array.isArray(row.holePars) ? row.holePars.map(Number) : [];
    const scoreRows = row.participants.map((participant) => ({
      userId: participant.userId,
      holeScores: Array.isArray(participant.holeScores)
        ? participant.holeScores.map((score) => (score === null ? null : Number(score)))
        : [],
    }));
    if (!scoresAreComplete(scoreRows, holePars.length)) {
      return {
        error: {
          status: 400,
          message: 'Enter a score for every participant on every hole before finalizing.',
        },
      } as const;
    }
    const advanced = await transaction.savedRound.updateMany({
      where: { id: row.id, revision: parsed.data.revision, status: 'IN_PROGRESS' },
      data: {
        status: 'FINALIZED',
        verificationStatus: row.leagueId ? 'LEAGUE_VERIFIED' : 'CASUAL_UNVERIFIED',
        finalizedAt: new Date(),
        verifiedAt: row.leagueId ? new Date() : null,
        verifiedByUserId: row.leagueId ? user.id : null,
        revision: { increment: 1 },
      },
    });
    if (advanced.count !== 1) {
      return {
        error: {
          status: 409,
          message: 'This round changed elsewhere. Reload the saved scorecard.',
        },
      } as const;
    }
    const updated = await transaction.savedRound.findUnique({
      where: { id: row.id },
      include: savedRoundInclude,
    });
    if (!updated) return { error: { status: 404, message: 'Saved round not found.' } } as const;
    return { row: updated, role } as const;
  });

  if (!result.row) {
    return NextResponse.json(
      { error: result.error?.message ?? 'Could not finalize this scorecard.' },
      { status: result.error?.status ?? 500 },
    );
  }
  return NextResponse.json(
    SavedRoundResponseSchema.parse({ item: savedRoundItem(result.row, user.id, result.role) }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
