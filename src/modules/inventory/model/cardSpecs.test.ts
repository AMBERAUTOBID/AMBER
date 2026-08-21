import { describe, expect, it } from "vitest";
import { engineDisplay, titleCaseSpec } from "./cardSpecs";

describe("titleCaseSpec", () => {
  it("calms Copart's shouting", () => {
    expect(titleCaseSpec("GAS")).toBe("Gas");
    expect(titleCaseSpec("AUTOMATIC")).toBe("Automatic");
    expect(titleCaseSpec("WHITE")).toBe("White");
  });

  it("leaves IAAI's mixed case effectively unchanged", () => {
    expect(titleCaseSpec("Gasoline")).toBe("Gasoline");
    expect(titleCaseSpec("Automatic")).toBe("Automatic");
  });

  it("handles multi-word values", () => {
    expect(titleCaseSpec("FLEXIBLE FUEL")).toBe("Flexible Fuel");
  });
});

describe("engineDisplay", () => {
  it("takes the displacement from both dialects", () => {
    // Copart's terse form and IAAI's full spec sheet, measured 2026-08-21.
    expect(engineDisplay("1.8L 4")).toBe("1.8L");
    expect(engineDisplay("3.7L V-6 DOHC, VVT, 303HP")).toBe("3.7L");
    expect(engineDisplay("2.3L I-4 DI, DOHC, VVT, turbo, 300HP")).toBe("2.3L");
  });

  it("returns null rather than a 40-character chip", () => {
    expect(engineDisplay("ELECTRIC MOTOR")).toBeNull();
    expect(engineDisplay("")).toBeNull();
  });

  it("does not mistake a trailing word starting with L for litres", () => {
    expect(engineDisplay("8 CYL LONG BLOCK")).toBeNull();
  });
});
