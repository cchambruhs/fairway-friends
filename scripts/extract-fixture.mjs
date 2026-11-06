#!/usr/bin/env node
/**
 * scripts/extract-fixture.mjs
 *
 * Turn a live CardCast page into a committed test fixture.
 *
 *   SAVE_BODY=1 node scripts/verify-fetch.mjs
 *   node scripts/extract-fixture.mjs scratch/udisc-live.html > fixtures/reference-cardcast.html
 *
 * Why this exists: the parser's offline tests need a real captured page, not
 * a hand-written approximation. Once UDisc changes their markup, the fixture
 * becomes the record of what the old markup looked like — keep it.
 *
 * The extractor strips volatile content (analytics, nonces, session tokens,
 * asset fingerprints) so the fixture is stable, diffable, and contains
 * nothing sensitive.
 */

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/extract-fixture.mjs <saved-page.html>");
  process.exit(2);
}

let html = readFileSync(path, "utf8");

function strip(label, before, after) {
  const changed = before !== after;
  html = after;
  if (changed) console.error(`[extract-fixture] stripped ${label}`);
}

strip("scripts", html, html.replace(/<script[\s\S]*?<\/script>/gi, "<!-- script removed -->"));
strip("styles", html, html.replace(/<style[\s\S]*?<\/style>/gi, "<!-- style removed -->"));
strip("inline event handlers", html, html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, ""));
strip("csrf / nonce attributes", html, html.replace(/\s(nonce|data-csrf|data-nonce)="[^"]*"/gi, ""));
strip("asset hashes", html, html.replace(/\/_next\/static\/[^"'\s>]+/g, "/_next/static/ASSET"));

html = html.replace(/\n{3,}/g, "\n\n").trim() + "\n";

if (!/<table/i.test(html)) {
  console.error("[extract-fixture] WARNING: no <table> in the result — is this the right page?");
}
if (!/@[A-Za-z0-9_.-]{1,64}/.test(html)) {
  console.error("[extract-fixture] WARNING: no player handle in the result.");
}

process.stdout.write(html);

