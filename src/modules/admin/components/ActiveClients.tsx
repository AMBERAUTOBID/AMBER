"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatUsd } from "@/modules/plans/model/plans";
import type { ClientRow } from "../model/clients";

/**
 * Who is on a plan right now, and the only way to refund one.
 *
 * Refunding is destructive in two directions at once — it strips the client's
 * plan and asserts that money is going back — so it sits behind a confirm
 * step, unlike Confirm in the queue above, which only ever grants access.
 */
export default function ActiveClients({
  rows,
  planNames,
}: {
  rows: ClientRow[];
  /** Resolved server-side from Plans.tiers, so tier names have one source. */
  planNames: Record<string, string>;
}) {
  const t = useTranslations("Admin");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refunded, setRefunded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function refund(depositId: string) {
    setBusy(depositId);
    setError(null);
    try {
      const res = await fetch("/api/admin/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId, action: "refund" }),
      });
      if (res.ok) {
        setRefunded((prev) => new Set(prev).add(depositId));
        setConfirming(null);
      } else {
        setError(res.status === 409 ? t("alreadyHandled") : t("actionFailed"));
      }
    } catch {
      setError(t("actionFailed"));
    }
    setBusy(null);
  }

  const visible = rows.filter((r) => !refunded.has(r.depositId));

  if (visible.length === 0) {
    return <p className="text-sm text-char-600">{t("clientsEmpty")}</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {visible.map((row) => (
        <div key={row.depositId} className="rounded-2xl border border-char-200/70 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-semibold text-char-900">{row.name}</p>
              <p className="truncate text-sm text-char-600">{row.email}</p>
              <p className="mt-1 text-sm text-char-700">
                {planNames[row.planKey] ?? row.planKey}
                {/* A free plan has no deposit figure worth printing. */}
                {row.amountCents > 0 && <> — <strong>{formatUsd(row.amountCents)}</strong></>}
              </p>
              {row.confirmedAt && (
                <p className="mt-0.5 text-xs text-char-500">
                  {t("activeSince", { date: row.confirmedAt.toISOString().slice(0, 10) })}
                </p>
              )}
            </div>

            {confirming !== row.depositId && (
              <button
                type="button"
                onClick={() => setConfirming(row.depositId)}
                className="shrink-0 rounded-full border border-char-200 px-5 py-2.5 text-sm font-semibold text-char-700 transition-colors hover:border-red-300 hover:text-red-700"
              >
                {t("refund")}
              </button>
            )}
          </div>

          {confirming === row.depositId && (
            <div className="mt-4 rounded-xl border border-char-200 bg-char-50 p-4">
              <p className="text-sm leading-relaxed text-char-700">
                {t("refundConfirm", { name: row.name })}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => refund(row.depositId)}
                  disabled={busy === row.depositId}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                >
                  {busy === row.depositId ? t("refunding") : t("refundYes")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  disabled={busy === row.depositId}
                  className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
                >
                  {t("refundNo")}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
