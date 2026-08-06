import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuctionSource } from "./source";

/**
 * The resolver's job is to be boring: Apibara answers unless something valid and
 * implemented says otherwise.
 *
 * This matters more than it looks. The site has to stay launchable on Apibara
 * with no revert work even if the Postgres migration is abandoned half-built, so
 * a wrong or stale `SEARCH_SOURCE` must degrade to the working source rather
 * than throw. A resolver that threw on an unrecognised value would turn a typo
 * in a Vercel env var into a dead search page.
 */
describe("getAuctionSource", () => {
  const original = process.env.SEARCH_SOURCE;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SEARCH_SOURCE;
    else process.env.SEARCH_SOURCE = original;
    warn.mockRestore();
  });

  it("defaults to apibara when the flag is unset", () => {
    delete process.env.SEARCH_SOURCE;
    expect(getAuctionSource().name).toBe("apibara");
  });

  it("returns apibara when asked for it, case- and whitespace-insensitively", () => {
    for (const value of ["apibara", "APIBARA", "  Apibara  "]) {
      process.env.SEARCH_SOURCE = value;
      expect(getAuctionSource().name).toBe("apibara");
    }
  });

  it("falls back to apibara for an unimplemented source instead of throwing", () => {
    // "postgres" is a real planned value, so this is the case that will actually
    // happen — someone sets the flag before the source exists.
    process.env.SEARCH_SOURCE = "postgres";
    expect(() => getAuctionSource()).not.toThrow();
    expect(getAuctionSource().name).toBe("apibara");
  });

  it("falls back to apibara for a typo rather than taking search down", () => {
    process.env.SEARCH_SOURCE = "postgrse";
    expect(getAuctionSource().name).toBe("apibara");
  });

  it("warns about an unimplemented source, but only once per value", () => {
    process.env.SEARCH_SOURCE = "postgres";
    getAuctionSource();
    getAuctionSource();
    getAuctionSource();
    // A page render resolves the source many times; one warning per process is
    // a signal, one per call is noise that buries everything else in the log.
    const forPostgres = warn.mock.calls.filter((c) => String(c[0]).includes("postgres"));
    expect(forPostgres).toHaveLength(1);
  });

  it("empty and whitespace-only values are treated as unset, not as errors", () => {
    for (const value of ["", "   "]) {
      process.env.SEARCH_SOURCE = value;
      expect(getAuctionSource().name).toBe("apibara");
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
