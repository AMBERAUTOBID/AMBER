/**
 * One instant, written in the reader's own timezone and language.
 *
 * WHY THIS EXISTS. The vehicle page printed the sale time straight from the
 * data vendor's pre-rendered `formatted` string — an English month name in a
 * timezone of the vendor's choosing — directly beneath a countdown computed
 * from the same instant in the reader's. Measured on 2026-08-13, that card
 * read "5val 50min" above "Aug 14, 2026 04:00": the countdown was correct,
 * the date was the same moment written in UTC+3, and to a reader in Savannah
 * the two were seven hours apart. Two numbers on one card contradicting each
 * other is worse than either being absent, because nothing tells the reader
 * which to trust.
 *
 * THE TIMEZONE LABEL IS NOT DECORATION. Clients read this page from Lithuania,
 * the Caucasus, western Europe and a US office; the same wall-clock string
 * means a different moment to each of them, and a missed auction is the cost
 * of guessing wrong.
 *
 * Output depends on the reader, so it cannot be produced on the server without
 * either guessing their zone or giving up static generation. Callers format
 * after mount — see AuctionDateCard for the pattern that avoids a flash.
 */
export function formatInstant(
  iso: string,
  locale: string,
  /** Defaults to the reader's own zone; passed explicitly only by tests. */
  timeZone?: string
): string | null {
  const at = new Date(iso);
  // A lot with an unparseable sale date should lose its date, not its page —
  // the caller falls back rather than printing "Invalid Date".
  if (Number.isNaN(at.getTime())) return null;

  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(at);

  // `short` yields "EDT" or "GMT+3" depending on locale; either is
  // unambiguous, which is the entire requirement. Read through formatToParts
  // rather than formatting twice, so the zone joins with our separator instead
  // of whichever punctuation the locale would have chosen.
  const zoneName = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    timeZoneName: "short",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;

  return zoneName ? `${when} · ${zoneName}` : when;
}
