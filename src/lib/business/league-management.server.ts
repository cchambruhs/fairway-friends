// @polsia:user-owned — League settings validation, roles, and capacity-safe joins.
import 'server-only';
import type { Prisma } from '@prisma/client';
import type { LeagueSettings } from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';

export const LEAGUE_ACTIVATION_OFFERS = [
  { id: 'one', amountUsd: 1, capacityLimit: null, upgradeAmountUsd: null },
  { id: 'five', amountUsd: 5, capacityLimit: null, upgradeAmountUsd: null },
  { id: 'fifty', amountUsd: 50, capacityLimit: null, upgradeAmountUsd: null },
] as const;

export function parseDateOnly(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function validateSeasonDates(settings: Pick<LeagueSettings, 'seasonStart' | 'seasonEnd'>) {
  const seasonStart = parseDateOnly(settings.seasonStart);
  const seasonEnd = parseDateOnly(settings.seasonEnd);
  if (!seasonStart) return { error: { seasonStart: 'Enter a valid season start date.' } };
  if (!seasonEnd) return { error: { seasonEnd: 'Enter a valid season end date.' } };
  if (seasonEnd < seasonStart) {
    return { error: { seasonEnd: 'Season end must be on or after the season start.' } };
  }
  return { seasonStart, seasonEnd };
}

export async function validateLeagueCourses(
  transaction: Prisma.TransactionClient | typeof prisma,
  courses: LeagueSettings['courses'],
) {
  const layoutIds = courses.map((course) => course.layoutId);
  if (new Set(layoutIds).size !== layoutIds.length) {
    return 'Choose each course layout once.';
  }
  if (courses.length === 0) return null;
  const layouts = await transaction.courseLayout.findMany({
    where: { id: { in: layoutIds }, course: { archivedAt: null }, holes: { some: {} } },
    select: { id: true, courseId: true },
  });
  const valid = new Map(layouts.map((layout) => [layout.id, layout.courseId]));
  return courses.every((selection) => valid.get(selection.layoutId) === selection.courseId)
    ? null
    : 'Choose an active course and a playable layout that belongs to it.';
}

export async function lockLeagueForCapacity(
  transaction: Prisma.TransactionClient,
  leagueId: string,
) {
  await transaction.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "league" WHERE id = ${leagueId} FOR UPDATE`;
}

export async function addMemberWithinCapacity(
  transaction: Prisma.TransactionClient,
  input: { leagueId: string; userId: string; role: 'LEADER' | 'SCOREKEEPER' | 'PLAYER' },
): Promise<{ result: 'joined' | 'already_member' | 'full' | 'missing'; leagueName?: string }> {
  await lockLeagueForCapacity(transaction, input.leagueId);
  const league = await transaction.league.findUnique({
    where: { id: input.leagueId },
    select: { id: true, name: true, participantCapacity: true },
  });
  if (!league) return { result: 'missing' };

  const existing = await transaction.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId: input.userId } },
    select: { id: true },
  });
  if (existing) return { result: 'already_member', leagueName: league.name };

  const memberCount = await transaction.leagueMembership.count({ where: { leagueId: league.id } });
  if (memberCount >= league.participantCapacity) return { result: 'full', leagueName: league.name };

  await transaction.leagueMembership.create({ data: input });
  return { result: 'joined', leagueName: league.name };
}

export async function userLeagueRole(leagueId: string, userId: string) {
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}
