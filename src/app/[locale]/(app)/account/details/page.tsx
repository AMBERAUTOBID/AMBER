import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/modules/account/model/requireUser";
import { profileFor } from "@/modules/account/model/profile";
import ProfileForm from "@/modules/account/components/ProfileForm";
import PasswordForm from "@/modules/account/components/PasswordForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Account.details" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * Name, phone, notification language, password.
 *
 * ⚠️ What is NOT here, and must not be added casually: **national identity
 * number and IBAN**. A competitor collects both on their equivalent page.
 * Both are sensitive personal data under GDPR and change our obligations
 * materially — lawful basis, retention limits, encryption at rest, breach
 * notification. Neither is needed until invoices are actually issued, and
 * adding them is a security design task, not a form field
 * (ARCHITECTURE.md §6a).
 */
export default async function AccountDetailsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);

  const t = await getTranslations({ locale, namespace: "Account.details" });
  // The session carries no phone number, so this is the one extra read.
  const profile = await profileFor(user.id);

  return (
    <div className="max-w-xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("title")}
      </h1>

      <section className="mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("profileHeading")}
        </h2>
        <div className="mt-5">
          <ProfileForm
            name={user.name}
            phone={profile?.phone ?? ""}
            email={user.email}
            locale={user.locale}
          />
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("passwordHeading")}
        </h2>
        <div className="mt-5">
          <PasswordForm />
        </div>
      </section>
    </div>
  );
}
