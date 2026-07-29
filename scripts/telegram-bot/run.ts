import { searchVehicles, getRelatedVehicles, type VehicleListItem } from "./apibaraClient";
import { comparableSoldStats, type ComparableSoldStats } from "./marketStats";
import {
  SAVED_SEARCHES,
  CHANNEL_SECTIONS,
  SECTION_LOT_STATUS,
  type ChannelSection,
  type SavedSearchFilter,
} from "./filters";
import { loadPostedStore, isAlreadyPosted, markPosted, pruneAndSave } from "./postedStore";
import { buildAllCaptions, extractPhotoUrls } from "./formatPost";
import { postVehicleToChannel } from "./telegram";
import { kvSetJson } from "../../src/lib/upstashKv";

// A dry run must not touch any persisted state: it neither posts nor caches
// captions, so marking those lots as "posted" would silently ensure they
// never get posted for real - exactly the opposite of what previewing a new
// filter profile is for.
const DRY_RUN = process.env.DRY_RUN === "true";

// Matches postedStore.ts's retention window - no point caching a language
// switch for a lot the dedup store itself will have forgotten about.
const CAPTION_CACHE_TTL_SECONDS = 45 * 24 * 60 * 60;

// Safety cap: a saved search matching many new lots in one run (e.g. its
// first-ever run) shouldn't flood the channel all at once. Applied per
// section, so one search can contribute at most this many posts to the
// LIVE feed and this many to the Buy Now feed.
const MAX_POSTS_PER_SEARCH_PER_RUN = 5;
// Telegram allows roughly one message per second per channel.
const DELAY_BETWEEN_POSTS_MS = 1500;

function matchesDamage(v: VehicleListItem, wanted: string[] | undefined): boolean {
  if (!wanted || wanted.length === 0) return true;
  const primary = v.condition?.primary_damage?.toLowerCase();
  const secondary = v.condition?.secondary_damage?.toLowerCase();
  return wanted.some((d) => {
    const dl = d.toLowerCase();
    return primary === dl || secondary === dl;
  });
}

function matchesTitleKeyword(v: VehicleListItem, keyword: string | undefined): boolean {
  if (!keyword) return true;
  const name = v.sale_document?.name?.toLowerCase() ?? "";
  return name.includes(keyword.toLowerCase());
}

/**
 * Belt-and-braces check that a lot really belongs in the section we asked
 * Apibara for. The lot_status filter already separates them server-side; if
 * that ever changes silently, this turns "cars posted to the wrong feed"
 * into "fewer cars posted", which is the far cheaper failure.
 */
function belongsInSection(v: VehicleListItem, section: ChannelSection): boolean {
  const buyNow = v.pricing?.buy_now_usd;
  const hasBuyNow = typeof buyNow === "number" && buyNow > 0;
  return section === "buynow" ? hasBuyNow : !hasBuyNow;
}

// Sections are tracked independently so a lot that later gains (or loses) a
// Buy Now price can still appear once in the other feed - that's genuinely
// new information for that feed's readers, not a repost.
function storeKey(section: ChannelSection, vin: string): string {
  return `${section}:${vin}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One extra Apibara call per lot, so it's deliberately made only for lots
 * that are actually about to be posted - never for the whole result set.
 * Worst case that's MAX_POSTS_PER_SEARCH_PER_RUN per search per section.
 *
 * A failure here costs us a nice-to-have line, not the post: comparable
 * sales are supplementary, and dropping the whole listing over them would
 * be the wrong trade.
 */
async function fetchSoldStats(vehicle: VehicleListItem): Promise<ComparableSoldStats | null> {
  try {
    const related = await getRelatedVehicles(vehicle.vin);
    return comparableSoldStats(vehicle, related.data?.past ?? []);
  } catch (e) {
    console.warn(`  comparable sales unavailable for ${vehicle.vin}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

async function runSavedSearch(
  search: SavedSearchFilter,
  section: ChannelSection,
  postedStore: Record<string, string>
): Promise<void> {
  const label = `${search.name} / ${section}`;
  console.log(`[${label}] searching...`);

  // A family search (`models`) is several API calls merged; a plain one is a
  // single call with model undefined. One model failing shouldn't lose the
  // others, so failures are logged per model and the rest still count.
  const modelNames = search.models ?? [search.model];
  const found: VehicleListItem[] = [];
  const seenVins = new Set<string>();

  for (const model of modelNames) {
    try {
      const page = await searchVehicles({
        platform: search.platform,
        lot_status: SECTION_LOT_STATUS[section],
        make: search.make,
        model,
        year_from: search.yearFrom,
        year_to: search.yearTo,
        price_max: search.priceMaxUsd,
        odometer_to: search.odometerMaxMi,
        damage: search.damage,
        run_cond: search.runCondition,
        seller_type: search.sellerType,
        per_page: 20,
      });
      for (const v of page.data) {
        if (seenVins.has(v.vin)) continue;
        seenVins.add(v.vin);
        found.push(v);
      }
    } catch (e) {
      console.error(
        `[${label}] search failed${model ? ` for model "${model}"` : ""}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  const candidates = found.filter(
    (v) =>
      !isAlreadyPosted(postedStore, storeKey(section, v.vin)) &&
      belongsInSection(v, section) &&
      matchesDamage(v, search.damage) &&
      matchesTitleKeyword(v, search.titleKeyword)
  );

  if (candidates.length === 0) {
    console.log(`[${label}] no new matches.`);
    return;
  }

  const toPost = candidates.slice(0, search.maxPostsPerRun ?? MAX_POSTS_PER_SEARCH_PER_RUN);
  if (candidates.length > toPost.length) {
    console.log(
      `[${label}] ${candidates.length} new matches, posting the first ${toPost.length} this run (rest will post next run).`
    );
  }

  for (const vehicle of toPost) {
    try {
      const soldStats = await fetchSoldStats(vehicle);
      const captions = buildAllCaptions(vehicle, search, section, soldStats);
      // Cached before posting so the webhook can look a language up the
      // instant someone taps a button - no re-fetching Apibara per click.
      // Deliberately non-fatal: without KV configured the language buttons
      // just don't work, which is a far better outcome than every post
      // failing outright. That matters most on a first run, when KV is the
      // likeliest piece to still be missing.
      if (!DRY_RUN) {
        try {
          await kvSetJson(`bot:captions:${vehicle.vin}`, captions, CAPTION_CACHE_TTL_SECONDS);
        } catch (e) {
          console.warn(
            `  language captions not cached for ${vehicle.vin} (buttons won't switch):`,
            e instanceof Error ? e.message : e
          );
        }
      }
      const photos = extractPhotoUrls(vehicle);
      await postVehicleToChannel(photos, captions.en, vehicle.vin, section);
      if (!DRY_RUN) markPosted(postedStore, storeKey(section, vehicle.vin));
      console.log(`[${label}] posted ${vehicle.vin} (${vehicle.title}).`);
    } catch (e) {
      console.error(`[${label}] failed to post ${vehicle.vin}:`, e instanceof Error ? e.message : e);
    }
    await sleep(DELAY_BETWEEN_POSTS_MS);
  }
}

async function main() {
  const postedStore = loadPostedStore();

  for (const search of SAVED_SEARCHES) {
    for (const section of search.sections ?? CHANNEL_SECTIONS) {
      await runSavedSearch(search, section, postedStore);
    }
  }

  if (!DRY_RUN) pruneAndSave(postedStore);
}

main().catch((e) => {
  console.error("Bot run failed:", e);
  process.exit(1);
});
