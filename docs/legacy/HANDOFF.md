# Developer and AI handoff

## Source and boundaries

The original GitHub tree had 22 files and no website. The complete saved version-8 ChatGPT app was added under apps/web without overwriting the standalone root modules. Source provenance is recorded in apps/web/EXPORT-NOTES.md. Polsia's separate source and live data are not part of this export.

## App map

React views live in apps/web/app (dashboard, player dashboard, league dashboard, Clubhouse dashboard). API handlers are under app/api. lib/disc.mjs parses captured/public CardCast markup. lib/import-card.mjs coordinates fetch and validation; app/api/import/route.ts applies authorization, rate limits, input restrictions and import modes. lib/store.ts and lib/persistence.mjs save data and enforce deduplication. lib/csv-history.mjs handles CSV history. Read the actual code and tests before changing refresh/overwrite behavior.

App storage uses Cloudflare D1 (DB) and R2 (BUCKET). Schema: apps/web/db/schema.ts; migrations: apps/web/drizzle/*.sql. Root db/schema.sql belongs only to the older standalone implementation. Tests run against local emulated storage, not production.

## Verified in this update

- All 54 root tests and 83 web tests passed on Node 24/Linux.
- Frozen-lockfile dependency installation and web production build succeeded.
- Corrected root test discovery for current Node versions.
- Fixed root fixed-placement scoring after tenth place (11th now earns 5, rather than 9).
- Fixed root parser silently skipping scored players with missing usernames and location extraction consuming surrounding markup.
- Corrected synthetic parser fixtures whose hole scores contradicted their totals, a cents expectation off by a factor of ten, and tiebreak fixtures that were not actually tied. Synthetic strokes are explicitly labeled and are not historical player records.

Captured HTML fixtures have third-party scripts and embedded API keys removed before publication; score tables remain intact.

## Remaining production work

1. Verify the destination host can fetch current public UDisc pages and run a real import with database readback, followed by a duplicate import. Offline fixtures do not prove live UDisc compatibility.
2. Provision target DB/R2 bindings, apply migrations safely, and separately export/import live records and photos if moving hosts.
3. Replace or retain the trusted Sites authentication boundary. Client-provided oai-authenticated-user-* headers are not proof of identity on an ordinary server. Restrict direct Worker access or implement verified sessions before external deployment.
4. Set OWNER_EMAIL and test owner/non-owner authorization. Never commit secrets.
5. Test sign-in, CSV imports, photos, league/Clubhouse permissions and mobile UI on the target environment. This update did not perform browser QA or deploy either website.
6. Configure an explicit GitHub-to-host deployment process if desired. There is no automatic Polsia synchronization established here.

Pricing arithmetic is present, but payment processing and betting remain disabled. No claim is made that every roadmap feature is implemented.

## Sharing

Repository visibility was confirmed public on November 6, 2026 after the owner changed it. Anyone can read/clone it. Push access still requires an invitation or an authorized integration. A private production database, credentials and hosting accounts are separate from repository access.
