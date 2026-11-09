// @polsia:user-owned — Leader-only revocation for an individual invite link.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { lockLeagueForCapacity } from '@/lib/business/league-management.server';
import { LeagueMutationResponseSchema } from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ leagueId: string; invitationId: string }> },
) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { leagueId, invitationId } = await params;
  const leader = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
    select: { role: true },
  });
  if (leader?.role !== 'LEADER') {
    return NextResponse.json(
      { error: 'Only the League Leader can manage invitations.' },
      { status: 403 },
    );
  }
  const changed = await prisma.$transaction(async (transaction) => {
    await lockLeagueForCapacity(transaction, leagueId);
    const currentLeader = await transaction.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
      select: { role: true },
    });
    if (currentLeader?.role !== 'LEADER') return 'forbidden' as const;
    return transaction.leagueInvitation.updateMany({
      where: { id: invitationId, leagueId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
  if (changed === 'forbidden')
    return NextResponse.json(
      { error: 'Only the League Leader can manage invitations.' },
      { status: 403 },
    );
  if (changed.count !== 1)
    return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  return NextResponse.json(LeagueMutationResponseSchema.parse({ ok: true }));
}
