/**
 * The cars the home page leads with.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * The catalogue holds ~141,000 lots and the home page showed **none of them**.
 * A visitor could not answer the only question they arrived with — "do you have
 * the sort of car I want?" — without leaving the page. Competitors open with
 * inventory; we opened with three paragraphs about inventory.
 *
 * ── WHY A CURATED LIST AND NOT A VALUE FILTER ────────────────────────────
 * The obvious approach is "highest estimated retail value", and it was tried
 * against the mirror first. **It surfaces garbage**, measured 2026-08-18 over
 * lots selling within seven days:
 *
 *     $10,000,000  2005 HONDA CRV          ← corrupt
 *      $2,928,650  2020 TOYOTA TACOMA      ← corrupt
 *      $1,650,000  2019 PREVOST BUS        ← not a car
 *        $685,535  2015 E-ONE (fire truck) ← not a car
 *        $589,654  2020 BMW X5             ← corrupt
 *
 * Sorted by value, the first page is buses, motorhomes and bad data. That on a
 * home page is worse than showing nothing. Naming the makes and models instead
 * cannot be corrupted by a bad number in one row.
 *
 * ── EVERY QUERY BELOW WAS PROBED AGAINST THE LIVE API ────────────────────
 * 2026-08-18, seven-day window: every candidate returned 200 with photographs
 * on every row, and the mirror confirms supply — the smallest marque here still
 * has 381 upcoming lots.
 *
 * ⚠️ A SECOND "POPULAR IN LITHUANIA" RAIL WAS BUILT AND REMOVED THE SAME DAY,
 * on the owner's call — one strong row of cars beats two competing ones, and
 * the second rail pushed the calculator and the route map below three screens
 * of cards. The machinery it needed (`spread`) stayed, because it turned out to
 * be what this rail wanted too.
 */
import type { VehicleListItem } from "../api/types";

export interface ShowcaseQuery {
  make: string;
  /** Absent = the whole make, which is the right call for marques where every
   *  car qualifies. Present = a single model, for sport trims inside a
   *  mainstream make. */
  model?: string;
}

/**
 * Sport and luxury: marques where the make alone is the filter, then sport
 * models inside mainstream makes. The owner's brief was "BMW M, Porsche, Audi
 * S/RS, Dodge RT and the exotics".
 */
export const SHOWCASE_QUERIES: ShowcaseQuery[] = [
  { make: "Porsche" },
  { make: "Ferrari" },
  { make: "Lamborghini" },
  { make: "Maserati" },
  { make: "Bentley" },
  { make: "Aston Martin" },
  { make: "BMW", model: "M3" },
  { make: "BMW", model: "M4" },
  { make: "Mercedes-Benz", model: "AMG GT" },
  { make: "Mercedes-Benz", model: "G 63 AMG" },
  { make: "Chevrolet", model: "Corvette" },
  { make: "Audi", model: "RS5" },
  { make: "Audi", model: "R8" },
  { make: "Nissan", model: "GT-R" },
];

/**
 * How far ahead the window starts.
 *
 * ⚠️ NOT ZERO, AND THAT IS THE FIX FOR A RAIL FULL OF CARDS WITH NO COUNTDOWN.
 * The page is cached for six hours (see `revalidate` on the home page) and
 * Copart runs sales every day, so a lot that was "selling in two hours" when
 * the page was generated has already sold by the time somebody reads it. The
 * countdown then correctly hides itself and the card shows no time at all —
 * reported by the owner on 2026-08-18, and it looks like the feature is broken
 * when it is the cache that is stale.
 *
 * Starting the window twelve hours out means even a six-hour-old page still
 * has six hours on its soonest card. It also matches a rule that already
 * exists: `bidWindow` refuses a bid instruction inside four hours, so a lot
 * selling this afternoon is not something a visitor could act on anyway.
 */
export const SHOWCASE_WINDOW_FROM_HOURS = 12;

/** And how far ahead it ends. Long enough to always fill the rail, short enough
 *  that "selling soon" stays a true description. */
export const SHOWCASE_WINDOW_DAYS = 7;

/**
 * Cards on the rail.
 *
 * Higher than the eight a two-row grid held, because the rail is now a single
 * row that scrolls sideways — the row can be as long as there are good cars,
 * and a scroller with only eight items barely scrolls.
 */
export const SHOWCASE_LIMIT = 14;

function priceOf(v: VehicleListItem): number {
  return Math.max(v.pricing?.current_bid_usd ?? 0, v.pricing?.buy_now_usd ?? 0);
}

function saleTime(v: VehicleListItem): number {
  const raw = v.auction?.full_date ?? v.auction?.auction_at ?? null;
  if (!raw) return Number.POSITIVE_INFINITY;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/**
 * Merge the per-query pages into the rail.
 *
 * The ranking is deliberate and the order of the two keys matters:
 *
 * 1. **A lot with a price outranks one without.** Measured on the live API: a
 *    Porsche page came back with twenty cars and not one current bid, while
 *    Ferrari and Bentley pages were fully priced. A card whose price reads "—"
 *    is the weakest thing we can put on a home page, so those sink rather than
 *    being dropped — they still fill the rail when nothing better exists.
 * 2. **Then soonest sale**, which is what makes "selling soon" true.
 *
 * Photographs are required, not preferred: a card with no image is a hole in
 * the row, and every probed query returned images on every row, so requiring
 * one costs nothing real.
 */
export function pickShowcase(
  pages: VehicleListItem[][],
  {
    now = new Date(),
    limit = SHOWCASE_LIMIT,
    /**
     * Take one from each query before taking a second from any.
     *
     * ⚠️ WITHOUT THIS THE RAIL SHOWS ONE MARQUE. Measured while building it:
     * eight cards came back BMW, then four Porsches in a row, because whichever
     * query happens to hold the soonest priced lots wins every slot and a flat
     * ranking has no reason to look at the other twelve. A row headed "sport and
     * luxury" that is four Porsches is a narrower promise than the catalogue
     * actually keeps.
     */
    spread = false,
  }: { now?: Date; limit?: number; spread?: boolean } = {}
): VehicleListItem[] {
  const seen = new Set<string>();

  const rank = (a: VehicleListItem, b: VehicleListItem) => {
    const pa = priceOf(a) > 0 ? 0 : 1;
    const pb = priceOf(b) > 0 ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return saleTime(a) - saleTime(b);
  };

  const usable = (v: VehicleListItem) => {
    if (!v?.lot_number) return false;
    if (!v.media?.thumbs?.[0]) return false;
    // A sale already past is not "selling soon". The query applies the window
    // too, but a page regenerated six hours ago can hold rows that have since
    // run — see SHOWCASE_WINDOW_FROM_HOURS for why the window starts ahead of
    // now rather than at it.
    const at = saleTime(v);
    if (at !== Number.POSITIVE_INFINITY && at <= now.getTime()) return false;
    // The same car can be returned by two queries (an "AMG GT" is also a
    // Mercedes), and the same lot number exists on both platforms for 29 known
    // lots — so the key is the pair, exactly as favourites uses it.
    const key = `${v.platform}:${v.lot_number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  // Each query's own page, filtered and ranked within itself. Doing this per
  // page rather than over one merged pool is what makes the round-robin below
  // possible at all.
  const ranked = pages.map((page) => page.filter(usable).sort(rank));

  if (!spread) return ranked.flat().sort(rank).slice(0, limit);

  const out: VehicleListItem[] = [];
  const cursors = ranked.map(() => 0);
  // Rounds, not passes over a merged list: round 1 takes each query's best,
  // round 2 its second, and so on until the rail is full or nothing is left.
  while (out.length < limit) {
    let took = false;
    for (let i = 0; i < ranked.length && out.length < limit; i++) {
      const next = ranked[i][cursors[i]];
      if (!next) continue;
      cursors[i]++;
      out.push(next);
      took = true;
    }
    if (!took) break;
  }
  return out;
}

/**
 * The window as the API wants it: plain `YYYY-MM-DD`, inclusive both ends.
 *
 * ⚠️ The API takes whole days, so the twelve-hour head start is applied by
 * rounding the start **up to the next day** whenever twelve hours from now is
 * already tomorrow. That is coarser than the rule it implements, and it is the
 * best the endpoint allows; `pickShowcase` still drops anything that has
 * actually run.
 */
export function showcaseWindow(now: Date = new Date()): { from: string; to: string } {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(now.getTime() + SHOWCASE_WINDOW_FROM_HOURS * 3_600_000);
  return {
    from: day(start),
    to: day(new Date(now.getTime() + SHOWCASE_WINDOW_DAYS * 86_400_000)),
  };
}
