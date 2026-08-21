import { describe, expect, it } from "vitest";
import {
  bidFeeCents,
  buyerFeeCents,
  estimateAuctionFees,
  fixedAuctionFees,
} from "./auctionBuyerFees";

describe("buyerFeeCents", () => {
  it("prices the published worked example: $5,400 hammer", () => {
    // IAA page: Standard $775, High Volume $650 at $5,000–5,499.99... no —
    // $5,400 sits in $5,000–5,499.99? It does not: 5,400 ∈ [5,000, 5,499.99].
    expect(buyerFeeCents("iaai", "standard", 540_000)).toBe(77_500);
    expect(buyerFeeCents("iaai", "highVolume", 540_000)).toBe(65_000);
    expect(buyerFeeCents("copart", "highVolume", 540_000)).toBe(65_000);
  });

  it("honours bracket edges exactly — $99.99 vs $100.00", () => {
    expect(buyerFeeCents("iaai", "highVolume", 9_999)).toBe(100);
    expect(buyerFeeCents("iaai", "highVolume", 10_000)).toBe(2_500);
    expect(buyerFeeCents("iaai", "standard", 4_999)).toBe(2_500);
    expect(buyerFeeCents("iaai", "standard", 5_000)).toBe(4_500);
  });

  it("switches to a percentage above $15,000", () => {
    // $30,000: 7.5% = $2,250 standard, 6.0% = $1,800 high volume — the spread
    // that makes the tier question worth $450 on one car.
    expect(buyerFeeCents("iaai", "standard", 3_000_000)).toBe(225_000);
    expect(buyerFeeCents("iaai", "highVolume", 3_000_000)).toBe(180_000);
    expect(buyerFeeCents("copart", "highVolume", 3_000_000)).toBe(180_000);
  });

  it("prices Copart by TITLE, not by volume tier", () => {
    // Copart's published split is clean vs non-clean; the tier steers IAA
    // only. The receipt for lot 62288396 charged $625 at a $5,400 hammer —
    // exactly the clean column, which is what unmasked this axis at all.
    expect(buyerFeeCents("copart", "standard", 540_000, true)).toBe(62_500);
    expect(buyerFeeCents("copart", "highVolume", 540_000, true)).toBe(62_500);
    expect(buyerFeeCents("copart", "standard", 540_000, false)).toBe(65_000);
  });

  it("walks the clean-title plateaus and the 5.75% top", () => {
    // $4,500–5,999.99 all $625; $6,000–7,499.99 all $675; $10k–15k all $720.
    expect(buyerFeeCents("copart", "highVolume", 450_000, true)).toBe(62_500);
    expect(buyerFeeCents("copart", "highVolume", 599_999, true)).toBe(62_500);
    expect(buyerFeeCents("copart", "highVolume", 720_000, true)).toBe(67_500);
    expect(buyerFeeCents("copart", "highVolume", 1_400_000, true)).toBe(72_000);
    // $30,000 clean: 5.75% = $1,725 — $75 kinder than non-clean's 6%.
    expect(buyerFeeCents("copart", "highVolume", 3_000_000, true)).toBe(172_500);
  });

  it("keeps the $450–599.99 steps where the screenshots put them", () => {
    // The rows a transcription slip actually got wrong on the first pass:
    // $450–499.99 stays $110 (not $125), $500–549.99 is $125, $550 is $130.
    expect(buyerFeeCents("copart", "highVolume", 46_000, true)).toBe(11_000);
    expect(buyerFeeCents("copart", "highVolume", 52_000, true)).toBe(12_500);
    expect(buyerFeeCents("copart", "highVolume", 56_000, true)).toBe(13_000);
  });

  it("treats the last flat brackets correctly at the seam", () => {
    // $14,999.99 is the last flat row; $15,000.00 is percentage.
    expect(buyerFeeCents("iaai", "highVolume", 1_499_999)).toBe(89_000);
    expect(buyerFeeCents("iaai", "highVolume", 1_500_000)).toBe(90_000); // 6% of 15,000
    expect(buyerFeeCents("iaai", "standard", 1_499_999)).toBe(100_000);
    expect(buyerFeeCents("iaai", "standard", 1_500_000)).toBe(112_500); // 7.5%
  });
});

describe("bidFeeCents", () => {
  it("is free under $100 and tops out above $8,000", () => {
    expect(bidFeeCents("live", 9_999)).toBe(0);
    expect(bidFeeCents("live", 800_000)).toBe(16_000);
    expect(bidFeeCents("prebid", 800_000)).toBe(14_000);
  });

  it("prices the $5,400 example: $125 live, $110 pre-bid", () => {
    // Both pages: $4,000-5,999.99 is its own bracket above $2,000-3,999.99.
    // First written expecting $110/$100 - the row BELOW - and the module was
    // right while the test was wrong. The receipt's $99 sits under both.
    expect(bidFeeCents("live", 540_000)).toBe(12_500);
    expect(bidFeeCents("prebid", 540_000)).toBe(11_000);
  });
});

describe("estimateAuctionFees", () => {
  it("reproduces the published Copart total for the Mercedes", () => {
    // Published schedule at $5,400, live bid: 650 + 125 + 95 + 15 + 20 = $905.
    // The REAL receipt was $823 — Aivi pay below list, which is why this
    // estimate is a quote ceiling, never a cost line.
    const estimate = estimateAuctionFees({
      house: "copart",
      tier: "highVolume",
      mode: "live",
      salePriceCents: 540_000,
    });
    expect(estimate.totalCents).toBe(90_500);
  });

  it("reproduces the IAA worked example from the fee reference", () => {
    // $5,400 live: 650 + 125 + the IAA fixed set 105 + 15 + 20 = $915.
    const estimate = estimateAuctionFees({
      house: "iaai",
      tier: "highVolume",
      mode: "live",
      salePriceCents: 540_000,
    });
    expect(estimate.totalCents).toBe(65_000 + 12_500 + 10_500 + 1_500 + 2_000);
  });

  it("prices a clean-title Copart car from its own column", () => {
    const estimate = estimateAuctionFees({
      house: "copart",
      tier: "highVolume",
      mode: "live",
      salePriceCents: 540_000,
      cleanTitle: true,
    });
    // 625 + 125 + 95 + 15 + 20 — $25 kinder than the salvage quote.
    expect(estimate.totalCents).toBe(88_000);
  });

  it("keeps the two houses' fixed fees distinct", () => {
    const copart = fixedAuctionFees("copart").map((f) => f.key);
    const iaai = fixedAuctionFees("iaai").map((f) => f.key);
    expect(copart).toContain("gate");
    expect(copart).not.toContain("service");
    expect(iaai).toContain("service");
    expect(iaai).not.toContain("gate");
  });
});
