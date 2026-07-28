/**
 * Tracks which lots have already been posted so the bot doesn't repost the
 * same car every run. Persisted as a JSON file committed back to the repo by
 * the GitHub Actions workflow (see .github/workflows/telegram-bot.yml) -
 * there's no database in this project, and git is a perfectly fine store
 * for something this small that only one workflow run touches at a time.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const STORE_PATH = path.join(__dirname, "postedLots.json");

// Old entries are pruned after this long so the file doesn't grow forever -
// auction lots are long gone by then anyway.
const RETENTION_DAYS = 45;

interface PostedStore {
  [vin: string]: string; // ISO timestamp of when it was posted
}

export function loadPostedStore(): PostedStore {
  if (!existsSync(STORE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf8")) as PostedStore;
  } catch {
    return {};
  }
}

export function isAlreadyPosted(store: PostedStore, vin: string): boolean {
  return vin in store;
}

export function markPosted(store: PostedStore, vin: string): void {
  store[vin] = new Date().toISOString();
}

export function pruneAndSave(store: PostedStore): void {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const pruned: PostedStore = {};
  for (const [vin, postedAt] of Object.entries(store)) {
    if (new Date(postedAt).getTime() >= cutoff) pruned[vin] = postedAt;
  }
  writeFileSync(STORE_PATH, JSON.stringify(pruned, null, 2) + "\n", "utf8");
}
