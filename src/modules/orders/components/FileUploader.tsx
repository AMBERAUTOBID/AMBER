"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { MAX_BYTES, checkUpload, type OrderFileKind } from "../model/fileRules";
import type { OrderStage } from "../model/stages";

interface Item {
  name: string;
  status: "uploading" | "done" | "error";
  message?: string;
  percent: number;
}

function kindOf(file: File): OrderFileKind {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "photo";
  return "document";
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

/**
 * Uploading files to one stage of a case file.
 *
 * **The bytes never touch our server.** Each file gets a presigned URL and the
 * browser PUTs straight to R2 — the only route past a serverless request body
 * limit for a 150 MB loading video, and it means a slow upload from a terminal
 * on bad wifi occupies nothing of ours while it runs.
 *
 * Three steps per file: ask for a link, send the bytes, tell the server it
 * landed. The third step is not a formality — the server re-checks the bucket
 * before marking the row complete, because a browser saying "done" is not
 * evidence and a cancelled upload would otherwise leave a row that renders as
 * a file and serves a signed URL to nothing.
 *
 * The same rules that guard the signature also run here first, purely so the
 * feedback is instant: a 600 MB video should be refused before it is read, not
 * after it has been uploaded. The server does not trust this copy.
 */
export default function FileUploader({
  orderId,
  stage,
}: {
  orderId: string;
  stage: OrderStage;
}) {
  const t = useTranslations("AdminOrders.files");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  function update(name: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.name === name ? { ...i, ...patch } : i)));
  }

  /**
   * XHR rather than fetch, for one reason: `upload.onprogress`. Fetch still
   * cannot report request progress, and a 150 MB upload with no bar is
   * indistinguishable from a frozen page — which is when somebody closes the
   * tab and loses twenty minutes of transfer.
   */
  function put(url: string, file: File, onProgress: (percent: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status)));
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(file);
    });
  }

  async function upload(files: FileList) {
    setBusy(true);
    setItems(
      Array.from(files).map((f) => ({ name: f.name, status: "uploading" as const, percent: 0 }))
    );

    for (const file of Array.from(files)) {
      const kind = kindOf(file);
      const decision = checkUpload(kind, file.type, file.size);
      if (!decision.ok) {
        update(file.name, {
          status: "error",
          message:
            decision.reason === "size"
              ? t("tooLarge", { name: file.name, size: mb(file.size), max: mb(MAX_BYTES[kind]) })
              : t("wrongType", { name: file.name }),
        });
        continue;
      }

      try {
        const presigned = await fetch(`/api/admin/orders/${orderId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "presign",
            stage,
            kind,
            contentType: file.type,
            sizeBytes: file.size,
            fileName: file.name,
          }),
        }).then((r) => r.json());

        if (!presigned?.ok) throw new Error(presigned?.reason ?? "presign");

        await put(presigned.url as string, file, (percent) => update(file.name, { percent }));

        const confirmed = await fetch(`/api/admin/orders/${orderId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", fileId: presigned.fileId }),
        }).then((r) => r.json());
        if (!confirmed?.ok) throw new Error("confirm");

        update(file.name, { status: "done", percent: 100 });
      } catch {
        update(file.name, { status: "error", message: t("failed", { name: file.name }) });
      }
    }

    setBusy(false);
    if (input.current) input.current.value = "";
    // Re-render the page so the new files appear in their stage rather than
    // living only in this component's state until somebody reloads.
    router.refresh();
  }

  return (
    <div className="mt-3">
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files?.length && void upload(e.target.files)}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-char-200 bg-white px-4 py-2 text-sm font-semibold text-char-700 transition-colors hover:border-amber-400 hover:text-amber-700 disabled:opacity-50"
      >
        <UploadSimple size={15} weight="bold" />
        {t("upload")}
      </button>

      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={item.name} className="text-xs">
              <span
                className={
                  item.status === "error"
                    ? "text-red-700"
                    : item.status === "done"
                      ? "text-green-700"
                      : "text-char-600"
                }
              >
                {item.message ?? `${item.name} — ${item.percent}%`}
              </span>
              {item.status === "uploading" && (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-char-100">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
