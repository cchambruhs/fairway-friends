# SDD ledger — plan: docs/superpowers/plans/2026-10-28-league-scoring.md

Task 1 complete: pure scoring, ties, exact fixed schedule, field formula, bonuses, championship multiplier, drops, best-N, season tiebreakers, playoffs and cent-exact payouts. Baseline 35 tests; scoring tests observed missing-module RED then GREEN.

Task 2 complete: authenticated create/join/start/submit/review/complete actions with revisioned D1 aggregates, private projections, source snapshots and additive migration. Lifecycle tests observed missing-module RED then GREEN.

Task 3 complete: league list, settings, invitation links, rule locking, both-system preview, submission dropdown, leader queue, point ledger, standings, player league tab. Desktop browser checks verified occupied-place preview, singleton25, public standings and ledger sections. Phone CSS implemented; no separate device-size browser run.

Task 4 code complete: CSV dates/offsets/padding, scores and totals, ratings, teams, conflict quarantine, unique name aliases, preview and resumable import batches; R2 profile uploads. Actual uploaded CSV has 440 distinct parsed blocks after one exact repeated block is removed, of which 435 are safe against the initial three seed cards and five blocks need review (two conflicting pairs and one total mismatch). This is a local plan count, not a hosted import result. Actual production CSV import remains pending: automatic approval review blocked a hosted /api/data fetch because it could read private app data without explicit hosted-QA authorization. No alternate hosted-data read was attempted.

Task 5 review: one fresh whole-branch reviewer reported six Important findings. All addressed with regression evidence: source refresh races are checked atomically with league revision; latest review snapshots and version tokens; enrich historical CSV cards under canonical IDs; hide private activity publicly; absolute timestamps for eligibility; quarantine disjoint same-minute rosters. Additional exact-name ambiguity and released-claim read flags were fixed. Source-race regression was explicitly run RED with guard removed, then restored and passed.

User steering: Friendly Competition now sorts all seven columns, toggles direction, sorts numeric PDGA numbers, keeps unavailable stats last, and exposes aria-sort. Three unit tests observed RED then GREEN; browser check verified round-count descending and ascending plus header state. The user supplied 20 scorecard links containing 19 unique URLs. All 19 public cards were fetched and parsed; five guest appearances are kept as unlinked per-card identities, without guessing registered accounts. The source seed is versioned and fingerprint-protected and applies once, preserving existing profiles. Guest-format and whitespace regression tests observed RED then GREEN.

Ruling: counted rounds means best N after dropping D lowest point results; bonuses are participation, exact birdies and aces; championship multiplier applies to base plus bonus — unspecified settings need visible consistent defaults — changing these conventions later would require a new season.

Ruling: wins/seconds/average finish use counted rounds; tied round average uses midrank; unresolved season ties require an explicitly recorded playoff order — keeps tiebreaking consistent with dropped results — alternative interpretations could change rankings and must be selected before a new season.

Ruling: latest explicit formulas supersede the earlier proposed beaten/tied points — follows user's exact implementation request — no ongoing leagues exist in source migration, so this introduces no mid-season scoring change.

Final minor deferred: dense formatting in some new modules follows the current repository's compact style; a formatting-only pass can improve maintainability without changing behavior.

Final validation before packaging: 73 tests passing; TypeScript check and production packaging are tracked by command output in the session. Publication pending native Sites workflow.
