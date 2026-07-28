import { searchVehicles, type VehicleListItem } from "./apibaraClient";
import { SAVED_SEARCHES, type SavedSearchFilter } from "./filters";
import { loadPostedStore, isAlreadyPosted, markPosted, pruneAndSave } from "./postedStore";
import { buildAllCaptions, extractPhotoUrls } from "./formatPost";
import { postVehicleToChannel } from "./telegram";
import { kvSetJson } from "../../src/lib/upstashKv";

// Matches postedStore.ts's retention window - no point caching a language
// switch for a lot the dedup store itself will have forgotten about.
const CAPTION_CACHE_TTL_SECONDS = 45 * 24 * 60 * 60;

// Safety cap: a saved search matching many new lots in one run (e.g. its
// first-ever run) shouldn't flood the channel all at once.
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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSavedSearch(search: SavedSearchFilter, postedStore: Record<string, string>): Promise<void> {
  console.log(`[${search.name}] searching...`);

  let results;
  try {
    results = await searchVehicles({
      platform: search.platform,
      make: search.make,
      model: search.model,
      year_from: search.yearFrom,
      year_to: search.yearTo,
      price_max: search.priceMaxUsd,
      odometer_to: search.odometerMaxMi,
      damage: search.damage,
      run_cond: search.runCondition,
      seller_type: search.sellerType,
      per_page: 20,
    });
  } catch (e) {
    console.error(`[${search.name}] search failed:`, e instanceof Error ? e.message : e);
    return;
  }

  const candidates = results.data.filter(
    (v) =>
      !isAlreadyPosted(postedStore, v.vin) &&
      matchesDamage(v, search.damage) &&
      matchesTitleKeyword(v, search.titleKeyword)
  );

  if (candidates.length === 0) {
    console.log(`[${search.name}] no new matches.`);
    return;
  }

  const toPost = candidates.slice(0, MAX_POSTS_PER_SEARCH_PER_RUN);
  if (candidates.length > toPost.length) {
    console.log(
      `[${search.name}] ${candidates.length} new matches, posting the first ${toPost.length} this run (rest will post next run).`
    );
  }

  for (const vehicle of toPost) {
    try {
      const captions = buildAllCaptions(vehicle, search);
      // Cached before posting so the webhook can look a language up the
      // instant someone taps a button - no re-fetching Apibara per click.
      if (process.env.DRY_RUN !== "true") {
        await kvSetJson(`bot:captions:${vehicle.vin}`, captions, CAPTION_CACHE_TTL_SECONDS);
      }
      const photos = extractPhotoUrls(vehicle);
      await postVehicleToChannel(photos, captions.en, vehicle.vin);
      markPosted(postedStore, vehicle.vin);
      console.log(`[${search.name}] posted ${vehicle.vin} (${vehicle.title}).`);
    } catch (e) {
      console.error(`[${search.name}] failed to post ${vehicle.vin}:`, e instanceof Error ? e.message : e);
    }
    await sleep(DELAY_BETWEEN_POSTS_MS);
  }
}

async function main() {
  const postedStore = loadPostedStore();

  for (const search of SAVED_SEARCHES) {
    await runSavedSearch(search, postedStore);
  }

  pruneAndSave(postedStore);
}

main().catch((e) => {
  console.error("Bot run failed:", e);
  process.exit(1);
});
