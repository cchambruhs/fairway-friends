# Fairway Friends

Disc golf scorecards, player statistics, leagues and Clubhouses. Start here if you are Caleb, a developer, or an AI coding assistant.

## What is in this repository?

| Location | Purpose |
| --- | --- |
| `apps/web/` | Full editable ChatGPT-hosted application, recovered from saved version 8 on November 6, 2026 |
| `apps/web/app/` | React screens and server API routes |
| `apps/web/lib/` | App importer, persistence, scoring, profiles, leagues and Clubhouses |
| `apps/web/db/`, `apps/web/drizzle/` | App schema and migrations |
| `importers/`, `lib/`, `tests/` | Earlier standalone modules, preserved and tested; not wired into the web app |
| `docs/HANDOFF.md` | Architecture, importer trace, verified status and remaining work |
| `AGENTS.md` | Instructions for coding assistants |

This combines the existing repository with the actual app source; it is not a reconstruction. Separate changes made inside Polsia, production database contents, uploaded photos and secrets are not included. The source contains historical seed data and test fixtures; they are not a live database backup.

## Run the website locally

Install Git, Node.js 22.13 or newer (Node 24 recommended), and pnpm 11.25.0. Then:

```sh
git clone https://github.com/cchambruhs/fairway-friends.git
cd fairway-friends/apps/web
pnpm install --frozen-lockfile
pnpm dev
```

Open the local address printed by the server (normally http://localhost:5173). Windows users can run these commands in PowerShell. Do not use the Linux-only `install:ci` helper on Windows.

The local server uses Cloudflare emulation. See [the app setup guide](apps/web/README.md) for database initialization and local sign-in. A successful build alone does not configure a production database or authentication provider.

## Check changes

From the repository root, after installing web dependencies:

```sh
npm test
npm run test:web
npm run build
```

The root modules require no dependency installation. The web app has its own pinned lockfile; do not install it as an npm workspace or replace that lockfile.

Verified November 6, 2026: **54 standalone tests + 83 web tests passed; production build passed** on Node 24/Linux. GitHub Actions repeats these checks on pushes and pull requests. No production deployment or live UDisc fetch was performed in this repository update.

## Share with a developer or AI assistant

Share https://github.com/cchambruhs/fairway-friends and ask them to read this README, `AGENTS.md` and `docs/HANDOFF.md`. Download everything with **Code → Download ZIP**, or clone it. Public read access does not grant permission to push changes; collaborators can use pull requests or an invitation from the owner. An AI service may still require its GitHub connection to be enabled.

GitHub stores the source. Updating this repository does **not** automatically update Polsia or either live website; that requires a configured deployment integration.

## Deployment and ownership

The app uses Vinext/Vite, React, Cloudflare Workers, D1, R2 and ChatGPT Sites authentication. It is not a drop-in generic Next.js deployment. Read `docs/HANDOFF.md` before moving hosts, especially the trusted authentication boundary.

The original standalone deployment notes are historical and describe a different schema. Do not apply `db/schema.sql` to the web app database; use `apps/web/drizzle/`.

Project code is UNLICENSED unless otherwise stated. Public visibility is not an open-source license. Preserve the included third-party notices.
