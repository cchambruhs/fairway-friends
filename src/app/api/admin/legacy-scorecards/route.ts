// @polsia:user-owned — app-admin view for assigning legacy scorecards with unknown ownership.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/business/api-authorization.server';
import { importedScorecardItem } from '@/lib/business/imported-scorecard';
import { AdminLegacyScorecardsSchema } from '@/lib/contracts/clubhouses';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const authorization = await requireAdminApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const [cards, destinations] = await Promise.all([
    prisma.importedScorecard.findMany({
      where: { clubhouseLinks: { none: {} }, deletedAt: null },
      include: {
        players: { orderBy: { sourceOrder: 'asc' } },
        clubhouseLinks: { include: { clubhouse: true } },
        league: true,
        editRequests: { where: { status: 'APPROVED' }, select: { id: true } },
      },
      orderBy: [{ playedOn: 'desc' }, { createdAt: 'desc' }],
      take: 250,
    }),
    prisma.clubhouse.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return NextResponse.json(
    AdminLegacyScorecardsSchema.parse({
      items: cards.map((card) => importedScorecardItem(card, true)),
      destinations,
    }),
  );
}
