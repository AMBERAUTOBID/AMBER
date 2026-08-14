"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatUsd } from "@/modules/plans/model/plans";
import type { RefundRequestRow } from "@/modules/plans/model/deposits";

/**
 * Clients who have asked for their deposit back.
 *
 * It sits beside the deposit queue rather than in it, even though both are
 * "things waiting for an admin", because the actions are opposite and the
 * mistake is expensive: Confirm above grants access, and Refund here takes
 * money out of the business. Two lists, two shapes of button, no row where a
 * mis-click does the reverse of what was intended.
 *
 * Approving is deliberately the same operation as the Refund button in the
 * client list below — one function, `refundClient`, scoped to the person —
 * because a request and an admin-initiated refund end in exactly the same
 * state and having two code paths reach it is how they drift.
 *
 * Declining exists because without it a request made in error could only be
 * resolved by actually returning the money. It is not offered to clients: the
 * spec gives them two buttons, and this is the answer to their phone call.
 */
export default function RefundQueue({
  rows,
  planNames,
}: {
  rows: RefundRequestRow[];
  /** Resolved server-side from Plans.tiers, so tier names have one source. */
  planNames: Record<string, string>;
}) {
  const t = useTranslations("Admin");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(userId: string, action: "refund" | "decline_refund") {
    setBusy(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      if (res.ok) {
        setDone((prev) => new Set(prev).add(userId));
        setConfirming(null);
      } else {
        setError(res.status === 409 ? t("alreadyHandled") : t("actionFailed"));
      }
    } catch {
      setError(t("actionFailed"));
    }
    setBusy(null);
  }

  const visible = rows.filter((r) => !done.has(r.userId));

  if (visible.length === 0) {
    return <p className="text-sm text-char-600">{t("refundQueueEmpty")}</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {visible.map((row) => (
        <div key={row.userId} className="rounded-2xl border border-char-200/70 bg-white p-5">
          <div className="min-w-0">
            <p className="truncate font-semibold text-char-900">{row.userName}</p>
            <p className="truncate text-sm text-char-600">{row.userEmail}</p>
            <p className="mt-1 text-sm text-char-700">
              {row.planKey ? (planNames[row.planKey] ?? row.planKey) : t("noPlan")}
              {" — "}
              <strong>{t("toReturn", { amount: formatUsd(row.heldCents) })}</strong>
              {row.rows > 1 && (
                <span className="text-char-500"> ({t("acrossRows", { n: row.rows })})</span>
              )}
            </p>
            {/* Says plainly that nothing has happened yet. An admin reading a
                queue of refunds needs to know the access is still live — a
                client mid-auction is the reason to pick up the phone before
                pressing anything. */}
            <p className="mt-1 text-xs text-char-500">{t("refundStillActive")}</p>
          </div>

          {confirming === row.userId ? (
            <div className="mt-4 rounded-xl border border-char-200 bg-char-50 p-4">
              <p className="text-sm leading-relaxed text-char-700">
                {t("refundConfirm", { name: row.userName, amount: formatUsd(row.heldCents) })}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => act(row.userId, "refund")}
                  disabled={busy === row.userId}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                >
                  {busy === row.userId ? t("refunding") : t("refundYes")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  disabled={busy === row.userId}
                  className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
                >
                  {t("refundNo")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-char-200/70 pt-4">
              <button
                type="button"
                onClick={() => setConfirming(row.userId)}
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                {t("refundApprove")}
              </button>
              <button
                type="button"
                onClick={() => act(row.userId, "decline_refund")}
                disabled={busy === row.userId}
                className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
              >
                {t("refundDecline")}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
