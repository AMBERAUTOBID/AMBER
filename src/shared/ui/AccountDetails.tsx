"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react/dist/ssr";
import type { WireAccount } from "@/shared/config/wire";

export interface AccountDetailLabels {
  beneficiary: string;
  beneficiaryAddress: string;
  bank: string;
  bankAddress: string;
  account: string;
  swift: string;
  routing: string;
  /** The sender-side toggle: "Sending from Europe" / "from the USA". */
  senderEu: string;
  senderUs: string;
  /** Accessible label for the per-field copy button. */
  copy: string;
}

/**
 * A set of bank details, as a client copies them into a transfer form.
 *
 * Shared between the order invoice and the deposit panel rather than written
 * twice. They are the same act — a client copying an account number out of
 * our page into their bank's — and two copies of this markup would
 * eventually disagree about which fields are shown, on the one screen where
 * a difference means money going somewhere we cannot reach.
 *
 * ── THE SENDER TOGGLE ───────────────────────────────────────────────────
 * An ABA routing number means nothing to a European bank form — it is one
 * more numeric field to mistake for the account number at midnight. So the
 * panel adapts to the SENDER's side, defaulting to Europe because that is
 * where the clients are: the EU view leads with SWIFT and hides routing,
 * the US view shows it. The toggle only renders when the account carries a
 * routing number at all.
 *
 * ── COPY BUTTON *AND* SELECT-ALL ────────────────────────────────────────
 * The button writes the exact value to the clipboard and confirms with a
 * tick, because "did the copy take?" is not a question to leave open over
 * an account number. `select-all` stays underneath: clipboard permission
 * can be denied, and the fallback must not require noticing a failure.
 */
export default function AccountDetails({
  account,
  labels,
  className = "",
}: {
  account: WireAccount;
  labels: AccountDetailLabels;
  className?: string;
}) {
  const [sender, setSender] = useState<"eu" | "us">("eu");
  const showToggle = account.routing !== null;
  const showRouting = account.routing !== null && sender === "us";

  const segOn = "rounded-md bg-char-800 px-3 py-1.5 text-white";
  const segOff = "rounded-md px-3 py-1.5 text-char-500 hover:text-char-800";

  return (
    <div className={className}>
      {showToggle ? (
        <div className="mb-3 inline-flex rounded-lg border border-char-200 p-0.5 text-xs font-semibold">
          <button type="button" onClick={() => setSender("eu")} className={sender === "eu" ? segOn : segOff}>
            {labels.senderEu}
          </button>
          <button type="button" onClick={() => setSender("us")} className={sender === "us" ? segOn : segOff}>
            {labels.senderUs}
          </button>
        </div>
      ) : null}

      <dl className="divide-y divide-char-100 border-t border-char-100 text-sm">
        <Field label={labels.beneficiary} value={account.beneficiary} copyLabel={labels.copy} />
        {account.beneficiaryAddress && (
          <Field
            label={labels.beneficiaryAddress}
            value={account.beneficiaryAddress}
            copyLabel={labels.copy}
          />
        )}
        <Field label={labels.bank} value={account.bankName} copyLabel={labels.copy} />
        {account.bankAddress && (
          <Field label={labels.bankAddress} value={account.bankAddress} copyLabel={labels.copy} />
        )}
        <Field label={labels.account} value={account.accountNumber} mono copyLabel={labels.copy} />
        {/* SWIFT is what an international sender needs — never hidden. */}
        <Field label={labels.swift} value={account.swift} mono copyLabel={labels.copy} />
        {showRouting && account.routing ? (
          <Field label={labels.routing} value={account.routing} mono copyLabel={labels.copy} />
        ) : null}
      </dl>
    </div>
  );
}

function Field({
  label,
  value,
  copyLabel,
  mono = false,
}: {
  label: string;
  value: string;
  copyLabel: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied — select-all below stays the path, silently.
    }
  }

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="text-char-500">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span
          className={`select-all text-right font-medium text-char-900 ${mono ? "font-mono text-[0.9em]" : ""}`}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={`${copyLabel}: ${label}`}
          title={copyLabel}
          className="relative top-0.5 shrink-0 rounded p-1 text-char-400 transition-colors hover:bg-char-100 hover:text-char-800"
        >
          {copied ? (
            <Check size={14} weight="bold" className="text-emerald-600" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      </dd>
    </div>
  );
}
