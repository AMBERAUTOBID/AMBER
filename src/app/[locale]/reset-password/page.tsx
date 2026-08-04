import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import AuthCard from "@/modules/auth/components/AuthCard";
import ResetPasswordForm from "@/modules/auth/components/ResetPasswordForm";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth.reset" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const t = await getTranslations({ locale, namespace: "Auth.reset" });

  return (
    <AuthCard
      title={t("title")}
      subtitle={token ? t("subtitle") : undefined}
      footer={
        <Link href="/login" className="font-medium text-amber-700 hover:underline">
          {t("toLogin")}
        </Link>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        // Reached without a token — someone typed the URL by hand. Point
        // them at the flow that emails a real one.
        <p className="text-sm leading-relaxed text-char-600">{t("missingToken")}</p>
      )}
    </AuthCard>
  );
}
