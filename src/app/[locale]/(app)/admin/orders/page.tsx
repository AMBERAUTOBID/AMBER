import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Car } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { listOrders } from "@/modules/orders/model/orders";
import { ORDER_STAGES, parseStage } from "@/modules/orders/model/stages";
import { orderTitle } from "@/modules/orders/model/orderSnapshot";
import StageBadge from "@/modules/orders/components/StageBadge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AdminOrders" });
  return { title: t("heading"), robots: { index: false } };
}

/**
 * Every case file, with a stage filter.
 *
 * The filter is a plain GET form for the same reason the users search is: it
 * survives a reload, it can be linked to and pasted into a message, and it
 * needs no JavaScript. `parseStage` validates it, because the column's enum is
 * a TypeScript constraint on `text` and a bookmarked typo would otherwise
 * reach the WHERE clause and filter to nothing with no explanation.
 */
export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stage?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentAdmin();
  if (!user) notFound();

  const raw = (await searchParams).stage;
  const stage = parseStage(typeof raw === "string" ? raw : undefined);

  const t = await getTranslations({ locale, namespace: "AdminOrders" });
  const tStage = await getTranslations({ locale, namespace: "Orders.stage" });
  const orders = await listOrders(stage ?? undefined);

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
          {t("heading")}
        </h1>
        <Link
          href="/admin/orders/new"
          className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
        >
          {t("create")}
        </Link>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-center gap-2">
        <select
          name="stage"
          defaultValue={stage ?? ""}
          className="rounded-xl border border-char-200 bg-white px-3 py-2 text-sm text-char-800"
        >
          <option value="">{t("filterAll")}</option>
          {ORDER_STAGES.map((s) => (
            <option key={s} value={s}>
              {tStage(s)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-full border border-char-200 bg-white px-4 py-2 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
        >
          {t("filterAll")}
        </button>
      </form>

      {orders.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-char-200/70 bg-white py-12 text-center">
          <Car size={26} className="text-char-300" />
          <p className="text-sm text-char-600">{t("empty")}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/admin/orders/${order.id}`}
              className="flex flex-col gap-3 rounded-2xl border border-char-200/70 bg-white p-4 transition-colors hover:border-amber-400 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-char-900">{orderTitle(order)}</p>
                <p className="mt-0.5 truncate font-[family-name:var(--font-mono)] text-xs text-char-500">
                  {order.reference} · {order.lotNumber}
                  {order.vin ? ` · ${order.vin}` : ""}
                </p>
                <p className="mt-1 truncate text-sm text-char-600">
                  {order.clientName} — {order.clientEmail}
                </p>
              </div>
              <StageBadge stage={order.stage} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
