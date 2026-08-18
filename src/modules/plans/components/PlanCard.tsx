"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Lock } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import { Link } from "@/i18n/navigation";
import { formatUsd, type Plan } from "../model/plans";
import { planFeatureLines } from "../model/planFeatures";
import type { CardState } from "../model/cardState";
import PlanConfirmDialog from "./PlanConfirmDialog";

/**
 * One tier on the plans page. Feature lines are built from the plan table,
 * not written per-card, so a limit can never say one thing here and enforce
 * another in can() — the classic way pricing pages start lying.
 *
 * Unavailable tiers stay fully readable (a customer should be able to see
 * where they're heading) but are visually recessed and offer a Contact link
 * instead of a select button. The server refuses them too; this is only the
 * polite half.
 *
 * **What a signed-in client is offered is decided on the server** and arrives
 * as `state` — see cardState.ts. The card renders the decision and never makes
 * one, which is what keeps the figure on the button equal to the figure
 * `requestPlan` writes to the deposit row.
 */
export default function PlanCard({ plan, state }: { plan: Plan; state: CardState }) {
  const t = useTranslations("Plans");
  const locale = useLocale();
  // The card no longer submits anything: it opens the confirmation dialog,
  // which owns the terms agreement and the request itself.
  const [dialogOpen, setDialogOpen] = useState(false);

  // Generated from the plan table, never written per-card — see planFeatures.
  const features = planFeatureLines(plan, t);

  const selectable = state.kind === "signed_out" || state.kind === "select" ||
    state.kind === "upgrade";
  // The difference on an upgrade, the full deposit otherwise. Undefined for
  // every state that has no button to put a price on.
  const dueCents = state.kind === "select" || state.kind === "upgrade" ? state.amountCents : null;

  function choose() {
    if (state.kind === "signed_out") {
      window.location.assign(locale === "en" ? "/register" : `/${locale}/register`);
      return;
    }
    setDialogOpen(true);
  }

  return (
    <div
      className={clsx(
        // Padding eases off at the 4-across breakpoint, where each card is
        // roughly 220px wide and every pixel of content width counts.
        "relative flex flex-col rounded-2xl border p-6 xl:p-7 transition-shadow",
        !plan.available
          ? "border-char-200/60 bg-char-50/40"
          : plan.featured
            ? "border-amber-400 bg-white shadow-lg shadow-amber-900/10"
            : "border-char-200/70 bg-white hover:shadow-md"
      )}
    >
      {/* The only badge left on an available card, and the one worth the slot:
          which tier is theirs is a fact about the reader, not about us. */}
      {plan.available && state.kind === "current" && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-char-800 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          {t("yourPlan")}
        </span>
      )}
      {/* `featured` deliberately prints NO badge — see the field's note in
          plans.ts. It survives as the amber border and filled button below,
          which is the whole of the emphasis now. */}
      {!plan.available && (
        <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-char-700 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          <Lock size={11} weight="fill" />
          {t("comingSoon")}
        </span>
      )}

      <h3
        className={clsx(
          "text-sm font-semibold uppercase tracking-wide",
          plan.available ? "text-amber-700" : "text-char-500"
        )}
      >
        {t(`tiers.${plan.key}.name`)}
      </h3>

      <p
        className={clsx(
          "mt-3 font-[family-name:var(--font-heading)] text-4xl font-extrabold tracking-tight",
          plan.available ? "text-char-900" : "text-char-500"
        )}
      >
        {plan.depositUsdCents === 0 ? t("noDeposit") : formatUsd(plan.depositUsdCents)}
      </p>
      <p className="mt-1 text-sm text-char-500">
        {plan.depositUsdCents === 0 ? t("noDepositLabel") : t("refundableDeposit")}
      </p>

      {/* The headline stays the tier's price — that is what the tier costs,
          and it is how a client compares the row. The difference goes beneath
          it as its own line, because the two numbers answer different
          questions ("what is this tier" vs "what do I transfer today") and
          collapsing them into one figure loses whichever question you didn't
          pick. */}
      {state.kind === "upgrade" && (
        <p className="mt-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
          {t("topUpFromHere", { amount: formatUsd(state.amountCents) })}
        </p>
      )}

      <p className="mt-4 text-sm leading-relaxed text-char-600">{t(`tiers.${plan.key}.tagline`)}</p>

      <ul className="mt-6 flex-1 space-y-3 border-t border-char-200/70 pt-6">
        {features.map((f) => (
          <li
            key={f}
            className={clsx(
              "flex gap-2.5 text-sm leading-relaxed",
              plan.available ? "text-char-700" : "text-char-500"
            )}
          >
            <Check
              size={17}
              weight="bold"
              className={clsx(
                "mt-0.5 shrink-0",
                plan.available ? "text-amber-600" : "text-char-500"
              )}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {plan.available ? (
        selectable ? (
          <>
            <button
              type="button"
              onClick={choose}
              className={clsx(
                "mt-7 inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-sm font-semibold transition-colors",
                plan.featured
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "border border-char-200 bg-white text-char-800 hover:border-amber-400 hover:text-amber-700"
              )}
            >
              {state.kind === "signed_out"
                ? t("chooseSignedOut")
                : state.kind === "upgrade"
                  ? t("moveUp")
                  : t("choose")}
            </button>

            {dialogOpen && (
              <PlanConfirmDialog
                plan={plan}
                // The dialog states the terms being agreed to, so it must name
                // the amount that will actually be asked for — not the tier's
                // price, when those differ.
                dueCents={dueCents ?? plan.depositUsdCents}
                topUp={state.kind === "upgrade"}
                onClose={() => setDialogOpen(false)}
              />
            )}
          </>
        ) : (
          /* Not selectable, and the card says which of the three reasons it is
             rather than showing a dead button. A disabled control with no
             explanation is the version of this that generates support email. */
          <p className="mt-7 rounded-full border border-char-200 bg-char-50 px-6 py-3.5 text-center text-sm font-semibold text-char-600">
            {state.kind === "current"
              ? t("yourPlanNote")
              : state.kind === "refund_pending"
                ? t("refundPendingNote")
                : t("lowerTierNote")}
          </p>
        )
      ) : (
        <>
          {/* Carries which tier they were looking at. Without it a Platinum
              enquiry lands in the inbox indistinguishable from any other, and
              answering it starts with "which plan did you mean?" */}
          <Link
            href={{ pathname: "/contact", query: { plan: plan.key } }}
            className="mt-7 inline-flex w-full items-center justify-center rounded-full border border-char-300 bg-white px-6 py-3.5 text-sm font-semibold text-char-700 transition-colors hover:border-amber-400 hover:text-amber-700"
          >
            {t("contactUs")}
          </Link>
          <p className="mt-3 text-xs leading-relaxed text-char-500">{t("comingSoonHint")}</p>
        </>
      )}
    </div>
  );
}
