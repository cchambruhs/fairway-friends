// @polsia:user-owned — authenticated saved-round creation and player/league history.
import 'server-only';
import { NextResponse } from 'next/server';
import { savedRoundInclude, savedRoundItem } from '@/lib/business/saved-round.server';
import {
  SavedRoundCreateSchema,
  SavedRoundListSchema,
  SavedRoundResponseSchema,
} from '@/lib/contracts/saved-round';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }

  const leagueId = new URL(request.url).searchParams.get('leagueId');
  let roleByLeague = new Map<string, 'LEADER' | 'SCOREKEEPER' | 'PLAYER'>();
  if (leagueId) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: user.id } },
      select: { role: true },
    });
    if (!membership)
      return NextResponse.json({ error: 'You are not a current League member.' }, { status: 403 });
    roleByLeague = new Map([[leagueId, membership.role]]);
  } else {
    const memberships = await prisma.leagueMembership.findMany({
      where: { userId: user.id },
      select: { leagueId: true, role: true },
    });
    roleByLeague = new Map(memberships.map((membership) => [membership.leagueId, membership.role]));
  }

  const rows = await prisma.savedRound.findMany({
    where: leagueId
      ? { leagueId }
      : {
          OR: [{ participants: { some: { userId: user.id } } }, { createdByUserId: user.id }],
        },
    include: savedRoundInclude,
    orderBy: [{ playedOn: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
  });

  const visibleRows = leagueId
    ? rows
    : rows.filter((row) =>
        row.leagueId
          ? roleByLeague.has(row.leagueId)
          : row.participants.some((participant) => participant.userId === user.id) ||
            row.createdByUserId === user.id,
      );

  return NextResponse.json(
    SavedRoundListSchema.parse({
      items: visibleRows.map((row) =>
        savedRoundItem(
          row,
          user.id,
          row.leagueId ? (roleByLeague.get(row.leagueId) ?? null) : null,
        ),
      ),
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }

  const parsed = SavedRoundCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const input = parsed.data;
  if (new Set(input.participantUserIds).size !== input.participantUserIds.length) {
    return NextResponse.json(
      { errors: { participantUserIds: 'Choose each player once.' } },
      { status: 400 },
    );
  }
  const playedOn = new Date(`${input.playedOn}T00:00:00.000Z`);
  if (
    !Number.isFinite(playedOn.getTime()) ||
    playedOn.toISOString().slice(0, 10) !== input.playedOn
  ) {
    return NextResponse.json(
      { errors: { playedOn: 'Enter a valid round date.' } },
      { status: 400 },
    );
  }
  if (input.playedOn > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json(
      { errors: { playedOn: 'Round dates cannot be in the future.' } },
      { status: 400 },
    );
  }

  let role: 'LEADER' | 'SCOREKEEPER' | 'PLAYER' | null = null;
  if (input.leagueId) {
    const [league, callerMembership, participantMemberships] = await Promise.all([
      prisma.league.findUnique({ where: { id: input.leagueId }, select: { id: true, name: true } }),
      prisma.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId: input.leagueId, userId: user.id } },
        select: { role: true },
      }),
      prisma.leagueMembership.findMany({
        where: { leagueId: input.leagueId, userId: { in: input.participantUserIds } },
        select: { userId: true, role: true },
      }),
    ]);
    role = callerMembership?.role ?? null;
    if (!league || !role)
      return NextResponse.json(
        { error: 'Choose a League you currently belong to.' },
        { status: 403 },
      );
    if (participantMemberships.length !== input.participantUserIds.length) {
      return NextResponse.json(
        {
          errors: {
            participantUserIds: 'Every participant must be a current member of this League.',
          },
        },
        { status: 400 },
      );
    }
  }
  if (!input.participantUserIds.includes(user.id) && (!input.leagueId || role === 'PLAYER')) {
    return NextResponse.json(
      {
        errors: {
          participantUserIds:
            'Include yourself as a participant unless your League role lets you score for the group.',
        },
      },
      { status: 400 },
    );
  }

  const [accounts, profiles, identities] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: input.participantUserIds } },
      select: { id: true, name: true },
    }),
    prisma.playerProfile.findMany({
      where: { userId: { in: input.participantUserIds } },
      select: { userId: true, displayName: true },
    }),
    prisma.uDiscIdentity.findMany({
      where: {
        OR: [
          { ownerUserId: { in: input.participantUserIds } },
          { pendingClaimUserId: { in: input.participantUserIds } },
        ],
      },
      select: { ownerUserId: true, pendingClaimUserId: true },
    }),
  ]);
  const _accountIds = new Set(accounts.map((account) => account.id));
  const eligiblePlayerIds = new Set([
    ...profiles.map((profile) => profile.userId),
    ...identities.flatMap((identity) =>
      [identity.ownerUserId, identity.pendingClaimUserId].filter((id): id is string => id !== null),
    ),
  ]);
  if (
    accounts.length !== input.participantUserIds.length ||
    input.participantUserIds.some((id) => !eligiblePlayerIds.has(id))
  ) {
    return NextResponse.json(
      { errors: { participantUserIds: 'Select registered Fairway Friends player profiles.' } },
      { status: 400 },
    );
  }

  let holePars: number[];
  let courseLayoutId: string | null = null;
  let courseName: string | null = null;
  let layoutName: string | null = null;
  if (input.layoutType === 'course') {
    const layout = await prisma.courseLayout.findFirst({
      where: { id: input.courseLayoutId, course: { archivedAt: null } },
      include: {
        course: { select: { name: true } },
        holes: { orderBy: { number: 'asc' }, select: { number: true, par: true } },
      },
    });
    if (!layout || layout.holes.length < 1 || layout.holes.length > 36) {
      return NextResponse.json({ error: 'Choose an available course layout.' }, { status: 400 });
    }
    if (layout.holes.some((hole, index) => hole.number !== index + 1)) {
      return NextResponse.json(
        { error: 'The selected layout does not have consecutive holes.' },
        { status: 409 },
      );
    }
    holePars = layout.holes.map((hole) => hole.par);
    courseLayoutId = layout.id;
    courseName = layout.course.name;
    layoutName = layout.name;
  } else {
    holePars = input.holePars;
    courseName = input.courseName || null;
    layoutName = input.layoutName || null;
  }

  const profileNames = new Map(profiles.map((profile) => [profile.userId, profile.displayName]));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const row = await prisma.savedRound.create({
    data: {
      createdByUserId: user.id,
      courseName,
      layoutName,
      courseLayoutId,
      leagueId: input.leagueId,
      playedOn,
      holePars,
      participants: {
        create: input.participantUserIds.map((userId, sourceOrder) => ({
          userId,
          displayName:
            profileNames.get(userId)?.trim() || accountsById.get(userId)?.name || 'Player',
          sourceOrder,
          holeScores: Array.from({ length: holePars.length }, () => null),
        })),
      },
    },
    include: savedRoundInclude,
  });
  return NextResponse.json(
    SavedRoundResponseSchema.parse({ item: savedRoundItem(row, user.id, role) }),
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
