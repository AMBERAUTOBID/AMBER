"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";

interface Counts {
  remaining: number;
  failedTotal: number;
}

/**
 * Drives the auction media copy from the browser, one batch at a time.
 *
 * **The page is the scheduler**, and that is the design rather than a
 * shortcut. A lot's gallery is roughly forty seconds of fetching and
 * re-uploading — past any serverless request — and the alternatives are worse:
 * a background job fails where nobody is looking, and a queue is infrastructure
 * to run for a task that happens a few times a day. Here the progress, the
 * failure and the retry are all on one screen in front of the person who just
 * created the file.
 *
 * It starts by itself when there is work to do. Making an admin press "start"
 * after pressing "create" is a step that exists only because the code needed
 * it, and someone will eventually walk away before pressing it.
 */
export default function ImportProgress({
  orderId,
  initialRemaining,
  initialFailed,
  total,
}: {
  orderId: string;
  initialRemaining: number;
  initialFailed: number;
  /** Total auction files planned, so progress reads "3 of 17". */
  total: number;
}) {
  const t = useTranslations("AdminOrders.import");
  const [counts, setCounts] = useState<Counts>({
    remaining: initialRemaining,
    failedTotal: initialFailed,
  });
  const [stalled, setStalled] = useState(false);
  /**
   * Re-entrancy guard, and a ref rather than state on purpose: it exists only
   * to stop two batches overlapping, and nothing on screen depends on it. As
   * state it would be a `setState` in an effect body, which is both a lint
   * error and a wasted render.
   */
  const running = useRef(false);

  const step = useCallback(async (action?: "retry") => {
    const res = await fetch(`/api/admin/orders/${orderId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action ? { action } : {}),
    });
    const data = (await res.json().catch(() => null)) as
      | (Counts & { ok?: boolean; imported?: number })
      | null;
    if (!res.ok || !data?.ok) throw new Error("import step failed");
    return data;
  }, [orderId]);

  useEffect(() => {
    if (counts.remaining === 0 || stalled || running.current) return;

    let cancelled = false;
    running.current = true;

    (async () => {
      try {
        const data = await step();
        if (cancelled) return;
        // A batch that moved nothing means every remaining row is failing in a
        // way the server already recorded. Looping on it would hammer the
        // auction CDN forever, so the loop stops and hands over to the button.
        if ((data.imported ?? 0) === 0 && data.remaining >= counts.remaining) setStalled(true);
        setCounts({ remaining: data.remaining, failedTotal: data.failedTotal });
      } catch {
        if (!cancelled) setStalled(true);
      } finally {
        running.current = false;
      }
    })();

    return () => {
      cancelled = true;
      running.current = false;
    };
  }, [counts, stalled, step]);

  async function retry() {
    setStalled(false);
    try {
      const data = await step("retry");
      setCounts({ remaining: data.remaining, failedTotal: data.failedTotal });
    } catch {
      setStalled(true);
    }
  }

  const done = total - counts.remaining - counts.failedTotal;

  if (total === 0) {
    return <p className="text-sm text-char-600">{t("none")}</p>;
  }

  if (counts.remaining === 0 && counts.failedTotal === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-green-800">
        <CheckCircle size={16} weight="fill" />
        {t("done", { count: done })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-2 w-full overflow-hidden rounded-full bg-char-100">
        <div
          className="h-full rounded-full bg-amber-500 transition-all duration-500"
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>

      <p className="text-sm text-char-700">
        {counts.remaining > 0
          ? t("importing", { done, total })
          : t("done", { count: done })}
        {counts.failedTotal > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
            <WarningCircle size={14} weight="fill" />
            {t("failed", { count: counts.failedTotal })}
          </span>
        )}
      </p>

      {counts.remaining > 0 && !stalled && (
        <p className="text-xs text-char-500">{t("leaveOpen")}</p>
      )}

      {(stalled || counts.failedTotal > 0) && (
        <button
          type="button"
          onClick={() => void retry()}
          className="rounded-full border border-char-200 bg-white px-4 py-2 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
        >
          {t("retry")}
        </button>
      )}
    </div>
  );
}
