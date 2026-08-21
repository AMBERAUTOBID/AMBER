import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Heart } from "@phosphor-icons/react/dist/ssr";
import { requireClient } from "@/modules/account/model/requireUser";
import { listFavorites } from "@/modules/favorites/model/favorites";
import FavoriteCard from "@/modules/favorites/components/FavoriteCard";
import { isPlanKey } from "@/modules/plans/model/plans";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Favorites" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * Cars the client has saved.
 *
 * Renders entirely from stored snapshots — **zero calls to Apibara**, however
 * many entries there are. That is the whole reason the favourites table is
 * denormalised: the alternative is one upstream request per row on every page
 * view, against a quota the Telegram bot shares and an API that throws
 * intermittent 502s, on a page that would get slower the more a client used
 * it.
 *
 * Losing a plan makes this read-only, not inaccessible: the list still opens
 * and rows can still be removed. Only saving and refreshing need a plan,
 * because those are the actions that spend something.
 */
export default async function AccountFavoritesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireClient(locale, "/account/favorites");

  const t = await getTranslations({ locale, namespace: "Favorites" });
  const favorites = await listFavorites(user.id);
  const hasPlan = Boolean(user.activePlanKey && isPlanKey(user.activePlanKey));

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-char-600">{t("intro")}</p>

      {/* Shown only when it changes what they can do. Someone with a plan
          doesn't need to be told they have one. */}
      {!hasPlan && (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm leading-relaxed text-char-700">
          {t.rich("readOnly", {
            plans: (chunks) => (
              <Link
                href="/plans"
                className="font-semibold text-amber-700 underline-offset-4 hover:underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}

      {favorites.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-char-200/70 bg-white p-8 text-center dark:bg-char-100/5">
          <Heart size={28} className="mx-auto text-char-300" />
          <p className="mt-3 text-lg font-semibold text-char-900">{t("emptyTitle")}</p>
          <p className="mt-2 text-sm leading-relaxed text-char-600">{t("emptyHint")}</p>
          <Link
            href="/search"
            className="mt-5 inline-flex items-center rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
          >
            {t("browse")}
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {favorites.map((f) => (
            <FavoriteCard
              key={f.id}
              canRefresh={hasPlan}
              // Dates become ISO strings at the boundary: Date objects don't
              // survive serialization to a client component intact.
              favorite={{
                id: f.id,
                platform: f.platform,
                lotNumber: f.lotNumber,
                vin: f.vin,
                title: f.title,
                imageUrl: f.imageUrl,
                priceUsdCents: f.priceUsdCents,
                auctionAt: f.auctionAt?.toISOString() ?? null,
                refreshedAt: f.refreshedAt?.toISOString() ?? null,
                createdAt: f.createdAt.toISOString(),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
