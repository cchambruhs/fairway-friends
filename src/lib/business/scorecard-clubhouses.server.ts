// @polsia:user-owned — transaction helpers for additive and replacement Clubhouse links.
import 'server-only';
import type { Prisma } from '@prisma/client';

export async function addScorecardClubhouseLinks(
  transaction: Prisma.TransactionClient,
  scorecardId: string,
  clubhouseIds: readonly string[],
): Promise<number> {
  if (clubhouseIds.length === 0) return 0;
  const result = await transaction.importedScorecardClubhouse.createMany({
    data: [...new Set(clubhouseIds)].map((clubhouseId) => ({ scorecardId, clubhouseId })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function replaceScorecardClubhouseLinks(
  transaction: Prisma.TransactionClient,
  scorecardId: string,
  clubhouseId: string | null,
): Promise<void> {
  await transaction.importedScorecardClubhouse.deleteMany({ where: { scorecardId } });
  if (clubhouseId) {
    await addScorecardClubhouseLinks(transaction, scorecardId, [clubhouseId]);
  }
}
