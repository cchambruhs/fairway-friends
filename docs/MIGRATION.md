# Scorecard migration runbook

Goal: one database holding every Fairway Friends scorecard ever logged, shown in the public Complete History (`/statistics`).

## Sources (as of Nov 9, 2026)

| Source | Cards | How it was obtained |
| --- | --- | --- |
| Legacy ChatGPT site, `GET /api/data` (public JSON) | 41 | Downloaded Nov 9, 2026 |
| Polsia database export (SQL ZIP from the Polsia dashboard) | 4 | Website → … → Database download |
| Overlap (same UDisc scorecard id) | 3 | Angel Mounds Oct 20, Woodmere Sep 24, Eagle Valley Feb 22 |
| **Unique total** | **42** | |

The Polsia export contains emails and password hashes. Keep it out of this repository.

## Steps on a new Postgres database

1. Restore the Polsia export into the empty database, in order:
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 01-schema.sql`, then `02-data.sql`.
2. Apply this repo's schema on top: `npx prisma db push`. It must report no data loss.
3. Dry run: `npm run migrate:legacy -- --source <legacy data.json>`. Review the report in `migration-reports/`.
4. Commit: add `--commit`. The script reads back every card and fails if any is missing.
5. Run step 4 again. It must report 0 created; this proves the run is repeat-safe.

## Rehearsal result (Nov 9, 2026, throwaway Postgres 17)

- After step 1: 4 cards, 22 player rows, 2 users, 1 pending claim.
- Dry run: 38 new, 3 already present, 0 rejected.
- Commit: 4 → 42 cards, all read back; pending claim for @cchambruhs finished and linked to 42 card entries.
- Re-run: 0 created, 41 already present.

## What the migration does and does not do

- Uses the same validation and save code as a live CardCast import, so totals, pars and hole counts must reconcile or the card is rejected.
- Matches players by UDisc username only, never by display name.
- Leaves location and finishing position empty where the legacy site never recorded them.
- Finishes player claims left pending before instant claiming, unless the claimant already owns another player.
- Does not move gear, photos or Clubhouse chat from the legacy site; those come in later phases.
