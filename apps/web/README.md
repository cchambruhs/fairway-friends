# Fairway Friends web application

Recovered editable source from ChatGPT Sites version 8, commit `6cbf4850ca36504c950d1547592a0e92759492c0`. See the [repository README](../../README.md) and [handoff](../../docs/HANDOFF.md).

## Local setup

Use Node >=22.13 (24 recommended) and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Initialize the local D1 database by executing **each** SQL file in `drizzle/` in filename order, from `0000_flippant_talisman.sql` through `0007_clubhouses.sql`. Example for the first file:

```sh
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_flippant_talisman.sql
```

Repeat with each subsequent filename; do not reapply these SQL files blindly to an existing database. Production migration needs backups and migration tracking. Then run:

```sh
pnpm dev
```

Visit `/signin-with-chatgpt?return_to=/` on the local server for the development-only `local_seedy` identity. Owner-only actions also require `OWNER_EMAIL` to match that identity. For local work only, put `OWNER_EMAIL=seedy@sites.test` in an ignored `.dev.vars` file. Production requires the actual owner email and trusted authentication infrastructure. Mock sign-in is not shipped in production builds.

## Commands

- `pnpm test`: app regression and local Cloudflare persistence tests.
- `pnpm build`: production Worker/client build.
- `pnpm dev`: local development server.
- `pnpm start`: preview the built Worker locally; does not deploy or simulate sign-in.

The checked-in `.openai/hosting.json` identifies the existing ChatGPT Site and its DB/BUCKET bindings. Do not deploy a fork to that Site ID. Other hosting requires configuring your own Worker, D1, R2 and identity provider.

`docs/STARTER.md` preserves the original generic starter documentation for reference. Some starter installation descriptions predate the current pnpm lockfile; use the commands above.
