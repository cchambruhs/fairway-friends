> **Fairway Friends update, part 1 (code): piece 2 of 3.** Do not apply anything until you have received all 3 pieces in this chat; then apply them together, following the ground rules in piece 1.

### `tests/unit/legacy-chatgpt-scorecard.test.ts` — full file

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  convertLegacyChatGptRound,
  type LegacyChatGptRound,
  legacyCourseUrl,
  legacyRoundsFrom,
} from '@/lib/business/legacy-chatgpt-scorecard';

const seed = JSON.parse(readFileSync(join(process.cwd(), 'data/legacy-chatgpt/seed.json'), 'utf8'));
const rounds = legacyRoundsFrom(seed);

describe('legacy ChatGPT scorecard conversion', () => {
  it('converts every bundled seed card with the live importer validation', () => {
    expect(rounds).toHaveLength(22);
    const failures = rounds.map(convertLegacyChatGptRound).filter((result) => !result.ok);
    expect(failures).toEqual([]);
  });

  it('reproduces the PRD Angel Mounds reference card exactly', () => {
    const round = rounds.find((item) => item.id === 'scorecard_mns8y9vb4afhk4v7lafcmk8n');
    expect(round).toBeDefined();
    const result = convertLegacyChatGptRound(round as LegacyChatGptRound);
    if (!result.ok) throw new Error(result.reason);
    const { card } = result;
    expect(card.courseName).toBe('Angel Mounds Disc Golf Course');
    expect(card.layoutName).toBe('Blue Tees');
    expect(card.playedOn).toBe('2026-10-20');
    expect(card.holeCount).toBe(18);
    expect(card.totalPar).toBe(55);
    expect(
      card.players.map((player) => [player.username, player.totalScore, player.toPar]),
    ).toEqual([
      ['devin47', 45, -10],
      ['cchambruhs', 46, -9],
      ['mdub1807', 50, -5],
      ['rashad032', 51, -4],
      ['mk3492', 53, -2],
    ]);
  });

  it('never invents a location or finishing position', () => {
    const result = convertLegacyChatGptRound(rounds[0] as LegacyChatGptRound);
    if (!result.ok) throw new Error(result.reason);
    expect(result.card.location).toBeNull();
    expect(result.card.players.every((player) => player.position === null)).toBe(true);
  });

  it('keeps unfinished rounds as did-not-finish with missing holes empty', () => {
    const base = rounds[0] as LegacyChatGptRound;
    const pars = base.pars;
    const scores = pars.map((par, index) => (index < 12 ? (par ?? 3) : null));
    const total = scores.reduce<number>((sum, score) => sum + (score ?? 0), 0);
    const playedPar = pars.slice(0, 12).reduce<number>((sum, par) => sum + (par ?? 0), 0);
    const result = convertLegacyChatGptRound({
      ...base,
      players: [
        {
          username: 'example',
          name: 'Example',
          scores,
          total,
          relative: total - playedPar,
          complete: false,
          holesPlayed: 12,
        },
      ],
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.card.players[0]?.didNotFinish).toBe(true);
    expect(result.card.players[0]?.holesPlayed).toBe(12);
  });

  it('rejects a card whose totals do not add up instead of saving it', () => {
    const base = rounds[0] as LegacyChatGptRound;
    const first = base.players[0];
    if (!first) throw new Error('fixture has no players');
    const result = convertLegacyChatGptRound({
      ...base,
      players: [{ ...first, total: first.total + 1 }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-UDisc link', () => {
    const base = rounds[0] as LegacyChatGptRound;
    const result = convertLegacyChatGptRound({ ...base, url: 'https://example.com/scorecards/x' });
    expect(result.ok).toBe(false);
  });

  it('derives the course page only from the source layout path', () => {
    expect(
      legacyCourseUrl('/courses/angel-mounds-disc-golf-course-dJv8/layouts/58398/caddie-book'),
    ).toBe('https://udisc.com/courses/angel-mounds-disc-golf-course-dJv8');
    expect(legacyCourseUrl(null)).toBeNull();
    expect(legacyCourseUrl('https://evil.example/courses/x')).toBeNull();
  });
});
```

### `tests/unit/public-name-privacy.test.ts` — full file

```ts
import { describe, expect, it } from 'vitest';
import {
  hiddenPlayerLabel,
  isPublicNameHidden,
  maskHiddenPublicNames,
} from '@/lib/business/public-name-privacy';

const players = [
  {
    identityOwnerUserId: 'u-dad',
    normalizedUsername: 'cchambruhs',
    displayName: 'Dad',
    username: 'cchambruhs',
  },
  {
    identityOwnerUserId: 'u-devin',
    normalizedUsername: 'devin47',
    displayName: 'Devin',
    username: 'devin47',
  },
  {
    identityOwnerUserId: null,
    normalizedUsername: 'mk3492',
    displayName: 'TG',
    username: 'mk3492',
  },
];

describe('public name hiding', () => {
  it('shows a hidden player as Player N by their place on the card', () => {
    const masked = maskHiddenPublicNames(players, new Set(['u-devin']));
    expect(masked[1]).toMatchObject({
      displayName: 'Player 2',
      username: null,
      normalizedUsername: null,
      identityOwnerUserId: null,
      hidden: true,
    });
  });

  it('leaves everyone else untouched', () => {
    const masked = maskHiddenPublicNames(players, new Set(['u-devin']));
    expect(masked[0]).toMatchObject({ displayName: 'Dad', username: 'cchambruhs', hidden: false });
    expect(masked[2]).toMatchObject({ displayName: 'TG', username: 'mk3492', hidden: false });
  });

  it('cannot hide an unclaimed player, because only an owner can opt out', () => {
    expect(isPublicNameHidden(null, new Set(['u-devin']))).toBe(false);
    expect(hiddenPlayerLabel(3)).toBe('Player 3');
  });

  it('never leaks the name anywhere in the masked record', () => {
    const masked = maskHiddenPublicNames(players, new Set(['u-dad']));
    expect(JSON.stringify(masked[0])).not.toMatch(/cchambruhs|Dad/);
  });
});
```

## Modified files

### `prisma/schema/player-preferences.prisma` — full file

```prisma
// @polsia:user-owned — private per-player display preferences.
model PlayerPreference {
  id        String   @id @default(cuid())
  userId    String   @unique
  theme     String   @default("system")
  /// Owner decision 2026-11-09: when true, public pages show this player as "Player N" on
  /// each card (their place on that card) and never show their name or UDisc username.
  hidePublicName Boolean @default(false)
  updatedAt DateTime @updatedAt

  @@map("player_preference")
}
```

### `src/lib/contracts/player-preferences.ts` — patch

```diff
--- a/src/lib/contracts/player-preferences.ts
+++ b/src/lib/contracts/player-preferences.ts
@@ -11,3 +11,9 @@
 
 export type PlayerTheme = z.infer<typeof PlayerThemeSchema>;
 export type PlayerPreference = z.infer<typeof PlayerPreferenceSchema>;
+
+export const PublicNamePrivacySchema = z.object({
+  hidePublicName: z.boolean(),
+});
+
+export type PublicNamePrivacy = z.infer<typeof PublicNamePrivacySchema>;
```

### `src/lib/contracts/leagues.ts` — patch

```diff
--- a/src/lib/contracts/leagues.ts
+++ b/src/lib/contracts/leagues.ts
@@ -93,12 +93,15 @@
 
 const LeagueStandingSchema = z
   .object({
+    rank: z.number().int().positive(),
     playerKey: z.string(),
     userId: z.string().nullable(),
     displayName: z.string(),
     role: LeagueRoleSchema,
     points: z.number().finite(),
     wins: z.number().int().nonnegative(),
+    seconds: z.number().int().nonnegative(),
+    averagePlace: z.number().finite().nullable(),
     rounds: z.number().int().nonnegative(),
     totalStrokes: z.number().int().nonnegative(),
     averageToPar: z.number().finite().nullable(),
```

### `src/lib/business/league-scoring.ts` — full file

```ts
// @polsia:user-owned — championship points and transparent League tie-breaks (PRD v4 §5).
import type { LeagueScoringFormat } from '@/lib/contracts/leagues';

/** PRD v4 fixed placement points for 1st–10th. From 11th: one fewer per place, minimum 1. */
export const DEFAULT_FIXED_POINTS = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6] as const;

/** Field-size adjusted maximum: 25 × (N − P) / (N − 1). */
export const FIELD_SIZE_MAX_POINTS = 25;

export interface LeagueFinish {
  playerKey: string;
  totalStrokes: number;
}

export interface LeagueAward {
  playerKey: string;
  /** Competition rank: tied players share the best occupied place (1, 1, 3). */
  place: number;
  points: number;
}

/** Round to cents-style two decimals without binary drift (e.g. 1.005 → 1.01). */
export function roundPoints(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Points for one place under a fixed table, extended past its end by −1 per place (min 1). */
export function fixedPointsForPlace(place: number, table: readonly number[]): number {
  const listed = table[place - 1];
  if (listed !== undefined) return listed;
  const last = table.at(-1);
  if (last === undefined) return 0;
  return Math.max(1, last - (place - table.length));
}

/** Field-size adjusted points: one-player field gets the maximum; last place gets 0 when N > 1. */
export function fieldSizePointsForPlace(place: number, fieldSize: number): number {
  if (fieldSize <= 1) return FIELD_SIZE_MAX_POINTS;
  return (FIELD_SIZE_MAX_POINTS * (fieldSize - place)) / (fieldSize - 1);
}

export function awardLeaguePoints(
  finishes: readonly LeagueFinish[],
  format: LeagueScoringFormat,
  fixedPoints: readonly number[] = DEFAULT_FIXED_POINTS,
): LeagueAward[] {
  const ordered = [...finishes].sort(
    (left, right) =>
      left.totalStrokes - right.totalStrokes || left.playerKey.localeCompare(right.playerKey),
  );
  const fieldSize = ordered.length;
  const awards: LeagueAward[] = [];
  let cursor = 0;

  while (cursor < ordered.length) {
    const first = ordered[cursor];
    if (!first) break;
    let end = cursor + 1;
    while (end < ordered.length && ordered[end]?.totalStrokes === first.totalStrokes) end += 1;
    const place = cursor + 1;
    const occupiedPlaces = Array.from({ length: end - cursor }, (_, offset) => place + offset);
    const pointsFor = (rank: number) =>
      format === 'FIELD_SIZE'
        ? fieldSizePointsForPlace(rank, fieldSize)
        : fixedPointsForPlace(rank, fixedPoints);
    const points = roundPoints(
      occupiedPlaces.reduce((sum, rank) => sum + pointsFor(rank), 0) / occupiedPlaces.length,
    );

    for (const finish of ordered.slice(cursor, end)) {
      awards.push({ playerKey: finish.playerKey, place, points });
    }
    cursor = end;
  }
  return awards;
}

/** Season total = sum of every eligible finalized round. No drops, no missed-round points. */
export function accumulateLeaguePoints(
  playerKeys: readonly string[],
  completedRoundAwards: readonly (readonly LeagueAward[])[],
) {
  const totals = new Map<string, number>(playerKeys.map((playerKey) => [playerKey, 0]));
  for (const awards of completedRoundAwards) {
    for (const award of awards) {
      totals.set(award.playerKey, roundPoints((totals.get(award.playerKey) ?? 0) + award.points));
    }
  }
  return totals;
}

export interface LeagueStandingSortInput {
  points: number;
  wins: number;
  seconds: number;
  /** Mean competition place across counted rounds; null when no rounds. */
  averagePlace: number | null;
}

/**
 * PRD v4 season tie-breaks: points → most wins → most second places → best average placement.
 * Returns 0 when all are equal: those players share the standing.
 */
export function compareLeagueStandings(
  left: LeagueStandingSortInput,
  right: LeagueStandingSortInput,
) {
  return (
    right.points - left.points ||
    right.wins - left.wins ||
    right.seconds - left.seconds ||
    (left.averagePlace ?? Number.POSITIVE_INFINITY) -
      (right.averagePlace ?? Number.POSITIVE_INFINITY)
  );
}

/** Competition ranks (1, 1, 3) for a list already sorted with compareLeagueStandings. */
export function sharedStandingRanks<T extends LeagueStandingSortInput>(sorted: readonly T[]) {
  const ranks: number[] = [];
  sorted.forEach((standing, index) => {
    const previous = index > 0 ? sorted[index - 1] : undefined;
    const previousRank = ranks.at(-1);
    ranks.push(
      previous && previousRank !== undefined && compareLeagueStandings(previous, standing) === 0
        ? previousRank
        : index + 1,
    );
  });
  return ranks;
}

export const LEAGUE_TIE_BREAKERS = [
  'Total championship points',
  'Most round wins',
  'Most second-place finishes',
  'Best average placement',
  'Otherwise the standing is shared',
] as const;
```

### `src/lib/business/league-standings.server.ts` — patch

```diff
--- a/src/lib/business/league-standings.server.ts
+++ b/src/lib/business/league-standings.server.ts
@@ -4,6 +4,8 @@
   accumulateLeaguePoints,
   awardLeaguePoints,
   compareLeagueStandings,
+  DEFAULT_FIXED_POINTS,
+  sharedStandingRanks,
 } from '@/lib/business/league-scoring';
 import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
 import type { LeagueRole } from '@/lib/contracts/leagues';
@@ -31,6 +33,8 @@
   role: LeagueRole;
   points: number;
   wins: number;
+  seconds: number;
+  placeTotal: number;
   rounds: number;
   totalStrokes: number;
   totalToPar: number;
@@ -108,7 +112,7 @@
     Array.isArray(pointsValue) &&
     pointsValue.every((point) => typeof point === 'number' && Number.isFinite(point) && point >= 0)
       ? pointsValue
-      : [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
+      : [...DEFAULT_FIXED_POINTS];
 
   const standings = new Map<string, StandingAccumulator>();
   function ensureStanding(finish: RoundFinish): StandingAccumulator {
@@ -127,6 +131,8 @@
       role: member?.role ?? 'PLAYER',
       points: 0,
       wins: 0,
+      seconds: 0,
+      placeTotal: 0,
       rounds: 0,
       totalStrokes: 0,
       totalToPar: 0,
@@ -223,7 +229,9 @@
       standing.rounds += 1;
       standing.totalStrokes += finish.totalStrokes;
       standing.totalToPar += finish.totalToPar;
+      standing.placeTotal += award.place;
       if (award.place === 1) standing.wins += 1;
+      if (award.place === 2) standing.seconds += 1;
     }
   }
 
@@ -231,28 +239,29 @@
     standing.points = pointTotals.get(playerKey) ?? 0;
   }
 
-  return [...standings.values()]
-    .sort((left, right) =>
-      compareLeagueStandings(
-        {
-          ...left,
-          averageToPar: left.rounds ? left.totalToPar / left.rounds : null,
-        },
-        {
-          ...right,
-          averageToPar: right.rounds ? right.totalToPar / right.rounds : null,
-        },
-      ),
-    )
+  const sorted = [...standings.values()]
     .map((standing) => ({
-      playerKey: standing.playerKey,
-      userId: standing.userId,
-      displayName: standing.displayName,
-      role: standing.role,
-      points: standing.points,
-      wins: standing.wins,
-      rounds: standing.rounds,
-      totalStrokes: standing.totalStrokes,
-      averageToPar: standing.rounds ? standing.totalToPar / standing.rounds : null,
-    }));
+      ...standing,
+      averagePlace: standing.rounds ? standing.placeTotal / standing.rounds : null,
+    }))
+    .sort(
+      (left, right) =>
+        compareLeagueStandings(left, right) || left.displayName.localeCompare(right.displayName),
+    );
+  const ranks = sharedStandingRanks(sorted);
+  return sorted.map((standing, index) => ({
+    rank: ranks[index] ?? index + 1,
+    playerKey: standing.playerKey,
+    userId: standing.userId,
+    displayName: standing.displayName,
+    role: standing.role,
+    points: standing.points,
+    wins: standing.wins,
+    seconds: standing.seconds,
+    averagePlace:
+      standing.averagePlace === null ? null : Math.round(standing.averagePlace * 100) / 100,
+    rounds: standing.rounds,
+    totalStrokes: standing.totalStrokes,
+    averageToPar: standing.rounds ? standing.totalToPar / standing.rounds : null,
+  }));
 }
```

### `src/lib/business/player-identity.server.ts` — patch

```diff
--- a/src/lib/business/player-identity.server.ts
+++ b/src/lib/business/player-identity.server.ts
@@ -11,6 +11,8 @@
   'uDiscPlayer' | 'importedScorecardPlayer'
 >;
 
+export const SELF_CLAIM_NOTE = 'Self-claimed: player was unclaimed (no admin review required).';
+
 export class PlayerIdentityConflict extends Error {
   constructor(message: string) {
     super(message);
@@ -97,18 +99,20 @@
       },
     };
   }
-  if (prior?.pendingClaimUserId === user.id) {
-    return {
-      identity: {
-        id: prior.id,
-        username: choice.username,
-        status: 'pending' as const,
-        claimStatus: 'pending' as const,
-      },
-    };
+  if (prior?.ownerUserId) {
+    throw new PlayerIdentityConflict('This UDisc username is already claimed by another player.');
   }
-  if (prior?.ownerUserId || prior?.pendingClaimUserId) {
-    throw new PlayerIdentityConflict('This UDisc username is already claimed or awaiting review.');
+  if (prior?.pendingClaimUserId && prior.pendingClaimUserId !== user.id) {
+    throw new PlayerIdentityConflict('Another player has already claimed this UDisc username.');
+  }
+  const alreadyOwned = await transaction.uDiscIdentity.findUnique({
+    where: { ownerUserId: user.id },
+    select: { normalizedUsername: true },
+  });
+  if (alreadyOwned) {
+    throw new PlayerIdentityConflict(
+      `Your account is already linked to @${alreadyOwned.normalizedUsername}.`,
+    );
   }
   if (choice.mode === 'claim' && !matches.exists) {
     throw new PlayerIdentityConflict('No saved UDisc player matches that exact username.');
@@ -124,7 +128,7 @@
       data: {
         normalizedUsername,
         udiscPlayerId,
-        ...(choice.mode === 'claim' ? { pendingClaimUserId: user.id } : { ownerUserId: user.id }),
+        ownerUserId: user.id,
       },
       select: { id: true },
     });
@@ -134,11 +138,12 @@
       where: {
         id: prior.id,
         ownerUserId: null,
-        pendingClaimUserId: null,
+        OR: [{ pendingClaimUserId: null }, { pendingClaimUserId: user.id }],
       },
       data: {
         ...(udiscPlayerId ? { udiscPlayerId } : {}),
-        ...(choice.mode === 'claim' ? { pendingClaimUserId: user.id } : { ownerUserId: user.id }),
+        ownerUserId: user.id,
+        pendingClaimUserId: null,
       },
     });
     if (reserved.count !== 1) {
@@ -155,22 +160,33 @@
   });
 
   if (choice.mode === 'claim') {
-    await transaction.playerClaim.create({
-      data: { identityId, claimantUserId: user.id },
+    // Owner decision 2026-11-09: an unclaimed player can be claimed instantly, with no admin
+    // review. The claim is still recorded (auto-approved) so an admin can audit or reverse it.
+    const now = new Date();
+    const pending = await transaction.playerClaim.updateMany({
+      where: { identityId, claimantUserId: user.id, status: 'PENDING' },
+      data: { status: 'APPROVED', reviewedAt: now, reviewNote: SELF_CLAIM_NOTE },
     });
+    if (pending.count === 0) {
+      await transaction.playerClaim.create({
+        data: {
+          identityId,
+          claimantUserId: user.id,
+          status: 'APPROVED',
+          reviewedAt: now,
+          reviewNote: SELF_CLAIM_NOTE,
+        },
+      });
+    }
   }
-  // A pending claim must not associate saved scorecards with the claimant's account.
-  // The admin approval transaction performs the historical link after ownership is granted.
-  if (choice.mode === 'create') {
-    await linkIdentityHistory(transaction, identityId, normalizedUsername);
-  }
+  await linkIdentityHistory(transaction, identityId, normalizedUsername);
 
   return {
     identity: {
       id: identityId,
       username: choice.username,
-      status: choice.mode === 'claim' ? ('pending' as const) : ('verified' as const),
-      claimStatus: choice.mode === 'claim' ? ('pending' as const) : ('none' as const),
+      status: 'verified' as const,
+      claimStatus: choice.mode === 'claim' ? ('approved' as const) : ('none' as const),
     },
   };
 }
```

### `src/lib/business/global-stats.ts` — patch

```diff
--- a/src/lib/business/global-stats.ts
+++ b/src/lib/business/global-stats.ts
@@ -2,6 +2,7 @@
 
 import { importedScorecardFingerprint } from '@/lib/business/imported-scorecard';
 import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
+import { HIDDEN_PLAYER_CONTRIBUTOR_LABEL } from '@/lib/business/public-name-privacy';
 import type { GlobalStatMetric, GlobalStatsResponse } from '@/lib/contracts/global-stats';
 import { ImportedScorecardDraftSchema } from '@/lib/contracts/imported-scorecard';
 
@@ -25,6 +26,8 @@
   totalScore: number;
   toPar: number | null;
   position: string | null;
+  /** Already masked by maskHiddenPublicNames: label is "Player N", no username or profile. */
+  hidden?: boolean;
 };
 
 export type GlobalStatsCardRecord = {
@@ -316,7 +319,7 @@
   for (const { row, play } of matchingPlays) {
     const entry = playerTotals.get(play.playerKey) ?? {
       key: play.playerKey,
-      label: play.label,
+      label: play.player.hidden ? HIDDEN_PLAYER_CONTRIBUTOR_LABEL : play.label,
       username: play.player.username,
       profileHref: play.profileHref,
       cards: new Set<string>(),
```

### `src/lib/business/public-player-profile.server.ts` — patch

```diff
--- a/src/lib/business/public-player-profile.server.ts
+++ b/src/lib/business/public-player-profile.server.ts
@@ -4,10 +4,16 @@
 import { importedScorecardItem } from '@/lib/business/imported-scorecard';
 import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
 import { buildPublicPlayerProfile } from '@/lib/business/player-statistics';
+import { hiddenPlayerLabel } from '@/lib/business/public-name-privacy';
+import { loadHiddenOwnerIds } from '@/lib/business/public-name-privacy.server';
 import { mergeSavedRoundStatistics } from '@/lib/business/saved-round-statistics';
 import { prisma } from '@/lib/db';
 
-async function savedCards(leagueIds: readonly string[] = []) {
+/**
+ * Public card list for profile pages. Players who hid their public name are shown as
+ * "Player N" with no username, except to themselves (viewerUserId).
+ */
+async function savedCards(leagueIds: readonly string[] = [], viewerUserId?: string) {
   const rows = await prisma.importedScorecard.findMany({
     where: {
       finalizedAt: { not: null },
@@ -22,7 +28,46 @@
     },
     orderBy: [{ playedOn: 'asc' }, { createdAt: 'asc' }],
   });
-  return rows.map((row) => importedScorecardItem(row));
+  const identityIds = [
+    ...new Set(
+      rows.flatMap((row) =>
+        row.players.flatMap((player) => (player.identityId ? [player.identityId] : [])),
+      ),
+    ),
+  ];
+  const owners = identityIds.length
+    ? await prisma.uDiscIdentity.findMany({
+        where: { id: { in: identityIds }, ownerUserId: { not: null } },
+        select: { id: true, ownerUserId: true },
+      })
+    : [];
+  const ownerByIdentity = new Map(owners.map((identity) => [identity.id, identity.ownerUserId]));
+  const hidden = await loadHiddenOwnerIds(prisma, ownerByIdentity.values());
+  if (viewerUserId) hidden.delete(viewerUserId);
+  const hiddenEntryIds = new Set(
+    rows.flatMap((row) =>
+      row.players.flatMap((player) => {
+        const owner = player.identityId ? ownerByIdentity.get(player.identityId) : null;
+        return owner && hidden.has(owner) ? [player.id] : [];
+      }),
+    ),
+  );
+  return rows.map((row) => {
+    const item = importedScorecardItem(row);
+    if (!hiddenEntryIds.size) return item;
+    return {
+      ...item,
+      players: item.players.map((player, index) =>
+        hiddenEntryIds.has(player.id)
+          ? { ...player, displayName: hiddenPlayerLabel(index + 1), username: null }
+          : player,
+      ),
+    };
+  });
+}
+
+async function publicNameHidden(userId: string): Promise<boolean> {
+  return (await loadHiddenOwnerIds(prisma, [userId])).has(userId);
 }
 
 async function identifiedUsernames(cards: Awaited<ReturnType<typeof savedCards>>) {
@@ -82,6 +127,8 @@
 }
 
 export async function publicProfileForUser(userId: string, viewerUserId?: string) {
+  // A player who hid their public name has no public profile; they still see their own.
+  if (viewerUserId !== userId && (await publicNameHidden(userId))) return null;
   const viewerMemberships = viewerUserId
     ? await prisma.leagueMembership.findMany({
         where: { userId: viewerUserId },
@@ -154,7 +201,7 @@
     });
     return mergeSavedRoundStatistics(profile, userId, savedRoundStats);
   }
-  const cards = await savedCards(leagueIds);
+  const cards = await savedCards(leagueIds, viewerUserId);
   const knownUsernames = await identifiedUsernames(cards);
   const profile = buildPublicPlayerProfile({
     displayName: savedProfile?.displayName ?? user.name,
```

### `src/app/api/udisc-scorecards/route.ts` — patch

```diff
--- a/src/app/api/udisc-scorecards/route.ts
+++ b/src/app/api/udisc-scorecards/route.ts
@@ -1,14 +1,16 @@
 // @polsia:user-owned — signed-in users can add cards; saved imports are shared across users.
 import 'server-only';
-import { Prisma } from '@prisma/client';
+import type { Prisma } from '@prisma/client';
 import { NextResponse } from 'next/server';
 import { requirePlayerApi } from '@/lib/business/api-authorization.server';
 import {
   importedScorecardFingerprint,
   importedScorecardItem,
 } from '@/lib/business/imported-scorecard';
-import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
-import { addScorecardClubhouseLinks } from '@/lib/business/scorecard-clubhouses.server';
+import {
+  isUniqueConflict,
+  persistImportedScorecard,
+} from '@/lib/business/persist-imported-scorecard.server';
 import {
   fetchUDiscScorecard,
   UDiscScorecardFetchError,
@@ -27,10 +29,6 @@
 export const dynamic = 'force-dynamic';
 export const runtime = 'nodejs';
 
-function isUniqueConflict(error: unknown): boolean {
-  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
-}
-
 export async function GET(request: Request): Promise<Response> {
   const authorization = await requirePlayerApi(request);
   if ('response' in authorization && authorization.response) return authorization.response;
@@ -182,131 +180,38 @@
     );
   }
 
-  const fingerprint = importedScorecardFingerprint(card);
-  let createdId: string | null;
+  let createdId: string;
   try {
-    createdId = await prisma.$transaction(async (transaction) => {
+    const outcome = await prisma.$transaction(async (transaction) => {
       if (!(await checkMemberships(transaction))) throw new Error('clubhouse_membership_required');
-      const existing = await transaction.importedScorecard.findFirst({
-        where: { OR: [{ scorecardId }, { sourceUrl }, { fingerprint }] },
-        select: { id: true },
-      });
-      if (existing) {
-        await addScorecardClubhouseLinks(transaction, existing.id, clubhouseIds);
-        return `duplicate:${existing.id}`;
-      }
-
-      const playerIds = new Map<string, string>();
-      const identityIds = new Map<string, string>();
-      const normalizedUsernames = new Map<string, string>();
-      for (const player of card.players) {
-        if (!player.username) continue;
-        const normalizedUsername = normalizeUDiscUsername(player.username);
-        const identity = await transaction.uDiscIdentity.upsert({
-          where: { normalizedUsername },
-          create: { normalizedUsername },
-          update: {},
-          select: { id: true, udiscPlayerId: true, ownerUserId: true },
-        });
-        const existingPlayers = await transaction.uDiscPlayer.findMany({
-          where: { OR: [{ normalizedUsername }, { normalizedUsername: null }] },
-          select: { id: true, username: true, normalizedUsername: true },
-        });
-        const playerRecord = existingPlayers.find(
-          (candidate) => normalizeUDiscUsername(candidate.username) === normalizedUsername,
-        );
-        let record: { id: string };
-        if (playerRecord) {
-          record = await transaction.uDiscPlayer.update({
-            where: { id: playerRecord.id },
-            data: { normalizedUsername },
-            select: { id: true },
-          });
-        } else {
-          await transaction.uDiscPlayer.createMany({
-            data: [{ username: player.username, normalizedUsername }],
-            skipDuplicates: true,
-          });
-          const exactPlayer = await transaction.uDiscPlayer.findUnique({
-            where: { username: player.username },
-            select: { id: true },
-          });
-          if (!exactPlayer) throw new Error('udisc_player_save_failed');
-          record = exactPlayer;
-        }
-        if (!identity.udiscPlayerId) {
-          await transaction.uDiscIdentity.updateMany({
-            where: { id: identity.id, udiscPlayerId: null },
-            data: { udiscPlayerId: record.id },
-          });
-        }
-        playerIds.set(player.username, record.id);
-        // Pending claims remain unlinked until an app admin approves them.
-        if (identity.ownerUserId) identityIds.set(player.username, identity.id);
-        normalizedUsernames.set(player.username, normalizedUsername);
-      }
-
-      const created = await transaction.importedScorecard.create({
-        data: {
-          scorecardId,
-          sourceUrl,
-          fingerprint,
-          courseName: card.courseName,
-          courseUrl: card.courseUrl,
-          layoutName: card.layoutName,
-          playedOn: card.playedOn ? new Date(`${card.playedOn}T00:00:00.000Z`) : null,
-          location: card.location,
-          holeCount: card.holeCount,
-          totalPar: card.totalPar,
-          pars: card.pars ?? Prisma.DbNull,
-          importedByUserId: user.id,
-          clubhouseId: clubhouseIds.length === 1 ? clubhouseIds[0] : null,
-          players: {
-            create: card.players.map((player, sourceOrder) => ({
-              sourceOrder,
-              displayName: player.displayName,
-              username: player.username,
-              normalizedUsername: player.username
-                ? (normalizedUsernames.get(player.username) ?? null)
-                : null,
-              ...(player.username && playerIds.has(player.username)
-                ? { udiscPlayerId: playerIds.get(player.username) }
-                : {}),
-              ...(player.username && identityIds.has(player.username)
-                ? { identityId: identityIds.get(player.username) }
-                : {}),
-              holeScores: player.holeScores,
-              totalScore: player.totalScore,
-              toPar: player.toPar,
-              holesPlayed:
-                player.holesPlayed ?? player.holeScores.filter((score) => score !== null).length,
-              didNotFinish:
-                player.didNotFinish ?? player.holeScores.some((score) => score === null),
-              position: player.position,
-            })),
-          },
-        },
-        select: { id: true },
+      // Keep the id and URL the player submitted, exactly as before the refactor.
+      return persistImportedScorecard(transaction, {
+        card: { ...card, scorecardId, sourceUrl },
+        importedByUserId: user.id,
+        clubhouseIds,
       });
-      await addScorecardClubhouseLinks(transaction, created.id, clubhouseIds);
-      return created.id;
     });
+    if (outcome.status === 'duplicate') return saveDuplicate(outcome.id);
+    createdId = outcome.id;
   } catch (error) {
     if (error instanceof Error && error.message === 'clubhouse_membership_required') {
       return NextResponse.json({ error: 'Clubhouse membership required.' }, { status: 403 });
     }
     if (isUniqueConflict(error)) {
       const duplicate = await prisma.importedScorecard.findFirst({
-        where: { OR: [{ scorecardId }, { sourceUrl }, { fingerprint }] },
+        where: {
+          OR: [
+            { scorecardId },
+            { sourceUrl },
+            { fingerprint: importedScorecardFingerprint({ ...card, scorecardId, sourceUrl }) },
+          ],
+        },
         select: { id: true },
       });
       if (duplicate) return saveDuplicate(duplicate.id);
     }
     throw error;
   }
-  if (createdId?.startsWith('duplicate:'))
-    return saveDuplicate(createdId.slice('duplicate:'.length));
-  if (!createdId) return NextResponse.json({ error: 'Scorecard save failed.' }, { status: 500 });
 
   const saved = await prisma.importedScorecard.findUnique({
     where: { id: createdId },
```

### `src/app/api/global-stats/route.ts` — patch

```diff
--- a/src/app/api/global-stats/route.ts
+++ b/src/app/api/global-stats/route.ts
@@ -2,6 +2,8 @@
 import 'server-only';
 import { NextResponse } from 'next/server';
 import { aggregateGlobalStats, type GlobalStatsCardRecord } from '@/lib/business/global-stats';
+import { maskHiddenPublicNames } from '@/lib/business/public-name-privacy';
+import { loadHiddenOwnerIds } from '@/lib/business/public-name-privacy.server';
 import { GlobalStatMetricSchema, GlobalStatsResponseSchema } from '@/lib/contracts/global-stats';
 import { prisma } from '@/lib/db';
 
@@ -52,6 +54,7 @@
       })
     : [];
   const owners = new Map(identities.map((identity) => [identity.id, identity.ownerUserId]));
+  const hiddenOwnerIds = await loadHiddenOwnerIds(prisma, owners.values());
   const sourceCards: GlobalStatsCardRecord[] = rows.map((row) => ({
     id: row.id,
     scorecardId: row.scorecardId,
@@ -69,20 +72,23 @@
     leagueName: row.league?.name ?? null,
     hasVerifiedChanges: row.editRequests.length > 0,
     courseHoles: row.courseLayout?.holes ?? [],
-    players: row.players.map((player) => ({
-      id: player.id,
-      identityId: player.identityId,
-      identityOwnerUserId: player.identityId ? (owners.get(player.identityId) ?? null) : null,
-      normalizedUsername: player.normalizedUsername,
-      displayName: player.displayName,
-      username: player.username,
-      holeScores: player.holeScores,
-      holesPlayed: player.holesPlayed,
-      didNotFinish: player.didNotFinish,
-      totalScore: player.totalScore,
-      toPar: player.toPar,
-      position: player.position,
-    })),
+    players: maskHiddenPublicNames(
+      row.players.map((player) => ({
+        id: player.id,
+        identityId: player.identityId,
+        identityOwnerUserId: player.identityId ? (owners.get(player.identityId) ?? null) : null,
+        normalizedUsername: player.normalizedUsername,
+        displayName: player.displayName,
+        username: player.username,
+        holeScores: player.holeScores,
+        holesPlayed: player.holesPlayed,
+        didNotFinish: player.didNotFinish,
+        totalScore: player.totalScore,
+        toPar: player.toPar,
+        position: player.position,
+      })),
+      hiddenOwnerIds,
+    ),
   }));
 
   return NextResponse.json(
```

### `src/app/api/players/route.ts` — patch

```diff
--- a/src/app/api/players/route.ts
+++ b/src/app/api/players/route.ts
@@ -1,6 +1,7 @@
 // @polsia:user-owned — public player directory contains display names and verified round counts only.
 import 'server-only';
 import { NextResponse } from 'next/server';
+import { loadHiddenOwnerIds } from '@/lib/business/public-name-privacy.server';
 import { PublicPlayerDirectorySchema } from '@/lib/contracts/player-identity';
 import { prisma } from '@/lib/db';
 
@@ -40,10 +41,12 @@
     select: { id: true },
   });
   const existingUsers = new Set(users.map((user) => user.id));
+  // Players who hid their public name are left out of the public directory.
+  const hiddenUsers = await loadHiddenOwnerIds(prisma, userIds);
   return NextResponse.json(
     PublicPlayerDirectorySchema.parse({
       items: profiles
-        .filter((profile) => existingUsers.has(profile.userId))
+        .filter((profile) => existingUsers.has(profile.userId) && !hiddenUsers.has(profile.userId))
         .map((profile) => {
           const identity = identitiesByUser.get(profile.userId);
           return {
```

