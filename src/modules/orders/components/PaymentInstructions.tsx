import { Bank, Clock, Lightning, Warning, CheckCircle, Info } from "@phosphor-icons/react/dist/ssr";
import LocalDateTime from "@/shared/time/LocalDateTime";
import { formatInstant } from "@/shared/time/formatInstant";
import { CONTACT_HREF, SITE } from "@/shared/config/site";
import { wireAccount } from "@/shared/config/wire";
import AccountDetails from "@/shared/ui/AccountDetails";
import DeclarePaymentButton from "./DeclarePaymentButton";
import { formatMoney } from "../model/money";
import type { PaymentStatus } from "../model/payment";
import type { OrderCurrency } from "../model/money";

/**
 * How the client actually pays — the one thing the order page could not do.
 *
 * The page already showed a balance. A balance without instructions is a bill
 * nailed to a door: the client knows what they owe and has no way to act on
 * it, so they message us instead, and an admin answers the same question by
 * hand every time.
 *
 * ── THE THREE THINGS THAT GO WRONG WITH A WIRE, AND WHAT EACH ONE COSTS ──
 *
 * 1. **The reference is missed**, and money arrives that nobody can match to
 *    an order. It is rendered on its own, large, with `select-all` so one
 *    click takes the whole string — no partial copy, no typing.
 * 2. **The charge option is left at SHA**, the default, and intermediary banks
 *    shave the transfer. This is why the OUR line is a warning box and not a
 *    footnote: it is the single instruction that decides whether the invoiced
 *    amount is the amount that arrives.
 * 3. **The deadline is misread.** It is shown as a real date and time in the
 *    reader's own zone, never as "within 24 hours" — a client who wins at
 *    23:40 and reads "24 hours" on a page loaded the next morning is working
 *    from a different deadline than we are.
 *
 * ⚠️ Renders nothing at all when no account is configured (see wire.ts): half
 * a set of bank details is worse than none.
 */
export default function PaymentInstructions({
  status,
  currency,
  reference,
  locale,
  orderId,
  labels,
}: {
  status: PaymentStatus;
  currency: OrderCurrency;
  /** The human reference — `SAB-2026-0007`. Also the payment reference. */
  reference: string;
  locale: string;
  labels: {
    title: string;
    amount: string;
    deadline: string;
    urgent: string;
    overdue: string;
    undated: string;
    expressTitle: string;
    expressBody: string;
    chargesTitle: string;
    chargesBody: string;
    referenceLabel: string;
    referenceHint: string;
    beneficiary: string;
    beneficiaryAddress: string;
    bank: string;
    bankAddress: string;
    account: string;
    swift: string;
    routing: string;
    noDetails: string;
    paidTitle: string;
    paidBody: string;
    forgiven: string;
    awaitingTitle: string;
    awaitingBody: string;
    declareAction: string;
    declareSending: string;
    declareDone: string;
    declareFailed: string;
  };
  /** Which order the "I've sent it" signal belongs to. */
  orderId: string;
}) {
  // Nothing has been priced yet. Says so plainly rather than showing a $0
  // invoice or, worse, congratulating the client on paying in full.
  //
  // `needs_rate` shares this panel deliberately: the costs are in and the
  // exchange rate is not, which is our unfinished work and reads to the client
  // as exactly the same sentence. The distinction between the two is real, but
  // it is an admin's problem — see `PaymentState`.
  if (status.state === "awaiting_costs" || status.state === "needs_rate") {
    return (
      <div className="rounded-2xl border border-char-200 bg-char-50/60 p-5">
        <p className="flex items-start gap-2.5 font-semibold text-char-900">
          <Info size={19} weight="fill" className="mt-0.5 shrink-0 text-char-400" />
          {labels.awaitingTitle}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-char-600">{labels.awaitingBody}</p>
      </div>
    );
  }

  if (status.state === "settled") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50/60 p-5">
        <p className="flex items-start gap-2.5 font-semibold text-char-900">
          <CheckCircle size={19} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
          {labels.paidTitle}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-char-700">
          {status.shortfallForgiven ? labels.forgiven : labels.paidBody}
        </p>
      </div>
    );
  }

  const account = wireAccount();
  const overdue = status.state === "overdue";
  const urgent = status.state === "urgent";

  return (
    <div
      className={`rounded-2xl border p-5 ${
        overdue ? "border-red-300 bg-red-50/60" : "border-char-200 bg-white"
      }`}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-char-400">
        <Bank size={16} weight="bold" />
        {labels.title}
      </h2>

      {/* The number and the moment, in that order — what and by when. */}
      <p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-char-900">
        {formatMoney(status.outstandingCents, currency, locale)}
      </p>

      {status.dueAt ? (
        <p
          className={`mt-1.5 flex items-center gap-1.5 text-sm font-semibold ${
            overdue ? "text-red-700" : urgent ? "text-amber-800" : "text-char-600"
          }`}
        >
          <Clock size={15} weight={overdue || urgent ? "fill" : "regular"} />
          <span>
            {overdue ? labels.overdue : urgent ? labels.urgent : labels.deadline}{" "}
            <LocalDateTime
              iso={status.dueAt.toISOString()}
              locale={locale}
              fallback={formatInstant(status.dueAt.toISOString(), locale, "UTC")}
            />
          </span>
        </p>
      ) : (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-char-500">
          <Info size={15} /> {labels.undated}
        </p>
      )}

      {/* WHY THE DEADLINE IS TIGHT, said where the deadline is read.

          Added 2026-08-17, when the owner confirmed we no longer float the
          auction price for a client we do not already know. Under the old
          design our own cash absorbed the days a transfer spends in the
          banking system; nothing absorbs them now. The chain is: the client's
          money reaches us, then we pay Copart or IAA, and the auction's clock
          has been running since the sale. An ordinary transfer takes one to
          three business days and simply cannot make it.

          The late fee is named here rather than left to appear on the invoice,
          because it is now the CLIENT's charge and not ours. Somebody who
          first learns of a fee and daily storage when they are billed for it
          will argue, and they would be right to. */}
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3">
        <Lightning size={17} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-char-900">{labels.expressTitle}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-char-700">{labels.expressBody}</p>
        </div>
      </div>

      {/* THE REFERENCE. Its own block because money without it cannot be
          matched to an order, and that is the failure that costs an admin an
          afternoon and the client their delivery date. */}
      <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
          {labels.referenceLabel}
        </p>
        <p className="mt-1 select-all font-mono text-xl font-bold tracking-tight text-char-900">
          {reference}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-char-600">{labels.referenceHint}</p>
      </div>

      {/* The one instruction that decides whether the invoiced amount is the
          amount that arrives. A footnote here would be read by nobody. */}
      <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-char-100 px-4 py-3">
        <Warning size={17} weight="fill" className="mt-0.5 shrink-0 text-char-500" />
        <div>
          <p className="text-sm font-semibold text-char-900">{labels.chargesTitle}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-char-600">{labels.chargesBody}</p>
        </div>
      </div>

      {account ? (
        <AccountDetails account={account} labels={labels} className="mt-4" />
      ) : (
        <p className="mt-4 border-t border-char-100 pt-4 text-sm leading-relaxed text-char-600">
          {labels.noDetails}{" "}
          <a href={CONTACT_HREF.tel} className="font-semibold text-amber-700 hover:underline">
            {SITE.phone.display}
          </a>
        </p>
      )}

      {/* Last, because it is the step AFTER the details above have been used.
          Offered even when no account is configured — a client who was sent
          the details another way still needs to be able to say they paid. */}
      <DeclarePaymentButton
        orderId={orderId}
        labels={{
          action: labels.declareAction,
          sending: labels.declareSending,
          done: labels.declareDone,
          failed: labels.declareFailed,
        }}
      />
    </div>
  );
}
