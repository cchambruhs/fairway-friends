> **Fairway Friends update, part 1 (code): piece 1 of 3.** Do not apply anything until you have received all 3 pieces in this chat; then apply them together, following the ground rules in piece 1.

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

