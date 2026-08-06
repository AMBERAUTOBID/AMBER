"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowClockwise, Trash, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";

export interface FavoriteCardData {
  id: string;
  platform: string;
  lotNumber: string;
  vin: string | null;
  title: string;
  imageUrl: string | null;
  priceUsdCents: number | null;
  auctionAt: string | null;
  refreshedAt: string | null;
  createdAt: string;
}

type State = "idle" | "refreshing" | "removing" | "error" | "unavailable" | "removed";

/**
 * One saved car.
 *
 * Everything shown is the stored snapshot, and the card says **when** it was
 * taken. It deliberately never renders a live/ended badge or a countdown: the
 * auction fields on search responses are batch-stamped and routinely report
 * long-sold lots as open, so a card claiming status from saved data would be
 * repeating a known lie. Only the lot page knows, and that is one click away.
 *
 * Dates arrive as ISO strings rather than Date objects because this crosses
 * the server/client boundary, where Dates don't survive serialization intact.
 */
export default function FavoriteCard({
  favorite,
  canRefresh,
}: {
  favorite: FavoriteCardData;
  /** False when the viewer has no active plan — refreshing spends quota. */
  canRefresh: boolean;
}) {
  const t = useTranslations("Favorites");
  const format = useFormatter();
  const [state, setState] = useState<State>("idle");

  async function refresh() {
    setState("refreshing");
    try {
      const res = await fetch("/api/favorites/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: favorite.id }),
      });
      if (res.ok) {
        // Re-read from the server rather than patching state: the row is
        // rendered server-side, and reloading is the only way to be sure
        // what's on screen matches what was stored.
        window.location.reload();
        return;
      }
      // 502 means the lot itself couldn't be reached — the snapshot is
      // untouched and still readable, which is worth saying plainly rather
      // than showing a generic failure.
      setState(res.status === 502 ? "unavailable" : "error");
    } catch {
      setState("error");
    }
  }

  async function remove() {
    setState("removing");
    try {
      const res = await fetch("/api/favorites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: favorite.id }),
      });
      if (res.ok) {
        setState("removed");
        return;
      }
      setState("error");
    } catch {
      setState("error");
    }
  }

  // Removed rows vanish immediately rather than waiting for a reload — the
  // action is unambiguous and instantly reversible by saving again.
  if (state === "removed") return null;

  const price =
    favorite.priceUsdCents !== null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(favorite.priceUsdCents / 100)
      : null;

  const asOf = favorite.refreshedAt ?? favorite.createdAt;

  return (
    <div className="flex gap-4 rounded-2xl border border-char-200/70 bg-white p-4">
      <Link
        href={`/vehicle/${favorite.vin || favorite.lotNumber}`}
        className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-char-100"
      >
        {favorite.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={favorite.imageUrl}
            alt={favorite.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-char-400">
            {t("noPhoto")}
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/vehicle/${favorite.vin || favorite.lotNumber}`}
          className="line-clamp-1 font-bold text-char-900 hover:text-amber-700"
        >
          {favorite.title}
        </Link>

        <p className="mt-1 text-sm">
          {price ? (
            <span className="font-bold text-amber-600">{price}</span>
          ) : (
            // Absent, not zero — a lot with no bid yet has no price to show.
            <span className="text-char-500">{t("noPrice")}</span>
          )}
          <span className="ml-2 text-xs uppercase tracking-wider text-char-400">
            {favorite.platform}
          </span>
        </p>

        {/* The honesty line. Says what this is: a record, as of a moment. */}
        <p className="mt-1 text-xs text-char-500">
          {t("asOf", { date: format.dateTime(new Date(asOf), { dateStyle: "medium" }) })}
        </p>

        {(state === "error" || state === "unavailable") && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-700">
            <WarningCircle size={14} weight="fill" />
            {state === "unavailable" ? t("refreshUnavailable") : t("actionFailed")}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-4">
          {canRefresh && (
            <button
              type="button"
              onClick={refresh}
              disabled={state === "refreshing" || state === "removing"}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-char-600 underline-offset-4 transition-colors hover:text-amber-700 hover:underline disabled:opacity-60"
            >
              <ArrowClockwise size={14} weight="bold" />
              {state === "refreshing" ? t("refreshing") : t("refresh")}
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={state === "refreshing" || state === "removing"}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-char-600 underline-offset-4 transition-colors hover:text-red-700 hover:underline disabled:opacity-60"
          >
            <Trash size={14} weight="bold" />
            {t("remove")}
          </button>
        </div>
      </div>
    </div>
  );
}
