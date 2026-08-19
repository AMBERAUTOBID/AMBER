/**
 * How the ticker on the home page turns make counts into a line of text.
 *
 * ⚠️ THE STRIP USED TO CARRY FOUR CLAIMS ABOUT OURSELVES — "daily participation
 * in Copart auctions", "export paperwork handled" — which is decoration wearing
 * the costume of information. The competitor's equivalent strip carries a real
 * fact (a duty change with a date), and the audit's note was that a new business
 * with no track record has to differentiate on **transparency**: real numbers,
 * real lots, real terms. We hold 134,000 lots and were saying nothing about them.
 *
 * ⚠️ IT IS A FACT WITH A SHELF LIFE, WHICH IS WHY THE THRESHOLD EXISTS. The home
 * page regenerates every six hours (`revalidate = 21600`), so any number printed
 * here is up to six hours stale. A make with four lots could genuinely be at
 * zero by the time somebody reads it, and "BMW · 4 lots" leading to an empty
 * search is worse than no number at all. `MIN_LOTS` keeps the strip to marques
 * whose count cannot plausibly empty inside a day.
 *
 * Pure and database-free so the formatting and the threshold are testable
 * without a connection — the query lives in `postgresSource`.
 */

export interface MakeCount {
  make: string;
  count: number;
}

/**
 * Below this a count is too volatile to print for six hours. 500 is roughly
 * four days of the whole catalogue's turnover applied to one marque — comfortably
 * more than the window this page is served over.
 */
export const MIN_LOTS = 500;

/**
 * How many marques the ticker carries.
 *
 * Twelve, because the strip duplicates its own list to loop seamlessly and a
 * shorter list makes the repeat obvious within one pass. More than about fifteen
 * and the far end is never read by anybody.
 */
export const MARQUEE_LIMIT = 12;

/**
 * The marques worth printing, biggest first.
 *
 * ⚠️ SORTED BY INVENTORY, WHICH IS THE OPPOSITE OF THE PICKERS. The filter
 * panel and the search widget list makes alphabetically, deliberately — a
 * shopper knows the name they want before they open the list. This strip is
 * read passively by somebody who is not looking for anything in particular, so
 * the useful order is "what do you actually have a lot of".
 */
export function marqueeMakes(rows: readonly MakeCount[], limit = MARQUEE_LIMIT): MakeCount[] {
  return rows
    .filter((r) => r.count >= MIN_LOTS && r.make.trim().length > 0)
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * "BMW · 4,812 lots", in the reader's own number format.
 *
 * The locale matters more than it looks: 4,812 in English is 4 812 in Lithuanian
 * and Russian, and a thousands separator in the wrong convention is the kind of
 * detail that makes a real number look like imported filler.
 */
export function formatMarqueeItem(
  template: string,
  make: string,
  count: number,
  locale: string
): string {
  return template
    .replace("{make}", make)
    .replace("{count}", count.toLocaleString(locale));
}
