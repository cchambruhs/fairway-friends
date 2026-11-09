// @polsia:user-owned — saved-round read and score mutation with live permission checks.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { type SavedRoundRole, savedRoundPermissions } from '@/lib/business/saved-round';
import { savedRoundInclude, savedRoundItem } from '@/lib/business/saved-round.server';
import { SavedRoundResponseSchema, SavedRoundUpdateSchema } from '@/lib/contracts/saved-round';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

async function signedInUser(request: Request) {
  try {
    return await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
}

async function currentRole(
  transaction: Pick<Prisma.TransactionClient, 'leagueMembership'>,
  leagueId: string | null,
  userId: string,
): Promise<SavedRoundRole> {
  if (!leagueId) return null;
  const membership = await transaction.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roundId: string }> },
): Promise<Response> {
  const user = await signedInUser(request);
  if (user instanceof Response) return user;
  const { roundId } = await params;
  const row = await prisma.savedRound.findUnique({
    where: { id: roundId },
    include: savedRoundInclude,
  });
  if (!row) return NextResponse.json({ error: 'Saved round not found.' }, { status: 404 });
  const isParticipant = row.participants.some((participant) => participant.userId === user.id);
  const role = await currentRole(prisma, row.leagueId, user.id);
  if (row.leagueId ? !role : !isParticipant) {
    return NextResponse.json({ error: 'You cannot open this saved round.' }, { status: 403 });
  }
  return NextResponse.json(
    SavedRoundResponseSchema.parse({ item: savedRoundItem(row, user.id, role) }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roundId: string }> },
): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const user = await signedInUser(request);
  if (user instanceof Response) return user;
  const parsed = SavedRoundUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { roundId } = await params;

  const result = await prisma.$transaction(async (transaction) => {
    const row = await transaction.savedRound.findUnique({
      where: { id: roundId },
      include: savedRoundInclude,
    });
    if (!row) return { error: { status: 404, message: 'Saved round not found.' } } as const;
    const role = await currentRole(transaction, row.leagueId, user.id);
    const isParticipant = row.participants.some((participant) => participant.userId === user.id);
    const permissions = savedRoundPermissions({
      status: row.status === 'FINALIZED' ? 'FINALIZED' : 'IN_PROGRESS',
      isParticipant,
      role,
      hasLeague: row.leagueId !== null,
    });
    if (!permissions.canEdit) {
      return {
        error: {
          status: 403,
          message: 'Your current round permissions do not allow score changes.',
        },
      } as const;
    }
    const holePars = Array.isArray(row.holePars) ? row.holePars.map(Number) : [];
    const expectedUserIds = new Set(row.participants.map((participant) => participant.userId));
    const receivedUserIds = new Set(
      parsed.data.participants.map((participant) => participant.userId),
    );
    if (
      parsed.data.participants.length !== row.participants.length ||
      expectedUserIds.size !== receivedUserIds.size ||
      [...expectedUserIds].some((id) => !receivedUserIds.has(id)) ||
      parsed.data.participants.some(
        (participant) => participant.holeScores.length !== holePars.length,
      )
    ) {
      return {
        error: {
          status: 400,
          message: 'The saved participants and hole layout cannot be changed.',
        },
      } as const;
    }

    const advanced = await transaction.savedRound.updateMany({
      where: { id: row.id, revision: parsed.data.revision, status: row.status },
      data: { revision: { increment: 1 } },
    });
    if (advanced.count !== 1) {
      return {
        error: {
          status: 409,
          message: 'This round changed elsewhere. Reload the saved scorecard.',
        },
      } as const;
    }
    for (const participant of parsed.data.participants) {
      const stored = row.participants.find((candidate) => candidate.userId === participant.userId);
      if (!stored)
        return { error: { status: 409, message: 'The saved participant list changed.' } } as const;
      await transaction.savedRoundParticipant.update({
        where: { id: stored.id },
        data: { holeScores: participant.holeScores },
      });
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
      { error: result.error?.message ?? 'Could not update this scorecard.' },
      { status: result.error?.status ?? 500 },
    );
  }
  return NextResponse.json(
    SavedRoundResponseSchema.parse({ item: savedRoundItem(result.row, user.id, result.role) }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
