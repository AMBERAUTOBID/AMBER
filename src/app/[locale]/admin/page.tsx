import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { activeClients } from "@/modules/admin/model/clients";
import { listUsers, erasedUserCount } from "@/modules/admin/model/users";
import { getMaintenanceState } from "@/modules/admin/model/maintenance";
import MaintenancePanel from "@/modules/admin/components/MaintenancePanel";
import { pendingDeposits } from "@/modules/plans/model/deposits";
import { PLAN_KEYS } from "@/modules/plans/model/plans";
import AdminSection from "@/modules/admin/components/AdminSection";
import DepositQueue from "@/modules/admin/components/DepositQueue";
import ActiveClients from "@/modules/admin/components/ActiveClients";
import UsersTable from "@/modules/admin/components/UsersTable";
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
export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  // Reading searchParams normally costs a page its static generation; this
  // one is already force-dynamic (it renders per admin), so the users search
  // is free here in a way it would not be on a marketing page.
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentAdmin();
  if (!user) notFound();

  const rawQuery = (await searchParams).q;
  const query = typeof rawQuery === "string" ? rawQuery : "";

  const t = await getTranslations({ locale, namespace: "Admin" });
  const tPlans = await getTranslations({ locale, namespace: "Plans" });

  // Resolved once here and handed to both lists, so tier names have exactly
  // one source (Plans.tiers) instead of the parallel Admin.tiers copy these
  // components used to read — which was free to drift from the plans page.
  const planNames = Object.fromEntries(
    PLAN_KEYS.map((key) => [key, tPlans(`tiers.${key}.name`)])
  );

  const [queue, clients, maintenance, users, erased] = await Promise.all([
    pendingDeposits(),
    activeClients(),
    getMaintenanceState(),
    listUsers(query),
    erasedUserCount(),
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

          {/* Count is of LIVE accounts; erased ones are reported below the
              table rather than listed, since nothing of them remains to act
              on. This section absorbed the old find-by-email erase panel —
              one place to delete a user, not two. */}
          <AdminSection title={t("users.heading")} count={users.total}>
            {/* A plain GET form: no client component, no JavaScript, and the
                search survives a reload and can be linked to. */}
            <form method="get" className="mb-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder={t("users.searchPlaceholder")}
                aria-label={t("users.searchPlaceholder")}
                className="w-full rounded-xl border border-char-200 bg-char-50 px-4 py-3 text-sm text-char-900 outline-none transition-colors placeholder:text-char-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full border border-char-200 bg-white px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
              >
                {t("users.search")}
              </button>
              {query && (
                <a
                  href="?"
                  className="inline-flex shrink-0 items-center text-sm font-semibold text-char-600 underline-offset-4 hover:underline"
                >
                  {t("users.clear")}
                </a>
              )}
            </form>

            <UsersTable
              planNames={planNames}
              rows={users.rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
            />

            {/* Says plainly what is not on screen, rather than letting a
                truncated list read as the whole picture. */}
            {users.total > users.rows.length && (
              <p className="mt-4 text-xs text-char-500">
                {t("users.truncated", { shown: users.rows.length, total: users.total })}
              </p>
            )}
            {erased > 0 && (
              <p className="mt-2 text-xs text-char-500">{t("users.erasedNote", { count: erased })}</p>
            )}
          </AdminSection>

          <AdminSection title={t("maintenance.heading")}>
            <MaintenancePanel initiallyOn={maintenance.on} />
          </AdminSection>
        </div>
      </div>
    </Container>
  );
}
