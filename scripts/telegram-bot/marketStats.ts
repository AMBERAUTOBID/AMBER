/**
 * Turns Apibara's /related "past sales" list into a number we're willing to
 * put in front of a buyer - or nothing at all.
 *
 * The raw list can't be averaged as-is. Apibara matches it at make/model
 * level only, so a 2010 Civic VP and a 2020 Civic Sport Touring receive the
 * identical twelve sales, spanning 2010-2026, including a burnt shell that
 * sold for $150 and a clean 2024 at $17,000. The naive mean of that set is
 * ~$10,400 for every Civic regardless of which car you're actually looking
 * at, which would tell a reader that a $3,000 lot is a steal when it may not
 * be. bidauto.online publishes a single bare "average sale price" line; we
 * deliberately don't copy that, because we can't stand behind it.
 *
 * So: restrict to genuinely comparable cars, refuse to print anything when
 * too few remain, and publish the spread and sample size alongside the
 * average so the reader can judge it themselves.
 */
import type { VehicleListItem } from "./apibaraClient";

// Model years within this many years of the lot's own count as comparable.
// A Civic is not the same car three generations apart.
const YEAR_TOLERANCE = 3;

// Below this many comparable sales the average is noise, and the line is
// omitted entirely rather than shown with a caveat nobody reads. In testing
// this means plenty of lots get no line at all - including every BMW X5,
// whose `past` list came back empty. That's the honest outcome, not a bug.
const MIN_SAMPLE_SIZE = 3;

export interface ComparableSoldStats {
  minUsd: number;
  maxUsd: number;
  avgUsd: number;
  sampleSize: number;
  yearFrom: number;
  yearTo: number;
}

export function comparableSoldStats(
  lot: VehicleListItem,
  past: VehicleListItem[]
): ComparableSoldStats | null {
  if (!lot.year) return null;

  const comparable = past.filter((p) => {
    const price = p.pricing?.last_sold_price_usd;
    // A `last_sold_price_usd` of 0 means "no sale recorded", not "sold for
    // nothing" - roughly a third of the list, and including them would drag
    // every average toward zero.
    if (typeof price !== "number" || price <= 0) return false;
    return typeof p.year === "number" && Math.abs(p.year - lot.year) <= YEAR_TOLERANCE;
  });

  if (comparable.length < MIN_SAMPLE_SIZE) return null;

  const prices = comparable.map((p) => p.pricing!.last_sold_price_usd as number);
  const years = comparable.map((p) => p.year);

  return {
    minUsd: Math.min(...prices),
    maxUsd: Math.max(...prices),
    avgUsd: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    sampleSize: prices.length,
    yearFrom: Math.min(...years),
    yearTo: Math.max(...years),
  };
}
