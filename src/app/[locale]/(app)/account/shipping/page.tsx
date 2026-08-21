import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import { requireClient } from "@/modules/account/model/requireUser";
import { shippingProfileFor } from "@/modules/account/model/shippingProfile";
import {
  emptyShippingProfile,
  isShippingProfileComplete,
} from "@/modules/account/model/shippingProfileRules";
import ShippingProfileForm from "@/modules/account/components/ShippingProfileForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Account.shipping" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * Filled once, before the first bid. See `shippingProfiles` in schema.ts for
 * why this exists and what is deliberately not collected here.
 *
 * The strip at the top is the client's map: deposit → this form → bidding
 * code. Its steps read the same facts the gate does (`activePlanKey`,
 * `isShippingProfileComplete`, `selfBiddingGranted`), so the map and the
 * territory cannot disagree.
 */
export default async function AccountShippingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireClient(locale, "/account/shipping");

  const t = await getTranslations({ locale, namespace: "Account.shipping" });
  const profile = (await shippingProfileFor(user.id)) ?? emptyShippingProfile();
  const complete = isShippingProfileComplete(profile);

  const steps: { label: string; done: boolean }[] = [
    { label: t("steps.plan"), done: user.activePlanKey !== null },
    { label: t("steps.shipping"), done: complete },
    { label: t("steps.code"), done: user.selfBiddingGranted },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("title")}
      </h1>
      <p className="mt-2 max-w-prose text-char-500">{t("lede")}</p>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-semibold text-amber-800">
          {complete ? t("gateDone") : t("gateOpen")}
        </p>
        <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-1.5 text-sm">
              {step.done ? (
                <CheckCircle size={18} weight="fill" className="text-emerald-600" />
              ) : (
                <Circle size={18} className="text-char-300" />
              )}
              <span className={step.done ? "text-char-800" : "text-char-500"}>{step.label}</span>
            </li>
          ))}
        </ol>
      </div>

      <ShippingProfileForm initial={profile} />
    </div>
  );
}
