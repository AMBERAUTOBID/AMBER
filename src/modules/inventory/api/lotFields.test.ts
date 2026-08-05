import { describe, expect, it } from "vitest";
import { isUsaManufactured } from "./lotFields";
import type { VehicleListItem } from "./types";

/**
 * Origin decides whether the 2026 EU-US trade deal's 0% duty applies, so a
 * wrong answer here moves a real quote by thousands of euros. The VIN decoding
 * itself is tested in the pricing model, where isUsaBuiltVin lives; what
 * matters here is which source wins when both can answer.
 */
function lot(overrides: Partial<VehicleListItem> = {}): VehicleListItem {
  return {
    platform: "copart",
    lot_number: "60453786",
    // A real US-built VIN shape: WMI "1FT" = Ford, USA.
    vin: "1FTZR15V3XTA88607",
    title: "1999 Ford Ranger",
    year: 1999,
    make: "Ford",
    model: "Ranger",
    ...overrides,
  };
}

describe("isUsaManufactured", () => {
  it("prefers a country stated by the auction house over the VIN", () => {
    // The stated field is what customs paperwork has to match, so on the rare
    // lot where the two disagree it has to win.
    const statedJapan = lot({
      vin: "1FTZR15V3XTA88607",
      details: { vehicle_description: { ManufacturedIn: "Japan" } },
    } as Partial<VehicleListItem>);
    expect(isUsaManufactured(statedJapan)).toBe(false);

    const statedUsa = lot({
      vin: "JTJBC1BA5A2013390",
      details: { attributes: { CountryOfOrigin: "United States" } },
    } as Partial<VehicleListItem>);
    expect(isUsaManufactured(statedUsa)).toBe(true);
  });

  it("falls back to the VIN when the payload names no country", () => {
    // The Copart case: roughly half the inventory, previously always quoted
    // with the 10% duty because the country field is simply absent.
    expect(isUsaManufactured(lot({ vin: "1FTZR15V3XTA88607" }))).toBe(true);
    expect(isUsaManufactured(lot({ vin: "JTJBC1BA5A2013390" }))).toBe(false);
  });

  it("stays null when neither the payload nor the VIN can say", () => {
    expect(isUsaManufactured(lot({ vin: "" }))).toBeNull();
    expect(isUsaManufactured(lot({ vin: "NOTAVIN" }))).toBeNull();
  });
});
