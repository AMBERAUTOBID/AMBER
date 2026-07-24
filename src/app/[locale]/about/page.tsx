import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Container from "@/components/Container";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import {
  Tag,
  HandPalm,
  FileText,
  ChatCircleDots,
  RocketLaunch,
} from "@phosphor-icons/react/dist/ssr";

const VALUE_ICONS = [Tag, HandPalm, FileText, ChatCircleDots];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return { title: t("hero.title") };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("About");

  const paragraphs = t.raw("story.paragraphs") as string[];
  const values = t.raw("values.items") as { title: string; desc: string }[];

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-amber-50/60 via-background to-background py-16 sm:py-20">
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
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
          <Reveal>
            <h2 className="text-2xl font-extrabold text-char-900">
              {t("story.title")}
            </h2>
            <div className="mt-5 space-y-4">
              {paragraphs.map((p, i) => (
                <p key={i} className="text-base leading-relaxed text-char-600">
                  {p}
                </p>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1} className="relative">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-xl shadow-char-900/15">
              <Image
                src="/images/hero-4runner.jpg"
                alt="Vehicles sourced by SmartAutoBid"
                fill
                sizes="(min-width: 1024px) 560px, 90vw"
                className="object-cover"
              />
            </div>
            <div className="mt-6 flex gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
                <RocketLaunch size={22} weight="duotone" />
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  {t("founding.eyebrow")}
                </span>
                <h3 className="mt-1 font-bold text-char-900">{t("founding.title")}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-char-600">
                  {t("founding.desc")}
                </p>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      <section className="bg-char-50 py-16 sm:py-24">
        <Container>
          <SectionHeading title={t("values.title")} />
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((item, i) => {
              const Icon = VALUE_ICONS[i];
              return (
                <Reveal
                  key={item.title}
                  delay={i * 0.08}
                  className="rounded-2xl border border-char-200 bg-white p-6"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Icon size={22} weight="duotone" />
                  </div>
                  <h3 className="mt-4 font-bold text-char-900">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-char-600">
                    {item.desc}
                  </p>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </section>
    </>
  );
}
