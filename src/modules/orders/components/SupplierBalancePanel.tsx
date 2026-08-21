"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Bank, WarningCircle, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { inputClass, labelClass } from "@/modules/auth/components/formStyles";
import { parseAmountToCents } from "@/modules/orders/model/money";
import {
  balanceAlert,
  runwayCars,
} from "@/modules/orders/model/supplierBalance";

/**
 * The Aivi credit balance, as WE account for it.
 *
 * The number their portal shows has no history behind it that we control;
 * this panel is the shadow ledger — balance, runway in cars, every movement
 * tied to a case file, and the financing gate. When the server answers
 * `needs_override`, the form does not fail: it unfolds the override box and
 * says what signing it means. Financing a trusted client is a decision the
 * owner may take — this makes it a decision, never a default.
 */

export interface SupplierEntry {
  id: string;
  kind: "top_up" | "drawdown" | "adjustment";
  direction: "credit" | "debit";
  amountCents: number;
  orderReference: string | null;
  note: string | null;
  overrideReason: string | null;
  occurredAt: string;
}

interface Props {
  balanceCents: number;
  recentDrawdownsCents: number[];
  entries: SupplierEntry[];
}

export default function SupplierBalancePanel({
  balanceCents,
  recentDrawdownsCents,
  entries,
}: Props) {
  const t = useTranslations("Admin.supplier");
  const format = useFormatter();

  const runway = runwayCars(balanceCents, recentDrawdownsCents);
  const alert = balanceAlert(balanceCents, runway.cars);

  const [kind, setKind] = useState<"top_up" | "drawdown" | "adjustment">("drawdown");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [direction, setDirection] = useState<"credit" | "debit">("debit");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  const money = (cents: number) =>
    (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }) + " USD";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseAmountToCents(amount);
    if (amountCents === null || amountCents <= 0) {
      setError(t("badAmount"));
      return;
    }
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/admin/supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          amountCents,
          direction: kind === "adjustment" ? direction : undefined,
          orderReference: reference.trim() || null,
          note: note.trim() || null,
          overrideReason: overrideOpen ? overrideReason.trim() || null : null,
          occurredAt: new Date(`${occurredAt}T12:00:00Z`).toISOString(),
        }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (body?.error === "needs_override") {
        // Not a failure — the financing gate. Unfold, explain, let them sign.
        setOverrideOpen(true);
        setError(t("overrideExplain"));
      } else if (body?.error === "order_not_found") {
        setError(t("orderNotFound"));
      } else {
        setError(t("failed"));
      }
    } catch {
      setError(t("failed"));
    }
    setState("idle");
  }

  const alertClass =
    alert === "empty"
      ? "bg-red-50 border-red-200 text-red-800"
      : alert === "low"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-emerald-50 border-emerald-200 text-emerald-800";

  return (
    <div>
      {/* ── the number, and what it is enough for ─────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <Bank size={28} className="text-char-500" />
          <div>
            <p className="text-2xl font-extrabold tracking-tight text-char-900">
              {money(balanceCents)}
            </p>
            <p className="text-xs text-char-500">{t("balanceLabel")}</p>
          </div>
        </div>
        <p className={`rounded-xl border px-4 py-2 text-sm font-semibold ${alertClass}`}>
          {alert === "empty"
            ? t("alertEmpty")
            : t("runway", { cars: runway.cars, avg: money(runway.averageCents) })}
        </p>
      </div>

      {/* ── record a movement ─────────────────────────────────────────── */}
      <form onSubmit={submit} className="mt-5 rounded-xl border border-char-200 bg-char-50 p-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="sup-kind" className={labelClass}>
              {t("kind")}
            </label>
            <select
              id="sup-kind"
              className={inputClass}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                setOverrideOpen(false);
                setError(null);
              }}
            >
              <option value="top_up">{t("kinds.top_up")}</option>
              <option value="drawdown">{t("kinds.drawdown")}</option>
              <option value="adjustment">{t("kinds.adjustment")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="sup-amount" className={labelClass}>
              {t("amount")}
            </label>
            <input
              id="sup-amount"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="6 548.00"
              inputMode="decimal"
            />
          </div>
          <div>
            <label htmlFor="sup-ref" className={labelClass}>
              {t("reference")}
            </label>
            <input
              id="sup-ref"
              className={inputClass}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="SAB-2026-0001"
            />
            {kind === "drawdown" ? (
              <p className="mt-1 text-xs text-char-500">{t("referenceHint")}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="sup-date" className={labelClass}>
              {t("occurredAt")}
            </label>
            <input
              id="sup-date"
              type="date"
              className={inputClass}
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>

          {kind === "adjustment" ? (
            <div>
              <span className={labelClass}>{t("directionLabel")}</span>
              <div className="mt-2 flex gap-4 text-sm">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    checked={direction === "credit"}
                    onChange={() => setDirection("credit")}
                    className="accent-amber-600"
                  />
                  {t("directionCredit")}
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    checked={direction === "debit"}
                    onChange={() => setDirection("debit")}
                    className="accent-amber-600"
                  />
                  {t("directionDebit")}
                </label>
              </div>
            </div>
          ) : null}

          <div className={kind === "adjustment" ? "sm:col-span-3" : "sm:col-span-4"}>
            <label htmlFor="sup-note" className={labelClass}>
              {t("note")}
            </label>
            <input
              id="sup-note"
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("notePlaceholder")}
            />
          </div>
        </div>

        {overrideOpen ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="flex items-start gap-2 text-sm font-semibold text-amber-800">
              <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
              {t("overrideTitle")}
            </p>
            <p className="mt-1 text-sm text-amber-800/90">{t("overrideBody")}</p>
            <textarea
              rows={2}
              className={`${inputClass} mt-3`}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder={t("overridePlaceholder")}
            />
          </div>
        ) : null}

        {error && !overrideOpen ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            <WarningCircle size={16} weight="fill" className="shrink-0" /> {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={state === "busy"}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "busy" ? t("saving") : overrideOpen ? t("saveFinanced") : t("save")}
        </button>
      </form>

      {/* ── the movements ─────────────────────────────────────────────── */}
      {entries.length === 0 ? (
        <p className="mt-5 text-sm text-char-500">{t("empty")}</p>
      ) : (
        <ul className="mt-5 divide-y divide-char-100">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span
                className={
                  entry.direction === "credit"
                    ? "w-28 text-right font-semibold text-emerald-700"
                    : "w-28 text-right font-semibold text-char-900"
                }
              >
                {entry.direction === "credit" ? "+" : "−"}
                {money(entry.amountCents)}
              </span>
              <span className="text-sm text-char-500">{t(`kinds.${entry.kind}`)}</span>
              {entry.orderReference ? (
                <span className="rounded bg-char-100 px-1.5 py-0.5 font-mono text-xs text-char-700">
                  {entry.orderReference}
                </span>
              ) : null}
              {entry.overrideReason ? (
                <span
                  className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800"
                  title={entry.overrideReason}
                >
                  {t("financedBadge")}
                </span>
              ) : null}
              {entry.note ? <span className="text-sm text-char-500">{entry.note}</span> : null}
              <span className="ml-auto text-xs text-char-400">
                {format.dateTime(new Date(entry.occurredAt), { dateStyle: "medium" })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-char-500">
        <CheckCircle size={14} className="shrink-0" />
        {t("reconcileHint")}
      </p>
    </div>
  );
}
