// @polsia:user-owned — the one write path for imported scorecards (CardCast, CSV, legacy migration).
import 'server-only';
import { Prisma } from '@prisma/client';
import { importedScorecardFingerprint } from '@/lib/business/imported-scorecard';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import { addScorecardClubhouseLinks } from '@/lib/business/scorecard-clubhouses.server';
import type { ImportedScorecardDraft } from '@/lib/contracts/imported-scorecard';

export interface PersistImportedScorecardInput {
  card: ImportedScorecardDraft;
  importedByUserId: string | null;
  clubhouseIds?: readonly string[];
}

export type PersistImportedScorecardResult =
  | { status: 'created'; id: string }
  | { status: 'duplicate'; id: string };

/**
 * Saves a validated scorecard draft inside the caller's transaction.
 *
 * Duplicate-safe: an existing card with the same UDisc scorecard id, source URL or score
 * fingerprint is returned as a duplicate (with any new Clubhouse links added) instead of
 * creating a second card. Players are matched by normalized UDisc username, never by
 * display name. The caller owns the transaction, so a failure writes nothing.
 */
export async function persistImportedScorecard(
  transaction: Prisma.TransactionClient,
  { card, importedByUserId, clubhouseIds = [] }: PersistImportedScorecardInput,
): Promise<PersistImportedScorecardResult> {
  const { scorecardId, sourceUrl } = card;
  const fingerprint = importedScorecardFingerprint(card);
  const existing = await transaction.importedScorecard.findFirst({
    where: { OR: [{ scorecardId }, { sourceUrl }, { fingerprint }] },
    select: { id: true },
  });
  if (existing) {
    await addScorecardClubhouseLinks(transaction, existing.id, [...clubhouseIds]);
    return { status: 'duplicate', id: existing.id };
  }

  const playerIds = new Map<string, string>();
  const identityIds = new Map<string, string>();
  const normalizedUsernames = new Map<string, string>();
  for (const player of card.players) {
    if (!player.username) continue;
    const normalizedUsername = normalizeUDiscUsername(player.username);
    const identity = await transaction.uDiscIdentity.upsert({
      where: { normalizedUsername },
      create: { normalizedUsername },
      update: {},
      select: { id: true, udiscPlayerId: true, ownerUserId: true },
    });
    const existingPlayers = await transaction.uDiscPlayer.findMany({
      where: { OR: [{ normalizedUsername }, { normalizedUsername: null }] },
      select: { id: true, username: true, normalizedUsername: true },
    });
    const playerRecord = existingPlayers.find(
      (candidate) => normalizeUDiscUsername(candidate.username) === normalizedUsername,
    );
    let record: { id: string };
    if (playerRecord) {
      record = await transaction.uDiscPlayer.update({
        where: { id: playerRecord.id },
        data: { normalizedUsername },
        select: { id: true },
      });
    } else {
      await transaction.uDiscPlayer.createMany({
        data: [{ username: player.username, normalizedUsername }],
        skipDuplicates: true,
      });
      const exactPlayer = await transaction.uDiscPlayer.findUnique({
        where: { username: player.username },
        select: { id: true },
      });
      if (!exactPlayer) throw new Error('udisc_player_save_failed');
      record = exactPlayer;
    }
    if (!identity.udiscPlayerId) {
      await transaction.uDiscIdentity.updateMany({
        where: { id: identity.id, udiscPlayerId: null },
        data: { udiscPlayerId: record.id },
      });
    }
    playerIds.set(player.username, record.id);
    // Pending claims remain unlinked until an app admin approves them.
    if (identity.ownerUserId) identityIds.set(player.username, identity.id);
    normalizedUsernames.set(player.username, normalizedUsername);
  }

  const created = await transaction.importedScorecard.create({
    data: {
      scorecardId,
      sourceUrl,
      fingerprint,
      courseName: card.courseName,
      courseUrl: card.courseUrl,
      layoutName: card.layoutName,
      playedOn: card.playedOn ? new Date(`${card.playedOn}T00:00:00.000Z`) : null,
      location: card.location,
      holeCount: card.holeCount,
      totalPar: card.totalPar,
      pars: card.pars ?? Prisma.DbNull,
      importedByUserId,
      clubhouseId: clubhouseIds.length === 1 ? (clubhouseIds[0] ?? null) : null,
      players: {
        create: card.players.map((player, sourceOrder) => ({
          sourceOrder,
          displayName: player.displayName,
          username: player.username,
          normalizedUsername: player.username
            ? (normalizedUsernames.get(player.username) ?? null)
            : null,
          ...(player.username && playerIds.has(player.username)
            ? { udiscPlayerId: playerIds.get(player.username) }
            : {}),
          ...(player.username && identityIds.has(player.username)
            ? { identityId: identityIds.get(player.username) }
            : {}),
          holeScores: player.holeScores,
          totalScore: player.totalScore,
          toPar: player.toPar,
          holesPlayed:
            player.holesPlayed ?? player.holeScores.filter((score) => score !== null).length,
          didNotFinish: player.didNotFinish ?? player.holeScores.some((score) => score === null),
          position: player.position,
        })),
      },
    },
    select: { id: true },
  });
  await addScorecardClubhouseLinks(transaction, created.id, [...clubhouseIds]);
  return { status: 'created', id: created.id };
}

export function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
