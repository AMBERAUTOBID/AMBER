import { Warning, CurrencyDollar } from "@phosphor-icons/react/dist/ssr";
import { CONTACT_HREF, SITE } from "@/shared/config/site";
import { wiseAccount } from "@/shared/config/wire";
import AccountDetails, { type AccountDetailLabels } from "@/shared/ui/AccountDetails";

/**
 * How a client actually sends their deposit.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────
 * A client picked a plan, saw "$1,500 deposit", and was then told we would be
 * in touch by email. So the first money anyone sends us could not be sent
 * without a conversation — on a page whose whole purpose is that the client
 * can get on with it. The order invoice had already been given instructions;
 * the deposit, which comes first, had none.
 *
 * ── WHY THE DOLLARS WARNING IS A BOX AND NOT A FOOTNOTE ─────────────────
 * A deposit has to match its tier exactly. Somebody in Vilnius sending euros
 * to a dollar account has them converted by their own bank at their own rate,
 * $1,500 arrives as $1,498.63, and an admin is left deciding whether to
 * activate a plan on a short payment — a decision nobody should have to make
 * about a round number. The charge instruction sits next to it for the same
 * reason: under the default `SHA`, intermediaries shave the transfer and
 * produce exactly the same mismatch from the other direction.
 *
 * ⚠️ Renders **nothing at all** when no Wise account is configured, exactly as
 * the order panel does: half a set of bank details is worse than none.
 * `WISE_*` are unset until the owner supplies them.
 */
export default function DepositInstructions({
  amountLabel,
  reference,
  labels,
}: {
  /** The figure already shown above, repeated so the panel is self-contained. */
  amountLabel: string;
  /** `DEP-A845A0AE` — see `depositReference`. */
  reference: string;
  labels: AccountDetailLabels & {
    title: string;
    dollarsTitle: string;
    dollarsBody: string;
    chargesTitle: string;
    chargesBody: string;
    referenceLabel: string;
    referenceHint: string;
    noDetails: string;
  };
}) {
  const account = wiseAccount();

  return (
    <div className="mt-5 rounded-2xl border border-char-200 bg-white p-5">
      <h3 className="text-sm font-bold uppercase tracking-wider text-char-400">{labels.title}</h3>

      <p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-char-900">
        {amountLabel}
      </p>

      {/* The two ways a round deposit stops being round, side by side, because
          a client who reads one and misses the other still sends the wrong
          amount. */}
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3">
        <CurrencyDollar size={17} weight="bold" className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-char-900">{labels.dollarsTitle}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-char-700">{labels.dollarsBody}</p>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-char-100 px-4 py-3">
        <Warning size={17} weight="fill" className="mt-0.5 shrink-0 text-char-500" />
        <div>
          <p className="text-sm font-semibold text-char-900">{labels.chargesTitle}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-char-600">{labels.chargesBody}</p>
        </div>
      </div>

      {/* Its own block, as on the invoice: a deposit arriving unlabelled is
          worse than an unlabelled invoice, because several clients pay the
          same round figure on the same tier. */}
      <div className="mt-4 rounded-xl border border-char-200 bg-char-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-char-500">
          {labels.referenceLabel}
        </p>
        <p className="mt-1 select-all font-mono text-xl font-bold tracking-tight text-char-900">
          {reference}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-char-600">{labels.referenceHint}</p>
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
    </div>
  );
}
