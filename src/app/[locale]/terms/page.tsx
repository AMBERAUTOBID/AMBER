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
  const t = await getTranslations({ locale, namespace: "Terms" });
  return { title: t("hero.title") };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Terms");

  /** A body entry is either a paragraph or a bullet list of its own. */
  type Block = string | string[];

  const intro = t.raw("intro") as string[];
  const sections = t.raw("sections") as { title: string; body: Block[] }[];

  return (
    <>
      <section className="bg-gradient-to-b from-amber-50/60 via-background to-background pt-16 pb-10 sm:pt-20">
        <Container>
          {/* Same column as the sections below, so the hero doesn't sit
              flush left while the body text is centred. */}
          <Reveal className="mx-auto max-w-3xl">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
              {t("hero.eyebrow")}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-char-900 sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-char-600">
              {t("hero.subtitle")}
            </p>
            <p className="mt-3 text-sm text-char-500">{t("updated")}</p>
          </Reveal>
        </Container>
      </section>

      <section className="pb-20">
        <Container>
          <div className="mx-auto max-w-3xl space-y-10">
            {intro.length > 0 && (
              <Reveal>
                <div className="space-y-3">
                  {intro.map((paragraph, i) => (
                    <p key={i} className="text-base leading-relaxed text-char-600">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </Reveal>
            )}

            {sections.map((section, i) => (
              <Reveal key={section.title} delay={Math.min(i * 0.04, 0.3)}>
                <h2 className="text-xl font-bold text-char-900">{section.title}</h2>
                <div className="mt-3 space-y-3">
                  {section.body.map((block, j) =>
                    Array.isArray(block) ? (
                      <ul
                        key={j}
                        className="list-disc space-y-1.5 pl-5 text-base leading-relaxed text-char-600 marker:text-amber-500"
                      >
                        {block.map((item, k) => (
                          <li key={k}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p key={j} className="text-base leading-relaxed text-char-600">
                        {block}
                      </p>
                    ),
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
