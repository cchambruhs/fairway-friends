# Open-source reuse — what we looked at and what we took

The project brief asked for GitHub repositories with 950+ (and later 1,000+) stars to build from. This document records what was actually found, so the decision is auditable rather than a matter of taste.

## The finding

There is no high-star repository to build this on. The UDisc ecosystem on GitHub is small hobby projects, and none of them parse CardCast HTML. Verified star counts, November 2026:

| Repository | Language | Stars | What it does |
| --- | --- | --- | --- |
| `cclark20/disc-golf-data` | Python | 15 | Scrapes PDGA and UDisc live data |
| `IsakJacobsson/udisc-stats-analyzer` | Python | 2 | Analyses your own UDisc stats |
| `cardouken/udisctransformer` | Java | 2 | Converts UDisc CSV exports for DiscGolfMetrix |
| `sonikki/dgs2` | Python | 2 | Views UDisc CSV exports |
| `austin-stuff/udisc_stats` | Python | 2 | UDisc stats |
| `rbrambley/URD` | JavaScript | 2 | UDisc dashboard creator |
| `Choromanski/udisc-scorecards` | Shell | 1 | Archive of scorecard HTML |

The v3.0 PRD reached the same conclusion on its own: *"the UDisc ecosystem on GitHub is small hobby projects (largest ~15 stars); nothing there is worth forking. Own this parser."* That is the correct call, and this repo acts on it.

**Verdict: we own the parser.** It is roughly 200 lines of well-commented extraction against a documented table shape. Adding a dependency to solve a problem that size would import someone else's maintenance burden, licence obligations and design assumptions into the most business-critical path in the product.

## General-purpose libraries worth considering

These are the credible, high-star options if the parser ever needs a real DOM or a nicer fetch. None are taken today; this is the shortlist if that changes.

| Library | Stars | Licence | Why we did not take it |
| --- | --- | --- | --- |
| Cheerio | ~28k | MIT | A DOM would make extraction more robust in principle, but adds a dependency for a table this shallow. If UDisc's markup ever nests, this is the first thing to add — behind `extractTables()`, so no caller changes. |
| Zod | ~35k | MIT | Genuinely good candidate for validating the parsed round shape. Worth adding when the API layer lands, not for the parser itself, which already asserts strictly. |
| undici | ~7k | MIT | Node's built-in `fetch` already covers the single GET we need. |

## What we borrow instead of code

The durable win from other projects is not source, it is **shape knowledge**:

- The insight that UDisc scorecard data is already in public HTML, not behind an API.
- The handicap of relying on display names as identifiers — which is why this codebase keys players on `@udisc_username` and fails rather than guessing when a handle is missing.
- The pattern of capturing a real page as a committed fixture, so a markup change shows up as a failing test rather than a production incident.

## Licensing

This repository is currently `UNLICENSED` (all rights reserved) and private. No third-party source is vendored, so no upstream licence obligations attach. If that changes — if code is ever copied in — the licence and attribution line belongs in this file at the moment of copying, not later.

Before making the repository public, re-check every dependency's licence. It is cheap now and expensive after a release.
