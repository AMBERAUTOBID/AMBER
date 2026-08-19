import { describe, expect, it } from "vitest";
import { marqueeMakes, formatMarqueeItem, MIN_LOTS, MARQUEE_LIMIT } from "./marqueeMakes";

/**
 * The home page ticker prints numbers, and a number is a promise.
 *
 * The two things worth guarding are the two that would embarrass us: printing a
 * count so small it can be wrong by the time it is read, and printing it in a
 * format that makes a real figure look like filler.
 */

/** Shaped like `listMakes()`, with counts measured off the mirror 2026-08-19. */
const REAL = [
  { make: "Ford", count: 17335 },
  { make: "Toyota", count: 16287 },
  { make: "Chevrolet", count: 14454 },
  { make: "Honda", count: 12097 },
  { make: "Nissan", count: 10308 },
  { make: "Hyundai", count: 7306 },
  { make: "Kia", count: 5936 },
  { make: "Jeep", count: 5419 },
  { make: "Dodge", count: 4301 },
  { make: "Mercedes-Benz", count: 3759 },
  { make: "Subaru", count: 3633 },
  { make: "BMW", count: 3588 },
  { make: "Volkswagen", count: 1900 },
  // The tail the pickers deliberately keep and this must not print.
  { make: "8LBE", count: 1 },
  { make: "ACUR", count: 1 },
  { make: "17 1/2", count: 1 },
];

describe("marqueeMakes", () => {
  it("prints the biggest marques first, unlike the pickers", () => {
    // ⚠️ The filter panel and the search widget sort makes ALPHABETICALLY, on
    // the owner's call, because you know the name before you open the list.
    // This strip is read passively, so the useful order is the opposite.
    const out = marqueeMakes(REAL);
    expect(out.map((m) => m.make).slice(0, 3)).toEqual(["Ford", "Toyota", "Chevrolet"]);
    expect(out).toHaveLength(MARQUEE_LIMIT);
  });

  it("refuses a count too small to survive the cache", () => {
    // The home page regenerates every six hours, so anything printed here is up
    // to six hours stale. "8LBE · 1 lot" leading to an empty search is worse
    // than saying nothing.
    const names = marqueeMakes(REAL).map((m) => m.make);
    expect(names).not.toContain("8LBE");
    expect(names).not.toContain("ACUR");
    expect(names).not.toContain("17 1/2");
    expect(marqueeMakes(REAL).every((m) => m.count >= MIN_LOTS)).toBe(true);
  });

  it("returns fewer than the limit rather than padding with small marques", () => {
    // The caller reads a short list as "the mirror is mid-ingest" and falls back
    // to the written claims — see the home page. Padding would defeat that.
    const thin = [
      { make: "Ford", count: 9000 },
      { make: "Tiny", count: 4 },
    ];
    expect(marqueeMakes(thin)).toHaveLength(1);
  });

  it("drops a blank marque, which the catalogue does contain", () => {
    expect(marqueeMakes([{ make: "   ", count: 9000 }])).toEqual([]);
  });
});

describe("formatMarqueeItem", () => {
  it("groups the number the way the reader's own language does", () => {
    // ⚠️ NOT COSMETIC. 17,335 in English is 17 335 in Lithuanian and Russian,
    // and a separator in the wrong convention is exactly what makes a real
    // figure read as imported filler.
    expect(formatMarqueeItem("{make} · {count} lots", "Ford", 17335, "en")).toBe(
      "Ford · 17,335 lots"
    );
    const lt = formatMarqueeItem("{make} · {count} lotų", "Ford", 17335, "lt");
    expect(lt).toMatch(/^Ford · 17\s335 lotų$/);
    expect(lt).not.toContain("17,335");
  });

  it("leaves a template with no placeholders alone", () => {
    expect(formatMarqueeItem("no placeholders", "Ford", 1, "en")).toBe("no placeholders");
  });
});
