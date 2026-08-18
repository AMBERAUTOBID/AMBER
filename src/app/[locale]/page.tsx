import Image from "next/image";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import LotCard from "@/modules/inventory/components/LotCard";
import LotCountdown from "@/modules/inventory/components/LotCountdown";
import LotRail from "@/modules/inventory/components/LotRail";
import { getAuctionSource } from "@/modules/inventory/api";
import { ownSaleInstant } from "@/modules/inventory/model/saleInstant";
import { isUsaBuiltVin } from "@/modules/pricing/model/costEstimate";
import {
  SHOWCASE_QUERIES,
  SHOWCASE_LIMIT,
  pickShowcase,
  showcaseWindow,
} from "@/modules/inventory/model/showcase";
import Container from "@/shared/ui/Container";
import Reveal from "@/shared/ui/Reveal";
import Button from "@/shared/ui/Button";
import SectionHeading from "@/shared/ui/SectionHeading";
import SearchWidget from "@/modules/inventory/components/SearchWidget";
import CostCalculator from "@/modules/pricing/components/CostCalculator";
import Marquee from "@/shared/ui/Marquee";
import HeroGallery from "@/shared/ui/HeroGallery";
import {
  Gavel,
  FileText,
  ShippingContainer,
  ShieldCheck,
  ClockCountdown,
  Globe,
  Handshake,
  Key,
  HeartStraight,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";

const SERVICE_ICONS = [Gavel, FileText, ShippingContainer];
const WHY_ICONS = [ShieldCheck, ClockCountdown, Globe, Handshake, Key, HeartStraight];

const HERO_IMAGES = [
  "/images/hero-gallery-truck.jpg",
  "/images/hero-gallery-mustang.jpg",
  "/images/hero-gallery-yard.jpg",
  "/images/hero-gallery-cybertruck.jpg",
  "/images/hero-gallery-corvette.jpg",
  "/images/hero-gallery-durango.jpg",
  "/images/hero-gallery-rangerover.jpg",
];

/**
 * Six hours.
 *
 * ⚠️ THIS NUMBER IS AN API BILL, not a taste. The showcase rail makes one
 * upstream call per curated query — fourteen of them — every time this page is
 * regenerated, and the Apibara plan allows 30,000 calls a month. At six hours
 * that is 14 × 4 × 30 = **1,680 a month, 6% of the budget**. At the ten minutes
 * the data cache uses elsewhere it would be ~60,000: twice the whole budget.
 *
 * ⚠️ AND SIX HOURS IS WHY THE RAIL'S WINDOW STARTS TWELVE HOURS OUT. A page
 * generated now is still being served six hours from now, so a lot that was
 * "selling this afternoon" has already gone and its countdown correctly hides
 * — leaving a card with no time on it, which reads as a broken feature rather
 * than a stale cache. See SHOWCASE_WINDOW_FROM_HOURS.
 *
 * The query count is guarded by a test in showcase.test.ts, which carries the
 * same arithmetic; change one and it will tell you about the other.
 */
export const revalidate = 21600;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const tSearch = await getTranslations("Search");

  const services = t.raw("services.items") as { title: string; desc: string }[];
  const steps = t.raw("howItWorks.steps") as { title: string; desc: string }[];
  const whyItems = t.raw("why.items") as { title: string; desc: string }[];
  const trustItems = t.raw("trust.items") as string[];
  const trustChips = t.raw("hero.trustChips") as string[];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <HeroGallery images={HERO_IMAGES} />
          {/*
            TWO SCRIMS, AND THE SECOND ONE IS THE FIX.

            The single linear wash used to run 60% → **40%** → 70%, and that 40%
            sat exactly where the headline does. Over the bright photographs in
            the rotation — the hillside, the open road — white type on it was
            close to unreadable, in the worst possible place: the first thing
            every visitor sees. Found by looking at the page rather than
            measuring it. No contrast checker catches text over a photograph,
            because there is no single background colour to measure against.

            Raising the linear wash alone would have worked and cost the
            photographs, which are the reason the hero exists at all. So the
            wash rises only a little, and a soft radial pool sits under the copy
            where the type actually is. The car stays visible at the edges.
          */}
          <div className="absolute inset-0 bg-gradient-to-b from-char-950/70 via-char-950/55 to-char-950/80" />
          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              background:
                "radial-gradient(65% 58% at 50% 40%, rgba(16,15,14,.74) 0%, rgba(16,15,14,.46) 52%, rgba(16,15,14,0) 100%)",
            }}
          />
        </div>

        <Container className="relative pt-20 pb-36 sm:pt-28 sm:pb-44">
          <Reveal className="mx-auto max-w-2xl text-center">
            {/* Solid ground, not a 15%-amber tint: over a bright photograph the tint
                and the amber type underneath it both disappeared. */}
            <span className="inline-flex items-center rounded-full bg-char-950/55 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-amber-200 ring-1 ring-amber-300/25 backdrop-blur-sm">
              {t("hero.eyebrow")}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.25rem]">
              {t("hero.title")}
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-char-200">
              {t("hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button href="/search">{t("hero.ctaPrimary")}</Button>
              <Button href="/contact" variant="ghost-light">
                {t("hero.ctaSecondary")}
              </Button>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Search widget: floats over the hero's bottom edge instead of sitting mid-image, so most of the photo stays visible */}
      <Container className="relative z-10 -mt-28 sm:-mt-32">
        <Reveal delay={0.15} className="mx-auto max-w-3xl">
          <SearchWidget
            variant="elevated"
            labels={{
              vinPlaceholder: tSearch("widget.vinPlaceholder"),
              copartToggle: tSearch("widget.copartToggle"),
              iaaiToggle: tSearch("widget.iaaiToggle"),
              searchButton: tSearch("widget.searchButton"),
              vehicleTypes: tSearch.raw("widget.vehicleTypes"),
              yearFrom: tSearch("widget.yearFrom"),
              yearTo: tSearch("widget.yearTo"),
              buyNow: tSearch("widget.buyNow"),
              browsePrompt: tSearch("widget.browsePrompt"),
              makePlaceholder: tSearch("widget.makePlaceholder"),
              showAllMakes: tSearch.raw("widget.showAllMakes") as string,
              typePlaceholder: tSearch("widget.typePlaceholder"),
              modelPlaceholder: tSearch("widget.modelPlaceholder"),
              searchFilterPlaceholder: tSearch("widget.searchFilterPlaceholder"),
              odometer: tSearch("widget.odometer"),
              odometerReset: tSearch("widget.odometerReset"),
              engine: tSearch("widget.engine"),
              engineReset: tSearch("widget.engineReset"),
              retail: tSearch("widget.retail"),
              retailReset: tSearch("widget.retailReset"),
              retailNote: tSearch("widget.retailNote"),
            }}
          />
        </Reveal>

        <Reveal delay={0.2} className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-3">
          {trustChips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-2 rounded-full border border-char-200 bg-white px-3.5 py-1.5 text-xs font-medium text-char-600 shadow-sm"
            >
              <CheckCircle size={14} weight="fill" className="text-amber-500" />
              {chip}
            </span>
          ))}
        </Reveal>
      </Container>

      {/*
        REAL CARS, DIRECTLY UNDER THE SEARCH BOX.

        The home page used to show none — 141,000 lots in the catalogue and not
        one on the page a visitor lands on. They could not answer the question
        they arrived with without clicking away first.

        Streamed rather than awaited: the rail costs twelve upstream calls and
        the rest of the page owes it nothing. If they are slow, or fail, the
        page is already there.
      */}
      <Suspense fallback={<ShowcaseSkeleton />}>
        <ShowcaseRail />
      </Suspense>

      {/* The calculator and its route map follow the cars directly. A second
          "popular in Lithuania" rail sat here for a few hours and was removed:
          it pushed both of these — the two things that actually separate this
          business from a listings site — below three screens of cards. */}
      <CostCalculator />

      {/* Marquee ticker */}
      <Marquee items={trustItems} />

      {/* Services */}
      <section className="bg-char-50 py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow={t("services.eyebrow")}
            title={t("services.title")}
            subtitle={t("services.subtitle")}
          />
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {services.map((service, i) => {
              const Icon = SERVICE_ICONS[i];
              return (
                <Reveal key={service.title} delay={i * 0.1}>
                  <div className="group h-full rounded-2xl border border-char-200 bg-white p-8 transition-all hover:-translate-y-1 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-900/5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-700 group-hover:text-white">
                      <Icon size={24} weight="duotone" />
                    </div>
                    <h3 className="mt-6 text-lg font-bold text-char-900">
                      {service.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-char-600">
                      {service.desc}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow={t("howItWorks.eyebrow")}
            title={t("howItWorks.title")}
            subtitle={t("howItWorks.subtitle")}
          />
          <div className="relative mt-14">
            <div
              aria-hidden
              className="absolute left-5 top-2 hidden h-[calc(100%-2.5rem)] w-px bg-char-200 sm:block lg:left-1/2"
            />
            <ol className="space-y-8 lg:space-y-0">
              {steps.map((step, i) => (
                <li
                  key={step.title}
                  className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-12"
                >
                  <Reveal
                    delay={i * 0.08}
                    className={`flex gap-5 sm:pl-0 ${
                      i % 2 === 1 ? "lg:col-start-2" : "lg:col-start-1 lg:row-start-1"
                    }`}
                  >
                    <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-600 font-[family-name:var(--font-heading)] text-sm font-extrabold text-white ring-4 ring-background">
                      {i + 1}
                    </span>
                    <div className="pb-2">
                      <h3 className="text-base font-bold text-char-900">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-char-600">
                        {step.desc}
                      </p>
                    </div>
                  </Reveal>
                  <div
                    className={
                      i % 2 === 1 ? "lg:col-start-1 lg:row-start-1" : "lg:col-start-2"
                    }
                  />
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>

      {/* Why SmartAutoBid */}
      <section className="bg-char-900 py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow={t("why.eyebrow")}
            title={t("why.title")}
            align="center"
            dark
          />
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {whyItems.map((item, i) => {
              const Icon = WHY_ICONS[i];
              return (
                <Reveal
                  key={item.title}
                  delay={i * 0.06}
                  className="rounded-2xl border border-white/10 bg-white/5 p-7"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                    <Icon size={22} weight="duotone" />
                  </div>
                  <h3 className="mt-4 font-bold text-white">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-char-300">
                    {item.desc}
                  </p>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </section>

      {/* CTA band */}
      <section className="relative overflow-hidden py-20 sm:py-24">
        <div className="absolute inset-0">
          <Image
            src="/images/transport-truck.jpg"
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-char-900/80" />
        </div>
        <Container className="relative">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {t("cta.title")}
            </h2>
            <p className="mt-4 text-lg text-char-200">{t("cta.subtitle")}</p>
            <div className="mt-8 flex justify-center">
              <Button href="/contact">{t("cta.button")}</Button>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}

/**
 * Holds the rail's height while its twelve upstream calls run, so the page
 * below does not jump once they land.
 */
function ShowcaseSkeleton() {
  return (
    <section className="py-16 sm:py-20" aria-hidden>
      <Container>
        <div className="h-4 w-40 rounded-full bg-char-100" />
        <div className="mt-3 h-7 w-80 max-w-full rounded-lg bg-char-100" />
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-char-200 bg-white">
              <div className="aspect-[4/3] w-full bg-char-100" />
              <div className="space-y-2.5 p-4">
                <div className="h-4 w-3/4 rounded-full bg-char-100" />
                <div className="h-5 w-1/2 rounded-full bg-char-100" />
                <div className="h-3 w-2/3 rounded-full bg-char-100" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/**
 * One rail of lots coming up for sale in the next week.
 *
 * WHICH CARS, AND WHY THOSE: see `modules/inventory/model/showcase.ts`. The
 * short version is that a "highest value" filter was tried first and put a
 * $10,000,000 Honda CRV, two fire trucks and a coach at the top, so the
 * selection names makes and models instead.
 *
 * Reads through `getAuctionSource()`, so it answers from the mirror where that
 * is configured and from Apibara where it is not — this component never learns
 * which. `allSettled`: one marque failing costs one card, not the section.
 */
async function ShowcaseRail() {
  const t = await getTranslations("Home.showcase");
  const tSearch = await getTranslations("Search");
  const tVehicle = await getTranslations("VehicleDetail");

  const source = getAuctionSource();
  const { from, to } = showcaseWindow();

  const settled = await Promise.allSettled(
    SHOWCASE_QUERIES.map((q) =>
      source.searchVehicles({
        make: q.make,
        model: q.model,
        sale_date_from: from,
        sale_date_to: to,
        per_page: 20,
      })
    )
  );
  const pages = settled
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof source.searchVehicles>>> =>
      r.status === "fulfilled"
    )
    .map((r) => r.value.data);

  // `spread`: one car per marque per round, so the row opens Porsche, Ferrari,
  // Lamborghini… rather than four Porsches. See pickShowcase.
  const lots = pickShowcase(pages, { limit: SHOWCASE_LIMIT, spread: true });
  // An empty rail renders nothing at all rather than a heading over a gap.
  // Better a shorter page than a section that promises cars and shows none.
  if (lots.length === 0) return null;

  const countdownLabels = {
    dayShort: tVehicle("auction.dayShort"),
    hourShort: tVehicle("auction.hourShort"),
    minuteShort: tVehicle("auction.minuteShort"),
    secondShort: tVehicle("auction.secondShort"),
  };

  return (
    <section className="py-16 sm:py-20">
      <Container>
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
              {t("eyebrow")}
            </span>
            <h2 className="mt-3 font-[family-name:var(--font-heading)] text-2xl font-extrabold tracking-tight text-char-900 sm:text-3xl">
              {t("title")}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-char-600">{t("subtitle")}</p>
          </div>
          <Link
            href="/search"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-char-200 bg-white px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
          >
            {t("seeAll")}
          </Link>
        </Reveal>

      </Container>

      {/*
        FULL BLEED, DELIBERATELY OUTSIDE THE CONTAINER.

        Inside `max-w-7xl` the row stopped dead at 1280px with white either
        side, which framed it like a picture and made a scroller look like a
        finished grid that happened to be cut off. A rail should run off the
        edge of the screen — that is what says "there is more this way".

        ⚠️ THE LEFT PADDING IS THE WHOLE TRICK, and it is `100%`, never `100vw`.
        Percentages here resolve against this block's own width, which already
        excludes the scrollbar; `100vw` does not, and the first card would sit
        8–17px out of line with the heading above it on every desktop that shows
        one. `max()` keeps the ordinary gutter on anything narrower than the
        container, so phones and small laptops are unaffected.

        ⚠️ THE RIGHT SIDE GETS A PLAIN GUTTER, NOT THE SAME FORMULA. Matching
        both sides re-framed the row — measured at 1920px it stopped at 1561
        with 359px of white beyond it, which is the picture-frame look this
        change exists to remove. The row starts on the grid and runs off the
        screen, which is what tells a reader it continues.
      */}
      <div
        className="mt-8"
        style={{
          paddingLeft: "max(1.25rem, calc((100% - 80rem) / 2 + 2rem))",
          paddingRight: "1.25rem",
        }}
      >
        {/* One row, scrolled sideways — see LotRail. Each card is given a fixed
            width and told not to shrink, which is what turns a flex row into a
            rail rather than fourteen slivers. */}
        <Reveal delay={0.05}>
          <LotRail labels={{ previous: t("scrollPrevious"), next: t("scrollNext") }}>
            {lots.map((v) => (
              <div key={`${v.platform}-${v.lot_number}`} className="w-[17rem] shrink-0 snap-start">
            <LotCard
              vehicle={v}
              labels={{
                noPhoto: tSearch("results.noPhoto"),
                priceNA: tSearch("results.priceNA"),
                damagePrefix: tSearch("results.damagePrefix"),
                currentBid: tSearch("results.currentBid"),
                buyNow: tSearch("results.buyNow"),
                madeInUsa: tSearch("results.madeInUsa"),
              }}
              // The same VIN rule the duty waiver uses, imported rather than
              // restated — see the note on LotCard's `usaMade`.
              usaMade={isUsaBuiltVin(v.vin)}
              countdownSlot={(() => {
                // Only where the sale instant is this lot's own. Apibara's list
                // responses batch-stamp `state`/`diff_minutes` across a whole
                // page, and ownSaleInstant refuses those rows — so on the live
                // aggregator these cards carry no countdown, deliberately, and
                // gain one the day the mirror becomes the search source.
                    const at = ownSaleInstant(v);
                    return at ? <LotCountdown iso={at} labels={countdownLabels} /> : null;
                  })()}
                />
              </div>
            ))}
          </LotRail>
        </Reveal>
      </div>
    </section>
  );
}
