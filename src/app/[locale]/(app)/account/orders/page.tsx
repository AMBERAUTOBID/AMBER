import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Car } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/modules/account/model/requireUser";
import { listOrdersForUser } from "@/modules/orders/model/orders";
import { orderTitle } from "@/modules/orders/model/orderSnapshot";
import { stageProgress } from "@/modules/orders/model/stages";
import StageBadge from "@/modules/orders/components/StageBadge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Orders" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * The client's own cars.
 *
 * Ships with an empty state rather than being hidden until somebody has one,
 * on the Favourites precedent: the feature works from the first visit, and an
 * empty panel that explains what will appear is more use than a missing menu
 * entry that raises a question.
 */
export default async function AccountOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, "/account/orders");

  const t = await getTranslations({ locale, namespace: "Orders" });
  const orders = await listOrdersForUser(user.id);

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-char-600">{t("subtitle")}</p>

      {orders.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-char-200/70 bg-white px-6 py-12 text-center">
          <Car size={26} className="text-char-300" />
          <p className="font-semibold text-char-900">{t("empty.heading")}</p>
          <p className="max-w-sm text-sm text-char-600">{t("empty.body")}</p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {orders.map((order) => {
            const progress = stageProgress(order.stage);
            return (
              <Link
                key={order.id}
                href={`/account/orders/${order.id}`}
                className="block rounded-2xl border border-char-200/70 bg-white p-5 transition-colors hover:border-amber-400"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-char-900">{orderTitle(order)}</p>
                    <p className="mt-0.5 font-[family-name:var(--font-mono)] text-xs text-char-500">
                      {t("reference")} {order.reference}
                    </p>
                  </div>
                  <StageBadge stage={order.stage} />
                </div>

                {/* The bar is the answer to "where is my car" before any text
                    is read, which is the question this page exists for. */}
                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-char-100">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${Math.round((progress.step / progress.total) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-char-500">{t("progress", progress)}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
