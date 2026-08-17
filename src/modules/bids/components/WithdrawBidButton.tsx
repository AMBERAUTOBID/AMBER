"use client";

import { useState } from "react";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";

/**
 * "Take this instruction back."
 *
 * ── WHY IT CONFIRMS, AND WHY THE CONFIRMATION NAMES THE CAR ─────────────
 * The row it sits on is one of several, all laid out alike, and the thing being
 * undone is an authorisation to spend thousands of dollars. A single click on
 * the wrong card would cancel the wrong car, and the client would not find out
 * until the auction had run without them. So the confirmation restates the car
 * and the amount — the two facts that tell you whether you clicked the right
 * row — rather than asking "are you sure?", which nobody reads.
 *
 * ── AND WHY A REFUSAL SHOWS A PHONE NUMBER ──────────────────────────────
 * A 409 means the instruction moved on while this page sat open: an admin
 * marked the bid placed, or the sale came within a day. That is not an error to
 * apologise for, it is a fact that a person can still act on — they can ring us
 * and we can look at the auction. The same answer the request form gives when
 * a lot is too close, for the same reason.
 */
export default function WithdrawBidButton({
  requestId,
  labels,
}: {
  requestId: string;
  labels: {
    action: string;
    confirmTitle: string;
    confirmBody: string;
    confirmYes: string;
    confirmNo: string;
    working: string;
    tooLate: string;
    failed: string;
  };
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "too_late" | "error">("idle");

  async function submit() {
    setState("busy");
    try {
      const res = await fetch(`/api/bids/${requestId}/withdraw`, { method: "POST" });
      if (res.ok) {
        // Re-read rather than patch: the row moves section, its wording
        // changes, and the deposit line disappears with it.
        window.location.reload();
        return;
      }
      setState(res.status === 409 ? "too_late" : "error");
    } catch {
      setState("error");
    }
    setConfirming(false);
  }

  if (state === "too_late" || state === "error") {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-char-800">
        <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
        {state === "too_late" ? labels.tooLate : labels.failed}
      </p>
    );
  }

  if (confirming) {
    return (
      <div className="mt-3 rounded-xl border border-char-300 bg-char-50 p-4">
        <p className="text-sm font-semibold text-char-900">{labels.confirmTitle}</p>
        <p className="mt-1 text-sm leading-relaxed text-char-700">{labels.confirmBody}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={state === "busy"}
            className="rounded-full bg-char-800 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-char-900 disabled:opacity-60"
          >
            {state === "busy" ? labels.working : labels.confirmYes}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={state === "busy"}
            className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
          >
            {labels.confirmNo}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="mt-3 text-sm font-semibold text-char-600 underline-offset-4 hover:underline"
    >
      {labels.action}
    </button>
  );
}
