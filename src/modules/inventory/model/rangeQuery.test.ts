import { describe, expect, it } from "vitest";
import { isRangeActive, rangeParams } from "./rangeQuery";

const ODO = { min: 0, max: 500_000 };
const ENGINE = { min: 0, max: 8_000 };
const RETAIL = { min: 0, max: 50_000 };

describe("rangeParams", () => {
  it("sends nothing when neither end has been moved", () => {
    expect(rangeParams({ min: 0, max: 500_000 }, ODO)).toEqual({});
  });

  it("sends both ends once both have been moved", () => {
    expect(rangeParams({ min: 50_000, max: 200_000 }, ODO)).toEqual({
      from: "50000",
      to: "200000",
    });
  });

  it("omits the upper bound while the top stop means \"and above\"", () => {
    // THE REGRESSION: raising only the floor used to send odoMax=500000 too,
    // so the 467 lots reading above 500,000 mi were excluded by a control
    // labelled "500,000+ mi".
    expect(rangeParams({ min: 100_000, max: 500_000 }, ODO)).toEqual({
      from: "100000",
    });
  });

  it("omits the lower bound when only the ceiling was lowered", () => {
    expect(rangeParams({ min: 0, max: 120_000 }, ODO)).toEqual({ to: "120000" });
  });

  it("treats a value past the stop as still meaning \"and above\"", () => {
    // A number typed straight into the box can exceed the track.
    expect(rangeParams({ min: 0, max: 900_000 }, ODO)).toEqual({});
  });

  it("works for engine size, where the bounds differ", () => {
    expect(rangeParams({ min: 1_600, max: 8_000 }, ENGINE)).toEqual({ from: "1600" });
    expect(rangeParams({ min: 0, max: 2_500 }, ENGINE)).toEqual({ to: "2500" });
  });

  it("keeps the expensive lots reachable on retail value", () => {
    // p95 of the estimated retail value is $38,400 and p99 is $66,625, so a
    // slider stopping at 50,000 has a real tail above it. Asking for "$20,000
    // and up" must not quietly cap at the top stop.
    expect(rangeParams({ min: 20_000, max: 50_000 }, RETAIL)).toEqual({ from: "20000" });
    expect(rangeParams({ min: 0, max: 12_000 }, RETAIL)).toEqual({ to: "12000" });
    expect(rangeParams({ min: 5_000, max: 15_000 }, RETAIL)).toEqual({
      from: "5000",
      to: "15000",
    });
  });
});

describe("isRangeActive", () => {
  it("is false at rest and true once either end moves", () => {
    expect(isRangeActive({ min: 0, max: 8_000 }, ENGINE)).toBe(false);
    expect(isRangeActive({ min: 1_000, max: 8_000 }, ENGINE)).toBe(true);
    expect(isRangeActive({ min: 0, max: 3_000 }, ENGINE)).toBe(true);
  });
});
