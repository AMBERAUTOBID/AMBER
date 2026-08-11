/**
 * Reads the ingest run log and exits non-zero when the mirror should not be
 * trusted. Makes NO vendor API calls and writes nothing.
 *
 * THE PROBLEM IT SOLVES: a sweep that dies leaves a site that looks perfectly
 * healthy and serves week-old bids. `sweep.ts` records the failure in
 * `auction_ingest_runs` and then exits 0 — so on GitHub Actions a broken sweep
 * shows a green tick. This is the step that turns the record into a signal.
 *
 * Run:
 *   npm run sweep:health          # against the auction branch (see auctionDbUrl)
 *   npm run sweep:health:local    # the same, loading .env.local
 *
 * Exit code is the whole point: 0 healthy, 1 not. In CI that failure is what
 * triggers the alert, so nothing here may swallow an error.
 */
import { neon } from "@neondatabase/serverless";
import { appendFileSync } from "node:fs";
import { auctionDbUrl, AUCTION_DB_URL_MISSING } from "./auctionDbUrl";
import {
  assessSweepHealth,
  SWEEP_HEALTH_LIMITS,
  type IngestRunRecord,
} from "../../src/modules/inventory/model/sweepHealth";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";

const url = auctionDbUrl({ unpooled: true });
if (!url) {
  console.error(AUCTION_DB_URL_MISSING);
  process.exit(1);
}
if (url.includes(PRODUCTION_ENDPOINT)) {
  // Read-only or not, this tool is about the mirror. Pointing it at production
  // could only mean an env var was crossed over.
  console.error(`ABORT: target is the production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}

const sql = neon(url);

/** How many runs to consider. The verdict needs the two newest complete sweeps,
 * and development runs sit between them, so a shallow window would miss one. */
const WINDOW = 25;

function toRecord(row: Record<string, unknown>): IngestRunRecord {
  return {
    kind: row.kind as IngestRunRecord["kind"],
    startedAt: new Date(row.started_at as string),
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
    isPartial: Boolean(row.is_partial),
    pagesFetched: Number(row.pages_fetched ?? 0),
    lotsSeen: Number(row.lots_seen ?? 0),
    lotsWritten: Number(row.lots_written ?? 0),
    lotsSkipped: Number(row.lots_skipped ?? 0),
    note: (row.note as string | null) ?? null,
  };
}

/**
 * Mirrors the report into the Actions run summary, so the answer is on the run's
 * own page rather than buried in a log nobody opens.
 */
function writeStepSummary(lines: string[]): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  try {
    appendFileSync(path, `${lines.join("\n")}\n`);
  } catch (e) {
    console.error(`(could not write the step summary: ${e instanceof Error ? e.message : e})`);
  }
}

async function main() {
  console.log(`target   : ${/@([^/]+)/.exec(url!)?.[1]}`);
  console.log(
    `limits   : complete sweep < ${SWEEP_HEALTH_LIMITS.maxCompleteSweepAgeHours} h old · ` +
      `unfinished run < ${SWEEP_HEALTH_LIMITS.maxUnfinishedRunAgeHours} h · ` +
      `skipped < ${(SWEEP_HEALTH_LIMITS.maxSkippedRatio * 100).toFixed(2)}% · ` +
      `volume > ${(SWEEP_HEALTH_LIMITS.minVolumeRatio * 100).toFixed(0)}% of the previous sweep\n`
  );

  const rows = await sql`
    select kind, started_at, finished_at, is_partial,
           pages_fetched, lots_seen, lots_written, lots_skipped, note
    from auction_ingest_runs
    order by started_at desc
    limit ${WINDOW}
  `;

  const report = assessSweepHealth(rows.map(toRecord), new Date());

  for (const fact of report.facts) console.log(`  ${fact}`);
  if (report.facts.length > 0) console.log("");

  const summary: string[] = [
    `## Auction mirror — ${report.ok ? "healthy" : "NOT HEALTHY"}`,
    "",
    ...report.facts.map((f) => `- ${f}`),
  ];

  if (report.ok) {
    console.log("mirror is healthy.");
    writeStepSummary(summary);
    return;
  }

  console.error("MIRROR IS NOT HEALTHY:\n");
  for (const problem of report.problems) console.error(`  ✗ ${problem}`);
  writeStepSummary([...summary, "", "### Problems", ...report.problems.map((p) => `- ✗ ${p}`)]);
  process.exitCode = 1;
}

main().catch((e) => {
  // A check that cannot reach the database has not proved the mirror is fine —
  // it has proved less than that. Fail, so the alert still goes out.
  console.error("health check aborted:", e instanceof Error ? e.message : e);
  process.exit(1);
});
