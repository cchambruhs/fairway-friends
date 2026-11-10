# Fairway Friends update — part 2 of 2: import every legacy scorecard

**Run only after part 1 is deployed and its checks pass.**

Goal: the public Complete History holds every Fairway Friends scorecard ever logged. Your database has 4 cards now. These are the 41 cards from the original ChatGPT Fairway Friends site (its public `/api/data` feed, downloaded Nov 9, 2026). Three of them are already in your database (Angel Mounds Oct 20, Woodmere Sep 24, Eagle Valley Feb 22), so the expected result is **38 added, 3 already present, 0 rejected → 42 total cards**.

## Steps

1. Download the legacy scorecards JSON (too big to attach here) from
   https://raw.githubusercontent.com/cchambruhs/fairway-friends/polsia-handoff/docs/polsia-handoff/legacy-scorecards-2026-11-09.json
   and save it unchanged to `data/legacy-chatgpt/live-2026-11-09.json` in the app. It is 52749 bytes with SHA-256 `9322b1d71185e161fcc768c689fb547dfbeb5c853d5ac0cff2ac784246f751a1`. Check both before continuing. If you cannot fetch URLs, tell me and I will send the JSON in pieces.
2. Dry run (saves nothing): `npm run migrate:legacy -- --source data/legacy-chatgpt/live-2026-11-09.json`
3. Send me the printed summary. Proceed only if it says created 38, alreadyInDatabase 3, rejected 0. Otherwise stop and report.
4. Commit: run the same command with `--commit` added. It reads back every saved card and exits with an error if any is missing.
5. Run step 4 once more. It must print `"created": 0`, which proves it is repeat-safe.
6. Send me both printed summaries and the report file from `migration-reports/`.

The script also finishes any player claim still pending from before instant claiming (expected: @cchambruhs). It uses the same validation and save code as a live CardCast import. It matches players by UDisc username only, never by display name, and never invents missing values.

If your platform cannot run a one-off command against the production database, tell me which way works for you. Options: a one-time admin-only API route that calls the same functions, or a `[[crons]]` job that runs once. Do not import the cards any other way.

This exact procedure was rehearsed on a restored copy of your Nov 9 database export: 4 → 42 cards, 0 rejected, and the re-run added 0.

## Source file

- URL: https://raw.githubusercontent.com/cchambruhs/fairway-friends/polsia-handoff/docs/polsia-handoff/legacy-scorecards-2026-11-09.json
- Size: 52749 bytes
- SHA-256: `9322b1d71185e161fcc768c689fb547dfbeb5c853d5ac0cff2ac784246f751a1`
