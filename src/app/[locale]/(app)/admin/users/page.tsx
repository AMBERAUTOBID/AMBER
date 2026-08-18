import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { listUsers, erasedUserCount } from "@/modules/admin/model/users";
import { PLAN_KEYS } from "@/modules/plans/model/plans";
import UsersTable from "@/modules/admin/components/UsersTable";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("users.heading"), robots: { index: false } };
}

/**
 * Every registered account, searchable, with erase as the only action.
 *
 * Still no way to change a role anywhere on this page — admin is granted by
 * CLI only (`scripts/makeAdmin.mjs`), so a stolen admin session cannot mint
 * more admins. That is a security decision, not an omission.
 */
export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  // Reading searchParams normally costs a page its static generation; this one
  // is inside the `(app)` group, which is already force-dynamic because it
  // renders per user, so the search is free here in a way it would not be on a
  // marketing page.
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
  const planNames = Object.fromEntries(
    PLAN_KEYS.map((key) => [key, tPlans(`tiers.${key}.name`)])
  );

  const [users, erased] = await Promise.all([listUsers(query), erasedUserCount()]);

  return (
    <div className="max-w-2xl">
      <h1 className="flex items-baseline gap-3 font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("users.heading")}
        <span className="rounded-full bg-char-100 px-2.5 py-1 text-xs font-semibold text-char-700">
          {users.total}
        </span>
      </h1>

      {/* A plain GET form: no client component, no JavaScript, and the search
          survives a reload and can be linked to. */}
      <form method="get" className="mt-8 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t("users.searchPlaceholder")}
          aria-label={t("users.searchPlaceholder")}
          className="w-full rounded-xl border border-char-200 bg-char-50 px-4 py-3 text-sm text-char-900 outline-none transition-colors placeholder:text-char-500 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
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

      <div className="mt-6">
        <UsersTable
          planNames={planNames}
          rows={users.rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        />
      </div>

      {/* Says plainly what is not on screen, rather than letting a truncated
          list read as the whole picture. */}
      {users.total > users.rows.length && (
        <p className="mt-4 text-xs text-char-500">
          {t("users.truncated", { shown: users.rows.length, total: users.total })}
        </p>
      )}
      {erased > 0 && (
        <p className="mt-2 text-xs text-char-500">{t("users.erasedNote", { count: erased })}</p>
      )}
    </div>
  );
}
