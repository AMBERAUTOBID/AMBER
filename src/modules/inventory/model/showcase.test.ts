import { describe, expect, it } from "vitest";
import {
  SHOWCASE_QUERIES,
  SHOWCASE_LIMIT,
  SHOWCASE_WINDOW_DAYS,
  SHOWCASE_WINDOW_FROM_HOURS,
  pickShowcase,
  showcaseWindow,
} from "./showcase";
import type { VehicleListItem } from "../api/types";

const NOW = new Date("2026-08-18T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();

function lot(over: Partial<VehicleListItem> & { lot_number: string }): VehicleListItem {
  return {
    platform: "copart",
    vin: "VIN" + over.lot_number,
    title: "car",
    year: 2020,
    make: "Porsche",
    model: "911",
    media: { thumbs: ["https://example.test/a.jpg"] },
    auction: { full_date: hours(24) },
    ...over,
  } as VehicleListItem;
}

describe("the curated list stays affordable", () => {
  /**
   * ⚠️ THIS TEST IS A BUDGET, NOT A STYLE RULE. Each query is one API call per
   * page regeneration, and the plan allows **30,000 a month**. The home page
   * revalidates every six hours — 120 regenerations a month — so the bill is
   * queries × 120:
   *
   *     14 queries (today)        1,680/month     6%
   *     20 queries                2,400/month     8%
   *     24 queries (the cap)      2,880/month    10%
   *
   * It has already earned its keep once: a second rail took the count from 12
   * to 20 and this test failed, which is how the sum got recomputed rather than
   * assumed. **Raise the cap only with a new line in the table above.**
   */
  it("does not grow past what the Apibara plan can pay for", () => {
    expect(SHOWCASE_QUERIES.length).toBeLessThanOrEqual(24);
  });

  it("names a make on every entry", () => {
    for (const q of SHOWCASE_QUERIES) expect(q.make.trim().length).toBeGreaterThan(0);
  });

  it("has no duplicate queries", () => {
    const keys = SHOWCASE_QUERIES.map((q) => `${q.make}|${q.model ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has enough queries to fill the rail one car per marque", () => {
    // The rail spreads one lot per query per round, so a limit far above the
    // query count would visibly repeat marques before it filled.
    expect(SHOWCASE_QUERIES.length * 2).toBeGreaterThanOrEqual(SHOWCASE_LIMIT);
  });
});

describe("picking what goes on the rail", () => {
  it("drops a lot with no photograph — a card with no image is a hole in the row", () => {
    expect(pickShowcase([[lot({ lot_number: "1", media: {} })]], { now: NOW })).toHaveLength(0);
  });

  it("drops a sale that has already run", () => {
    const out = pickShowcase([[lot({ lot_number: "1", auction: { full_date: hours(-2) } })]], {
      now: NOW,
    });
    expect(out).toHaveLength(0);
  });

  it("keeps a lot whose sale date is unknown rather than guessing it is over", () => {
    expect(pickShowcase([[lot({ lot_number: "1", auction: {} })]], { now: NOW })).toHaveLength(1);
  });

  it("counts one car once, however many queries returned it", () => {
    const a = lot({ lot_number: "77" });
    expect(pickShowcase([[a], [a]], { now: NOW })).toHaveLength(1);
  });

  it("treats the same lot number on the other platform as a different car", () => {
    const out = pickShowcase(
      [[lot({ lot_number: "77" }), lot({ lot_number: "77", platform: "iaai" })]],
      { now: NOW }
    );
    expect(out).toHaveLength(2);
  });

  /**
   * The ranking rule that matters commercially: a priced car beats an unpriced
   * one even when the unpriced one sells sooner. Measured on the live API, a
   * whole Porsche page came back with no current bid while Ferrari and Bentley
   * pages were fully priced — without this, the rail would have led with cards
   * each reading "—".
   */
  it("puts a priced lot ahead of an unpriced one that sells sooner", () => {
    const unpriced = lot({ lot_number: "soon", auction: { full_date: hours(14) } });
    const priced = lot({
      lot_number: "later",
      auction: { full_date: hours(48) },
      pricing: { current_bid_usd: 9000 },
    });
    expect(pickShowcase([[unpriced, priced]], { now: NOW }).map((v) => v.lot_number)).toEqual([
      "later",
      "soon",
    ]);
  });

  it("orders equally-priced lots by soonest sale", () => {
    const late = lot({
      lot_number: "late",
      auction: { full_date: hours(70) },
      pricing: { buy_now_usd: 5000 },
    });
    const early = lot({
      lot_number: "early",
      auction: { full_date: hours(14) },
      pricing: { buy_now_usd: 5000 },
    });
    expect(pickShowcase([[late, early]], { now: NOW }).map((v) => v.lot_number)).toEqual([
      "early",
      "late",
    ]);
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 40 }, (_, i) => lot({ lot_number: String(i) }));
    expect(pickShowcase([many], { now: NOW, limit: 14 })).toHaveLength(14);
  });

  it("survives a query that returned nothing", () => {
    expect(pickShowcase([[], [lot({ lot_number: "1" })], []], { now: NOW })).toHaveLength(1);
  });
});

describe("spread — a row of one marque is a narrower promise than the catalogue keeps", () => {
  const page = (make: string, n: number) =>
    Array.from({ length: n }, (_, i) =>
      lot({ lot_number: `${make}${i}`, make, pricing: { current_bid_usd: 5000 } })
    );

  it("takes one from each query before taking a second from any", () => {
    const out = pickShowcase([page("BMW", 8), page("Audi", 8), page("Volvo", 8)], {
      now: NOW,
      limit: 6,
      spread: true,
    });
    expect(out.map((v) => v.make)).toEqual(["BMW", "Audi", "Volvo", "BMW", "Audi", "Volvo"]);
  });

  it("falls back to whatever is left when a query runs dry", () => {
    const out = pickShowcase([page("BMW", 1), page("Audi", 5)], {
      now: NOW,
      limit: 4,
      spread: true,
    });
    expect(out.map((v) => v.make)).toEqual(["BMW", "Audi", "Audi", "Audi"]);
  });

  it("still refuses photoless and already-sold lots when spreading", () => {
    const out = pickShowcase([[lot({ lot_number: "a", make: "BMW", media: {} })], page("Audi", 1)], {
      now: NOW,
      limit: 4,
      spread: true,
    });
    expect(out.map((v) => v.make)).toEqual(["Audi"]);
  });
});

describe("the date window", () => {
  /**
   * ⚠️ THE START IS AHEAD OF NOW, AND THAT IS THE POINT. The page is cached for
   * six hours; a lot selling this afternoon has already gone by the time
   * somebody reads it, the countdown hides itself, and the card looks broken.
   * Twelve hours out leaves six on the soonest card even at the end of the
   * cache window.
   */
  it("starts ahead of now, not at it", () => {
    expect(SHOWCASE_WINDOW_FROM_HOURS).toBeGreaterThanOrEqual(12);
    const { from } = showcaseWindow(new Date("2026-08-18T20:00:00Z"));
    // Twelve hours past 20:00 is the following morning.
    expect(from).toBe("2026-08-19");
  });

  it("ends a week out", () => {
    const { to } = showcaseWindow(NOW);
    expect(to).toBe("2026-08-25");
    expect(SHOWCASE_WINDOW_DAYS).toBe(7);
  });

  it("never starts after it ends", () => {
    const { from, to } = showcaseWindow(NOW);
    expect(from <= to).toBe(true);
  });
});
