import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Container from "@/shared/ui/Container";
import Reveal from "@/shared/ui/Reveal";
import Button from "@/shared/ui/Button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("NotFound");
  return { title: t("title") };
}

export default async function NotFound() {
  const t = await getTranslations("NotFound");

  return (
    <section className="flex min-h-[70vh] items-center bg-gradient-to-b from-amber-50/60 via-background to-background py-20">
      <Container>
        <Reveal className="mx-auto max-w-lg text-center">
          <span className="text-sm font-extrabold tracking-wider text-amber-500">
            404
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-char-900 sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-char-600">
            {t("subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button href="/">{t("homeCta")}</Button>
            <Button href="/contact" variant="secondary">
              {t("contactCta")}
            </Button>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
