// @polsia:user-owned — public player profile reads from imported UDisc scorecard rows.

import 'server-only';
import { importedScorecardItem } from '@/lib/business/imported-scorecard';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import { buildPublicPlayerProfile } from '@/lib/business/player-statistics';
import { mergeSavedRoundStatistics } from '@/lib/business/saved-round-statistics';
import { prisma } from '@/lib/db';

async function savedCards(leagueIds: readonly string[] = []) {
  const rows = await prisma.importedScorecard.findMany({
    where: {
      finalizedAt: { not: null },
      deletedAt: null,
      OR: leagueIds.length
        ? [{ leagueId: null }, { leagueId: { in: [...leagueIds] } }]
        : [{ leagueId: null }],
    },
    include: {
      players: { orderBy: { sourceOrder: 'asc' } },
      clubhouseLinks: { include: { clubhouse: true } },
    },
    orderBy: [{ playedOn: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((row) => importedScorecardItem(row));
}

async function identifiedUsernames(cards: Awaited<ReturnType<typeof savedCards>>) {
  const usernames = [
    ...new Set(
      cards.flatMap((card) =>
        card.players.flatMap((player) =>
          player.username ? [normalizeUDiscUsername(player.username)] : [],
        ),
      ),
    ),
  ].filter((username) => username.length > 0);
  if (usernames.length === 0) return [];
  const identities = await prisma.uDiscIdentity.findMany({
    where: { normalizedUsername: { in: usernames } },
    select: { normalizedUsername: true },
  });
  return identities.map((identity) => identity.normalizedUsername);
}

export async function publicProfileForUsername(username: string) {
  const normalizedUsername = normalizeUDiscUsername(username);
  if (!normalizedUsername) return null;
  const [identity, cards] = await Promise.all([
    prisma.uDiscIdentity.findUnique({ where: { normalizedUsername } }),
    savedCards(),
  ]);
  if (identity?.ownerUserId) return publicProfileForUser(identity.ownerUserId);
  const knownUsernames = await identifiedUsernames(cards);
  const owner = identity?.ownerUserId
    ? await prisma.playerProfile.findUnique({
        where: { userId: identity.ownerUserId },
        select: { displayName: true },
      })
    : null;
  const displayName =
    owner?.displayName ??
    cards
      .flatMap((card) => card.players)
      .find(
        (player) =>
          player.username !== null &&
          normalizeUDiscUsername(player.username) === normalizedUsername,
      )?.displayName ??
    username;
  return buildPublicPlayerProfile({
    displayName,
    username: normalizedUsername,
    identityStatus: identity?.ownerUserId
      ? 'verified'
      : identity?.pendingClaimUserId
        ? 'pending'
        : 'unclaimed',
    identifiedUsernames: knownUsernames,
    cards,
  });
}

export async function publicProfileForUser(userId: string, viewerUserId?: string) {
  const viewerMemberships = viewerUserId
    ? await prisma.leagueMembership.findMany({
        where: { userId: viewerUserId },
        select: { leagueId: true },
      })
    : [];
  const leagueIds = viewerMemberships.map((membership) => membership.leagueId);
  const [user, savedProfile, identity] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
    prisma.playerProfile.findUnique({ where: { userId }, select: { displayName: true } }),
    prisma.uDiscIdentity.findUnique({ where: { ownerUserId: userId } }),
  ]);
  if (!user) return null;
  const savedRounds = await prisma.savedRound.findMany({
    where: {
      status: 'FINALIZED',
      verificationStatus: { in: ['CASUAL_UNVERIFIED', 'LEAGUE_VERIFIED'] },
      participants: { some: { userId } },
      ...(leagueIds.length
        ? { OR: [{ leagueId: null }, { leagueId: { in: leagueIds } }] }
        : { leagueId: null }),
    },
    include: { participants: { orderBy: { sourceOrder: 'asc' } } },
    orderBy: [{ playedOn: 'asc' }, { createdAt: 'asc' }],
  });
  const savedRoundStats = savedRounds.flatMap((round) => {
    if (
      !Array.isArray(round.holePars) ||
      round.holePars.some((par) => typeof par !== 'number' || !Number.isInteger(par))
    ) {
      return [];
    }
    const participants = round.participants.flatMap((participant) => {
      if (
        !Array.isArray(participant.holeScores) ||
        participant.holeScores.some(
          (score) => score !== null && (typeof score !== 'number' || !Number.isInteger(score)),
        )
      ) {
        return [];
      }
      return [
        {
          userId: participant.userId,
          displayName: participant.displayName,
          holeScores: participant.holeScores.map((score) =>
            score === null ? null : Number(score),
          ),
        },
      ];
    });
    return [
      {
        id: round.id,
        playedOn: round.playedOn.toISOString().slice(0, 10),
        courseName: round.courseName,
        status: round.status === 'FINALIZED' ? ('FINALIZED' as const) : ('IN_PROGRESS' as const),
        holePars: round.holePars.map((par) => Number(par)),
        participants,
      },
    ];
  });
  if (!identity) {
    const profile = buildPublicPlayerProfile({
      displayName: savedProfile?.displayName ?? user.name,
      username: null,
      identityStatus: 'unclaimed',
      identifiedUsernames: [],
      cards: [],
    });
    return mergeSavedRoundStatistics(profile, userId, savedRoundStats);
  }
  const cards = await savedCards(leagueIds);
  const knownUsernames = await identifiedUsernames(cards);
  const profile = buildPublicPlayerProfile({
    displayName: savedProfile?.displayName ?? user.name,
    username: identity.normalizedUsername,
    identityStatus: 'verified',
    identifiedUsernames: knownUsernames,
    cards,
  });
  return mergeSavedRoundStatistics(profile, userId, savedRoundStats);
}
