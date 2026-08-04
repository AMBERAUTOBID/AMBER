import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/modules/auth/model/currentUser";
import { isPlanKey, formatDepositEur } from "@/modules/plans/model/plans";
import { latestDepositFor } from "@/modules/plans/model/deposits";
import Container from "@/shared/ui/Container";
import LogoutButton from "@/modules/auth/components/LogoutButton";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth.account" });
  return { title: t("title"), robots: { index: false } };
}

/** Renders per-user, so it can never be statically cached. */
export const dynamic = "force-dynamic";

/**
 * The signed-in landing page — deliberately minimal in 2.1. Its job is to
 * prove the session end-to-end and hold the slots that 2.2 (plan/deposit)
 * and 2.4 (bids, documents) will fill. What it must NOT do is grow inline
 * features; those land as modules per ARCHITECTURE.md.
 */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentUser();
  // The real gate. The middleware never protected this; this line does.
  if (!user) redirect(locale === "en" ? "/login" : `/${locale}/login`);

  const t = await getTranslations({ locale, namespace: "Auth.account" });
  const activeKey = user.activePlanKey && isPlanKey(user.activePlanKey) ? user.activePlanKey : null;
  // Only interesting while nothing is active — once a plan is live, the plan
  // itself is the answer and the request that produced it is history.
  const pending = activeKey ? null : await latestDepositFor(user.id);

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
          {t("greeting", { name: user.name })}
        </h1>
        <p className="mt-2 text-sm text-char-600">{user.email}</p>

        <div className="mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
            {t("planHeading")}
          </h2>

          {activeKey ? (
            <p className="mt-2 text-lg font-semibold text-char-900">{t(`plans.${activeKey}`)}</p>
          ) : pending && pending.status === "pending" ? (
            <div className="mt-2 space-y-2">
              <p className="text-lg font-semibold text-char-900">
                {t("pendingPlan", { plan: t(`plans.${pending.planKey}`) })}
              </p>
              <p className="text-sm leading-relaxed text-char-600">
                {t("pendingHint", { amount: formatDepositEur(pending.amountCents) })}
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              <p className="text-lg font-semibold text-char-900">{t("noPlan")}</p>
              <p className="text-sm leading-relaxed text-char-600">{t("noPlanHint")}</p>
              <Link
                href="/plans"
                className="inline-flex items-center rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
              >
                {t("viewPlans")}
              </Link>
            </div>
          )}
        </div>

        {user.role === "admin" && (
          <Link
            href="/admin"
            className="mt-6 inline-flex items-center rounded-full border border-char-200 bg-white px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
          >
            {t("adminConsole")}
          </Link>
        )}

        <div className="mt-8">
          <LogoutButton />
        </div>
      </div>
    </Container>
  );
}
