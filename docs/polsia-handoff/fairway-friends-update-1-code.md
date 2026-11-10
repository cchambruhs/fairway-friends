# Fairway Friends update — part 1 of 2: code changes

**From:** Caleb (owner), prepared by Claude Code from the owner's GitHub repo (cchambruhs/fairway-friends, PRs #1 and #2, all checks green).
**Hosting decision:** Fairway Friends stays on Polsia. Please apply these changes to the live app.

## Ground rules for applying this

1. Apply every change below exactly. Files marked **full file** replace the whole file; files marked **patch** are unified diffs against the code you exported to the owner on Nov 9, 2026. If a patch no longer applies because the file changed since then, keep the intent described in its section and tell me what differed.
2. Do **not** start the queued tasks "Sell verified league activation tiers" or "Calculate and publish deterministic season points" (100/90/80…). This update replaces the points rule, and payments stay disabled.
3. Do not touch framework-owned files. None of these changes needs to.
4. After applying: run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, then deploy. Report the results, including any failures, before starting part 2.
5. Part 2 (the scorecard import) is a separate .md file. Do not run it until part 1 is live.

## What this update does

| Change | Owner decision / PRD |
| --- | --- |
| League points follow PRD v4: fixed 25/20/16/13/11/10/9/8/7/6, then −1 per place (min 1); field-size 25 × (N − P) / (N − 1); ties average occupied places, rounded to 2 decimals; season tie-breaks wins → 2nds → average place → shared standing | PRD v4 §5 |
| "Enter the clubhouse" opens the in-app Clubhouse (`/dashboard/clubhouses`), never the old ChatGPT site | PRD v4 §2 |
| **Instant player claims:** an unclaimed UDisc player is linked to the claimant immediately, with its scorecard history; no admin review. One player per account; each claim is logged as an auto-approved PlayerClaim | Owner, Nov 9 2026 |
| **Public Complete History with name hiding:** every card is public. New account setting "Hide my name on public cards" shows that player as "Player N" (their place on each card) with no username or profile link, on public stats, profiles and the player directory. They still see their own stats; Clubhouse members still see names | Owner, Nov 9 2026 |
| One shared save function for imported scorecards (`persistImportedScorecard`), used by the CardCast route and the migration | Duplicate safety, PRD v4 §3 |
| CSV import moves into an "or paste a CSV instead" dropdown under the CardCast form; the JSON paste importer is removed | PRD v4 §3 |
| New free, friends-only fantasy league tables (schema only, no money fields) | Owner, Nov 9 2026 |
| Legacy scorecard migration script (`npm run migrate:legacy`), used in part 2 | Owner, Nov 9 2026 |

## Database

Two schema changes, both additive: `player_preference.hidePublicName` (boolean, default false) and seven new `fantasy_*` tables. Your normal `prisma db push` startup applies them with no data loss. This was verified on a restored copy of your Nov 9 export.

## package.json

Add two **devDependencies**, pinned exactly: `"server-only": "0.0.1"` and `"tsx": "4.19.2"`. Add one script:

```json
"migrate:legacy": "node --conditions=react-server --import tsx scripts/migrate-legacy-scorecards.ts"
```

Then run `npm install` to update the lockfile.

## Delete

- `src/components/custom/structured-scorecard-json-import.tsx` (the JSON paste importer; its API route `/api/round-history` stays, because other screens use it)

## New files (full file)

### `prisma/schema/fantasy.prisma` — full file

```prisma
// @polsia:user-owned — free, friends-only fantasy leagues (PRD v4 P3; owner decision 2026-11-09).
//
// Design notes:
// - No money. There are no fee, wallet, prize or payout fields here on purpose; payments stay
//   disabled platform-wide. Do not add any without a separate approved spec.
// - Fantasy points come only from finalized imported/saved rounds already in the database.
//   A FantasyScore row records which scorecard produced which points under which rule version,
//   so standings can always be rebuilt and audited.
// - External references (users, UDisc identities, scorecards) are plain ids, matching the
//   convention in the other user-owned schema files (no edits to framework-owned auth.prisma).
// - Scoring rules are locked when the league leaves DRAFTING (scoringLockedAt), mirroring the
//   PRD rule that league scoring locks when a season starts.

enum FantasyLeagueStatus {
  DRAFTING
  ACTIVE
  COMPLETE
  ARCHIVED
}

enum FantasyFormat {
  /// Each team drafts a roster once and every rostered player scores every period.
  SEASON_DRAFT
  /// Each team drafts a roster and picks a smaller starting lineup each period.
  WEEKLY_LINEUP
}

model FantasyLeague {
  id               String              @id @default(cuid())
  name             String
  /// Optional home Clubhouse: limits who can join to that Clubhouse's members.
  clubhouseId      String?
  createdByUserId  String
  status           FantasyLeagueStatus @default(DRAFTING)
  format           FantasyFormat       @default(SEASON_DRAFT)
  seasonStart      DateTime            @db.Date
  seasonEnd        DateTime            @db.Date
  /// Time zone used to cut periods and lock lineups, e.g. "America/Chicago".
  timeZone         String              @default("America/Chicago")
  rosterSize       Int                 @default(4)
  /// Starters per period; only used by WEEKLY_LINEUP.
  lineupSize       Int?
  maxTeams         Int                 @default(12)
  /// Versioned scoring rule, e.g. {"version":1,"perRound":"leaguePlacePoints"}.
  scoringRule      Json
  scoringLockedAt  DateTime?
  inviteCode       String              @unique
  teams            FantasyTeam[]
  periods          FantasyPeriod[]
  draftPicks       FantasyDraftPick[]
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  @@index([clubhouseId])
  @@index([createdByUserId])
  @@map("fantasy_league")
}

model FantasyTeam {
  id              String              @id @default(cuid())
  fantasyLeagueId String
  fantasyLeague   FantasyLeague       @relation(fields: [fantasyLeagueId], references: [id], onDelete: Cascade)
  ownerUserId     String
  name            String
  /// Draft order position, assigned when the draft starts.
  draftSlot       Int?
  roster          FantasyRosterSlot[]
  lineups         FantasyLineupSlot[]
  scores          FantasyScore[]
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([fantasyLeagueId, ownerUserId])
  @@unique([fantasyLeagueId, name])
  @@map("fantasy_team")
}

/// A real disc golfer (by verified UDisc identity) on a fantasy team.
model FantasyRosterSlot {
  id              String      @id @default(cuid())
  fantasyLeagueId String
  teamId          String
  team            FantasyTeam @relation(fields: [teamId], references: [id], onDelete: Cascade)
  identityId      String
  acquiredAt      DateTime    @default(now())

  /// A golfer can be on only one team per fantasy league.
  @@unique([fantasyLeagueId, identityId])
  @@index([teamId])
  @@map("fantasy_roster_slot")
}

/// Audit trail of the draft; one row per pick, never edited after it is made.
model FantasyDraftPick {
  id              String        @id @default(cuid())
  fantasyLeagueId String
  fantasyLeague   FantasyLeague @relation(fields: [fantasyLeagueId], references: [id], onDelete: Cascade)
  pickNumber      Int
  teamId          String
  identityId      String
  pickedByUserId  String
  pickedAt        DateTime      @default(now())

  @@unique([fantasyLeagueId, pickNumber])
  @@unique([fantasyLeagueId, identityId])
  @@map("fantasy_draft_pick")
}

/// A scoring window (usually a week). Lineups lock at startsAt.
model FantasyPeriod {
  id              String              @id @default(cuid())
  fantasyLeagueId String
  fantasyLeague   FantasyLeague       @relation(fields: [fantasyLeagueId], references: [id], onDelete: Cascade)
  number          Int
  startsAt        DateTime
  endsAt          DateTime
  finalizedAt     DateTime?
  lineups         FantasyLineupSlot[]
  scores          FantasyScore[]

  @@unique([fantasyLeagueId, number])
  @@index([fantasyLeagueId, startsAt])
  @@map("fantasy_period")
}

model FantasyLineupSlot {
  id         String        @id @default(cuid())
  periodId   String
  period     FantasyPeriod @relation(fields: [periodId], references: [id], onDelete: Cascade)
  teamId     String
  team       FantasyTeam   @relation(fields: [teamId], references: [id], onDelete: Cascade)
  identityId String
  setAt      DateTime      @default(now())

  @@unique([periodId, teamId, identityId])
  @@map("fantasy_lineup_slot")
}

/// Points one golfer earned for one team from one finalized scorecard in one period.
model FantasyScore {
  id           String        @id @default(cuid())
  periodId     String
  period       FantasyPeriod @relation(fields: [periodId], references: [id], onDelete: Cascade)
  teamId       String
  team         FantasyTeam   @relation(fields: [teamId], references: [id], onDelete: Cascade)
  identityId   String
  /// ImportedScorecard.id or SavedRound.id, per sourceKind.
  sourceKind   String
  sourceId     String
  points       Decimal       @db.Decimal(8, 2)
  ruleVersion  Int
  computedAt   DateTime      @default(now())

  /// Re-running scoring is repeat-safe: one row per golfer per source card per team per period.
  @@unique([periodId, teamId, identityId, sourceKind, sourceId])
  @@index([teamId])
  @@map("fantasy_score")
}
```

### `src/lib/business/persist-imported-scorecard.server.ts` — full file

```ts
// @polsia:user-owned — the one write path for imported scorecards (CardCast, CSV, legacy migration).
import 'server-only';
import { Prisma } from '@prisma/client';
import { importedScorecardFingerprint } from '@/lib/business/imported-scorecard';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import { addScorecardClubhouseLinks } from '@/lib/business/scorecard-clubhouses.server';
import type { ImportedScorecardDraft } from '@/lib/contracts/imported-scorecard';

export interface PersistImportedScorecardInput {
  card: ImportedScorecardDraft;
  importedByUserId: string | null;
  clubhouseIds?: readonly string[];
}

export type PersistImportedScorecardResult =
  | { status: 'created'; id: string }
  | { status: 'duplicate'; id: string };

/**
 * Saves a validated scorecard draft inside the caller's transaction.
 *
 * Duplicate-safe: an existing card with the same UDisc scorecard id, source URL or score
 * fingerprint is returned as a duplicate (with any new Clubhouse links added) instead of
 * creating a second card. Players are matched by normalized UDisc username, never by
 * display name. The caller owns the transaction, so a failure writes nothing.
 */
export async function persistImportedScorecard(
  transaction: Prisma.TransactionClient,
  { card, importedByUserId, clubhouseIds = [] }: PersistImportedScorecardInput,
): Promise<PersistImportedScorecardResult> {
  const { scorecardId, sourceUrl } = card;
  const fingerprint = importedScorecardFingerprint(card);
  const existing = await transaction.importedScorecard.findFirst({
    where: { OR: [{ scorecardId }, { sourceUrl }, { fingerprint }] },
    select: { id: true },
  });
  if (existing) {
    await addScorecardClubhouseLinks(transaction, existing.id, [...clubhouseIds]);
    return { status: 'duplicate', id: existing.id };
  }

  const playerIds = new Map<string, string>();
  const identityIds = new Map<string, string>();
  const normalizedUsernames = new Map<string, string>();
  for (const player of card.players) {
    if (!player.username) continue;
    const normalizedUsername = normalizeUDiscUsername(player.username);
    const identity = await transaction.uDiscIdentity.upsert({
      where: { normalizedUsername },
      create: { normalizedUsername },
      update: {},
      select: { id: true, udiscPlayerId: true, ownerUserId: true },
    });
    const existingPlayers = await transaction.uDiscPlayer.findMany({
      where: { OR: [{ normalizedUsername }, { normalizedUsername: null }] },
      select: { id: true, username: true, normalizedUsername: true },
    });
    const playerRecord = existingPlayers.find(
      (candidate) => normalizeUDiscUsername(candidate.username) === normalizedUsername,
    );
    let record: { id: string };
    if (playerRecord) {
      record = await transaction.uDiscPlayer.update({
        where: { id: playerRecord.id },
        data: { normalizedUsername },
        select: { id: true },
      });
    } else {
      await transaction.uDiscPlayer.createMany({
        data: [{ username: player.username, normalizedUsername }],
        skipDuplicates: true,
      });
      const exactPlayer = await transaction.uDiscPlayer.findUnique({
        where: { username: player.username },
        select: { id: true },
      });
      if (!exactPlayer) throw new Error('udisc_player_save_failed');
      record = exactPlayer;
    }
    if (!identity.udiscPlayerId) {
      await transaction.uDiscIdentity.updateMany({
        where: { id: identity.id, udiscPlayerId: null },
        data: { udiscPlayerId: record.id },
      });
    }
    playerIds.set(player.username, record.id);
    // Pending claims remain unlinked until an app admin approves them.
    if (identity.ownerUserId) identityIds.set(player.username, identity.id);
    normalizedUsernames.set(player.username, normalizedUsername);
  }

  const created = await transaction.importedScorecard.create({
    data: {
      scorecardId,
      sourceUrl,
      fingerprint,
      courseName: card.courseName,
      courseUrl: card.courseUrl,
      layoutName: card.layoutName,
      playedOn: card.playedOn ? new Date(`${card.playedOn}T00:00:00.000Z`) : null,
      location: card.location,
      holeCount: card.holeCount,
      totalPar: card.totalPar,
      pars: card.pars ?? Prisma.DbNull,
      importedByUserId,
      clubhouseId: clubhouseIds.length === 1 ? (clubhouseIds[0] ?? null) : null,
      players: {
        create: card.players.map((player, sourceOrder) => ({
          sourceOrder,
          displayName: player.displayName,
          username: player.username,
          normalizedUsername: player.username
            ? (normalizedUsernames.get(player.username) ?? null)
            : null,
          ...(player.username && playerIds.has(player.username)
            ? { udiscPlayerId: playerIds.get(player.username) }
            : {}),
          ...(player.username && identityIds.has(player.username)
            ? { identityId: identityIds.get(player.username) }
            : {}),
          holeScores: player.holeScores,
          totalScore: player.totalScore,
          toPar: player.toPar,
          holesPlayed:
            player.holesPlayed ?? player.holeScores.filter((score) => score !== null).length,
          didNotFinish: player.didNotFinish ?? player.holeScores.some((score) => score === null),
          position: player.position,
        })),
      },
    },
    select: { id: true },
  });
  await addScorecardClubhouseLinks(transaction, created.id, [...clubhouseIds]);
  return { status: 'created', id: created.id };
}

export function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
```

### `src/lib/business/legacy-chatgpt-scorecard.ts` — full file

```ts
// @polsia:user-owned — converts scorecards exported from the legacy ChatGPT Fairway Friends site.
//
// Source: the legacy site's GET /api/data JSON ({ rounds: [...] }) and its bundled seed.json.
// Every value is copied from the source; nothing is invented. Fields the source lacks
// (location, finishing position) stay null. Validation is the same schema the live
// CardCast importer uses, so a legacy card that would not pass a fresh import is rejected.
import {
  type ImportedScorecardDraft,
  ImportedScorecardDraftSchema,
} from '@/lib/contracts/imported-scorecard';

export interface LegacyChatGptPlayer {
  username: string;
  name?: string | null;
  scores: Array<number | null>;
  total: number;
  relative?: number | null;
  complete?: boolean;
  holesPlayed?: number;
}

export interface LegacyChatGptRound {
  id: string;
  source?: string;
  url: string;
  course?: string | null;
  layout?: string | null;
  layoutKey?: string | null;
  /** Local wall-clock start, e.g. "2026-10-27T15:36" (no time zone in the source). */
  date?: string | null;
  pars: Array<number | null>;
  par?: number | null;
  players: LegacyChatGptPlayer[];
}

export type LegacyConversion =
  | { ok: true; card: ImportedScorecardDraft }
  | { ok: false; id: string; reason: string };

const COURSE_PATH = /^\/courses\/([A-Za-z0-9-]+)(?:\/|$)/;

/** UDisc course page derived from the source's own layout path, when it has one. */
export function legacyCourseUrl(layoutKey: string | null | undefined): string | null {
  const match = layoutKey ? COURSE_PATH.exec(layoutKey) : null;
  return match ? `https://udisc.com/courses/${match[1]}` : null;
}

export function convertLegacyChatGptRound(round: LegacyChatGptRound): LegacyConversion {
  const id = typeof round?.id === 'string' ? round.id : '(missing id)';
  if (round?.source && round.source !== 'udisc') {
    return { ok: false, id, reason: `Unsupported source "${round.source}".` };
  }
  const playedOn =
    typeof round.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(round.date)
      ? round.date.slice(0, 10)
      : null;
  const draft = {
    scorecardId: round.id,
    sourceUrl: round.url,
    courseName: round.course?.trim() || null,
    courseUrl: legacyCourseUrl(round.layoutKey),
    layoutName: round.layout?.trim() || null,
    playedOn,
    location: null,
    holeCount: Array.isArray(round.pars) ? round.pars.length : null,
    pars: Array.isArray(round.pars) ? round.pars : null,
    totalPar: typeof round.par === 'number' ? round.par : null,
    players: (round.players ?? []).map((player) => {
      const played = player.scores.filter((score) => score !== null).length;
      return {
        displayName: player.name?.trim() || null,
        username: player.username || null,
        holeScores: player.scores,
        totalScore: player.total,
        toPar: typeof player.relative === 'number' ? player.relative : null,
        position: null,
        holesPlayed: player.holesPlayed ?? played,
        didNotFinish: player.complete === undefined ? played < round.pars.length : !player.complete,
      };
    }),
  };
  const parsed = ImportedScorecardDraftSchema.safeParse(draft);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      id,
      reason: `${issue?.message ?? 'Invalid scorecard.'}${issue?.path.length ? ` (${issue.path.join('.')})` : ''}`,
    };
  }
  if (!sourceUrlMatchesId(parsed.data.sourceUrl, parsed.data.scorecardId)) {
    return { ok: false, id, reason: 'The scorecard id does not match its UDisc link.' };
  }
  return { ok: true, card: parsed.data };
}

function sourceUrlMatchesId(sourceUrl: string, scorecardId: string): boolean {
  try {
    const segments = new URL(sourceUrl).pathname.split('/').filter(Boolean);
    return segments.at(-1) === scorecardId;
  } catch {
    return false;
  }
}

/** Accepts either the live /api/data payload or the bundled seed.json. */
export function legacyRoundsFrom(payload: unknown): LegacyChatGptRound[] {
  if (payload && typeof payload === 'object' && 'rounds' in payload) {
    const rounds = (payload as { rounds: unknown }).rounds;
    if (Array.isArray(rounds)) return rounds as LegacyChatGptRound[];
  }
  throw new Error('Expected a JSON object with a "rounds" array.');
}
```

### `src/lib/business/public-name-privacy.ts` — full file

```ts
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
```

### `src/lib/business/public-name-privacy.server.ts` — full file

```ts
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
```

### `src/app/api/player-preferences/privacy/route.ts` — full file

```ts
// @polsia:user-owned — owner-scoped "hide my name on public cards" setting.
import 'server-only';
import { NextResponse } from 'next/server';
import { PublicNamePrivacySchema } from '@/lib/contracts/player-preferences';
import { prisma } from '@/lib/db';
import { requireAuth, type SessionUser } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let user: SessionUser;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const preference = await prisma.playerPreference.findUnique({
    where: { userId: user.id },
    select: { hidePublicName: true },
  });
  return NextResponse.json(
    PublicNamePrivacySchema.parse({ hidePublicName: preference?.hidePublicName ?? false }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let user: SessionUser;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const input = PublicNamePrivacySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: 'Choose whether to hide your name.' }, { status: 400 });
  }
  await prisma.playerPreference.upsert({
    where: { userId: user.id },
    update: { hidePublicName: input.data.hidePublicName },
    create: { userId: user.id, hidePublicName: input.data.hidePublicName },
  });
  return NextResponse.json(input.data);
}
```

### `src/components/custom/account-public-name-privacy.tsx` — full file

```tsx
// @polsia:user-owned — "hide my name on public cards" account setting.
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/lib/api-client';
import { PublicNamePrivacySchema } from '@/lib/contracts/player-preferences';

export function AccountPublicNamePrivacy() {
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/api/player-preferences/privacy', { schema: PublicNamePrivacySchema })
      .then((value) => {
        if (active) setHidden(value.hidePublicName);
      })
      .catch(() => {
        if (active) setHidden(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function change(next: boolean) {
    if (saving) return;
    const previous = hidden;
    setHidden(next);
    setSaving(true);
    try {
      await apiFetch('/api/player-preferences/privacy', {
        method: 'PUT',
        body: JSON.stringify({ hidePublicName: next }),
        schema: PublicNamePrivacySchema,
      });
      toast.success(next ? 'Your name is now hidden on public cards.' : 'Your name is now shown.');
    } catch {
      setHidden(previous);
      toast.error('Your privacy setting could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ff-account-theme" aria-labelledby="public-name-privacy-title">
      <div className="ff-account-theme-copy">
        <h2 id="public-name-privacy-title">Public scorecards</h2>
        <p>
          Every scorecard is part of the public Complete History. Turn this on to appear as “Player
          1”, “Player 2” and so on instead of your name and UDisc username. Your Clubhouse friends
          still see your name.
        </p>
      </div>
      <label className="flex items-center gap-3" htmlFor="hide-public-name">
        <Switch
          id="hide-public-name"
          checked={hidden ?? false}
          disabled={hidden === null || saving}
          onCheckedChange={(value) => void change(value)}
        />
        <span>Hide my name on public cards</span>
      </label>
    </section>
  );
}
```

### `scripts/migrate-legacy-scorecards.ts` — full file

```ts
// Migrates scorecards exported from the legacy ChatGPT Fairway Friends site into this database,
// and finishes any player claims left pending from before instant claiming.
//
//   npm run migrate:legacy -- --source path/to/data.json            (dry run, nothing saved)
//   npm run migrate:legacy -- --source path/to/data.json --commit   (saves)
//
// Options: --report <dir> (default ./migration-reports). Needs DATABASE_URL.
//
// Safety:
// - Every card goes through the same validation and the same write path as a live CardCast
//   import (persistImportedScorecard), so duplicates by UDisc id, link or score fingerprint
//   are linked, never re-created, and players are matched by UDisc username only.
// - The whole run is one transaction. A dry run rolls it back at the end; a failure rolls
//   everything back. Re-running a committed migration is safe: every card reports "existing".
// - After a commit, every migrated card is read back and its players counted.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// biome-ignore lint/style/noRestrictedImports: a one-off CLI migration, not app code; it needs its own client.
import { PrismaClient } from '@prisma/client';
import {
  convertLegacyChatGptRound,
  legacyRoundsFrom,
} from '../src/lib/business/legacy-chatgpt-scorecard';
import { persistImportedScorecard } from '../src/lib/business/persist-imported-scorecard.server';
import { linkIdentityHistory, SELF_CLAIM_NOTE } from '../src/lib/business/player-identity.server';

type Outcome =
  | { id: string; course: string | null; date: string | null; status: 'created' | 'existing' }
  | { id: string; status: 'rejected'; reason: string };

class DryRunRollback extends Error {}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const source = argument('--source');
  if (!source) throw new Error('Pass --source <path to the legacy /api/data JSON or seed.json>.');
  const commit = process.argv.includes('--commit');
  const reportDir = resolve(argument('--report') ?? 'migration-reports');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

  const rounds = legacyRoundsFrom(JSON.parse(readFileSync(resolve(source), 'utf8')));
  const prisma = new PrismaClient();
  const outcomes: Outcome[] = [];
  const claimsFinished: string[] = [];
  const claimsSkipped: Array<{ identity: string; reason: string }> = [];
  const before = await prisma.importedScorecard.count({ where: { deletedAt: null } });

  try {
    await prisma.$transaction(
      async (transaction) => {
        for (const round of rounds) {
          const converted = convertLegacyChatGptRound(round);
          if (!converted.ok) {
            outcomes.push({ id: converted.id, status: 'rejected', reason: converted.reason });
            continue;
          }
          const saved = await persistImportedScorecard(transaction, {
            card: converted.card,
            importedByUserId: null,
          });
          outcomes.push({
            id: converted.card.scorecardId,
            course: converted.card.courseName,
            date: converted.card.playedOn,
            status: saved.status === 'created' ? 'created' : 'existing',
          });
        }

        // Owner decision: unclaimed players may be claimed without admin review.
        const pending = await transaction.uDiscIdentity.findMany({
          where: { ownerUserId: null, pendingClaimUserId: { not: null } },
          select: { id: true, normalizedUsername: true, pendingClaimUserId: true },
        });
        for (const identity of pending) {
          const claimant = identity.pendingClaimUserId;
          if (!claimant) continue;
          const ownsAnother = await transaction.uDiscIdentity.findUnique({
            where: { ownerUserId: claimant },
            select: { id: true },
          });
          if (ownsAnother) {
            claimsSkipped.push({
              identity: identity.normalizedUsername,
              reason: 'Claimant already owns a different player.',
            });
            continue;
          }
          await transaction.uDiscIdentity.update({
            where: { id: identity.id },
            data: { ownerUserId: claimant, pendingClaimUserId: null },
          });
          await transaction.playerClaim.updateMany({
            where: { identityId: identity.id, claimantUserId: claimant, status: 'PENDING' },
            data: { status: 'APPROVED', reviewedAt: new Date(), reviewNote: SELF_CLAIM_NOTE },
          });
          await linkIdentityHistory(transaction, identity.id, identity.normalizedUsername);
          claimsFinished.push(identity.normalizedUsername);
        }

        if (!commit) throw new DryRunRollback();
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }

  // Read back every card that should now exist.
  const readBackFailures: string[] = [];
  if (commit) {
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') continue;
      const row = await prisma.importedScorecard.findUnique({
        where: { scorecardId: outcome.id },
        select: { _count: { select: { players: true } } },
      });
      const expected = rounds.find((round) => round.id === outcome.id)?.players.length ?? 0;
      if (!row) readBackFailures.push(`${outcome.id}: not found after save`);
      else if (outcome.status === 'created' && row._count.players !== expected)
        readBackFailures.push(
          `${outcome.id}: ${row._count.players} players saved, expected ${expected}`,
        );
    }
  }
  const after = await prisma.importedScorecard.count({ where: { deletedAt: null } });
  await prisma.$disconnect();

  const count = (status: Outcome['status']) => outcomes.filter((o) => o.status === status).length;
  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    source: resolve(source),
    ranAt: new Date().toISOString(),
    sourceCards: rounds.length,
    created: count('created'),
    alreadyInDatabase: count('existing'),
    rejected: count('rejected'),
    scorecardsBefore: before,
    scorecardsAfter: after,
    claimsFinished,
    claimsSkipped,
    readBackFailures,
  };

  mkdirSync(reportDir, { recursive: true });
  const stamp = summary.ranAt.replace(/[:.]/g, '-');
  const base = join(reportDir, `legacy-migration-${summary.mode}-${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify({ summary, outcomes }, null, 2));
  const lines = [
    `# Legacy scorecard migration (${summary.mode})`,
    '',
    `Run at ${summary.ranAt} from \`${summary.source}\`.`,
    '',
    '| Result | Cards |',
    '| --- | --- |',
    `| In source file | ${summary.sourceCards} |`,
    `| Newly added | ${summary.created} |`,
    `| Already in database | ${summary.alreadyInDatabase} |`,
    `| Rejected | ${summary.rejected} |`,
    `| Scorecards in database before → after | ${before} → ${after} |`,
    '',
    `Pending player claims finished: ${claimsFinished.length ? claimsFinished.map((u) => `@${u}`).join(', ') : 'none'}.`,
    ...(claimsSkipped.length
      ? ['', 'Claims not finished:', ...claimsSkipped.map((c) => `- @${c.identity}: ${c.reason}`)]
      : []),
    ...(readBackFailures.length
      ? ['', '**Read-back failures:**', ...readBackFailures.map((f) => `- ${f}`)]
      : commit
        ? ['', 'Every saved card was read back successfully.']
        : ['', 'Dry run: nothing was saved.']),
    '',
    '## Cards',
    '',
    '| UDisc id | Course | Date | Result |',
    '| --- | --- | --- | --- |',
    ...outcomes.map((o) =>
      o.status === 'rejected'
        ? `| ${o.id} | | | rejected: ${o.reason} |`
        : `| ${o.id} | ${o.course ?? ''} | ${o.date ?? ''} | ${o.status} |`,
    ),
  ];
  writeFileSync(`${base}.md`, `${lines.join('\n')}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}
`);
  process.stdout.write(`Report: ${base}.md
`);
  if (readBackFailures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
```

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

### `src/app/(setup)/page.tsx` — patch

```diff
--- a/src/app/(setup)/page.tsx
+++ b/src/app/(setup)/page.tsx
@@ -1,6 +1,6 @@
 // @polsia:user-owned — Fairway Friends public homepage.
 
-import { ArrowRight, ArrowUpRight, Disc3, MapPin, UserRound } from 'lucide-react';
+import { ArrowRight, Disc3, MapPin, UserRound } from 'lucide-react';
 import type { Metadata } from 'next';
 import Image from 'next/image';
 import Link from 'next/link';
@@ -11,7 +11,8 @@
 import { siteDescription, siteName } from '@/lib/brand';
 import './fairway-landing.css';
 
-const clubhouseUrl = 'https://fairway-friends-caleb.cchambruhs.chatgpt.site/';
+// Clubhouse lives in this app; never link to the legacy ChatGPT site (PRD v4 §2).
+const clubhouseUrl = '/dashboard/clubhouses';
 
 export const metadata: Metadata = {
   title: { absolute: `${siteName} | Disc Golf Player Profiles` },
@@ -68,8 +69,8 @@
               <AuthNav presentation="standard" />
             </div>
             <Button asChild className="ff-header-clubhouse">
-              <Link href={clubhouseUrl} target="_blank" rel="noreferrer">
-                Clubhouse <ArrowUpRight size={15} aria-hidden="true" />
+              <Link href={clubhouseUrl}>
+                Clubhouse <ArrowRight size={15} aria-hidden="true" />
               </Link>
             </Button>
             <ThemeToggle className="ff-theme-toggle" />
@@ -81,8 +82,8 @@
           <Link href="/statistics">Statistics</Link>
           <a href="#get-started">Get started</a>
           <Button asChild className="ff-mobile-clubhouse">
-            <Link href={clubhouseUrl} target="_blank" rel="noreferrer">
-              Clubhouse <ArrowUpRight size={14} aria-hidden="true" />
+            <Link href={clubhouseUrl}>
+              Clubhouse <ArrowRight size={14} aria-hidden="true" />
             </Link>
           </Button>
         </nav>
@@ -107,8 +108,8 @@
               </p>
               <div className="ff-hero-actions">
                 <Button asChild className="ff-button ff-button-primary">
-                  <Link href={clubhouseUrl} target="_blank" rel="noreferrer">
-                    Enter the clubhouse <ArrowUpRight size={16} aria-hidden="true" />
+                  <Link href={clubhouseUrl}>
+                    Enter the clubhouse <ArrowRight size={16} aria-hidden="true" />
                   </Link>
                 </Button>
                 <Button asChild variant="outline" className="ff-button ff-button-secondary">
@@ -181,9 +182,7 @@
                 </Link>
               </Button>
               <Button asChild variant="outline" className="ff-button ff-button-secondary">
-                <Link href={clubhouseUrl} target="_blank" rel="noreferrer">
-                  Open the clubhouse
-                </Link>
+                <Link href={clubhouseUrl}>Open the clubhouse</Link>
               </Button>
             </div>
           </div>
```

### `src/app/(dashboard)/dashboard/profile/import-history/page.tsx` — full file

```tsx
// @polsia:user-owned — signed-in historical UDisc CSV import workspace (JSON entry removed per PRD v4 §3).
import type { Metadata } from 'next';
import { UDiscExportImport } from '@/components/custom/udisc-export-import';

export const metadata: Metadata = {
  title: 'Import history',
  description: 'Import historical UDisc CSV exports into Fairway Friends.',
};

export default function ImportHistoryPage() {
  return (
    <div className="ff-rounds-page">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">PROFILE · IMPORT HISTORY</p>
        <h1>Import history</h1>
        <p>Review and add historical UDisc CSV exports.</p>
      </header>
      <section id="csv-import" aria-label="UDisc CSV import">
        <UDiscExportImport initialSourceUrl="" />
      </section>
    </div>
  );
}
```

### `src/components/custom/account-experience.tsx` — patch

```diff
--- a/src/components/custom/account-experience.tsx
+++ b/src/components/custom/account-experience.tsx
@@ -5,6 +5,7 @@
 import { useRouter } from 'next/navigation';
 import { useEffect, useState } from 'react';
 import { toast } from 'sonner';
+import { AccountPublicNamePrivacy } from '@/components/custom/account-public-name-privacy';
 import { AccountThemePreference } from '@/components/custom/account-theme-preference';
 import { Button } from '@/components/ui/button';
 import { authClient, signOut, useIsAdmin, useSession } from '@/lib/auth-client';
@@ -79,6 +80,7 @@
           </div>
         </dl>
         <AccountThemePreference />
+        <AccountPublicNamePrivacy />
         {ownerMode ? (
           <section className="ff-profile-security" aria-labelledby="owner-security-title">
             <div>
```

### `src/components/custom/cardcast-import-form.tsx` — patch

```diff
--- a/src/components/custom/cardcast-import-form.tsx
+++ b/src/components/custom/cardcast-import-form.tsx
@@ -1,9 +1,10 @@
-// @polsia:user-owned — compact signed-in UDisc importer with optional JSON and CSV tools.
+// @polsia:user-owned — compact signed-in UDisc importer; CSV is an optional fallback (PRD v4 §3).
 'use client';
 
 import { Link2, LoaderCircle } from 'lucide-react';
 import Link from 'next/link';
 import { type FormEvent, useCallback, useEffect, useState } from 'react';
+import { UDiscExportImport } from '@/components/custom/udisc-export-import';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { apiFetch } from '@/lib/api-client';
@@ -201,7 +202,7 @@
             value={clubhouseIds.length ? clubhouseIds : ['personal']}
             size={Math.min(4, Math.max(2, clubhouses.length + 1))}
           >
-            <option value="personal">Personal only</option>
+            <option value="personal">No Clubhouse</option>
             {clubhouses.map((clubhouse) => (
               <option key={clubhouse.id} value={clubhouse.id}>
                 {clubhouse.name}
@@ -228,7 +229,9 @@
             </div>
           ) : null}
           {!destinationsLoading && !destinationsError && clubhouses.length === 0 ? (
-            <p className="ff-cardcast-hint">No memberships yet. This round will stay personal.</p>
+            <p className="ff-cardcast-hint">
+              No Clubhouse memberships yet. The round still goes into the public Complete History.
+            </p>
           ) : null}
         </div>
         <Button
@@ -266,9 +269,12 @@
         </p>
       ) : null}
 
-      <p className="ff-cardcast-alternatives">
-        <Link href="/dashboard/profile/import-history#csv-import">or paste a CSV instead</Link>
-      </p>
+      <details className="ff-cardcast-alternatives">
+        <summary>or paste a CSV instead</summary>
+        <div className="mt-3">
+          <UDiscExportImport initialSourceUrl="" />
+        </div>
+      </details>
     </section>
   );
 }
```

### `src/components/custom/dashboard/league-workspace.tsx` — patch

```diff
--- a/src/components/custom/dashboard/league-workspace.tsx
+++ b/src/components/custom/dashboard/league-workspace.tsx
@@ -831,14 +831,16 @@
                       <th>Player</th>
                       <th>Points</th>
                       <th>Wins</th>
+                      <th>2nds</th>
+                      <th>Avg place</th>
                       <th>Rounds</th>
                       <th>Avg to par</th>
                     </tr>
                   </thead>
                   <tbody>
-                    {league.standings.map((standing, index) => (
+                    {league.standings.map((standing) => (
                       <tr key={standing.playerKey}>
-                        <td>{index + 1}</td>
+                        <td>{standing.rank}</td>
                         <th scope="row">
                           {standing.userId ? (
                             <Link href={`/players/user/${encodeURIComponent(standing.userId)}`}>
@@ -848,8 +850,12 @@
                             standing.displayName
                           )}
                         </th>
-                        <td>{standing.points.toFixed(1)}</td>
+                        <td>{standing.points.toFixed(2)}</td>
                         <td>{standing.wins}</td>
+                        <td>{standing.seconds}</td>
+                        <td>
+                          {standing.averagePlace === null ? '—' : standing.averagePlace.toFixed(2)}
+                        </td>
                         <td>{standing.rounds}</td>
                         <td>
                           {standing.averageToPar === null
@@ -872,12 +878,14 @@
               <p className="ff-league-hint">
                 Fixed points by place:{' '}
                 {(settings?.fixedPoints ?? [...DEFAULT_FIXED_POINTS]).join(' / ')}. Tied players
-                split the average for the occupied places.
+                split the average for the occupied places. After the last listed place, each place
+                earns one fewer point (minimum 1).
               </p>
             ) : (
               <p className="ff-league-hint">
-                Field-size points are 100 × (N − R + 1) / N; tied players split the average for
-                their occupied places.
+                Field-size points are 25 × (N − P) / (N − 1), where N is the number of finishers and
+                P the place; a one-player round earns 25. Tied players split the average for their
+                occupied places.
               </p>
             )}
           </section>
```

### `src/components/custom/dashboard/player-identity-gate.tsx` — patch

```diff
--- a/src/components/custom/dashboard/player-identity-gate.tsx
+++ b/src/components/custom/dashboard/player-identity-gate.tsx
@@ -92,8 +92,8 @@
         <p className="ff-player-profile-kicker">PLAYER SETUP</p>
         <h1 className="text-2xl font-semibold">Choose your player profile, {displayName}</h1>
         <p className="mt-2 text-sm text-muted-foreground">
-          This choice is required before the workspace opens. Existing UDisc records need an app
-          admin’s approval before they are linked to your account.
+          This choice is required before the workspace opens. Claiming an unclaimed UDisc player
+          links all of its saved scorecards to your account immediately.
         </p>
         <div className="mt-6">
           <PlayerIdentityPicker value={choice} onChange={setChoice} />
@@ -135,8 +135,8 @@
     </div>
   ) : state?.identity?.status === 'pending' ? (
     <output className="ff-player-identity-notice" aria-live="polite">
-      Your UDisc claim is pending admin review. Existing player history remains unlinked to your
-      account until it is approved.
+      Your UDisc claim was made before instant claiming and is still pending. It is approved
+      automatically when the scorecard migration runs.
     </output>
   ) : null;
 
```

### `src/components/custom/player-identity-picker.tsx` — patch

```diff
--- a/src/components/custom/player-identity-picker.tsx
+++ b/src/components/custom/player-identity-picker.tsx
@@ -60,8 +60,8 @@
     <fieldset className="ff-identity-choice">
       <legend>Choose your player profile</legend>
       <p>
-        Search your exact UDisc username. Claims for saved players stay pending until an app admin
-        reviews them.
+        Search your exact UDisc username. If nobody has claimed that player yet, it becomes yours
+        right away, along with every saved scorecard it appears on.
       </p>
       <Label htmlFor="udisc-username-choice">UDisc username</Label>
       <div className="ff-identity-search-row">
```

### `tests/unit/league-scoring.test.ts` — full file

```ts
import { describe, expect, it } from 'vitest';
import {
  accumulateLeaguePoints,
  awardLeaguePoints,
  compareLeagueStandings,
  fieldSizePointsForPlace,
  fixedPointsForPlace,
  sharedStandingRanks,
} from '@/lib/business/league-scoring';

const field = (...strokes: number[]) =>
  strokes.map((totalStrokes, index) => ({
    playerKey: String.fromCharCode(97 + index),
    totalStrokes,
  }));

describe('PRD v4 fixed placement points', () => {
  it('awards 25, 20, 16, 13, 11, 10, 9, 8, 7, 6 for places 1–10', () => {
    const awards = awardLeaguePoints(field(50, 51, 52, 53, 54, 55, 56, 57, 58, 59), 'FIXED');
    expect(awards.map((award) => award.points)).toEqual([25, 20, 16, 13, 11, 10, 9, 8, 7, 6]);
  });

  it('drops one point per place from 11th with a minimum of 1', () => {
    expect(fixedPointsForPlace(11, [25, 20, 16, 13, 11, 10, 9, 8, 7, 6])).toBe(5);
    expect(fixedPointsForPlace(15, [25, 20, 16, 13, 11, 10, 9, 8, 7, 6])).toBe(1);
    expect(fixedPointsForPlace(40, [25, 20, 16, 13, 11, 10, 9, 8, 7, 6])).toBe(1);
  });

  it('averages the points of every occupied place for a tie, rounded to two decimals', () => {
    expect(awardLeaguePoints(field(50, 50, 55), 'FIXED')).toEqual([
      { playerKey: 'a', place: 1, points: 22.5 },
      { playerKey: 'b', place: 1, points: 22.5 },
      { playerKey: 'c', place: 3, points: 16 },
    ]);
    // 2nd–4th tied: (20 + 16 + 13) / 3 = 16.333… → 16.33
    expect(awardLeaguePoints(field(48, 50, 50, 50), 'FIXED').map((a) => a.points)).toEqual([
      25, 16.33, 16.33, 16.33,
    ]);
  });

  it('gives a one-player round first-place points', () => {
    expect(awardLeaguePoints(field(54), 'FIXED')).toEqual([
      { playerKey: 'a', place: 1, points: 25 },
    ]);
  });
});

describe('PRD v4 field-size adjusted points', () => {
  it('uses 25 × (N − P) / (N − 1)', () => {
    expect(awardLeaguePoints(field(50, 52, 54, 56, 58), 'FIELD_SIZE').map((a) => a.points)).toEqual(
      [25, 18.75, 12.5, 6.25, 0],
    );
  });

  it('gives a lone finisher 25 and last place 0 when N > 1', () => {
    expect(fieldSizePointsForPlace(1, 1)).toBe(25);
    expect(fieldSizePointsForPlace(2, 2)).toBe(0);
  });

  it('averages tied places', () => {
    // N = 4; places 1 and 2 tied → (25 + 16.666…) / 2 = 20.83
    expect(awardLeaguePoints(field(50, 50, 55, 58), 'FIELD_SIZE')).toEqual([
      { playerKey: 'a', place: 1, points: 20.83 },
      { playerKey: 'b', place: 1, points: 20.83 },
      { playerKey: 'c', place: 3, points: 8.33 },
      { playerKey: 'd', place: 4, points: 0 },
    ]);
  });
});

describe('Season totals and tie-breaks', () => {
  it('sums every finalized round with no points for a missed round', () => {
    const totals = accumulateLeaguePoints(
      ['played', 'missed'],
      [
        awardLeaguePoints([{ playerKey: 'played', totalStrokes: 50 }], 'FIXED'),
        awardLeaguePoints([{ playerKey: 'played', totalStrokes: 52 }], 'FIXED'),
      ],
    );
    expect(totals.get('played')).toBe(50);
    expect(totals.get('missed')).toBe(0);
  });

  it('breaks equal points by wins, then second places, then average placement', () => {
    const base = { points: 40, wins: 1, seconds: 0, averagePlace: 2 };
    expect(compareLeagueStandings({ ...base, wins: 2 }, base)).toBeLessThan(0);
    expect(compareLeagueStandings({ ...base, seconds: 1 }, base)).toBeLessThan(0);
    expect(compareLeagueStandings({ ...base, averagePlace: 1.5 }, base)).toBeLessThan(0);
    expect(compareLeagueStandings(base, { ...base })).toBe(0);
  });

  it('shares a standing when every tie-break is equal', () => {
    const tied = { points: 40, wins: 1, seconds: 1, averagePlace: 2 };
    const sorted = [{ ...tied, points: 50 }, tied, { ...tied }, { ...tied, points: 10 }];
    expect(sharedStandingRanks(sorted)).toEqual([1, 2, 2, 4]);
  });
});
```

## Done when

- [ ] All four checks pass and the app is deployed
- [ ] Account page shows "Public scorecards" with a "Hide my name on public cards" switch
- [ ] Claiming an unclaimed UDisc username links it instantly, with no admin step
- [ ] Dashboard importer shows only the CardCast link field, plus a collapsed "or paste a CSV instead"
- [ ] League standings show points with 2 decimals, plus 2nds and Avg place columns
- [ ] Homepage Clubhouse buttons stay on fairwayleagueplay.com
