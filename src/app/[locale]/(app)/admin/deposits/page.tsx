import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { activeClients } from "@/modules/admin/model/clients";
import { pendingDeposits, refundRequests } from "@/modules/plans/model/deposits";
import { PLAN_KEYS } from "@/modules/plans/model/plans";
import AdminSection from "@/modules/admin/components/AdminSection";
import DepositQueue from "@/modules/admin/components/DepositQueue";
import RefundQueue from "@/modules/admin/components/RefundQueue";
import ActiveClients from "@/modules/admin/components/ActiveClients";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("queueHeading"), robots: { index: false } };
}

/**
 * Money: what is waiting for a decision, and who is on a plan because of one.
 *
 * These two stay on one page rather than becoming two sidebar entries, because
 * they are one workflow read top to bottom — confirming a deposit moves a
 * person from the first list into the second, and the refund button in the
 * second undoes exactly that. Splitting them would hide the consequence of the
 * button you just pressed behind a navigation.
 */
export default async function AdminDepositsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentAdmin();
  if (!user) notFound();

  const t = await getTranslations({ locale, namespace: "Admin" });
  const tPlans = await getTranslations({ locale, namespace: "Plans" });

  // Resolved once and handed to both lists, so tier names have exactly one
  // source (Plans.tiers) rather than a parallel Admin.tiers copy free to drift.
  const planNames = Object.fromEntries(
    PLAN_KEYS.map((key) => [key, tPlans(`tiers.${key}.name`)])
  );

  const [queue, refunds, clients] = await Promise.all([
    pendingDeposits(),
    refundRequests(),
    activeClients(),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("deposits.heading")}
      </h1>

      <div className="mt-8">
        <AdminSection title={t("queueHeading")} count={queue.length}>
          <DepositQueue rows={queue} planNames={planNames} />
        </AdminSection>

        {/* Its own section, between money coming in and who is on a plan,
            because that is the order the workflow runs in — and because a
            refund and a confirmation must never sit in one list where the
            buttons do opposite things to adjacent rows. */}
        <AdminSection title={t("refundQueueHeading")} count={refunds.length}>
          <RefundQueue rows={refunds} planNames={planNames} />
        </AdminSection>

        <AdminSection title={t("clientsHeading")} count={clients.length}>
          <ActiveClients rows={clients} planNames={planNames} />
        </AdminSection>
      </div>
    </div>
  );
}
