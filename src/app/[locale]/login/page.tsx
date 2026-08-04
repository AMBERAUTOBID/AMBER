import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/modules/auth/model/currentUser";
import AuthCard from "@/modules/auth/components/AuthCard";
import LoginForm from "@/modules/auth/components/LoginForm";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth.login" });
  // Auth pages are personal doorways, not marketing content — noindex keeps
  // them out of search results without hiding the pages themselves.
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Already signed in? The login page has nothing to offer.
  if (await currentUser()) redirect(locale === "en" ? "/account" : `/${locale}/account`);

  const t = await getTranslations({ locale, namespace: "Auth.login" });
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <p>
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-amber-700 hover:underline">
            {t("toRegister")}
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
