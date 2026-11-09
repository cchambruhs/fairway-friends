// @polsia:user-owned — persist the one active Clubhouse, or explicitly select Unassigned.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { ClubhouseSelectionSchema } from '@/lib/contracts/clubhouses';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = ClubhouseSelectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a Clubhouse.' }, { status: 400 });

  if (parsed.data.clubhouseId === null) {
    await prisma.userClubhouseSelection.deleteMany({ where: { userId: authorization.user.id } });
    return NextResponse.json({ ok: true, clubhouseId: null });
  }
  const membership = await prisma.clubhouseMembership.findUnique({
    where: {
      clubhouseId_userId: {
        clubhouseId: parsed.data.clubhouseId,
        userId: authorization.user.id,
      },
    },
    select: { id: true },
  });
  if (!membership)
    return NextResponse.json(
      { error: 'Join that Clubhouse before selecting it.' },
      { status: 403 },
    );

  await prisma.userClubhouseSelection.upsert({
    where: { userId: authorization.user.id },
    create: { userId: authorization.user.id, clubhouseId: parsed.data.clubhouseId },
    update: { clubhouseId: parsed.data.clubhouseId },
  });
  return NextResponse.json({ ok: true, clubhouseId: parsed.data.clubhouseId });
}
