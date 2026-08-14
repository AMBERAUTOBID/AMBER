"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gavel, Phone, WarningCircle, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import { CONTACT_HREF, SITE } from "@/shared/config/site";
import { formatUsd, type PlanKey } from "@/modules/plans/model/plans";
import { bidDepositFor } from "../model/bidDeposit";
import type { BidWindowState } from "../model/bidWindow";

/**
 * "Bid for me" — the client authorises a maximum and we place it by hand.
 *
 * **The deposit is shown while they type, never after they commit.** The rule
 * is a pure function, so the page can run the same one the server will and
 * quote the figure as the amount changes. Telling somebody what a decision
 * costs only once they have made it is how a fee stops reading as a fee and
 * starts reading as a trick — and this is the first money we ask of a client
 * who has not bought anything yet.
 *
 * **The window decides what the button is**, not merely what it says: below
 * four hours it becomes a phone number, because a form cannot promise
 * something a sleeping person has to do. See bidWindow.
 */
export default function BidRequestButton({
  lotRef,
  windowState,
  signedIn,
  activePlanKey,
  feeUsdCents,
  suggestedBidUsdCents,
}: {
  /** VIN or lot number — the ONLY thing sent. The server describes the car. */
  lotRef: string;
  windowState: BidWindowState;
  signedIn: boolean;
  activePlanKey: PlanKey | null;
  /** The per-vehicle fee this client would owe on a win. Zero = none published. */
  feeUsdCents: number;
  /** Prefills the field with the current bid, so the number starts sensible. */
  suggestedBidUsdCents: number | null;
}) {
  const t = useTranslations("Bids.request");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(
    suggestedBidUsdCents ? String(Math.round(suggestedBidUsdCents / 100)) : ""
  );
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<"form" | "sending" | "done" | "error">("form");
  const [error, setError] = useState<string | null>(null);

  const dollars = Number(amount.replace(/[^0-9]/g, ""));
  const maxBidCents = Number.isFinite(dollars) ? dollars * 100 : 0;

  // A client already on a deposit tier posts nothing per car — their tier
  // deposit is the security, and charging twice would make the paid plans
  // worse value than the free one.
  const onDepositTier = activePlanKey !== null && activePlanKey !== "bronze";
  const deposit = onDepositTier ? { kind: "none" as const } : bidDepositFor(maxBidCents);

  async function submit() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/bids/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot: lotRef,
          maxBidUsdCents: maxBidCents,
          note: note.trim() || undefined,
          acceptedTerms: true,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setState("done");
        return;
      }
      setError(body.error ?? "failed");
      setState("error");
    } catch {
      setError("failed");
      setState("error");
    }
  }

  // Below the cutoff nothing is offered that a form cannot keep. A phone
  // number is not a refusal — somebody ringing now may still get the bid in.
  if (windowState === "closed") {
    return (
      <a
        href={CONTACT_HREF.tel}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-char-300 bg-white px-6 py-3.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
      >
        <Phone size={17} weight="bold" />
        {t("callInstead", { phone: SITE.phone.display })}
      </a>
    );
  }

  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={() => window.location.assign(locale === "en" ? "/register" : `/${locale}/register`)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
      >
        <Gavel size={17} weight="bold" />
        {t("signedOut")}
      </button>
    );
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
        >
          <Gavel size={17} weight="bold" />
          {t("open")}
        </button>
        {windowState === "urgent" && (
          <p className="mt-2 text-center text-xs font-semibold text-amber-800">{t("urgentHint")}</p>
        )}
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50/60 p-5">
        <p className="flex items-start gap-2.5 text-sm font-semibold leading-relaxed text-char-900">
          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
          {t("received")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-char-700">
          {deposit.kind === "per_car" && deposit.cents > 0
            ? t("receivedWithDeposit", { amount: formatUsd(deposit.cents) })
            : t("receivedNext")}
        </p>
        <Link
          href="/account/bids"
          className="mt-3 inline-flex text-sm font-semibold text-amber-700 underline-offset-4 hover:underline"
        >
          {t("seeStatus")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-char-200 bg-white p-5">
      <h3 className="font-[family-name:var(--font-heading)] text-lg font-extrabold tracking-tight text-char-900">
        {t("title")}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-char-600">{t("explainer")}</p>

      <label
        htmlFor="bid-max"
        className="mt-4 block text-xs font-semibold uppercase tracking-wider text-char-500"
      >
        {t("maxLabel")}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-lg font-bold text-char-500">$</span>
        <input
          id="bid-max"
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-44 rounded-xl border border-char-200 bg-char-50 px-4 py-2.5 text-lg font-bold tabular-nums text-char-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
        />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-char-500">{t("maxHint")}</p>

      {/* What this costs, updated as they type. Never after they commit. */}
      {maxBidCents > 0 && (
        <dl className="mt-4 space-y-1.5 rounded-xl bg-char-50 p-4 text-sm">
          {feeUsdCents > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-char-600">{t("feeOnWin")}</dt>
              <dd className="font-semibold text-char-900">{formatUsd(feeUsdCents)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-char-600">{t("depositLabel")}</dt>
            <dd className="font-semibold text-char-900">
              {deposit.kind === "per_car" ? formatUsd(deposit.cents) : t("depositNone")}
            </dd>
          </div>
          {deposit.kind === "per_car" && (
            // The single sentence that removes the incentive to understate the
            // maximum: a hold is not a cost. Without it, a client lowers their
            // bid to lower the deposit and then loses the auction.
            <p className="pt-1 text-xs leading-relaxed text-char-600">{t("depositExplainer")}</p>
          )}
          {deposit.kind === "needs_plan" && (
            <p className="pt-1 text-xs leading-relaxed text-char-700">
              {t("needsPlan", { amount: formatUsd(deposit.cents) })}{" "}
              <Link href="/plans" className="font-semibold text-amber-700 underline-offset-4 hover:underline">
                {t("seePlans")}
              </Link>
            </p>
          )}
          {deposit.kind === "beyond_tiers" && (
            <p className="pt-1 text-xs leading-relaxed text-char-700">{t("beyondTiers")}</p>
          )}
        </dl>
      )}

      <label
        htmlFor="bid-note"
        className="mt-4 block text-xs font-semibold uppercase tracking-wider text-char-500"
      >
        {t("noteLabel")}
      </label>
      <textarea
        id="bid-note"
        rows={2}
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("notePlaceholder")}
        className="mt-1.5 w-full rounded-xl border border-char-200 bg-char-50 px-4 py-2.5 text-sm text-char-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
      />

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-char-200 p-4 transition-colors has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50/50">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
        />
        <span className="text-sm leading-relaxed text-char-700">
          {maxBidCents > 0 ? t("agreeWithAmount", { amount: formatUsd(maxBidCents) }) : t("agree")}
        </span>
      </label>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!agreed || maxBidCents <= 0 || state === "sending"}
          className="rounded-full bg-amber-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "sending"
            ? t("sending")
            : maxBidCents > 0
              ? t("submitWithAmount", { amount: formatUsd(maxBidCents) })
              : t("submit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={state === "sending"}
          className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
        >
          {t("cancel")}
        </button>
      </div>

      {state === "error" && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800">
          <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-red-600" />
          {/* can()'s reasons are passed straight through so each one names the
              real next step rather than collapsing into "something failed". */}
          {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.failed")}
        </p>
      )}
    </div>
  );
}
