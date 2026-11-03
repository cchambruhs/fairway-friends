#!/usr/bin/env node
/**
 * BLOCKER CHECK — run this before anything else.
 *
 * The PRD states: "Server-side outbound HTTPS GET to udisc.com must be
 * verified on our hosting before any build. If the platform blocks it, stop
 * and propose an alternative (edge function or fetch proxy) rather than
 * building something that cannot work."
 *
 * This script answers exactly that question and nothing else. It does not
 * touch the database, does not write files, and does not import anything.
 *
 *   node scripts/verify-fetch.mjs
 *
 * Exit codes:
 *   0  fetch works and the score table is present
 *   1  fetch works but the table is absent (markup likely changed)
 *   2  fetch failed (hosting blocks outbound, DNS, TLS, or timeout)
 */

const REFERENCE_URL =
  "https://udisc.com/scorecards/scorecard_mns8y9vb4afhk4v7lafcmk8n";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

async function main() {
  console.log("Fairway Friends — hosting fetch verification");
  console.log("Target:", REFERENCE_URL);
  console.log("Runtime:", process.version, "on", process.platform);
  console.log("---");

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(REFERENCE_URL, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const ms = Date.now() - started;
    console.log("RESULT: FETCH FAILED after", ms, "ms");
    console.log("Error:", err?.name, "-", err?.message ?? err);
    console.log("---");
    console.log("VERDICT: Server-side outbound fetch appears BLOCKED on this host.");
    console.log(
      "Do not build UI on top of this. Use an edge function or a fetch proxy."
    );
    process.exit(2);
  }
  clearTimeout(timer);

  const ms = Date.now() - started;
  const body = await res.text();

  console.log("HTTP status:      ", res.status, res.statusText);
  console.log("Final URL:        ", res.url);
  console.log("Content-Type:     ", res.headers.get("content-type"));
  console.log("Bytes received:   ", body.length);
  console.log("Elapsed:          ", ms, "ms");
  console.log("---");

  // Signals that we got the real page and not an interstitial or block page.
  const checks = {
    "has <table>": /<table/i.test(body),
    "has hole headers": />\s*\d{1,2}\s+\d{2,4}\s+\d{1,2}\s*</.test(body),
    "has Total header cell": /\bTotals?\b/i.test(body),
    "has a player @handle": /@[A-Za-z0-9_.-]{1,64}/.test(body),
    "mentions Angel Mounds": /angel\s*mounds/i.test(body),
    "mentions Blue Tees": /blue\s*tees/i.test(body),
    "no bot challenge": !/cf-browser-verification|just a moment/i.test(body),
  };

  let allTrue = true;
  for (const [label, ok] of Object.entries(checks)) {
    console.log((ok ? "  PASS  " : "  FAIL  ") + label);
    if (!ok) allTrue = false;
  }
  console.log("---");

  if (process.env.SAVE_BODY) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync("scratch", { recursive: true });
    writeFileSync("scratch/udisc-live.html", body);
    console.log("Wrote scratch/udisc-live.html");
  }

  if (!allTrue) {
    console.log("VERDICT: FETCH WORKS, but the page is not shaped as expected.");
    console.log("Either UDisc changed markup (fix importers/udisc_cardcast.js) or a bot");
    console.log("challenge was served. Save the body and inspect it.");
    process.exit(1);
  }

  console.log("VERDICT: FETCH WORKS and the score table is present.");
  console.log("The blocker is cleared. Next: parse this body and run the acceptance test.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(2);
});
