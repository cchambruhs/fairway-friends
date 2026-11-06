# Known open issues

Honest state as of this scaffold. Nothing here is fixed until it is tested end to end and confirmed.

## Blocking

**Server-side outbound fetch to udisc.com is unverified.** Until `node scripts/verify-fetch.mjs` exits 0 on the production host, the import path is unproven. See [VERIFY-FETCH.md](VERIFY-FETCH.md).

**No scorecard has been saved from a CardCast link in Polsia.** The importer that works is on the ChatGPT-hosted reference site. The current Polsia importer renders a JSON paste box and a CSV bulk importer, states on screen that *"No scorecard data is retrieved from a pasted link"*, and has never saved a scorecard. This scaffold replaces that design; it has not yet run against production data.

**Historical CSV import is unconfirmed.** A UDisc export dated October 28, 2026 holds roughly 441 round records before validation and deduplication. It has not been imported and deduplicated against production. The long/wide format detection in `importers/udisc_csv.js` is written for both shapes but has not been exercised against the real file.

**Five Clubhouse scorecards exist only on the ChatGPT site.** The proven importer is the migration path for them, but that depends on the fetch being verified first.

## Open but not blocking

**Homepage "Enter the clubhouse" button points at the ChatGPT site.** A visitor to the paid site is sent straight off it. One-line fix, high impact, no dependency on anything else here.

**Polsia registration and login have produced errors.** Not investigated in this scaffold — no auth code exists here. Investigate before building on top of it.

**Cloudflare custom-domain connection and Polsia verification are unconfirmed.** `fairwayleagueplay.com` and `fairway-friends.polsia.app` are meant to serve the same app. Confirm both resolve to the current deployment, or visitors get a stale build.

**Complete editable source is not confirmed available.** Some exported artifacts are compiled deployment bundles. If the current build is only a bundle, this repo becomes the editable source of record rather than an addition to it. Confirm which it is before assuming a merge is possible.

**Location parsing is a heuristic.** `parseLocation()` accepts a "City, Region" shape and rejects obvious chrome. On a page with an unusual layout it may return nothing, which is recorded as `undefined` rather than a guess. Worth a real-page check once the fetch is live.

**Layout parsing is a heuristic.** Same story. "Blue Tees" is found by pattern. A missing layout is stored as `undefined`, never invented.

## Deliberately not attempted

**UDisc API integration.** There is no public UDisc API. The PRD forbids attempting this and the prohibition is correct.

**Live CardCast updates with a glowing red LIVE indicator.** In the PRD's future ideas. It needs polling, which means more outbound requests to a third party than the current design makes. Revisit after the basic import is proven.

**Meta Messenger integration.** Requires a Meta app and review. See [CLUBHOUSE.md](CLUBHOUSE.md).

**Real-money competitions, betting, wallets and cash prizes.** Disabled by design in `lib/money/cents.js`. See the legal gate note there.

## Implementation gaps the PRD itself leaves open

The v2.0 PRD's section 14 lists these as unresolved, and this scaffold does not invent answers:

- The exact meaning of activation pricing Option B.
- When activation fees are charged or adjusted as a league grows.
- How offline platform fees are collected. The code tracks the obligation and marks the mechanism `unspecified_pending_decision` rather than pretending.
- How refunds affect platform revenue.
- Whether Premium subscriptions are required at initial launch.
- Processor fees, refunds and chargebacks, and payment-provider restrictions.

`docs/OPEN-ISSUES.md` records that these are open. Resolving them is a product and legal decision, not an engineering one.

