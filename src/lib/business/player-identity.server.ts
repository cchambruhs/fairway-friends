// @polsia:user-owned — exact UDisc identity lookup and linking, server-only.

import 'server-only';
import type { Prisma } from '@prisma/client';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import type { PlayerIdentityChoice } from '@/lib/contracts/player-identity';
import { prisma } from '@/lib/db';

type IdentityLookupClient = Pick<
  Prisma.TransactionClient,
  'uDiscPlayer' | 'importedScorecardPlayer'
>;

export class PlayerIdentityConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayerIdentityConflict';
  }
}

export async function findUDiscRecords(client: IdentityLookupClient, normalizedUsername: string) {
  const [players, entries] = await Promise.all([
    client.uDiscPlayer.findMany({
      where: { OR: [{ normalizedUsername }, { normalizedUsername: null }] },
      select: { id: true, username: true, normalizedUsername: true },
    }),
    client.importedScorecardPlayer.findMany({
      where: {
        username: { not: null },
        OR: [{ normalizedUsername }, { normalizedUsername: null }],
      },
      select: { id: true, username: true, displayName: true, normalizedUsername: true },
    }),
  ]);
  const matchingPlayers = players.filter(
    (player) => normalizeUDiscUsername(player.username) === normalizedUsername,
  );
  const matchingEntries = entries.filter(
    (entry) =>
      entry.username !== null && normalizeUDiscUsername(entry.username) === normalizedUsername,
  );
  const displayNames = [
    ...new Set(
      matchingEntries
        .flatMap((entry) => (entry.displayName?.trim() ? [entry.displayName.trim()] : []))
        .sort((left, right) => left.localeCompare(right)),
    ),
  ];
  return {
    players: matchingPlayers,
    entries: matchingEntries,
    displayNames,
    exists: matchingPlayers.length > 0 || matchingEntries.length > 0,
  };
}

export async function linkIdentityHistory(
  transaction: Prisma.TransactionClient,
  identityId: string,
  normalizedUsername: string,
): Promise<void> {
  const matches = await findUDiscRecords(transaction, normalizedUsername);
  if (matches.players.length > 0) {
    await transaction.uDiscPlayer.updateMany({
      where: { id: { in: matches.players.map((player) => player.id) } },
      data: { normalizedUsername },
    });
  }
  if (matches.entries.length > 0) {
    await transaction.importedScorecardPlayer.updateMany({
      where: { id: { in: matches.entries.map((entry) => entry.id) } },
      data: { identityId, normalizedUsername },
    });
  }
}

export async function registerPlayerIdentity(
  transaction: Prisma.TransactionClient,
  user: { id: string; name: string },
  choice: PlayerIdentityChoice,
) {
  const normalizedUsername = normalizeUDiscUsername(choice.username);
  if (!normalizedUsername) throw new PlayerIdentityConflict('Enter a valid UDisc username.');

  const [matches, prior] = await Promise.all([
    findUDiscRecords(transaction, normalizedUsername),
    transaction.uDiscIdentity.findUnique({ where: { normalizedUsername } }),
  ]);

  if (prior?.ownerUserId === user.id) {
    return {
      identity: {
        id: prior.id,
        username: choice.username,
        status: 'verified' as const,
        claimStatus: 'approved' as const,
      },
    };
  }
  if (prior?.pendingClaimUserId === user.id) {
    return {
      identity: {
        id: prior.id,
        username: choice.username,
        status: 'pending' as const,
        claimStatus: 'pending' as const,
      },
    };
  }
  if (prior?.ownerUserId || prior?.pendingClaimUserId) {
    throw new PlayerIdentityConflict('This UDisc username is already claimed or awaiting review.');
  }
  if (choice.mode === 'claim' && !matches.exists) {
    throw new PlayerIdentityConflict('No saved UDisc player matches that exact username.');
  }
  if (choice.mode === 'create' && (matches.exists || prior)) {
    throw new PlayerIdentityConflict('A saved player already matches. Choose the claim option.');
  }

  const udiscPlayerId = matches.players[0]?.id ?? null;
  let identityId = prior?.id;
  if (!prior) {
    const identity = await transaction.uDiscIdentity.create({
      data: {
        normalizedUsername,
        udiscPlayerId,
        ...(choice.mode === 'claim' ? { pendingClaimUserId: user.id } : { ownerUserId: user.id }),
      },
      select: { id: true },
    });
    identityId = identity.id;
  } else {
    const reserved = await transaction.uDiscIdentity.updateMany({
      where: {
        id: prior.id,
        ownerUserId: null,
        pendingClaimUserId: null,
      },
      data: {
        ...(udiscPlayerId ? { udiscPlayerId } : {}),
        ...(choice.mode === 'claim' ? { pendingClaimUserId: user.id } : { ownerUserId: user.id }),
      },
    });
    if (reserved.count !== 1) {
      throw new PlayerIdentityConflict('This UDisc username was claimed by another account.');
    }
    identityId = prior.id;
  }
  if (!identityId) throw new PlayerIdentityConflict('The player identity could not be saved.');

  await transaction.playerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, displayName: user.name.trim() || 'Fairway Friends player' },
  });

  if (choice.mode === 'claim') {
    await transaction.playerClaim.create({
      data: { identityId, claimantUserId: user.id },
    });
  }
  // A pending claim must not associate saved scorecards with the claimant's account.
  // The admin approval transaction performs the historical link after ownership is granted.
  if (choice.mode === 'create') {
    await linkIdentityHistory(transaction, identityId, normalizedUsername);
  }

  return {
    identity: {
      id: identityId,
      username: choice.username,
      status: choice.mode === 'claim' ? ('pending' as const) : ('verified' as const),
      claimStatus: choice.mode === 'claim' ? ('pending' as const) : ('none' as const),
    },
  };
}

export async function completePlayerRegistration(user: {
  id: string;
  name: string;
  email: string;
}) {
  const email = user.email.trim().toLocaleLowerCase('en-US');
  const choice = await prisma.playerRegistrationChoice.findUnique({ where: { email } });
  if (!choice || choice.expiresAt.getTime() <= Date.now()) return false;

  await prisma.$transaction(async (transaction) => {
    await registerPlayerIdentity(transaction, user, {
      username: choice.username,
      mode: choice.mode === 'claim' ? 'claim' : 'create',
    });
    await transaction.playerRegistrationChoice.deleteMany({ where: { email } });
  });
  return true;
}
