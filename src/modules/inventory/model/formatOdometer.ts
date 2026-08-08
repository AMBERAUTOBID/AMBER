/**
 * The odometer reading as a visitor should read it: miles, with kilometres in
 * brackets.
 *
 * WHY BOTH. Every searchable lot is a US branch and the auctions publish miles —
 * verified, not assumed: of 117,747 searchable lots, 117,747 are stamped `mi`
 * and none `km` (the km rows are exactly the Canadian branches, which are
 * excluded from search). But the audience buys in Lithuania, where nobody thinks
 * in miles, so a bare "156,580 mi" is a number they have to convert themselves.
 *
 * The factor is the exact international mile, and it reproduces the competitor's
 * figures digit for digit — 156,580 mi renders 251,991 km on both sites — so a
 * client comparing the two pages sees no discrepancy to explain.
 */
const KM_PER_MILE = 1.609344;

export interface OdometerReading {
  mi?: number | null;
  km?: number | null;
}

/**
 * Returns null when there is no reading at all, so the caller omits the row
 * rather than printing a placeholder.
 *
 * ZERO IS NOT NULL. A reading of 0 — 7,914 searchable lots — is what the auction
 * published, and 4,742 more read exactly 1. Those are the auctions' way of
 * saying the true mileage is unknown, and the competitor prints them rather than
 * hiding them, because "0 mi" plus the damage and title tells a buyer far more
 * than a blank does. We follow that, and print the number the auction gave.
 *
 * What we deliberately CANNOT print beside it is the odometer brand — the
 * Actual / Not Actual / Exempt flag the competitor shows in red. apicars.auction
 * does not carry it: 50 IAAI lots dumped in full yield 55 distinct field paths
 * and the only odometer-related one is the bare integer. Inferring "Not Actual"
 * from a low reading would be a claim about the car's paperwork made from
 * arithmetic, which is exactly the kind of guess this codebase refuses
 * elsewhere for currency and for units.
 */
export function formatOdometer(odometer: OdometerReading | null | undefined): string | null {
  if (!odometer || typeof odometer.mi !== "number" || !Number.isFinite(odometer.mi)) return null;

  const mi = odometer.mi;
  // Prefer the stored kilometre figure when the mapper produced one, so the two
  // never disagree by a rounding step; fall back to converting here.
  const km =
    typeof odometer.km === "number" && Number.isFinite(odometer.km)
      ? odometer.km
      : Math.round(mi * KM_PER_MILE);

  return `${mi.toLocaleString()} mi (${km.toLocaleString()} km)`;
}
