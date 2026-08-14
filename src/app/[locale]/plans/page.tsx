import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { PLANS_IN_ORDER, isPlanKey } from "@/modules/plans/model/plans";
import { ledgerFor } from "@/modules/plans/model/deposits";
import { cardStateFor } from "@/modules/plans/model/cardState";
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
  // Indexable. It was noindex while every figure was a placeholder, so no
  // search engine could cache numbers we had invented; those figures are now
  // owner-confirmed, and this is a page buyers search for by name.
  //
  // The three Coming Soon tiers are a reason TO index it, not against: they
  // advertise the full range and route anyone who needs one into a
  // conversation, which is the whole point of the page.
  //
  // ⚠️ Indexing lives in two places. This controls whether a crawler that
  // reaches the page may list it; `app/sitemap.ts` controls whether it is
  // told the page exists. Changing one without the other half-applies the
  // decision — /plans is listed in both.
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

/** Reads the session to decide the button's behaviour, so it can't be static. */
export const dynamic = "force-dynamic";

export default async function PlansPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Plans" });
  const user = await currentUser();

  // This page is where a client moves up a tier, so it has to know what they
  // already hold — otherwise every card quotes its headline price and someone
  // holding $1,500 is asked for a further $2,500 to reach a $2,500 tier.
  // One query, and only for signed-in visitors: the public view is unchanged.
  const ledger = user ? await ledgerFor(user.id) : null;
  const activePlanKey =
    user?.activePlanKey && isPlanKey(user.activePlanKey) ? user.activePlanKey : null;

  return (
    <Container className="py-16 sm:py-24">
      {/* No eyebrow chip: the heading is now simply "Plans", and a PLANS
          chip above a Plans heading said the same word twice. */}
      <SectionHeading title={t("title")} subtitle={t("intro")} align="center" />

      {/* One column per plan on desktop, so the catalogue reads as a single
          row to compare across. Two-up on tablets; the count is driven by
          PLANS_IN_ORDER, so adding a fifth tier means revisiting this. */}
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS_IN_ORDER.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            state={cardStateFor(plan, ledger, activePlanKey)}
          />
        ))}
      </div>

      <p className="mx-auto mt-12 max-w-3xl text-center text-sm leading-relaxed text-char-600">
        {t("footnote")}
      </p>
    </Container>
  );
}
