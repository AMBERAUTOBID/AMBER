import { describe, expect, it } from "vitest";
import { formatOdometer } from "./formatOdometer";

describe("formatOdometer", () => {
  it("reproduces the competitor's conversion digit for digit", () => {
    // Both figures read off bidauto.online for real lots. Matching exactly means
    // a client comparing the two pages has no discrepancy to explain.
    expect(formatOdometer({ mi: 156_580, km: 251_991 })).toBe("156,580 mi (251,991 km)");
    expect(formatOdometer({ mi: 141_436, km: 227_619 })).toBe("141,436 mi (227,619 km)");
  });

  it("converts when the mapper supplied no kilometre figure", () => {
    expect(formatOdometer({ mi: 156_580 })).toBe("156,580 mi (251,991 km)");
    expect(formatOdometer({ mi: 100_000 })).toBe("100,000 mi (160,934 km)");
  });

  it("prints a zero reading rather than hiding the lot", () => {
    // 7,914 searchable lots read 0 and 4,742 read exactly 1. These are the
    // auctions saying the true mileage is unknown, and printing them beats a
    // blank: the number plus the damage and title still tells a buyer something.
    expect(formatOdometer({ mi: 0, km: 0 })).toBe("0 mi (0 km)");
    expect(formatOdometer({ mi: 1, km: 2 })).toBe("1 mi (2 km)");
  });

  it("rounds 1 mile to 2 km, as the competitor does", () => {
    // 1 x 1.609344 = 1.609..., which rounds to 2 — the exact figure in the
    // screenshot this was built from.
    expect(formatOdometer({ mi: 1 })).toBe("1 mi (2 km)");
  });

  it("returns null when there is no reading at all", () => {
    // Distinct from zero: the caller omits the row entirely rather than printing
    // a placeholder.
    expect(formatOdometer(null)).toBeNull();
    expect(formatOdometer(undefined)).toBeNull();
    expect(formatOdometer({})).toBeNull();
    expect(formatOdometer({ mi: null })).toBeNull();
    expect(formatOdometer({ mi: Number.NaN })).toBeNull();
  });
});
