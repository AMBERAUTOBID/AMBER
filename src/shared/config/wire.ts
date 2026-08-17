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
 * An account read from a prefixed set of variables, or null.
 *
 * The four required fields are the ones without which a transfer cannot be
 * made at all. Address and routing are genuinely optional — a European sender
 * never uses an ABA number — so their absence hides a row rather than the
 * whole panel.
 */
function readAccount(prefix: string): WireAccount | null {
  const beneficiary = trimmed(`${prefix}_BENEFICIARY`);
  const bankName = trimmed(`${prefix}_BANK_NAME`);
  const accountNumber = trimmed(`${prefix}_ACCOUNT_NUMBER`);
  const swift = trimmed(`${prefix}_SWIFT`);

  if (!beneficiary || !bankName || !accountNumber || !swift) return null;

  return {
    beneficiary,
    beneficiaryAddress: trimmed(`${prefix}_BENEFICIARY_ADDRESS`),
    bankName,
    bankAddress: trimmed(`${prefix}_BANK_ADDRESS`),
    accountNumber,
    swift,
    routing: trimmed(`${prefix}_ROUTING`),
    currency: trimmed(`${prefix}_CURRENCY`) ?? "USD",
  };
}

/**
 * Where the invoice for a car is paid: a SWIFT transfer to Bank of America.
 * `WIRE_*`.
 */
export function wireAccount(): WireAccount | null {
  return readAccount("WIRE");
}

/**
 * Where a deposit is paid: `WISE_*`.
 *
 * ── WHY A SECOND ACCOUNT AND NOT JUST THE FIRST ─────────────────────────
 * Confirmed by the owner 2026-08-17: deposits come through Wise, while the
 * much larger stage-two invoice goes by SWIFT to the bank. They are different
 * accounts because they are different kinds of money — one is a refundable
 * holding we may have to send straight back, the other is a payment we forward
 * to an auction within hours.
 *
 * **Both are held in USD, and that is a rule rather than a coincidence.** A
 * deposit has to equal its plan's figure exactly, and a client sending euros
 * into a dollar account has them converted at somebody else's rate: $1,500
 * becomes $1,498.63, matches no tier, and an admin is left deciding whether to
 * activate a plan on a short payment. The instructions say *send dollars* for
 * that reason alone.
 *
 * Same shape as the wire account, deliberately. A Wise USD account IS a US
 * account — holder name, account number, routing, SWIFT, and a partner bank's
 * name and address — so inventing a second vocabulary for it would only make
 * the two panels drift apart.
 */
export function wiseAccount(): WireAccount | null {
  return readAccount("WISE");
}
