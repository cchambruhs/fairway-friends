// @polsia:user-owned — real user-eligible Clubhouse, League, and course-layout choices.
import 'server-only';
import { NextResponse } from 'next/server';
import { ScorecardDestinationsSchema } from '@/lib/contracts/scorecard-governance';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }

  const [clubhouses, leagueMemberships, adminLeagues, layouts] = await Promise.all([
    prisma.clubhouse.findMany({
      where: { memberships: { some: { userId: user.id } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.leagueMembership.findMany({
      where: { userId: user.id, role: { in: ['LEADER', 'SCOREKEEPER'] } },
      include: { league: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    }),
    user.role === 'admin'
      ? prisma.league.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
    prisma.courseLayout.findMany({
      where: { course: { archivedAt: null } },
      orderBy: [{ course: { name: 'asc' } }, { name: 'asc' }],
      include: {
        course: { select: { name: true, location: true } },
        holes: {
          orderBy: { number: 'asc' },
          select: {
            number: true,
            par: true,
            lengthFeet: true,
            lengthVerifiedAt: true,
            lengthVerifiedByUserId: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json(
    ScorecardDestinationsSchema.parse({
      clubhouses,
      leagues:
        user.role === 'admin'
          ? adminLeagues.map((league) => ({ ...league, role: 'LEADER' as const }))
          : leagueMemberships.map((membership) => ({
              ...membership.league,
              role: membership.role,
            })),
      courseLayouts: layouts.map((layout) => ({
        id: layout.id,
        name: layout.name,
        courseName: layout.course.name,
        location: layout.course.location,
        holes: layout.holes.map((hole) => ({
          number: hole.number,
          par: hole.par,
          lengthFeet: hole.lengthFeet,
          lengthVerified: Boolean(
            hole.lengthFeet && hole.lengthVerifiedAt && hole.lengthVerifiedByUserId,
          ),
        })),
      })),
    }),
  );
}
