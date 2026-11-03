# Verifying the outbound fetch — do this first

## Why this is the first task

The importer only works if our server can reach `udisc.com` over HTTPS at request time. No amount of parser quality changes that. If Polsia blocks outbound HTTP from the runtime, the whole import path is dead on arrival, and the right move is an edge function or a fetch proxy — not a UI built on an assumption.

The PRD states it plainly: **verify hosting permits the outbound fetch, and prove the parser against the reference link, before spending a build credit on UI.**

## Run it

From a shell on the production host (a Polsia terminal, an SSH session, or any way you can run Node inside that runtime):

```bash
node scripts/verify-fetch.mjs
```

## Read the exit code

| Exit | Meaning | Move |
| --- | --- | --- |
| `0` | Fetch works, score table present | Blocker cleared. Prove the parser against the body, then build UI. |
| `1` | Fetch works, page shape unexpected | Either UDisc changed markup or a bot challenge was served. Re-run with `SAVE_BODY=1` and inspect the HTML. |
| `2` | Fetch failed | **Stop.** Outbound fetch is blocked. Use an edge function or a fetch proxy. |

## What to paste back

Paste the whole script output. It is short and every line matters — the status code, the final URL after redirects, the content type, the byte count, the elapsed time, and the seven PASS/FAIL checks.

If it exits 1, also run:

```bash
SAVE_BODY=1 node scripts/verify-fetch.mjs
node scripts/extract-fixture.mjs scratch/udisc-live.html > fixtures/reference-cardcast.html
```

That captures the real markup as a fixture. The offline tests then run against the page UDisc actually serves, rather than against a reconstruction.

## If the fetch is blocked

The two honest options:

1. **Edge function.** A Cloudflare Worker (or equivalent) that fetches the page and returns the HTML, called by our server. Same parser, different transport.
2. **Fetch proxy.** A small always-on service outside the hosting platform that does the GET and returns the body.

Either way the parser does not change — it takes HTML and a URL. Only `fetchScorecardPage()` is swapped. That separation is deliberate: it is why the fetch is one function in one file rather than a bare `fetch()` in a route handler.

Do not ship a build where the import path cannot work. A disabled Import button with a clear explanation is better than a button that always errors.

## After the fetch is verified

The acceptance test, run end to end and reported honestly:

1. Import `https://udisc.com/scorecards/scorecard_mns8y9vb4afhk4v7lafcmk8n` → expect a scorecard for Angel Mounds, Blue Tees, Oct 20 2026, 18 holes, 5 players with totals 45 / 46 / 50 / 51 / 53.
2. Paste the identical link again → expect a duplicate block, nothing written.
3. Confirm with a real database readback, not with a success message.

**A claim of success without a saved scorecard behind it is not success.**
