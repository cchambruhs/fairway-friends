/**
 * lib/udisc/import.js
 *
 * Orchestration for the import path. Deliberately thin: every UDisc-specific
 * decision lives in importers/udisc_cardcast.js, and every database decision
 * lives in the transaction below. This file sequences them.
 *
 * Flow: validate link -> fetch server-side -> parse -> check duplicates ->
 *       upsert players -> single transaction -> read back -> return confirmation
 *
 * The readback at the end is not optional. The PRD requires that a success
 * line never renders without a saved scorecard behind it, and the only way to
 * honour that is to re-select the row we just wrote.
 */

import { parseScorecard, fetchScorecardPage } from "../../importers/udisc_cardcast.js";
import { normaliseScorecardUrl } from "./url.js";

export class ImportError extends Error {
  constructor(message, userMessage) {
    super(message);
    this.name = "ImportError";
    this.userMessage = userMessage;
  }
}

/**
 * @param {object} deps        { db } — a client exposing .query / .connect
 * @param {object} input       { url, force?, importedBy? }
 */
export async function importFromLink(deps, input) {
  const { db } = deps;

  // --- Validate, before any network call ----------------------------------
  let canonical;
  try {
    canonical = normaliseScorecardUrl(input.url);
  } catch (err) {
    throw new ImportError(err.message, err.userMessage);
  }

  // --- Duplicate check BEFORE fetching ------------------------------------
  // Cheapest possible duplicate rejection: no network, no parse.
  const existing = await db.query(
    "SELECT id, course_name, played_at FROM scorecards WHERE source_round_id = $1",
    [canonical.roundId]
  );

  if (existing.rows.length && !input.force) {
    return {
      status: "duplicate",
      existing: existing.rows[0],
      message: "This round is already in the database",
      // The UI renders a link to the existing scorecard plus a Force
      // re-import button. The button must be an explicit click.
      canForce: true,
    };
  }

  // --- Fetch + parse ------------------------------------------------------
  const html = await fetchScorecardPage(canonical.url);

  let round;
  try {
    round = parseScorecard(html, canonical.url);
  } catch (err) {
    throw new ImportError(err.message, err.userMessage);
  }

  // --- Single transaction, all or nothing ---------------------------------
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Players are keyed on udisc_username. Display name is display only.
    // ON CONFLICT DO UPDATE refreshes the display name without ever creating
    // a second row for the same handle.
    const playerIds = [];
    for (const player of round.players) {
      const res = await client.query(
        `INSERT INTO players (udisc_username, display_name)
         VALUES ($1, $2)
         ON CONFLICT (udisc_username)
         DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [player.udiscUsername, player.displayName]
      );
      playerIds.push(res.rows[0].id);
    }

    // Force re-import overwrites the SAME row rather than creating a second.
    const scorecardRes = await client.query(
      `INSERT INTO scorecards
         (source_round_id, source_url, source_course_url, course_name,
          layout, played_at, location, holes, imported_at, imported_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb, now(), $9)
       ON CONFLICT (source_round_id) DO UPDATE SET
         source_url        = EXCLUDED.source_url,
         source_course_url = EXCLUDED.source_course_url,
         course_name       = EXCLUDED.course_name,
         layout            = EXCLUDED.layout,
         played_at         = EXCLUDED.played_at,
         location          = EXCLUDED.location,
         holes             = EXCLUDED.holes,
         imported_at       = now(),
         imported_by       = EXCLUDED.imported_by
       RETURNING id`,
      [
        round.sourceRoundId,
        round.sourceUrl,
        round.sourceCourseUrl ?? null,
        round.courseName ?? null,
        round.layout ?? null,
        round.playedAt ?? null,
        round.location ?? null,
        JSON.stringify(round.holes),
        input.importedBy ?? null,
      ]
    );
    const scorecardId = scorecardRes.rows[0].id;

    // Replacing the player rows on force keeps the set exactly as read.
    await client.query("DELETE FROM scorecard_players WHERE scorecard_id = $1", [
      scorecardId,
    ]);

    for (let i = 0; i < round.players.length; i += 1) {
      const player = round.players[i];
      await client.query(
        `INSERT INTO scorecard_players
           (scorecard_id, player_id, position, total_strokes, to_par, strokes)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          scorecardId,
          playerIds[i],
          player.position,
          player.totalStrokes,
          player.toPar,
          JSON.stringify(player.strokes),
        ]
      );
    }

    await client.query("COMMIT");

    // --- Readback ---------------------------------------------------------
    // A claim of success without a saved scorecard is not success. We re-select
    // through a fresh query and build the confirmation from THAT, never from
    // the object we just constructed in memory.
    const readback = await db.query(
      `SELECT s.id, s.course_name, s.layout, s.played_at, s.holes,
              COUNT(sp.player_id)::int AS player_count
         FROM scorecards s
         LEFT JOIN scorecard_players sp ON sp.scorecard_id = s.id
        WHERE s.id = $1
        GROUP BY s.id`,
      [scorecardId]
    );

    const row = readback.rows[0];
    if (!row) {
      throw new ImportError(
        "Readback returned no row after commit",
        "Something went wrong saving that round. Nothing was confirmed as saved."
      );
    }

    const expectedPlayers = round.players.length;
    if (row.player_count !== expectedPlayers) {
      throw new ImportError(
        `Readback shows ${row.player_count} players, expected ${expectedPlayers}`,
        "Something went wrong saving that round. Nothing was confirmed as saved."
      );
    }

    return {
      status: "imported",
      forced: Boolean(input.force && existing.rows.length),
      scorecard: {
        id: row.id,
        courseName: row.course_name,
        layout: row.layout,
        playedAt: row.played_at,
        holeCount: Array.isArray(row.holes) ? row.holes.length : null,
        playerCount: row.player_count,
      },
      // One line: course, date, player count, link.
      message: `${row.course_name} · ${formatDate(row.played_at)} · ${row.player_count} players`,
      link: `/scorecards/${row.id}`,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof ImportError) throw err;
    throw new ImportError(
      `Transaction failed: ${err?.message ?? err}`,
      "Couldn't save that round. Nothing was written."
    );
  } finally {
    client.release();
  }
}

function formatDate(value) {
  if (!value) return "date unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
