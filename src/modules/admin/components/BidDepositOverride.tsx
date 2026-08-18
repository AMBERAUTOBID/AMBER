"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldWarning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { formatUsd } from "@/modules/plans/model/plans";
import { depositOverrideNeedsPassword } from "@/modules/bids/model/bidDeposit";

type State = "idle" | "busy" | "invalid_password" | "rate_limited" | "error";

/**
 * Changing the security deposit on one bid instruction.
 *
 * ── TWO CONTROLS, BECAUSE THERE ARE TWO DIFFERENT FAILURES ──────────────
 * **The password** stops the wrong *person*: a borrowed laptop, a session left
 * open, a stolen cookie. It is asked for only when the deposit goes DOWN —
 * that is the direction that increases our exposure. Raising a deposit is
 * somebody being careful and costs them nothing, and a password demanded on
 * every change is a password typed without reading the screen, which is the
 * failure it was there to prevent.
 *
 * **The amount confirmation** stops the wrong *number*, which the password
 * cannot: someone who knows their own password types it just as quickly for
 * $50,000 as for $5,000, and a missing zero is the likeliest expensive mistake
 * anybody here will make. So the change is restated at a size that cannot be
 * skimmed, the direction is named in words, and the confirm button carries the
 * figure — a button labelled with the amount gets read; one labelled "Save"
 * does not.
 *
 * Same shape as MaintenancePanel, deliberately: 403 means the password was
 * wrong, 429 means too many attempts. Both are the admin's own password
 * checked against their own row — never a shared secret.
 */
export default function BidDepositOverride({
  requestId,
  defaultCents,
  currentCents,
}: {
  requestId: string;
  /** What the rule computed. The baseline an override is measured against. */
  defaultCents: number;
  /** What is currently being asked of the client. */
  currentCents: number;
}) {
  const t = useTranslations("AdminBids.deposit");
  const [amount, setAmount] = useState(String(Math.round(currentCents / 100)));
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>("idle");

  const parsed = Number(amount.replace(/[^0-9]/g, ""));
  const proposedCents = Number.isFinite(parsed) ? parsed * 100 : 0;
  const changed = proposedCents !== currentCents;
  const needsPassword = depositOverrideNeedsPassword(defaultCents, proposedCents);
  // Against the CURRENT figure, not the default — that is the change actually
  // being made, and it is what the admin is about to be accountable for.
  const delta = proposedCents - currentCents;

  async function submit() {
    setState("busy");
    try {
      const res = await fetch("/api/admin/bids/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          depositCents: proposedCents,
          ...(needsPassword ? { password } : {}),
        }),
      });
      if (res.ok) {
        // Reloaded rather than patched in place: the override changes the row,
        // the audit trail and whether the request can be accepted at all, and
        // re-reading is the only way to be sure all three agree.
        window.location.reload();
        return;
      }
      setState(res.status === 403 ? "invalid_password" : res.status === 429 ? "rate_limited" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border border-char-200/70 bg-white p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-char-500">
        {t("heading")}
      </h3>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-char-500">{t("ruleSays")}</dt>
          <dd className="font-semibold text-char-900">
            {defaultCents > 0 ? formatUsd(defaultCents) : t("none")}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-char-500">{t("currently")}</dt>
          <dd className="font-semibold text-char-900">
            {currentCents > 0 ? formatUsd(currentCents) : t("none")}
          </dd>
        </div>
      </dl>

      <label
        htmlFor="bid-deposit-amount"
        className="mt-5 block text-xs font-semibold uppercase tracking-wider text-char-500"
      >
        {t("newAmount")}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-lg font-bold text-char-500">$</span>
        <input
          id="bid-deposit-amount"
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-40 rounded-xl border border-char-200 bg-char-50 px-4 py-2.5 text-lg font-bold tabular-nums text-char-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
        />
      </div>

      {/* THE AMOUNT CONFIRMATION. Only once something actually changed —
          restating an unchanged figure trains people to ignore the box. */}
      {changed && (
        <div
          className={
            needsPassword
              ? "mt-5 rounded-xl border-2 border-red-300 bg-red-50/70 p-5"
              : "mt-5 rounded-xl border border-char-200 bg-char-50 p-5"
          }
        >
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-char-600">
            {needsPassword && <ShieldWarning size={15} weight="fill" className="text-red-600" />}
            {needsPassword ? t("confirmReduce") : t("confirmRaise")}
          </p>

          {/* Large, tabular, and the two figures side by side. A number this
              size is read; a number in a sentence is skimmed. */}
          <p className="mt-3 flex flex-wrap items-baseline gap-3 font-[family-name:var(--font-heading)] tabular-nums">
            <span className="text-2xl font-bold text-char-500 line-through">
              {currentCents > 0 ? formatUsd(currentCents) : t("none")}
            </span>
            <span className="text-char-500">→</span>
            <span
              className={
                needsPassword
                  ? "text-4xl font-extrabold tracking-tight text-red-700"
                  : "text-4xl font-extrabold tracking-tight text-char-900"
              }
            >
              {proposedCents > 0 ? formatUsd(proposedCents) : t("none")}
            </span>
          </p>

          {/* The direction, named. "Risk increases by $1,200" is a different
              sentence from "deposit changed", and it is the true one. */}
          <p className="mt-2 text-sm font-semibold leading-relaxed text-char-700">
            {delta < 0
              ? t("riskUp", { amount: formatUsd(Math.abs(delta)) })
              : t("riskDown", { amount: formatUsd(delta) })}
          </p>

          {needsPassword && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-char-700">{t("passwordWhy")}</p>
              <label
                htmlFor="bid-deposit-password"
                className="mt-4 block text-xs font-semibold uppercase tracking-wider text-char-500"
              >
                {t("passwordLabel")}
              </label>
              <input
                id="bid-deposit-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full max-w-xs rounded-xl border border-char-200 bg-white px-4 py-2.5 text-sm text-char-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={state === "busy" || (needsPassword && password.length === 0)}
              className={
                needsPassword
                  ? "rounded-full bg-red-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  : "rounded-full bg-amber-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              }
            >
              {/* The figure is IN the label. A button that says "Save" is
                  pressed without looking; one that says the amount is not. */}
              {state === "busy"
                ? t("saving")
                : proposedCents === 0
                  ? t("confirmWaive")
                  : t("confirmSet", { amount: formatUsd(proposedCents) })}
            </button>
            <button
              type="button"
              onClick={() => {
                setAmount(String(Math.round(currentCents / 100)));
                setPassword("");
                setState("idle");
              }}
              disabled={state === "busy"}
              className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {state !== "idle" && state !== "busy" && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <WarningCircle size={16} weight="fill" className="shrink-0 text-red-600" />
          {state === "invalid_password"
            ? t("wrongPassword")
            : state === "rate_limited"
              ? t("tooMany")
              : t("failed")}
        </p>
      )}
    </div>
  );
}
