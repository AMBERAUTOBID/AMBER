"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { errorBoxClass } from "@/modules/auth/components/formStyles";

type State = "idle" | "confirming" | "busy" | "error";

/**
 * Ask for the deposit back — the only way out of a plan, because there is no
 * self-service downgrade.
 *
 * Two clicks, like CancelPlanRequest, and for a heavier reason: this one ends
 * the arrangement rather than withdrawing a request nobody has acted on. The
 * confirm sentence names the amount, so nobody discovers what they asked for
 * from the email afterwards.
 *
 * It sends **no id**. The client's whole held balance moves together — after
 * an upgrade it spans several deposit rows, which are one deposit to the
 * client and to their bank. A component that picked a row would be choosing
 * how much of their own money to return.
 */
export default function RequestRefund({ amount }: { amount: string }) {
  const t = useTranslations("Account.plan");
  const [state, setState] = useState<State>("idle");

  async function request() {
    setState("busy");
    try {
      const res = await fetch("/api/plans/refund", { method: "POST" });
      if (!res.ok) {
        setState("error");
        return;
      }
      // Full reload rather than local state: this page is rendered from the
      // deposit rows, and re-reading them is the only way to be sure the UI
      // agrees with the database — including the case where an admin acted a
      // moment before this click landed.
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  if (state === "error") {
    return (
      <p className={errorBoxClass}>
        <WarningCircle size={18} weight="fill" className="shrink-0" />
        {t("refundError")}
      </p>
    );
  }

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState("confirming")}
        className="text-sm font-semibold text-char-600 underline-offset-4 transition-colors hover:text-red-700 hover:underline"
      >
        {t("refundRequest")}
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-char-200 bg-char-50 p-4">
      <p className="text-sm leading-relaxed text-char-700">{t("refundConfirm", { amount })}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={request}
          disabled={state === "busy"}
          className="inline-flex items-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
        >
          {t("refundYes")}
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          disabled={state === "busy"}
          className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
        >
          {t("refundNo")}
        </button>
      </div>
    </div>
  );
}
