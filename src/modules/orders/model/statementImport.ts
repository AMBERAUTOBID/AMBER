/**
 * Bank statement CSV → candidate payments, matched by our own references.
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────
 * Every wire that arrives today is reconciled by hand: open the bank, read
 * the reference, find the case file, retype six fields. The reference system
 * (`SAB-2026-0007`, `DEP-A845A0AE`, `CNT-2026-0001`, `INV-2026-0001`) was
 * designed so that a machine could do the finding — this module is that
 * machine. It reads the CSV a bank exports, keeps the incoming money, and
 * says which row belongs to which file.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
 * It never writes anything. Booking a payment stays the admin's deliberate
 * act through the same endpoints the case file uses, with the same guards —
 * this module only removes the retyping, not the judgment. And the statement
 * itself is parsed in memory and discarded: it carries other people's names
 * and balances, which have no business in our storage.
 *
 * ── FORMAT TOLERANCE ────────────────────────────────────────────────────
 * Wise and Bank of America both export CSV, with different headers and no
 * versioning promise. Columns are therefore found by name, fuzzily, rather
 * than by position — and a file whose headers cannot be recognised is
 * refused by name, never guessed at. Guessing which column is the amount is
 * how somebody's phone number becomes a payment.
 */

/** One statement line we consider bookable — money that came IN. */
export interface StatementCredit {
  /** Line number in the file, 1-based, for "which row was this again". */
  line: number;
  /** The value date as the bank wrote it, ISO yyyy-mm-dd when parseable. */
  date: string | null;
  amountCents: number;
  currency: string;
  /** The human-readable line — description + payer, for the admin's eyes. */
  description: string;
  /** Our references found anywhere in the row's text, deduplicated. */
  references: FoundReference[];
}

export type ReferenceKind = "order" | "deposit" | "container" | "invoice";

export interface FoundReference {
  kind: ReferenceKind;
  /** Normalised to the canonical shape, e.g. `SAB-2026-0007`. */
  reference: string;
}

export interface StatementParseResult {
  ok: true;
  credits: StatementCredit[];
  /** Outgoing/zero rows skipped — stated, so the count of lines adds up. */
  skippedDebits: number;
  /** Rows whose amount or shape could not be read; stated, never dropped silently. */
  skippedUnreadable: number;
  totalRows: number;
}

export interface StatementParseError {
  ok: false;
  error: "empty" | "no_header" | "no_amount_column" | "too_large";
}

/**
 * A generous ceiling. A monthly statement is hundreds of rows; thousands
 * means the wrong file, and parsing it to the end would only produce a
 * preview nobody can read.
 */
export const STATEMENT_MAX_ROWS = 2000;
export const STATEMENT_MAX_BYTES = 2_000_000;

/* ── CSV reading ────────────────────────────────────────────────────────── */

/**
 * RFC 4180 as banks actually write it: quoted fields with doubled quotes,
 * commas inside quotes, either line ending, optional BOM. A parser library
 * would do the same job; this is small enough to own and to test against
 * the two banks we actually receive files from.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A trailing newline leaves a phantom [""] row; drop fully empty rows.
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/* ── Column discovery ───────────────────────────────────────────────────── */

interface ColumnMap {
  date: number | null;
  amount: number;
  /** Separate credit column (some bank exports split credit/debit). */
  credit: number | null;
  currency: number | null;
  /** Every column worth scanning for references and showing to a human. */
  texts: number[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();

/** First header whose normalised name matches any candidate exactly. */
function findColumn(header: string[], names: string[]): number | null {
  for (const name of names) {
    const idx = header.findIndex((h) => norm(h) === name);
    if (idx >= 0) return idx;
  }
  return null;
}

/**
 * The header names seen on real exports: Wise's balance statement
 * ("Date", "Amount", "Currency", "Description", "Payment Reference",
 * "Payer Name") and Bank of America's activity export ("Date",
 * "Description", "Amount"). Names, not positions — both banks reorder
 * columns between formats, and Wise has several statement variants.
 */
function mapColumns(header: string[]): ColumnMap | null {
  const amount = findColumn(header, ["amount", "amount value", "value"]);
  const credit = findColumn(header, ["credit", "credit amount", "deposits"]);
  if (amount === null && credit === null) return null;

  const date = findColumn(header, [
    "date",
    "value date",
    "created on",
    "finished on",
    "posting date",
    "transaction date",
  ]);
  const currency = findColumn(header, ["currency", "source currency"]);

  const textNames = [
    "description",
    "payment reference",
    "reference",
    "details",
    "payer name",
    "payee name",
    "merchant",
    "note",
    "transaction details",
  ];
  const texts: number[] = [];
  header.forEach((h, i) => {
    if (textNames.includes(norm(h))) texts.push(i);
  });

  return { date, amount: amount ?? credit!, credit, currency, texts };
}

/* ── Amounts ────────────────────────────────────────────────────────────── */

/**
 * Reads a bank-written amount into cents, or null when it is not a number.
 *
 * Two decimal conventions exist in the files we receive: `1,234.56` and
 * `1.234,56`. When both separators appear, the LAST one is the decimal
 * point — true in either convention. A single separator followed by
 * exactly two digits is a decimal point; followed by three, a thousands
 * separator. `1,5` is read as one-and-a-half, because no bank writes
 * one-thousand-five-hundred that way.
 */
export function parseAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[\s$€£]/g, "").replace(/[A-Za-z]+$/, "");
  if (cleaned === "" || /[^0-9.,-]/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const digits = negative ? cleaned.slice(1) : cleaned;
  if (digits === "" || digits.startsWith("-")) return null;

  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  let intPart: string;
  let fracPart: string;

  if (lastComma === -1 && lastDot === -1) {
    intPart = digits;
    fracPart = "";
  } else {
    const sep = Math.max(lastComma, lastDot);
    const after = digits.slice(sep + 1);
    const isDecimal = after.length <= 2 || (lastComma !== -1 && lastDot !== -1);
    if (isDecimal && after.length <= 2) {
      intPart = digits.slice(0, sep);
      fracPart = after;
    } else {
      intPart = digits;
      fracPart = "";
    }
  }

  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (intPart === "" && fracPart === "") return null;

  const cents = Number(intPart || "0") * 100 + Number((fracPart || "0").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/**
 * ISO date out of the shapes we can read WITHOUT guessing, or null.
 *
 * `yyyy-mm-dd` is unambiguous. `dd-mm-yyyy` with dashes is Wise's CSV
 * shape and is read as day-first. Slash dates (`03/04/2026`) are refused
 * outright — US banks write month-first, Europeans day-first, and a wrong
 * guess back-dates a payment by weeks. A null date is shown as the raw
 * text and typed by the admin, which is slower and correct.
 */
export function parseStatementDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/* ── Our references ─────────────────────────────────────────────────────── */

/**
 * Finds every reference of ours in a line of bank text.
 *
 * Tolerant of what banks do to references — uppercased, hyphens dropped,
 * spaces inserted — but anchored on word boundaries so that a lot number or
 * a phone number cannot half-match. Normalised back to the canonical shape
 * so downstream lookups hit the database exactly.
 */
export function findReferences(text: string): FoundReference[] {
  const found: FoundReference[] = [];
  const seen = new Set<string>();
  const push = (kind: ReferenceKind, reference: string) => {
    const key = `${kind}:${reference}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ kind, reference });
    }
  };

  const numbered: Array<[ReferenceKind, string]> = [
    ["order", "SAB"],
    ["container", "CNT"],
    ["invoice", "INV"],
  ];
  for (const [kind, prefix] of numbered) {
    const re = new RegExp(`\\b${prefix}[-\\s]?(\\d{4})[-\\s]?(\\d{4,5})\\b`, "gi");
    for (const m of text.matchAll(re)) {
      push(kind, `${prefix}-${m[1]}-${m[2]}`);
    }
  }

  const dep = /\bDEP[-\s]?([0-9A-Fa-f]{8})\b/g;
  for (const m of text.matchAll(dep)) {
    push("deposit", `DEP-${m[1].toUpperCase()}`);
  }

  return found;
}

/* ── The whole file ─────────────────────────────────────────────────────── */

export function parseStatement(text: string): StatementParseResult | StatementParseError {
  if (text.length > STATEMENT_MAX_BYTES) return { ok: false, error: "too_large" };

  const rows = parseCsv(text);
  if (rows.length === 0) return { ok: false, error: "empty" };
  if (rows.length === 1) return { ok: false, error: "no_header" };

  const columns = mapColumns(rows[0]);
  if (!columns) return { ok: false, error: "no_amount_column" };

  const credits: StatementCredit[] = [];
  let skippedDebits = 0;
  let skippedUnreadable = 0;

  const body = rows.slice(1, 1 + STATEMENT_MAX_ROWS);
  for (let i = 0; i < body.length; i++) {
    const row = body[i];
    const rawAmount = row[columns.amount] ?? "";
    // When the file splits credit/debit into two columns and we read the
    // credit one, an empty cell means "this row was a debit", not "broken".
    if (columns.credit !== null && columns.amount === columns.credit && rawAmount.trim() === "") {
      skippedDebits++;
      continue;
    }
    const amountCents = parseAmountCents(rawAmount);
    if (amountCents === null) {
      skippedUnreadable++;
      continue;
    }
    // Outgoing money and zero rows are not ours to book. When the file has a
    // dedicated credit column, a value there IS the direction.
    if (amountCents <= 0) {
      skippedDebits++;
      continue;
    }

    const textBlob = columns.texts.map((idx) => row[idx] ?? "").join(" · ");
    const description =
      columns.texts
        .map((idx) => (row[idx] ?? "").trim())
        .filter(Boolean)
        .join(" · ") || "—";

    credits.push({
      line: i + 2, // 1-based, plus the header row
      date: columns.date !== null ? parseStatementDate(row[columns.date] ?? "") : null,
      amountCents,
      currency: (row[columns.currency ?? -1] ?? "USD").trim().toUpperCase() || "USD",
      description: description.slice(0, 300),
      references: findReferences(textBlob),
    });
  }

  return {
    ok: true,
    credits,
    skippedDebits,
    skippedUnreadable,
    totalRows: rows.length - 1,
  };
}
