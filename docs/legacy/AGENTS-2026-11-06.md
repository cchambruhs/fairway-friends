# Working on Fairway Friends

Read README.md and docs/HANDOFF.md first. The runnable app is apps/web; root modules are a separate earlier implementation. Never silently mix their schemas or replace one importer with the other.

- Preserve user data and existing source. Do not fabricate round scores, API responses or passing checks.
- Keep UDisc fetching server-side, validate allowed destinations, reject incomplete or inconsistent cards, and preserve duplicate prevention and atomic writes.
- App import trace: app/api/import/route.ts → lib/import-card.mjs + lib/disc.mjs → lib/store.ts + lib/persistence.mjs. Paths here are relative to apps/web.
- Never trust client-supplied oai-authenticated-user-* headers on a new host. Replace the trusted Sites identity layer before production migration.
- Do not enable real money movement or betting. Preserve existing disabled gates.
- Use Node >=22.13 and pnpm 11.25.0 in apps/web. Keep its lockfile and third-party notices.
- Run npm test, npm run test:web, and npm run build from the root after relevant changes. Explain failures honestly; do not skip tests to obtain green CI.
- Do not commit credentials, .env/.dev.vars files, node_modules, generated builds, local database state, or user photo uploads.
- This repo is not automatically synchronized with Polsia. Do not claim deployment without verifying it.
- Favor small reviewable changes. Document which app and runtime a fix affects.
