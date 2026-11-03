/**
 * importers/udisc_csv.js
 *
 * The CSV path. Normalises a UDisc CSV export into EXACTLY the same shape
 * parseScorecard() returns, so both paths share the duplicate check, the
 * player upsert, the transaction and the readback in lib/udisc/import.js.
 *
 * That shared shape is the point: a second, parallel write path is how
 * duplicate and integrity bugs get in.
 *
 * UDisc CSV exports vary by era and by whether they came from the app or the
 * website, so the header mapping is explicit and small. Anything unrecognised
 * fails loudly rather than guessing at a column.
 */

import { assertRoundIsComplete } from "../lib/udisc/url.js";
import { ParseError } from "./udisc_cardcast.js";

/** Minimal RFC4180-ish CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const src = String(text).replace(/^\uFEFF/, ""); // strip BOM

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // swallow; the \n handles the row break
    } else {
      field += ch;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

/** Header aliases seen in UDisc exports. Lowercased and trimmed before lookup. */
const ALIASES = {
  player: ["player", "name", "player name", "full name"],
  username: ["udisc username", "username", "handle", "player username"],
  hole: ["hole", "hole number", "hole #"],
  strokes: ["strokes", "score", "throws"],
  par: ["par"],
  distance: ["distance", "distance (ft)", "length"],
  course: ["course", "course name"],
  layout: ["layout", "tee", "tees", "layout name"],
  date: ["date", "date played", "played", "played at"],
  round: ["round", "round id", "round name", "scorecard id"],
  location: ["location", "city", "place"],
};

function findColumn(headers, key) {
  const candidates = ALIASES[key] ?? [];
  for (let i = 0; i < headers.length; i += 1) {
    const h = headers[i].trim().toLowerCase();
    if (candidates.includes(h)) return i;
  }
  return -1;
}

/**
 * Parse a UDisc CSV export.
 *
 * @param {string} text
 * @param {{ fallbackRoundId?: string, sourceUrl?: string }} opts
 * @returns same shape as parseScorecard()
 */
export function parseUdiscCsv(text, opts = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new ParseError("CSV has no data rows", "That CSV doesn't contain any rounds.");
  }

  // Some exports carry a banner line before the real header. Find the header
  // row by looking for one that maps a player column.
  let headerIndex = -1;
  let headers = [];
  for (let i = 0; i < Math.min(rows.length, 5); i += 1) {
    const candidate = rows[i];
    if (findColumn(candidate, "player") !== -1 || findColumn(candidate, "username") !== -1) {
      headerIndex = i;
      headers = candidate;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new ParseError(
      "Could not find a player column in the CSV header",
      "That CSV doesn't look like a UDisc export."
    );
  }

  const col = {
    player: findColumn(headers, "player"),
    username: findColumn(headers, "username"),
    hole: findColumn(headers, "hole"),
    strokes: findColumn(headers, "strokes"),
    par: findColumn(headers, "par"),
    distance: findColumn(headers, "distance"),
    course: findColumn(headers, "course"),
    layout: findColumn(headers, "layout"),
    date: findColumn(headers, "date"),
    round: findColumn(headers, "round"),
    location: findColumn(headers, "location"),
  };

  const dataRows = rows.slice(headerIndex + 1);

  // Both long (one row per hole) and wide (one row per player, holes as
  // columns) exports appear in the wild. Detect by whether a hole column exists.
  const isLongFormat = col.hole !== -1 && col.strokes !== -1;

  const byRound = new Map();

  for (const r of dataRows) {
    const at = (i) => (i === -1 || i >= r.length ? "" : String(r[i]).trim());

    const roundKey = at(col.round) || opts.fallbackRoundId || "csv-import";

    if (!byRound.has(roundKey)) {
      byRound.set(roundKey, {
        sourceRoundId: roundKey,
        sourceUrl: opts.sourceUrl ?? "",
        sourceCourseUrl: undefined,
        courseName: at(col.course) || undefined,
        layout: at(col.layout) || undefined,
        playedAt: normaliseDate(at(col.date)),
        location: at(col.location) || undefined,
        holes: [],
        playersById: new Map(),
      });
    }

    const round = byRound.get(roundKey);

    const rawName = at(col.player);
    const rawUser = at(col.username);

    // Key on the username. A display name is never an identity.
    const handle = rawUser
      ? rawUser.startsWith("@")
        ? rawUser.toLowerCase()
        : `@${rawUser.toLowerCase()}`
      : null;

    if (!handle) {
      throw new ParseError(
        `CSV row has no UDisc username (player "${rawName}")`,
        "That CSV is missing UDisc usernames, so players can't be matched safely."
      );
    }

    if (!round.playersById.has(handle)) {
      round.playersById.set(handle, {
        position: round.playersById.size + 1,
        displayName: rawName || handle,
        udiscUsername: handle,
        strokes: [],
        _par: [],
      });
    }

    const player = round.playersById.get(handle);

    if (isLongFormat) {
      const holeNo = Number(at(col.hole));
      const strokes = Number(at(col.strokes));
      if (!Number.isInteger(holeNo) || holeNo < 1) continue;
      if (!Number.isInteger(strokes) || strokes < 1) continue;

      player.strokes[holeNo - 1] = strokes;

      const par = Number(at(col.par));
      const distance = Number(at(col.distance));
      if (!round.holes[holeNo - 1]) {
        round.holes[holeNo - 1] = {
          number: holeNo,
          distance: Number.isFinite(distance) ? distance : null,
          par: Number.isFinite(par) ? par : null,
        };
      }
    }
  }

  // Wide format: holes are individual columns named "1".."27".
  if (!isLongFormat && byRound.size) {
    const holeCols = [];
    headers.forEach((h, i) => {
      const n = Number(String(h).trim());
      if (Number.isInteger(n) && n >= 1 && n <= 27) holeCols.push({ n, i });
    });

    if (!holeCols.length) {
      throw new ParseError(
        "CSV has neither a hole column nor per-hole columns",
        "That CSV doesn't look like a UDisc export."
      );
    }

    holeCols.sort((a, b) => a.n - b.n);

    for (const round of byRound.values()) {
      round.holes = holeCols.map((hc) => ({ number: hc.n, distance: null, par: null }));
    }

    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const r = rows[i];
      const at = (j) => (j === -1 || j >= r.length ? "" : String(r[j]).trim());
      const roundKey = at(col.round) || opts.fallbackRoundId || "csv-import";
      const round = byRound.get(roundKey);
      if (!round) continue;

      const rawUser = at(col.username);
      if (!rawUser) continue;
      const handle = rawUser.startsWith("@") ? rawUser.toLowerCase() : `@${rawUser.toLowerCase()}`;
      const player = round.playersById.get(handle);
      if (!player) continue;

      player.strokes = holeCols.map((hc) => {
        const v = Number(at(hc.i));
        return Number.isInteger(v) && v > 0 ? v : null;
      });
    }
  }

  // Finalise every round into the shared shape.
  const rounds = [];
  for (const round of byRound.values()) {
    const holes = round.holes.filter(Boolean);
    const players = Array.from(round.playersById.values()).map((p) => {
      const strokes = p.strokes.filter((s) => Number.isInteger(s));
      const summed = strokes.reduce((a, b) => a + b, 0);
      const parSum = holes.reduce((a, h) => a + (h.par ?? 0), 0);
      return {
        position: p.position,
        displayName: p.displayName,
        udiscUsername: p.udiscUsername,
        strokes,
        totalStrokes: summed,
        toPar: parSum ? summed - parSum : null,
      };
    });

    const final = {
      sourceRoundId: round.sourceRoundId,
      sourceUrl: round.sourceUrl,
      sourceCourseUrl: round.sourceCourseUrl,
      courseName: round.courseName,
      layout: round.layout,
      playedAt: round.playedAt,
      location: round.location,
      holes,
      players,
    };

    // Same strictness on the CSV path. A short row fails the whole import.
    assertRoundIsComplete(final);
    rounds.push(final);
  }

  return rounds;
}

/** "2026-10-20" or "10/20/2026" -> ISO string. undefined when unparseable. */
function normaliseDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}
