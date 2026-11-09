// @polsia:user-owned — private detail reads and Leader-only League settings.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import {
  LEAGUE_ACTIVATION_OFFERS,
  lockLeagueForCapacity,
  validateLeagueCourses,
  validateSeasonDates,
} from '@/lib/business/league-management.server';
import { DEFAULT_FIXED_POINTS, LEAGUE_TIE_BREAKERS } from '@/lib/business/league-scoring';
import { leagueStandings } from '@/lib/business/league-standings.server';
import {
  LeagueDetailResponseSchema,
  LeagueMutationResponseSchema,
  LeagueSettingsSchema,
} from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';
type RouteContext = { params: Promise<{ leagueId: string }> };

function fieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { leagueId } = await params;
  const [league, membership] = await Promise.all([
    prisma.league.findUnique({
      where: { id: leagueId },
      include: { _count: { select: { memberships: true } } },
    }),
    prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
      select: { role: true },
    }),
  ]);
  if (!league || (!membership && league.visibility !== 'PUBLIC')) {
    return NextResponse.json({ error: 'League not found.' }, { status: 404 });
  }
  const isMember = Boolean(membership);
  const role = membership?.role ?? null;
  const canManage = role === 'LEADER';
  const [memberRows, invitations] = await Promise.all([
    isMember
      ? prisma.leagueMembership.findMany({ where: { leagueId }, orderBy: { joinedAt: 'asc' } })
      : Promise.resolve([]),
    canManage
      ? prisma.leagueInvitation.findMany({
          where: { leagueId, revokedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true, token: true, role: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const selectedCourseRows = await prisma.leagueCourse.findMany({
    where: { leagueId },
    orderBy: { createdAt: 'asc' },
  });
  const selectedLayouts = selectedCourseRows.length
    ? await prisma.courseLayout.findMany({
        where: { id: { in: selectedCourseRows.map((selection) => selection.layoutId) } },
        include: { course: true, _count: { select: { holes: true } } },
      })
    : [];
  const layoutsById = new Map(selectedLayouts.map((layout) => [layout.id, layout]));
  const [accounts, profiles] = memberRows.length
    ? await Promise.all([
        prisma.user.findMany({
          where: { id: { in: memberRows.map((member) => member.userId) } },
          select: { id: true, name: true },
        }),
        prisma.playerProfile.findMany({
          where: { userId: { in: memberRows.map((member) => member.userId) } },
          select: { userId: true, displayName: true },
        }),
      ])
    : [[], []];
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const profileNames = new Map(profiles.map((profile) => [profile.userId, profile.displayName]));
  const members = memberRows.map((member) => ({
    userId: member.userId,
    displayName:
      profileNames.get(member.userId)?.trim() ||
      accountNames.get(member.userId) ||
      'Fairway Friends player',
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
  }));
  const standings = isMember ? await leagueStandings(league, members) : [];
  const item = {
    id: league.id,
    name: league.name,
    visibility: league.visibility,
    schedule: league.schedule || null,
    seasonStart: league.seasonStart?.toISOString().slice(0, 10) ?? null,
    seasonEnd: league.seasonEnd?.toISOString().slice(0, 10) ?? null,
    participantCapacity: league.participantCapacity,
    memberCount: league._count.memberships,
    availablePlaces: Math.max(league.participantCapacity - league._count.memberships, 0),
    scoringFormat: league.scoringFormat,
    fixedPoints:
      Array.isArray(league.fixedPoints) &&
      league.fixedPoints.every((value) => typeof value === 'number')
        ? league.fixedPoints
        : [...DEFAULT_FIXED_POINTS],
    logoUrl: league.logoUrl,
    activated: Boolean(league.activatedAt),
    role,
    isMember,
    canJoin:
      !isMember &&
      league.visibility === 'PUBLIC' &&
      league._count.memberships < league.participantCapacity,
    isFull: league._count.memberships >= league.participantCapacity,
    plainRules: isMember || league.visibility === 'PUBLIC' ? league.plainRules : null,
    logoKey: isMember ? league.logoKey : null,
    courses: selectedCourseRows.flatMap((selection) => {
      const layout = layoutsById.get(selection.layoutId);
      return layout
        ? [
            {
              courseId: selection.courseId,
              courseName: layout.course.name,
              layoutId: selection.layoutId,
              layoutName: layout.name,
              location: layout.course.location,
              holes: layout._count.holes,
            },
          ]
        : [];
    }),
    members,
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      token: invitation.token,
      role: invitation.role === 'SCOREKEEPER' ? 'SCOREKEEPER' : 'PLAYER',
      createdAt: invitation.createdAt.toISOString(),
    })),
    standings,
    tieBreakers: [...LEAGUE_TIE_BREAKERS],
    activationOffers: LEAGUE_ACTIVATION_OFFERS,
  };
  return NextResponse.json(LeagueDetailResponseSchema.parse({ league: item }), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const parsed = LeagueSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrors(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;
  const dateValidation = validateSeasonDates(input);
  if ('error' in dateValidation) {
    return NextResponse.json({ errors: dateValidation.error }, { status: 400 });
  }
  const { leagueId } = await params;
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
    select: { role: true },
  });
  if (membership?.role !== 'LEADER') {
    return NextResponse.json(
      { error: 'Only the League Leader can edit League settings.' },
      { status: 403 },
    );
  }
  const badCourse = await validateLeagueCourses(prisma, input.courses);
  if (badCourse) return NextResponse.json({ errors: { courses: badCourse } }, { status: 400 });

  const result = await prisma.$transaction(async (transaction) => {
    await lockLeagueForCapacity(transaction, leagueId);
    const [league, currentMembership] = await Promise.all([
      transaction.league.findUnique({ where: { id: leagueId }, select: { id: true } }),
      transaction.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId, userId: authorization.user.id } },
        select: { role: true },
      }),
    ]);
    if (!league) return 'missing' as const;
    if (currentMembership?.role !== 'LEADER') return 'forbidden' as const;
    const memberCount = await transaction.leagueMembership.count({ where: { leagueId } });
    if (input.participantCapacity < memberCount) return 'capacity' as const;
    await transaction.league.update({
      where: { id: leagueId },
      data: {
        name: input.name,
        visibility: input.visibility,
        schedule: input.schedule,
        seasonStart: dateValidation.seasonStart,
        seasonEnd: dateValidation.seasonEnd,
        participantCapacity: input.participantCapacity,
        scoringFormat: input.scoringFormat,
        fixedPoints: input.fixedPoints,
        plainRules: input.plainRules,
      },
    });
    await transaction.leagueCourse.deleteMany({ where: { leagueId } });
    if (input.courses.length) {
      await transaction.leagueCourse.createMany({
        data: input.courses.map((course) => ({ leagueId, ...course })),
      });
    }
    return 'saved' as const;
  });
  if (result === 'missing')
    return NextResponse.json({ error: 'League not found.' }, { status: 404 });
  if (result === 'forbidden')
    return NextResponse.json(
      { error: 'Only the League Leader can edit League settings.' },
      { status: 403 },
    );
  if (result === 'capacity') {
    return NextResponse.json(
      {
        errors: { participantCapacity: 'Capacity cannot be lower than the current member count.' },
      },
      { status: 400 },
    );
  }
  return NextResponse.json(LeagueMutationResponseSchema.parse({ ok: true }));
}
