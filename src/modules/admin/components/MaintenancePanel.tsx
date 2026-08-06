"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Wrench, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { inputClass, labelClass } from "@/modules/auth/components/formStyles";

type State = "idle" | "confirming" | "busy" | "invalid_password" | "rate_limited" | "error";

/**
 * The site's on/off switch.
 *
 * Both directions ask for the admin's password before doing anything — a
 * console tab left open on an unattended machine must not be one click away
 * from taking the site down, or from reopening it mid-change. The current
 * state is stated in words ("the site is live" / "closed"), not an icon,
 * because this is the one panel where a misreading costs an outage.
 */
export default function MaintenancePanel({ initiallyOn }: { initiallyOn: boolean }) {
  const t = useTranslations("Admin.maintenance");
  const [on, setOn] = useState(initiallyOn);
  const [state, setState] = useState<State>("idle");
  const [password, setPassword] = useState("");

  async function toggle(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: on ? "disable" : "enable", password }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; on?: boolean };
      if (res.ok && body.ok) {
        setOn(Boolean(body.on));
        setPassword("");
        setState("idle");
        return;
      }
      setState(
        res.status === 403 ? "invalid_password" : res.status === 429 ? "rate_limited" : "error"
      );
    } catch {
      setState("error");
    }
  }

  const message =
    state === "invalid_password"
      ? t("wrongPassword")
      : state === "rate_limited"
        ? t("rateLimited")
        : state === "error"
          ? t("failed")
          : null;

  return (
    <div
      className={`rounded-2xl border p-5 ${
        on ? "border-amber-300 bg-amber-50/70" : "border-char-200/70 bg-white"
      }`}
    >
      <p className="flex items-center gap-2 font-semibold text-char-900">
        <Wrench size={18} weight="fill" className={on ? "text-amber-600" : "text-char-400"} />
        {on ? t("statusOn") : t("statusOff")}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-char-600">
        {on ? t("hintOn") : t("hintOff")}
      </p>

      {state === "idle" && (
        <button
          type="button"
          onClick={() => setState("confirming")}
          className={`mt-4 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
            on
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "border border-char-200 bg-white text-char-800 hover:border-amber-400 hover:text-amber-700"
          }`}
        >
          {on ? t("goLive") : t("goMaintenance")}
        </button>
      )}

      {state !== "idle" && (
        <form onSubmit={toggle} className="mt-4">
          <label htmlFor="maintenance-password" className={labelClass}>
            {t("confirmPassword")}
          </label>
          <div className="mt-1.5 flex flex-col gap-3 sm:flex-row">
            <input
              id="maintenance-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (state !== "busy" && state !== "confirming") setState("confirming");
              }}
              required
              autoComplete="current-password"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={state === "busy"}
              className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                on ? "bg-amber-500 hover:bg-amber-600" : "bg-char-900 hover:bg-char-800"
              }`}
            >
              {state === "busy" ? t("working") : on ? t("goLive") : t("goMaintenance")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPassword("");
                setState("idle");
              }}
              disabled={state === "busy"}
              className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
            >
              {t("cancel")}
            </button>
          </div>
          {message && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-red-700">
              <WarningCircle size={16} weight="fill" className="shrink-0" />
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
