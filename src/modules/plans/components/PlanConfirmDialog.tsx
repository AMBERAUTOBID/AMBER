"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Check, CheckCircle, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { SITE, CONTACT_HREF } from "@/shared/config/site";
import { formatUsd, type Plan } from "../model/plans";
import { planCoreLines } from "../model/planFeatures";

/**
 * The commitment step between choosing a plan and requesting it.
 *
 * Picking a plan is the moment a client takes on an obligation — a service
 * fee per vehicle, and for the paid tiers a deposit — so it gets an explicit
 * "I have read and agree" rather than happening on one click. The checkbox
 * gates the submit button, and the server records the acceptance timestamp
 * alongside the deposit row: an agreement you cannot evidence later is not
 * much of an agreement.
 *
 * Two states live here: the terms view, and the confirmation shown after the
 * request lands. They share a dialog so the client never loses their place.
 */
export default function PlanConfirmDialog({
  plan,
  dueCents,
  topUp,
  onClose,
}: {
  plan: Plan;
  /**
   * What this client will actually be asked to transfer — the tier's deposit
   * for a first request, the **difference** for someone moving up.
   *
   * Separate from `plan.depositUsdCents` because this dialog is the terms a
   * client agrees to, and the terms have to name the sum that will land on
   * their bank instruction. It is computed on the server by the same function
   * that writes the deposit row, so the two cannot disagree.
   */
  dueCents: number;
  topUp: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Plans");
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<
    "terms" | "sending" | "received" | "already" | "error" | "stale"
  >("terms");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and the background stops scrolling underneath the dialog —
  // both things a native <dialog> would give us, but it can't be styled
  // consistently across the browsers this audience uses.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function submit() {
    setState("sending");
    try {
      const res = await fetch("/api/plans/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: plan.key, acceptedTerms: true }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };
      if (res.ok && body.ok) setState(body.status === "already_pending" ? "already" : "received");
      // These two mean the page was rendered before something changed — a
      // refund was requested, or the tier was granted, in another tab or by an
      // admin. Telling them to reload is the true and actionable answer; the
      // generic failure message would send them to support instead.
      else if (body.error === "not_an_upgrade" || body.error === "refund_pending")
        setState("stale");
      else setState("error");
    } catch {
      setState("error");
    }
  }

  const planName = t(`tiers.${plan.key}.name`);
  // Core lines only; fees are rendered separately below with their own
  // emphasis, because the fee is the thing being agreed to. Sharing the
  // generator with PlanCard also restored the conditional-concurrency
  // wording this dialog used to drop.
  const features = planCoreLines(plan, t);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-char-900/60 p-4 backdrop-blur-sm sm:items-center sm:p-6"
      // Only a click that both starts and ends on the backdrop closes it, so
      // a drag that ends outside the panel doesn't dismiss a half-read page.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-dialog-title"
        className="relative w-full max-w-lg rounded-2xl border border-char-200/70 bg-white p-6 shadow-2xl sm:p-8"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("dialog.close")}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-char-500 transition-colors hover:bg-char-100 hover:text-char-800"
        >
          <X size={18} weight="bold" />
        </button>

        {state === "received" || state === "already" ? (
          <ReceivedPanel planName={planName} already={state === "already"} onClose={onClose} />
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              {t("dialog.eyebrow")}
            </p>
            <h2
              id="plan-dialog-title"
              className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900"
            >
              {planName}
            </h2>

            <span className="mt-3 inline-flex items-center rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800">
              {/* On an upgrade the badge names both figures: what completes
                  the tier's deposit, and what the deposit then is. Either
                  alone is a half-truth on the screen where they agree to it. */}
              {topUp
                ? t("dialog.topUpBadge", {
                    amount: formatUsd(dueCents),
                    total: formatUsd(plan.depositUsdCents),
                  })
                : dueCents === 0
                  ? t("noDeposit")
                  : t("dialog.depositBadge", { amount: formatUsd(dueCents) })}
            </span>

            <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-char-500">
              {t("dialog.featuresHeading")}
            </h3>
            <ul className="mt-3 space-y-2.5">
              {features.map((f) => (
                <li key={f} className="flex gap-2.5 text-sm leading-relaxed text-char-700">
                  <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-amber-600" />
                  <span>{f}</span>
                </li>
              ))}
              {plan.feesPerVehicleUsdCents.map((cents) => (
                <li key={cents} className="flex gap-2.5 text-sm font-semibold leading-relaxed text-amber-800">
                  <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-amber-600" />
                  <span>{t("features.fee", { amount: formatUsd(cents) })}</span>
                </li>
              ))}
            </ul>

            <h3 className="mt-6 border-t border-char-200/70 pt-5 text-xs font-semibold uppercase tracking-wider text-char-500">
              {t("dialog.termsHeading")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-char-600">
              {/* ⚠️ EVERY FIGURE IN THE TERMS COMES FROM THE PLAN TABLE, and
                  `maxBid` is here because it did not used to. The bidding
                  limits were typed straight into the translations — "$10,000"
                  in all three locales — while the card above derived its own
                  line from `plans.ts`. Raising Silver to $15,000 on 2026-08-17
                  would therefore have produced a card promising $15,000 above
                  a set of terms the client agrees to promising $10,000. A
                  price that is only ALMOST generated is worse than one written
                  out, because nobody re-reads the half that looks handled. */}
              {t(`tiers.${plan.key}.terms`, {
                fee: plan.feesPerVehicleUsdCents.length
                  ? formatUsd(plan.feesPerVehicleUsdCents[0])
                  : "",
                deposit: formatUsd(plan.depositUsdCents),
                maxBid: plan.maxBidUsd === null ? "" : formatUsd(plan.maxBidUsd * 100),
                depositFree:
                  plan.depositFreeUpToUsd === null
                    ? ""
                    : formatUsd(plan.depositFreeUpToUsd * 100),
              })}
            </p>

            <div className="mt-4 rounded-xl bg-char-50 p-4 text-sm leading-relaxed">
              <p className="font-semibold text-char-800">{t("dialog.signOff")}</p>
              <p className="mt-1 text-char-600">{SITE.name}</p>
              <p className="mt-1 text-char-600">
                <a href={CONTACT_HREF.tel} className="text-amber-700 hover:underline">
                  {SITE.phone.display}
                </a>
                {" · "}
                <a href={CONTACT_HREF.email} className="text-amber-700 hover:underline">
                  {SITE.email}
                </a>
              </p>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-char-200 p-4 transition-colors has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50/50">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
              />
              <span className="text-sm leading-relaxed text-char-700">
                {t("dialog.agree")}{" "}
                <Link href="/terms" className="font-medium text-amber-700 hover:underline">
                  {t("dialog.agreeLink")}
                </Link>
              </span>
            </label>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-char-200 bg-white px-6 py-3 text-sm font-semibold text-char-700 transition-colors hover:border-char-300"
              >
                {t("dialog.cancel")}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!agreed || state === "sending"}
                className="rounded-full bg-amber-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === "sending" ? t("dialog.submitting") : t("dialog.continue")}
              </button>
            </div>

            {(state === "error" || state === "stale") && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                <WarningCircle size={16} weight="fill" className="shrink-0 text-red-600" />
                {state === "stale" ? t("requestStale") : t("requestError")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReceivedPanel({
  planName,
  already,
  onClose,
}: {
  planName: string;
  already: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Plans.dialog.received");
  return (
    <div className="py-2">
      <div className="flex items-start gap-4">
        <CheckCircle size={40} weight="fill" className="shrink-0 text-green-600" />
        <div className="min-w-0">
          <h2
            id="plan-dialog-title"
            className="font-[family-name:var(--font-heading)] text-2xl font-extrabold tracking-tight text-char-900"
          >
            {already ? t("alreadyTitle") : t("title")}
          </h2>
          <p className="mt-1 text-sm text-char-600">{t("subtitle", { plan: planName })}</p>
        </div>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-char-700">
        {already ? t("alreadyBody") : t("body")}
      </p>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-char-200/70 pt-4">
        <p className="text-sm text-char-500">
          {SITE.name}
          {" · "}
          <a href={CONTACT_HREF.email} className="text-amber-700 hover:underline">
            {SITE.email}
          </a>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full border border-char-200 bg-white px-5 py-2.5 text-sm font-semibold text-char-700 transition-colors hover:border-char-300"
        >
          {t("close")}
        </button>
      </div>
    </div>
  );
}
