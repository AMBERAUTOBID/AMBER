import { describe, expect, it } from "vitest";
import {
  assessSweepHealth,
  isDeliberateCapNote,
  SWEEP_HEALTH_LIMITS,
  type IngestRunRecord,
} from "./sweepHealth";

const NOW = new Date("2026-08-10T06:00:00Z");

/** A healthy nightly sweep, sized from the two real ones on record. */
function completeSweep(overrides: Partial<IngestRunRecord> = {}): IngestRunRecord {
  return {
    kind: "full_sweep",
    startedAt: new Date("2026-08-10T00:00:00Z"),
    finishedAt: new Date("2026-08-10T03:21:00Z"),
    isPartial: false,
    pagesFetched: 2931,
    lotsSeen: 146_503,
    lotsWritten: 146_081,
    lotsSkipped: 0,
    note: null,
    ...overrides,
  };
}

describe("isDeliberateCapNote", () => {
  it("recognises the note a capped development run writes", () => {
    expect(isDeliberateCapNote("page cap (300) reached before the end of the catalogue")).toBe(true);
  });

  it("does not excuse a real failure", () => {
    expect(isDeliberateCapNote("failed: Failed query: insert into auction_lots")).toBe(false);
    expect(isDeliberateCapNote("stopped at page 412: HTTP 500")).toBe(false);
  });
});

describe("assessSweepHealth", () => {
  it("passes a fresh complete sweep", () => {
    const report = assessSweepHealth([completeSweep()], NOW);
    expect(report.ok).toBe(true);
    expect(report.problems).toEqual([]);
    expect(report.facts.join(" ")).toContain("146,081");
  });

  it("fails when nothing has ever been swept", () => {
    const report = assessSweepHealth([], NOW);
    expect(report.ok).toBe(false);
    expect(report.problems[0]).toContain("never");
  });

  it("fails when every run so far stopped early", () => {
    const partial = completeSweep({ isPartial: true, note: "page cap (300) reached before the end of the catalogue" });
    const report = assessSweepHealth([partial], NOW);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("No sweep has ever completed");
  });

  it("fails once the newest complete sweep is older than the limit", () => {
    const old = completeSweep({
      startedAt: new Date("2026-08-08T20:00:00Z"),
      finishedAt: new Date("2026-08-08T23:00:00Z"),
    });
    const report = assessSweepHealth([old], NOW);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("stale");
  });

  it("tolerates a late scheduled run inside the limit", () => {
    // 26 h old: GitHub delays scheduled workflows routinely, and one late night
    // must not page anyone.
    const late = completeSweep({
      startedAt: new Date("2026-08-09T00:00:00Z"),
      finishedAt: new Date("2026-08-09T04:00:00Z"),
    });
    expect(assessSweepHealth([late], NOW).ok).toBe(true);
  });

  it("reports the error note of the most recent sweep", () => {
    const failed = completeSweep({
      startedAt: new Date("2026-08-10T05:00:00Z"),
      finishedAt: new Date("2026-08-10T05:04:00Z"),
      isPartial: true,
      pagesFetched: 12,
      lotsWritten: 600,
      note: "stopped at page 13: HTTP 402",
    });
    const report = assessSweepHealth([failed, completeSweep()], NOW);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("HTTP 402");
  });

  it("stays quiet about a development run that hit its page cap", () => {
    const capped = completeSweep({
      startedAt: new Date("2026-08-10T05:00:00Z"),
      finishedAt: new Date("2026-08-10T05:15:00Z"),
      isPartial: true,
      pagesFetched: 300,
      lotsSeen: 15_000,
      lotsWritten: 15_000,
      note: "page cap (300) reached before the end of the catalogue",
    });
    // A local dev sweep after a good nightly one is not an incident.
    expect(assessSweepHealth([capped, completeSweep()], NOW).ok).toBe(true);
  });

  it("fails a run that started and never finished", () => {
    // The newest run is the hung one; the sweep before it finished cleanly and
    // is still inside the staleness limit, so this isolates the hang.
    const hung = completeSweep({
      startedAt: new Date("2026-08-09T22:00:00Z"),
      finishedAt: null,
      isPartial: true,
      pagesFetched: 0,
      lotsSeen: 0,
      lotsWritten: 0,
      note: null,
    });
    const yesterday = completeSweep({
      startedAt: new Date("2026-08-09T00:00:00Z"),
      finishedAt: new Date("2026-08-09T03:20:00Z"),
    });
    const report = assessSweepHealth([hung, yesterday], NOW);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("never finished");
  });

  it("leaves a sweep that is still running alone", () => {
    const running = completeSweep({
      startedAt: new Date("2026-08-10T04:30:00Z"),
      finishedAt: null,
      isPartial: true,
      pagesFetched: 400,
      note: null,
    });
    const report = assessSweepHealth([running, completeSweep()], NOW);
    expect(report.ok).toBe(true);
    expect(report.facts.join(" ")).toContain("still running");
  });

  it("fails when the mapper starts refusing lots", () => {
    const shapeChange = completeSweep({ lotsSeen: 146_503, lotsSkipped: 4_000 });
    const report = assessSweepHealth([shapeChange], NOW);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("changed a field's shape");
  });

  it("accepts a handful of skipped rows", () => {
    // Baseline is zero, but one unmappable lot must not wake anybody up.
    expect(assessSweepHealth([completeSweep({ lotsSkipped: 40 })], NOW).ok).toBe(true);
  });

  it("fails a complete sweep that quietly brought back far less than the last one", () => {
    const shrunk = completeSweep({ lotsWritten: 90_000 });
    const previous = completeSweep({
      startedAt: new Date("2026-08-09T00:00:00Z"),
      finishedAt: new Date("2026-08-09T03:20:00Z"),
      lotsWritten: 146_081,
    });
    const report = assessSweepHealth([shrunk, previous], NOW);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("silent");
  });

  it("accepts ordinary day-to-day churn", () => {
    const today = completeSweep({ lotsWritten: 141_000 });
    const previous = completeSweep({
      startedAt: new Date("2026-08-09T00:00:00Z"),
      finishedAt: new Date("2026-08-09T03:20:00Z"),
      lotsWritten: 146_081,
    });
    expect(assessSweepHealth([today, previous], NOW).ok).toBe(true);
  });

  it("ignores incremental runs when judging the mirror", () => {
    // An incremental pass sees a deliberate slice, so its counters would trip
    // both the volume floor and the partial rule if they were considered.
    const incremental: IngestRunRecord = {
      kind: "incremental",
      startedAt: new Date("2026-08-10T05:00:00Z"),
      finishedAt: new Date("2026-08-10T05:02:00Z"),
      isPartial: true,
      pagesFetched: 20,
      lotsSeen: 1_000,
      lotsWritten: 1_000,
      lotsSkipped: 0,
      note: "watermark pass",
    };
    expect(assessSweepHealth([incremental, completeSweep()], NOW).ok).toBe(true);
  });

  it("does not depend on the caller's ordering", () => {
    const older = completeSweep({
      startedAt: new Date("2026-08-08T00:00:00Z"),
      finishedAt: new Date("2026-08-08T03:20:00Z"),
    });
    const ascending = assessSweepHealth([older, completeSweep()], NOW);
    const descending = assessSweepHealth([completeSweep(), older], NOW);
    expect(ascending).toEqual(descending);
    expect(ascending.ok).toBe(true);
  });

  it("uses thresholds that pass both sweeps actually measured", () => {
    // 2026-08-07: 2,887 pages, 144,350 seen, 143,341 written, 0 skipped.
    // 2026-08-09: 2,931 pages, 146,503 seen, 146,081 written, 0 skipped.
    const aug7 = completeSweep({
      startedAt: new Date("2026-08-09T16:39:00Z"),
      finishedAt: new Date("2026-08-09T20:00:00Z"),
      pagesFetched: 2_887,
      lotsSeen: 144_350,
      lotsWritten: 143_341,
    });
    const aug9 = completeSweep({
      startedAt: new Date("2026-08-10T00:00:00Z"),
      finishedAt: new Date("2026-08-10T03:21:00Z"),
      pagesFetched: 2_931,
      lotsSeen: 146_503,
      lotsWritten: 146_081,
    });
    expect(assessSweepHealth([aug9, aug7], NOW).ok).toBe(true);
    expect(SWEEP_HEALTH_LIMITS.maxSkippedRatio).toBeGreaterThan(0);
  });
});
