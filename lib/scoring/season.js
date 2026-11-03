/**
 * lib/scoring/season.js
 *
 * Season championship standings.
 *
 * PRD rules:
 *   - Every eligible completed round counts. No dropped rounds, no best-round
 *     substitutions, no automatic points for missed rounds.
 *   - Highest cumulative league points wins.
 *   - Ties resolve: round wins -> second places -> average placement ->
 *     shared rank.
 *   - Provisional and official standings are shown separately: a submitted
 *     scorecard generates NO official points until a League Leader finalises
 *     the round.
 */

/**
 * Build standings from a flat list of round results.
 *
 * Provisional and official are computed from the same input with one filter
 * difference, so the two can never drift apart.
 *
 * @param {Array<{playerId:string,position:number,strokes:number,points:number,finalized:boolean}>} results
 */
export function buildStandings(results) {
  if (!Array.isArray(results)) throw new TypeError("results must be an array");

  const finalized = results.filter((r) => r.finalized === true);

  return {
    official: rankStandings(aggregate(finalized)),
    // Provisional view is deliberately cumulative over everything submitted,
    // marked so the UI can label it clearly as not yet official.
    provisional: rankStandings(aggregate(results.slice())),
    excludedUnfinalized: results.length - finalized.length,
  };
}

/** Sum points, count wins / seconds, and collect placements per player. */
function aggregate(results) {
  const byPlayer = new Map();

  for (const r of results) {
    if (!byPlayer.has(r.playerId)) {
      byPlayer.set(r.playerId, {
        playerId: r.playerId,
        points: 0,
        rounds: 0,
        wins: 0,
        seconds: 0,
        placements: [],
      });
    }
    const row = byPlayer.get(r.playerId);
    row.points += Number(r.points) || 0;
    row.rounds += 1;
    row.placements.push(r.position);
    if (r.position === 1) row.wins += 1;
    if (r.position === 2) row.seconds += 1;
  }

  return Array.from(byPlayer.values()).map((row) => ({
    ...row,
    points: Math.round(row.points * 100) / 100,
    averagePlacement:
      row.placements.length === 0
        ? null
        : Math.round(
            (row.placements.reduce((a, b) => a + b, 0) / row.placements.length) * 100
          ) / 100,
  }));
}

/**
 * Order by cumulative points, then the PRD's tiebreak chain, and assign ranks.
 * Players who remain tied after every criterion share a rank, and the next
 * distinct player skips the intervening numbers (standard competition ranking).
 */
export function rankStandings(rows) {
  const sorted = rows.slice().sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.seconds !== a.seconds) return b.seconds - a.seconds;
    const apA = a.averagePlacement ?? Number.POSITIVE_INFINITY;
    const apB = b.averagePlacement ?? Number.POSITIVE_INFINITY;
    if (apA !== apB) return apA - apB;
    return String(a.playerId).localeCompare(String(b.playerId));
  });

  const out = [];
  let rank = 0;
  let lastKey = null;

  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i];
    // The tiebreak key excludes playerId: two genuinely tied players must
    // share a rank, and only the stable sort order separates them in output.
    const key = [row.points, row.wins, row.seconds, row.averagePlacement].join("|");
    if (key !== lastKey) {
      rank = i + 1;
      lastKey = key;
    }
    out.push({ ...row, rank, sharedRank: false });
  }

  // Mark shared ranks so the UI can render "T-1" honestly.
  const counts = new Map();
  for (const row of out) counts.set(row.rank, (counts.get(row.rank) ?? 0) + 1);
  for (const row of out) row.sharedRank = counts.get(row.rank) > 1;

  return out;
}
