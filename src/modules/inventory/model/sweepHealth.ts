/**
 * Decides whether the auction mirror is being kept up to date, from the ingest
 * run log alone.
 *
 * WHY THIS EXISTS: a sweep that stops running does not break anything visibly.
 * Search keeps answering, every page renders, and the only symptom is that
 * prices, bids and sale dates quietly drift away from reality — a car listed at
 * a bid that was true last week is worse than a car that fails to load, because
 * the visitor has no way to tell. `auction_ingest_runs` has always recorded the
 * failure; nothing has ever read it.
 *
 * Pure on purpose: it takes rows and a clock and returns a verdict, so the
 * thresholds can be tested against the runs we actually measured rather than
 * asserted in a YAML file where nothing checks them.
 */

/** One row of `auction_ingest_runs`, narrowed to what a verdict needs. */
export interface IngestRunRecord {
  kind: "full_sweep" | "incremental" | "backfill";
  startedAt: Date;
  /** Null while running — or forever, if the process died mid-sweep. */
  finishedAt: Date | null;
  isPartial: boolean;
  pagesFetched: number;
  lotsSeen: number;
  lotsWritten: number;
  lotsSkipped: number;
  note: string | null;
}

export interface SweepHealthReport {
  ok: boolean;
  /** Human sentences, each one reason the mirror should not be trusted. */
  problems: string[];
  /** What was found, stated whether or not anything is wrong. */
  facts: string[];
}

/**
 * Every threshold, in one place, derived from measured runs rather than taste.
 *
 * The two complete sweeps on record: 2,931 pages / 146,503 seen / 146,081
 * written / 0 skipped in 201 min, and 2,887 / 144,350 / 143,341 / 0 in 240 min.
 */
export const SWEEP_HEALTH_LIMITS = {
  /**
   * How old the newest complete sweep may be before the mirror counts as stale.
   *
   * The cron runs daily and a sweep takes 3.5–4 h, so finish-to-finish is ~24 h.
   * 30 h means one missed night alerts, while an ordinary few-hours-late
   * scheduled run — GitHub delays these routinely under load — does not.
   */
  maxCompleteSweepAgeHours: 30,
  /**
   * A run row with no `finishedAt` this long after starting is not running, it
   * is dead: the process was killed between inserting the row and writing its
   * counters. That has already happened once (the 16:36 run of 2026-08-09,
   * 0 pages, never finished). A complete sweep takes ~4 h, so 6 h is unambiguous.
   */
  maxUnfinishedRunAgeHours: 6,
  /**
   * Share of fetched lots the mapper may refuse before we call it a vendor shape
   * change. Measured baseline is exactly 0.00% across 290,853 lots, so 1% — about
   * 1,460 lots — cannot be noise.
   */
  maxSkippedRatio: 0.01,
  /**
   * How far this sweep's written count may fall below the previous complete
   * one's. The catalogue churns by a few percent a day; a quarter of it
   * vanishing means the sweep, not the auctions.
   */
  minVolumeRatio: 0.75,
} as const;

export type SweepHealthLimits = typeof SWEEP_HEALTH_LIMITS;

/**
 * A capped run is a development run, not a failure.
 *
 * `sweep.ts` writes exactly this note when it stops at `INGEST_MAX_PAGES`, which
 * is what every local 300-page run does. Treating it as an incident would mean
 * the check cries wolf every time someone works on ingest — and a monitor that
 * is normally red is a monitor nobody reads. Real trouble writes `failed: …` or
 * `stopped at page N: HTTP …` instead.
 */
export function isDeliberateCapNote(note: string): boolean {
  return /^page cap \(\d+\) reached/.test(note.trim());
}

const HOUR_MS = 3_600_000;

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / HOUR_MS;
}

function describeAge(hours: number): string {
  return hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`;
}

/**
 * Judges the mirror from its run log.
 *
 * Only `full_sweep` rows are considered. An incremental pass sees a deliberate
 * slice of the catalogue, so its counters say nothing about whether the mirror
 * as a whole is current, and judging it by these thresholds would fail every
 * time one ran.
 *
 * `runs` may arrive in any order; it is sorted here rather than trusting the
 * caller's `ORDER BY` to stay put.
 */
export function assessSweepHealth(
  runs: IngestRunRecord[],
  now: Date,
  limits: SweepHealthLimits = SWEEP_HEALTH_LIMITS
): SweepHealthReport {
  const problems: string[] = [];
  const facts: string[] = [];

  const sweeps = runs
    .filter((r) => r.kind === "full_sweep")
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  if (sweeps.length === 0) {
    return {
      ok: false,
      problems: ["No full sweep has ever been recorded. The mirror has never been filled."],
      facts,
    };
  }

  const latest = sweeps[0];
  const completed = sweeps.filter(
    (r): r is IngestRunRecord & { finishedAt: Date } => !r.isPartial && r.finishedAt !== null
  );

  // 1. Staleness. The one symptom a visitor could never diagnose themselves.
  if (completed.length === 0) {
    problems.push(
      "No sweep has ever completed. Every run so far stopped early, so the mirror " +
        "holds a slice of the catalogue rather than all of it."
    );
  } else {
    const newest = completed[0];
    const ageHours = hoursBetween(newest.finishedAt, now);
    facts.push(
      `Newest complete sweep finished ${describeAge(ageHours)} ago ` +
        `(${newest.finishedAt.toISOString()}): ${newest.pagesFetched} pages, ` +
        `${newest.lotsWritten.toLocaleString("en-US")} lots written, ${newest.lotsSkipped} skipped.`
    );
    if (ageHours > limits.maxCompleteSweepAgeHours) {
      problems.push(
        `The mirror is stale: the last complete sweep finished ${describeAge(ageHours)} ago, ` +
          `past the ${limits.maxCompleteSweepAgeHours} h limit. Bids, prices and sale dates ` +
          `shown to visitors are at least that old.`
      );
    }
  }

  // 2. The most recent attempt ended badly. Kept separate from staleness: a
  //    sweep that failed an hour after a good one is still an incident, even
  //    though the data it left behind is fresh.
  if (latest.note !== null && !isDeliberateCapNote(latest.note)) {
    problems.push(
      `The most recent sweep (started ${latest.startedAt.toISOString()}) ended with: ${latest.note}`
    );
  }

  // 3. A run that was never finished off. Distinct from a failure — nothing
  //    wrote a note, because nothing got the chance to.
  if (latest.finishedAt === null) {
    const ageHours = hoursBetween(latest.startedAt, now);
    if (ageHours > limits.maxUnfinishedRunAgeHours) {
      problems.push(
        `A sweep started ${describeAge(ageHours)} ago and never finished — it was killed ` +
          `mid-run after ${latest.pagesFetched} pages. Runs longer than ` +
          `${limits.maxUnfinishedRunAgeHours} h are dead, not slow.`
      );
    } else {
      facts.push(`A sweep started ${describeAge(ageHours)} ago is still running.`);
    }
  }

  // 4. The mapper refusing rows is how a vendor field changing shape announces
  //    itself. Nothing else in the pipeline notices.
  const newestComplete = completed[0];
  if (newestComplete && newestComplete.lotsSeen > 0) {
    const ratio = newestComplete.lotsSkipped / newestComplete.lotsSeen;
    if (ratio > limits.maxSkippedRatio) {
      problems.push(
        `The last complete sweep refused ${newestComplete.lotsSkipped.toLocaleString("en-US")} of ` +
          `${newestComplete.lotsSeen.toLocaleString("en-US")} lots (${(ratio * 100).toFixed(2)}%, ` +
          `limit ${(limits.maxSkippedRatio * 100).toFixed(2)}%). The vendor has probably changed a ` +
          `field's shape — check the skip reasons in the run's log.`
      );
    }
  }

  // 5. A sweep that completes but brings back far less than last time. Reads as
  //    healthy everywhere else: no error, no note, isPartial false.
  if (completed.length >= 2) {
    const [current, previous] = completed;
    if (previous.lotsWritten > 0) {
      const ratio = current.lotsWritten / previous.lotsWritten;
      if (ratio < limits.minVolumeRatio) {
        problems.push(
          `The last complete sweep wrote ${current.lotsWritten.toLocaleString("en-US")} lots against ` +
            `${previous.lotsWritten.toLocaleString("en-US")} the time before — ` +
            `${(ratio * 100).toFixed(0)}% of it, below the ${(limits.minVolumeRatio * 100).toFixed(0)}% ` +
            `floor. It reported success, so the loss is silent.`
        );
      }
    }
  }

  return { ok: problems.length === 0, problems, facts };
}
