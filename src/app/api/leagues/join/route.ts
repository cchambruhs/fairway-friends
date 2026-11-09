// @polsia:user-owned — backward-compatible join-code flow, public-League only.
import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import {
  addMemberWithinCapacity,
  lockLeagueForCapacity,
} from '@/lib/business/league-management.server';
import { LeagueJoinResponseSchema } from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';
const JoinCodeSchema = z.object({ joinCode: z.string().trim().min(4).max(32) }).strict();

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = JoinCodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { errors: { joinCode: 'Enter a valid League code.' } },
      { status: 400 },
    );
  }
  const league = await prisma.league.findUnique({
    where: { joinCode: parsed.data.joinCode.toUpperCase() },
    select: { id: true },
  });
  if (!league)
    return NextResponse.json(
      { error: 'No public League was found for that code.' },
      { status: 404 },
    );
  const result = await prisma.$transaction(async (transaction) => {
    await lockLeagueForCapacity(transaction, league.id);
    const current = await transaction.league.findUnique({
      where: { id: league.id },
      select: { visibility: true },
    });
    if (!current || current.visibility !== 'PUBLIC') return { result: 'private' as const };
    return addMemberWithinCapacity(transaction, {
      leagueId: league.id,
      userId: authorization.user.id,
      role: 'PLAYER',
    });
  });
  if (result.result === 'private' || result.result === 'missing') {
    return NextResponse.json(
      { error: 'No public League was found for that code.' },
      { status: 404 },
    );
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
      leagueId: league.id,
      leagueName: result.leagueName,
    }),
  );
}
