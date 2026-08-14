import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { findUser } from "@/modules/admin/model/users";
import { timelineFor } from "@/modules/activity/model/timeline";
import { ACTIVITY_RETENTION_DAYS } from "@/modules/activity/model/events";
import ActivityTimeline from "@/modules/activity/components/ActivityTimeline";
import AdminSection from "@/modules/admin/components/AdminSection";
import { PLAN_KEYS } from "@/modules/plans/model/plans";
import { UUID } from "@/shared/validation";

export const metadata: Metadata = { robots: { index: false } };

/**
 * One client, and what they have actually been doing.
 *
 * The answer to "somebody rang, what were they looking at?" — which until now
 * had no answer anywhere in the application. The users list could tell you a
 * person existed and let you erase them; nothing could tell you they had
 * opened the same Tundra six times this week.
 *
 * **Two tables, one column.** Browsing comes from `activity_events` and
 * account events from `audit_log`; see the schema comment for why those are
 * separate stores with opposite retention rules. `timelineFor` is where the
 * split stops mattering.
 */
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const admin = await currentAdmin();
  if (!admin) notFound();
  // Checked before the query rather than after: an id that isn't a UUID is a
  // 404, not a database error page.
  if (!UUID.test(id)) notFound();

  const user = await findUser(id);
  if (!user) notFound();

  const t = await getTranslations({ locale, namespace: "Admin" });
  const tPlans = await getTranslations({ locale, namespace: "Plans" });
  const format = await getFormatter({ locale });
  const timeline = await timelineFor(user.id);

  const planName =
    user.activePlanKey && (PLAN_KEYS as readonly string[]).includes(user.activePlanKey)
      ? tPlans(`tiers.${user.activePlanKey}.name`)
      : (user.activePlanKey ?? t("activity.noPlan"));

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-char-600 underline-offset-4 hover:text-amber-700 hover:underline"
      >
        <ArrowLeft size={14} weight="bold" />
        {t("activity.backToUsers")}
      </Link>

      <h1 className="mt-4 font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {user.name}
      </h1>
      <p className="mt-1 text-sm text-char-600">{user.email}</p>

      {/* An erased account still resolves by direct link — support may well
          follow one out of an old email — but it must say plainly what it is
          rather than presenting a stripped row as a client. */}
      {user.deletedAt && (
        <p className="mt-4 rounded-xl bg-char-100 px-4 py-3 text-sm font-semibold text-char-700">
          {t("activity.erased", {
            date: format.dateTime(user.deletedAt, { dateStyle: "long" }),
          })}
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-char-200/70 bg-white p-5 text-sm sm:grid-cols-4">
        <Fact label={t("activity.plan")} value={planName} />
        <Fact
          label={t("activity.joined")}
          value={format.dateTime(user.createdAt, { dateStyle: "medium" })}
        />
        <Fact label={t("activity.savedCars")} value={String(user.favorites)} />
        <Fact
          label={t("activity.emailVerified")}
          value={user.emailVerified ? t("activity.yes") : t("activity.no")}
        />
      </dl>

      <div className="mt-8">
        <AdminSection title={t("activity.heading")} count={timeline.length}>
          {/* Says what the screen cannot show, rather than letting a short
              history read as a quiet client. Ninety days is the retention
              rule, and it is stated from the constant that enforces it — not
              typed in again here, where it could drift out of agreement with
              the purge and with the privacy policy. */}
          <p className="mb-5 text-xs leading-relaxed text-char-500">
            {t("activity.retentionNote", { days: ACTIVITY_RETENTION_DAYS })}
          </p>
          <ActivityTimeline entries={timeline} locale={locale} />
        </AdminSection>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-char-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-char-900">{value}</dd>
    </div>
  );
}
