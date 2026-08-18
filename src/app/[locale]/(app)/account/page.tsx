import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/modules/account/model/requireUser";
import { planStatusFor } from "@/modules/account/model/planStatus";
import { formatUsd } from "@/modules/plans/model/plans";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Account" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * The landing page of the account area: where do I stand, and what is the
 * one thing to do next.
 *
 * Deliberately thin. Everything actionable lives in its own section with its
 * own URL — this page summarises and points. It does NOT grow a widget per
 * feature; when bids and orders arrive (2.3/2.4) they get sidebar entries,
 * and at most a line here.
 */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The gate. The layout's identical call is for the shell's benefit; this
  // one is the check. See requireUser.
  const user = await requireUser(locale, "/account");

  const t = await getTranslations({ locale, namespace: "Account" });
  // Tier names come from Plans.tiers, the same strings the public plans page
  // shows — the account area does not keep its own copy of them to drift.
  const tPlans = await getTranslations({ locale, namespace: "Plans" });
  const status = await planStatusFor(user);

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("greeting", { name: user.name.trim().split(/\s+/)[0] })}
      </h1>

      <div className="mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("planHeading")}
        </h2>

        {status.active ? (
          <div className="mt-2 space-y-3">
            <p className="text-lg font-semibold text-char-900">
              {tPlans(`tiers.${status.active}.name`)}
            </p>
            {status.pending && (
              <p className="text-sm leading-relaxed text-char-600">
                {t("pendingUpgrade", { plan: tPlans(`tiers.${status.pending.planKey}.name`) })}
              </p>
            )}
            <SectionLink href="/account/plan" label={t("managePlan")} />
          </div>
        ) : status.pending ? (
          <div className="mt-2 space-y-3">
            <p className="text-lg font-semibold text-char-900">
              {t("pendingPlan", { plan: tPlans(`tiers.${status.pending.planKey}.name`) })}
            </p>
            <p className="text-sm leading-relaxed text-char-600">
              {/* A free plan has no deposit to wait for, and saying "once your
                  $0 deposit arrives" states something that will never happen.
                  Invariant #5: absent, not zero. */}
              {status.pending.amountCents > 0
                ? t("pendingHint", { amount: formatUsd(status.pending.amountCents) })
                : t("pendingHintNoDeposit")}
            </p>
            <SectionLink href="/account/plan" label={t("managePlan")} />
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-lg font-semibold text-char-900">{t("noPlan")}</p>
            <p className="text-sm leading-relaxed text-char-600">{t("noPlanHint")}</p>
            <Link
              href="/plans"
              className="inline-flex items-center rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
            >
              {t("viewPlans")}
            </Link>
          </div>
        )}
      </div>

      {/* No "recent activity" panel. There is no activity to show until bid
          requests land in 2.3, and an empty panel that says "nothing yet"
          just advertises a missing feature. It arrives with its data. */}
    </div>
  );
}

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex text-sm font-semibold text-amber-700 underline-offset-4 hover:underline"
    >
      {label}
    </Link>
  );
}
