// @polsia:user-owned — signed-in invitation acceptance with locked capacity checks.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import {
  addMemberWithinCapacity,
  lockLeagueForCapacity,
} from '@/lib/business/league-management.server';
import { LeagueInvitationAcceptSchema } from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { token } = await params;
  const result = await prisma.$transaction(async (transaction) => {
    const invitation = await transaction.leagueInvitation.findUnique({
      where: { token },
      select: { id: true, leagueId: true, role: true },
    });
    if (!invitation) return { result: 'invalid' as const };
    await lockLeagueForCapacity(transaction, invitation.leagueId);
    const [current, league] = await Promise.all([
      transaction.leagueInvitation.findUnique({
        where: { id: invitation.id },
        select: { revokedAt: true, role: true },
      }),
      transaction.league.findUnique({
        where: { id: invitation.leagueId },
        select: { id: true, name: true },
      }),
    ]);
    if (!current || !league) return { result: 'invalid' as const };
    const existing = await transaction.leagueMembership.findUnique({
      where: {
        leagueId_userId: { leagueId: invitation.leagueId, userId: authorization.user.id },
      },
      select: { id: true },
    });
    if (existing)
      return { result: 'already_member' as const, leagueId: league.id, leagueName: league.name };
    if (current.revokedAt) return { result: 'invalid' as const };
    const joined = await addMemberWithinCapacity(transaction, {
      leagueId: invitation.leagueId,
      userId: authorization.user.id,
      role: current.role,
    });
    return { ...joined, leagueId: league.id };
  });
  if (result.result === 'invalid' || result.result === 'missing') {
    return NextResponse.json({ error: 'Invitation is invalid or revoked.' }, { status: 404 });
  }
  if (result.result === 'full') {
    return NextResponse.json(
      { error: 'This League has reached its participant capacity.' },
      { status: 409 },
    );
  }
  return NextResponse.json(
    LeagueInvitationAcceptSchema.parse({
      joined: result.result === 'joined',
      leagueId: result.leagueId,
      leagueName: result.leagueName,
    }),
  );
}
