// @polsia:user-owned — scorecard edit rejections are restricted to the same authorized approvers.
import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
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
  const body = z
    .object({ reason: z.string().trim().max(300).optional() })
    .strict()
    .safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return NextResponse.json({ error: 'Enter a shorter rejection note.' }, { status: 400 });
  const { scorecardId, editId } = await params;
  const edit = await prisma.scorecardEditRequest.findFirst({
    where: { id: editId, scorecardId, status: 'PENDING' },
    include: {
      scorecard: { select: { importedByUserId: true, leagueId: true, finalizedAt: true } },
    },
  });
  if (!edit)
    return NextResponse.json({ error: 'Pending scorecard edit not found.' }, { status: 404 });
  const isSubmitterApprover = user.role === 'admin' || edit.scorecard.importedByUserId === user.id;
  const isLeagueLeader =
    edit.requiredLeagueId &&
    edit.scorecard.finalizedAt &&
    edit.scorecard.leagueId === edit.requiredLeagueId
      ? (
          await prisma.leagueMembership.findUnique({
            where: { leagueId_userId: { leagueId: edit.requiredLeagueId, userId: user.id } },
            select: { role: true },
          })
        )?.role === 'LEADER'
      : false;
  if (!isSubmitterApprover && !isLeagueLeader) {
    return NextResponse.json(
      {
        error:
          'Only the original submitter, an app admin, or the assigned League Leader can reject this edit.',
      },
      { status: 403 },
    );
  }
  const changed = await prisma.scorecardEditRequest.updateMany({
    where: { id: edit.id, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      rejectedByUserId: user.id,
      rejectedAt: new Date(),
      rejectionReason:
        body.data.reason?.trim() || 'The authorized reviewer rejected this scorecard edit.',
    },
  });
  if (changed.count !== 1)
    return NextResponse.json({ error: 'This edit request is no longer pending.' }, { status: 409 });
  return NextResponse.json({
    ok: true,
    message: 'Edit rejected. The saved scorecard remains unchanged.',
  });
}
