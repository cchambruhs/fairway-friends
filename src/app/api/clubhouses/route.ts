// @polsia:user-owned — current memberships, public Clubhouses, and creation.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { ClubhouseIndexSchema, CreateClubhouseSchema } from '@/lib/contracts/clubhouses';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

function roleLabel(role: string): 'Owner' | 'Admin' | 'Member' {
  if (role === 'OWNER') return 'Owner';
  if (role === 'ADMIN') return 'Admin';
  return 'Member';
}

export async function GET(request: Request): Promise<Response> {
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { user } = authorization;
  const [memberships, selection, managedMemberships] = await Promise.all([
    prisma.clubhouseMembership.findMany({
      where: { userId: user.id },
      include: { clubhouse: { include: { _count: { select: { memberships: true } } } } },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.userClubhouseSelection.findUnique({ where: { userId: user.id } }),
    prisma.clubhouseMembership.findMany({
      where: { userId: user.id, role: { in: ['OWNER', 'ADMIN'] } },
      select: { clubhouseId: true },
    }),
  ]);
  const memberIds = memberships.map((membership) => membership.clubhouseId);
  const [publicHouses, destinations, requests, leagueMemberships, allLeagues] = await Promise.all([
    prisma.clubhouse.findMany({
      where: { isPublic: true, id: { notIn: memberIds } },
      include: { _count: { select: { memberships: true } } },
      orderBy: { name: 'asc' },
      take: 100,
    }),
    user.role === 'admin'
      ? prisma.clubhouse.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : prisma.clubhouse.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
    managedMemberships.length === 0
      ? Promise.resolve([])
      : prisma.clubhouseJoinRequest.findMany({
          where: {
            clubhouseId: { in: managedMemberships.map((membership) => membership.clubhouseId) },
            status: 'PENDING',
          },
          include: { clubhouse: { select: { name: true } } },
          orderBy: { requestedAt: 'asc' },
        }),
    prisma.leagueMembership.findMany({
      where: { userId: user.id, role: { in: ['LEADER', 'SCOREKEEPER'] } },
      include: { league: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    }),
    user.role === 'admin'
      ? prisma.league.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
  ]);
  const requestUsers = await prisma.user.findMany({
    where: { id: { in: requests.map((item) => item.userId) } },
    select: { id: true, name: true },
  });
  const requestProfiles = await prisma.playerProfile.findMany({
    where: { userId: { in: requests.map((item) => item.userId) } },
    select: { userId: true, displayName: true },
  });
  const names = new Map(requestUsers.map((item) => [item.id, item.name]));
  const profileNames = new Map(requestProfiles.map((item) => [item.userId, item.displayName]));
  const activeIsMember = memberIds.includes(selection?.clubhouseId ?? '');

  return NextResponse.json(
    ClubhouseIndexSchema.parse({
      activeClubhouseId: activeIsMember ? (selection?.clubhouseId ?? null) : null,
      memberships: memberships.map((membership) => ({
        id: membership.clubhouse.id,
        name: membership.clubhouse.name,
        description: membership.clubhouse.description,
        memberCount: membership.clubhouse._count.memberships,
        role: roleLabel(membership.role),
        joinCode:
          membership.role === 'OWNER' || membership.role === 'ADMIN'
            ? membership.clubhouse.joinCode
            : null,
        inviteToken:
          membership.role === 'OWNER' || membership.role === 'ADMIN'
            ? membership.clubhouse.inviteToken
            : null,
      })),
      publicClubhouses: publicHouses.map((house) => ({
        id: house.id,
        name: house.name,
        description: house.description,
        memberCount: house._count.memberships,
      })),
      assignmentDestinations: destinations,
      leagueAssignmentDestinations:
        user.role === 'admin'
          ? allLeagues.map((league) => ({ ...league, role: 'LEADER' as const }))
          : leagueMemberships.map((membership) => ({
              id: membership.league.id,
              name: membership.league.name,
              role: membership.role,
            })),
      pendingRequests: requests.map((item) => ({
        id: item.id,
        clubhouseId: item.clubhouseId,
        clubhouseName: item.clubhouse.name,
        userId: item.userId,
        displayName:
          profileNames.get(item.userId) ?? names.get(item.userId) ?? 'Fairway Friends player',
        requestedAt: item.requestedAt.toISOString(),
      })),
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = CreateClubhouseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Enter a Clubhouse name.' }, { status: 400 });

  const joinCode = randomBytes(5).toString('hex').toUpperCase();
  const inviteToken = randomBytes(24).toString('base64url');
  const clubhouse = await prisma.$transaction(async (transaction) => {
    const created = await transaction.clubhouse.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description?.trim() || null,
        isPublic: true,
        joinCode,
        inviteToken,
        createdByUserId: authorization.user.id,
      },
      select: { id: true },
    });
    await transaction.clubhouseMembership.create({
      data: { clubhouseId: created.id, userId: authorization.user.id, role: 'OWNER' },
    });
    await transaction.userClubhouseSelection.upsert({
      where: { userId: authorization.user.id },
      create: { userId: authorization.user.id, clubhouseId: created.id },
      update: { clubhouseId: created.id },
    });
    return created;
  });
  return NextResponse.json({ ok: true, clubhouseId: clubhouse.id }, { status: 201 });
}
