"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { formatUsd, PLAN_KEYS, type PlanKey } from "@/modules/plans/model/plans";
import type { ClientRow } from "../model/clients";

/**
 * Who is on a plan right now, what we hold for them, and the two ways to
 * change it.
 *
 * **Refunding is scoped to the client, not to a deposit row.** After an
 * upgrade a client's balance spans several confirmed rows, and they are one
 * deposit as far as the client and the bank are concerned. The button used to
 * take a row id and clear the plan outright, which — the moment two rows could
 * exist — would have left someone with no access and money still on our books.
 *
 * **The plan selector moves no money.** It is an override for correcting
 * reality, so it is allowed in both directions and it is logged. What it must
 * never do is hide its consequence: whenever the held balance stops covering
 * the tier, the row says so, because Bid Limits on the broker platform are set
 * from the deposit and that gap is where real money goes missing.
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

  async function post(userId: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(userId);
    setError(null);
    let ok = false;
    try {
      const res = await fetch("/api/admin/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      });
      ok = res.ok;
      if (!ok) setError(res.status === 409 ? t("alreadyHandled") : t("actionFailed"));
    } catch {
      setError(t("actionFailed"));
    }
    setBusy(null);
    return ok;
  }

  async function refund(userId: string) {
    if (await post(userId, { action: "refund" })) {
      setRefunded((prev) => new Set(prev).add(userId));
      setConfirming(null);
    }
  }

  async function setPlan(userId: string, planKey: PlanKey | null) {
    // Reloaded rather than patched in place: an override changes the held
    // balance warning, the tier name and whether the row belongs on this
    // screen at all, and re-reading the server is the only way to be sure all
    // three agree.
    if (await post(userId, { action: "set_plan", planKey })) window.location.reload();
  }

  const visible = rows.filter((r) => !refunded.has(r.userId));

  if (visible.length === 0) {
    return <p className="text-sm text-char-600">{t("clientsEmpty")}</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {visible.map((row) => (
        <div key={row.userId} className="rounded-2xl border border-char-200/70 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-semibold text-char-900">{row.name}</p>
              <p className="truncate text-sm text-char-600">{row.email}</p>
              <p className="mt-1 text-sm text-char-700">
                {planNames[row.planKey] ?? row.planKey}
                {/* A free plan has no deposit figure worth printing. */}
                {row.heldCents > 0 && (
                  <>
                    {" — "}
                    <strong>{t("held", { amount: formatUsd(row.heldCents) })}</strong>
                  </>
                )}
                {/* Only worth saying when it took more than one transfer. */}
                {row.depositCount > 1 && (
                  <span className="text-char-500"> ({t("acrossRows", { n: row.depositCount })})</span>
                )}
              </p>
              {row.confirmedAt && (
                <p className="mt-0.5 text-xs text-char-500">
                  {t("activeSince", { date: row.confirmedAt.toISOString().slice(0, 10) })}
                </p>
              )}
            </div>

            {confirming !== row.userId && (
              <button
                type="button"
                onClick={() => setConfirming(row.userId)}
                className="shrink-0 rounded-full border border-char-200 px-5 py-2.5 text-sm font-semibold text-char-700 transition-colors hover:border-red-300 hover:text-red-700"
              >
                {t("refund")}
              </button>
            )}
          </div>

          {/* The gap that costs money, stated wherever the client appears. It
              is never wrong to show — an underfunded tier is either an
              override somebody made deliberately or a mistake, and both want
              looking at. */}
          {row.underfunded && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
              <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
              <span>
                {t("underfunded", {
                  held: formatUsd(row.heldCents),
                  required: formatUsd(row.tierDepositCents),
                })}
              </span>
            </p>
          )}

          {row.refundPending && (
            <p className="mt-3 rounded-xl bg-char-50 px-4 py-3 text-sm text-char-700">
              {t("refundPendingNote")}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-char-200/70 pt-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-char-500">
              {t("setPlan")}
            </label>
            <select
              value={row.planKey}
              disabled={busy === row.userId}
              onChange={(e) => setPlan(row.userId, (e.target.value || null) as PlanKey | null)}
              className="rounded-xl border border-char-200 bg-white px-3 py-2 text-sm font-semibold text-char-800 outline-none focus:border-amber-400 disabled:opacity-60"
            >
              {/* A tier retired from the catalogue still has to render as
                  itself. Without this the select falls back to the empty
                  option and reads as "no plan" — one careless click from
                  actually becoming true. */}
              {!(PLAN_KEYS as readonly string[]).includes(row.planKey) && (
                <option value={row.planKey} disabled>
                  {row.planKey}
                </option>
              )}
              {PLAN_KEYS.map((key) => (
                <option key={key} value={key}>
                  {planNames[key] ?? key}
                </option>
              ))}
              {/* Takes them off every tier without touching the deposit —
                  which is the honest option when the money stays with us but
                  the arrangement is on hold. */}
              <option value="">{t("noPlan")}</option>
            </select>
            <span className="text-xs text-char-500">{t("setPlanHint")}</span>
          </div>

          {confirming === row.userId && (
            <div className="mt-4 rounded-xl border border-char-200 bg-char-50 p-4">
              <p className="text-sm leading-relaxed text-char-700">
                {t("refundConfirm", { name: row.name, amount: formatUsd(row.heldCents) })}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => refund(row.userId)}
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
          )}
        </div>
      ))}
    </div>
  );
}
