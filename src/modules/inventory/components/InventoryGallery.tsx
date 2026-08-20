"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import {
  CaretLeft,
  CaretRight,
  Cube,
  Engine,
  X,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";

export default function InventoryGallery({
  photos,
  title,
  engineVideoUrl = null,
  view360Url = null,
  saveSlot,
}: {
  photos: { thumb: string; large: string }[];
  title: string;
  /** Engine-start clip recorded by the auction house, when there is one. */
  engineVideoUrl?: string | null;
  /** External 360° walkaround viewer, when there is one. */
  view360Url?: string | null;
  /**
   * The save-to-favourites control, floated over the top-right of the photo.
   *
   * A slot rather than an import, for the same reason LotCard takes one: only
   * the caller knows whether this lot is already saved, and it reads that for
   * the whole page in a single query.
   *
   * It sits on the photo now because the tall action panel it used to live in
   * was removed from the page header — that panel was most of the empty space
   * the owner reported. On the photo is also where a visitor already looks for
   * it, since that is where the search cards put it.
   */
  saveSlot?: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const t = useTranslations("VehicleDetail");

  const step = useCallback(
    (delta: number) => {
      setActive((i) => (i + delta + photos.length) % photos.length);
    },
    [photos.length]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (videoOpen) {
        if (e.key === "Escape") setVideoOpen(false);
        return;
      }
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, videoOpen]);

  if (photos.length === 0) {
    // The save control still belongs here — a lot with no photographs is
    // exactly the kind somebody keeps to come back to.
    return (
      <div className="relative flex aspect-[4/3] items-center justify-center rounded-2xl bg-char-100 text-sm text-char-500">
        {t("noPhotos")}
        {saveSlot && <div className="absolute right-3 top-3 z-10">{saveSlot}</div>}
      </div>
    );
  }

  return (
    <div>
      <div className="group relative overflow-hidden rounded-2xl bg-char-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[active].large}
          alt={t("photoAlt", { title, index: active + 1, total: photos.length })}
          className="aspect-[4/3] w-full object-cover"
        />

        {/* Top-right, opposite the auction-house badges, and above the arrows
            in stacking order so a click near the corner saves rather than
            advancing the photo. */}
        {saveSlot && <div className="absolute right-3 top-3 z-20">{saveSlot}</div>}

        {/* Auction-house extras, mirrored from how the source sites badge them */}
        {(view360Url || engineVideoUrl) && (
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {view360Url && (
              <a
                href={view360Url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-char-900/75 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-char-900"
              >
                <Cube size={14} weight="fill" />
                {t("media.view360")}
              </a>
            )}
            {engineVideoUrl && (
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-char-900/75 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-char-900"
              >
                <Engine size={14} weight="fill" />
                {t("media.engineStart")}
              </button>
            )}
          </div>
        )}

        <span className="absolute bottom-3 right-3 rounded-full bg-char-900/70 px-2.5 py-1 text-xs font-semibold tabular-nums text-white backdrop-blur-sm">
          {active + 1} / {photos.length}
        </span>

        {/*
          ⚠️ `[@media(hover:none)]:opacity-100` IS WHAT MAKES THESE EXIST ON A
          PHONE. They reveal on hover, which is right on a desktop and means
          "never" on a touch screen: measured on a 375px viewport 2026-08-19,
          `hover: none` matched and both arrows sat at `opacity: 0` — 44×44px of
          perfectly sized, permanently invisible button. `focus-visible` is no
          help either, since it needs a keyboard.

          Found while measuring tap targets, which is the irony worth recording:
          the audit that sized them correctly could not see that they were never
          drawn. A target list counts pixels; it does not ask whether anything
          is painted in them.
        */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t("media.previousPhoto")}
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-char-900 opacity-0 shadow-sm transition-opacity hover:bg-white focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <CaretLeft size={18} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t("media.nextPhoto")}
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-char-900 opacity-0 shadow-sm transition-opacity hover:bg-white focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <CaretRight size={18} weight="bold" />
            </button>
          </>
        )}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {photos.map((photo, i) => (
          <button
            key={photo.thumb + i}
            type="button"
            onClick={() => setActive(i)}
            className={clsx(
              "h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
              i === active ? "border-amber-500" : "border-transparent opacity-70 hover:opacity-100"
            )}
          >
            {/* The strip scrolls sideways and is often a dozen squares long, so
                the ones past the edge wait. They are ~5 KB each now (see
                photoSize.ts), which makes this a small win — it was a large one
                when each of them was a 164 KB photograph. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumb}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {videoOpen && engineVideoUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("media.engineStart")}
          onClick={() => setVideoOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-char-900/80 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-char-900">{t("media.engineStart")}</p>
              <button
                type="button"
                onClick={() => setVideoOpen(false)}
                aria-label={t("media.close")}
                className="rounded-full p-1.5 text-char-500 transition-colors hover:bg-char-100 hover:text-char-900"
              >
                <X size={18} weight="bold" />
              </button>
            </div>
            <video
              src={engineVideoUrl}
              controls
              autoPlay
              className="mt-3 w-full rounded-xl bg-char-900"
            />
            {/* The clip is served straight from the auction house's own media
                host, which occasionally refuses hotlinked playback - this keeps
                a working way to watch it rather than a dead black box. */}
            <a
              href={engineVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-char-500 underline transition-colors hover:text-char-800"
            >
              <ArrowSquareOut size={13} />
              {t("media.openVideoExternally")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
