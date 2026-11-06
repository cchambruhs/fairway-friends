/**
 * lib/scoring/fixed.js
 *
 * Fixed placement points — the PRD's DEFAULT system — plus the field-size
 * adjusted system the League Leader can choose instead.
 *
 *   1st=25, 2nd=20, 3rd=16, 4th=13, 5th=11, 6th=10, 7th=9, 8th=8,
 *   9th=7, 10th=6, then decrease by 1 with a floor of 1.
 *
 * Note the discontinuity between 3rd (16) and 4th (13), and between 5th (11)
 * and 6th (10). Those are the PRD's numbers, not a smooth curve — do not
 * "fix" them into an arithmetic sequence.
 *
 * Server-authoritative. Integer-ish points; no money here.
 */

/** Point value for a single finishing position (1-based). */
export const FIXED_PLACEMENT_TABLE = Object.freeze({
  1: 25,
  2: 20,
  3: 16,
  4: 13,
  5: 11,
  6: 10,
  7: 9,
  8: 8,
  9: 7,
  10: 6,
});

/** Floor for all other positions. */
export const FIXED_MINIMUM = 1;

/**
 * @param {number} position 1-based finishing position
 * @returns {number} points
 */
export function fixedPlacementPoints(position) {
  if (!Number.isInteger(position) || position < 1) {
    throw new RangeError(`position must be a positive integer, got ${position}`);
  }
  if (position <= 10) return FIXED_PLACEMENT_TABLE[position];
  // 11th onward: decrease by one per position, never below the floor.
  return Math.max(FIXED_MINIMUM, FIXED_PLACEMENT_TABLE[10] - (position - 10));
}

/**
 * Field-size adjusted points.
 *
 *   Points = 25 × (N − P) / (N − 1)
 *
 * First earns 25, last earns 0, and a single-player round awards 25
 * (the formula is undefined at N=1, so it is special-cased per the PRD).
 * Results are rounded to two decimals.
 *
 * @param {number} position 1-based
 * @param {number} fieldSize N, eligible players
 */
export function fieldAdjustedPoints(position, fieldSize) {
  if (!Number.isInteger(fieldSize) || fieldSize < 1) {
    throw new RangeError(`fieldSize must be a positive integer, got ${fieldSize}`);
  }
  if (!Number.isInteger(position) || position < 1 || position > fieldSize) {
    throw new RangeError(`position ${position} outside field of ${fieldSize}`);
  }
  if (fieldSize === 1) return 25;
  const raw = (25 * (fieldSize - position)) / (fieldSize - 1);
  return Math.round(raw * 100) / 100;
}

/**
 * Award points to a field, averaging tied players across the positions they
 * occupy — the PRD requires this for both systems.
 *
 * Lowest strokes determine placement.
 *
 * @param {Array<{playerId: string, strokes: number}>} results
 * @param {"fixed"|"field"} system
 */
export function awardPoints(results, system = "fixed") {
  if (!Array.isArray(results) || results.length === 0) return [];

  const sorted = results
    .slice()
    .sort((a, b) => a.strokes - b.strokes || String(a.playerId).localeCompare(String(b.playerId)));

  const n = sorted.length;
  const out = [];
  let i = 0;

  while (i < n) {
    // Find the run of equal strokes.
    let j = i;
    while (j + 1 < n && sorted[j + 1].strokes === sorted[i].strokes) j += 1;

    const occupied = [];
    for (let p = i + 1; p <= j + 1; p += 1) occupied.push(p);

    const perPosition = occupied.map((p) =>
      system === "fixed" ? fixedPlacementPoints(p) : fieldAdjustedPoints(p, n)
    );

    // Tied players share the average of the points for occupied positions.
    const avg = perPosition.reduce((a, b) => a + b, 0) / perPosition.length;
    const points = Math.round(avg * 100) / 100;

    for (let k = i; k <= j; k += 1) {
      out.push({
        playerId: sorted[k].playerId,
        position: i + 1, // shared rank: the best of the occupied positions
        strokes: sorted[k].strokes,
        tied: j > i,
        points,
      });
    }

    i = j + 1;
  }

  return out;
}

