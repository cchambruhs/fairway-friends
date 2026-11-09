// @polsia:user-owned — aggregate validated public scorecards without identity-name merging.

import { importedScorecardFingerprint } from '@/lib/business/imported-scorecard';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import type { GlobalStatMetric, GlobalStatsResponse } from '@/lib/contracts/global-stats';
import { ImportedScorecardDraftSchema } from '@/lib/contracts/imported-scorecard';

export type GlobalStatsHoleLength = {
  number: number;
  lengthFeet: number | null;
  lengthVerifiedAt: Date | null;
  lengthVerifiedByUserId: string | null;
};

export type GlobalStatsPlayerRecord = {
  id: string;
  identityId: string | null;
  identityOwnerUserId: string | null;
  normalizedUsername: string | null;
  displayName: string | null;
  username: string | null;
  holeScores: unknown;
  holesPlayed: number;
  didNotFinish: boolean;
  totalScore: number;
  toPar: number | null;
  position: string | null;
};

export type GlobalStatsCardRecord = {
  id: string;
  scorecardId: string;
  sourceUrl: string;
  fingerprint: string;
  courseName: string | null;
  courseUrl: string | null;
  layoutName: string | null;
  playedOn: Date | null;
  location: string | null;
  holeCount: number | null;
  totalPar: number | null;
  pars: unknown;
  clubhouseName: string | null;
  leagueName: string | null;
  hasVerifiedChanges?: boolean;
  courseHoles: readonly GlobalStatsHoleLength[];
  players: readonly GlobalStatsPlayerRecord[];
};

type Play = {
  card: GlobalStatsCardRecord;
  player: GlobalStatsPlayerRecord;
  playerKey: string;
  label: string;
  profileHref: string | null;
  scores: Array<number | null>;
  pars: Array<number | null>;
  holes: Array<{
    number: number;
    score: number;
    par: number | null;
    distanceFeet: number | null;
    metricKeys: Set<GlobalStatMetric>;
  }>;
};

const metrics: GlobalStatMetric[] = [
  'aces',
  'eagles',
  'birdies',
  'pars',
  'bogeys',
  'doubleBogeys',
  'triplePlusBogeys',
  'distanceFeet',
  'holesPlayed',
  'roundsPlayed',
  'uniquePlayers',
  'strokesThrown',
];

function metricKeysFor(score: number, par: number | null): Set<GlobalStatMetric> {
  const keys = new Set<GlobalStatMetric>(['holesPlayed', 'strokesThrown']);
  if (score === 1) keys.add('aces');
  if (par === null) return keys;
  const delta = score - par;
  if (delta <= -2) keys.add('eagles');
  else if (delta === -1) keys.add('birdies');
  else if (delta === 0) keys.add('pars');
  else if (delta === 1) keys.add('bogeys');
  else if (delta === 2) keys.add('doubleBogeys');
  else if (delta >= 3) keys.add('triplePlusBogeys');
  return keys;
}

function identityKey(player: GlobalStatsPlayerRecord): string {
  if (player.identityId) return `identity:${player.identityId}`;
  const username = player.normalizedUsername ?? normalizeUDiscUsername(player.username ?? '');
  if (username) return `udisc:${username}`;
  return `entry:${player.id}`;
}

function profileHref(player: GlobalStatsPlayerRecord): string | null {
  if (player.identityOwnerUserId)
    return `/players/user/${encodeURIComponent(player.identityOwnerUserId)}`;
  if (player.username) return `/players/udisc/${encodeURIComponent(player.username)}`;
  return null;
}

function validatedCard(
  card: GlobalStatsCardRecord,
): { pars: Array<number | null>; scores: Map<string, Array<number | null>> } | null {
  const parsedPars = Array.isArray(card.pars) ? card.pars : null;
  const players = card.players.map((player) => ({
    displayName: player.displayName,
    username: player.username,
    holeScores: player.holeScores,
    holesPlayed: player.holesPlayed,
    didNotFinish: player.didNotFinish,
    totalScore: player.totalScore,
    toPar: player.toPar,
    position: player.position,
  }));
  const draft = ImportedScorecardDraftSchema.safeParse({
    scorecardId: card.scorecardId,
    sourceUrl: card.sourceUrl,
    courseName: card.courseName,
    courseUrl: card.courseUrl,
    layoutName: card.layoutName,
    playedOn: card.playedOn?.toISOString().slice(0, 10) ?? null,
    location: card.location,
    holeCount: card.holeCount,
    pars: parsedPars,
    totalPar: card.totalPar,
    players,
  });
  if (!draft.success || !players.length) return null;
  let sourceId = '';
  try {
    const source = new URL(card.sourceUrl);
    if (source.protocol !== 'https:' || source.hostname !== 'udisc.com') return null;
    sourceId = source.pathname.split('/').at(-1) ?? '';
  } catch {
    return null;
  }
  if (!sourceId || card.scorecardId !== sourceId) return null;
  if (importedScorecardFingerprint(draft.data) !== card.fingerprint) return null;
  const firstPlayerScores = draft.data.players[0]?.holeScores;
  const holeCount = card.holeCount ?? parsedPars?.length ?? firstPlayerScores?.length ?? 0;
  if (holeCount < 1 || (parsedPars && parsedPars.length !== holeCount)) return null;
  const pars = parsedPars
    ? parsedPars.map((par) => (typeof par === 'number' ? par : null))
    : Array.from({ length: holeCount }, () => null);
  const scores = new Map<string, Array<number | null>>();
  for (const [index, player] of card.players.entries()) {
    const sourcePlayer = draft.data.players[index];
    if (!sourcePlayer || sourcePlayer.holeScores.length !== holeCount) return null;
    if (player.username && !normalizeUDiscUsername(player.username)) return null;
    scores.set(player.id, sourcePlayer.holeScores);
  }
  return { pars, scores };
}

function contribution(card: GlobalStatsCardRecord, metric: GlobalStatMetric): number {
  if (metric === 'roundsPlayed') return 1;
  return card.players.reduce((sum, player) => {
    const scores = Array.isArray(player.holeScores) ? player.holeScores : [];
    const pars = Array.isArray(card.pars) ? card.pars : [];
    return (
      sum +
      scores.reduce((count, score, index) => {
        if (typeof score !== 'number') return count;
        const par = pars[index];
        return (
          count + (metricKeysFor(score, typeof par === 'number' ? par : null).has(metric) ? 1 : 0)
        );
      }, 0)
    );
  }, 0);
}

export function aggregateGlobalStats(
  sourceCards: readonly GlobalStatsCardRecord[],
  selectedMetric: GlobalStatMetric,
  updatedAt = new Date(),
): GlobalStatsResponse {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const seenFingerprints = new Set<string>();
  const accepted: Array<{
    card: GlobalStatsCardRecord;
    pars: Array<number | null>;
    plays: Play[];
  }> = [];

  for (const card of sourceCards) {
    if (
      seenIds.has(card.scorecardId) ||
      seenUrls.has(card.sourceUrl) ||
      seenFingerprints.has(card.fingerprint)
    )
      continue;
    const validated = validatedCard(card);
    if (!validated) continue;
    const plays: Play[] = [];
    let allValid = true;
    for (const player of card.players) {
      const scores = validated.scores.get(player.id);
      if (!scores) {
        allValid = false;
        break;
      }
      const key = identityKey(player);
      const holes = scores.flatMap((score, index) => {
        if (score === null) return [];
        const par = validated.pars[index] ?? null;
        const verifiedLength = card.courseHoles.find((hole) => hole.number === index + 1);
        const distanceFeet =
          verifiedLength?.lengthFeet &&
          verifiedLength.lengthVerifiedAt &&
          verifiedLength.lengthVerifiedByUserId
            ? verifiedLength.lengthFeet
            : null;
        const metricKeys = metricKeysFor(score, typeof par === 'number' ? par : null);
        if (distanceFeet !== null) metricKeys.add('distanceFeet');
        return [
          {
            number: index + 1,
            score,
            par: typeof par === 'number' ? par : null,
            distanceFeet,
            metricKeys,
          },
        ];
      });
      plays.push({
        card,
        player,
        playerKey: key,
        label:
          player.displayName?.trim() ||
          (player.username ? `@${player.username}` : 'Unlinked player'),
        profileHref: profileHref(player),
        scores,
        pars: validated.pars,
        holes,
      });
    }
    if (allValid && plays.length) {
      seenIds.add(card.scorecardId);
      seenUrls.add(card.sourceUrl);
      seenFingerprints.add(card.fingerprint);
      accepted.push({ card, pars: validated.pars, plays });
    }
  }

  const metricTotals: Record<GlobalStatMetric, number> = {
    aces: 0,
    eagles: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doubleBogeys: 0,
    triplePlusBogeys: 0,
    distanceFeet: 0,
    holesPlayed: 0,
    roundsPlayed: accepted.length,
    uniquePlayers: 0,
    strokesThrown: 0,
  };
  const allPlayerKeys = new Set<string>();
  for (const row of accepted) {
    for (const play of row.plays) {
      allPlayerKeys.add(play.playerKey);
      for (const hole of play.holes) {
        metricTotals.holesPlayed += 1;
        metricTotals.strokesThrown += hole.score;
        if (hole.distanceFeet !== null) metricTotals.distanceFeet += hole.distanceFeet;
        for (const metric of metrics) {
          if (
            metric !== 'roundsPlayed' &&
            metric !== 'uniquePlayers' &&
            metric !== 'distanceFeet' &&
            metric !== 'holesPlayed' &&
            metric !== 'strokesThrown' &&
            hole.metricKeys.has(metric)
          ) {
            metricTotals[metric] += 1;
          }
        }
      }
    }
  }
  metricTotals.uniquePlayers = allPlayerKeys.size;

  const metricPlays = accepted.flatMap((row) => row.plays.map((play) => ({ row, play })));
  const matchingPlays = metricPlays.filter(({ play }) =>
    selectedMetric === 'uniquePlayers'
      ? allPlayerKeys.has(play.playerKey)
      : selectedMetric === 'roundsPlayed'
        ? true
        : play.holes.some((hole) => hole.metricKeys.has(selectedMetric)),
  );
  const playerTotals = new Map<
    string,
    {
      key: string;
      label: string;
      username: string | null;
      profileHref: string | null;
      cards: Set<string>;
      holes: number;
      strokes: number;
    }
  >();
  for (const { row, play } of matchingPlays) {
    const entry = playerTotals.get(play.playerKey) ?? {
      key: play.playerKey,
      label: play.label,
      username: play.player.username,
      profileHref: play.profileHref,
      cards: new Set<string>(),
      holes: 0,
      strokes: 0,
    };
    entry.cards.add(row.card.scorecardId);
    for (const hole of play.holes) {
      if (
        selectedMetric === 'roundsPlayed' ||
        selectedMetric === 'uniquePlayers' ||
        hole.metricKeys.has(selectedMetric)
      ) {
        entry.holes += 1;
        entry.strokes += hole.score;
      }
    }
    playerTotals.set(play.playerKey, entry);
  }
  const players = [...playerTotals.values()]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((player) => ({
      key: player.key,
      label: player.label,
      username: player.username,
      profileHref: player.profileHref,
      rounds: player.cards.size,
      holes: player.holes,
      strokes: player.strokes,
    }));
  const interestedKeys = new Set(players.map((player) => player.key));
  const matchingCards = accepted.filter(({ card, plays }) => {
    if (selectedMetric === 'roundsPlayed') return true;
    if (selectedMetric === 'uniquePlayers')
      return plays.some((play) => interestedKeys.has(play.playerKey));
    return contribution(card, selectedMetric) > 0;
  });
  const scorecards = matchingCards.map(({ card, plays, pars }) => ({
    id: card.id,
    scorecardId: card.scorecardId,
    sourceUrl: card.sourceUrl,
    courseName: card.courseName,
    layoutName: card.layoutName,
    playedOn: card.playedOn?.toISOString().slice(0, 10) ?? null,
    holeCount: card.holeCount,
    clubhouseName: card.clubhouseName,
    leagueName: card.leagueName,
    hasVerifiedChanges: card.hasVerifiedChanges ?? false,
    players: plays
      .filter((play) => selectedMetric !== 'uniquePlayers' || interestedKeys.has(play.playerKey))
      .map((play) => ({
        key: play.playerKey,
        entryId: play.player.id,
        label: play.label,
        username: play.player.username,
        profileHref: play.profileHref,
        holesPlayed: play.scores.filter((score) => score !== null).length,
        didNotFinish: play.player.didNotFinish,
        holeCount: card.holeCount,
        totalScore:
          play.scores.filter((score) => score !== null).length > 0
            ? play.scores.reduce<number>((sum, score) => sum + (score ?? 0), 0)
            : null,
        holes: play.holes.map((hole, index) => ({
          number: hole.number,
          score: hole.score,
          par: pars[index] ?? null,
          distanceFeet: hole.distanceFeet,
          contributes:
            selectedMetric === 'roundsPlayed' ||
            selectedMetric === 'uniquePlayers' ||
            hole.metricKeys.has(selectedMetric),
        })),
      })),
  }));

  return {
    updatedAt: updatedAt.toISOString(),
    metrics: metricTotals,
    selectedMetric,
    contributors: { players, scorecards },
  };
}
