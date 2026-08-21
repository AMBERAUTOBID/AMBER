/**
 * The invoice's own numbered series — `INV-2026-0001`.
 *
 * Deliberately NOT the case reference. `SAB-2026-0007` names a car's whole
 * file; one file can produce several documents (the main invoice, a
 * correction, a late storage charge), and an accountant wants the DOCUMENTS
 * numbered gaplessly, not the cars. The two look similar on purpose — both
 * read naturally down a phone — and differ in prefix so nobody ever pays
 * against the wrong one.
 *
 * Pure, and the same contract as `reference.ts`, which this mirrors: the
 * database supplies the latest number and enforces uniqueness; this file
 * decides only what the string looks like and what to try next.
 */

const PREFIX = "INV";
const PAD = 4;

export interface ParsedInvoiceNumber {
  year: number;
  sequence: number;
}

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `${PREFIX}-${year}-${String(sequence).padStart(PAD, "0")}`;
}

export function parseInvoiceNumber(input: string | null | undefined): ParsedInvoiceNumber | null {
  if (!input) return null;
  const match = input.trim().toUpperCase().match(/^INV-(\d{4})-(\d+)$/);
  if (!match) return null;
  const year = Number(match[1]);
  const sequence = Number(match[2]);
  if (sequence < 1) return null;
  return { year, sequence };
}

/** Numbering restarts each January, same as the case reference and for the
 * same reason: the year in the number dates the document at a glance. */
export function nextInvoiceNumber(latest: string | null | undefined, year: number): string {
  const parsed = parseInvoiceNumber(latest);
  const sequence = parsed && parsed.year === year ? parsed.sequence + 1 : 1;
  return formatInvoiceNumber(year, sequence);
}

/** After a unique-index collision: derived from the number that FAILED, not
 * from a re-read — a stale read can lose the same race twice. */
export function invoiceNumberAfterCollision(failed: string, year: number): string {
  return nextInvoiceNumber(failed, year);
}
