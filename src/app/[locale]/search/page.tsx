import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Container from "@/components/Container";
import Reveal from "@/components/Reveal";
import Button from "@/components/Button";
import SearchWidget from "@/components/SearchWidget";
import { Info, ChatCircleDots, Gavel, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Search" });
  return { title: t("hero.title") };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ make?: string }>;
}) {
  const { locale } = await params;
  const { make } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Search");

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

          <Reveal delay={0.1} className="mt-8">
            <SearchWidget
              initialMake={make ?? ""}
              variant="elevated"
              labels={{
                makeLabel: "",
                allMakes: t("widget.allMakes"),
                vinPlaceholder: t("widget.vinPlaceholder"),
                orDivider: t("widget.orDivider"),
                copartToggle: t("widget.copartToggle"),
                iaaiToggle: t("widget.iaaiToggle"),
                searchButton: t("widget.searchButton"),
              }}
            />
          </Reveal>
        </Container>
      </section>

      <section className="pb-20">
        <Container>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Reveal className="flex gap-4 rounded-2xl border border-char-200 bg-white p-7">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Gavel size={22} weight="duotone" />
              </div>
              <div>
                <h3 className="font-bold text-char-900">{t("copart.name")}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-char-600">
                  {t("copart.desc")}
                </p>
              </div>
            </Reveal>
            <Reveal
              delay={0.08}
              className="flex gap-4 rounded-2xl border border-char-200 bg-white p-7"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-char-100 text-char-700">
                <ShieldCheck size={22} weight="duotone" />
              </div>
              <div>
                <h3 className="font-bold text-char-900">{t("iaai.name")}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-char-600">
                  {t("iaai.desc")}
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal
            delay={0.15}
            className="mt-6 flex flex-col items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-7 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex gap-4">
              <ChatCircleDots
                size={26}
                weight="duotone"
                className="mt-0.5 shrink-0 text-amber-600"
              />
              <div>
                <h3 className="font-bold text-char-900">{t("helper.title")}</h3>
                <p className="mt-1 text-sm leading-relaxed text-char-600">
                  {t("helper.desc")}
                </p>
              </div>
            </div>
            <Button href="/contact" variant="secondary" className="shrink-0">
              {t("helper.button")}
            </Button>
          </Reveal>

          <Reveal
            delay={0.2}
            className="mt-6 flex items-start gap-3 rounded-2xl border border-char-200 bg-char-50 p-6 text-sm text-char-600"
          >
            <Info size={20} className="mt-0.5 shrink-0 text-char-400" />
            <p>{t("note")}</p>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
