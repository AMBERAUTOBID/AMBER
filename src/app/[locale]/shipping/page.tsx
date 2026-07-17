import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Container from "@/components/Container";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import ShippingEstimator from "@/components/ShippingEstimator";
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
  const euPorts = t.raw("ports.eu") as string[];
  const vehicleTypes = t.raw("estimate.vehicleTypes") as Record<
    "sedan" | "suv" | "truck" | "van",
    string
  >;

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

      <section className="bg-char-50 py-16 sm:py-20">
        <Container>
          <SectionHeading title={t("ports.title")} subtitle={t("ports.subtitle")} />
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Reveal className="rounded-2xl border border-char-200 bg-white p-7">
              <div className="flex items-center gap-2.5 text-char-500">
                <MapPin size={18} weight="fill" className="text-amber-500" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {t("ports.usLabel")}
                </span>
              </div>
              <ul className="mt-4 space-y-2.5">
                {usPorts.map((port) => (
                  <li key={port} className="text-sm font-medium text-char-800">
                    {port}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.08} className="rounded-2xl border border-char-200 bg-white p-7">
              <div className="flex items-center gap-2.5 text-char-500">
                <Anchor size={18} weight="fill" className="text-amber-500" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {t("ports.euLabel")}
                </span>
              </div>
              <ul className="mt-4 space-y-2.5">
                {euPorts.map((port) => (
                  <li key={port} className="text-sm font-medium text-char-800">
                    {port}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <Reveal>
            <ShippingEstimator
              labels={{
                title: t("estimate.title"),
                subtitle: t("estimate.subtitle"),
                vehicleLabel: t("estimate.vehicleLabel"),
                vehicleTypes,
                portLabel: t("estimate.portLabel"),
                resultLabel: t("estimate.resultLabel"),
                disclaimer: t("estimate.disclaimer"),
                cta: t("estimate.cta"),
              }}
            />
          </Reveal>
        </Container>
      </section>
    </>
  );
}
