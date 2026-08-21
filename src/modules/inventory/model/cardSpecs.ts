/**
 * Display forms for the spec chips a result card shows.
 *
 * The sources publish these fields in two dialects, MEASURED 2026-08-21 on the
 * catalogue (122,306 upcoming lots; every field 94–99% present):
 *
 *   Copart:  fuel "GAS", transmission "AUTOMATIC", color "WHITE",
 *            engine "1.8L 4"
 *   IAAI:    fuel "Gasoline", transmission "Automatic", color "Red",
 *            engine "3.7L V-6 DOHC, VVT, 303HP"
 *
 * Two consequences. Copart shouts, so values are re-cased for display — but
 * ONLY for display: filters and queries keep matching the stored form. And an
 * IAAI engine string is a spec sheet, not a chip, so the card shows just the
 * displacement — the one token both dialects agree on and the one a buyer
 * scanning twenty cards actually reads.
 */

/** "GAS" → "Gas", "FLEXIBLE" → "Flexible", "Red" → "Red". */
export function titleCaseSpec(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * The engine's displacement, or null when the string does not carry one.
 *
 * Null rather than the raw string: an unparseable engine value here is a
 * 40-character spec sheet, and a chip that sometimes explodes to two lines is
 * worse than a chip that is sometimes absent.
 */
export function engineDisplay(raw: string): string | null {
  const m = /(\d+(?:\.\d+)?)\s*L\b/i.exec(raw);
  return m ? `${m[1]}L` : null;
}
