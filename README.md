# Fairway Friends

Disc golf scorecards, player stats, Clubhouses, league play and (soon) free fantasy leagues for friends. Production domain: **fairwayleagueplay.com**.

This repository is the single source of truth. It merges the two earlier builds:

- **Polsia build** — the base: Next.js 16, Postgres via Prisma, Better Auth logins, the CardCast importer with duplicate protection, score corrections, leagues.
- **ChatGPT build** (legacy site) — its Clubhouse features, dashboards and look are being rebuilt on this base. Its original code is preserved on the [`legacy-chatgpt-build`](../../tree/legacy-chatgpt-build) branch; its 22 seed scorecards and real CardCast test pages are kept in `data/legacy-chatgpt/` and `tests/fixtures/`.

The product spec is the PRD v4 (Nov 3, 2026), with owner decisions recorded in [`CLAUDE.md`](CLAUDE.md). The merge plan and phase roadmap live in the "Fairway Friends Merge Plan" doc.

## Run it locally

Requirements: Node 24 (see `.nvmrc`), npm, and a Postgres database (local install or a free hosted one such as Neon).

```sh
git clone https://github.com/cchambruhs/fairway-friends.git
cd fairway-friends
npm ci
cp .env.example .env.local     # then fill in DATABASE_URL and BETTER_AUTH_SECRET
npx prisma db push             # create tables in your database
npm run dev                    # http://localhost:3000
```

## Checks

```sh
npm run lint        # Biome
npm run typecheck   # TypeScript
npm test            # Vitest unit tests
npm run build       # production build
```

GitHub Actions runs all four, against a throwaway Postgres, on every pull request.

## Where things are

| Path | What |
| --- | --- |
| `src/app/` | Pages and `/api` route handlers |
| `src/lib/business/` | Domain logic: importer, scoring, stats, leagues |
| `src/components/custom/` | Fairway Friends screens |
| `prisma/schema/` | Database schema, one file per area (`fantasy.prisma` is new) |
| `data/legacy-chatgpt/` | Seed cards exported from the ChatGPT build, for migration |
| `tests/unit/`, `tests/e2e/` | Vitest and Playwright tests |
| `docs/legacy/` | Earlier handoff notes and specs, kept for reference |
| `.polsia/`, `polsia.toml` | Polsia hosting contract (see below) |

## Hosting

Currently deployed on Polsia (`polsia.toml` controls build and start). The app is plain Next.js + Prisma + Postgres, so it can also run on Vercel or any Node host; the Polsia-specific pieces (email proxy, file uploads, owner bootstrap) will sit behind small adapters before any move. Updating this repository does **not** deploy anything by itself.

Polsia marks some files as framework-owned (see `.polsia/ownership.json`). Avoid editing those unless the change is deliberate and noted in the pull request.

## Rules that never change

- Never invent scores, players, ratings or distances. Reject incomplete cards instead.
- UDisc pages are fetched server-side from the exact approved host only.
- Imports are all-or-nothing and duplicate-safe.
- Real-money features (entry fees, payouts, betting, wallets) stay disabled.
- No secrets in the repo. Use `.env.local` locally and the host's settings in production.

Licensing: project code is UNLICENSED (all rights reserved) unless noted. The Polsia template portions are MIT-licensed by Polsia, Inc. (see `LICENSE-POLSIA-TEMPLATE`).
