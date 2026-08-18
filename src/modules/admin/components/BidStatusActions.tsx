"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { allowedTransitions, type BidRequestStatus } from "@/modules/bids/model/bidStatus";

/**
 * Answering a bid instruction: accept, refuse, mark placed, record the result.
 *
 * ── WHY THE BUTTONS ARE BUILT FROM THE RULE ─────────────────────────────
 * The list comes from `allowedTransitions`, the same table the server checks
 * against, rather than from a hand-written set of buttons per state. Two lists
 * would drift, and the way they drift is a button that exists and does not
 * work — which on this screen means an admin believing they marked a bid
 * placed when the server refused.
 *
 * ── WHY REFUSING IS A SEPARATE STEP ─────────────────────────────────────
 * Declining opens a reason box instead of acting immediately. The reason is
 * shown to the client verbatim, so it is written deliberately, and the pause
 * is also the only thing standing between a mis-click and a refusal sent to
 * somebody who asked us to spend fifteen thousand dollars.
 *
 * A 409 is reported in its own words, not as "failed": it means somebody else
 * answered this a moment ago, and the honest instruction is to look again
 * rather than to try again.
 */
export default function BidStatusActions({
  requestId,
  status,
}: {
  requestId: string;
  status: BidRequestStatus;
}) {
  const t = useTranslations("AdminBids.actions");
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<"conflict" | "failed" | null>(null);

  const moves = allowedTransitions(status);
  if (moves.length === 0) return null;

  async function send(to: BidRequestStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bids/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status: to, ...(to === "declined" ? { reason } : {}) }),
      });
      if (res.ok) {
        // Re-read rather than patch in place: the move changes which buttons
        // exist, which section the row belongs in, and the counts above it.
        window.location.reload();
        return;
      }
      setError(res.status === 409 ? "conflict" : "failed");
    } catch {
      setError("failed");
    }
    setBusy(false);
  }

  return (
    <div className="mt-3">
      {declining ? (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <label
            htmlFor={`reason-${requestId}`}
            className="block text-xs font-semibold uppercase tracking-wider text-char-600"
          >
            {t("reasonLabel")}
          </label>
          <p className="mt-1 text-xs leading-relaxed text-char-600">{t("reasonHint")}</p>
          <textarea
            id={`reason-${requestId}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-2 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm text-char-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => send("declined")}
              disabled={busy || reason.trim().length === 0}
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t("saving") : t("declineConfirm")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeclining(false);
                setReason("");
              }}
              disabled={busy}
              className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {moves.map((to) =>
            to === "declined" ? (
              <button
                key={to}
                type="button"
                onClick={() => setDeclining(true)}
                disabled={busy}
                className="rounded-full border border-char-300 px-4 py-2 text-sm font-semibold text-char-700 transition-colors hover:border-red-400 hover:text-red-700 disabled:opacity-60"
              >
                {t("to.declined")}
              </button>
            ) : (
              <button
                key={to}
                type="button"
                onClick={() => send(to)}
                disabled={busy}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                  to === "lost"
                    ? "border border-char-300 text-char-700 hover:border-char-400"
                    : "bg-amber-600 text-white hover:bg-amber-700"
                }`}
              >
                {busy ? t("saving") : t(`to.${to}`)}
              </button>
            )
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-red-600" />
          {error === "conflict" ? t("conflict") : t("failed")}
        </p>
      )}
    </div>
  );
}
