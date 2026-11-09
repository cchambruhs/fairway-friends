# League Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship configurable, transparent league scoring with submission, approval, standings and preview.
**Architecture:** Pure scoring functions shared by server and preview. Revisioned D1 league aggregates provide atomic transitions with private identities stripped at API boundary. Add responsive league UI and player league summaries.
**Tech Stack:** Existing Vinext/React, D1, Node tests, Chart.js.
**Spec:** docs/superpowers/specs/2026-10-28-scoring-system.md

## Global Constraints
- Fixed default: 25,20,16,13,11,10,9,8,7,6 then decreasing by 1 to minimum 1.
- Field points = 25*(N-placement)/(N-1); singleton 25; final values two decimals.
- Completed and leader-approved only; methods/settings locked at Start; preserve existing data and public access.

## Review Focus
- Concurrent approval/settings changes cannot bypass locked rules.
- Ties through paid/unpaid positions reconcile points and cents.
- Fewer rounds than configured drops must show zero counted results clearly.
- Player claims changing must not leak private identities or permit taking over leadership.
- Stored canonical card refresh invalidates an approval before standings change.

### Task 1: Scoring engine
Files: lib/league-scoring.mjs, tests/league-scoring.test.mjs.
Interfaces: normalizeRules(input), roundPoints(players,pars,rules,championship), leagueStandings(league), calculatePayouts(standings,payout).
- [ ] Write tests for fixed positions 1–20, field fractions/singleton, ties, bonuses, multipliers, incomplete exclusion, drop/best N, all tiebreaks and payout cents.
- [ ] Run `node --test tests/league-scoring.test.mjs`; expect missing-module FAIL.
- [ ] Implement functions and run same tests; expect PASS; commit.

### Task 2: Durable league lifecycle
Files: lib/leagues.mjs, app/api/leagues/route.ts, db/schema.ts, drizzle migration, tests/leagues.test.mjs.
Interfaces: mutateLeague(db,user,action), readLeagues(db,user); consumes engine from task 1.
- [ ] Write D1 tests for create/join/start/submit/review/finalize, role checks, rejected duplicates, frozen settings, race conflicts, identity redaction and snapshots.
- [ ] Run `node --test tests/leagues.test.mjs`; expect missing-module FAIL.
- [ ] Implement revisioned aggregate and authenticated endpoint; run tests and full existing suite; expect PASS; commit.

### Task 3: Dashboard and preview
Files: app/league-dashboard.tsx, app/dashboard.tsx, app/player-dashboard.tsx, app/globals.css.
Interfaces: GET/POST /api/leagues; shared engine preview. PlayerLeagueSummary(username) component.
- [ ] Build league list/detail, create/settings with both previews, invitation join, submissions/review, standings, transparent point ledger, championship and payout settings.
- [ ] Add Personal and Leagues navigation, player League tab and import league selector. Preserve existing public import and owner CSV controls.
- [ ] Run TypeScript check and build; expect PASS. Browser QA phone/desktop and league workflow; commit.

### Task 4: History and photos
Files: lib/disc.mjs, CSV tests, profile-photo APIs/UI and storage declaration.
- [ ] Add actual export regression fixtures/tests before parsing changes; handle date format, padding, duplicates, ratings and teams. Preview then import safe history while keeping ambiguous identities distinct.
- [ ] Add profile upload ownership/type/size tests before implementation. Add durable photo storage and fallback; no unsupported PDGA photo promise.
- [ ] Run full suite, type check and build; expect PASS; commit.

### Task 5: Review and publication
- [ ] Fresh whole-branch reviewer checks spec and diffs; fix important findings with regression tests.
- [ ] Merge verified branch, package exact source with Sites helper, publish existing public Site; verify returned terminal status.
- [ ] Report scoring defaults, limitations and import totals.
