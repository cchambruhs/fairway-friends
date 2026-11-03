/**
 * tests/parser.test.mjs
 *
 * Offline parser tests. These run with NO network access, against a fixture
 * built to the PRD's reference payload, so they are safe to run anywhere and
 * catch a markup regression the moment the shape changes.
 *
 *   node --test tests/
 *
 * The fixture is deliberately shaped like the real CardCast page: decoy
 * layout tables before the scoring table, the Total header cell, the to-par
 * column, and a weather row. Those are the things that actually break parsers.
 *
 * NOTE: the fixture is generated in code rather than committed as HTML, so it
 * stays readable and reviewable. scripts/extract-fixture.mjs turns a real
 * captured page into a committed fixture once the hosting fetch is verified —
 * swap this generator for that file at that point.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parseScorecard, ParseError } from "../importers/udisc_cardcast.js";
import { normaliseScorecardUrl, assertRoundIsComplete } from "../lib/udisc/url.js";

const REFERENCE_ID = "mns8y9vb4afhk4v7lafcmk8n";
const REFERENCE_URL = `https://udisc.com/scorecards/scorecard_${REFERENCE_ID}`;

/* ---------------------------------------------------------------------------
 * Fixture — 18 holes, 5 players, matching the PRD's reference payload
 * ------------------------------------------------------------------------ */

const HOLES = [
  [1, 213, 3], [2, 275, 3], [3, 180, 3], [4, 265, 4], [5, 205, 3],
  [6, 240, 3], [7, 310, 4], [8, 165, 3], [9, 230, 3], [10, 255, 3],
  [11, 190, 3], [12, 285, 4], [13, 210, 3], [14, 175, 3], [15, 260, 4],
  [16, 195, 3], [17, 225, 3], [18, 220, 3],
];

// Totals per the PRD: 45 / 46 / 50 / 51 / 53 on a par-55 layout.
const PLAYERS = [
  { pos: 1, name: "Devin Devin", handle: "@devin47", strokes: [2,3,2,3,2,2,3,2,2,3,2,3,2,2,3,2,2,3], total: 45, toPar: -10 },
  { pos: 2, name: "Dad", handle: "@cchambruhs", strokes: [3,3,2,3,2,3,3,2,3,2,3,3,2,3,3,2,3,2], total: 46, toPar: -9 },
  { pos: 3, name: "Mdub1807", handle: "@mdub1807", strokes: [3,4,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3], total: 50, toPar: -5 },
  { pos: 4, name: "Will", handle: "@rashad032", strokes: [3,3,3,3,3,3,4,3,3,3,3,3,3,3,4,3,3,3], total: 51, toPar: -4 },
  { pos: 5, name: "TG", handle: "@mk3492", strokes: [3,3,3,3,3,3,4,3,3,3,3,4,3,3,4,3,3,3], total: 53, toPar: -2 },
];

function holeCell([number, distance, par]) {
  return `<td>${number} ${distance} ${par}</td>`;
}

function buildFixture({ players = PLAYERS, holes = HOLES, includeWeather = true } = {}) {
  const headerCells = [
    `<td>Hole</td>`,
    `<td>Player</td>`,
    ...holes.map(holeCell),
    // The Total cell. Counting this as a hole is the classic break.
    `<td>Total 3485 55</td>`,
  ].join("");

  const rows = players.map((p) => {
    const strokes = p.strokes.map((s) => `<td>${s}</td>`).join("");
    return `<tr><td>${p.pos}</td><td>${p.name} ${p.handle}</td>${strokes}<td>${p.toPar}</td><td>${p.toPar} (${p.total})</td></tr>`;
  });

  const weather = includeWeather
    ? `<tr><td>72°F</td><td>6 mph</td><td>1h 17m</td></tr>`
    : "";

  // Two decoy layout tables, so "first table on the page" fails and only
  // "largest table" succeeds.
  const navTable = `<table><tr><td>Home</td><td>Courses</td></tr><tr><td>Sign in</td><td>Sign up</td></tr></table>`;
  const footerTable = `<table><tr><td>About</td></tr><tr><td>Privacy</td></tr></table>`;

  return `<!doctype html>
<html>
<head>
  <title>Angel Mounds Disc Golf Course | UDisc</title>
  <meta name="description" content="Scorecard for Angel Mounds Disc Golf Course">
</head>
<body>
  ${navTable}
  <h1>Angel Mounds Disc Golf Course</h1>
  <a href="/courses/angel-mounds-disc-golf-course-dJv8">Course page</a>
  <div>Blue Tees</div>
  <div>Oct 20, 2026 4:06 PM</div>
  <div>Evansville, Indiana</div>
  <table>
    <tr>${headerCells}</tr>
    ${rows.join("\n    ")}
    ${weather}
  </table>
  ${footerTable}
</body>
</html>`;
}

/* ---------------------------------------------------------------------------
 * URL validation
 * ------------------------------------------------------------------------ */

test("accepts a canonical scorecard URL", () => {
  const { url, roundId } = normaliseScorecardUrl(REFERENCE_URL);
  assert.equal(url, REFERENCE_URL);
  assert.equal(roundId, REFERENCE_ID);
});

test("accepts a scheme-less paste", () => {
  const { roundId } = normaliseScorecardUrl(`udisc.com/scorecards/scorecard_${REFERENCE_ID}`);
  assert.equal(roundId, REFERENCE_ID);
});

test("accepts www and a trailing slash", () => {
  const { roundId } = normaliseScorecardUrl(
    `https://www.udisc.com/scorecards/scorecard_${REFERENCE_ID}/`
  );
  assert.equal(roundId, REFERENCE_ID);
});

test("rejects a lookalike host (SSRF guard)", () => {
  assert.throws(
    () => normaliseScorecardUrl(`https://udisc.com.attacker.example/scorecards/scorecard_${REFERENCE_ID}`),
    /UDisc scorecard link/
  );
});

test("rejects http, non-udisc hosts, and non-scorecard paths", () => {
  for (const bad of [
    `http://udisc.com/scorecards/scorecard_${REFERENCE_ID}`,
    `https://example.com/scorecards/scorecard_${REFERENCE_ID}`,
    `https://udisc.com/courses/angel-mounds-disc-golf-course-dJv8`,
    `https://udisc.com/scorecards/`,
    `https://udisc.com/scorecards/scorecard_short`,
    "",
    "not a url",
  ]) {
    assert.throws(
      () => normaliseScorecardUrl(bad),
      { name: "InvalidScorecardLinkError" },
      `should reject: ${bad}`
    );
  }
});

test("rejects a subpath beyond the scorecard permalink", () => {
  assert.throws(() =>
    normaliseScorecardUrl(`https://udisc.com/scorecards/scorecard_${REFERENCE_ID}/edit`)
  );
});

/* ---------------------------------------------------------------------------
 * Parsing
 * ------------------------------------------------------------------------ */

test("parses the reference payload exactly as the PRD specifies", () => {
  const round = parseScorecard(buildFixture(), REFERENCE_URL);

  assert.equal(round.sourceRoundId, REFERENCE_ID);
  assert.equal(round.courseName, "Angel Mounds Disc Golf Course");
  assert.equal(round.layout, "Blue Tees");
  assert.equal(round.location, "Evansville, Indiana");
  assert.equal(
    round.sourceCourseUrl,
    "https://udisc.com/courses/angel-mounds-disc-golf-course-dJv8"
  );

  // 18 holes, never 19 — the Total cell must not have been counted.
  assert.equal(round.holes.length, 18);
  assert.equal(round.holes[0].number, 1);
  assert.equal(round.holes[0].distance, 213);
  assert.equal(round.holes[0].par, 3);
  assert.equal(round.holes[17].number, 18);

  assert.equal(round.players.length, 5);

  const expected = [
    { pos: 1, name: "Devin Devin", handle: "@devin47", total: 45, toPar: -10 },
    { pos: 2, name: "Dad", handle: "@cchambruhs", total: 46, toPar: -9 },
    { pos: 3, name: "Mdub1807", handle: "@mdub1807", total: 50, toPar: -5 },
    { pos: 4, name: "Will", handle: "@rashad032", total: 51, toPar: -4 },
    { pos: 5, name: "TG", handle: "@mk3492", total: 53, toPar: -2 },
  ];

  for (let i = 0; i < expected.length; i += 1) {
    const e = expected[i];
    const p = round.players[i];
    assert.equal(p.position, e.pos, `player ${i} position`);
    assert.equal(p.displayName, e.name, `player ${i} display name`);
    assert.equal(p.udiscUsername, e.handle, `player ${i} handle`);
    assert.equal(p.totalStrokes, e.total, `player ${i} total`);
    assert.equal(p.toPar, e.toPar, `player ${i} to-par`);
    assert.equal(p.strokes.length, 18, `player ${i} stroke count`);
  }

  // The date is stored as a real timestamp, not a string.
  assert.ok(round.playedAt, "playedAt should be present");
  assert.equal(new Date(round.playedAt).getUTCFullYear(), 2026);
});

test("the Total header cell is never treated as a hole", () => {
  const round = parseScorecard(buildFixture(), REFERENCE_URL);
  assert.equal(round.holes.length, 18);
  assert.ok(!round.holes.some((h) => h.distance === 3485 && h.par === 55));
});

test("the weather row is ignored", () => {
  const round = parseScorecard(buildFixture(), REFERENCE_URL);
  assert.equal(round.players.length, 5);
  assert.ok(!round.players.some((p) => /mph|°F/.test(p.displayName)));
});

test("picks the largest table, not the first", () => {
  const round = parseScorecard(buildFixture(), REFERENCE_URL);
  assert.equal(round.players.length, 5);
});

test("handles a 9-hole layout", () => {
  const holes = HOLES.slice(0, 9).map((h, i) => [i + 1, h[1], h[2]]);
  const players = PLAYERS.map((p) => {
    const strokes = p.strokes.slice(0, 9);
    return { ...p, strokes, total: strokes.reduce((a, b) => a + b, 0), toPar: null };
  });
  const round = parseScorecard(buildFixture({ players, holes }), REFERENCE_URL);
  assert.equal(round.holes.length, 9);
  assert.equal(round.players[0].strokes.length, 9);
});

test("handles a 27-hole layout", () => {
  const extra = [[19,200,3],[20,215,3],[21,240,4],[22,180,3],[23,205,3],[24,230,3],[25,250,4],[26,195,3],[27,210,3]];
  const holes = [...HOLES, ...extra];
  const players = PLAYERS.map((p) => {
    const strokes = [...p.strokes, 3, 3, 4, 3, 3, 3, 4, 3, 3];
    return { ...p, strokes, total: strokes.reduce((a, b) => a + b, 0), toPar: null };
  });
  const round = parseScorecard(buildFixture({ players, holes }), REFERENCE_URL);
  assert.equal(round.holes.length, 27);
  assert.equal(round.players[0].strokes.length, 27);
});

/* ---------------------------------------------------------------------------
 * Strict failure — the headline requirement
 * ------------------------------------------------------------------------ */

test("fails loudly on an unfinished card and reports the exact message", () => {
  const players = PLAYERS.map((p, i) =>
    i === 4 ? { ...p, strokes: p.strokes.slice(0, 16) } : p
  );

  assert.throws(
    () => parseScorecard(buildFixture({ players }), REFERENCE_URL),
    (err) => {
      assert.ok(err instanceof ParseError, "should be a ParseError");
      assert.match(err.userMessage, /the card may be unfinished/);
      assert.match(err.userMessage, /\d+ holes/);
      return true;
    }
  );
});

test("fails when a player row has no @handle rather than guessing an identity", () => {
  const players = PLAYERS.map((p, i) =>
    i === 2 ? { ...p, handle: "", name: "Mdub1807" } : p
  );
  assert.throws(
    () => parseScorecard(buildFixture({ players }), REFERENCE_URL),
    (err) => {
      assert.ok(err instanceof ParseError);
      assert.match(err.userMessage, /username/i);
      return true;
    }
  );
});

test("rejects a page with no scoring table", () => {
  assert.throws(
    () => parseScorecard("<html><body><p>Nothing here at all, just a short filler page.</p></body></html>", REFERENCE_URL),
    (err) => err instanceof ParseError
  );
});

test("rejects a truncated body", () => {
  assert.throws(() => parseScorecard("<html>", REFERENCE_URL), (err) => err instanceof ParseError);
});

/* ---------------------------------------------------------------------------
 * assertRoundIsComplete directly
 * ------------------------------------------------------------------------ */

test("assertRoundIsComplete accepts a well-formed round", () => {
  const round = parseScorecard(buildFixture(), REFERENCE_URL);
  assert.equal(assertRoundIsComplete(round), true);
});

test("assertRoundIsComplete rejects a strokes/total mismatch", () => {
  const round = parseScorecard(buildFixture(), REFERENCE_URL);
  round.players[0].totalStrokes = 999;
  assert.throws(() => assertRoundIsComplete(round));
});
