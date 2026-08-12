import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Container from "@/shared/ui/Container";
import Reveal from "@/shared/ui/Reveal";
import Button from "@/shared/ui/Button";
import { Link } from "@/i18n/navigation";
import { Garage, CheckCircle, ChatCircleDots, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

const PROMISE_ICONS = [CheckCircle, Garage, ChatCircleDots];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Offers" });
  /**
   * NOINDEX WHILE THE SHELF IS EMPTY, and this is half a decision on its own —
   * `src/app/sitemap.ts` deliberately does not list `/offers` either. The two
   * files have to agree (ARCHITECTURE.md §6c). Google's first impression of a
   * page is the one it caches, and a stock page with no stock is not the page
   * we want cached. **Flip both the moment the first car is listed.**
   */
  return { title: t("hero.title"), robots: { index: false } };
}

/**
 * Cars SmartAutoBid has already bought at auction and now sells outright.
 *
 * Deliberately a static, empty page for now: nothing has been bought yet, and
 * the owner asked for the section to exist before the stock does so the place
 * in the navigation is settled. When the first car lands, this page grows a
 * data source and the admin gains an upload screen; nothing here presumes what
 * that schema looks like, so it costs nothing to have shipped early.
 *
 * The empty state says "none right now" rather than "coming soon". They are
 * different promises — one is a fact about today that stops being true the day
 * we buy a car, the other is a commitment with no date attached.
 */
export default async function OffersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Offers");

  const promises = t.raw("promises.items") as { title: string; desc: string }[];

  return (
    <>
      <section className="bg-gradient-to-b from-amber-50/60 via-background to-background py-16 sm:py-20">
        <Container>
          <Reveal className="max-w-2xl">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
              {t("hero.eyebrow")}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-char-900 sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-char-600">{t("hero.subtitle")}</p>
          </Reveal>
        </Container>
      </section>

      <section className="pb-20">
        <Container>
          {/* The stock itself will replace this block. Until then the page is
              honest about being empty and hands the visitor the two things
              they can actually do today. */}
          <Reveal className="flex flex-col items-center gap-4 rounded-2xl border border-char-200 bg-char-50 px-6 py-16 text-center">
            <Garage size={34} className="text-char-300" weight="duotone" />
            <h2 className="text-xl font-bold text-char-900">{t("empty.title")}</h2>
            <p className="max-w-xl text-char-600">{t("empty.body")}</p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/search"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-amber-900/20 transition-colors hover:bg-amber-600"
              >
                <MagnifyingGlass size={16} weight="bold" />
                {t("empty.searchCta")}
              </Link>
              <Button href="/contact" variant="secondary">
                {t("empty.contactCta")}
              </Button>
            </div>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {promises.map((item, i) => {
              const Icon = PROMISE_ICONS[i] ?? CheckCircle;
              return (
                <Reveal
                  key={item.title}
                  delay={0.05 * i}
                  className="rounded-2xl border border-char-200 bg-white p-6"
                >
                  <Icon size={26} weight="duotone" className="text-amber-500" />
                  <h3 className="mt-4 font-bold text-char-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-char-600">{item.desc}</p>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </section>
    </>
  );
}
