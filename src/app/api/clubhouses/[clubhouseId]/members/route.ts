// @polsia:user-owned — owner/admin membership requests, role changes and invite management.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { ClubhouseManageSchema } from '@/lib/contracts/clubhouses';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clubhouseId: string }> },
): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { clubhouseId } = await params;
  const actor = await prisma.clubhouseMembership.findUnique({
    where: { clubhouseId_userId: { clubhouseId, userId: authorization.user.id } },
    select: { role: true },
  });
  if (!actor || (actor.role !== 'OWNER' && actor.role !== 'ADMIN')) {
    return NextResponse.json(
      { error: 'Clubhouse owner or admin permission required.' },
      { status: 403 },
    );
  }
  const parsed = ClubhouseManageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid Clubhouse management action.' }, { status: 400 });

  if (parsed.data.action === 'approve-request' || parsed.data.action === 'deny-request') {
    const requestRow = await prisma.clubhouseJoinRequest.findFirst({
      where: { id: parsed.data.requestId, clubhouseId, status: 'PENDING' },
      select: { id: true, userId: true },
    });
    if (!requestRow)
      return NextResponse.json(
        { error: 'This membership request is no longer pending.' },
        { status: 409 },
      );
    await prisma.$transaction(async (transaction) => {
      const changed = await transaction.clubhouseJoinRequest.updateMany({
        where: { id: requestRow.id, status: 'PENDING' },
        data: {
          status: parsed.data.action === 'approve-request' ? 'APPROVED' : 'DENIED',
          reviewedAt: new Date(),
          reviewedByUserId: authorization.user.id,
        },
      });
      if (changed.count !== 1) throw new Error('Membership request was already reviewed.');
      if (parsed.data.action === 'approve-request') {
        await transaction.clubhouseMembership.upsert({
          where: { clubhouseId_userId: { clubhouseId, userId: requestRow.userId } },
          create: { clubhouseId, userId: requestRow.userId, role: 'MEMBER' },
          update: {},
        });
        const selection = await transaction.userClubhouseSelection.findUnique({
          where: { userId: requestRow.userId },
          select: { id: true },
        });
        if (!selection) {
          await transaction.userClubhouseSelection.create({
            data: { userId: requestRow.userId, clubhouseId },
          });
        }
      }
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === 'set-role') {
    if (parsed.data.role === 'Owner') {
      return NextResponse.json(
        { error: 'Clubhouse ownership cannot be reassigned here.' },
        { status: 403 },
      );
    }
    if (actor.role === 'ADMIN' && parsed.data.role !== 'Member') {
      return NextResponse.json(
        { error: 'Only the owner can grant admin permissions.' },
        { status: 403 },
      );
    }
    const target = await prisma.clubhouseMembership.findUnique({
      where: { clubhouseId_userId: { clubhouseId, userId: parsed.data.userId } },
      select: { role: true },
    });
    if (!target)
      return NextResponse.json({ error: 'Clubhouse member not found.' }, { status: 404 });
    if (target.role === 'OWNER')
      return NextResponse.json(
        { error: 'The Clubhouse owner role is protected.' },
        { status: 403 },
      );
    if (actor.role === 'ADMIN' && target.role !== 'MEMBER') {
      return NextResponse.json(
        { error: 'Admins cannot change another admin role.' },
        { status: 403 },
      );
    }
    await prisma.clubhouseMembership.update({
      where: { clubhouseId_userId: { clubhouseId, userId: parsed.data.userId } },
      data: { role: parsed.data.role.toUpperCase() as 'ADMIN' | 'MEMBER' },
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === 'remove-member') {
    const targetUserId = parsed.data.userId;
    if (targetUserId === authorization.user.id && actor.role === 'OWNER') {
      return NextResponse.json(
        { error: 'The owner must transfer ownership before leaving.' },
        { status: 403 },
      );
    }
    const target = await prisma.clubhouseMembership.findUnique({
      where: { clubhouseId_userId: { clubhouseId, userId: parsed.data.userId } },
      select: { role: true },
    });
    if (!target)
      return NextResponse.json({ error: 'Clubhouse member not found.' }, { status: 404 });
    if (target.role === 'OWNER' || (actor.role === 'ADMIN' && target.role !== 'MEMBER')) {
      return NextResponse.json(
        { error: 'This role cannot be removed by your Clubhouse role.' },
        { status: 403 },
      );
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.clubhouseMembership.delete({
        where: { clubhouseId_userId: { clubhouseId, userId: targetUserId } },
      });
      await transaction.userClubhouseSelection.deleteMany({
        where: { userId: targetUserId, clubhouseId },
      });
    });
    return NextResponse.json({ ok: true });
  }

  const refreshed = await prisma.clubhouse.update({
    where: { id: clubhouseId },
    data: {
      joinCode: randomBytes(5).toString('hex').toUpperCase(),
      inviteToken: randomBytes(24).toString('base64url'),
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, clubhouseId: refreshed.id });
}
