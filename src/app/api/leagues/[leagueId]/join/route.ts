// @polsia:user-owned — capacity-safe joining of public Leagues.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import {
  addMemberWithinCapacity,
  lockLeagueForCapacity,
} from '@/lib/business/league-management.server';
import { LeagueJoinResponseSchema } from '@/lib/contracts/leagues';
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
  const { leagueId } = await params;
  const result = await prisma.$transaction(async (transaction) => {
    await lockLeagueForCapacity(transaction, leagueId);
    const league = await transaction.league.findUnique({
      where: { id: leagueId },
      select: { id: true, visibility: true },
    });
    if (!league) return { result: 'missing' as const };
    if (league.visibility !== 'PUBLIC') return { result: 'private' as const };
    return addMemberWithinCapacity(transaction, {
      leagueId,
      userId: authorization.user.id,
      role: 'PLAYER',
    });
  });
  if (result.result === 'missing' || result.result === 'private') {
    return NextResponse.json({ error: 'League not found.' }, { status: 404 });
  }
  if (result.result === 'full') {
    return NextResponse.json(
      { error: 'This League has reached its participant capacity.' },
      { status: 409 },
    );
  }
  return NextResponse.json(
    LeagueJoinResponseSchema.parse({
      joined: result.result === 'joined',
      leagueId,
      leagueName: result.leagueName,
    }),
  );
}
