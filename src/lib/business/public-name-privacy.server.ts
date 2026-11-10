// @polsia:user-owned — loads which account owners chose to hide their public name.
import 'server-only';
import type { Prisma } from '@prisma/client';

type PreferenceReader = Pick<Prisma.TransactionClient, 'playerPreference'>;

export async function loadHiddenOwnerIds(
  client: PreferenceReader,
  ownerUserIds: Iterable<string | null | undefined>,
): Promise<Set<string>> {
  const ids = [...new Set([...ownerUserIds].filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Set();
  const rows = await client.playerPreference.findMany({
    where: { userId: { in: ids }, hidePublicName: true },
    select: { userId: true },
  });
  return new Set(rows.map((row) => row.userId));
}
