// @polsia:user-owned — join by invite link/code or request access to a public Clubhouse.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { ClubhouseJoinRequestSchema } from '@/lib/contracts/clubhouses';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = ClubhouseJoinRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Choose a join link, code, or public Clubhouse.' },
      { status: 400 },
    );

  const clubhouse =
    parsed.data.kind === 'request'
      ? parsed.data.clubhouseId
        ? await prisma.clubhouse.findUnique({ where: { id: parsed.data.clubhouseId } })
        : null
      : parsed.data.kind === 'code'
        ? parsed.data.value
          ? await prisma.clubhouse.findUnique({
              where: { joinCode: parsed.data.value.trim().toUpperCase() },
            })
          : null
        : parsed.data.value
          ? await prisma.clubhouse.findUnique({ where: { inviteToken: parsed.data.value } })
          : null;
  if (!clubhouse) return NextResponse.json({ error: 'Clubhouse not found.' }, { status: 404 });

  const membership = await prisma.clubhouseMembership.findUnique({
    where: { clubhouseId_userId: { clubhouseId: clubhouse.id, userId: authorization.user.id } },
  });
  if (membership)
    return NextResponse.json({ ok: true, message: 'Already a member.', clubhouseId: clubhouse.id });

  if (parsed.data.kind === 'request') {
    if (!clubhouse.isPublic)
      return NextResponse.json(
        { error: 'This Clubhouse is not open to requests.' },
        { status: 403 },
      );
    const joinRequest = await prisma.clubhouseJoinRequest.upsert({
      where: { clubhouseId_userId: { clubhouseId: clubhouse.id, userId: authorization.user.id } },
      create: { clubhouseId: clubhouse.id, userId: authorization.user.id },
      update: {
        status: 'PENDING',
        requestedAt: new Date(),
        reviewedAt: null,
        reviewedByUserId: null,
      },
      select: { id: true },
    });
    return NextResponse.json(
      {
        ok: true,
        message: 'Membership request sent.',
        clubhouseId: clubhouse.id,
        requestId: joinRequest.id,
      },
      { status: 201 },
    );
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.clubhouseMembership.create({
      data: { clubhouseId: clubhouse.id, userId: authorization.user.id, role: 'MEMBER' },
    });
    const current = await transaction.userClubhouseSelection.findUnique({
      where: { userId: authorization.user.id },
      select: { id: true },
    });
    if (!current) {
      await transaction.userClubhouseSelection.create({
        data: { userId: authorization.user.id, clubhouseId: clubhouse.id },
      });
    }
  });
  return NextResponse.json(
    { ok: true, message: 'You joined the Clubhouse.', clubhouseId: clubhouse.id },
    { status: 201 },
  );
}
