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
const mirror = env.DATABASE_URL_MIRROR ?? env.DATABASE_URL_MIRROR_UNPOOLED;

if (!mirror) {
  console.error("DATABASE_URL_MIRROR is not set in .env.local.");
  process.exit(1);
}
// The same guard every ingest script carries. A dev server is read-mostly, but
// "mostly" is not a safety property worth relying on.
if (mirror.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: DATABASE_URL_MIRROR contains the production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}

const portArg = process.argv.indexOf("--port");
const port = portArg > -1 ? process.argv[portArg + 1] : "3102";

console.log(`dev server on :${port}`);
console.log(`  SEARCH_SOURCE = postgres`);
console.log(`  DATABASE_URL  = ${/@([^/]+)/.exec(mirror)?.[1]}`);
console.log(`  (.env.local is NOT modified)\n`);

// The binary directly rather than through npx: npx resolves through a shell,
// and under the preview harness on Windows that spawn silently produced no
// server at all.
spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, ...env, DATABASE_URL: mirror, SEARCH_SOURCE: "postgres" },
});
