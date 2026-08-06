"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { inputClass, labelClass } from "@/modules/auth/components/formStyles";

interface Found {
  id: string;
  name: string;
  email: string;
  activePlanKey: string | null;
}

/**
 * Honouring a GDPR erasure request that arrived by email.
 *
 * Two steps on purpose: look the address up, *see who it is*, then erase. A
 * single "type an address and press delete" box means one typo erases the
 * wrong person's account with no undo. Making the admin confirm a name turns
 * a string match into a decision about a human being.
 */
export default function DeleteUserPanel({ planNames }: { planNames: Record<string, string> }) {
  const t = useTranslations("Admin");
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [state, setState] = useState<"idle" | "searching" | "none" | "confirming" | "busy" | "done" | "error">("idle");

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setState("searching");
    setFound(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", email }),
      });
      const body = (await res.json().catch(() => ({}))) as { user?: Found | null };
      if (!res.ok) {
        setState("error");
        return;
      }
      if (!body.user) {
        setState("none");
        return;
      }
      setFound(body.user);
      setState("confirming");
    } catch {
      setState("error");
    }
  }

  async function erase() {
    if (!found) return;
    setState("busy");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", userId: found.id }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-char-200/70 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-green-800">
          <CheckCircle size={18} weight="fill" className="shrink-0" />
          {t("deleted")}
        </p>
        <button
          type="button"
          onClick={() => {
            setEmail("");
            setFound(null);
            setState("idle");
          }}
          className="mt-3 text-sm font-semibold text-char-600 underline-offset-4 hover:underline"
        >
          {t("deleteAnother")}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-char-200/70 bg-white p-5">
      <p className="text-sm leading-relaxed text-char-600">{t("deleteUserHint")}</p>

      <form onSubmit={lookup} className="mt-4">
        <label htmlFor="admin-user-email" className={labelClass}>
          {t("deleteUserEmail")}
        </label>
        <div className="mt-1.5 flex flex-col gap-3 sm:flex-row">
          <input
            id="admin-user-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFound(null);
              setState("idle");
            }}
            required
            className={inputClass}
          />
          <button
            type="submit"
            disabled={state === "searching" || state === "busy"}
            className="shrink-0 rounded-full border border-char-200 px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700 disabled:opacity-60"
          >
            {t("deleteUserFind")}
          </button>
        </div>
      </form>

      {state === "none" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-char-600">
          <WarningCircle size={16} weight="fill" className="shrink-0 text-char-400" />
          {t("deleteUserNotFound")}
        </p>
      )}
      {state === "error" && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {t("actionFailed")}
        </p>
      )}

      {found && (state === "confirming" || state === "busy") && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/60 p-4">
          <p className="font-semibold text-char-900">{found.name}</p>
          <p className="text-sm text-char-600">{found.email}</p>
          {found.activePlanKey && (
            <p className="mt-1 text-sm text-char-700">
              {planNames[found.activePlanKey] ?? found.activePlanKey}
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-char-700">
            {t("deleteConfirm", { name: found.name })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={erase}
              disabled={state === "busy"}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {state === "busy" ? t("deleting") : t("deleteYes")}
            </button>
            <button
              type="button"
              onClick={() => {
                setFound(null);
                setState("idle");
              }}
              disabled={state === "busy"}
              className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
            >
              {t("deleteNo")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
