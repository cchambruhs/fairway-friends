// @polsia:user-owned — idempotent additive data backfill after db push applies the schema.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';

const requestedClubhouseName = 'Chain Gang Evansville';
const namedCards = [
  {
    scorecardId: 'scorecard_mns8y9vb4afhk4v7lafcmk8n',
    courseName: 'Angel Mounds',
  },
  { scorecardId: '3y5pQmskIL', courseName: 'Eagle Valley at USI' },
] as const;

export type ScorecardBackfillResult = {
  legacyClubhouseLinksCreated: number;
  namedClubhouseLinksCreated: number;
  holesPlayedBackfilled: number;
  importedPlayerUsernamesChanged: number;
  udiscPlayerUsernamesChanged: number;
  conflicts: number;
  holesPlayedReadBack: Array<{
    id: string;
    holesPlayed: number;
    didNotFinish: boolean;
    holeCount: number | null;
  }>;
  importedPlayerUsernameReadBack: Array<{
    id: string;
    username: string | null;
    normalizedUsername: string | null;
  }>;
  udiscPlayerUsernameReadBack: Array<{
    id: string;
    username: string;
    normalizedUsername: string | null;
  }>;
  requestedScorecardsReadBack: Array<{
    scorecardId: string;
    clubhouseId: string;
    clubhouseName: string;
  }>;
};

function collisionGroups<T>(rows: readonly T[], keyOf: (row: T) => string | null): number {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

export async function backfillImportedScorecards(
  transaction: Prisma.TransactionClient,
): Promise<ScorecardBackfillResult> {
  let conflicts = 0;
  const legacyCards = await transaction.importedScorecard.findMany({
    where: { clubhouseId: { not: null } },
    select: { id: true, clubhouseId: true },
  });
  const legacyLinks = legacyCards.flatMap((card) =>
    card.clubhouseId ? [{ scorecardId: card.id, clubhouseId: card.clubhouseId }] : [],
  );
  const legacyClubhouseLinksCreated = legacyLinks.length
    ? (
        await transaction.importedScorecardClubhouse.createMany({
          data: legacyLinks,
          skipDuplicates: true,
        })
      ).count
    : 0;

  const oldPlayers = await transaction.importedScorecardPlayer.findMany({
    where: { holesPlayed: 0, didNotFinish: false },
    select: { id: true, scorecard: { select: { holeCount: true } } },
  });
  let holesPlayedBackfilled = 0;
  const holesPlayedIds: string[] = [];
  for (const player of oldPlayers) {
    const holeCount = player.scorecard.holeCount;
    if (holeCount === null || holeCount < 1) {
      conflicts += 1;
      continue;
    }
    const changed = await transaction.importedScorecardPlayer.updateMany({
      where: { id: player.id, holesPlayed: 0, didNotFinish: false },
      data: { holesPlayed: holeCount, didNotFinish: false },
    });
    holesPlayedBackfilled += changed.count;
    if (changed.count) holesPlayedIds.push(player.id);
  }

  const unnormalizedImportedPlayers = await transaction.importedScorecardPlayer.findMany({
    where: {
      OR: [{ normalizedUsername: null }, { normalizedUsername: '' }],
    },
    select: { id: true, username: true, normalizedUsername: true, scorecardId: true },
  });
  let importedPlayerUsernamesChanged = 0;
  const importedPlayerIds: string[] = [];
  for (const player of unnormalizedImportedPlayers) {
    const normalizedUsername = player.username ? normalizeUDiscUsername(player.username) : '';
    if (!normalizedUsername) {
      conflicts += 1;
      continue;
    }
    const changed = await transaction.importedScorecardPlayer.updateMany({
      where: { id: player.id, normalizedUsername: player.normalizedUsername },
      data: { normalizedUsername },
    });
    importedPlayerUsernamesChanged += changed.count;
    if (changed.count) importedPlayerIds.push(player.id);
  }

  const unnormalizedUDiscPlayers = await transaction.uDiscPlayer.findMany({
    where: {
      OR: [{ normalizedUsername: null }, { normalizedUsername: '' }],
    },
    select: { id: true, username: true, normalizedUsername: true },
  });
  let udiscPlayerUsernamesChanged = 0;
  const udiscPlayerIds: string[] = [];
  for (const player of unnormalizedUDiscPlayers) {
    const normalizedUsername = normalizeUDiscUsername(player.username);
    if (!normalizedUsername) {
      conflicts += 1;
      continue;
    }
    const changed = await transaction.uDiscPlayer.updateMany({
      where: { id: player.id, normalizedUsername: player.normalizedUsername },
      data: { normalizedUsername },
    });
    udiscPlayerUsernamesChanged += changed.count;
    if (changed.count) udiscPlayerIds.push(player.id);
  }

  const existingUDiscPlayers = await transaction.uDiscPlayer.findMany({
    select: { username: true, normalizedUsername: true },
  });
  conflicts += collisionGroups(
    existingUDiscPlayers,
    (player) => player.normalizedUsername ?? normalizeUDiscUsername(player.username),
  );
  const existingImportedPlayers = await transaction.importedScorecardPlayer.findMany({
    where: { username: { not: null } },
    select: { scorecardId: true, username: true, normalizedUsername: true },
  });
  conflicts += collisionGroups(existingImportedPlayers, (player) => {
    if (!player.username) return null;
    const normalized = player.normalizedUsername ?? normalizeUDiscUsername(player.username);
    return `${player.scorecardId}\u0000${normalized}`;
  });

  const matchingClubhouses = await transaction.clubhouse.findMany({
    where: { name: requestedClubhouseName },
    select: { id: true, name: true },
  });
  let namedClubhouseLinksCreated = 0;
  let requestedScorecardsReadBack: ScorecardBackfillResult['requestedScorecardsReadBack'] = [];
  if (matchingClubhouses.length !== 1) {
    conflicts += 1;
  } else {
    const clubhouse = matchingClubhouses[0];
    if (clubhouse) {
      const cards = await transaction.importedScorecard.findMany({
        where: { scorecardId: { in: namedCards.map((card) => card.scorecardId) } },
        select: { id: true, scorecardId: true, courseName: true, clubhouseId: true },
      });
      const links: Array<{ scorecardId: string; clubhouseId: string }> = [];
      for (const requested of namedCards) {
        const card = cards.find((row) => row.scorecardId === requested.scorecardId);
        if (
          !card ||
          !card.courseName
            ?.toLocaleLowerCase('en-US')
            .includes(requested.courseName.toLocaleLowerCase('en-US'))
        ) {
          conflicts += 1;
          continue;
        }
        links.push({ scorecardId: card.id, clubhouseId: clubhouse.id });
        if (card.clubhouseId === null) {
          await transaction.importedScorecard.updateMany({
            where: { id: card.id, clubhouseId: null },
            data: { clubhouseId: clubhouse.id },
          });
        }
      }
      if (links.length) {
        namedClubhouseLinksCreated = (
          await transaction.importedScorecardClubhouse.createMany({
            data: links,
            skipDuplicates: true,
          })
        ).count;
      }
      const readback = await transaction.importedScorecardClubhouse.findMany({
        where: { scorecardId: { in: links.map((link) => link.scorecardId) } },
        include: {
          scorecard: { select: { scorecardId: true } },
          clubhouse: { select: { id: true, name: true } },
        },
      });
      requestedScorecardsReadBack = readback
        .filter((link) => link.clubhouse.name === requestedClubhouseName)
        .map((link) => ({
          scorecardId: link.scorecard.scorecardId,
          clubhouseId: link.clubhouse.id,
          clubhouseName: link.clubhouse.name,
        }));
    }
  }

  const [holesPlayedReadBack, importedPlayerUsernameReadBack, udiscPlayerUsernameReadBack] =
    await Promise.all([
      holesPlayedIds.length
        ? transaction.importedScorecardPlayer.findMany({
            where: { id: { in: holesPlayedIds } },
            select: {
              id: true,
              holesPlayed: true,
              didNotFinish: true,
              scorecard: { select: { holeCount: true } },
            },
          })
        : Promise.resolve([]),
      importedPlayerIds.length
        ? transaction.importedScorecardPlayer.findMany({
            where: { id: { in: importedPlayerIds } },
            select: { id: true, username: true, normalizedUsername: true },
          })
        : Promise.resolve([]),
      udiscPlayerIds.length
        ? transaction.uDiscPlayer.findMany({
            where: { id: { in: udiscPlayerIds } },
            select: { id: true, username: true, normalizedUsername: true },
          })
        : Promise.resolve([]),
    ]);
  conflicts += holesPlayedReadBack.filter(
    (row) => row.didNotFinish || row.holesPlayed !== row.scorecard.holeCount,
  ).length;
  conflicts += importedPlayerUsernameReadBack.filter(
    (row) => !row.username || row.normalizedUsername !== normalizeUDiscUsername(row.username),
  ).length;
  conflicts += udiscPlayerUsernameReadBack.filter(
    (row) => row.normalizedUsername !== normalizeUDiscUsername(row.username),
  ).length;

  return {
    legacyClubhouseLinksCreated,
    namedClubhouseLinksCreated,
    holesPlayedBackfilled,
    importedPlayerUsernamesChanged,
    udiscPlayerUsernamesChanged,
    conflicts,
    holesPlayedReadBack: holesPlayedReadBack.map(({ scorecard, ...row }) => ({
      ...row,
      holeCount: scorecard.holeCount,
    })),
    importedPlayerUsernameReadBack,
    udiscPlayerUsernameReadBack,
    requestedScorecardsReadBack,
  };
}
