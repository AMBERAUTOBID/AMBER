"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, WarningCircle, Lock } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import { Link } from "@/i18n/navigation";
import { formatUsd, type Plan } from "../model/plans";

/**
 * One tier on the plans page. Feature lines are built from the plan table,
 * not written per-card, so a limit can never say one thing here and enforce
 * another in can() — the classic way pricing pages start lying.
 *
 * Unavailable tiers stay fully readable (a customer should be able to see
 * where they're heading) but are visually recessed and offer a Contact link
 * instead of a select button. The server refuses them too; this is only the
 * polite half.
 */
export default function PlanCard({ plan, signedIn }: { plan: Plan; signedIn: boolean }) {
  const t = useTranslations("Plans");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "sending" | "requested" | "already" | "error">("idle");

  const features = [
    plan.maxBidUsd === null
      ? t("features.bidUnlimited")
      : t("features.bidLimit", { amount: formatUsd(plan.maxBidUsd * 100) }),
    plan.maxConcurrentBids === null
      ? t("features.concurrentUnlimited")
      : plan.concurrencyThresholdUsd !== null
        ? t("features.concurrentConditional", {
            count: plan.maxConcurrentBids,
            threshold: formatUsd(plan.concurrencyThresholdUsd * 100),
          })
        : t("features.concurrent", { count: plan.maxConcurrentBids }),
    t("features.consultant"),
    // One line per published fee; an empty list renders nothing at all.
    ...plan.feesPerVehicleUsdCents.map((cents) =>
      t("features.fee", { amount: formatUsd(cents) })
    ),
    ...(plan.nightReserveVisible ? [t("features.nightReserve")] : []),
    ...(plan.liveAuctionAccess ? [t("features.liveAuction")] : []),
    ...(plan.selfBiddingEligible ? [t("features.selfBidding")] : []),
  ];

  async function choose() {
    if (!signedIn) {
      window.location.assign(locale === "en" ? "/register" : `/${locale}/register`);
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/plans/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: plan.key }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string };
      if (res.ok && body.ok) setState(body.status === "already_pending" ? "already" : "requested");
      else setState("error");
    } catch {
      setState("error");
    }
  }

  return (
    <div
      className={clsx(
        // Padding eases off at the 4-across breakpoint, where each card is
        // roughly 220px wide and every pixel of content width counts.
        "relative flex flex-col rounded-2xl border p-6 xl:p-7 transition-shadow",
        !plan.available
          ? "border-char-200/60 bg-char-50/40"
          : plan.featured
            ? "border-amber-400 bg-white shadow-lg shadow-amber-900/10"
            : "border-char-200/70 bg-white hover:shadow-md"
      )}
    >
      {plan.available && plan.featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          {t("popular")}
        </span>
      )}
      {!plan.available && (
        <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-char-700 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          <Lock size={11} weight="fill" />
          {t("comingSoon")}
        </span>
      )}

      <h3
        className={clsx(
          "text-sm font-semibold uppercase tracking-wide",
          plan.available ? "text-amber-700" : "text-char-500"
        )}
      >
        {t(`tiers.${plan.key}.name`)}
      </h3>

      <p
        className={clsx(
          "mt-3 font-[family-name:var(--font-heading)] text-4xl font-extrabold tracking-tight",
          plan.available ? "text-char-900" : "text-char-500"
        )}
      >
        {plan.depositUsdCents === 0 ? t("noDeposit") : formatUsd(plan.depositUsdCents)}
      </p>
      <p className="mt-1 text-sm text-char-500">
        {plan.depositUsdCents === 0 ? t("noDepositLabel") : t("refundableDeposit")}
      </p>

      <p className="mt-4 text-sm leading-relaxed text-char-600">{t(`tiers.${plan.key}.tagline`)}</p>

      <ul className="mt-6 flex-1 space-y-3 border-t border-char-200/70 pt-6">
        {features.map((f) => (
          <li
            key={f}
            className={clsx(
              "flex gap-2.5 text-sm leading-relaxed",
              plan.available ? "text-char-700" : "text-char-500"
            )}
          >
            <Check
              size={17}
              weight="bold"
              className={clsx(
                "mt-0.5 shrink-0",
                plan.available ? "text-amber-600" : "text-char-400"
              )}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {plan.available ? (
        <>
          <button
            type="button"
            onClick={choose}
            disabled={state === "sending" || state === "requested"}
            className={clsx(
              "mt-7 inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70",
              plan.featured
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "border border-char-200 bg-white text-char-800 hover:border-amber-400 hover:text-amber-700"
            )}
          >
            {state === "sending"
              ? t("choosing")
              : state === "requested"
                ? t("chosen")
                : signedIn
                  ? t("choose")
                  : t("chooseSignedOut")}
          </button>

          {(state === "requested" || state === "already") && (
            <p className="mt-3 text-xs leading-relaxed text-green-800">
              {state === "already" ? t("alreadyPending") : t("requestedHint")}
            </p>
          )}
          {state === "error" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-red-700">
              <WarningCircle size={14} weight="fill" className="shrink-0" />
              {t("requestError")}
            </p>
          )}
        </>
      ) : (
        <>
          <Link
            href="/contact"
            className="mt-7 inline-flex w-full items-center justify-center rounded-full border border-char-300 bg-white px-6 py-3.5 text-sm font-semibold text-char-700 transition-colors hover:border-amber-400 hover:text-amber-700"
          >
            {t("contactUs")}
          </Link>
          <p className="mt-3 text-xs leading-relaxed text-char-500">{t("comingSoonHint")}</p>
        </>
      )}
    </div>
  );
}
