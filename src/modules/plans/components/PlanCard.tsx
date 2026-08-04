"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import { formatDepositEur, type Plan } from "../model/plans";

/**
 * One tier on the plans page. Feature lines are built from the plan table,
 * not written per-card, so a limit can never say one thing here and enforce
 * another in can() — the classic way pricing pages start lying.
 */
export default function PlanCard({ plan, signedIn }: { plan: Plan; signedIn: boolean }) {
  const t = useTranslations("Plans");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "sending" | "requested" | "already" | "error">("idle");

  const features = [
    plan.maxBidUsd === null
      ? t("features.bidUnlimited")
      : t("features.bidLimit", { amount: `$${plan.maxBidUsd.toLocaleString("en-US")}` }),
    plan.maxConcurrentBids === null
      ? t("features.concurrentUnlimited")
      : t("features.concurrent", { count: plan.maxConcurrentBids }),
    t("features.fee", { amount: formatDepositEur(plan.feePerLotCents) }),
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
        "relative flex flex-col rounded-2xl border bg-white p-7 transition-shadow",
        plan.featured
          ? "border-amber-400 shadow-lg shadow-amber-900/10"
          : "border-char-200/70 hover:shadow-md"
      )}
    >
      {plan.featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          {t("popular")}
        </span>
      )}

      <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
        {t(`tiers.${plan.key}.name`)}
      </h3>

      <p className="mt-3 font-[family-name:var(--font-heading)] text-4xl font-extrabold tracking-tight text-char-900">
        {plan.depositCents === 0 ? t("noDeposit") : formatDepositEur(plan.depositCents)}
      </p>
      <p className="mt-1 text-sm text-char-500">
        {plan.depositCents === 0 ? t("noDepositLabel") : t("refundableDeposit")}
      </p>

      <ul className="mt-6 flex-1 space-y-3 border-t border-char-200/70 pt-6">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5 text-sm leading-relaxed text-char-700">
            <Check size={17} weight="bold" className="mt-0.5 shrink-0 text-amber-600" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

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
    </div>
  );
}
