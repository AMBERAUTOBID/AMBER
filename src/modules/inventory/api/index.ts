/**
 * Public entry for the inventory API. Import from `@/modules/inventory/api`
 * rather than reaching into ./client or ./lotFields directly — per
 * ARCHITECTURE.md, a module is consumed through its entry point.
 *
 * The one exception is code running outside Next (scripts/telegram-bot),
 * which must import `./types` and `./lotFields` directly: this barrel
 * re-exports ./client, and that file's `next: { revalidate }` option is
 * meaningless in a plain tsx process.
 */
export * from "./types";
export * from "./client";
export * from "./lotFields";
// The seam that lets search move to our own database later without touching
// call sites. Prefer `getAuctionSource()` over importing from ./client directly.
export * from "./source";
