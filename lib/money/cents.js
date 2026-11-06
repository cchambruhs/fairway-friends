/**
 * lib/money/cents.js
 *
 * Money in integer cents. Never floats.
 *
 * The PRD requires server-side integer-cent calculations, auditable ledgers,
 * duplicate-charge protection and transparent fee breakdowns.
 *
 * ============================================================================
 * LEGAL GATE — READ BEFORE WIRING THIS TO A PAYMENT PROVIDER
 * ============================================================================
 * The v3.0 PRD is explicit:
 *
 *   "Real-money competitions, betting, wallets, cash prizes, and related
 *    payment functionality must remain disabled until applicable legal,
 *    regulatory, and payment-provider requirements are satisfied. Build the
 *    underlying calculation engine separately from money movement."
 *
 * This module is the calculation engine only. It moves no money, holds no
 * balance, and calls no processor. Every fee-bearing path is gated behind
 * assertMoneyMovementEnabled(), which throws until a human flips the flag
 * after legal and provider sign-off.
 *
 * Nothing here is legal or tax advice. Fee and payout structures with
 * real-money prizes may be regulated in Indiana, Kentucky and Illinois, and
 * by payment processors' own rules. Get that reviewed by a qualified
 * professional before enabling any of it.
 * ============================================================================
 */

/** Global kill switch for anything that would move real money. */
export const MONEY_MOVEMENT_ENABLED = false;

export class MoneyMovementDisabledError extends Error {
  constructor(feature) {
    super(
      `Money movement is disabled (${feature}). Calculation only until legal ` +
        `and payment-provider requirements are satisfied.`
    );
    this.name = "MoneyMovementDisabledError";
    this.feature = feature;
  }
}

export function assertMoneyMovementEnabled(feature) {
  if (!MONEY_MOVEMENT_ENABLED) throw new MoneyMovementDisabledError(feature);
}

/** $20.00 -> 2000 */
export function toCents(dollars) {
  if (typeof dollars === "string") dollars = Number(dollars);
  if (typeof dollars !== "number" || !Number.isFinite(dollars)) {
    throw new TypeError(`toCents expects a number, got ${dollars}`);
  }
  return Math.round(dollars * 100);
}

/** 2000 -> "20.00" */
export function toDollars(cents) {
  assertCents(cents);
  return (cents / 100).toFixed(2);
}

export function assertCents(cents) {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`cents must be an integer, got ${cents}`);
  }
}

/**
 * Percentage of a cent amount, rounded half-up to the nearest cent.
 *
 * 10% of $20.00 (2000) -> 200 cents ($2.00), which is the PRD's worked
 * example: "a $20 league entry generates a $2 platform fee, for a total
 * player charge of $22 when collected in-app."
 */
export function percentOf(cents, percent) {
  assertCents(cents);
  return Math.round((cents * percent) / 100);
}

/* ---------------------------------------------------------------------------
 * League activation fee — one-time, by league size
 * ------------------------------------------------------------------------ */

export const ACTIVATION_TIERS = Object.freeze([
  { min: 1, max: 10, cents: 100, label: "1–10 players" },
  { min: 11, max: 20, cents: 500, label: "11–20 players" },
  { min: 21, max: Number.POSITIVE_INFINITY, cents: 5000, label: "21+ players" },
]);

/**
 * Activation fee for a given participant limit. The tier is chosen by the
 * league's enforceable participant limit, which is what makes the upgrade
 * mechanism meaningful when membership grows.
 */
export function activationFeeCents(playerCount) {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new RangeError(`playerCount must be a positive integer, got ${playerCount}`);
  }
  const tier = ACTIVATION_TIERS.find((t) => playerCount >= t.min && playerCount <= t.max);
  if (!tier) throw new RangeError(`no activation tier for ${playerCount} players`);
  return tier.cents;
}

/* ---------------------------------------------------------------------------
 * Platform fees
 * ------------------------------------------------------------------------ */

export const PAID_LEAGUE_FEE_PERCENT = 10;      // charged to players
export const STANDALONE_CARD_FEE_PERCENT = 4.5; // hosting fee on private cards
export const BETTING_POOL_FEE_PERCENT = 2.5;    // PROPOSED — disabled
export const PENALTY_PLATFORM_SHARE_PERCENT = 25; // PROPOSED — disabled, 75% to prize pool

/**
 * Full, itemised breakdown for a paid league entry. The PRD requires the app
 * to itemise all charges before payment, so this returns parts rather than a
 * single total.
 */
export function leagueEntryBreakdown(entryFeeCents, collectedInApp = true) {
  assertCents(entryFeeCents);
  const platformFee = percentOf(entryFeeCents, PAID_LEAGUE_FEE_PERCENT);

  return {
    entryFeeCents,
    platformFeeCents: platformFee,
    platformFeePercent: PAID_LEAGUE_FEE_PERCENT,
    collectedInApp,
    // Offline entry: the fee is still owed and must be tracked and settled
    // through a supported mechanism. That mechanism is NOT finalised in the
    // PRD, so we surface the obligation without pretending to collect it.
    playerChargeCents: collectedInApp ? entryFeeCents + platformFee : entryFeeCents,
    platformFeeOwedCents: platformFee,
    settlementMechanism: collectedInApp ? "in_app" : "unspecified_pending_decision",
    prizePoolContributionCents: entryFeeCents, // platform fee never enters the pool
  };
}

/**
 * Standalone paid scorecard. Worked example from the PRD:
 * six players at $10 -> $60 pool -> 4.5% hosting fee $2.70 -> $57.30 payout.
 */
export function standaloneCardBreakdown(totalPoolCents) {
  assertCents(totalPoolCents);
  const hostingFee = percentOf(totalPoolCents, STANDALONE_CARD_FEE_PERCENT);
  return {
    totalPoolCents,
    hostingFeeCents: hostingFee,
    hostingFeePercent: STANDALONE_CARD_FEE_PERCENT,
    payoutPoolCents: totalPoolCents - hostingFee,
  };
}

/**
 * Prize distribution.
 *
 * "fixed"        -> predetermined amount per finishing position
 * "proportional" -> a configured percentage per finishing position
 *
 * Both must sum to the payout pool exactly. We distribute the residual cent
 * to the highest finishing position so rounding can never make the parts
 * disagree with the whole.
 */
export function distributePrizes(payoutPoolCents, config) {
  assertCents(payoutPoolCents);
  const { method, positions } = config;

  if (!Array.isArray(positions) || positions.length === 0) {
    throw new TypeError("positions must be a non-empty array");
  }

  let amounts;
  if (method === "fixed") {
    amounts = positions.map((p) => {
      assertCents(p.cents);
      return p.cents;
    });
  } else if (method === "proportional") {
    amounts = positions.map((p) => percentOf(payoutPoolCents, p.percent));
  } else {
    throw new TypeError(`unknown prize method: ${method}`);
  }

  const sum = amounts.reduce((a, b) => a + b, 0);
  if (sum !== payoutPoolCents) {
    amounts[0] += payoutPoolCents - sum;
  }

  return positions.map((p, i) => ({
    position: p.position ?? i + 1,
    cents: amounts[i],
  }));
}

/**
 * Idempotency key for a chargeable event. The PRD requires duplicate-charge
 * protection and idempotent payment handling, so every charge carries a
 * deterministic key rather than a random one.
 */
export function chargeIdempotencyKey({ kind, leagueId, playerId, roundId }) {
  const parts = [kind, leagueId, playerId, roundId].filter(Boolean).map(String);
  if (parts.length < 2) throw new TypeError("need at least kind plus one entity id");
  return parts.join(":");
}

