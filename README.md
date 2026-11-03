# Fairway Friends League Platform

Disc golf league platform for [fairwayleagueplay.com](https://fairwayleagueplay.com) (also served at `fairway-friends.polsia.app`).

The core job: turn a public UDisc **CardCast scorecard link** into structured rows in *our* database, so league stats, head-to-head records and course history live with us instead of inside UDisc.

---

## The one thing to read first

**Server-side outbound fetch to `udisc.com` is NOT verified on our hosting yet.**

This is a hard blocker from the PRD, not a caution. If Polsia blocks outbound HTTP from the runtime, the entire import path cannot work no matter how good the parser is, and the correct move is to stop and use an edge function or a fetch proxy rather than build UI on top of an unverified assumption.

Run this before touching anything else:

```bash
node scripts/verify-fetch.mjs
```

It fetches the reference scorecard, reports status code, byte count, and whether the score table is present in the returned HTML. See [`docs/VERIFY-FETCH.md`](docs/VERIFY-FETCH.md) for exactly what to paste back.

Nothing in this repo claims the acceptance test passes. It has not been run against live UDisc from the production host.

---

## What is here

| Path | Purpose |
| --- | --- |
| `lib/udisc/url.js` | Link validation — accepts only `udisc.com/scorecards/<id>`, rejects everything else |
| `importers/udisc_cardcast.js` | **The parser.** All UDisc HTML knowledge lives here and nowhere else |
| `lib/udisc/import.js` | Orchestration: validate → fetch → parse → dedupe → transaction → readback |
| `importers/udisc_csv.js` | CSV path, normalised into the identical shape as the link path |
| `lib/scoring/fixed.js` | Fixed placement and field-size adjusted points, with tie averaging |
| `lib/scoring/season.js` | Season standings, provisional vs official, the tiebreak chain |
| `lib/money/cents.js` | Integer-cent fee engine. Calculation only — money movement hard-disabled |
| `db/schema.sql` | `scorecards`, `scorecard_players`, `players` |
| `tests/` | Parser, scoring and money tests. No network required |
| `scripts/verify-fetch.mjs` | The blocker check |
| `docs/` | Fetch verification, deploy notes, open issues, phase 2 notes |

---

## Parser fragility — read this before changing anything

UDisc will change their HTML eventually. That is an expected event, not an incident.

`importers/udisc_cardcast.js` is the **only** file permitted to contain knowledge of UDisc's markup. Route handlers, components and services must never reach into HTML — they call `parseScorecard(html, url)` and get a plain object back.

The parser is also **strict on purpose**: if the number of strokes recorded for a player does not exactly equal the number of holes, it throws and nothing is saved. A half-read scorecard in the database is worse than a failed import, because it silently corrupts every stat computed from it.

---

## Rules this codebase holds to

- **No UDisc API.** There is no public one. The CardCast page is an ordinary public web page with the scores already in its HTML as a table. We read the page; we never call an API.
- **No browser-side fetch.** CORS makes it impossible. Fetch is server-side only.
- **No JSON input, no schema examples, no preview step, no bulk importer.** The import page has one link field, one button, and a small CSV link. Anything else is scope creep.
- **Never invent a score.** Missing strokes, pars or ratings are never filled in. Unfinished cards fail loudly.
- **Players are keyed on `@udisc_username`.** Never matched, merged or inferred on display name. Two people can both be "Dad".
- **Duplicates are prevented by `source_round_id`.** Importing the same link twice must never create a second scorecard or second set of player rows. Overwrite requires an explicit Force re-import click.
- **All-or-nothing writes.** One scorecard row plus one row per player, single transaction, followed by a readback.
- **Never report success without a readback.** The confirmation line renders only after the row is read back out of the database.
- **No money movement.** Fee arithmetic runs in integer cents; moving real money is gated off until legal and payment-provider requirements are satisfied.

---

## Reference payload

`https://udisc.com/scorecards/scorecard_mns8y9vb4afhk4v7lafcmk8n`

Course **Angel Mounds Disc Golf Course** · Layout **Blue Tees** · **Oct 20, 2026 4:06 PM** · Evansville, Indiana · 18 holes.

| Pos | Player | Username | Total |
| --- | --- | --- | --- |
| 1 | Devin Devin | @devin47 | 45 (-10) |
| 2 | Dad | @cchambruhs | 46 (-9) |
| 3 | Mdub1807 | @mdub1807 | 50 (-5) |
| 4 | Will | @rashad032 | 51 (-4) |
| 5 | TG | @mk3492 | 53 (-2) |

Header cells read `"1 213 3"` = hole number, distance, par. The final header cell `"Total 3485 55"` is a **total, never a hole** — this is the single easiest way to break the parser. The weather row (`72°F`, `6 mph`, `1h 17m`) is ignored.

---

## Open-source reuse — deliberately thin

The v3.0 PRD's tech section asks for credible licences, "preferably 1,000+ stars, where beneficial". Its importer section answers that honestly for this domain, and we agree with it.

The UDisc ecosystem on GitHub is small hobby projects. Verified star counts, Nov 2026: `cclark20/disc-golf-data` (15, Python, scrapes PDGA + UDisc), `IsakJacobsson/udisc-stats-analyzer` (2), `cardouken/udisctransformer` (2, CSV → DiscGolfMetrix), `sonikki/dgs2` (2, views UDisc CSV exports), `rbrambley/URD` (2), `Choromanski/udisc-scorecards` (1, archive of scorecard HTML), `austin-stuff/udisc_stats` (2). **Nothing in that list is worth forking**, and none of it parses CardCast HTML.

We therefore own the parser. See [`docs/REUSE.md`](docs/REUSE.md) for the general-purpose libraries worth considering and why each was or was not taken.

---

## Phase 2 — Clubhouse

Private groups with joining codes, roster, realtime feed, 1-to-1 DMs, read receipts, unread badges, and member contacts visible only to that member and their Clubhouse admins. Row-level security must ensure one Clubhouse can never query another's rows.

Outbound sending is **handoff only**: open the native share sheet, SMS or email with text pre-filled, or copy to clipboard on desktop. No server-sent SMS and no Facebook automation. A real Meta Messenger integration requires a Meta app and review — noted in [`docs/CLUBHOUSE.md`](docs/CLUBHOUSE.md), deliberately not attempted.

---

## Status

- [x] Parser written against captured reference markup
- [x] Duplicate prevention and player keying specified
- [x] Scoring engines (both methods, ties, season tiebreaks) with tests
- [x] Fee engine in integer cents, money movement hard-disabled
- [ ] **Outbound fetch verified on production host** ← blocker
- [ ] Acceptance test run end to end with DB readback
- [ ] Historical CSV imported and deduplicated (UDisc export dated Oct 28 2026, ~441 records before validation)

Known open issues are in [`docs/OPEN-ISSUES.md`](docs/OPEN-ISSUES.md), including the homepage "Enter the clubhouse" button still pointing at the ChatGPT-hosted site — which sends paid-site visitors straight off the property.

---

## Working agreement

Verify hosting permits the outbound fetch, and prove the parser against the reference link, **before** spending a build credit on UI. Never claim a fix without end-to-end testing and a database readback.
