# Deploy and integration notes

This repository is source of record. It is not yet wired into the Polsia app, and this document does not claim otherwise.

## What has to happen first

1. **Verify the outbound fetch** on the production host. `docs/VERIFY-FETCH.md`. This is the gate on everything else.
2. **Decide the relationship to the existing deployment.** If Polsia holds editable source, this scaffold merges into it. If it holds only a compiled bundle, this repo replaces it as the editable source — and "preserve existing data and working features during migration" means the database and the working ChatGPT-hosted importer are the things to preserve, not the bundle.
3. **Apply the schema.** `db/schema.sql` is additive. It creates `players`, `scorecards` and `scorecard_players`, and adds one integrity trigger. It drops nothing.
4. **Run the tests.** `npm test`. No network required. A failure here is a code problem, not an environment problem.

## Integrating the importer

The call site is deliberately small. On the server, in whatever route handles the import form:

```js
import { importFromLink } from "./lib/udisc/import.js";

const result = await importFromLink({ db }, { url: formData.get("url") });
```

`db` must expose `query(text, params)` and `connect()` returning a client with `query` and `release` — the `pg` package's Pool interface. Any equivalent works.

On error, show `err.userMessage`. Every failure path defines one, so no error reaches the user as a stack trace or a generic "something went wrong":

- "That doesn't look like a UDisc scorecard link."
- "Couldn't reach UDisc — try again."
- "This round is already in the database" (with a link and a Force re-import button)
- "Found 5 players but only 17 holes — the card may be unfinished."

On success, `result.message` is the whole confirmation: course, date, player count. `result.link` goes to the new scorecard.

## The import page

One text input, one button, one small link. Per the PRD:

- Input label: "Paste a UDisc CardCast link"
- Placeholder: `https://udisc.com/scorecards/scorecard_xxxxxxxx`
- Button: "Import scorecard"
- Beneath it: a small text link, "or paste a CSV instead", revealing a hidden textarea

Delete the old page entirely. No JSON box, no schema example, no CSV bulk importer, no explanatory copy, no preview panel — nothing surviving behind a toggle. Mobile-first, because this is used on phones at the course.

## Environment

Node 20 or later for the built-in `fetch` and `node --test`. No runtime dependencies are required by the code in this repo.

## Swapping the fetch later

If the fetch is blocked and an edge function or proxy is needed, only `fetchScorecardPage()` in `importers/udisc_cardcast.js` changes. It takes a URL and returns HTML. Everything downstream is unaffected — which is exactly why the fetch is one function rather than a bare `fetch()` in a route handler.

## Never claim deployed

This scaffold has not been deployed. It has not run against production UDisc or the production database. Say so plainly in any status update until it has, and report the acceptance test result as it actually comes back.

