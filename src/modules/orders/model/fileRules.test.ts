import { describe, expect, it } from "vitest";
import {
  ALLOWED_TYPES,
  MAX_BYTES,
  checkUpload,
  orderFileKey,
  safeDownloadName,
} from "./fileRules";

describe("checkUpload — what may be signed for", () => {
  it("accepts a normal photo and returns the extension to store it under", () => {
    expect(checkUpload("photo", "image/jpeg", 2_000_000)).toEqual({ ok: true, extension: ".jpg" });
  });

  it("accepts what an iPhone actually produces", () => {
    // The yard photographs with a phone. Refusing its native formats would
    // mean asking someone in a terminal to convert files before uploading.
    expect(checkUpload("photo", "image/heic", 4_000_000)).toEqual({ ok: true, extension: ".heic" });
    expect(checkUpload("video", "video/quicktime", 80_000_000)).toEqual({
      ok: true,
      extension: ".mov",
    });
  });

  it("tolerates the charset browsers sometimes append, and odd casing", () => {
    expect(checkUpload("photo", "image/JPEG; charset=binary", 1000)).toEqual({
      ok: true,
      extension: ".jpg",
    });
  });

  it("refuses a type that is not on the kind's allowlist", () => {
    const result = checkUpload("photo", "application/pdf", 1000);
    expect(result).toEqual({ ok: false, reason: "type", kind: "photo", contentType: "application/pdf" });
  });

  it("refuses executables outright — nothing maps them to an extension", () => {
    for (const kind of ["photo", "video", "document"] as const) {
      expect(checkUpload(kind, "application/x-msdownload", 1000)).toMatchObject({
        ok: false,
        reason: "type",
      });
      expect(checkUpload(kind, "text/html", 1000)).toMatchObject({ ok: false, reason: "type" });
    }
  });

  it("allows a photographed document, but not a video posing as one", () => {
    expect(checkUpload("document", "image/jpeg", 1000)).toMatchObject({ ok: true });
    expect(checkUpload("document", "video/mp4", 1000)).toMatchObject({ ok: false, reason: "type" });
  });

  it("rejects zero and negative sizes as a failed read, not a file", () => {
    expect(checkUpload("photo", "image/jpeg", 0)).toEqual({ ok: false, reason: "empty" });
    expect(checkUpload("photo", "image/jpeg", -1)).toEqual({ ok: false, reason: "empty" });
    expect(checkUpload("photo", "image/jpeg", NaN)).toEqual({ ok: false, reason: "empty" });
  });

  it("enforces each kind's ceiling exactly at the boundary", () => {
    // The boundary is the interesting case: off by one here means either
    // refusing a legal file or signing for one byte more than agreed.
    expect(checkUpload("photo", "image/jpeg", MAX_BYTES.photo)).toMatchObject({ ok: true });
    expect(checkUpload("photo", "image/jpeg", MAX_BYTES.photo + 1)).toMatchObject({
      ok: false,
      reason: "size",
    });
  });

  it("gives video far more room than photos, because a loading clip needs it", () => {
    // 200 MB is a realistic container-loading video and must pass.
    expect(checkUpload("video", "video/mp4", 200 * 1024 * 1024)).toMatchObject({ ok: true });
    // The same file offered as a photo must not.
    expect(checkUpload("photo", "image/jpeg", 200 * 1024 * 1024)).toMatchObject({
      ok: false,
      reason: "size",
    });
  });

  it("reports which rule stopped the upload, not just that one did", () => {
    const tooBig = checkUpload("video", "video/mp4", MAX_BYTES.video + 1);
    expect(tooBig).toEqual({
      ok: false,
      reason: "size",
      kind: "video",
      sizeBytes: MAX_BYTES.video + 1,
      maxBytes: MAX_BYTES.video,
    });
  });

  it("never returns an extension that isn't in the allowlist for that kind", () => {
    // Guards the invariant that the stored extension comes from our table
    // rather than from anything the uploader supplied.
    for (const kind of ["photo", "video", "document"] as const) {
      for (const [type, ext] of Object.entries(ALLOWED_TYPES[kind])) {
        const result = checkUpload(kind, type, 1000);
        expect(result).toEqual({ ok: true, extension: ext });
        expect(ext.startsWith(".")).toBe(true);
      }
    }
  });
});

describe("orderFileKey", () => {
  it("builds a readable key from values the application generated", () => {
    expect(orderFileKey("11111111-1111-1111-1111-111111111111", "at_terminal", "22222222", ".jpg")).toBe(
      "orders/11111111-1111-1111-1111-111111111111/at_terminal/22222222.jpg"
    );
  });

  it("gives two files with the same original name different keys", () => {
    const a = orderFileKey("order-1", "loaded", "file-a", ".jpg");
    const b = orderFileKey("order-1", "loaded", "file-b", ".jpg");
    expect(a).not.toBe(b);
  });

  it("separates stages, so a file cannot land in the wrong folder", () => {
    expect(orderFileKey("o", "won", "f", ".jpg")).not.toBe(orderFileKey("o", "delivered", "f", ".jpg"));
  });
});

describe("safeDownloadName", () => {
  it("keeps an ordinary filename intact", () => {
    expect(safeDownloadName("bill-of-lading.pdf")).toBe("bill-of-lading.pdf");
  });

  it("strips what would break out of the Content-Disposition header", () => {
    // A newline here would let a crafted filename inject a second header into
    // the signed download response.
    expect(safeDownloadName('a"b\r\nX-Injected: 1.pdf')).toBe("abX-Injected: 1.pdf");
  });

  it("flattens path separators so a name can never read as a path", () => {
    expect(safeDownloadName("../../etc/passwd")).toBe("..-..-etc-passwd");
    expect(safeDownloadName("C:\\Users\\x\\title.pdf")).toBe("C:-Users-x-title.pdf");
  });

  it("caps the length", () => {
    expect(safeDownloadName("x".repeat(500))).toHaveLength(120);
  });

  it("falls back rather than emitting an empty filename", () => {
    expect(safeDownloadName('"""')).toBe("file");
    expect(safeDownloadName("   ")).toBe("file");
  });
});
