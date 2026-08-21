/**
 * Runs the dev server against the auction MIRROR instead of production.
 *
 * The filter panel, the facet counts and the local search only exist when
 * `SEARCH_SOURCE=postgres` and `DATABASE_URL` points at the mirror branch. Both
 * are deliberately absent from `.env.local`, because that file is what the
 * ordinary dev server and every other session read — flipping them there would
 * silently point somebody else's work at the wrong database.
 *
 * So this sets them for THIS PROCESS ONLY. No file on disk changes, and a normal
 * `npm run dev` still gets Apibara and production exactly as before.
 *
 *   node scripts/dev-mirror.mjs [--port 3102]
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";

function readEnvLocal() {
  const out = {};
  let raw;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    console.error("No .env.local found.");
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnvLocal();

/**
 * TWO databases now, matching what production will run.
 *
 * `DATABASE_URL` — accounts, sessions, deposits, favourites, orders. Still the
 * old mirror branch, because that is the only non-production database holding
 * customer rows to develop against; the clean catalogue branch has those tables
 * empty by design. Point this at production and a stray click writes to real
 * customer data.
 *
 * `DATABASE_URL_AUCTION` — the lot catalogue that search reads through
 * `auctionDb()`. The clean `auction-catalogue` branch, which is both fresher
 * and larger where it counts: 126k upcoming lots against the old branch's 108k,
 * because that one accumulated 81k finished auctions nobody can bid on.
 *
 * Falls back to the mirror when the auction URL is absent, so this keeps
 * working on a machine that has not been given the new branch yet.
 */
const appDb = env.DATABASE_URL_MIRROR ?? env.DATABASE_URL_MIRROR_UNPOOLED;
const auctionDb =
  env.DATABASE_URL_AUCTION ?? env.DATABASE_URL_AUCTION_UNPOOLED ?? appDb;

if (!appDb) {
  console.error("DATABASE_URL_MIRROR is not set in .env.local.");
  process.exit(1);
}
// The same guard every ingest script carries. A dev server is read-mostly, but
// "mostly" is not a safety property worth relying on. Both URLs are checked:
// one of them being safe says nothing about the other.
for (const [name, url] of [
  ["DATABASE_URL_MIRROR", appDb],
  ["DATABASE_URL_AUCTION", auctionDb],
]) {
  if (url.includes(PRODUCTION_ENDPOINT)) {
    console.error(`ABORT: ${name} contains the production endpoint ${PRODUCTION_ENDPOINT}.`);
    process.exit(1);
  }
}

const portArg = process.argv.indexOf("--port");
const port = portArg > -1 ? process.argv[portArg + 1] : "3102";

const host = (u) => /@([^/]+)/.exec(u)?.[1];
console.log(`dev server on :${port}`);
console.log(`  SEARCH_SOURCE        = postgres`);
console.log(`  DATABASE_URL         = ${host(appDb)}`);
console.log(`  DATABASE_URL_AUCTION = ${host(auctionDb)}`);
if (host(appDb) === host(auctionDb)) {
  console.log(`  (one database — no separate auction branch configured)`);
}
console.log(`  (.env.local is NOT modified)\n`);

// The binary directly rather than through npx: npx resolves through a shell,
// and under the preview harness on Windows that spawn silently produced no
// server at all.
spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", port], {
  stdio: "inherit",
  // File first, real environment second — the same precedence Next itself
  // gives .env.local: an explicitly set process variable must not be
  // overwritten by a blank line in a file. Found the hard way: the file's
  // empty WIRE_*= entries were erasing test values injected by the shim.
  env: {
    ...env,
    ...process.env,
    DATABASE_URL: appDb,
    DATABASE_URL_AUCTION: auctionDb,
    SEARCH_SOURCE: "postgres",
  },
});
