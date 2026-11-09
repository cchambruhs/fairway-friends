// @polsia:user-owned — player-authorized League discovery, creation, and memberships.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import {
  addMemberWithinCapacity,
  parseDateOnly,
  validateLeagueCourses,
  validateSeasonDates,
} from '@/lib/business/league-management.server';
import {
  LeagueCreateResponseSchema,
  LeagueCreateSchema,
  LeagueIndexSchema,
} from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

function fieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}

function dateLabel(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { user } = authorization;
  const memberships = await prisma.leagueMembership.findMany({
    where: { userId: user.id },
    include: { league: { include: { _count: { select: { memberships: true } } } } },
    orderBy: { joinedAt: 'asc' },
  });
  const memberIds = memberships.map((membership) => membership.leagueId);
  const publicLeagues = await prisma.league.findMany({
    where: { visibility: 'PUBLIC', ...(memberIds.length ? { id: { notIn: memberIds } } : {}) },
    include: { _count: { select: { memberships: true } } },
    orderBy: { name: 'asc' },
    take: 100,
  });
  const items = [
    ...memberships.map((membership) => ({
      league: membership.league,
      role: membership.role,
      isMember: true,
    })),
    ...publicLeagues.map((league) => ({ league, role: null, isMember: false })),
  ].map(({ league, role, isMember }) => ({
    id: league.id,
    name: league.name,
    visibility: league.visibility,
    schedule: league.schedule || null,
    seasonStart: dateLabel(league.seasonStart),
    seasonEnd: dateLabel(league.seasonEnd),
    participantCapacity: league.participantCapacity,
    memberCount: league._count.memberships,
    availablePlaces: Math.max(league.participantCapacity - league._count.memberships, 0),
    scoringFormat: league.scoringFormat,
    logoUrl: league.logoUrl,
    activated: Boolean(league.activatedAt),
    role,
    isMember,
    canJoin:
      !isMember &&
      league.visibility === 'PUBLIC' &&
      league._count.memberships < league.participantCapacity,
    isFull: league._count.memberships >= league.participantCapacity,
  }));

  return NextResponse.json(LeagueIndexSchema.parse({ items }), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = LeagueCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrors(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;
  const dateValidation = validateSeasonDates(input);
  if ('error' in dateValidation) {
    return NextResponse.json({ errors: dateValidation.error }, { status: 400 });
  }
  const badCourse = await validateLeagueCourses(prisma, input.courses);
  if (badCourse) return NextResponse.json({ errors: { courses: badCourse } }, { status: 400 });

  const joinCode = randomBytes(5).toString('hex').toUpperCase();
  const created = await prisma.$transaction(async (transaction) => {
    const league = await transaction.league.create({
      data: {
        name: input.name,
        joinCode,
        createdByUserId: authorization.user.id,
        visibility: input.visibility,
        schedule: input.schedule,
        seasonStart: parseDateOnly(input.seasonStart),
        seasonEnd: parseDateOnly(input.seasonEnd),
        participantCapacity: input.participantCapacity,
        scoringFormat: input.scoringFormat,
        fixedPoints: input.fixedPoints,
        plainRules: input.plainRules,
        courses: { create: input.courses },
      },
      select: { id: true, name: true },
    });
    await addMemberWithinCapacity(transaction, {
      leagueId: league.id,
      userId: authorization.user.id,
      role: 'LEADER',
    });
    return league;
  });

  return NextResponse.json(LeagueCreateResponseSchema.parse(created), { status: 201 });
}
