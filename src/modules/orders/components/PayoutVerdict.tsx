"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, EnvelopeSimple, HourglassMedium } from "@phosphor-icons/react/dist/ssr";

/**
 * "May we pay the auction for this car?" — the doctrine's verdict, on the
 * case file where the decision is actually taken.
 *
 * The facts come from `drawdownFactsFor`, the same computation the supplier
 * ledger's guard runs — so this badge and that refusal can never disagree.
 * The button records the emailed bank confirmation; it renders only while
 * that is the missing piece, because a button that is always there gets
 * pressed on autopilot.
 */

export interface VerdictFacts {
  clientSettled: boolean;
  repeatClient: boolean;
  invoiceIssued: boolean;
  paymentDeclared: boolean;
}

export default function PayoutVerdict({ orderId, facts }: { orderId: string; facts: VerdictFacts }) {
  const t = useTranslations("Admin.payout");
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState(false);

  const clear =
    facts.repeatClient || facts.clientSettled || (facts.invoiceIssued && facts.paymentDeclared);

  async function recordConfirmation() {
    setState("busy");
    setError(false);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/confirmation`, { method: "POST" });
      if (res.ok) {
        window.location.reload();
        return;
      }
      setError(true);
    } catch {
      setError(true);
    }
    setState("idle");
  }

  if (clear) {
    return (
      <p className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
        <CheckCircle size={18} weight="fill" />
        {facts.repeatClient
          ? t("clearRepeat")
          : facts.clientSettled
            ? t("clearSettled")
            : t("clearConfirmed")}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <HourglassMedium size={18} weight="fill" />
        {facts.invoiceIssued ? t("waitConfirmation") : t("waitInvoice")}
      </p>
      {facts.invoiceIssued ? (
        <div className="mt-3">
          <button
            type="button"
            disabled={state === "busy"}
            onClick={recordConfirmation}
            className="inline-flex items-center gap-2 rounded-full border border-amber-600 bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <EnvelopeSimple size={16} weight="bold" />
            {state === "busy" ? t("recording") : t("recordConfirmation")}
          </button>
          <p className="mt-2 text-xs text-char-500">{t("recordHint")}</p>
          {error ? <p className="mt-2 text-xs font-semibold text-red-700">{t("failed")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
