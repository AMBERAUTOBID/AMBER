import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auctionDbUrl } from "./auctionDbUrl";

/**
 * Four env vars decide which database ~140,000 rows are written to, and the
 * failure mode is silent: the sweep fills one branch while the health check
 * reads another and calls it healthy.
 *
 * The empty-string case is not hypothetical — it is what GitHub Actions
 * substitutes for a secret that has not been created. The workflow passes both
 * the new and the old name, so on the night either one is missing, one of them
 * arrives as "". `??` treats that as a value, which is exactly the bug these
 * tests exist to keep out.
 */
const KEYS = [
  "DATABASE_URL_AUCTION_UNPOOLED",
  "DATABASE_URL_MIRROR_UNPOOLED",
  "DATABASE_URL_AUCTION",
  "DATABASE_URL_MIRROR",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("auctionDbUrl", () => {
  it("prefers the new name over the old one", () => {
    process.env.DATABASE_URL_AUCTION_UNPOOLED = "postgres://new";
    process.env.DATABASE_URL_MIRROR_UNPOOLED = "postgres://old";
    expect(auctionDbUrl({ unpooled: true })).toBe("postgres://new");
  });

  it("still honours the old name alone, so an unrenamed secret keeps working", () => {
    process.env.DATABASE_URL_MIRROR_UNPOOLED = "postgres://old";
    expect(auctionDbUrl({ unpooled: true })).toBe("postgres://old");
  });

  it("SKIPS an empty new name and falls through to the old one", () => {
    // GitHub Actions substitutes "" for a secret that does not exist. Accepting
    // it would point the nightly sweep at nothing.
    process.env.DATABASE_URL_AUCTION_UNPOOLED = "";
    process.env.DATABASE_URL_MIRROR_UNPOOLED = "postgres://old";
    expect(auctionDbUrl({ unpooled: true })).toBe("postgres://old");
  });

  it("skips a whitespace-only value, which is a secret pasted with a newline", () => {
    process.env.DATABASE_URL_AUCTION_UNPOOLED = "  \n ";
    process.env.DATABASE_URL_MIRROR_UNPOOLED = "postgres://old";
    expect(auctionDbUrl({ unpooled: true })).toBe("postgres://old");
  });

  it("trims a value that is otherwise usable", () => {
    process.env.DATABASE_URL_AUCTION_UNPOOLED = " postgres://new\n";
    expect(auctionDbUrl({ unpooled: true })).toBe("postgres://new");
  });

  it("returns undefined when every name is empty, so callers abort", () => {
    // Must not be "" — the callers test falsiness, but an empty string reaching
    // a Postgres driver is a far worse error message than a missing one.
    process.env.DATABASE_URL_AUCTION_UNPOOLED = "";
    process.env.DATABASE_URL_MIRROR_UNPOOLED = "";
    expect(auctionDbUrl({ unpooled: true })).toBeUndefined();
  });

  it("asks for the pooled endpoint when told to, and the direct one otherwise", () => {
    process.env.DATABASE_URL_AUCTION = "postgres://pooled";
    process.env.DATABASE_URL_AUCTION_UNPOOLED = "postgres://direct";
    expect(auctionDbUrl({ unpooled: false })).toBe("postgres://pooled");
    expect(auctionDbUrl({ unpooled: true })).toBe("postgres://direct");
  });

  it("falls back across pooling rather than returning nothing", () => {
    // A caller that wants unpooled and has only a pooled URL is better served
    // by a working connection than by refusing to run.
    process.env.DATABASE_URL_AUCTION = "postgres://pooled";
    expect(auctionDbUrl({ unpooled: true })).toBe("postgres://pooled");
  });

  it("never reads DATABASE_URL", () => {
    // The one guarantee that keeps a sweep out of the customer database.
    process.env.DATABASE_URL = "postgres://production";
    expect(auctionDbUrl({ unpooled: true })).toBeUndefined();
    expect(auctionDbUrl({ unpooled: false })).toBeUndefined();
  });
});
