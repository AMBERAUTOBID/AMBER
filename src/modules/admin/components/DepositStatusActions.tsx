"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { formatUsd } from "@/modules/plans/model/plans";
import type { BidDepositStatus } from "@/shared/db/schema";

/**
 * Recording where one security deposit has got to.
 *
 * ── WHY EVERY BUTTON NAMES THE AMOUNT ───────────────────────────────────
 * These four words move real money on a client's balance. "Returned" on the
 * wrong row hands back a hold we are still relying on; "forfeited" on the
 * wrong row keeps money we had no right to. So each button carries the figure
 * — a button labelled "Returned $1,500" is read, one labelled "Returned" is
 * clicked — and the two that cannot be undone ask again before acting.
 *
 * ── WHY THERE IS NO WAY BACK ────────────────────────────────────────────
 * `returned` and `forfeited` are terminal by design (see `DEPOSIT_MOVES`): a
 * hold that has left cannot arrive again, and a client posting another one
 * creates a new instruction with its own row. An "undo" here would mean a
 * balance that says we hold money we have already sent back.
 */
export default function DepositStatusActions({
  requestId,
  amountCents,
  moves,
}: {
  requestId: string;
  amountCents: number;
  /**
   * Computed on the server from `allowedDepositMoves`, the same table the
   * server enforces — so a button can never exist for a move the API refuses.
   */
  moves: readonly BidDepositStatus[];
}) {
  const t = useTranslations("AdminBids.depositMove");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<BidDepositStatus | null>(null);
  const [error, setError] = useState<"conflict" | "failed" | null>(null);

  if (moves.length === 0) return null;

  async function send(to: BidDepositStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bids/deposit-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status: to }),
      });
      if (res.ok) {
        // Re-read: this changes the client's balance, which is shown in
        // several places on the page.
        window.location.reload();
        return;
      }
      setError(res.status === 409 ? "conflict" : "failed");
    } catch {
      setError("failed");
    }
    setBusy(false);
    setConfirming(null);
  }

  const amount = formatUsd(amountCents);

  return (
    <div className="mt-3">
      {confirming ? (
        <div className="rounded-xl border border-char-300 bg-char-50 p-4">
          <p className="text-sm font-semibold text-char-900">
            {t(`confirm.${confirming}`, { amount })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-char-700">{t("noUndo")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => send(confirming)}
              disabled={busy}
              className="rounded-full bg-char-800 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-char-900 disabled:opacity-60"
            >
              {busy ? t("saving") : t(`to.${confirming}`, { amount })}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={busy}
              className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {moves.map((to) => (
            <button
              key={to}
              type="button"
              // Arrival is a simple fact and acts at once. The two that move
              // money away from where it is ask again first.
              onClick={() => (to === "received" ? send(to) : setConfirming(to))}
              disabled={busy}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                to === "received"
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "border border-char-300 text-char-700 hover:border-char-400"
              }`}
            >
              {busy && to === "received" ? t("saving") : t(`to.${to}`, { amount })}
            </button>
          ))}
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
