/**
 * tests/scoring.test.mjs
 *
 * Competition scoring, ties and season standings — the two systems, per the
 * points tables and formulas in both PRD versions.
 *
 *   node --test tests/
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  fixedPlacementPoints,
  fieldAdjustedPoints,
  awardPoints,
} from "../lib/scoring/fixed.js";
import { buildStandings } from "../lib/scoring/season.js";

/* ---------------------------------------------------------------------------
 * Fixed placement — exact table from the PRD
 * ------------------------------------------------------------------------ */

test("fixed placement matches the PRD table exactly", () => {
  const expected = { 1: 25, 2: 20, 3: 16, 4: 13, 5: 11, 6: 10, 7: 9, 8: 8, 9: 7, 10: 6 };
  for (const [pos, pts] of Object.entries(expected)) {
    assert.equal(fixedPlacementPoints(Number(pos)), pts, `position ${pos}`);
  }
});

test("fixed placement decreases by one after 10th with a floor of 1", () => {
  assert.equal(fixedPlacementPoints(11), 5);
  assert.equal(fixedPlacementPoints(12), 4);
  assert.equal(fixedPlacementPoints(13), 3);
  assert.equal(fixedPlacementPoints(14), 2);
  assert.equal(fixedPlacementPoints(15), 1);
  assert.equal(fixedPlacementPoints(16), 1);
  assert.equal(fixedPlacementPoints(500), 1);
});

test("fixed placement rejects an invalid position", () => {
  assert.throws(() => fixedPlacementPoints(0), RangeError);
  assert.throws(() => fixedPlacementPoints(-3), RangeError);
  assert.throws(() => fixedPlacementPoints(2.5), RangeError);
});

/* ---------------------------------------------------------------------------
 * Field-size adjusted — Points = 25 × (N − P) / (N − 1)
 * ------------------------------------------------------------------------ */

test("field-adjusted: first earns 25, last earns 0", () => {
  assert.equal(fieldAdjustedPoints(1, 10), 25);
  assert.equal(fieldAdjustedPoints(10, 10), 0);
});

test("field-adjusted: a single-player round awards 25", () => {
  assert.equal(fieldAdjustedPoints(1, 1), 25);
});

test("field-adjusted: formula values for a field of 5", () => {
  // 25*(5-1)/4=25, 25*3/4=18.75, 25*2/4=12.5, 25*1/4=6.25, 25*0/4=0
  assert.equal(fieldAdjustedPoints(1, 5), 25);
  assert.equal(fieldAdjustedPoints(2, 5), 18.75);
  assert.equal(fieldAdjustedPoints(3, 5), 12.5);
  assert.equal(fieldAdjustedPoints(4, 5), 6.25);
  assert.equal(fieldAdjustedPoints(5, 5), 0);
});

test("field-adjusted rounds to two decimals", () => {
  assert.equal(fieldAdjustedPoints(2, 7), 20.83); // 25*5/6 = 20.8333...
});

test("field-adjusted rejects a position outside the field", () => {
  assert.throws(() => fieldAdjustedPoints(6, 5), RangeError);
  assert.throws(() => fieldAdjustedPoints(0, 5), RangeError);
  assert.throws(() => fieldAdjustedPoints(1, 0), RangeError);
});

/* ---------------------------------------------------------------------------
 * Placement from strokes + ties share averaged points
 * ------------------------------------------------------------------------ */

test("lowest strokes determine placement", () => {
  const awarded = awardPoints(
    [
      { playerId: "p1", strokes: 50 },
      { playerId: "p2", strokes: 45 },
      { playerId: "p3", strokes: 53 },
    ],
    "fixed"
  );
  assert.equal(awarded[0].playerId, "p2");
  assert.equal(awarded[0].position, 1);
  assert.equal(awarded[0].points, 25);
  assert.equal(awarded[2].playerId, "p3");
  assert.equal(awarded[2].points, 16);
});

test("tied players average the points for occupied positions (fixed)", () => {
  // Two players tied for 1st occupy 1st and 2nd: (25 + 20) / 2 = 22.5
  const awarded = awardPoints(
    [
      { playerId: "a", strokes: 45 },
      { playerId: "b", strokes: 45 },
      { playerId: "c", strokes: 50 },
    ],
    "fixed"
  );
  assert.equal(awarded[0].points, 22.5);
  assert.equal(awarded[1].points, 22.5);
  assert.equal(awarded[0].tied, true);
  assert.equal(awarded[1].tied, true);
  // Third player is unaffected and still scores as 3rd.
  assert.equal(awarded[2].points, 16);
  assert.equal(awarded[2].tied, false);
});

test("a three-way tie averages three positions (fixed)", () => {
  // 1st, 2nd, 3rd -> (25 + 20 + 16) / 3 = 20.333...
  const awarded = awardPoints(
    [
      { playerId: "a", strokes: 50 },
      { playerId: "b", strokes: 50 },
      { playerId: "c", strokes: 50 },
    ],
    "fixed"
  );
  assert.equal(awarded[0].points, 20.33);
  assert.equal(awarded[1].points, 20.33);
  assert.equal(awarded[2].points, 20.33);
});

test("tied players average the points for occupied positions (field-adjusted)", () => {
  // Field of 3, tie for 1st occupying 1st and 2nd: (25 + 12.5) / 2 = 18.75
  const awarded = awardPoints(
    [
      { playerId: "a", strokes: 45 },
      { playerId: "b", strokes: 45 },
      { playerId: "c", strokes: 50 },
    ],
    "field"
  );
  assert.equal(awarded[0].points, 18.75);
  assert.equal(awarded[1].points, 18.75);
  assert.equal(awarded[2].points, 0);
});

test("awardPoints handles an empty field", () => {
  assert.deepEqual(awardPoints([], "fixed"), []);
});

/* ---------------------------------------------------------------------------
 * Season standings
 * ------------------------------------------------------------------------ */

function result(playerId, position, points, finalized = true, strokes = 50) {
  return { playerId, position, points, strokes, finalized };
}

test("unfinalized rounds generate NO official points", () => {
  const { official, provisional, excludedUnfinalized } = buildStandings([
    result("a", 1, 25, true),
    result("b", 2, 20, false), // pending League-Leader approval
  ]);

  assert.equal(excludedUnfinalized, 1);
  assert.equal(official.length, 1);
  assert.equal(official[0].playerId, "a");
  assert.equal(official[0].points, 25);
  // The provisional view includes the pending round, labelled distinctly.
  assert.equal(provisional.length, 2);
});

test("every eligible completed round counts, with no dropped rounds", () => {
  const { official } = buildStandings([
    result("a", 1, 25),
    result("a", 5, 11), // a bad round still counts
    result("a", 3, 16),
  ]);
  assert.equal(official[0].points, 52);
  assert.equal(official[0].rounds, 3);
});

test("highest cumulative points wins", () => {
  const { official } = buildStandings([
    result("a", 1, 25),
    result("a", 2, 20),
    result("b", 1, 25),
    result("b", 1, 25),
  ]);
  assert.equal(official[0].playerId, "b");
  assert.equal(official[0].points, 50);
  assert.equal(official[1].playerId, "a");
});

test("tiebreak chain: wins, then seconds, then average placement", () => {
  // Equal points; a has more wins -> a ranks first.
  const byWins = buildStandings([
    { playerId: "a", position: 1, points: 25, strokes: 45, finalized: true },
    { playerId: "a", position: 4, points: 13, strokes: 55, finalized: true },
    { playerId: "b", position: 2, points: 20, strokes: 46, finalized: true },
    { playerId: "b", position: 3, points: 16, strokes: 48, finalized: true },
  ]).official;
  assert.equal(byWins[0].points, 38);
  assert.equal(byWins[1].points, 38);
  assert.equal(byWins[0].playerId, "a"); // 1 win vs 0
  assert.equal(byWins[0].wins, 1);

  // Equal points and wins; a has more seconds -> a ranks first.
  const bySeconds = buildStandings([
    { playerId: "a", position: 2, points: 20, strokes: 46, finalized: true },
    { playerId: "a", position: 5, points: 11, strokes: 57, finalized: true },
    { playerId: "b", position: 1, points: 25, strokes: 45, finalized: true },
    { playerId: "b", position: 8, points: 6, strokes: 60, finalized: true },
  ]).official;
  assert.equal(bySeconds[0].playerId, "a");
  assert.equal(bySeconds[0].seconds, 1);
});

test("remaining ties share a rank and are flagged", () => {
  const { official } = buildStandings([
    { playerId: "a", position: 3, points: 16, strokes: 48, finalized: true },
    { playerId: "b", position: 3, points: 16, strokes: 48, finalized: true },
  ]);
  assert.equal(official[0].rank, 1);
  assert.equal(official[1].rank, 1);
  assert.equal(official[0].sharedRank, true);
  assert.equal(official[1].sharedRank, true);
});

test("rankings skip numbers after a shared rank", () => {
  const { official } = buildStandings([
    { playerId: "a", position: 1, points: 25, strokes: 45, finalized: true },
    { playerId: "b", position: 1, points: 25, strokes: 45, finalized: true },
    { playerId: "c", position: 3, points: 16, strokes: 50, finalized: true },
  ]);
  assert.equal(official[0].rank, 1);
  assert.equal(official[1].rank, 1);
  assert.equal(official[2].rank, 3); // 2nd is skipped
});

test("a missed round adds nothing rather than penalising", () => {
  const withMiss = buildStandings([
    result("a", 1, 25),
    result("b", 2, 20),
    result("b", 3, 16),
  ]).official;
  const b = withMiss.find((r) => r.playerId === "b");
  assert.equal(b.points, 36);
  assert.equal(b.rounds, 2);
});

test("standings reject a non-array", () => {
  assert.throws(() => buildStandings(null), TypeError);
});
