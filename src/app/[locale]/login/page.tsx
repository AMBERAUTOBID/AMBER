import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/modules/auth/model/currentUser";
import AuthCard from "@/modules/auth/components/AuthCard";
import LoginForm from "@/modules/auth/components/LoginForm";
import { safeReturnPath } from "@/modules/auth/model/safeReturnPath";
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

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Where to go after signing in. Validated on the server, before it reaches
  // the browser at all — see safeReturnPath; an unchecked value here is an
  // open redirect. Anything suspicious silently becomes the default.
  const next = safeReturnPath((await searchParams).next as string | undefined);

  // Already signed in? The login page has nothing to offer — but honour the
  // return path, so a client following an emailed link to their plan while
  // already logged in lands on the plan, not on the overview.
  if (await currentUser()) {
    const target = next ?? "/account";
    redirect(locale === "en" ? target : `/${locale}${target}`);
  }

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
      <LoginForm next={next} />
    </AuthCard>
  );
}
