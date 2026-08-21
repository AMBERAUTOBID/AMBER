import { describe, expect, it } from "vitest";
import {
  formatInvoiceNumber,
  invoiceNumberAfterCollision,
  nextInvoiceNumber,
  parseInvoiceNumber,
} from "./invoiceNumber";

describe("invoice numbers", () => {
  it("formats zero-padded to four digits and widens past 9999", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("INV-2026-0001");
    expect(formatInvoiceNumber(2026, 10000)).toBe("INV-2026-10000");
  });

  it("parses its own output, tolerating case and whitespace", () => {
    expect(parseInvoiceNumber(" inv-2026-0042 ")).toEqual({ year: 2026, sequence: 42 });
    expect(parseInvoiceNumber("SAB-2026-0042")).toBeNull();
    expect(parseInvoiceNumber("INV-2026-0000")).toBeNull();
    expect(parseInvoiceNumber(null)).toBeNull();
  });

  it("continues this year's sequence and restarts on a new year", () => {
    expect(nextInvoiceNumber("INV-2026-0007", 2026)).toBe("INV-2026-0008");
    expect(nextInvoiceNumber("INV-2026-0007", 2027)).toBe("INV-2027-0001");
    expect(nextInvoiceNumber(null, 2026)).toBe("INV-2026-0001");
    // A malformed latest must not block issuing — same rule as case refs.
    expect(nextInvoiceNumber("garbage", 2026)).toBe("INV-2026-0001");
  });

  it("retries past the number that lost the race", () => {
    expect(invoiceNumberAfterCollision("INV-2026-0008", 2026)).toBe("INV-2026-0009");
  });
});

describe("container references share the discipline", () => {
  // Imported here rather than a new file: the two reference formats are the
  // same contract, and a drift between them should fail in one place.
  it("CNT numbering continues and restarts like INV", async () => {
    const { nextContainerReference } = await import("./containers");
    expect(nextContainerReference("CNT-2026-0002", 2026)).toBe("CNT-2026-0003");
    expect(nextContainerReference("CNT-2026-0002", 2027)).toBe("CNT-2027-0001");
    expect(nextContainerReference(null, 2026)).toBe("CNT-2026-0001");
    expect(nextContainerReference("garbage", 2026)).toBe("CNT-2026-0001");
  });
});
