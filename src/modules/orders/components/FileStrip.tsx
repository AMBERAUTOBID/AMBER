"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  EyeSlash,
  FileText,
  FilmSlate,
  Image as ImageIcon,
  Trash,
} from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "@/i18n/navigation";

export interface StripFile {
  id: string;
  kind: string;
  url: string | null;
  fileName: string;
  visibleToClient: boolean;
}

/**
 * The files on one stage, as staff see them: everything, including what the
 * client cannot, and with the two controls that decide which is which.
 *
 * **Files default to visible, so hiding has to be reachable.** That default was
 * chosen on the grounds that photographs are the whole point of a case file and
 * should reach the client the moment they land — but it only holds if a
 * mistake can be taken back. Until now the API implemented `visibility` and
 * `delete` and nothing called them, which left an admin able to publish a
 * photo of the wrong car and unable to do anything about it.
 *
 * ⚠️ **Hiding is not unpublishing.** A client who already opened the file has
 * seen it, and no flag reaches into their memory or their downloads. Hiding
 * stops it being served from here on; it is a remedy, not an undo. That
 * asymmetry is why the defaults are what they are and why deleting asks first.
 */
export default function FileStrip({
  orderId,
  files,
}: {
  orderId: string;
  files: StripFile[];
}) {
  const t = useTranslations("AdminOrders.files");
  const router = useRouter();

  /**
   * Busy is per FILE, not per strip. A stage can hold twenty photographs, and
   * greying out all of them because one is being deleted misreports what is
   * happening — the operator needs to see which tile is the one waiting.
   */
  const [busyId, setBusyId] = useState<string | null>(null);

  async function send(fileId: string, payload: Record<string, unknown>) {
    setBusyId(fileId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, fileId }),
      });
      // Re-render from the server rather than patching local state: the row is
      // the truth, and a delete that failed at the bucket returns 502 with the
      // file deliberately still there. Optimistic removal would show it gone.
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {files.map((file) => {
        const busy = busyId === file.id;
        const Icon =
          file.kind === "video" ? FilmSlate : file.kind === "photo" ? ImageIcon : FileText;

        return (
          <div key={file.id} className={busy ? "opacity-50" : ""}>
            <div className="relative">
              {file.kind === "photo" && file.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.url}
                  alt={file.fileName}
                  loading="lazy"
                  className={`h-16 w-24 rounded-lg object-cover ${
                    file.visibleToClient ? "" : "opacity-40"
                  }`}
                />
              ) : (
                <a
                  href={file.url ?? undefined}
                  title={file.fileName}
                  className={`inline-flex h-16 w-24 items-center justify-center rounded-lg border bg-char-50 text-char-500 transition-colors hover:border-amber-400 ${
                    // A file whose upload never completed has no URL. Dashed,
                    // so it reads as an empty slot rather than a document that
                    // silently does nothing when clicked — and it now has a
                    // delete button, which is the only way to clear one.
                    file.url ? "border-char-200" : "border-dashed border-char-300"
                  } ${file.visibleToClient ? "" : "opacity-40"}`}
                >
                  <Icon size={20} />
                </a>
              )}

              {/* The state, on the tile. The button below performs the change;
                  this says what is true now, so a glance across twenty
                  thumbnails answers "what does the client see". */}
              {!file.visibleToClient && (
                <span className="pointer-events-none absolute left-1 top-1 rounded bg-char-900/75 p-1 text-white">
                  <EyeSlash size={11} weight="bold" />
                </span>
              )}
            </div>

            <div className="mt-1 flex w-24 items-center justify-center gap-3">
              {/* A toggle button, not two buttons: aria-label names the thing
                  being toggled and aria-pressed carries the state, so it is
                  announced as "hidden from the client, pressed" rather than
                  leaving a screen reader to guess what an eye means. */}
              <button
                type="button"
                disabled={busy}
                aria-label={t("hidden")}
                aria-pressed={!file.visibleToClient}
                title={file.visibleToClient ? t("hidden") : t("visible")}
                onClick={() =>
                  void send(file.id, { action: "visibility", visible: !file.visibleToClient })
                }
                className={`transition-colors disabled:opacity-50 ${
                  file.visibleToClient
                    ? "text-char-400 hover:text-char-700"
                    : "text-amber-600 hover:text-amber-700"
                }`}
              >
                <EyeSlash size={14} />
              </button>

              {/* Deleting removes the bytes from R2 before the row, and no part
                  of it is reversible — unlike a cost line, which can be typed
                  again. Hence a stop that cannot be missed, on a control that
                  sits a few pixels from a thumbnail somebody is scrolling past. */}
              <button
                type="button"
                disabled={busy}
                aria-label={t("delete")}
                title={t("delete")}
                onClick={() => {
                  if (!window.confirm(t("deleteConfirm"))) return;
                  void send(file.id, { action: "delete" });
                }}
                className="text-char-400 transition-colors hover:text-red-600 disabled:opacity-50"
              >
                <Trash size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
