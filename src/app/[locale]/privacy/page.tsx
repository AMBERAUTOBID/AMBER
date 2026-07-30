import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Container from "@/shared/ui/Container";
import Reveal from "@/shared/ui/Reveal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return { title: t("hero.title") };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Privacy");

  const sections = t.raw("sections") as { title: string; body: string[] }[];

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
            <p className="mt-3 text-sm text-char-400">{t("updated")}</p>
          </Reveal>
        </Container>
      </section>

      <section className="pb-20">
        <Container>
          <div className="mx-auto max-w-3xl space-y-10">
            {sections.map((section, i) => (
              <Reveal key={section.title} delay={Math.min(i * 0.04, 0.3)}>
                <h2 className="text-xl font-bold text-char-900">{section.title}</h2>
                <div className="mt-3 space-y-3">
                  {section.body.map((paragraph, j) => (
                    <p key={j} className="text-base leading-relaxed text-char-600">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
