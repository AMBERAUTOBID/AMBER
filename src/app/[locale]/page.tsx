import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Container from "@/components/Container";
import Reveal from "@/components/Reveal";
import Button from "@/components/Button";
import SectionHeading from "@/components/SectionHeading";
import SearchWidget from "@/components/SearchWidget";
import CostCalculator from "@/components/CostCalculator";
import Marquee from "@/components/Marquee";
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
          <Image
            src="/images/hero-bmw-m4.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-char-950/85 via-char-950/70 to-char-950/90" />
        </div>

        <Container className="relative py-20 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
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

          <Reveal delay={0.15} className="mx-auto mt-12 max-w-3xl">
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
                typePlaceholder: tSearch("widget.typePlaceholder"),
                modelPlaceholder: tSearch("widget.modelPlaceholder"),
                searchFilterPlaceholder: tSearch("widget.searchFilterPlaceholder"),
                odometer: tSearch("widget.odometer"),
                odometerReset: tSearch("widget.odometerReset"),
              }}
            />
          </Reveal>

          <Reveal delay={0.2} className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-3">
            {trustChips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-char-200"
              >
                <CheckCircle size={14} weight="fill" className="text-amber-500" />
                {chip}
              </span>
            ))}
          </Reveal>
        </Container>
      </section>

      {/* Cost calculator */}
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
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-500 group-hover:text-white">
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
                    <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 font-[family-name:var(--font-heading)] text-sm font-extrabold text-white ring-4 ring-background">
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

      {/* Why AmberAutoBid */}
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
