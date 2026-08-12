/**
 * Mileage bands: the facet the panel offers, and the SQL that counts them.
 *
 * ONE DEFINITION, TWO CONSUMERS. `postgresSource` counts rows into these bands
 * and the filter panel renders them as options. Held apart, the counts and the
 * links drift, and the failure is silent — an option reading "50,000–100,000
 * (20,808)" that filters on something else is worse than no count at all.
 *
 * BANDS RATHER THAN A SLIDER, and bands measured rather than guessed. Across
 * 108,762 upcoming lots with a reading the split is 28,293 / 20,808 / 25,702 /
 * 19,537 / 14,422, so every band carries real inventory and none swallows the
 * others. Median mileage is 110,314, in the middle band. Odometer is populated
 * on effectively every lot — 488 of 109,250 lack it — so this filter costs
 * almost nobody their results, unlike the retail-value one.
 *
 * THE URL KEEPS `odoMin`/`odoMax`, not a band name. A band is a presentation
 * choice; the underlying filter is a range, and expressing it as one means the
 * chips, the old shared links and any future slider all keep working without a
 * translation table.
 */
export interface OdometerBand {
  /** Stable id used for the facet value and the message key. */
  value: string;
  /** Inclusive lower bound in miles. Undefined means "no floor". */
  min?: number;
  /** EXCLUSIVE upper bound in miles. Undefined means "no ceiling". */
  max?: number;
}

/**
 * The `odoMax` to put in a URL for a band — one less than its exclusive bound.
 *
 * The bands are half-open (`odometer < 100000`) but the search filter is
 * inclusive (`odometer <= odoMax`), so sending the bound raw pulls in every car
 * sitting exactly on it. That is not theoretical: the 50,000–100,000 band
 * counted 19,219 while the same filter returned 19,222, and the three extra
 * cars all read exactly 100,000 miles. A count that disagrees with the list it
 * labels is worse than no count, which is the whole reason the bands exist.
 */
export function bandOdoMax(band: OdometerBand): string | undefined {
  return band.max === undefined ? undefined : String(band.max - 1);
}

export const ODOMETER_BANDS: readonly OdometerBand[] = [
  { value: "lt_50000", max: 50000 },
  { value: "50000_100000", min: 50000, max: 100000 },
  { value: "100000_150000", min: 100000, max: 150000 },
  { value: "150000_200000", min: 150000, max: 200000 },
  { value: "gte_200000", min: 200000 },
];

/**
 * The CASE that assigns a row to a band, as text.
 *
 * Repeated verbatim in the select list and in GROUPING SETS because Postgres
 * will not accept an output alias in the latter. Kept here so the two copies
 * cannot disagree with the bands above.
 */
export const ODOMETER_BAND_SQL = `case
  when odometer is null then null
  when odometer < 50000 then 'lt_50000'
  when odometer < 100000 then '50000_100000'
  when odometer < 150000 then '100000_150000'
  when odometer < 200000 then '150000_200000'
  else 'gte_200000'
end`;

/** Display order is band order. A mileage list sorted by popularity reads as
 *  shuffled, however true the counts are. */
export const ODOMETER_BAND_ORDER = new Map(ODOMETER_BANDS.map((b, i) => [b.value, i]));

/** Which band, if any, the current `odoMin`/`odoMax` pair represents. Exact
 *  match only: a hand-typed range that spans two bands highlights neither,
 *  which is honest — no single option describes it. */
export function activeOdometerBand(
  odoMin: string | undefined,
  odoMax: string | undefined
): string | undefined {
  const min = odoMin ? String(Number(odoMin)) : undefined;
  const max = odoMax ? String(Number(odoMax)) : undefined;
  return ODOMETER_BANDS.find(
    (b) => (b.min === undefined ? min === undefined : min === String(b.min)) && max === bandOdoMax(b)
  )?.value;
}
