/**
 * UDisc CardCast link validation.
 *
 * The ONLY acceptable input is a public scorecard URL of the form:
 *   https://udisc.com/scorecards/scorecard_<id>
 *
 * Anything else is rejected before a network call is made. This is a
 * security boundary as much as a UX one: the pasted URL becomes a
 * server-side fetch target, so an unvalidated value is an SSRF vector.
 *
 * The lookalike-host test (`udisc.com.attacker.example`) is the one that
 * matters most — a naive `endsWith("udisc.com")` check passes it.
 */

export const UDISC_HOST = "udisc.com";

/** Scorecard ids observed in the wild look like `mns8y9vb4afhk4v7lafcmk8n`. */
const SCORECARD_ID = /^[a-z0-9]{8,64}$/i;

/** Path prefix is `scorecard_` followed by the id. */
const SCORECARD_PATH = /^\/scorecards\/scorecard_([a-z0-9]{8,64})$/i;

export class InvalidScorecardLinkError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidScorecardLinkError";
    // User-facing copy per R8. Kept here so every caller shows the same string.
    this.userMessage = "That doesn't look like a UDisc scorecard link.";
  }
}

/**
 * Normalise a pasted value into a canonical HTTPS URL.
 *
 * Accepts a bare `udisc.com/...` or `www.udisc.com/...` with no scheme,
 * because people paste what the share sheet gave them. Rejects http,
 * non-udisc hosts, lookalike hosts, and any path that is not a scorecard.
 *
 * @param {string} raw
 * @returns {{ url: string, roundId: string }}
 * @throws {InvalidScorecardLinkError}
 */
export function normaliseScorecardUrl(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new InvalidScorecardLinkError("Empty input");
  }

  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new InvalidScorecardLinkError("Unparseable URL");
  }

  if (parsed.protocol !== "https:") {
    throw new InvalidScorecardLinkError("Only https is accepted");
  }

  // Exact host match. Do NOT use endsWith — that would accept
  // `udisc.com.attacker.example`.
  const host = parsed.hostname.toLowerCase();
  if (host !== UDISC_HOST && host !== `www.${UDISC_HOST}`) {
    throw new InvalidScorecardLinkError("Host is not udisc.com");
  }

  // Strip a trailing slash and any query/fragment noise.
  const path = parsed.pathname.replace(/\/+$/, "");
  const match = SCORECARD_PATH.exec(path);
  if (!match) {
    throw new InvalidScorecardLinkError("Path is not a scorecard permalink");
  }

  const roundId = match[1].toLowerCase();
  if (!SCORECARD_ID.test(roundId)) {
    throw new InvalidScorecardLinkError("Malformed scorecard id");
  }

  return { url: `https://${UDISC_HOST}/scorecards/scorecard_${roundId}`, roundId };
}

/**
 * Shape-check a round for the failure modes the PRD calls out explicitly.
 *
 * The headline case: "Found 5 players but only 17 holes — the card may be
 * unfinished." We never pad a short card, and we never save it.
 *
 * @param {{ holes: Array, players: Array }} round
 * @throws {Error} with a .userMessage suitable for display
 */
export function assertRoundIsComplete(round) {
  const holeCount = round.holes?.length ?? 0;
  const players = round.players ?? [];

  if (holeCount === 0) {
    const err = new Error("No holes parsed");
    err.userMessage = "Couldn't read that scorecard — the page layout may have changed.";
    throw err;
  }

  if (players.length === 0) {
    const err = new Error("No players parsed");
    err.userMessage = "Couldn't read that scorecard — the page layout may have changed.";
    throw err;
  }

  for (const player of players) {
    const strokes = player.strokes?.length ?? 0;
    // Strict equality, both directions. A long card is as broken as a short one.
    if (strokes !== holeCount) {
      const err = new Error(
        `Player ${player.displayName} has ${strokes} strokes for ${holeCount} holes`
      );
      err.userMessage = `Found ${players.length} players but only ${strokes} holes — the card may be unfinished.`;
      throw err;
    }
  }

  // Totals must agree with the strokes we read, or we misparsed the row.
  for (const player of players) {
    const summed = player.strokes.reduce((a, b) => a + b, 0);
    if (summed !== player.totalStrokes) {
      const err = new Error(
        `Player ${player.displayName} strokes sum to ${summed} but total reads ${player.totalStrokes}`
      );
      err.userMessage = "Couldn't read that scorecard — the page layout may have changed.";
      throw err;
    }
  }

  return true;
}
