import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { getMaintenanceState } from "@/modules/admin/model/maintenance";
import AdminSection from "@/modules/admin/components/AdminSection";
import MaintenancePanel from "@/modules/admin/components/MaintenancePanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("settings.heading"), robots: { index: false } };
}

/**
 * Switches that change how the site behaves, rather than data about anyone.
 *
 * Maintenance mode is the only one today. It moved off the front page on
 * purpose: it is the most destructive control in the console — it takes the
 * public site down — and it had been sitting one scroll below a list an admin
 * visits several times a day. Controls that stop the business belong somewhere
 * you arrive deliberately.
 */
export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentAdmin();
  if (!user) notFound();

  const t = await getTranslations({ locale, namespace: "Admin" });
  const maintenance = await getMaintenanceState();

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("settings.heading")}
      </h1>

      <div className="mt-8">
        <AdminSection title={t("maintenance.heading")}>
          <MaintenancePanel initiallyOn={maintenance.on} />
        </AdminSection>
      </div>
    </div>
  );
}
