"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  CheckCircle,
  Clock,
  Heart,
  ShieldCheck,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";

export interface UsersTableRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "client" | "admin";
  activePlanKey: string | null;
  emailVerified: boolean;
  /** ISO — Dates don't survive the server/client boundary intact. */
  createdAt: string;
  favorites: number;
  deposits: number;
}

/**
 * Every registered account, with the actions an admin can take on one.
 *
 * The erase action lives here rather than in a separate find-by-email panel
 * (which this replaces). Two places to delete a user is how the two drift
 * apart, and erasing a row you can see — name, email, plan, join date — is
 * safer than erasing whatever string a lookup box matched.
 *
 * What is deliberately NOT here: any way to change someone's role. Admin is
 * granted by CLI only (scripts/makeAdmin.mjs), so a stolen admin session
 * cannot mint more admins. That is a security decision, not an omission.
 */
export default function UsersTable({
  rows,
  planNames,
}: {
  rows: UsersTableRow[];
  planNames: Record<string, string>;
}) {
  const t = useTranslations("Admin.users");
  // The one label borrowed from the activity page it links to — scoped
  // separately because t() above resolves under Admin.users, where a
  // "activity.viewActivity" lookup renders as its own bare key name.
  const tActivity = useTranslations("Admin.activity");
  const format = useFormatter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [erased, setErased] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function erase(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", userId: id }),
      });
      if (res.ok) {
        setErased((prev) => new Set(prev).add(id));
        setConfirming(null);
      } else {
        setError(t("eraseFailed"));
      }
    } catch {
      setError(t("eraseFailed"));
    }
    setBusy(null);
  }

  const visible = rows.filter((r) => !erased.has(r.id));

  if (visible.length === 0) {
    return <p className="text-sm text-char-600">{t("empty")}</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {visible.map((row) => (
        <div key={row.id} className="rounded-2xl border border-char-200/70 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="truncate font-semibold text-char-900">{row.name}</span>
                {row.role === "admin" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-char-900 px-2 py-0.5 text-xs font-semibold text-white">
                    <ShieldCheck size={11} weight="fill" />
                    {t("adminBadge")}
                  </span>
                )}
                {row.emailVerified ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                    <CheckCircle size={12} weight="fill" />
                    {t("verified")}
                  </span>
                ) : (
                  // Worth surfacing: an unverified account cannot log in, so
                  // "they say they registered but can't get in" is answered
                  // at a glance instead of by asking us.
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                    <Clock size={12} weight="fill" />
                    {t("unverified")}
                  </span>
                )}
              </p>

              <p className="truncate text-sm text-char-600">{row.email}</p>
              {row.phone && <p className="text-sm text-char-500">{row.phone}</p>}

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-char-500">
                <span className="font-medium text-char-700">
                  {row.activePlanKey
                    ? (planNames[row.activePlanKey] ?? row.activePlanKey)
                    : t("noPlan")}
                </span>
                <span>
                  {t("joined", {
                    date: format.dateTime(new Date(row.createdAt), { dateStyle: "medium" }),
                  })}
                </span>
                {row.favorites > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Heart size={12} weight="fill" /> {row.favorites}
                  </span>
                )}
                {row.deposits > 0 && <span>{t("depositCount", { count: row.deposits })}</span>}
              </div>

              {/* The way into one person's file. A link rather than making the
                  whole row clickable: the row already carries a destructive
                  button, and a card where any stray click navigates is a card
                  where the wrong click eventually does something else. */}
              <Link
                href={`/admin/users/${row.id}`}
                className="mt-2 inline-flex text-xs font-semibold text-amber-700 underline-offset-4 hover:underline"
              >
                {tActivity("viewActivity")}
              </Link>
            </div>

            {confirming !== row.id && (
              <button
                type="button"
                onClick={() => setConfirming(row.id)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-char-200 px-4 py-2 text-xs font-semibold text-char-600 transition-colors hover:border-red-300 hover:text-red-700"
              >
                <Trash size={13} weight="bold" />
                {t("erase")}
              </button>
            )}
          </div>

          {confirming === row.id && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50/60 p-4">
              <p className="flex items-start gap-2 text-sm leading-relaxed text-char-700">
                <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-red-600" />
                {t("eraseConfirm", { name: row.name })}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => erase(row.id)}
                  disabled={busy === row.id}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                >
                  {busy === row.id ? t("erasing") : t("eraseYes")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  disabled={busy === row.id}
                  className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
                >
                  {t("eraseNo")}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
