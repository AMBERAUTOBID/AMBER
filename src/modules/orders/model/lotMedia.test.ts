import { describe, expect, it } from "vitest";
import {
  archivableMedia,
  bestImageUrl,
  estimateArchiveBytes,
  upgradeIaaiWidth,
  type LotMediaItem,
} from "./lotMedia";

// Shapes copied from real detail responses measured 2026-08-09.
const IAAI_IMAGE: LotMediaItem = {
  type: "image",
  thumb: "https://vis.iaai.com/resizer?imageKeys=45938338~SID~I1&width=120&height=90",
  large: "https://vis.iaai.com/resizer?imageKeys=45938338~SID~I1&width=845&height=633",
};
const COPART_IMAGE: LotMediaItem = {
  type: "image",
  thumb: "https://cs.copart.com/v1/AUTH_svc.pdoc00001/lpp/0226/abc_thb.jpg",
  large: "https://cs.copart.com/v1/AUTH_svc.pdoc00001/lpp/0226/abc_hrs.jpg",
  full: "https://cs.copart.com/v1/AUTH_svc.pdoc00001/lpp/0226/abc_hrs.jpg",
};
const IAAI_VIDEO: LotMediaItem = {
  type: "video",
  url: "https://mediaretriever.iaai.com/api/EngineVideoRetriever?partitionKey=45772227&Tenant=iaai",
};
const IAAI_VR360: LotMediaItem = {
  type: "vr360",
  url: "https://vis.iaai.com/Home/ThreeSixtyView?keys=SID-45772227~STP-1~INT-1&iframeview=true",
};

describe("upgradeIaaiWidth", () => {
  it("raises the resizer to the archive width, keeping the aspect ratio", () => {
    // 845x633 is what the API hands over; 3200 is where the original ends.
    expect(upgradeIaaiWidth(IAAI_IMAGE.large!)).toBe(
      "https://vis.iaai.com/resizer?imageKeys=45938338~SID~I1&width=3200&height=2397"
    );
  });

  it("leaves a Copart url completely alone", () => {
    // Measured: _hrs.jpg is LARGER than _ful.jpg. Any "improvement" here
    // would halve the quality of every Copart photo we keep forever.
    expect(upgradeIaaiWidth(COPART_IMAGE.full!)).toBe(COPART_IMAGE.full);
  });

  it("never downscales something the auction already offered bigger", () => {
    const huge = "https://vis.iaai.com/resizer?imageKeys=x&width=5000&height=4000";
    expect(upgradeIaaiWidth(huge)).toBe(huge);
  });

  it("returns the url untouched when the parameters aren't both there", () => {
    // Guards against the resizer's shape changing later: a partial rewrite
    // would produce a url that 404s, and the photo would simply not exist.
    expect(upgradeIaaiWidth("https://vis.iaai.com/resizer?imageKeys=x&width=845")).toBe(
      "https://vis.iaai.com/resizer?imageKeys=x&width=845"
    );
    expect(upgradeIaaiWidth("https://example.com/photo.jpg")).toBe("https://example.com/photo.jpg");
  });

  it("handles a zero or non-numeric dimension without producing NaN in the url", () => {
    const bad = "https://vis.iaai.com/resizer?imageKeys=x&width=0&height=0";
    expect(upgradeIaaiWidth(bad)).toBe(bad);
  });
});

describe("bestImageUrl", () => {
  it("prefers full, then large, then url, then thumb", () => {
    expect(bestImageUrl({ type: "image", thumb: "t", large: "l", full: "f" })).toBe("f");
    expect(bestImageUrl({ type: "image", thumb: "t", large: "l" })).toBe("l");
    expect(bestImageUrl({ type: "image", thumb: "t", url: "u" })).toBe("u");
    expect(bestImageUrl({ type: "image", thumb: "t" })).toBe("t");
  });

  it("upgrades the IAAI url it picked", () => {
    // On IAAI `full` is never populated — measured 0 of 13, 0 of 14, 0 of 18 —
    // so `large` is what gets chosen and it must still be upgraded.
    expect(bestImageUrl(IAAI_IMAGE)).toContain("width=3200");
  });

  it("returns undefined rather than an empty string when there is no url", () => {
    expect(bestImageUrl({ type: "image" })).toBeUndefined();
  });
});

describe("archivableMedia", () => {
  it("keeps images and video, and drops the 360 viewer", () => {
    const result = archivableMedia([IAAI_IMAGE, IAAI_VIDEO, IAAI_VR360]);
    expect(result.map((m) => m.kind)).toEqual(["photo", "video"]);
  });

  it("drops vr360 because it is an HTML page, not a file", () => {
    // Measured: fetching one returns text/html, 26 KB. Recording its url would
    // put a link that rots into a file meant to outlive the listing.
    expect(archivableMedia([IAAI_VR360])).toEqual([]);
  });

  it("numbers photos and videos independently, preserving gallery order", () => {
    const result = archivableMedia([IAAI_IMAGE, IAAI_VIDEO, IAAI_IMAGE, IAAI_IMAGE]);
    const photos = result.filter((m) => m.kind === "photo");
    const videos = result.filter((m) => m.kind === "video");
    expect(photos.map((p) => p.position)).toEqual([0, 1, 2]);
    expect(videos.map((v) => v.position)).toEqual([0]);
  });

  it("skips an unrecognised type instead of guessing at it", () => {
    expect(archivableMedia([{ type: "hologram", url: "https://x/y" }])).toEqual([]);
  });

  it("skips entries that carry no url at all", () => {
    expect(archivableMedia([{ type: "image" }, { type: "video" }])).toEqual([]);
  });

  it("handles missing and empty media without throwing", () => {
    expect(archivableMedia(undefined)).toEqual([]);
    expect(archivableMedia([])).toEqual([]);
  });

  it("tags content types the storage layer will accept", () => {
    const result = archivableMedia([COPART_IMAGE, IAAI_VIDEO]);
    expect(result[0]!.contentType).toBe("image/jpeg");
    expect(result[1]!.contentType).toBe("video/mp4");
  });
});

describe("estimateArchiveBytes", () => {
  it("gives the admin a number before the import runs, not a spinner", () => {
    const media = archivableMedia([IAAI_IMAGE, IAAI_IMAGE, IAAI_VIDEO]);
    const bytes = estimateArchiveBytes(media);
    // Two upgraded IAAI photos (~670 KB each) plus one video (~12 MB).
    expect(bytes).toBe(2 * 670 * 1024 + 12 * 1024 * 1024);
  });

  it("costs a Copart photo less than an upgraded IAAI one", () => {
    // Measured medians differ by roughly 2.7x; an estimate that ignored that
    // would mislead on exactly the lots with the most photos.
    const iaai = estimateArchiveBytes(archivableMedia([IAAI_IMAGE]));
    const copart = estimateArchiveBytes(archivableMedia([COPART_IMAGE]));
    expect(iaai).toBeGreaterThan(copart);
  });

  it("is zero for nothing", () => {
    expect(estimateArchiveBytes([])).toBe(0);
  });
});
