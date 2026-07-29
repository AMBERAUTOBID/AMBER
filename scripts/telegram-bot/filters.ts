import type { AuctionPlatform, LotStatus } from "./apibaraClient";

/**
 * The channel's two feeds. Modelled on how bidauto.online runs theirs: one
 * Telegram forum supergroup, one topic per feed, so a reader can follow just
 * the one they care about.
 *
 * - "live"   - lots with no Buy Now price, i.e. you have to bid to get them.
 * - "buynow" - lots carrying a fixed Buy Now price, purchasable immediately.
 *
 * The two are split by Apibara's lot_status filter plus a client-side check
 * on buy_now_usd in run.ts, and the asymmetry below is deliberate:
 *
 * - "buynow" uses lot_status="Buy Now", which is exact on both platforms
 *   (20/20 results carried a buy_now_usd on each).
 * - "live" does NOT use lot_status="Timed", even though that reads like the
 *   obvious opposite. "Timed" is IAAI's own term and Copart returns *zero*
 *   results for it - measured, not assumed - so using it would have made the
 *   LIVE feed quietly IAAI-only and dropped half the market. Instead it
 *   searches "All" and run.ts drops anything carrying a Buy Now price.
 *
 * Cost of that choice: on Copart roughly 12 of every 20 "All" results are
 * Buy Now lots that get filtered out, so a LIVE search yields fewer usable
 * lots per API call than a Buy Now one. That's the right trade against
 * excluding an entire auction house.
 */
export type ChannelSection = "live" | "buynow";

export const CHANNEL_SECTIONS: ChannelSection[] = ["live", "buynow"];

export const SECTION_LOT_STATUS: Record<ChannelSection, LotStatus> = {
  live: "All",
  buynow: "Buy Now",
};

/**
 * Edit this list to control what the bot looks for. Each entry is one
 * saved search - the bot runs every entry on every scheduled run and posts
 * any lot it hasn't posted before (tracked in postedLots.json).
 *
 * Field notes (only include what you actually want to filter on - omit the
 * rest):
 * - make/model: match src/lib/vehicleData.ts's naming (e.g. "Land Rover",
 *   "Range Rover Sport") - Apibara's make/model match is case-insensitive.
 * - damage: real values confirmed via Apibara's /vehicles/filters endpoint:
 *   "Mechanical" | "Hail" | "Fire" | "Water" | "Theft" | "Repossession" |
 *   "Rollover" | "Vandalized" | "Chemical". Matches primary OR secondary
 *   damage, checked client-side in run.ts (see the comment in
 *   apibaraClient.ts for why - the API doesn't reliably OR multiple values
 *   server-side).
 * - titleKeyword: NOT a verified Apibara API filter - Apibara's
 *   sale_document_type param returned zero results for "salvage"/"clean" in
 *   testing, so this instead does a plain substring match against the real
 *   sale_document.name text returned per lot (e.g. "SALVAGE",
 *   "CLEAN TITLE", "DEALER ONLY CLEAN TITLE"). Check a few real listings
 *   for your target make/model first to see what text actually shows up.
 * - runCondition: "RUNS AND DRIVES" | "STATIONARY" | "NO INFORMATION" |
 *   "ENGINE START PROGRAM" (confirmed via live vehicle records).
 */
export interface SavedSearchFilter {
  name: string;
  platform?: AuctionPlatform;
  make?: string;
  model?: string;
  yearFrom?: number;
  yearTo?: number;
  priceMaxUsd?: number;
  odometerMaxMi?: number;
  damage?: string[];
  runCondition?: "RUNS AND DRIVES" | "STATIONARY" | "NO INFORMATION" | "ENGINE START PROGRAM";
  titleKeyword?: string;
  sellerType?: "insurance" | "non_insurance" | "dealer" | "finance";
  // Cost-estimate destination for this saved search's Telegram post -
  // defaults to Klaipėda, Lithuania if omitted. Must be one of
  // costEstimate.ts's PORT_MULTIPLIER keys.
  destinationPort?: string;
  // Which channel feeds this search should fill. Omit for both, which is
  // usually what you want: the same car criteria are just as interesting
  // whether the lot is bid-only or buy-it-now. Each section is searched
  // separately (one Apibara call each), so restricting this to one section
  // halves that search's API usage.
  sections?: ChannelSection[];
  // Several model names treated as one search, for families Apibara has no
  // single name for. It lists BMW's 3 Series per trim ("330I", "328I",
  // "320I", ...) and returns nothing at all for model="3 Series", so a
  // family search has to fan out across the trims and merge the results.
  // Costs one API call per model name; `model` above is the single-name form.
  models?: string[];
  // Caps how many lots this search posts per section per run, overriding
  // MAX_POSTS_PER_SEARCH_PER_RUN in run.ts. Mainly useful for keeping a test
  // profile down to a single post.
  maxPostsPerRun?: number;
}

// TEMPORARY - these four exist only to put one Copart and one IAAI post in
// each section so the channel's look can be reviewed. They are not real
// buying criteria and should be replaced wholesale with the actual makes,
// models, year ranges and price caps before the bot runs on a schedule.
const BMW_3_SERIES_TRIMS = ["330I", "328I", "320I", "335I", "340I", "325I", "318I"];

export const SAVED_SEARCHES: SavedSearchFilter[] = [
  {
    name: "TEST BMW 3 Series (Copart)",
    platform: "copart",
    make: "BMW",
    models: BMW_3_SERIES_TRIMS,
    sections: ["live"],
    maxPostsPerRun: 1,
  },
  {
    name: "TEST BMW 3 Series (IAAI)",
    platform: "iaai",
    make: "BMW",
    models: BMW_3_SERIES_TRIMS,
    sections: ["live"],
    maxPostsPerRun: 1,
  },
  {
    name: "TEST Jeep Cherokee (Copart)",
    platform: "copart",
    make: "Jeep",
    model: "Cherokee",
    sections: ["buynow"],
    maxPostsPerRun: 1,
  },
  {
    name: "TEST Jeep Cherokee (IAAI)",
    platform: "iaai",
    make: "Jeep",
    model: "Cherokee",
    sections: ["buynow"],
    maxPostsPerRun: 1,
  },
];
