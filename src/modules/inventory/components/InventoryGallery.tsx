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
}: {
  photos: { thumb: string; large: string }[];
  title: string;
  /** Engine-start clip recorded by the auction house, when there is one. */
  engineVideoUrl?: string | null;
  /** External 360° walkaround viewer, when there is one. */
  view360Url?: string | null;
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
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-char-100 text-sm text-char-400">
        {t("noPhotos")}
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

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t("media.previousPhoto")}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-char-900 opacity-0 shadow-sm transition-opacity hover:bg-white focus-visible:opacity-100 group-hover:opacity-100"
            >
              <CaretLeft size={18} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t("media.nextPhoto")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-char-900 opacity-0 shadow-sm transition-opacity hover:bg-white focus-visible:opacity-100 group-hover:opacity-100"
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.thumb} alt="" className="h-full w-full object-cover" />
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
