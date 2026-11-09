// @polsia:user-owned — scorecard edit snapshots and player-row replacement in one transaction.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import type { ImportedScorecardDraft } from '@/lib/contracts/imported-scorecard';
import type { ScorecardEditDraft } from '@/lib/contracts/scorecard-governance';

type ScorecardRow = {
  courseName: string | null;
  courseUrl: string | null;
  layoutName: string | null;
  playedOn: Date | null;
  location: string | null;
  holeCount: number | null;
  totalPar: number | null;
  pars: Prisma.JsonValue | null;
  courseLayoutId: string | null;
  players: Array<{
    displayName: string | null;
    username: string | null;
    holeScores: Prisma.JsonValue;
    holesPlayed: number;
    didNotFinish: boolean;
    totalScore: number;
    toPar: number | null;
    position: string | null;
  }>;
};

export function scorecardEditDraftFromRow(row: ScorecardRow): ScorecardEditDraft {
  return {
    courseName: row.courseName,
    courseUrl: row.courseUrl,
    layoutName: row.layoutName,
    playedOn: row.playedOn?.toISOString().slice(0, 10) ?? null,
    location: row.location,
    holeCount: row.holeCount,
    totalPar: row.totalPar,
    pars: Array.isArray(row.pars)
      ? row.pars.map((value) => (typeof value === 'number' ? value : null))
      : null,
    courseLayoutId: row.courseLayoutId,
    players: row.players.map((player) => ({
      displayName: player.displayName,
      username: player.username,
      holeScores: Array.isArray(player.holeScores)
        ? player.holeScores.map((value) => (typeof value === 'number' ? value : null))
        : [],
      totalScore: player.totalScore,
      toPar: player.toPar,
      position: player.position,
      holesPlayed: player.holesPlayed,
      didNotFinish: player.didNotFinish,
    })),
  };
}

export function recomputeScorecardEditMetrics(snapshot: ScorecardEditDraft): ScorecardEditDraft {
  const completePars = snapshot.pars?.every((par) => par !== null) ?? false;
  const totalPar = completePars
    ? (snapshot.pars?.reduce<number>((total, par) => total + (par ?? 0), 0) ?? null)
    : snapshot.totalPar;
  const totals = snapshot.players.map((player) =>
    player.holeScores.reduce<number>((total, score) => total + (score ?? 0), 0),
  );
  const completed = snapshot.players.map(
    (player) =>
      player.holeScores.filter((score) => score !== null).length ===
      (snapshot.holeCount ?? player.holeScores.length),
  );
  const completedTotals = totals.filter((_, index) => completed[index]);

  return {
    ...snapshot,
    totalPar,
    players: snapshot.players.map((player, index) => {
      const totalScore = totals[index] ?? 0;
      const didNotFinish = !completed[index];
      const rank = 1 + completedTotals.filter((score) => score < totalScore).length;
      const tied = completedTotals.filter((score) => score === totalScore).length > 1;
      const playedPars = player.holeScores.flatMap((score, holeIndex) => {
        const par = snapshot.pars?.[holeIndex];
        return score !== null && typeof par === 'number' ? [par] : [];
      });
      const holesPlayed = player.holeScores.filter((score) => score !== null).length;
      const toPar =
        holesPlayed === 0
          ? null
          : totalPar !== null && !didNotFinish
            ? totalScore - totalPar
            : playedPars.length === holesPlayed
              ? totalScore - playedPars.reduce((sum, par) => sum + par, 0)
              : null;
      return {
        ...player,
        totalScore,
        holesPlayed,
        didNotFinish,
        toPar,
        position: didNotFinish ? null : tied ? `T${rank}` : String(rank),
      };
    }),
  };
}

export function importedDraftFromEdit(
  scorecardId: string,
  sourceUrl: string,
  snapshot: ScorecardEditDraft,
): ImportedScorecardDraft {
  return {
    scorecardId,
    sourceUrl,
    courseName: snapshot.courseName,
    courseUrl: snapshot.courseUrl,
    layoutName: snapshot.layoutName,
    playedOn: snapshot.playedOn,
    location: snapshot.location,
    holeCount: snapshot.holeCount,
    totalPar: snapshot.totalPar,
    pars: snapshot.pars,
    players: snapshot.players.map((player) => ({
      ...player,
      position: player.position,
    })),
  };
}

export async function replaceScorecardPlayers(
  transaction: Prisma.TransactionClient,
  scorecardId: string,
  players: ImportedScorecardDraft['players'],
): Promise<void> {
  await transaction.importedScorecardPlayer.deleteMany({ where: { scorecardId } });
  const totals = players.map((player) => player.totalScore);

  for (const [sourceOrder, player] of players.entries()) {
    const normalizedUsername = player.username ? normalizeUDiscUsername(player.username) : null;
    let udiscPlayerId: string | undefined;
    let identityId: string | undefined;
    if (player.username && normalizedUsername) {
      const identity = await transaction.uDiscIdentity.upsert({
        where: { normalizedUsername },
        create: { normalizedUsername },
        update: {},
        select: { id: true, udiscPlayerId: true, ownerUserId: true },
      });
      const existingPlayer =
        (await transaction.uDiscPlayer.findFirst({
          where: { normalizedUsername },
          select: { id: true },
        })) ??
        (await transaction.uDiscPlayer.findUnique({
          where: { username: player.username },
          select: { id: true },
        }));
      const udiscPlayer = existingPlayer
        ? await transaction.uDiscPlayer.update({
            where: { id: existingPlayer.id },
            data: { normalizedUsername },
            select: { id: true },
          })
        : await transaction.uDiscPlayer.create({
            data: { username: player.username, normalizedUsername },
            select: { id: true },
          });
      udiscPlayerId = udiscPlayer.id;
      if (identity.ownerUserId) identityId = identity.id;
      if (!identity.udiscPlayerId) {
        await transaction.uDiscIdentity.updateMany({
          where: { id: identity.id, udiscPlayerId: null },
          data: { udiscPlayerId: udiscPlayer.id },
        });
      }
    }
    const holesPlayed = player.holeScores.filter((score) => score !== null).length;
    const didNotFinish = holesPlayed < player.holeScores.length;
    const completedTotals = totals.filter((_, index) => {
      const other = players[index];
      return other?.holeScores.every((score) => score !== null) ?? false;
    });
    const position = 1 + completedTotals.filter((score) => score < player.totalScore).length;
    const tied = completedTotals.filter((score) => score === player.totalScore).length > 1;
    await transaction.importedScorecardPlayer.create({
      data: {
        scorecardId,
        sourceOrder,
        displayName: player.displayName,
        username: player.username,
        normalizedUsername,
        ...(udiscPlayerId ? { udiscPlayerId } : {}),
        ...(identityId ? { identityId } : {}),
        holeScores: player.holeScores,
        totalScore: player.totalScore,
        toPar: player.toPar,
        holesPlayed,
        didNotFinish,
        position: didNotFinish ? null : tied ? `T${position}` : String(position),
      },
    });
  }
}
