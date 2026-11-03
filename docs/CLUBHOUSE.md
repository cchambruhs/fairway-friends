# Phase 2 — Clubhouse hub

Brief, and deliberately not built yet. The P0 import work comes first.

## What it is

Private groups with:

- A name and a joining code (`FAIRWAY-7K2Q` shape — 6 to 8 characters, no ambiguous characters such as `0`/`O` or `1`/`I`/`l`).
- A roster.
- A realtime message feed.
- 1-to-1 DMs.
- Read receipts and unread badges.
- Member contacts (phone, Messenger handle) visible **only** to that member and their Clubhouse admins.

## Security requirement

Row-level security so one Clubhouse can never query another's rows. This is a database-level guarantee, not an application-level filter — an application filter is one forgotten `WHERE` clause away from a breach. Enable RLS on every Clubhouse table and write the policy before the first row is inserted.

The contacts rule is narrower than the roster rule: a member can see *their own* contact details and an admin of their Clubhouse can see them. A fellow member cannot.

## Outbound sending is handoff only

Open the native share sheet, or SMS, or email, with the text pre-filled — or copy to clipboard on desktop. That is the whole feature.

**No server-sent SMS. No Facebook automation.** Both would mean holding credentials to send as the user, with the deliverability, consent and abuse problems that follow.

## Meta Messenger

A real Messenger integration requires a Meta app, app review, and platform approval — a weeks-long process outside our control. Not attempted. If it is ever wanted, it starts with a Meta developer account and a reviewed app, not with code in this repository.

## Joining code

6 to 8 characters from an unambiguous alphabet. Exclude `0`, `O`, `1`, `I`, `L` so a code read aloud over a phone is not mistyped. Generate with a CSPRNG, not `Math.random`. Uniqueness enforced by a database constraint, with retry on collision.

## Ordering

After the fetch is verified, the acceptance test passes with a real database readback, and the historical CSV is imported and deduplicated. Clubhouse features on top of an unproven import would multiply the debugging surface.
