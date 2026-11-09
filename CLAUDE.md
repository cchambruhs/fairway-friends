# Fairway Friends — notes for coding assistants

Read `README.md` first. `AGENTS.md` is Polsia's template contract (ownership zones, banned patterns such as Server Actions); follow it when editing this repo.

## Owner decisions (Caleb Chambers, 2026-11-09) that override PRD v4

- **Public Complete History:** every scorecard from every Clubhouse appears in the public history. Names show by default; a player can turn on "hide my name on public cards", and is then shown as "Player N" (their place on that card), with their UDisc username hidden too. Chat, DMs, photos, phone numbers and emails are never public.
- **Migration:** all cards from the ChatGPT site (~40) and the Polsia database end up in this database. Match by UDisc scorecard id and score fingerprint, never by display name. Every run produces a report.
- **Import UI:** CardCast link is the main path; CSV sits behind an "or paste a CSV" option. Remove the JSON paste importer.
- **Fantasy:** free, friends-only. No money fields, ever, without a new approved spec.
- **Payments:** stay disabled (Stripe module installed but off).
- **Hosting:** Polsia for now; keep everything portable to Vercel.

## Scoring (PRD v4 §5) — implemented in `src/lib/business/league-scoring.ts`

- Fixed: 25, 20, 16, 13, 11, 10, 9, 8, 7, 6; from 11th one fewer per place, minimum 1.
- Field-size: 25 × (N − P) / (N − 1); a one-player round earns 25.
- Ties average the occupied places' points, rounded to 2 decimals.
- Season: sum of every finalized round; tie-breaks are wins → second places → average placement → shared standing.

## Working rules

- Small, reviewable pull requests on a branch; never push to `main` directly.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` before opening a PR, and report failures honestly.
- Do not commit secrets, `.env*` (except `.env.example`), `node_modules`, builds or user uploads.
- Do not claim a deployment happened without checking the live site.
