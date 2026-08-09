import { describe, expect, it } from "vitest";
import { bumpReference, formatReference, nextReference, parseReference } from "./reference";

describe("formatReference", () => {
  it("produces the shape a client can read down a phone", () => {
    expect(formatReference(2026, 7)).toBe("SAB-2026-0007");
    expect(formatReference(2026, 1234)).toBe("SAB-2026-1234");
  });

  it("widens past four digits rather than wrapping", () => {
    // A collision would be far worse than an unusually long reference.
    expect(formatReference(2026, 10000)).toBe("SAB-2026-10000");
  });
});

describe("parseReference", () => {
  it("reads back what it formatted", () => {
    expect(parseReference("SAB-2026-0007")).toEqual({ year: 2026, sequence: 7 });
  });

  it("tolerates the whitespace and casing a paste brings with it", () => {
    // Copied out of WhatsApp, this is the normal case, not the edge case.
    expect(parseReference("  sab-2026-0007  ")).toEqual({ year: 2026, sequence: 7 });
  });

  it("rejects anything that isn't one of ours", () => {
    for (const bad of [
      "",
      "SAB-2026",
      "SAB-26-0007",
      "XYZ-2026-0007",
      "SAB-2026-",
      "SAB-2026-abc",
      "2026-0007",
      "SAB-2026-0007-1",
    ]) {
      expect(parseReference(bad), bad).toBeNull();
    }
  });

  it("rejects a zero sequence, which was never issued", () => {
    expect(parseReference("SAB-2026-0000")).toBeNull();
  });

  it("handles null and undefined without throwing", () => {
    expect(parseReference(null)).toBeNull();
    expect(parseReference(undefined)).toBeNull();
  });
});

describe("nextReference", () => {
  it("starts a year at 0001", () => {
    expect(nextReference(null, 2026)).toBe("SAB-2026-0001");
  });

  it("continues within the year", () => {
    expect(nextReference("SAB-2026-0007", 2026)).toBe("SAB-2026-0008");
  });

  it("RESTARTS in January rather than continuing last year's count", () => {
    // The year in the reference is only useful if the sequence resets under
    // it; otherwise it is decoration on an ever-growing counter.
    expect(nextReference("SAB-2026-0431", 2027)).toBe("SAB-2027-0001");
  });

  it("ignores a reference from a later year, which says nothing about this one", () => {
    expect(nextReference("SAB-2027-0005", 2026)).toBe("SAB-2026-0001");
  });

  it("treats an unparseable latest as 'nothing yet' instead of throwing", () => {
    // This runs while an admin is creating an order. A malformed row from some
    // future import must not be able to block that; the unique index is what
    // actually guarantees no two files share a number.
    expect(nextReference("garbage", 2026)).toBe("SAB-2026-0001");
    expect(nextReference("", 2026)).toBe("SAB-2026-0001");
  });

  it("carries into five digits without losing the year", () => {
    expect(nextReference("SAB-2026-9999", 2026)).toBe("SAB-2026-10000");
  });
});

describe("bumpReference", () => {
  it("is what a unique-constraint collision retries with", () => {
    // Two admins in the same second read the same latest and compute the same
    // next; one loses on the index. That is a retry, not an error.
    expect(bumpReference("SAB-2026-0008")).toBe("SAB-2026-0009");
  });

  it("keeps moving even if handed something it cannot read", () => {
    // Unreachable in practice — it only ever receives a string we just built —
    // but a retry loop that deadlocks would be worse than a wrong-looking
    // number the unique index will reject anyway.
    expect(bumpReference("nonsense")).toMatch(/^SAB-\d{4}-0001$/);
  });

  it("converges: repeated bumps keep producing distinct references", () => {
    const seen = new Set<string>();
    let ref = "SAB-2026-0001";
    for (let i = 0; i < 50; i++) {
      expect(seen.has(ref)).toBe(false);
      seen.add(ref);
      ref = bumpReference(ref);
    }
    expect(seen.size).toBe(50);
  });
});
