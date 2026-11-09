// @polsia:user-owned — signed-in preview of a League invitation link.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { LeagueInvitationPreviewSchema } from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { token } = await params;
  const invitation = await prisma.leagueInvitation.findFirst({
    where: { token, revokedAt: null },
    select: { role: true, league: { select: { name: true } } },
  });
  if (!invitation)
    return NextResponse.json({ error: 'Invitation is invalid or revoked.' }, { status: 404 });
  return NextResponse.json(
    LeagueInvitationPreviewSchema.parse({
      leagueName: invitation.league.name,
      role: invitation.role,
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
