import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Container from "@/components/Container";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import CostCalculator from "@/components/CostCalculator";
import Button from "@/components/Button";
import { Anchor, MapPin } from "@phosphor-icons/react/dist/ssr";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Shipping" });
  return { title: t("hero.title") };
}

export default async function ShippingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Shipping");

  const steps = t.raw("process.steps") as { title: string; desc: string }[];
  const usPorts = t.raw("ports.us") as string[];
  const instantPorts = t.raw("ports.euInstant") as string[];
  const requestPorts = t.raw("ports.euRequest") as string[];

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
            <p className="mt-5 text-lg leading-relaxed text-char-600">
              {t("hero.subtitle")}
            </p>
          </Reveal>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading title={t("process.title")} />
          <ol className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, i) => (
              <Reveal
                key={step.title}
                delay={i * 0.06}
                className="rounded-2xl border border-char-200 bg-white p-6"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 font-[family-name:var(--font-heading)] text-sm font-extrabold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-bold text-char-900">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-char-600">
                  {step.desc}
                </p>
              </Reveal>
            ))}
          </ol>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow={t("tracking.eyebrow")}
            title={t("tracking.title")}
            subtitle={t("tracking.subtitle")}
          />

          <Reveal
            delay={0.05}
            className="mt-8 inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-char-300 bg-white px-5 py-4 font-mono text-xs text-char-700 sm:text-sm"
          >
            <span>
              <span className="font-semibold text-amber-700">{t("tracking.sampleLot")}</span>
              {" · "}
              {t("tracking.sampleVehicle")}
            </span>
            <span className="h-4 w-px bg-char-200" aria-hidden />
            <span>
              {t("tracking.sampleAuction")} · {t("tracking.sampleOrigin")}
            </span>
          </Reveal>

          <Reveal
            delay={0.1}
            className="mt-6 max-w-2xl rounded-2xl border border-char-200 bg-white p-6 sm:p-7"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-char-400">
              {t("tracking.routeLabel")}
            </p>
            <div className="relative mt-6 h-3.5">
              <div
                className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 opacity-60"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to right, var(--color-amber-500) 0 6px, transparent 6px 12px)",
                }}
                aria-hidden
              />
              <span className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 ring-1 ring-amber-500" />
              <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 animate-route-travel rounded-full bg-char-900" />
              <span className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-harbor ring-1 ring-harbor" />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm font-medium">
              <span className="text-char-800">{t("tracking.sampleOrigin")}</span>
              <span className="text-harbor">{t("tracking.sampleDestination")}</span>
            </div>
          </Reveal>

          <Reveal
            delay={0.16}
            className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-char-700">{t("tracking.contactPrompt")}</p>
            <Button href="/contact" variant="secondary" className="shrink-0">
              {t("tracking.contactCta")}
            </Button>
          </Reveal>
        </Container>
      </section>

      <section className="bg-char-50 py-16 sm:py-20">
        <Container>
          <SectionHeading title={t("ports.title")} subtitle={t("ports.subtitle")} />

          <Reveal className="mt-10 rounded-2xl border border-char-200 bg-white p-7">
            <div className="flex items-center gap-2.5 text-char-500">
              <MapPin size={18} weight="fill" className="text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {t("ports.usLabel")}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {usPorts.map((port) => (
                <span
                  key={port}
                  className="rounded-full border border-char-200 bg-char-50 px-3.5 py-1.5 text-sm font-semibold text-char-800"
                >
                  {port}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.08} className="mt-6 rounded-2xl border border-char-200 bg-white p-7">
            <div className="flex items-center gap-2.5 text-char-500">
              <Anchor size={18} weight="fill" className="text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {t("ports.arrivalLabel")}
              </span>
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-amber-700">
              {t("ports.instantLabel")}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2.5">
              {instantPorts.map((port) => (
                <span
                  key={port}
                  className="rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-sm font-semibold text-amber-800"
                >
                  {port}
                </span>
              ))}
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-char-400">
              {t("ports.requestLabel")}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2.5">
              {requestPorts.map((port) => (
                <span
                  key={port}
                  className="rounded-full border border-char-200 bg-char-50 px-3.5 py-1.5 text-sm font-medium text-char-600"
                >
                  {port}
                </span>
              ))}
            </div>
          </Reveal>
        </Container>
      </section>

      <CostCalculator />
    </>
  );
}
