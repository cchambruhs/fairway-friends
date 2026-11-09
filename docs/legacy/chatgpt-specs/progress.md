# Fairway Friends progress
Plan: docs/superpowers/plans/2026-10-27-fairway.md
Task 1 complete: real three-card fixtures parse; original 9 tests green. Independent review identified malformed row acceptance and cross-source duplicates; 3 regression tests observed red then green. Suite 12/12.
Task 2 complete: D1 schema migration generated, local migration applied; persistent data API seeded real cards. Browser writes enforce identity plus same-origin writes. Origin-free service writes rely on the confirmed owner-private Sites boundary, as supported by Sites service-access guidance. Live official API sync remains unconfigured, clearly disclosed in app.
Task 3 complete: responsive dashboard, rounds, crew, head-to-head, courses, charting and import dialogs. Browser confirmed 3 rounds/9 players, Dad/Connor 1 tie in 2 rounds, no duplicate on existing link. Phone layout inspected at 390px iframe viewport.
Ruling: Use shared-link imports on demand, not automatic round discovery, as user approved; automatic discovery remains unavailable without supported upstream access.
Ruling: Only Devin's PDGA username match is verified; Caleb #312086 and Zachary #145505 are candidates requiring confirmation. Wrong identities would misattribute official stats, so no speculative auto-linking.
Review fixes: reject all malformed player rows; reconcile CSV sessions/layouts to existing cards while retaining other players. No deferred reviewer findings.

Ruling: Keep this deployment owner-private. Origin-free shared-data writes rely on dispatch service authentication; browser requests still require identity. Do not make public without adding separate write authorization.

# Public clubhouse / player dashboards
Spec and plan: 2026-10-27-public-profiles.md. User explicitly authorized public access and anonymous card-link submissions.
Owner protection: authenticated owner email matches runtime OWNER_EMAIL secret. Missing identity/config fails closed. Public data omits unconfirmed identity candidates. CSV, refresh and PDGA changes require owner authentication. No no-Origin admin bypass remains.
Public imports: bounded link-only JSON, strict UDisc URL allowlist, D1 per-IP rate limits, immutable duplicates. Card PK and canonical fingerprint unique index prevent concurrent duplicates; fingerprint includes true layout ID, date, pars and sorted player scores. Round and player inserts share one transactional D1 batch.
Distance: 7 existing exact cards enriched from visible hole lengths; new imports parse per-hole lengths. No actual throwing/walking distance is invented. Profile has 3 views, scoring charts, course records, rivalries, badges, activity and streak metrics. Shareable player query URLs verified. Public profile changes remain owner-only.
Independent review found 3 important duplicate/persistence issues. All fixed: layout-aware fingerprint uniqueness and transactional saves. Real Miniflare D1 tests verified concurrent equivalent cards insert once and injected player-write failure rolls back the round. Full suite 26/26 green.
Browser QA: desktop and 390px phone profile layout inspected; rivalry profile switching works, public import shows no CSV/refresh controls, known card with extra query is skipped with explicit no-duplicate result. Final build and deployment/access verification follow.

Live public verification identified a one-time first-load backfill error: returning thenable Drizzle builders from an async map executed updates early, then passed results to batch. Replaced with a tested raw D1 backfill that computes hashes first and batches prepared statements once. A fresh-database/idempotency regression was observed red then green.

# October 28 additional rounds and player bags
Imported 9 new cards from the 10 provided links; skipped the saved Woodmere card. Verified 16 saved rounds and 17 players. Added strict support for UDisc's 10-character case-sensitive legacy card URLs, preserving domain/path restrictions and fingerprint deduplication. Three legacy URL/real-card regressions observed red then green; published legacy-link fix e3bb4f2 before importing the six short links.
Added player bags with up to five ordered discs (mold, manufacturer, plastic, optional grams), a favorite manufacturer or explicitly self-reported sponsor, sign-in/self-claim, claimant-only edits and host override/release. Self-claims are not represented as verified UDisc identity. Public bag responses do not expose account IDs. Raw D1 unique constraints protect simultaneous claims and one profile per account; conditional SQL saves prevent stale ownership writes.
Full suite: 35 tests passed, including real D1 claim races, unauthorized edits, release/reclaim, and validation. Independent read-only reviewer found no important issues. Browser QA, final build and publication follow.
