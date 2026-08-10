/**
 * A link to the lot on the auction's own site, so a client can check our page
 * against the source.
 *
 * The user asked for this after seeing it on bidauto.online and usautoimport:
 * a Copart or IAAI badge that opens the original listing. It is a trust feature
 * — "here is where this came from, compare it yourself" — and it costs nothing,
 * because both formats need only the lot number we already store as NOT NULL.
 *
 * THE TWO PLATFORMS ARE NOT SYMMETRICAL, and this was verified rather than
 * assumed by reading what a working competitor actually links to:
 *
 *   Copart  https://www.copart.com/lot/{lot}          — a real deep link
 *   IAAI    https://www.iaai.com/Search?Keyword={lot} — a SEARCH, not a lot page
 *
 * IAAI's own detail URL needs a branch code and an internal item id that
 * resellers do not have, so even bidauto sends the visitor through search. That
 * is the honest choice: a search that finds the lot beats a hand-built deep link
 * that 404s.
 */
export type AuctionPlatformName = "copart" | "iaai";

export function auctionLotUrl(
  platform: string | null | undefined,
  lotNumber: string | null | undefined
): string | null {
  const lot = lotNumber?.trim();
  if (!lot) return null;
  // Both formats put the lot number straight into the URL, so anything that is
  // not a plain identifier is refused rather than encoded — a lot number with a
  // slash or a query character in it is data we do not understand, and guessing
  // would send a client somewhere unintended.
  if (!/^[A-Za-z0-9-]+$/.test(lot)) return null;

  switch (platform?.trim().toLowerCase()) {
    case "copart":
      return `https://www.copart.com/lot/${lot}`;
    case "iaai":
      return `https://www.iaai.com/Search?Keyword=${lot}`;
    default:
      // An unknown platform gets no link at all. A wrong auction's search page
      // would look authoritative and show the wrong car.
      return null;
  }
}

/** What to call the destination in the UI. Proper nouns, so not translated. */
export function auctionDisplayName(platform: string | null | undefined): string | null {
  switch (platform?.trim().toLowerCase()) {
    case "copart":
      return "Copart";
    case "iaai":
      return "IAAI";
    default:
      return null;
  }
}
