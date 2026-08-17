"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatUsd } from "@/modules/plans/model/plans";
import { depositReference } from "@/modules/plans/model/depositReference";
import type { DepositRow } from "@/modules/plans/model/deposits";

/**
 * The admin's work queue. Confirming is the moment a client's plan becomes
 * real, so the button says what will happen and the row disappears only
 * after the server agrees.
 *
 * Lives in `modules/admin` rather than `modules/plans`: it is a screen for
 * staff, not part of the plan catalogue, and the console it belongs to is
 * going to grow views that have nothing to do with plans.
 */
export default function DepositQueue({
  rows,
  planNames,
}: {
  rows: DepositRow[];
  /** Resolved server-side from Plans.tiers, so tier names have one source. */
  planNames: Record<string, string>;
}) {
  const t = useTranslations("Admin");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function act(depositId: string, action: "confirm" | "refund") {
    setBusy(depositId);
    setError(null);
    try {
      const res = await fetch("/api/admin/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId, action }),
      });
      if (res.ok) setDone((prev) => new Set(prev).add(depositId));
      else setError(res.status === 409 ? t("alreadyHandled") : t("actionFailed"));
    } catch {
      setError(t("actionFailed"));
    }
    setBusy(null);
  }

  const visible = rows.filter((r) => !done.has(r.id));

  if (visible.length === 0) {
    return <p className="text-sm text-char-600">{t("queueEmpty")}</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}
      {visible.map((row) => (
        <div
          key={row.id}
          className="flex flex-col gap-4 rounded-2xl border border-char-200/70 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-char-900">{row.userName}</p>
            <p className="truncate text-sm text-char-600">{row.userEmail}</p>
            {/* The string the client was told to put on the transfer. Shown
                here because this is where an admin holds a bank statement
                against a queue and decides which line is which — several
                clients pay the same round figure on the same tier, so the
                amount alone does not identify anybody. */}
            <p className="truncate font-[family-name:var(--font-mono)] text-xs text-char-500">
              {depositReference(row.id)}
            </p>
            <p className="mt-1 text-sm text-char-700">
              {planNames[row.planKey] ?? row.planKey}
              {/* Bronze is free; printing "— $0" states an amount nobody owes. */}
              {row.amountCents > 0 && <> — <strong>{formatUsd(row.amountCents)}</strong></>}
            </p>
            {/* An upgrade's figure is the DIFFERENCE, and an admin about to
                watch a bank account for it must not read it as the tier's
                price. Named from the client's live tier, because a row is a
                top-up exactly when one exists. */}
            {row.userActivePlanKey && (
              <p className="mt-0.5 text-xs font-semibold text-amber-800">
                {t("topUpFrom", {
                  plan: planNames[row.userActivePlanKey] ?? row.userActivePlanKey,
                })}
              </p>
            )}
            <p className="mt-0.5 text-xs text-char-500">
              {t("requestedOn", { date: row.createdAt.toISOString().slice(0, 10) })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => act(row.id, "confirm")}
            disabled={busy === row.id}
            className="shrink-0 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
          >
            {busy === row.id ? t("confirming") : t("confirmDeposit")}
          </button>
        </div>
      ))}
    </div>
  );
}
