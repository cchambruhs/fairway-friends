// @polsia:user-owned — authenticated choices for real saved-round players, leagues, and layouts.
import 'server-only';
import { NextResponse } from 'next/server';
import { SavedRoundOptionsSchema } from '@/lib/contracts/saved-round';
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

  const requestedLeagueId = new URL(request.url).searchParams.get('leagueId');
  const [memberships, profiles, identities, layouts] = await Promise.all([
    prisma.leagueMembership.findMany({
      where: { userId: user.id },
      include: { league: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.playerProfile.findMany({ select: { userId: true, displayName: true } }),
    prisma.uDiscIdentity.findMany({
      where: { OR: [{ ownerUserId: { not: null } }, { pendingClaimUserId: { not: null } }] },
      select: { ownerUserId: true, pendingClaimUserId: true },
    }),
    prisma.courseLayout.findMany({
      where: { course: { archivedAt: null } },
      include: {
        course: { select: { name: true, location: true } },
        holes: { orderBy: { number: 'asc' }, select: { number: true, par: true } },
      },
      orderBy: [{ course: { name: 'asc' } }, { name: 'asc' }],
    }),
  ]);

  const leagueMembership = memberships.find(
    (membership) => membership.leagueId === requestedLeagueId,
  );
  if (requestedLeagueId && !leagueMembership) {
    return NextResponse.json(
      { error: 'You are not a current member of that League.' },
      { status: 403 },
    );
  }

  const profileNames = new Map(profiles.map((profile) => [profile.userId, profile.displayName]));
  const knownPlayerIds = new Set([
    ...profiles.map((profile) => profile.userId),
    ...identities.flatMap((identity) =>
      [identity.ownerUserId, identity.pendingClaimUserId].filter((id): id is string => id !== null),
    ),
    user.id,
  ]);
  const eligibleIds = requestedLeagueId
    ? new Set(
        (
          await prisma.leagueMembership.findMany({
            where: { leagueId: requestedLeagueId },
            select: { userId: true },
          })
        )
          .map((membership) => membership.userId)
          .filter((id) => knownPlayerIds.has(id)),
      )
    : knownPlayerIds;
  const accounts = await prisma.user.findMany({
    where: { id: { in: [...eligibleIds] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(
    SavedRoundOptionsSchema.parse({
      currentUserId: user.id,
      players: accounts.map((account) => ({
        userId: account.id,
        displayName: profileNames.get(account.id)?.trim() || account.name,
      })),
      leagues: memberships.map((membership) => ({
        id: membership.league.id,
        name: membership.league.name,
        role: membership.role,
      })),
      courseLayouts: layouts.map((layout) => ({
        id: layout.id,
        courseName: layout.course.name,
        layoutName: layout.name,
        location: layout.course.location,
        holes: layout.holes.map((hole) => ({ number: hole.number, par: hole.par })),
      })),
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
