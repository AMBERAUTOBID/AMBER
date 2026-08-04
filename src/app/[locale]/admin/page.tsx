import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { currentUser } from "@/modules/auth/model/currentUser";
import { can } from "@/modules/plans/model/can";
import { pendingDeposits } from "@/modules/plans/model/deposits";
import type { PlanKey } from "@/modules/plans/model/plans";
import DepositQueue from "@/modules/plans/components/DepositQueue";
import Container from "@/shared/ui/Container";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("title"), robots: { index: false } };
}

export const dynamic = "force-dynamic";

/**
 * Admin console, v1: the deposit approval queue.
 *
 * Non-admins get a 404 rather than a redirect or a 403. A redirect to /login
 * would tell a curious client that /admin exists and is worth returning to
 * with better credentials; 404 says nothing at all.
 */
export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentUser();
  if (!user) notFound();

  const decision = can(
    {
      role: user.role,
      emailVerified: user.emailVerified,
      activePlanKey: user.activePlanKey as PlanKey | null,
      selfBiddingGranted: user.selfBiddingGranted,
    },
    { type: "access_admin" }
  );
  if (!decision.allowed) notFound();

  const t = await getTranslations({ locale, namespace: "Admin" });
  const queue = await pendingDeposits();

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-char-600">{t("subtitle")}</p>

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("queueHeading", { count: queue.length })}
        </h2>
        <div className="mt-4">
          <DepositQueue rows={queue} />
        </div>
      </div>
    </Container>
  );
}
