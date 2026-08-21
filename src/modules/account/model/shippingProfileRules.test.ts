import { describe, expect, it } from "vitest";
import {
  SHIPPING_PORTS,
  emptyShippingProfile,
  isShippingProfileComplete,
  normalizeShippingProfile,
  shippingProfileErrors,
  type ShippingProfileInput,
} from "./shippingProfileRules";

/** A submission that should pass everything — each test breaks one thing. */
function good(overrides: Partial<ShippingProfileInput> = {}): ShippingProfileInput {
  return {
    buyerType: "person",
    buyerName: "Tomas Jankauskas",
    companyCode: "",
    vatCode: "",
    buyerCountry: "Lietuva",
    buyerPhone: "+370 612 34567",
    buyerAddress: "Vilniaus g. 1\n01102 Vilnius",
    destinationPort: "Klaipėda, Lithuania",
    receiverSame: true,
    receiverName: "",
    receiverPhone: "",
    receiverEmail: "",
    receiverAddress: "",
    receiverCountry: "",
    insurance: true,
    shareContainer: true,
    paymentRail: "wise",
    ...overrides,
  };
}

describe("normalizeShippingProfile", () => {
  it("accepts the ordinary case whole", () => {
    const v = normalizeShippingProfile(good());
    expect(v.buyerName).toBe("Tomas Jankauskas");
    expect(v.destinationPort).toBe("Klaipėda, Lithuania");
    expect(v.paymentRail).toBe("wise");
    expect(isShippingProfileComplete(v)).toBe(true);
  });

  it("folds an invented buyerType to person rather than throwing", () => {
    // This runs on a request body; a hand-crafted enum is a shrug, not a 500.
    const v = normalizeShippingProfile(good({ buyerType: "admin" }));
    expect(v.buyerType).toBe("person");
  });

  it("refuses a port the calculator does not price", () => {
    const v = normalizeShippingProfile(good({ destinationPort: "Hamburg, Germany" }));
    expect(v.destinationPort).toBeNull();
    expect(shippingProfileErrors(v)).toContain("destinationPort");
  });

  it("NULLS receiver fields when the receiver is the buyer", () => {
    // Hidden stale values must not ride along and reappear the day the
    // switch is toggled — the cleanup lives here, not in the UI.
    const v = normalizeShippingProfile(
      good({ receiverSame: true, receiverName: "Brolis", receiverPhone: "+370 5 555" })
    );
    expect(v.receiverName).toBeNull();
    expect(v.receiverPhone).toBeNull();
  });

  it("drops company identifiers for a private person", () => {
    const v = normalizeShippingProfile(good({ companyCode: "304123456", vatCode: "LT100001" }));
    expect(v.companyCode).toBeNull();
    expect(v.vatCode).toBeNull();
  });

  it("trims whitespace and treats blank as absent", () => {
    const v = normalizeShippingProfile(good({ buyerName: "   " }));
    expect(v.buyerName).toBeNull();
    expect(shippingProfileErrors(v)).toContain("buyerName");
  });

  it("caps a runaway value instead of storing a novel", () => {
    const v = normalizeShippingProfile(good({ buyerAddress: "x".repeat(2000) }));
    expect(v.buyerAddress).toHaveLength(500);
  });
});

describe("shippingProfileErrors", () => {
  it("requires a company code only from a company", () => {
    const person = normalizeShippingProfile(good());
    expect(shippingProfileErrors(person)).not.toContain("companyCode");

    const company = normalizeShippingProfile(
      good({ buyerType: "company", buyerName: "UAB Pavyzdys" })
    );
    expect(shippingProfileErrors(company)).toContain("companyCode");
  });

  it("requires the receiver block only when the receiver is somebody else", () => {
    const v = normalizeShippingProfile(good({ receiverSame: false }));
    const errors = shippingProfileErrors(v);
    expect(errors).toContain("receiverName");
    expect(errors).toContain("receiverPhone");
    expect(errors).toContain("receiverAddress");
    expect(errors).toContain("receiverCountry");
    // Email deliberately optional: a phone reaches a terminal worker.
    expect(errors).not.toContain("receiverEmail" as never);
  });

  it("treats the unchosen payment rail as incomplete, not as a default", () => {
    // The whole point of asking here is that the invoice moment is 23:40
    // after a win. Defaulting the rail would silently unask the question.
    const v = normalizeShippingProfile(good({ paymentRail: "" }));
    expect(shippingProfileErrors(v)).toContain("paymentRail");
    expect(isShippingProfileComplete(v)).toBe(false);
  });

  it("an empty profile is incomplete but structurally valid", () => {
    const v = emptyShippingProfile();
    expect(isShippingProfileComplete(v)).toBe(false);
    expect(v.insurance).toBe(true);
    expect(v.shareContainer).toBe(true);
  });
});

describe("SHIPPING_PORTS", () => {
  it("is the calculator's own list, not a copy", () => {
    // Three today. The assertion is on membership, not count, so adding a
    // port to the calculator does not fail this file — the two lists cannot
    // drift because they are one list.
    expect(SHIPPING_PORTS).toContain("Klaipėda, Lithuania");
    expect(SHIPPING_PORTS).toContain("Rotterdam, Netherlands");
    expect(SHIPPING_PORTS).toContain("Poti, Georgia");
  });
});
