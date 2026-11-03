/**
 * importers/udisc_cardcast.js
 * ============================================================================
 * THE ONLY FILE IN THIS CODEBASE THAT KNOWS WHAT UDISC'S HTML LOOKS LIKE.
 *
 * UDisc has no public API. The CardCast page (udisc.com/scorecards/scorecard_<id>)
 * is an ordinary public web page and the scores are already in it as a table.
 * We read the page. We never call an API. We never scrape a private endpoint.
 *
 * WHY THIS FILE IS QUARANTINED
 * ----------------------------------------------------------------------------
 * UDisc will change their markup eventually. That is an expected event, not
 * an incident. When it happens the fix belongs here and nowhere else. Route
 * handlers, React components and services must never touch HTML — they call
 * parseScorecard(html, url) and receive a plain object.
 *
 * WHAT THE MARKUP LOOKS LIKE (captured Nov 2026, reference scorecard)
 * ----------------------------------------------------------------------------
 * The scoring section is a <table>:
 *
 *   Header row
 *     cell 1:     label cell (empty or "Hole")
 *     cell 2:     "Player"
 *     cell 3..N:  one per hole, inner text reads "1 213 3"
 *                 = hole number, distance in feet, par
 *     final cell: "Total 3485 55"
 *                 = the word Total, total distance, total par
 *                 NEVER A HOLE. Counting this as a hole is the single
 *                 easiest way to break the parser. Guarded below.
 *
 *   Player rows
 *     cell 1:     position, "1"
 *     cell 2:     "Devin Devin @devin47"
 *     cell 3..N:  strokes per hole, "3" "2" "2" ...
 *     penultimate: to-par, "-10"
 *     final:      "-10 (45)"  (to-par and total) or bare "45"
 *
 *   Weather row — IGNORED
 *     "72°F", "6 mph", "1h 17m". Not a player. Explicitly skipped.
 *
 * REGEX NOTE
 * ----------------------------------------------------------------------------
 * Extraction works on raw HTML strings as well as extracted cells, because a
 * DOM library is not guaranteed in the deploy runtime. UDisc's table markup is
 * shallow and well-formed, so this is workable; if it ever stops being so, add
 * Cheerio behind this same interface rather than letting callers see a DOM.
 * ============================================================================
 */

import {
  normaliseScorecardUrl,
  assertRoundIsComplete,
} from "../lib/udisc/url.js";

export class ParseError extends Error {
  constructor(message, userMessage) {
    super(message);
    this.name = "ParseError";
    this.userMessage =
      userMessage ??
      "Couldn't read that scorecard — the page layout may have changed.";
  }
}

/* ---------------------------------------------------------------------------
 * Primitives
 * ------------------------------------------------------------------------ */

/** Strip tags, decode the entities UDisc actually emits, collapse whitespace. */
export function textOf(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&deg;/gi, "°")
    .replace(/\s+/g, " ")
    .trim();
}

/** "1 213 3" -> { number: 1, distance: 213, par: 3 }. null if not a hole cell. */
export function parseHoleHeader(cellText) {
  const m = /^(\d{1,2})\s+(\d{2,4})\s+(\d{1,2})$/.exec(String(cellText).trim());
  if (!m) return null;
  return { number: Number(m[1]), distance: Number(m[2]), par: Number(m[3]) };
}

/**
 * "Total 3485 55" -> true. Tests the LEADING WORD, so a hole cell whose
 * distance happens to be 3485 is not mistaken for the total.
 */
export function isTotalHeaderCell(cellText) {
  return /^totals?\b/i.test(String(cellText).trim());
}

/**
 * "Devin Devin @devin47" -> { displayName, udiscUsername }
 *
 * The handle is the authoritative player key. Display name is display only.
 * A row with no handle is a hard failure rather than a guess: two league
 * members can both be "Dad", and merging them would corrupt every stat.
 */
export function splitPlayerCell(cellText) {
  const text = String(cellText).trim();
  const m = /^(.*?)\s*@([A-Za-z0-9_.-]{1,64})\s*$/.exec(text);
  if (!m) {
    throw new ParseError(
      `Player row has no @udisc_username: "${text}"`,
      "Couldn't read a player's UDisc username on that card."
    );
  }
  return {
    displayName: m[1].trim() || m[2],
    udiscUsername: `@${m[2].toLowerCase()}`,
  };
}

/**
 * "-10 (45)" -> { toPar: -10, totalStrokes: 45 }
 * "45"        -> { toPar: null, totalStrokes: 45 }
 * "E (55)"    -> { toPar: 0,  totalStrokes: 55 }
 * null when the cell is not a total at all.
 */
export function parseTotalCell(cellText) {
  const text = String(cellText).trim();

  const withToPar = /^(-?\d+|E)\s*\(\s*(\d{1,3})\s*\)$/.exec(text);
  if (withToPar) {
    const raw = withToPar[1];
    return {
      toPar: raw.toUpperCase() === "E" ? 0 : Number(raw),
      totalStrokes: Number(withToPar[2]),
    };
  }

  const bare = /^(\d{1,3})$/.exec(text);
  if (bare) return { toPar: null, totalStrokes: Number(bare[1]) };

  return null;
}

/** Weather row guard: temperature, wind, duration. */
export function looksLikeWeatherRow(cellTexts) {
  const joined = cellTexts.join(" ");
  if (/\d+\s*°\s*F/i.test(joined)) return true;
  if (/\d+\s*mph/i.test(joined)) return true;
  if (/\d+\s*h\s*\d+\s*m/i.test(joined)) return true;
  return false;
}

/* ---------------------------------------------------------------------------
 * Table extraction
 * ------------------------------------------------------------------------ */

/**
 * Pull every <table> out of the page as an array of rows, each row an array
 * of raw cell HTML. Colspans are expanded so column indices stay aligned
 * with the hole columns.
 */
export function extractTables(html) {
  const tables = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRe.exec(html)) !== null) {
    const rows = [];
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    const tableHtml = tableMatch[0];
    let rowMatch;

    while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
      const cells = [];
      const cellRe = /<t[dh][\s\S]*?<\/t[dh]>/gi;
      let cellMatch;

      while ((cellMatch = cellRe.exec(rowMatch[0])) !== null) {
        cells.push(cellMatch[0]);
      }

      const expanded = [];
      for (const cell of cells) {
        const span = /colspan\s*=\s*["']?(\d+)/i.exec(cell);
        const n = span ? Number(span[1]) : 1;
        for (let i = 0; i < n; i += 1) expanded.push(i === 0 ? cell : "");
      }

      if (expanded.length) rows.push(expanded);
    }

    if (rows.length) tables.push(rows);
  }

  return tables;
}

/** rows × widest row. The scoring table wins. */
export function scoreTable(rows) {
  const cols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return rows.length * cols;
}

/* ---------------------------------------------------------------------------
 * Page metadata
 * ------------------------------------------------------------------------ */

/** <title>Angel Mounds Disc Golf Course | UDisc</title> */
export function parseTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return {};
  const title = textOf(m[1]);
  return {
    pageTitle: title,
    // "… | UDisc" is site chrome, not part of the course name.
    courseName: title.replace(/\s*[|\-–]\s*UDisc\s*$/i, "").trim() || undefined,
  };
}

/** og:title / description give us a fallback course name. */
export function parseMeta(html) {
  const out = {};
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og) out.ogTitle = textOf(og[1]);
  const desc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (desc) out.description = textOf(desc[1]);
  return out;
}

/** udisc.com/courses/<slug> — stored as source_course_url. */
export function parseCourseUrl(html) {
  const m = /href=["']([^"']*\/courses\/[^"']+)["']/i.exec(html);
  if (!m) return undefined;
  const href = m[1];
  if (/^https?:\/\//i.test(href)) return href;
  return `https://udisc.com${href.startsWith("/") ? "" : "/"}${href}`;
}

/**
 * "Blue Tees" — layout name. Kept narrow and optional: a missing layout is
 * recorded as undefined rather than guessed at, because the PRD says never
 * invent course or hole information.
 */
export function parseLayout(html) {
  const patterns = [
    /(?:layout|teepad|tee\s*pad)[^A-Za-z]{0,20}([A-Za-z0-9'\- ]{2,40}?(?:Tees?|Pads?|Layout))/i,
    />\s*([A-Za-z0-9'\- ]{2,40}?(?:Tees?|Pads?))\s*</i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) {
      const candidate = textOf(m[1]).trim();
      if (candidate && candidate.length <= 40) return candidate;
    }
  }
  return undefined;
}

/**
 * "Evansville, Indiana". Only a "City, Region" shape is accepted so a nav
 * item can never land in the location column.
 */
export function parseLocation(html) {
  const m =
    /([A-Z][A-Za-z.\-']+(?:\s+[A-Z][A-Za-z.\-']+)*),\s*([A-Z][A-Za-z.\-']+(?:\s+[A-Z][A-Za-z.\-']+)*)/.exec(
      textOf(html)
    );
  if (!m) return undefined;
  const city = m[1].trim();
  const region = m[2].trim();
  if (/UDisc|Sign|Log|Scorecard/i.test(city)) return undefined;
  return `${city}, ${region}`;
}

/**
 * "Oct 20, 2026 4:06 PM" -> ISO string.
 * Stored as a real timestamp so ordering and season calculations work.
 */
export function parsePlayedAt(html) {
  const text = textOf(html);
  const patterns = [
    /([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4}(?:,?\s+\d{1,2}:\d{2}\s*(?:AM|PM))?)/i,
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)/,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const parsed = new Date(m[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

/* ---------------------------------------------------------------------------
 * Main entry point
 * ------------------------------------------------------------------------ */

/**
 * Parse a UDisc CardCast scorecard page.
 *
 * @param {string} html  Raw HTML of the scorecard page.
 * @param {string} url   The validated scorecard URL (gives us the round id).
 * @throws {ParseError}
 */
export function parseScorecard(html, url) {
  if (typeof html !== "string" || html.length < 200) {
    throw new ParseError("Response body too small to be a scorecard page");
  }

  const { url: canonicalUrl, roundId } = normaliseScorecardUrl(url);

  const tables = extractTables(html);
  if (!tables.length) throw new ParseError("No tables found on page");

  const table = tables.slice().sort((a, b) => scoreTable(b) - scoreTable(a))[0];

  // --- Header row ---------------------------------------------------------
  let headerRowIndex = -1;
  let holes = [];
  let totalHeaderCell = null;

  for (let i = 0; i < table.length; i += 1) {
    const cells = table[i].map(textOf);
    const parsedHoles = [];
    let sawTotal = null;

    for (const cellText of cells) {
      if (isTotalHeaderCell(cellText)) {
        sawTotal = cellText;
        continue;
      }
      const hole = parseHoleHeader(cellText);
      if (hole) parsedHoles.push(hole);
    }

    // A real header row has a run of hole cells. Require at least 9 so a
    // stray "1 213 3" in page chrome cannot masquerade as the header.
    if (parsedHoles.length >= 9) {
      headerRowIndex = i;
      holes = parsedHoles;
      totalHeaderCell = sawTotal;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new ParseError("Could not locate the hole header row");
  }

  // Hole numbers must run 1..N in order. Catches colspan expansion mistakes
  // and any off-by-one that absorbed the total cell.
  for (let i = 0; i < holes.length; i += 1) {
    if (holes[i].number !== i + 1) {
      throw new ParseError(
        `Hole numbering is not sequential at index ${i} (found ${holes[i].number})`
      );
    }
  }

  if (totalHeaderCell && holes.some((h) => isTotalHeaderCell(String(h.number)))) {
    throw new ParseError("Total header cell was parsed as a hole");
  }

  const holeCount = holes.length;

  // --- Player rows --------------------------------------------------------
  const players = [];

  for (let i = headerRowIndex + 1; i < table.length; i += 1) {
    const cells = table[i].map(textOf);
    if (cells.length < 3) continue;

    // Ignore the weather row. Explicit, because it sits inside the same table.
    if (looksLikeWeatherRow(cells)) continue;

    // A player row carries a @handle. Rows without one are skipped, never guessed.
    const handleIndex = cells.findIndex((c) => /@[A-Za-z0-9_.-]{1,64}/.test(c));
    if (handleIndex === -1) continue;

    // Position: leading integer cell before the name.
    let position = players.length + 1;
    for (let c = 0; c < handleIndex; c += 1) {
      const m = /^(\d{1,3})$/.exec(cells[c]);
      if (m) {
        position = Number(m[1]);
        break;
      }
    }

    const identity = splitPlayerCell(cells[handleIndex]);

    // Strokes: integers after the handle cell. The per-hole run is exactly
    // holeCount long from the left.
    const numericAfter = [];
    for (let c = handleIndex + 1; c < cells.length; c += 1) {
      const m = /^(\d{1,2})$/.exec(cells[c]);
      if (m) numericAfter.push(Number(m[1]));
    }

    const totalCell = parseTotalCell(cells[cells.length - 1]);

    let strokes = numericAfter;
    if (strokes.length > holeCount) strokes = strokes.slice(0, holeCount);

    if (strokes.length !== holeCount) {
      throw new ParseError(
        `Player ${identity.displayName} yielded ${strokes.length} strokes for ${holeCount} holes`,
        `Found ${players.length + 1} players but only ${strokes.length} holes — the card may be unfinished.`
      );
    }

    const summed = strokes.reduce((a, b) => a + b, 0);

    players.push({
      position,
      displayName: identity.displayName,
      udiscUsername: identity.udiscUsername,
      strokes,
      totalStrokes: totalCell?.totalStrokes ?? summed,
      // toPar is derivable from the pars we read. We prefer the printed value
      // when the card shows one, and never invent a score to fill the gap.
      toPar:
        totalCell?.toPar ??
        summed - holes.reduce((a, h) => a + h.par, 0),
    });
  }

  if (!players.length) throw new ParseError("No player rows found");

  players.sort((a, b) => a.position - b.position);

  const meta = { ...parseTitle(html), ...parseMeta(html) };

  const round = {
    sourceRoundId: roundId,
    sourceUrl: canonicalUrl,
    sourceCourseUrl: parseCourseUrl(html),
    courseName: meta.courseName,
    layout: parseLayout(html),
    playedAt: parsePlayedAt(html),
    location: parseLocation(html),
    holes,
    players,
  };

  // Every player must have exactly as many strokes as there are holes.
  // Fails loudly and saves nothing.
  assertRoundIsComplete(round);

  return round;
}

/* ---------------------------------------------------------------------------
 * Fetching
 * ------------------------------------------------------------------------ */

/** UDisc's CardCast page is public but is not an API. We always GET the page. */
export const CARDCAST_FETCH_OPTIONS = {
  method: "GET",
  redirect: "follow",
  headers: {
    // A normal browser UA. We are reading a public page, honestly identified.
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
  },
};

/** 15s timeout enforced with AbortController. */
export async function fetchScorecardPage(url, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const { url: canonicalUrl } = normaliseScorecardUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(canonicalUrl, {
      ...CARDCAST_FETCH_OPTIONS,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ParseError(
        `UDisc returned ${res.status}`,
        "Couldn't reach UDisc — try again."
      );
    }
    return await res.text();
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new ParseError("Fetch timed out", "Couldn't reach UDisc — try again.");
    }
    if (err instanceof ParseError) throw err;
    throw new ParseError(
      `Fetch failed: ${err?.message ?? err}`,
      "Couldn't reach UDisc — try again."
    );
  } finally {
    clearTimeout(timer);
  }
}
