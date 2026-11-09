# Public Clubhouse Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.
**Goal:** Public read/card imports and rich honest player dashboards.
**Architecture:** Existing Vinext/D1 app. Public add-only ingestion, protected owner updates, pure profile analytics.
**Tech Stack:** React, D1, Chart.js, existing UDisc parser.
**Spec:** docs/superpowers/specs/2026-10-27-public-profiles.md
## Global Constraints
- Preserve all existing rounds; never trust caller scores in public requests.
- Card IDs are unique in database; public repeats cannot overwrite existing data.
- CSV, refresh and player-link changes require authenticated owner email.
- Distance is course metadata, never measured throwing/walking distance.
## Review Focus
- Concurrent duplicate imports must produce one row.
- Partial/null holes must not invent activity or inflate full-round averages.
- Missing distances and zero denominators show unavailable, not invented zero.
- Browser-origin and JSON body checks, bounded request reads, per-IP D1 rate limit.
- Public site must not expose owner-only player mutation endpoints.
### Task 1: Data and guardrails
- [ ] Test distance parsing, missing distances, partial activity, streak boundaries, bounce-back denominator, duplicate URL normalization and owner policy RED.
- [ ] Implement lib/profile-stats.mjs, distance fields in lib/disc.mjs, lib/policy.mjs, lib/api.ts.
- [ ] Add D1 import_limits migration; implement atomic add-only public import and owner CSV/refresh paths.
### Task 2: Player dashboard
- [ ] Build app/player-dashboard.tsx and responsive styles. Replace old small modal. Add shareable player URLs, owner-only editing and public labels.
- [ ] Enrich existing seven cards with verified hole distance metadata, with no score or roster changes.
### Task 3: Verify and publish
- [ ] Run full unit suite, type check, build and migration. Browser-test profile, anonymous card import, duplicate and public player-edit rejection.
- [ ] Independent code review; fix important findings with regression tests.
- [ ] Publish protected implementation while site is private, then set access public through native tool. Verify anonymous GET/POST and unchanged row count on duplicates.
