import { describe, expect, it } from "vitest";
import {
  matchesOrder,
  parseCopartReceipt,
  receiptCostLines,
  reconciles,
} from "./copartReceipt";

/**
 * The real receipt's structure with the member's identity scrubbed — this
 * repository is public until launch, and a partner's member number and yard
 * address do not belong in it. Amounts, labels and field positions are the
 * genuine ones from lot 62288396.
 */
const RECEIPT = `
                              Sales Receipt/Bill of Sale                                   Date: 08/17/26 10:26 PM

MEMBER: 000000          PHYSICAL ADDRESS OF LOT:  SELLER:                                  000000000

EXAMPLE MEMBER LLC      1 EXAMPLE RD              FL - JACKSONVILLE NORTH
1 EXAMPLE DR            JACKSONVILLE FL 32218     SOLD THROUGH COPART
EXAMPLE, AR 71854                                 1 EXAMPLE RD
                                                  JACKSONVILLE, FL 32218

LOT#: 62288396                                                             Sale Yard: 163  Item#: 1/D
VEHICLE: 2015 MERCEDES-BENZ GL 450 4MATIC SILVER                           Phy Yard: 163   Keys: YES
VIN: 4JGDF6EE2FA451534                                                     Row: H040       Sale: 08/17/2026

                                                     Charges and Payments

Date        Charges           Amount                                       Description
08/17/2026  Sale Price        $5,400.00

08/17/2026  Internet Bid Fee  $99.00

08/17/2026  Gate Fee          $79.00

08/17/2026  Title Pickup Fee  $20.00

08/17/2026  Buyer Fee         $625.00

            Net Due (USD)     $6,223.00

MEMBER AGREES THAT THE VEHICLE HAS BEEN SOLD "AS IS WHERE IS" WITH NO WARRANTIES.
`;

describe("parseCopartReceipt", () => {
  const receipt = parseCopartReceipt(RECEIPT);

  it("reads the identity fields by label, not position", () => {
    expect(receipt.lotNumber).toBe("62288396");
    expect(receipt.vin).toBe("4JGDF6EE2FA451534");
    expect(receipt.saleDate?.toISOString().slice(0, 10)).toBe("2026-08-17");
  });

  it("separates the hammer from the fees", () => {
    expect(receipt.salePriceCents).toBe(540_000);
    expect(receipt.charges).toEqual([
      { label: "Internet Bid Fee", amountCents: 9_900 },
      { label: "Gate Fee", amountCents: 7_900 },
      { label: "Title Pickup Fee", amountCents: 2_000 },
      { label: "Buyer Fee", amountCents: 62_500 },
    ]);
  });

  it("keeps Net Due as a cross-check, never as a charge", () => {
    expect(receipt.netDueCents).toBe(622_300);
    expect(receipt.charges.some((c) => /net due/i.test(c.label))).toBe(false);
    expect(reconciles(receipt)).toBe(true);
  });

  it("degrades to nulls on a reformatted document, never to wrong numbers", () => {
    const parsed = parseCopartReceipt("completely unrelated text");
    expect(parsed.lotNumber).toBeNull();
    expect(parsed.salePriceCents).toBeNull();
    expect(parsed.charges).toEqual([]);
    expect(reconciles(parsed)).toBe(false);
  });

  it("fails reconciliation when a line went missing", () => {
    const withoutGate = parseCopartReceipt(RECEIPT.replace(/^.*Gate Fee.*$\n/m, ""));
    expect(reconciles(withoutGate)).toBe(false);
  });
});

describe("matchesOrder", () => {
  const receipt = parseCopartReceipt(RECEIPT);

  it("accepts the right car", () => {
    expect(
      matchesOrder(receipt, { lotNumber: "62288396", vin: "4JGDF6EE2FA451534" })
    ).toBeNull();
  });

  it("refuses the wrong lot — the 03:00 mistake this exists for", () => {
    expect(matchesOrder(receipt, { lotNumber: "45683178", vin: null })).toBe("lot");
  });

  it("refuses a VIN disagreement even when the lot matches", () => {
    expect(
      matchesOrder(receipt, { lotNumber: "62288396", vin: "WBA3A5G50FNS88572" })
    ).toBe("vin");
  });

  it("tolerates a missing VIN on either side", () => {
    expect(matchesOrder(receipt, { lotNumber: "62288396", vin: null })).toBeNull();
  });

  it("treats an unreadable receipt as a refusal, not a match", () => {
    const blank = parseCopartReceipt("nothing here");
    expect(matchesOrder(blank, { lotNumber: "62288396", vin: null })).toBe("unreadable");
  });
});

describe("receiptCostLines", () => {
  it("maps hammer to auction_price and every fee to a labelled auction_fees", () => {
    const lines = receiptCostLines(parseCopartReceipt(RECEIPT));
    expect(lines[0]).toEqual({ kind: "auction_price", label: null, amountCents: 540_000 });
    expect(lines).toHaveLength(5);
    expect(lines.slice(1).every((l) => l.kind === "auction_fees" && l.label)).toBe(true);
    // The whole point: these five sum to Copart's own Net Due.
    expect(lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(622_300);
  });
});
