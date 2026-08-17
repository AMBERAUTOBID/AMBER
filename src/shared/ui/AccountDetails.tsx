import type { WireAccount } from "@/shared/config/wire";

export interface AccountDetailLabels {
  beneficiary: string;
  beneficiaryAddress: string;
  bank: string;
  bankAddress: string;
  account: string;
  swift: string;
  routing: string;
}

/**
 * A set of bank details, as a client copies them into a transfer form.
 *
 * Shared between the order invoice and the deposit panel rather than written
 * twice. They are the same act — a client copying an account number out of our
 * page into their bank's — and two copies of this markup would eventually
 * disagree about which fields are shown or how they are labelled, on the one
 * screen where a difference means money going somewhere we cannot reach.
 *
 * `select-all` rather than a copy button: it needs no JavaScript, and one
 * click takes the whole value — which is what stops a half-copied account
 * number reaching a bank form.
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
  return (
    <dl className={`divide-y divide-char-100 border-t border-char-100 text-sm ${className}`}>
      <Field label={labels.beneficiary} value={account.beneficiary} />
      {account.beneficiaryAddress && (
        <Field label={labels.beneficiaryAddress} value={account.beneficiaryAddress} />
      )}
      <Field label={labels.bank} value={account.bankName} />
      {account.bankAddress && <Field label={labels.bankAddress} value={account.bankAddress} />}
      <Field label={labels.account} value={account.accountNumber} mono />
      <Field label={labels.swift} value={account.swift} mono />
      {account.routing && <Field label={labels.routing} value={account.routing} mono />}
    </dl>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="text-char-500">{label}</dt>
      <dd
        className={`select-all text-right font-medium text-char-900 ${mono ? "font-mono text-[0.9em]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
