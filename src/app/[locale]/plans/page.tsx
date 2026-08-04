import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { PLANS_IN_ORDER } from "@/modules/plans/model/plans";
import PlanCard from "@/modules/plans/components/PlanCard";
import Container from "@/shared/ui/Container";
import SectionHeading from "@/shared/ui/SectionHeading";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Plans" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    // PLACEHOLDER PRICING: noindex until the real figures land, so a search
    // engine never caches numbers we invented. Remove alongside the
    // placeholders in plans.ts.
    robots: { index: false },
  };
}

/** Reads the session to decide the button's behaviour, so it can't be static. */
export const dynamic = "force-dynamic";

export default async function PlansPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Plans" });
  const user = await currentUser();

  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("intro")}
        align="center"
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {PLANS_IN_ORDER.map((plan) => (
          <PlanCard key={plan.key} plan={plan} signedIn={Boolean(user)} />
        ))}
      </div>

      <p className="mx-auto mt-12 max-w-3xl text-center text-sm leading-relaxed text-char-600">
        {t("footnote")}
      </p>
    </Container>
  );
}
