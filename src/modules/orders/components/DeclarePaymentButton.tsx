"use client";

import { useState } from "react";
import { CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";

/**
 * "I've paid" — a signal, not a payment.
 *
 * Deliberately NOT `reportActivity`, which is fire-and-forget and silent: that
 * is right for analytics and wrong here. A client who has just wired $15,000
 * and presses a button that does nothing visible will press it again, then
 * message us to ask whether it worked — which is the exact conversation this
 * is meant to remove. So it waits for the server and changes state.
 *
 * **The copy never says "paid".** It says we will look for it. The money has
 * not arrived and may take days; a green tick claiming otherwise would be the
 * page telling a comfortable lie, and the client would then wonder why the
 * balance above it had not moved.
 *
 * A failure is shown rather than swallowed, for the same reason — silence
 * after this particular click is the one outcome a client cannot interpret.
 */
export default function DeclarePaymentButton({
  orderId,
  labels,
}: {
  orderId: string;
  labels: { action: string; sending: string; done: string; failed: string };
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  if (state === "done") {
    return (
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm leading-relaxed text-char-800">
        <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0 text-green-600" />
        {labels.done}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={state === "sending"}
        onClick={async () => {
          setState("sending");
          try {
            const res = await fetch(`/api/orders/${orderId}/declare-payment`, { method: "POST" });
            setState(res.ok ? "done" : "error");
          } catch {
            setState("error");
          }
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-char-300 bg-white px-6 py-3 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <PaperPlaneTilt size={16} weight="bold" />
        {state === "sending" ? labels.sending : labels.action}
      </button>
      {state === "error" && (
        <p className="mt-2 text-center text-xs font-medium text-red-700">{labels.failed}</p>
      )}
    </div>
  );
}
