import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/modules/account/model/requireUser";
import { planStatusFor } from "@/modules/account/model/planStatus";
import CancelPlanRequest from "@/modules/account/components/CancelPlanRequest";
import { PLANS, formatUsd, isPlanKey } from "@/modules/plans/model/plans";
import { decidedDepositsFor } from "@/modules/plans/model/deposits";
import { planFeatureLines } from "@/modules/plans/model/planFeatures";
import { Link } from "@/i18n/navigation";
import { SITE, CONTACT_HREF } from "@/shared/config/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Account.plan" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * What the client is on, and what they've asked for.
 *
 * The plan's terms are rendered from the catalogue rather than restated here,
 * so this page shows the same limits `can()` enforces. Its own URL, rather
 * than a panel on the overview, so support can email a client a link straight
 * to it (ARCHITECTURE.md §6a).
 */
export default async function AccountPlanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, "/account/plan");

  const t = await getTranslations({ locale, namespace: "Account.plan" });
  // Feature lines are generated from the plan table and live in the Plans
  // namespace — the same strings the public plans page uses, by design.
  const tPlans = await getTranslations({ locale, namespace: "Plans" });
  const format = await getFormatter({ locale });
  const status = await planStatusFor(user);
  const history = await decidedDepositsFor(user.id);

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("title")}
      </h1>

      {status.active ? (
        <section className="mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
            {t("currentHeading")}
          </h2>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-char-900">
            {tPlans(`tiers.${status.active}.name`)}
          </p>
          <ul className="mt-5 space-y-2.5">
            {planFeatureLines(PLANS[status.active], tPlans).map((line) => (
              <li key={line} className="flex gap-2.5 text-sm leading-relaxed text-char-700">
                <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-amber-600" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-char-200/70 pt-4 text-sm leading-relaxed text-char-600">
            {t.rich("changeHint", {
              contact: (chunks) => (
                <a
                  href={CONTACT_HREF.email}
                  className="font-semibold text-amber-700 underline-offset-4 hover:underline"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </section>
      ) : null}

      {status.pending ? (
        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-800">
            {status.active ? t("pendingUpgradeHeading") : t("pendingHeading")}
          </h2>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-char-900">
            {tPlans(`tiers.${status.pending.planKey}.name`)}
          </p>
          <dl className="mt-4 space-y-1.5 text-sm text-char-700">
            <div className="flex gap-2">
              <dt className="font-medium text-char-500">{t("requestedOn")}</dt>
              <dd>{format.dateTime(status.pending.requestedAt, { dateStyle: "long" })}</dd>
            </div>
            {/* A zero-deposit plan has nothing to transfer, so the line that
                would say "$0 due" is omitted rather than shown as zero. */}
            {status.pending.amountCents > 0 && (
              <div className="flex gap-2">
                <dt className="font-medium text-char-500">{t("depositDue")}</dt>
                <dd className="font-semibold">{formatUsd(status.pending.amountCents)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-char-700">
            {/* The deposit-free tiers get their own sentence. Telling someone
                on a free plan that we're waiting for their deposit describes
                a step that doesn't exist and reads as a stalled request. */}
            {status.pending.amountCents > 0
              ? t("pendingExplainer", { email: SITE.email })
              : t("pendingExplainerNoDeposit", { email: SITE.email })}
          </p>
          <div className="mt-5 border-t border-amber-200 pt-4">
            <CancelPlanRequest depositId={status.pending.depositId} />
          </div>
        </section>
      ) : null}

      {/* Only when there is something to show. An empty "History" heading
          tells a new client nothing except that a feature exists. */}
      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
            {t("historyHeading")}
          </h2>
          <ul className="mt-4 divide-y divide-char-200/70 rounded-2xl border border-char-200/70 bg-white px-6 dark:bg-char-100/5">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3.5">
                <span className="text-sm font-semibold text-char-900">
                  {/* A plan key retired from the catalogue would have no
                      translated name; show the raw key rather than crash a
                      page whose whole job is showing what happened. */}
                  {isPlanKey(row.planKey) ? tPlans(`tiers.${row.planKey}.name`) : row.planKey}
                </span>
                <span className="text-sm text-char-600">
                  {t(`historyStatus.${row.status}`)}
                </span>
                <span className="ml-auto text-xs text-char-500">
                  {format.dateTime(row.createdAt, { dateStyle: "medium" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!status.active && !status.pending ? (
        <section className="mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5">
          <p className="text-lg font-semibold text-char-900">{t("none")}</p>
          <p className="mt-2 text-sm leading-relaxed text-char-600">{t("noneHint")}</p>
          <Link
            href="/plans"
            className="mt-4 inline-flex items-center rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
          >
            {t("choosePlan")}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
