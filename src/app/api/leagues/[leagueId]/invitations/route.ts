// @polsia:user-owned — League Leader invitation issue and rotation.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { lockLeagueForCapacity } from '@/lib/business/league-management.server';
import {
  LeagueInvitationCreateSchema,
  LeagueInvitationResponseSchema,
} from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = LeagueInvitationCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { leagueId } = await params;
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
  const token = randomBytes(32).toString('hex');
  const invitation = await prisma.$transaction(async (transaction) => {
    await lockLeagueForCapacity(transaction, leagueId);
    const [league, currentLeader] = await Promise.all([
      transaction.league.findUnique({ where: { id: leagueId }, select: { id: true } }),
      transaction.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
        select: { role: true },
      }),
    ]);
    if (!league || currentLeader?.role !== 'LEADER') return null;
    if (parsed.data.action === 'rotate') {
      await transaction.leagueInvitation.updateMany({
        where: { leagueId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return transaction.leagueInvitation.create({
      data: {
        leagueId,
        token,
        role: parsed.data.role,
        createdByUserId: authorization.user.id,
      },
      select: { id: true, token: true, role: true },
    });
  });
  if (!invitation) return NextResponse.json({ error: 'League not found.' }, { status: 404 });
  return NextResponse.json(LeagueInvitationResponseSchema.parse(invitation), { status: 201 });
}
