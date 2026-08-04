import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { verifyEmail } from "@/modules/auth/model/accounts";
import AuthCard from "@/modules/auth/components/AuthCard";
import { Link } from "@/i18n/navigation";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth.verify" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * The landing page of the emailed verification link. Consuming the token in
 * a GET render is a deliberate trade-off: strictly, GETs shouldn't mutate,
 * but "click the link, you're done" is the entire UX contract of email
 * verification, and the token is single-use so a prefetching proxy can at
 * worst do the user's work for them — verification has no harmful outcome.
 * This page must never be statically cached, hence force-dynamic.
 */
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const t = await getTranslations({ locale, namespace: "Auth.verify" });

  const outcome = token ? await verifyEmail(token) : "invalid_or_expired";

  return (
    <AuthCard title={t("title")}>
      {outcome === "verified" ? (
        <div className="space-y-5">
          <p className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle size={18} weight="fill" className="shrink-0 text-green-600" />
            {t("success")}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full bg-amber-500 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
          >
            {t("toLogin")}
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            <WarningCircle size={18} weight="fill" className="shrink-0 text-red-600" />
            {t("failed")}
          </p>
          <p className="text-sm leading-relaxed text-char-600">{t("failedHint")}</p>
        </div>
      )}
    </AuthCard>
  );
}
