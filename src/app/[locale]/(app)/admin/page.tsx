import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CurrencyDollar, Users, UserCheck } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { adminOverview } from "@/modules/admin/model/overview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * The console's front page: what needs attention, and how to get to it.
 *
 * Three counts rather than three lists. The point of a front page in a staff
 * tool is to answer "is there anything for me right now" in one glance —
 * repeating the deposit queue here would just mean two places to confirm a
 * deposit from, and two places to keep in step.
 *
 * Pending deposits is the only figure that is ever *urgent*, so it is the only
 * one that changes colour when non-zero. If everything were highlighted,
 * nothing would be.
 */
export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentAdmin();
  if (!user) notFound();

  const t = await getTranslations({ locale, namespace: "Admin" });
  const counts = await adminOverview();

  const cards = [
    {
      href: "/admin/deposits" as const,
      label: t("queueHeading"),
      value: counts.pendingDeposits,
      Icon: CurrencyDollar,
      urgent: counts.pendingDeposits > 0,
    },
    {
      href: "/admin/deposits" as const,
      label: t("clientsHeading"),
      value: counts.activeClients,
      Icon: UserCheck,
      urgent: false,
    },
    {
      href: "/admin/users" as const,
      label: t("users.heading"),
      value: counts.users,
      Icon: Users,
      urgent: false,
    },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("overview.heading")}
      </h1>
      <p className="mt-2 text-sm text-char-600">{t("subtitle")}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {cards.map(({ href, label, value, Icon, urgent }) => (
          <Link
            key={label}
            href={href}
            className="rounded-2xl border border-char-200/70 bg-white p-5 transition-colors hover:border-amber-400"
          >
            <Icon
              size={20}
              weight="fill"
              className={urgent ? "text-amber-600" : "text-char-300"}
            />
            <p
              className={`mt-3 text-3xl font-extrabold tracking-tight ${
                urgent ? "text-amber-700" : "text-char-900"
              }`}
            >
              {value}
            </p>
            <p className="mt-1 text-sm text-char-600">{label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
