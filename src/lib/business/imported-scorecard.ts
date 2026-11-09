// @polsia:user-owned — stable global fingerprints and public scorecard serialization.
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  type ImportedScorecardDraft,
  type ImportedScorecardItem,
  ImportedScorecardItemSchema,
} from '@/lib/contracts/imported-scorecard';

export type ImportedScorecardWithPlayers = Prisma.ImportedScorecardGetPayload<{
  include: {
    players: { orderBy: { sourceOrder: 'asc' } };
    clubhouseLinks: { include: { clubhouse: true } };
  };
}> & {
  league?: { name: string } | null;
  leagueId?: string | null;
  courseLayoutId?: string | null;
  editRequests?: Array<{ id: string }>;
};

export function importedScorecardFingerprint(card: ImportedScorecardDraft): string {
  const players = [...card.players]
    .sort((left, right) => {
      const leftUsername = left.username ?? '';
      const rightUsername = right.username ?? '';
      if (leftUsername !== rightUsername) return leftUsername < rightUsername ? -1 : 1;
      return JSON.stringify(left.holeScores).localeCompare(JSON.stringify(right.holeScores));
    })
    .map((player) => ({ username: player.username, scores: player.holeScores }));
  const canonical = JSON.stringify({
    layout: card.layoutName,
    date: card.playedOn,
    pars: card.pars,
    players,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function importedScorecardItem(
  row: ImportedScorecardWithPlayers,
  canReassign = false,
  canDelete = false,
): ImportedScorecardItem {
  const clubhouseLinks = [...row.clubhouseLinks].sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.clubhouseId.localeCompare(right.clubhouseId),
  );
  return ImportedScorecardItemSchema.parse({
    id: row.id,
    scorecardId: row.scorecardId,
    sourceUrl: row.sourceUrl,
    courseName: row.courseName,
    courseUrl: row.courseUrl,
    layoutName: row.layoutName,
    playedOn: row.playedOn?.toISOString().slice(0, 10) ?? null,
    location: row.location,
    holeCount: row.holeCount,
    pars: row.pars,
    totalPar: row.totalPar,
    players: row.players.map((player) => ({
      id: player.id,
      displayName: player.displayName,
      username: player.username,
      holeScores: player.holeScores,
      totalScore: player.totalScore,
      toPar: player.toPar,
      position: player.position,
      holesPlayed: player.holesPlayed,
      didNotFinish: player.didNotFinish,
    })),
    createdAt: row.createdAt.toISOString(),
    clubhouseId: clubhouseLinks[0]?.clubhouseId ?? null,
    clubhouseName: clubhouseLinks[0]?.clubhouse.name ?? null,
    clubhouseIds: clubhouseLinks.map((link) => link.clubhouseId),
    clubhouseNames: clubhouseLinks.map((link) => link.clubhouse.name),
    leagueId: row.leagueId ?? null,
    leagueName: row.league?.name ?? null,
    courseLayoutId: row.courseLayoutId ?? null,
    hasVerifiedChanges: (row.editRequests?.length ?? 0) > 0,
    canDelete,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    canReassign,
  });
}
