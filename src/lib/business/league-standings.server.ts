// @polsia:user-owned — championship standings over saved and imported finalized rounds.
import 'server-only';
import {
  accumulateLeaguePoints,
  awardLeaguePoints,
  compareLeagueStandings,
  DEFAULT_FIXED_POINTS,
  sharedStandingRanks,
} from '@/lib/business/league-scoring';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import type { LeagueRole } from '@/lib/contracts/leagues';
import { prisma } from '@/lib/db';

type LeagueRecord = Awaited<ReturnType<typeof prisma.league.findUniqueOrThrow>>;
type MemberRecord = {
  userId: string;
  role: LeagueRole;
  displayName: string;
};

interface RoundFinish {
  playerKey: string;
  userId: string | null;
  displayName: string;
  totalStrokes: number;
  totalToPar: number;
}

interface StandingAccumulator {
  playerKey: string;
  userId: string | null;
  displayName: string;
  role: LeagueRole;
  points: number;
  wins: number;
  seconds: number;
  placeTotal: number;
  rounds: number;
  totalStrokes: number;
  totalToPar: number;
}

function isInSeason(date: Date | null, league: LeagueRecord) {
  if (league.seasonStart && (!date || date < league.seasonStart)) return false;
  if (league.seasonEnd && (!date || date > league.seasonEnd)) return false;
  return true;
}

function numericArray(value: unknown): number[] | null {
  return Array.isArray(value) &&
    value.every((item) => typeof item === 'number' && Number.isInteger(item))
    ? value
    : null;
}

export async function leagueStandings(league: LeagueRecord, members: MemberRecord[]) {
  const memberByUser = new Map(members.map((member) => [member.userId, member]));
  const [cards, savedRounds, profiles, users, identities] = await Promise.all([
    prisma.importedScorecard.findMany({
      where: {
        leagueId: league.id,
        finalizedAt: { not: null },
        deletedAt: null,
      },
      include: { players: { orderBy: { sourceOrder: 'asc' } } },
      orderBy: [{ playedOn: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.savedRound.findMany({
      where: {
        leagueId: league.id,
        status: 'FINALIZED',
        verificationStatus: 'LEAGUE_VERIFIED',
      },
      include: { participants: { orderBy: { sourceOrder: 'asc' } } },
      orderBy: [{ playedOn: 'asc' }, { createdAt: 'asc' }],
    }),
    members.length
      ? prisma.playerProfile.findMany({
          where: { userId: { in: members.map((member) => member.userId) } },
          select: { userId: true, displayName: true },
        })
      : Promise.resolve([]),
    members.length
      ? prisma.user.findMany({
          where: { id: { in: members.map((member) => member.userId) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    prisma.uDiscIdentity.findMany({
      where: { ownerUserId: { not: null } },
      select: { id: true, ownerUserId: true, normalizedUsername: true },
    }),
  ]);

  const profileNames = new Map(profiles.map((profile) => [profile.userId, profile.displayName]));
  const accountNames = new Map(users.map((user) => [user.id, user.name]));
  const ownerByIdentity = new Map(
    identities.flatMap((identity) =>
      identity.ownerUserId ? [[identity.id, identity.ownerUserId] as const] : [],
    ),
  );
  const identityByOwner = new Map(
    identities.flatMap((identity) =>
      identity.ownerUserId ? [[identity.ownerUserId, identity] as const] : [],
    ),
  );
  const identityByUsername = new Map(
    identities.map((identity) => [identity.normalizedUsername, identity]),
  );
  const pointsValue: unknown = league.fixedPoints;
  const fixedPoints =
    Array.isArray(pointsValue) &&
    pointsValue.every((point) => typeof point === 'number' && Number.isFinite(point) && point >= 0)
      ? pointsValue
      : [...DEFAULT_FIXED_POINTS];

  const standings = new Map<string, StandingAccumulator>();
  function ensureStanding(finish: RoundFinish): StandingAccumulator {
    const existing = standings.get(finish.playerKey);
    if (existing) {
      if (!existing.userId && finish.userId) existing.userId = finish.userId;
      if (existing.displayName === 'Player' && finish.displayName)
        existing.displayName = finish.displayName;
      return existing;
    }
    const member = finish.userId ? memberByUser.get(finish.userId) : undefined;
    const created: StandingAccumulator = {
      playerKey: finish.playerKey,
      userId: finish.userId,
      displayName: finish.displayName,
      role: member?.role ?? 'PLAYER',
      points: 0,
      wins: 0,
      seconds: 0,
      placeTotal: 0,
      rounds: 0,
      totalStrokes: 0,
      totalToPar: 0,
    };
    standings.set(finish.playerKey, created);
    return created;
  }
  for (const member of members) {
    const identity = identityByOwner.get(member.userId);
    const playerKey = identity ? `identity:${identity.id}` : `user:${member.userId}`;
    ensureStanding({
      playerKey,
      userId: member.userId,
      displayName: member.displayName,
      totalStrokes: 0,
      totalToPar: 0,
    });
  }

  const roundRows: RoundFinish[][] = [];
  for (const card of cards) {
    if (!isInSeason(card.playedOn, league)) continue;
    const pars = numericArray(card.pars);
    if (!pars?.length) continue;
    const finishes: RoundFinish[] = [];
    for (const player of card.players) {
      const scores = numericArray(player.holeScores);
      if (!scores || scores.length !== pars.length || scores.some((score) => score < 1)) continue;
      const normalized = player.normalizedUsername ?? normalizeUDiscUsername(player.username ?? '');
      const identity = player.identityId
        ? identities.find((item) => item.id === player.identityId)
        : normalized
          ? identityByUsername.get(normalized)
          : undefined;
      const userId = player.identityId
        ? (ownerByIdentity.get(player.identityId) ?? null)
        : (identity?.ownerUserId ?? null);
      const playerKey = identity
        ? `identity:${identity.id}`
        : normalized
          ? `udisc:${normalized}`
          : `entry:${player.id}`;
      finishes.push({
        playerKey,
        userId,
        displayName:
          player.displayName?.trim() || (player.username ? `@${player.username}` : 'Player'),
        totalStrokes: scores.reduce((sum, score) => sum + score, 0),
        totalToPar: scores.reduce((sum, score, index) => sum + score - (pars[index] ?? 0), 0),
      });
    }
    if (finishes.length > 0) roundRows.push(finishes);
  }

  for (const round of savedRounds) {
    if (!isInSeason(round.playedOn, league)) continue;
    const pars = numericArray(round.holePars);
    if (!pars?.length) continue;
    const finishes: RoundFinish[] = [];
    for (const participant of round.participants) {
      const scores = numericArray(participant.holeScores);
      if (!scores || scores.length !== pars.length || scores.some((score) => score < 1)) continue;
      const identity = identityByOwner.get(participant.userId);
      const playerKey = identity ? `identity:${identity.id}` : `user:${participant.userId}`;
      finishes.push({
        playerKey,
        userId: participant.userId,
        displayName:
          profileNames.get(participant.userId)?.trim() ||
          accountNames.get(participant.userId) ||
          participant.displayName,
        totalStrokes: scores.reduce((sum, score) => sum + score, 0),
        totalToPar: scores.reduce((sum, score, index) => sum + score - (pars[index] ?? 0), 0),
      });
    }
    if (finishes.length > 0) roundRows.push(finishes);
  }

  const awardsByRound = roundRows.map((round) =>
    awardLeaguePoints(
      round.map(({ playerKey, totalStrokes }) => ({ playerKey, totalStrokes })),
      league.scoringFormat,
      fixedPoints,
    ),
  );
  const pointTotals = accumulateLeaguePoints([...standings.keys()], awardsByRound);
  for (const [roundIndex, round] of roundRows.entries()) {
    const awards = awardsByRound[roundIndex] ?? [];
    const finishByKey = new Map(round.map((finish) => [finish.playerKey, finish]));
    for (const award of awards) {
      const finish = finishByKey.get(award.playerKey);
      if (!finish) continue;
      const standing = ensureStanding(finish);
      standing.rounds += 1;
      standing.totalStrokes += finish.totalStrokes;
      standing.totalToPar += finish.totalToPar;
      standing.placeTotal += award.place;
      if (award.place === 1) standing.wins += 1;
      if (award.place === 2) standing.seconds += 1;
    }
  }

  for (const [playerKey, standing] of standings) {
    standing.points = pointTotals.get(playerKey) ?? 0;
  }

  const sorted = [...standings.values()]
    .map((standing) => ({
      ...standing,
      averagePlace: standing.rounds ? standing.placeTotal / standing.rounds : null,
    }))
    .sort(
      (left, right) =>
        compareLeagueStandings(left, right) || left.displayName.localeCompare(right.displayName),
    );
  const ranks = sharedStandingRanks(sorted);
  return sorted.map((standing, index) => ({
    rank: ranks[index] ?? index + 1,
    playerKey: standing.playerKey,
    userId: standing.userId,
    displayName: standing.displayName,
    role: standing.role,
    points: standing.points,
    wins: standing.wins,
    seconds: standing.seconds,
    averagePlace:
      standing.averagePlace === null ? null : Math.round(standing.averagePlace * 100) / 100,
    rounds: standing.rounds,
    totalStrokes: standing.totalStrokes,
    averageToPar: standing.rounds ? standing.totalToPar / standing.rounds : null,
  }));
}
