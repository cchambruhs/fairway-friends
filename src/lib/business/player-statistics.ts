// @polsia:user-owned — unofficial statistics derived from finalized saved scorecards.

import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import type {
  ImportedScorecardItem,
  ImportedScorecardPlayer,
} from '@/lib/contracts/imported-scorecard';
import type { PublicPlayerProfile } from '@/lib/contracts/player-identity';

type Appearance = { card: ImportedScorecardItem; player: ImportedScorecardPlayer };

function placementRank(position: string | null): number | null {
  if (!position) return null;
  const match = /^T?\s*(\d+)(?:st|nd|rd|th)?$/iu.exec(position.trim());
  const value = match?.[1] ? Number(match[1]) : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

function dateOrder(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareAppearances(left: Appearance, right: Appearance): number {
  const leftDate = dateOrder(left.card.playedOn);
  const rightDate = dateOrder(right.card.playedOn);
  if (leftDate !== null && rightDate !== null && leftDate !== rightDate) {
    return leftDate - rightDate;
  }
  if (leftDate !== null && rightDate === null) return -1;
  if (leftDate === null && rightDate !== null) return 1;
  return left.card.createdAt.localeCompare(right.card.createdAt);
}

function playerEntriesByIdentity(
  card: ImportedScorecardItem,
  identities: ReadonlySet<string>,
): Map<string, ImportedScorecardPlayer> {
  const entries = new Map<string, ImportedScorecardPlayer>();
  for (const player of card.players) {
    if (!player.username) continue;
    const username = normalizeUDiscUsername(player.username);
    if (username && identities.has(username) && !entries.has(username)) {
      entries.set(username, player);
    }
  }
  return entries;
}

function roundToPar(card: ImportedScorecardItem, player: ImportedScorecardPlayer): number | null {
  if (player.toPar !== null) return player.toPar;
  if (player.didNotFinish && card.pars?.length === player.holeScores.length) {
    if (player.holesPlayed === 0) return null;
    const playedPars = player.holeScores.flatMap((score, index) =>
      score !== null && typeof card.pars?.[index] === 'number' ? [card.pars[index] ?? 0] : [],
    );
    return playedPars.length === player.holesPlayed
      ? player.totalScore - playedPars.reduce((sum, par) => sum + par, 0)
      : null;
  }
  if (card.totalPar !== null) return player.totalScore - card.totalPar;
  if (card.pars?.length === player.holeScores.length && card.pars.every((par) => par !== null)) {
    return player.totalScore - card.pars.reduce((total, par) => total + (par ?? 0), 0);
  }
  return null;
}

function completeUnderParStreak(appearances: readonly Appearance[]): number | null {
  if (appearances.length === 0) return null;
  let longest = 0;
  for (const { card, player } of appearances) {
    if (
      !card.pars ||
      card.pars.length !== player.holeScores.length ||
      card.pars.some((par) => par === null)
    ) {
      return null;
    }
    let current = 0;
    player.holeScores.forEach((score, index) => {
      const par = card.pars?.[index];
      if (score !== null && par !== null && par !== undefined && score < par) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    });
  }
  return longest;
}

function completeCompetitionWinStreak(appearances: readonly Appearance[]): number | null {
  if (
    appearances.length === 0 ||
    appearances.some(
      ({ card, player }) => !card.playedOn || placementRank(player.position) === null,
    )
  ) {
    return null;
  }
  let longest = 0;
  let current = 0;
  for (const { player } of [...appearances].sort(compareAppearances)) {
    if (placementRank(player.position) === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function courseLayoutKey(card: ImportedScorecardItem): string | null {
  if (!card.courseUrl || !card.layoutName?.trim()) return null;
  try {
    const url = new URL(card.courseUrl);
    if (url.protocol !== 'https:') return null;
    const courseIdentity = `${url.origin.toLocaleLowerCase('en-US')}${url.pathname
      .normalize('NFKC')
      .replace(/\/+$/u, '')
      .toLocaleLowerCase('en-US')}`;
    const layoutIdentity = card.layoutName.normalize('NFKC').trim().toLocaleLowerCase('en-US');
    return `${courseIdentity}\u0000${layoutIdentity}`;
  } catch {
    return null;
  }
}

function buildAchievements(
  statistics: PublicPlayerProfile['statistics'],
): PublicPlayerProfile['achievements'] {
  const achievements: PublicPlayerProfile['achievements'] = [];
  if (statistics.lifetimeRounds >= 1) {
    achievements.push({
      id: 'first-finalized-round',
      title: 'First finalized round',
      criteria: 'Earned after 1 finalized, identity-linked scorecard.',
    });
  }
  if (statistics.lifetimeRounds >= 10) {
    achievements.push({
      id: 'ten-finalized-rounds',
      title: 'Ten rounds played',
      criteria: 'Earned after 10 finalized, identity-linked scorecards.',
    });
  }
  if (statistics.wins !== null && statistics.wins >= 1) {
    achievements.push({
      id: 'first-recorded-win',
      title: 'First recorded win',
      criteria: 'Earned when a finalized scorecard records a first-place finish, including a tie.',
    });
  }
  if (statistics.aces !== null && statistics.aces >= 1) {
    achievements.push({
      id: 'first-ace',
      title: 'Ace recorded',
      criteria: 'Earned when a finalized scorecard contains a saved hole score of 1.',
    });
  }
  if (statistics.birdies !== null && statistics.birdies >= 25) {
    achievements.push({
      id: 'twenty-five-birdies',
      title: '25 birdies recorded',
      criteria: 'Earned after 25 saved holes score exactly one under a known par.',
    });
  }
  return achievements;
}

export function buildPublicPlayerProfile(input: {
  displayName: string;
  username: string | null;
  identityStatus: 'verified' | 'pending' | 'unclaimed';
  identifiedUsernames: readonly string[];
  cards: readonly ImportedScorecardItem[];
}): PublicPlayerProfile {
  const identities = new Set(
    input.identifiedUsernames.map(normalizeUDiscUsername).filter((username) => username.length > 0),
  );
  const normalized = input.username ? normalizeUDiscUsername(input.username) : null;
  const identifiedTarget = normalized !== null && identities.has(normalized);
  const finalizedCardsById = new Map<string, ImportedScorecardItem>();
  for (const card of input.cards) {
    if (card.finalizedAt !== null && !finalizedCardsById.has(card.scorecardId)) {
      finalizedCardsById.set(card.scorecardId, card);
    }
  }
  const finalizedCards = [...finalizedCardsById.values()];
  const appearances: Appearance[] = identifiedTarget
    ? finalizedCards.flatMap((card) => {
        const player = playerEntriesByIdentity(card, identities).get(normalized);
        return player ? [{ card, player }] : [];
      })
    : [];
  const fullRoundAppearances = appearances.filter(({ player }) => !player.didNotFinish);
  const scores = fullRoundAppearances.map(({ player }) => player.totalScore);
  const placements = fullRoundAppearances
    .map(({ player }) => placementRank(player.position))
    .filter((rank): rank is number => rank !== null);
  const wins = placements.length === 0 ? null : placements.filter((rank) => rank === 1).length;
  const toParRounds = appearances
    .map(({ card, player }) => roundToPar(card, player))
    .filter((toPar): toPar is number => toPar !== null);
  const knownHoleResults = appearances.flatMap(({ card, player }) =>
    player.holeScores.flatMap((score, index) => {
      const par = card.pars?.[index];
      return score === null || par === null || par === undefined ? [] : [{ score, par }];
    }),
  );
  const birdies = knownHoleResults.filter(({ score, par }) => score === par - 1).length;
  const eagles = knownHoleResults.filter(({ score, par }) => score === par - 2).length;
  const totalScoredHoles = appearances.reduce((total, { player }) => total + player.holesPlayed, 0);
  const aces = appearances.reduce(
    (total, { player }) => total + player.holeScores.filter((score) => score === 1).length,
    0,
  );

  const clubhouseTotals = new Map<
    string,
    {
      clubhouseId: string;
      clubhouseName: string;
      players: Map<
        string,
        { rounds: number; wins: number; scoreTotal: number; placements: number }
      >;
    }
  >();
  for (const card of finalizedCards) {
    const links = card.clubhouseIds?.length
      ? card.clubhouseIds.map((clubhouseId, index) => ({
          clubhouseId,
          clubhouseName: card.clubhouseNames?.[index] ?? card.clubhouseName,
        }))
      : card.clubhouseId && card.clubhouseName
        ? [{ clubhouseId: card.clubhouseId, clubhouseName: card.clubhouseName }]
        : [];
    for (const link of links) {
      if (!link.clubhouseName) continue;
      let clubhouse = clubhouseTotals.get(link.clubhouseId);
      if (!clubhouse) {
        clubhouse = {
          clubhouseId: link.clubhouseId,
          clubhouseName: link.clubhouseName,
          players: new Map(),
        };
        clubhouseTotals.set(link.clubhouseId, clubhouse);
      }
      for (const [username, player] of playerEntriesByIdentity(card, identities)) {
        if (player.didNotFinish) continue;
        const total = clubhouse.players.get(username) ?? {
          rounds: 0,
          wins: 0,
          scoreTotal: 0,
          placements: 0,
        };
        total.rounds += 1;
        total.scoreTotal += player.totalScore;
        const rank = placementRank(player.position);
        if (rank !== null) {
          total.placements += 1;
          if (rank === 1) total.wins += 1;
        }
        clubhouse.players.set(username, total);
      }
    }
  }
  const clubhouseRankings = identifiedTarget
    ? [...clubhouseTotals.values()].flatMap((clubhouse) => {
        const leaderboard = [...clubhouse.players.entries()]
          .map(([username, total]) => ({
            username,
            rounds: total.rounds,
            wins: total.wins,
            placements: total.placements,
            averageScore: Number((total.scoreTotal / total.rounds).toFixed(2)),
          }))
          .sort(
            (left, right) =>
              right.wins - left.wins ||
              left.averageScore - right.averageScore ||
              right.rounds - left.rounds ||
              left.username.localeCompare(right.username),
          );
        const rankByUsername = new Map<string, number>();
        let rank = 0;
        let prior: (typeof leaderboard)[number] | undefined;
        leaderboard.forEach((entry, index) => {
          if (!prior || entry.wins !== prior.wins || entry.averageScore !== prior.averageScore) {
            rank = index + 1;
          }
          rankByUsername.set(entry.username, rank);
          prior = entry;
        });
        const player = clubhouse.players.get(normalized);
        const playerRank = rankByUsername.get(normalized);
        return player && playerRank
          ? [
              {
                clubhouseId: clubhouse.clubhouseId,
                clubhouseName: clubhouse.clubhouseName,
                rank: playerRank,
                rounds: player.rounds,
                wins: player.placements > 0 ? player.wins : null,
                averageScore: Number((player.scoreTotal / player.rounds).toFixed(2)),
              },
            ]
          : [];
      })
    : [];

  const courseResults = new Map<string, Appearance[]>();
  for (const card of finalizedCards) {
    const key = courseLayoutKey(card);
    if (!key || !card.courseName) continue;
    for (const player of playerEntriesByIdentity(card, identities).values()) {
      const results = courseResults.get(key) ?? [];
      results.push({ card, player });
      courseResults.set(key, results);
    }
  }
  const courseRecords: PublicPlayerProfile['courseRecords'] = [];
  if (identifiedTarget) {
    for (const [key, results] of courseResults) {
      const distinctCards = new Set(results.map(({ card }) => card.scorecardId));
      if (distinctCards.size < 2) continue;
      const completedResults = results.filter(({ player }) => !player.didNotFinish);
      if (!completedResults.length) continue;
      const bestScore = Math.min(...completedResults.map(({ player }) => player.totalScore));
      const recordHolders = completedResults.filter(
        ({ player }) => player.totalScore === bestScore,
      );
      if (
        !recordHolders.some(
          (result) => normalizeUDiscUsername(result.player.username ?? '') === normalized,
        )
      ) {
        continue;
      }
      const supporting = recordHolders
        .filter((result) => normalizeUDiscUsername(result.player.username ?? '') === normalized)
        .sort(compareAppearances)[0];
      if (!supporting || !supporting.card.courseName) continue;
      const tiedPlayers = new Set(
        recordHolders
          .map(({ player }) => (player.username ? normalizeUDiscUsername(player.username) : ''))
          .filter((username) => username.length > 0),
      );
      const [, layoutName] = key.split('\u0000');
      courseRecords.push({
        courseName: supporting.card.courseName,
        layoutName: supporting.card.layoutName ?? layoutName ?? null,
        score: bestScore,
        playedOn: supporting.card.playedOn,
        scorecardId: supporting.card.scorecardId,
        sourceUrl: supporting.card.sourceUrl,
        comparisonRounds: distinctCards.size,
        tiedPlayerCount: tiedPlayers.size,
      });
    }
  }

  const rivalsByUsername = new Map<
    string,
    {
      displayName: string;
      sharedRounds: number;
      wins: number;
      losses: number;
      ties: number;
      sharedCards: PublicPlayerProfile['rivals'][number]['sharedCards'];
    }
  >();
  if (identifiedTarget) {
    for (const card of finalizedCards) {
      const entries = playerEntriesByIdentity(card, identities);
      const ownPlayer = entries.get(normalized);
      if (!ownPlayer) continue;
      if (ownPlayer.didNotFinish) continue;
      for (const [username, rival] of entries) {
        if (username === normalized) continue;
        if (rival.didNotFinish) continue;
        const result = rivalsByUsername.get(username) ?? {
          displayName: rival.displayName ?? rival.username ?? username,
          sharedRounds: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          sharedCards: [],
        };
        result.sharedRounds += 1;
        if (ownPlayer.totalScore < rival.totalScore) result.wins += 1;
        else if (ownPlayer.totalScore > rival.totalScore) result.losses += 1;
        else result.ties += 1;
        result.sharedCards.push({
          scorecardId: card.scorecardId,
          courseName: card.courseName,
          playedOn: card.playedOn,
          sourceUrl: card.sourceUrl,
          playerScore: ownPlayer.totalScore,
          rivalScore: rival.totalScore,
        });
        rivalsByUsername.set(username, result);
      }
    }
  }
  const rivals = [...rivalsByUsername.entries()]
    .map(([username, rival]) => ({
      username,
      displayName: rival.displayName,
      profileHref: `/players/udisc/${encodeURIComponent(username)}`,
      sharedRounds: rival.sharedRounds,
      wins: rival.wins,
      losses: rival.losses,
      ties: rival.ties,
      sharedCards: [...rival.sharedCards].sort((left, right) => {
        const leftDate = dateOrder(left.playedOn);
        const rightDate = dateOrder(right.playedOn);
        if (leftDate !== null && rightDate !== null) return rightDate - leftDate;
        if (leftDate !== null) return -1;
        if (rightDate !== null) return 1;
        return left.scorecardId.localeCompare(right.scorecardId);
      }),
    }))
    .sort(
      (left, right) =>
        right.sharedRounds - left.sharedRounds || left.displayName.localeCompare(right.displayName),
    );

  const orderedAppearances = [...appearances].sort(compareAppearances);
  const bestRounds = [...fullRoundAppearances]
    .sort(
      (left, right) =>
        left.player.totalScore - right.player.totalScore || compareAppearances(right, left),
    )
    .slice(0, 5)
    .map(({ card }) => card);
  const datedAppearances = orderedAppearances.filter(
    ({ card }) => dateOrder(card.playedOn) !== null,
  );
  const statistics: PublicPlayerProfile['statistics'] = {
    lifetimeRounds: appearances.length,
    wins,
    winPercentage:
      placements.length === 0 || wins === null
        ? null
        : Number(((wins / placements.length) * 100).toFixed(1)),
    averageScore:
      scores.length === 0
        ? null
        : Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)),
    averageToPar:
      toParRounds.length === 0
        ? null
        : Number(
            (toParRounds.reduce((sum, toPar) => sum + toPar, 0) / toParRounds.length).toFixed(2),
          ),
    bestScore: scores.length === 0 ? null : Math.min(...scores),
    bestPlacement: placements.length === 0 ? null : Math.min(...placements),
    roundsWithPlacement: placements.length,
    birdies: knownHoleResults.length === 0 ? null : birdies,
    eagles: knownHoleResults.length === 0 ? null : eagles,
    knownParHoles: knownHoleResults.length,
    unknownParHoles: Math.max(0, totalScoredHoles - knownHoleResults.length),
    aces: appearances.length === 0 ? null : aces,
    longestUnderParHoleStreak: completeUnderParStreak(appearances),
    longestCompetitionWinStreak: completeCompetitionWinStreak(appearances),
    savedCourseRecords: courseRecords.length,
    undatedRounds: appearances.length - datedAppearances.length,
  };

  return {
    displayName: input.displayName,
    username: input.username,
    identityStatus: input.identityStatus,
    statistics,
    clubhouseRankings,
    bestRounds,
    courseRecords,
    achievements: buildAchievements(statistics),
    rivals,
    performance: datedAppearances
      .filter(({ player }) => !player.didNotFinish)
      .map(({ card, player }) => ({
        playedOn: card.playedOn,
        courseName: card.courseName,
        score: player.totalScore,
      })),
    rounds: appearances.map(({ card }) => card),
  };
}
