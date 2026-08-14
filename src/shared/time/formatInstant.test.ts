import { describe, expect, it } from "vitest";
import { formatInstant } from "./formatInstant";

/**
 * The exact instant that exposed the bug: a sale at 01:00 UTC, which the
 * vendor's string rendered as "04:00" while the countdown on the same card
 * counted down to 21:00 the previous evening in the reader's zone.
 */
const SALE = "2026-08-14T01:00:00.000Z";

describe("formatInstant", () => {
  it("writes one instant differently for each reader", () => {
    const vilnius = formatInstant(SALE, "lt", "Europe/Vilnius");
    const savannah = formatInstant(SALE, "lt", "America/New_York");

    expect(vilnius).not.toEqual(savannah);
    // The seven hours that made the card disagree with its own countdown.
    expect(vilnius).toContain("04:00");
    expect(savannah).toContain("21:00");
  });

  it("always says which zone it means", () => {
    // Without this the reader has a number they cannot act on, and no way to
    // know they cannot act on it.
    const written = formatInstant(SALE, "lt", "Asia/Tbilisi") ?? "";
    expect(written).toMatch(/GMT|UTC|[A-Z]{2,5}/);
  });

  it("follows the reader's language rather than the vendor's", () => {
    expect(formatInstant(SALE, "lt", "Europe/Vilnius") ?? "").not.toContain("Aug");
  });

  it("returns null on a date it cannot read, so the caller can fall back", () => {
    expect(formatInstant("not a date", "lt", "Europe/Vilnius")).toBeNull();
    expect(formatInstant("", "lt", "Europe/Vilnius")).toBeNull();
  });
});
