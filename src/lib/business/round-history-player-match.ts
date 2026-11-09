// @polsia:user-owned — explicit or PDGA-verified matching to the signed-in player's profile.

import type { HistoricalRoundPlayerInput } from '@/lib/contracts/round-history';

function normalizePdgaNumber(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleUpperCase('en-US')
    .replace(/[^A-Z0-9]/gu, '');
}

export function matchCurrentProfilePlayer(
  players: readonly HistoricalRoundPlayerInput[],
  _displayName: string | null,
  pdgaNumber: string | null = null,
): { players: HistoricalRoundPlayerInput[]; score?: number } {
  const normalizedPdgaNumber = pdgaNumber ? normalizePdgaNumber(pdgaNumber) : null;
  const explicitMatches = players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.matchedToCurrentProfile);
  const pdgaMatches = normalizedPdgaNumber
    ? players
        .map((player, index) => ({ player, index }))
        .filter(
          ({ player }) =>
            player.pdgaNumber !== undefined &&
            normalizePdgaNumber(player.pdgaNumber) === normalizedPdgaNumber,
        )
    : [];
  let matchedIndex: number | undefined;
  if (explicitMatches.length === 1) {
    matchedIndex = explicitMatches[0]?.index;
  } else if (explicitMatches.length === 0 && pdgaMatches.length === 1) {
    matchedIndex = pdgaMatches[0]?.index;
  }
  const matchedPlayer = matchedIndex === undefined ? undefined : players[matchedIndex];
  const score = matchedPlayer?.totalScore;

  return {
    players: players.map((player, index) => ({
      ...player,
      matchedToCurrentProfile: matchedIndex === index,
    })),
    ...(score !== undefined ? { score } : {}),
  };
}
