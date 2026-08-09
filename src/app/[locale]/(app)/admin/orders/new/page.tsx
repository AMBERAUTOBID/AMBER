import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { getObjectStorage } from "@/modules/orders/api/storage";
import NewOrderForm from "@/modules/orders/components/NewOrderForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AdminOrders" });
  return { title: t("createHeading"), robots: { index: false } };
}

/**
 * Thin, as pages in this codebase are: the form is a client component because
 * it does lookups without navigating, and everything it needs is behind the
 * API route rather than passed down as props.
 *
 * The storage warning is checked here rather than inside the form. An order
 * can still be created without R2 — it just arrives with no auction photos —
 * and saying so up front is better than an import that fails at the end.
 */
export default async function NewOrderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentAdmin();
  if (!user) notFound();

  const t = await getTranslations({ locale, namespace: "AdminOrders" });
  const storageReady = getObjectStorage() !== null;

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/orders"
        className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline"
      >
        ← {t("heading")}
      </Link>

      <h1 className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("createHeading")}
      </h1>

      {!storageReady && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-char-700">
          {t("storageOff")}
        </p>
      )}

      <div className="mt-8">
        <NewOrderForm />
      </div>
    </div>
  );
}
