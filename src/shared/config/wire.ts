/**
 * The bank details a client wires money to.
 *
 * ── WHY THIS IS ENVIRONMENT, NOT A CONSTANT ─────────────────────────────
 * Not because an account number is a secret — it is printed on every invoice
 * a business sends — but because it *changes*, and it changes at the worst
 * possible moment. The plan on record is to add a European account later, and
 * possibly a Lithuanian company after that. Each of those is a config change
 * here rather than a code edit, a review and a deploy.
 *
 * Read on the server only: the order page is a server component, so these
 * never enter a client bundle. There is no `NEXT_PUBLIC_` twin and there
 * should not be one — the details belong on the page of somebody who owns an
 * order, not in the JavaScript of every visitor.
 *
 * ── NULL IS LOAD-BEARING ────────────────────────────────────────────────
 * Exactly the rule `SITE.social` already follows. An unset variable means the
 * panel says "ask us for the details" instead of rendering an empty IBAN under
 * a confident heading. **A half-filled set of wire instructions is worse than
 * none**: a client who copies a blank reference sends money nobody can match,
 * and a client who copies a wrong account sends it somewhere we cannot reach.
 * So the panel is all-or-nothing, and `wireAccount()` is the gate.
 */
export interface WireAccount {
  /** The legal name the payment must be addressed to. */
  beneficiary: string;
  /** The beneficiary's registered address — most banks require it. */
  beneficiaryAddress: string | null;
  bankName: string;
  bankAddress: string | null;
  accountNumber: string;
  /** SWIFT/BIC — what an international sender needs. */
  swift: string;
  /** ABA routing number — what a US domestic sender needs. */
  routing: string | null;
  /** ISO code of the currency the account is held in. */
  currency: string;
}

function trimmed(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * The account, or null when it has not been configured.
 *
 * The four required fields are the ones without which a transfer cannot be
 * made at all. Address and routing are genuinely optional — a European sender
 * never uses an ABA number — so their absence hides a row rather than the
 * whole panel.
 */
export function wireAccount(): WireAccount | null {
  const beneficiary = trimmed("WIRE_BENEFICIARY");
  const bankName = trimmed("WIRE_BANK_NAME");
  const accountNumber = trimmed("WIRE_ACCOUNT_NUMBER");
  const swift = trimmed("WIRE_SWIFT");

  if (!beneficiary || !bankName || !accountNumber || !swift) return null;

  return {
    beneficiary,
    beneficiaryAddress: trimmed("WIRE_BENEFICIARY_ADDRESS"),
    bankName,
    bankAddress: trimmed("WIRE_BANK_ADDRESS"),
    accountNumber,
    swift,
    routing: trimmed("WIRE_ROUTING"),
    currency: trimmed("WIRE_CURRENCY") ?? "USD",
  };
}
