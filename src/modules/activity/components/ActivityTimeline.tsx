import { getFormatter, getTranslations } from "next-intl/server";
import {
  ArrowSquareOut,
  Calculator,
  ChatCircleDots,
  Eye,
  Heart,
  HeartBreak,
  MagnifyingGlass,
  Money,
  ShieldWarning,
  SignIn,
  Tag,
  UserGear,
} from "@phosphor-icons/react/dist/ssr";
import type { TimelineEntry } from "../model/timeline";

/**
 * One client's history, both tables merged into a single column.
 *
 * A server component: this is read-only, it needs `getFormatter` for dates in
 * the reader's locale, and there is nothing to interact with. Keeping it off
 * the client also keeps the whole history out of the JavaScript bundle, which
 * matters more here than usual — it is the most personal screen in the
 * console.
 *
 * **Unknown kinds render as themselves rather than disappearing.** A new event
 * added anywhere in the app shows up here as its raw key on the day it starts
 * being written, which is ugly and correct; a `?? null` would silently hide
 * whole categories of activity from the one screen that exists to show them.
 */
const ICONS: Record<string, React.ComponentType<{ size?: number; weight?: "bold" | "fill" }>> = {
  "lot.viewed": Eye,
  "lot.saved": Heart,
  "lot.unsaved": HeartBreak,
  "lot.cost_calculated": Calculator,
  "lot.external_opened": ArrowSquareOut,
  "search.performed": MagnifyingGlass,
  "contact.submitted": ChatCircleDots,
  "plans.viewed": Tag,
  "auth.login": SignIn,
  "auth.login_failed": ShieldWarning,
  "auth.password_changed": UserGear,
  "auth.password_reset": UserGear,
  "auth.reset_requested": UserGear,
  "auth.email_verified": UserGear,
  "account.registered": UserGear,
  "account.profile_updated": UserGear,
  "account.deleted": ShieldWarning,
  "deposit.requested": Money,
  "deposit.confirmed": Money,
  "deposit.cancelled": Money,
  "deposit.refund_requested": Money,
  "deposit.refund_declined": Money,
  "deposit.refunded": Money,
  "plan.overridden": UserGear,
};

export default async function ActivityTimeline({
  entries,
  locale,
}: {
  entries: TimelineEntry[];
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "Admin.activity" });
  const format = await getFormatter({ locale });

  if (entries.length === 0) {
    return <p className="text-sm text-char-600">{t("empty")}</p>;
  }

  return (
    <ol className="relative space-y-0 border-l border-char-200/70 pl-6">
      {entries.map((entry) => {
        const Icon = ICONS[entry.kind] ?? Eye;
        // `t.has` rather than a try/catch: a kind with no translation yet must
        // print its key, not throw and take the page down.
        const title = t.has(`kind.${entry.kind}`) ? t(`kind.${entry.kind}`) : entry.kind;
        return (
          <li key={entry.id} className="relative py-3.5">
            <span className="absolute -left-[31px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white text-char-500 ring-1 ring-char-200">
              <Icon size={12} weight="bold" />
            </span>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold text-char-900">{title}</span>
              {/* Only when it happened more than once. "1×" on every line
                  would be noise on the majority of them. */}
              {entry.count > 1 && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
                  {t("times", { count: entry.count })}
                </span>
              )}
              {/* Staff did this, not the client. Without the mark, an admin
                  override reads on this page as something the client chose. */}
              {entry.byOther && (
                <span className="rounded-full bg-char-100 px-2 py-0.5 text-xs font-semibold text-char-600">
                  {t("byStaff")}
                </span>
              )}
              <span className="ml-auto shrink-0 text-xs text-char-500">
                {format.dateTime(entry.at, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>

            {entry.label && (
              <p className="mt-0.5 text-sm text-char-700">{entry.label}</p>
            )}

            <ActivityDetail entry={entry} />

            {entry.firstAt && (
              <p className="mt-0.5 text-xs text-char-500">
                {t("firstSeen", {
                  date: format.dateTime(entry.firstAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The one or two extras worth surfacing out of `detail`, rather than dumping
 * the JSON.
 *
 * Only the port is promoted, because it is the only field that changes what an
 * event *means* — "used the calculator" and "costed this car to Klaipėda" are
 * different pieces of news. Everything else in `detail` exists for support and
 * investigation, and belongs in the database rather than on a screen somebody
 * reads at speed.
 */
function ActivityDetail({ entry }: { entry: TimelineEntry }) {
  const detail = entry.detail as { port?: unknown } | null;
  const port = typeof detail?.port === "string" ? detail.port : null;
  if (!port) return null;
  return (
    <p className="mt-0.5 inline-flex rounded-full bg-char-100 px-2.5 py-0.5 text-xs font-semibold text-char-700">
      {port}
    </p>
  );
}
