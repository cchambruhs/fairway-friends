# Source export — November 6, 2026
Latest saved ChatGPT Fairway Friends app, version 8.
Commit: 6cbf4850ca36504c950d1547592a0e92759492c0
All 197 tracked source files preserved. Includes original README, dependency declarations and lockfile, React components, API routes, UDisc importer, schema, migrations, seed data and tests.
Does not include later Polsia changes, live production database dumps, uploaded photos, secrets, node_modules or compiled build output.
Importer entrypoint: app/api/import/route.ts. Supporting modules: lib/import-card.mjs, lib/disc.mjs, lib/store.ts, lib/persistence.mjs, lib/csv-history.mjs.
Hosting depends on Vinext/Cloudflare Workers, D1/R2 and ChatGPT Sites authentication. Adapt these integrations for your destination; do not trust client-supplied identity headers. See original README and package.json for commands.
This is a source export, not verification that all features or imports work. No build or tests were run during export.
