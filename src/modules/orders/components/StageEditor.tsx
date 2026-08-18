"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ORDER_STAGES, type OrderStage } from "../model/stages";

/**
 * Recording that a car reached a stage, on a date, with a note.
 *
 * **Two separate things, and the checkbox is why.** Setting the order's stage
 * and recording that a stage happened come apart constantly in real use: an
 * admin adding last week's terminal photographs to a car that is already at
 * sea must be able to fill in that stage without sending the car backwards on
 * the client's screen. `advance` off writes the timeline entry only.
 *
 * The date defaults to today but is editable, because the day a car reached
 * the yard and the day somebody got round to typing it in are rarely the same,
 * and the client cares about the first.
 */
export default function StageEditor({
  orderId,
  currentStage,
  existing,
}: {
  orderId: string;
  currentStage: OrderStage;
  /** Whatever is already recorded for the stage being edited, if anything. */
  existing?: { stage: OrderStage; happenedAt: string; note: string | null; noteVisible: boolean };
}) {
  const t = useTranslations("AdminOrders.stage");
  const tStage = useTranslations("Orders.stage");
  const router = useRouter();

  const [stage, setStage] = useState<OrderStage>(existing?.stage ?? currentStage);
  const [happenedAt, setHappenedAt] = useState(
    existing?.happenedAt ?? new Date().toISOString().slice(0, 10)
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [noteVisible, setNoteVisible] = useState(existing?.noteVisible ?? false);
  const [advance, setAdvance] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          // Midday rather than midnight: a date typed as 2026-08-09 becomes
          // the 8th in any timezone behind UTC if it is stored at 00:00, and
          // the client would see the wrong day.
          happenedAt: new Date(`${happenedAt}T12:00:00Z`).toISOString(),
          note: note.trim() || null,
          noteVisibleToClient: noteVisible,
          advance,
        }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError(true);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-3 rounded-xl border border-char-200 bg-char-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-char-600">{t("heading")}</span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as OrderStage)}
            className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
          >
            {ORDER_STAGES.map((s) => (
              <option key={s} value={s}>
                {tStage(s)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="text-char-600">{t("date")}</span>
          <input
            type="date"
            value={happenedAt}
            onChange={(e) => setHappenedAt(e.target.value)}
            className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-char-600">{t("note")}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-char-500">{t("noteHint")}</span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-char-700">
          <input
            type="checkbox"
            checked={noteVisible}
            onChange={(e) => setNoteVisible(e.target.checked)}
          />
          {t("showToClient")}
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-char-700">
          <input
            type="checkbox"
            checked={advance}
            onChange={(e) => setAdvance(e.target.checked)}
          />
          {t("advance", { stage: tStage(stage) })}
        </label>
      </div>

      {error && <p className="text-sm text-red-700">{t("save")} —</p>}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}
