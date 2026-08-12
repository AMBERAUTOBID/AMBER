import { describe, expect, it } from "vitest";
import {
  ODOMETER_BANDS,
  ODOMETER_BAND_SQL,
  activeOdometerBand,
  bandOdoMax,
} from "./odometerBands";

/**
 * The bands label themselves with a count, so the count has to be the truth.
 *
 * This is not a hypothetical worry — it already went wrong once. The bands are
 * half-open (`odometer < 100000`) while the search filter is inclusive
 * (`odometer <= odoMax`), so the first version sent the raw bound and the
 * 50,000–100,000 band advertised 19,219 while its own link returned 19,222.
 * The three extras read exactly 100,000 miles. These tests pin the boundary.
 */
describe("odometer bands", () => {
  it("sends one less than the exclusive bound, so the count matches the list", () => {
    const band = ODOMETER_BANDS.find((b) => b.value === "50000_100000")!;
    expect(band.max).toBe(100000);
    // <= 99999 is the same set as < 100000, which is what the count measured.
    expect(bandOdoMax(band)).toBe("99999");
  });

  it("leaves the open-ended band without a ceiling", () => {
    const band = ODOMETER_BANDS.find((b) => b.value === "gte_200000")!;
    expect(bandOdoMax(band)).toBeUndefined();
    expect(band.min).toBe(200000);
  });

  it("covers the number line with no gap and no overlap", () => {
    // A gap hides cars from every band; an overlap counts them twice. Either
    // makes the totals beside the options wrong in a way nobody would notice.
    for (let i = 1; i < ODOMETER_BANDS.length; i++) {
      expect(ODOMETER_BANDS[i].min).toBe(ODOMETER_BANDS[i - 1].max);
    }
    expect(ODOMETER_BANDS[0].min).toBeUndefined();
    expect(ODOMETER_BANDS.at(-1)!.max).toBeUndefined();
  });

  it("recognises the URL it produced, which is what highlights the active option", () => {
    for (const band of ODOMETER_BANDS) {
      const min = band.min === undefined ? undefined : String(band.min);
      expect(activeOdometerBand(min, bandOdoMax(band))).toBe(band.value);
    }
  });

  it("highlights nothing for a range that is not a band", () => {
    // A hand-typed or legacy URL spanning two bands matches none of them. That
    // is honest: no single option describes it, and lighting one up would lie.
    expect(activeOdometerBand("30000", "170000")).toBeUndefined();
    expect(activeOdometerBand("50000", "100000")).toBeUndefined(); // the old, wrong form
    expect(activeOdometerBand(undefined, undefined)).toBeUndefined();
  });

  it("names every band in the SQL that counts them", () => {
    // The CASE is a string, so TypeScript cannot catch a band added here and
    // forgotten there — the symptom would be an option that always reads zero.
    for (const band of ODOMETER_BANDS) {
      expect(ODOMETER_BAND_SQL).toContain(`'${band.value}'`);
    }
  });
});
