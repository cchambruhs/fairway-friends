// @polsia:user-owned — owner rule: every card is public, but a player may hide their name.
//
// A hidden player is shown as "Player N", where N is their place on that card's player list
// (1-based source order). Their display name, UDisc username and profile link are removed.
// Hiding applies only to players who have claimed their UDisc identity, because only a
// signed-in owner can turn it on.

export const HIDDEN_PLAYER_CONTRIBUTOR_LABEL = 'Hidden player';

export function hiddenPlayerLabel(cardPosition: number): string {
  return `Player ${cardPosition}`;
}

export function isPublicNameHidden(
  identityOwnerUserId: string | null | undefined,
  hiddenOwnerIds: ReadonlySet<string>,
): boolean {
  return Boolean(identityOwnerUserId && hiddenOwnerIds.has(identityOwnerUserId));
}

export interface MaskablePlayer {
  identityOwnerUserId: string | null;
  normalizedUsername: string | null;
  displayName: string | null;
  username: string | null;
}

/**
 * Masks hidden players on one card's player list (already in source order). Grouping keys
 * that do not contain the name (the identity id) are untouched by the caller; name-bearing
 * fields are cleared here so they can never reach a public response.
 */
export function maskHiddenPublicNames<T extends MaskablePlayer>(
  players: readonly T[],
  hiddenOwnerIds: ReadonlySet<string>,
): Array<T & { hidden: boolean }> {
  return players.map((player, index) =>
    isPublicNameHidden(player.identityOwnerUserId, hiddenOwnerIds)
      ? {
          ...player,
          displayName: hiddenPlayerLabel(index + 1),
          username: null,
          normalizedUsername: null,
          identityOwnerUserId: null,
          hidden: true,
        }
      : { ...player, hidden: false },
  );
}
