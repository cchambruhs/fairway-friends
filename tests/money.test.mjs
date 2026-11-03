/**
 * tests/money.test.mjs
 *
 * Fee, activation and prize arithmetic — integer cents only.
 *
 *   node --test tests/
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  toCents,
  toDollars,
  percentOf,
  activationFeeCents,
  leagueEntryBreakdown,
  standaloneCardBreakdown,
  distributePrizes,
  chargeIdempotencyKey,
  assertMoneyMovementEnabled,
  MoneyMovementDisabledError,
} from "../lib/money/cents.js";

test("cents conversion is exact and never floats money", () => {
  assert.equal(toCents(20), 2000);
  assert.equal(toCents(0.99), 99);
  assert.equal(toCents("8"), 800);
  assert.equal(toDollars(2000), "20.00");
  assert.equal(toDollars(5730), "57.30");
});

test("percentOf rounds half-up to the cent", () => {
  assert.equal(percentOf(2000, 10), 200);  // $20 -> $2.00
  assert.equal(percentOf(6000, 4.5), 270); // $60 -> $2.70
  assert.equal(percentOf(999, 10), 100);   // 99.9 -> 100
});

/* ---------------------------------------------------------------------------
 * Activation tiers — $1 / $5 / $50
 * ------------------------------------------------------------------------ */

test("activation fee maps to the correct tier", () => {
  assert.equal(activationFeeCents(1), 100);
  assert.equal(activationFeeCents(10), 100);
  assert.equal(activationFeeCents(11), 500);
  assert.equal(activationFeeCents(20), 500);
  assert.equal(activationFeeCents(21), 5000);
  assert.equal(activationFeeCents(500), 5000);
});

test("activation fee rejects an invalid size", () => {
  assert.throws(() => activationFeeCents(0), RangeError);
  assert.throws(() => activationFeeCents(-5), RangeError);
  assert.throws(() => activationFeeCents(2.5), RangeError);
});

/* ---------------------------------------------------------------------------
 * Paid league entry — the PRD's own worked example
 * ------------------------------------------------------------------------ */

test("a $20 league entry generates a $2 fee, charged $22 in-app", () => {
  const b = leagueEntryBreakdown(toCents(20), true);
  assert.equal(b.entryFeeCents, 2000);
  assert.equal(b.platformFeeCents, 200);
  assert.equal(b.playerChargeCents, 2200);
  assert.equal(b.prizePoolContributionCents, 2000); // the fee never enters the pool
  assert.equal(b.settlementMechanism, "in_app");
});

test("an offline-collected entry still owes the fee, with no invented mechanism", () => {
  const b = leagueEntryBreakdown(toCents(20), false);
  assert.equal(b.playerChargeCents, 2000);   // no in-app charge added
  assert.equal(b.platformFeeOwedCents, 200); // but the obligation is tracked
  assert.equal(b.settlementMechanism, "unspecified_pending_decision");
});

test("a free league has no percentage fee", () => {
  const b = leagueEntryBreakdown(0, true);
  assert.equal(b.platformFeeCents, 0);
  assert.equal(b.playerChargeCents, 0);
});

test("all charges are itemised before payment", () => {
  const b = leagueEntryBreakdown(toCents(10), true);
  for (const key of [
    "entryFeeCents",
    "platformFeeCents",
    "platformFeePercent",
    "playerChargeCents",
  ]) {
    assert.ok(key in b, `breakdown should expose ${key}`);
  }
  assert.equal(b.playerChargeCents, b.entryFeeCents + b.platformFeeCents);
});

/* ---------------------------------------------------------------------------
 * Standalone paid card — the PRD's $57.30 example
 * ------------------------------------------------------------------------ */

test("six players at $10 yields a $57.30 payout pool", () => {
  const b = standaloneCardBreakdown(toCents(60));
  assert.equal(b.totalPoolCents, 6000);
  assert.equal(b.hostingFeeCents, 270);   // $2.70
  assert.equal(b.payoutPoolCents, 5730);  // $57.30
  assert.equal(b.hostingFeePercent, 4.5);
});

/* ---------------------------------------------------------------------------
 * Prize distribution
 * ------------------------------------------------------------------------ */

test("fixed prize amounts distribute exactly and honour the pool", () => {
  const out = distributePrizes(toCents(60), {
    method: "fixed",
    positions: [
      { position: 1, cents: 4000 },
      { position: 2, cents: 2000 },
    ],
  });
  assert.equal(out.reduce((a, b) => a + b.cents, 0), 6000);
});

test("proportional prizes sum to the pool after rounding", () => {
  const out = distributePrizes(5730, {
    method: "proportional",
    positions: [
      { position: 1, percent: 60 },
      { position: 2, percent: 25 },
      { position: 3, percent: 15 },
    ],
  });
  assert.equal(out.reduce((a, b) => a + b.cents, 0), 5730);
  // 60% -> 343.8 -> 344; 25% -> 143.3 -> 143; 15% -> 85.95 -> 86 = 573
  // residual cent lands on the highest position.
  assert.equal(out[0].cents, 344);
});

test("prize distribution rejects an unknown method and empty positions", () => {
  assert.throws(
    () => distributePrizes(1000, { method: "vibes", positions: [{ cents: 1000 }] }),
    TypeError
  );
  assert.throws(() => distributePrizes(1000, { method: "fixed", positions: [] }), TypeError);
});

/* ---------------------------------------------------------------------------
 * Idempotency + the legal gate
 * ------------------------------------------------------------------------ */

test("charge keys are deterministic so a duplicate cannot double-charge", () => {
  const key = { kind: "league_entry", leagueId: 7, playerId: 42, roundId: 3 };
  assert.equal(chargeIdempotencyKey(key), chargeIdempotencyKey(key));
  assert.notEqual(
    chargeIdempotencyKey(key),
    chargeIdempotencyKey({ ...key, playerId: 43 })
  );
});

test("a charge key needs at least two parts", () => {
  assert.throws(() => chargeIdempotencyKey({ kind: "league_entry" }), TypeError);
});

test("money movement is hard-disabled pending legal and provider sign-off", () => {
  assert.throws(
    () => assertMoneyMovementEnabled("prize payout"),
    MoneyMovementDisabledError
  );
});
