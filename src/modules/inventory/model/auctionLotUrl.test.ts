import { describe, expect, it } from "vitest";
import { auctionDisplayName, auctionLotUrl } from "./auctionLotUrl";

describe("auctionLotUrl", () => {
  it("uses the two formats a working competitor actually links to", () => {
    // Read off bidauto.online's own lot pages rather than invented: Copart has
    // a real deep link, IAAI does not and goes through search.
    expect(auctionLotUrl("copart", "57504506")).toBe("https://www.copart.com/lot/57504506");
    expect(auctionLotUrl("iaai", "45401521")).toBe("https://www.iaai.com/Search?Keyword=45401521");
  });

  it("accepts the platform however it is cased", () => {
    expect(auctionLotUrl("COPART", "1")).toContain("copart.com");
    expect(auctionLotUrl(" IAAI ", "1")).toContain("iaai.com");
  });

  it("returns null for an unknown platform rather than guessing", () => {
    // The wrong auction's search page would look authoritative and show the
    // wrong car — worse than no link.
    expect(auctionLotUrl("emirates", "1")).toBeNull();
    expect(auctionLotUrl(null, "1")).toBeNull();
    expect(auctionLotUrl("", "1")).toBeNull();
  });

  it("returns null without a lot number", () => {
    expect(auctionLotUrl("copart", null)).toBeNull();
    expect(auctionLotUrl("copart", "")).toBeNull();
    expect(auctionLotUrl("copart", "   ")).toBeNull();
  });

  it("refuses a lot number that is not a plain identifier", () => {
    // The value goes straight into the path or query, so anything carrying a
    // slash or a query character is data we do not understand. Encoding it
    // would send a client somewhere unintended with our page's blessing.
    expect(auctionLotUrl("copart", "123/../admin")).toBeNull();
    expect(auctionLotUrl("copart", "123?x=1")).toBeNull();
    expect(auctionLotUrl("iaai", "123&y=2")).toBeNull();
    expect(auctionLotUrl("copart", "12 34")).toBeNull();
  });

  it("allows the hyphen some lot numbers carry", () => {
    expect(auctionLotUrl("copart", "45-293346")).toBe("https://www.copart.com/lot/45-293346");
  });
});

describe("auctionDisplayName", () => {
  it("names the destination the way the auction spells it", () => {
    expect(auctionDisplayName("copart")).toBe("Copart");
    expect(auctionDisplayName("iaai")).toBe("IAAI");
    expect(auctionDisplayName("something")).toBeNull();
  });
});
