// @polsia:user-owned — database serialization and authorization for saved rounds.
import 'server-only';
import type { Prisma } from '@prisma/client';
import type { SavedRoundRole } from '@/lib/business/saved-round';
import { calculateSavedRound, savedRoundPermissions } from '@/lib/business/saved-round';
import {
  type SavedRoundItem,
  SavedRoundItemSchema,
  SavedRoundStatusSchema,
  SavedRoundVerificationSchema,
} from '@/lib/contracts/saved-round';

export const savedRoundInclude = {
  participants: { orderBy: { sourceOrder: 'asc' } },
  league: { select: { name: true } },
} satisfies Prisma.SavedRoundInclude;

export type SavedRoundRecord = Prisma.SavedRoundGetPayload<{
  include: typeof savedRoundInclude;
}>;

function numberArray(value: Prisma.JsonValue): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'number')) {
    throw new Error('Saved round contains invalid hole pars.');
  }
  return value.map((item) => Number(item));
}

function scoreArray(value: Prisma.JsonValue): (number | null)[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => item !== null && (typeof item !== 'number' || !Number.isInteger(item)))
  ) {
    throw new Error('Saved round contains invalid hole scores.');
  }
  return value.map((item) => (item === null ? null : Number(item)));
}

export function savedRoundItem(
  row: SavedRoundRecord,
  viewerUserId: string,
  role: SavedRoundRole = null,
): SavedRoundItem {
  const holePars = numberArray(row.holePars);
  const scoreRows = row.participants.map((participant) => ({
    userId: participant.userId,
    holeScores: scoreArray(participant.holeScores),
  }));
  const calculated = calculateSavedRound(holePars, scoreRows);
  const computedByUserId = new Map(
    calculated.participants.map((player) => [player.userId, player]),
  );
  const isParticipant = row.participants.some((participant) => participant.userId === viewerUserId);
  const status = SavedRoundStatusSchema.parse(row.status);
  const permissions = savedRoundPermissions({
    status,
    isParticipant,
    role,
    hasLeague: row.leagueId !== null,
  });

  return SavedRoundItemSchema.parse({
    id: row.id,
    courseName: row.courseName,
    layoutName: row.layoutName,
    courseLayoutId: row.courseLayoutId,
    leagueId: row.leagueId,
    leagueName: row.league?.name ?? null,
    playedOn: row.playedOn.toISOString().slice(0, 10),
    holePars,
    totalPar: calculated.totalPar,
    status,
    verificationStatus: SavedRoundVerificationSchema.parse(row.verificationStatus),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    participants: row.participants.map((participant) => {
      const result = computedByUserId.get(participant.userId);
      if (!result) throw new Error('Saved round participant totals could not be calculated.');
      return {
        userId: participant.userId,
        displayName: participant.displayName,
        holeScores: result.holeScores,
        totalStrokes: result.totalStrokes,
        holesPlayed: result.holesPlayed,
        toPar: result.toPar,
        position: result.position,
      };
    }),
    viewer: {
      role,
      isParticipant,
      ...permissions,
    },
  });
}
