import type { OrderStage } from "@/shared/db/schema";

/**
 * What may be uploaded to a case file, how big, and under what object key.
 *
 * Pure — no I/O, no SDK, no environment. That is the point: these are the
 * decisions worth testing, and every one of them is enforced on the SERVER
 * before a presigned URL is ever issued. A presigned upload URL is a bearer
 * token for writing to our bucket, so every constraint has to be baked into
 * the signature; there is no second chance to check once it is handed out.
 */

export type OrderFileKind = "photo" | "video" | "document";

/**
 * Content type → file extension, per kind. This mapping is also the
 * allowlist: a type absent from it cannot be uploaded at all.
 *
 * The extension comes from HERE and never from the uploaded filename. A
 * filename is attacker-controlled text; deriving the stored key from it is how
 * `invoice.pdf.exe` ends up in a bucket, and how `../../` ends up in a key.
 * The original name is kept in the database for the download, where it is a
 * label rather than a path.
 *
 * Two entries exist purely because of what the yard actually photographs with:
 * **`image/heic`** is what an iPhone produces by default, and **`video/quicktime`**
 * is what it records. Rejecting either would mean telling someone standing in
 * a terminal in Savannah to go and convert files. HEIC does not render in
 * every browser — that is a display problem to solve with a converted preview,
 * not a reason to refuse the original.
 */
export const ALLOWED_TYPES: Record<OrderFileKind, Record<string, string>> = {
  photo: {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
  },
  video: {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
  },
  document: {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
  },
};

/**
 * Per-kind size ceilings, in bytes.
 *
 * Video is generous because a container-loading clip genuinely runs to
 * hundreds of megabytes and the whole reason for uploading straight to R2 is
 * that such a file cannot pass through a serverless request body. The ceiling
 * still exists: without one, a signed URL is an invitation to fill the bucket.
 */
export const MAX_BYTES: Record<OrderFileKind, number> = {
  photo: 25 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  document: 50 * 1024 * 1024,
};

export type UploadRejection =
  | { ok: false; reason: "type"; kind: OrderFileKind; contentType: string }
  | { ok: false; reason: "size"; kind: OrderFileKind; sizeBytes: number; maxBytes: number }
  | { ok: false; reason: "empty" };

export type UploadDecision = { ok: true; extension: string } | UploadRejection;

/**
 * May this file be uploaded, and under what extension?
 *
 * Returns a reason rather than a boolean so the admin is told *which* rule
 * stopped them. "Upload failed" after waiting on a 400 MB video is the worst
 * possible feedback, and the difference between "wrong format" and "too large"
 * is the difference between re-exporting and re-shooting.
 */
export function checkUpload(
  kind: OrderFileKind,
  contentType: string,
  sizeBytes: number
): UploadDecision {
  // Browsers send `image/jpeg; charset=...` on occasion, and casing varies.
  const type = contentType.split(";")[0]!.trim().toLowerCase();

  const extension = ALLOWED_TYPES[kind][type];
  if (!extension) return { ok: false, reason: "type", kind, contentType: type };

  // Zero bytes is a failed read on the client, not a file. Signing for it
  // would create a database row pointing at an empty object.
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, reason: "empty" };

  const maxBytes = MAX_BYTES[kind];
  if (sizeBytes > maxBytes) return { ok: false, reason: "size", kind, sizeBytes, maxBytes };

  return { ok: true, extension };
}

/**
 * Where an order's file lives in the bucket.
 *
 * `orders/<orderId>/<stage>/<fileId><ext>` — every segment is a value this
 * application generated (two uuids and a stage from a fixed vocabulary), so
 * the key cannot be steered by anything a user typed. It is also readable in
 * the R2 console, which matters the first time something has to be found by
 * hand at two in the morning.
 *
 * The file's own uuid rather than its name is what makes the key unique: two
 * people uploading `IMG_0042.jpg` to the same stage must not collide, and a
 * re-upload must not silently overwrite the first.
 */
export function orderFileKey(
  orderId: string,
  stage: OrderStage,
  fileId: string,
  extension: string
): string {
  return `orders/${orderId}/${stage}/${fileId}${extension}`;
}

/**
 * A filename safe to put in a `Content-Disposition` header.
 *
 * Quotes and newlines are stripped rather than escaped: a newline would let a
 * crafted filename inject a second header into the signed download response,
 * and no legitimate filename contains one. Length is capped because some
 * clients truncate long headers in ways that corrupt what follows.
 *
 * ⚠️ **The order of these two replacements matters and is not obvious.**
 * Separators are turned into dashes FIRST. Stripping quotes and backslashes
 * first instead — the version this started as — consumed the backslash before
 * anything could turn it into a separator, so a Windows path came back as
 * `C:Usersxtitle.pdf` with the words silently welded together. Safe, but not
 * what it claims to do, and unreadable to whoever receives the file.
 */
export function safeDownloadName(fileName: string, fallback = "file"): string {
  const cleaned = fileName
    .replace(/[/\\]/g, "-")
    .replace(/[\r\n"]/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}
