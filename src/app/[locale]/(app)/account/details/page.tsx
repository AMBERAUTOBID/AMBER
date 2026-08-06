import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { DeviceMobile } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/modules/account/model/requireUser";
import { profileFor } from "@/modules/account/model/profile";
import { signedInDevices } from "@/modules/account/model/devices";
import ProfileForm from "@/modules/account/components/ProfileForm";
import PasswordForm from "@/modules/account/components/PasswordForm";
import SignOutOthersButton from "@/modules/account/components/SignOutOthersButton";
import DeleteAccountForm from "@/modules/account/components/DeleteAccountForm";

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
  const user = await requireUser(locale, "/account/details");

  const t = await getTranslations({ locale, namespace: "Account.details" });
  const format = await getFormatter({ locale });
  // The session carries no phone number, so this is the one extra read.
  const profile = await profileFor(user.id);
  const devices = await signedInDevices(user.id);
  const otherCount = devices.filter((d) => !d.current).length;

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

      <section className="mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("devicesHeading")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-char-600">{t("devicesHint")}</p>

        <ul className="mt-5 divide-y divide-char-200/70">
          {devices.map((device) => (
            <li key={device.id} className="flex items-start gap-3 py-3">
              <DeviceMobile size={18} weight="fill" className="mt-0.5 shrink-0 text-char-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-char-900">
                  {device.label || t("deviceUnknown")}
                  {device.current && (
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {t("deviceCurrent")}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-char-500">
                  {/* Started, not "last active": expiresAt only slides forward
                      past half-life, so deriving activity from it would be
                      wrong by up to fifteen days. Say what we actually know. */}
                  {t("deviceSince", {
                    date: format.dateTime(device.createdAt, { dateStyle: "medium" }),
                  })}
                  {device.ip ? ` · ${device.ip}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-char-200/70 pt-4">
          <SignOutOthersButton otherCount={otherCount} />
        </div>
      </section>

      {/* Last on the page, and visually quieter than everything above it.
          Nobody arrives here meaning to delete their account, and a red panel
          competing with "save changes" would be the wrong emphasis. */}
      <section className="mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("dangerHeading")}
        </h2>
        <div className="mt-5">
          <DeleteAccountForm />
        </div>
      </section>
    </div>
  );
}
