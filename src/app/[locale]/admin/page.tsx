import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { activeClients } from "@/modules/admin/model/clients";
import { getMaintenanceState } from "@/modules/admin/model/maintenance";
import MaintenancePanel from "@/modules/admin/components/MaintenancePanel";
import { pendingDeposits } from "@/modules/plans/model/deposits";
import { PLAN_KEYS } from "@/modules/plans/model/plans";
import AdminSection from "@/modules/admin/components/AdminSection";
import DepositQueue from "@/modules/admin/components/DepositQueue";
import ActiveClients from "@/modules/admin/components/ActiveClients";
import DeleteUserPanel from "@/modules/admin/components/DeleteUserPanel";
import Container from "@/shared/ui/Container";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("title"), robots: { index: false } };
}

export const dynamic = "force-dynamic";

/**
 * The admin console: requests waiting, and clients already on a plan.
 *
 * Structured as a list of `AdminSection`s rather than a bespoke page, because
 * this is going to grow — a searchable users view, bid requests (2.3), orders
 * (2.4). Adding one should mean adding a section, not rewriting the page.
 *
 * Authorization goes through `currentAdmin()`, which is now the single place
 * the admin check lives; the API route calls the same function. Non-admins
 * get a 404 rather than a redirect or a 403 — see that file for why.
 */
export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentAdmin();
  if (!user) notFound();

  const t = await getTranslations({ locale, namespace: "Admin" });
  const tPlans = await getTranslations({ locale, namespace: "Plans" });

  // Resolved once here and handed to both lists, so tier names have exactly
  // one source (Plans.tiers) instead of the parallel Admin.tiers copy these
  // components used to read — which was free to drift from the plans page.
  const planNames = Object.fromEntries(
    PLAN_KEYS.map((key) => [key, tPlans(`tiers.${key}.name`)])
  );

  const [queue, clients, maintenance] = await Promise.all([
    pendingDeposits(),
    activeClients(),
    getMaintenanceState(),
  ]);

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-char-600">{t("subtitle")}</p>

        <div className="mt-10">
          <AdminSection title={t("queueHeading")} count={queue.length}>
            <DepositQueue rows={queue} planNames={planNames} />
          </AdminSection>

          <AdminSection title={t("clientsHeading")} count={clients.length}>
            <ActiveClients rows={clients} planNames={planNames} />
          </AdminSection>

          {/* No count: this is a tool, not a list of things needing action. */}
          <AdminSection title={t("deleteUserHeading")}>
            <DeleteUserPanel planNames={planNames} />
          </AdminSection>

          <AdminSection title={t("maintenance.heading")}>
            <MaintenancePanel initiallyOn={maintenance.on} />
          </AdminSection>
        </div>
      </div>
    </Container>
  );
}
