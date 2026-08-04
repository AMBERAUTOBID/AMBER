import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/modules/auth/model/currentUser";
import AuthCard from "@/modules/auth/components/AuthCard";
import RegisterForm from "@/modules/auth/components/RegisterForm";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth.register" });
  return { title: t("title"), robots: { index: false } };
}

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await currentUser()) redirect(locale === "en" ? "/account" : `/${locale}/account`);

  const t = await getTranslations({ locale, namespace: "Auth.register" });
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <p>
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-medium text-amber-700 hover:underline">
            {t("toLogin")}
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
