"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { errorBoxClass } from "@/modules/auth/components/formStyles";

type State = "idle" | "confirming" | "busy" | "error";

/**
 * Withdraw a pending plan request.
 *
 * Two clicks, not one: cancelling loses the client's place in the queue, and
 * the button sits next to "waiting for your deposit" where a mis-click is
 * easy. The confirm step is inline rather than a modal — there is one
 * sentence to read and a modal would be heavier than the decision.
 */
export default function CancelPlanRequest({ depositId }: { depositId: string }) {
  const t = useTranslations("Account.plan");
  const [state, setState] = useState<State>("idle");

  async function cancel() {
    setState("busy");
    try {
      const res = await fetch("/api/plans/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      // Full reload rather than local state: the page is server-rendered from
      // the deposit row, and re-reading it is the only way to be sure the UI
      // agrees with the database — including the case where an admin
      // confirmed the request a moment before this click landed.
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  if (state === "error") {
    return (
      <p className={errorBoxClass}>
        <WarningCircle size={18} weight="fill" className="shrink-0" />
        {t("cancelError")}
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
        {t("cancelRequest")}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-char-200 bg-char-50 p-4">
      <p className="text-sm leading-relaxed text-char-700">{t("cancelConfirm")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={cancel}
          disabled={state === "busy"}
          className="inline-flex items-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
        >
          {t("cancelYes")}
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          disabled={state === "busy"}
          className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
        >
          {t("cancelNo")}
        </button>
      </div>
    </div>
  );
}
