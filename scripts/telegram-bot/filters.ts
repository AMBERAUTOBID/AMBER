import type { AuctionPlatform } from "./apibaraClient";

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
}

export const SAVED_SEARCHES: SavedSearchFilter[] = [
  {
    name: "Honda Civic 2016-2021 under $8k",
    make: "Honda",
    model: "Civic",
    yearFrom: 2016,
    yearTo: 2021,
    priceMaxUsd: 8000,
    runCondition: "RUNS AND DRIVES",
  },
  {
    name: "BMW X5 2018+ under $15k",
    make: "BMW",
    model: "X5",
    yearFrom: 2018,
    priceMaxUsd: 15000,
  },
];
