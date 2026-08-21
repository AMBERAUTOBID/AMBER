import { describe, expect, it } from "vitest";
import {
  findReferences,
  parseAmountCents,
  parseCsv,
  parseStatement,
  parseStatementDate,
} from "./statementImport";

describe("csv reading", () => {
  it("reads quoted fields with commas and doubled quotes", () => {
    const rows = parseCsv('a,"b, with comma","she said ""hi"""\n1,2,3');
    expect(rows).toEqual([
      ["a", "b, with comma", 'she said "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("survives a BOM, CRLF endings and a trailing newline", () => {
    const rows = parseCsv("﻿Date,Amount\r\n2026-08-01,10.00\r\n");
    expect(rows).toEqual([
      ["Date", "Amount"],
      ["2026-08-01", "10.00"],
    ]);
  });

  it("keeps newlines inside quoted fields as field content", () => {
    const rows = parseCsv('a,"line one\nline two"\nb,c');
    expect(rows).toEqual([["a", "line one\nline two"], ["b", "c"]]);
  });
});

describe("amounts", () => {
  it("reads both decimal conventions", () => {
    expect(parseAmountCents("1,234.56")).toBe(123_456);
    expect(parseAmountCents("1.234,56")).toBe(123_456);
  });

  it("treats a lone separator with three digits after it as thousands", () => {
    expect(parseAmountCents("1,500")).toBe(150_000);
    expect(parseAmountCents("1.500")).toBe(150_000);
  });

  it("treats a lone separator with one or two digits after it as decimal", () => {
    expect(parseAmountCents("1,5")).toBe(150);
    expect(parseAmountCents("1234.5")).toBe(123_450);
  });

  it("keeps the sign — debits must stay debits", () => {
    expect(parseAmountCents("-71.25")).toBe(-7_125);
  });

  it("tolerates currency symbols and trailing codes, refuses non-numbers", () => {
    expect(parseAmountCents("$ 3,200.00")).toBe(320_000);
    expect(parseAmountCents("15800.00 USD")).toBe(1_580_000);
    expect(parseAmountCents("N/A")).toBeNull();
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents("12-34")).toBeNull();
  });
});

describe("dates", () => {
  it("reads ISO and Wise's day-first dash shape", () => {
    expect(parseStatementDate("2026-08-19")).toBe("2026-08-19");
    expect(parseStatementDate("19-08-2026")).toBe("2026-08-19");
  });

  it("refuses slash dates rather than guessing day versus month", () => {
    expect(parseStatementDate("03/04/2026")).toBeNull();
  });
});

describe("finding our references", () => {
  it("finds every kind in one line and normalises the shape", () => {
    const refs = findReferences(
      "WIRE REF sab 2026 0007 / DEP-a845a0ae / CNT-2026-0001 also INV20260002"
    );
    expect(refs).toEqual([
      { kind: "order", reference: "SAB-2026-0007" },
      { kind: "container", reference: "CNT-2026-0001" },
      { kind: "invoice", reference: "INV-2026-0002" },
      { kind: "deposit", reference: "DEP-A845A0AE" },
    ]);
  });

  it("does not half-match a longer token", () => {
    // A lot number or an IBAN fragment must not become a reference.
    expect(findReferences("LOT 62288396 SAB2026000712345")).toEqual([]);
    expect(findReferences("DEPOSIT FOR CAR")).toEqual([]);
  });

  it("deduplicates a reference the bank wrote twice", () => {
    const refs = findReferences("SAB-2026-0007 payment SAB 2026 0007");
    expect(refs).toHaveLength(1);
  });
});

describe("the whole statement", () => {
  const WISE_CSV = [
    '"Date","Amount","Currency","Description","Payment Reference","Payer Name"',
    '"19-08-2026","15800.00","USD","Incoming wire","SAB-2026-0007","PETRAS PETRELIS"',
    '"18-08-2026","-42.10","USD","Card payment","","WISE"',
    '"17-08-2026","1500.00","USD","Incoming transfer","DEP-A845A0AE","JONAS JONAITIS"',
    '"16-08-2026","250.00","USD","Incoming transfer","no reference here","UAB KAŽKAS"',
  ].join("\n");

  it("keeps credits, skips debits, and says how many it skipped", () => {
    const result = parseStatement(WISE_CSV);
    if (!result.ok) throw new Error(result.error);
    expect(result.credits).toHaveLength(3);
    expect(result.skippedDebits).toBe(1);
    expect(result.skippedUnreadable).toBe(0);
    expect(result.totalRows).toBe(4);
  });

  it("attaches the matched reference and the line number", () => {
    const result = parseStatement(WISE_CSV);
    if (!result.ok) throw new Error(result.error);
    const wire = result.credits[0];
    expect(wire.line).toBe(2);
    expect(wire.date).toBe("2026-08-19");
    expect(wire.amountCents).toBe(1_580_000);
    expect(wire.references).toEqual([{ kind: "order", reference: "SAB-2026-0007" }]);
    expect(result.credits[2].references).toEqual([]);
  });

  it("refuses a file with no recognisable amount column, by name", () => {
    const result = parseStatement("Foo,Bar\n1,2");
    expect(result).toEqual({ ok: false, error: "no_amount_column" });
  });

  it("refuses an empty file and a header-only file", () => {
    expect(parseStatement("")).toEqual({ ok: false, error: "empty" });
    expect(parseStatement("Date,Amount")).toEqual({ ok: false, error: "no_header" });
  });

  it("reads a split credit/debit export and counts blank credits as debits", () => {
    const csv = [
      "Posting Date,Description,Credit,Debit",
      "2026-08-19,Wire in SAB-2026-0007,900.00,",
      "2026-08-18,Fee,,25.00",
    ].join("\n");
    const result = parseStatement(csv);
    if (!result.ok) throw new Error(result.error);
    expect(result.credits).toHaveLength(1);
    expect(result.credits[0].amountCents).toBe(90_000);
    expect(result.skippedDebits).toBe(1);
  });
});
