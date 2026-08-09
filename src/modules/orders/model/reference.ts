/**
 * The human-quotable reference on a case file — `SAB-2026-0007`.
 *
 * It exists because a client writes "what's happening with SAB-2026-0007" in
 * WhatsApp, and nobody has ever read a uuid down a phone. The uuid stays the
 * primary key; this is the name people use.
 *
 * Pure. The database supplies the previous reference and enforces uniqueness;
 * everything about the shape of the string is decided and tested here.
 */

const PREFIX = "SAB";

/**
 * Zero-padded to four digits, which reads as an ordinary invoice number and
 * sorts correctly as text. Sequences past 9999 simply get wider rather than
 * wrapping — a business that good deserves a fifth digit, not a collision.
 */
const PAD = 4;

export interface ParsedReference {
  year: number;
  sequence: number;
}

export function formatReference(year: number, sequence: number): string {
  return `${PREFIX}-${year}-${String(sequence).padStart(PAD, "0")}`;
}

/**
 * Reads a reference back, or null if the string isn't one.
 *
 * Case-insensitive and tolerant of surrounding whitespace, because this is
 * also how a pasted reference gets looked up — someone copying out of WhatsApp
 * brings a trailing space more often than not, and "not found" would be a lie.
 */
export function parseReference(input: string | null | undefined): ParsedReference | null {
  if (!input) return null;
  const match = input.trim().toUpperCase().match(/^SAB-(\d{4})-(\d+)$/);
  if (!match) return null;

  const year = Number(match[1]);
  const sequence = Number(match[2]);
  // A four-digit year is guaranteed by the pattern; a zero sequence is not,
  // and `SAB-2026-0000` was never issued by us.
  if (sequence < 1) return null;
  return { year, sequence };
}

/**
 * The next reference for a year, given the highest one already issued in it.
 *
 * **Numbering restarts every January.** That is the point of putting the year
 * in: `SAB-2027-0001` says at a glance how old a file is, where a single
 * ever-growing counter says only how many cars came before it.
 *
 * `latest` is whatever the database holds for this year, or null for the first
 * file of a year. Anything unparseable is treated as "nothing yet" rather than
 * throwing: this runs while an admin is creating an order, and a malformed row
 * from some future import must not be able to block that. The unique index on
 * `reference` is what actually guarantees no two files share a number — this
 * function only has to make a sensible first attempt.
 */
export function nextReference(latest: string | null | undefined, year: number): string {
  const parsed = parseReference(latest);
  // A reference from a different year says nothing about this year's sequence.
  const sequence = parsed && parsed.year === year ? parsed.sequence + 1 : 1;
  return formatReference(year, sequence);
}

/**
 * The reference to try after a unique-constraint collision.
 *
 * Two admins creating an order in the same second both read the same "latest"
 * and both compute the same next number; one of them loses on the unique
 * index. That is not an error worth showing anyone — it is a retry, and this
 * is what it retries with.
 *
 * Deliberately derived from the reference that FAILED rather than by re-reading
 * the database: re-reading can return the same stale answer twice under
 * concurrency, and this cannot.
 */
export function bumpReference(failed: string): string {
  const parsed = parseReference(failed);
  if (!parsed) {
    // Should be unreachable — this only ever receives a string we just built.
    // Falling back to the first of the current year keeps a retry loop moving
    // rather than deadlocking on an unparseable value.
    return formatReference(new Date().getUTCFullYear(), 1);
  }
  return formatReference(parsed.year, parsed.sequence + 1);
}
