// @polsia:user-owned — Leader-authorized logo updates after module upload succeeds.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { lockLeagueForCapacity } from '@/lib/business/league-management.server';
import { LeagueLogoResponseSchema, LeagueLogoUpdateSchema } from '@/lib/contracts/leagues';
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
  const parsed = LeagueLogoUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  if (parsed.data.file) {
    const url = new URL(parsed.data.file.url);
    if (url.protocol !== 'https:') {
      return NextResponse.json(
        { errors: { file: 'The uploaded logo must use secure storage.' } },
        { status: 400 },
      );
    }
  }
  const { leagueId } = await params;
  const leader = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
    select: { role: true },
  });
  if (leader?.role !== 'LEADER') {
    return NextResponse.json(
      { error: 'Only the League Leader can update the logo.' },
      { status: 403 },
    );
  }
  const result = await prisma.$transaction(async (transaction) => {
    await lockLeagueForCapacity(transaction, leagueId);
    const currentLeader = await transaction.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
      select: { role: true },
    });
    if (currentLeader?.role !== 'LEADER') return { role: currentLeader?.role, count: 0 };
    const updated = await transaction.league.updateMany({
      where: { id: leagueId },
      data: {
        logoKey: parsed.data.file?.key ?? null,
        logoUrl: parsed.data.file?.url ?? null,
      },
    });
    return { role: currentLeader.role, count: updated.count };
  });
  if (result.role !== 'LEADER')
    return NextResponse.json(
      { error: 'Only the League Leader can update the logo.' },
      { status: 403 },
    );
  if (result.count !== 1) return NextResponse.json({ error: 'League not found.' }, { status: 404 });
  return NextResponse.json(
    LeagueLogoResponseSchema.parse({ logoUrl: parsed.data.file?.url ?? null }),
  );
}
