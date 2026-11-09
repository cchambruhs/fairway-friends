// @polsia:user-owned — Leader-controlled Player and Scorekeeper assignments.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { lockLeagueForCapacity } from '@/lib/business/league-management.server';
import {
  LeagueMemberRoleUpdateSchema,
  LeagueMutationResponseSchema,
} from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = LeagueMemberRoleUpdateSchema.safeParse(await request.json().catch(() => null));
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
      { error: 'Only the League Leader can assign League roles.' },
      { status: 403 },
    );
  }
  const result = await prisma.$transaction(async (transaction) => {
    await lockLeagueForCapacity(transaction, leagueId);
    const [currentLeader, target] = await Promise.all([
      transaction.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
        select: { role: true },
      }),
      transaction.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId, userId: parsed.data.userId } },
        select: { role: true },
      }),
    ]);
    if (currentLeader?.role !== 'LEADER') return 'forbidden' as const;
    if (!target) return 'missing' as const;
    if (target.role === 'LEADER') return 'leader' as const;
    await transaction.leagueMembership.update({
      where: { leagueId_userId: { leagueId, userId: parsed.data.userId } },
      data: { role: parsed.data.role },
    });
    return 'saved' as const;
  });
  if (result === 'forbidden')
    return NextResponse.json(
      { error: 'Only the League Leader can assign League roles.' },
      { status: 403 },
    );
  if (result === 'missing')
    return NextResponse.json({ error: 'League member not found.' }, { status: 404 });
  if (result === 'leader')
    return NextResponse.json(
      { error: 'The League Leader role cannot be reassigned here.' },
      { status: 409 },
    );
  return NextResponse.json(LeagueMutationResponseSchema.parse({ ok: true }));
}
