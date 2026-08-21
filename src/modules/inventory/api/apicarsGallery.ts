/**
 * The FULL photo gallery for one lot, from apicars' per-lot endpoint.
 *
 * WHY THIS EXISTS — measured 2026-08-21, the owner caught it browsing: a
 * Copart lot showed ONE photo on our page while copart.com had twelve. The
 * cause is the vendors' BULK feeds: apicars' `get-active-lots` (our ingest)
 * truncates 94% of lots to a single image (115,064 of ~122k measured), and
 * Apibara's detail is a per-lot lottery for Copart (sampled 1–2 images on 3
 * of 5 lots, while IAAI lots carried 11–18). But apicars' per-lot
 * `get-car-lot` returned ALL twelve — the same set the auction shows — so the
 * full gallery is available from the vendor we already pay, one lot at a
 * time.
 *
 * COST CONTROL, because each successful call bills $0.01 from the PAYG
 * reserve (Active Lots Pro's "unlimited" covers the bulk endpoint, not
 * necessarily this one): the caller only asks when its own sources produced
 * ≤2 photos, and answers are cached in memory for a day — a gallery does not
 * change once published (a re-run is a NEW lot; see photoSize.ts's history).
 * A vendor failure is cached briefly too, so a down vendor costs one timeout
 * per instance per ten minutes, not one per visitor.
 *
 * Missing `APICARS_API_TOKEN` (production until the owner adds it to Vercel)
 * degrades to null — the page keeps whatever photos it already had.
 */
const APICARS_URL = "https://apicars.auction/api/v1/get-car-lot";
const TTL_OK_MS = 24 * 3_600_000;
const TTL_FAIL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const UPSTREAM_TIMEOUT_MS = 4_000;

const cache = new Map<string, { value: string[] | null; at: number; ttl: number }>();

/** Exported for tests: the payload shape observed live 2026-08-21 —
 * `{"result":[{...lot...}]}`, the lot inside an ARRAY (a one-element list for
 * a lot-number lookup), with `car_photo.photo` an array of CDN URLs. The
 * object and `result.data` forms are tolerated because the vendor's nesting
 * has varied between endpoints. */
export function parseGalleryPayload(json: unknown): string[] | null {
  const root = json as { result?: { data?: unknown } | unknown } | null;
  const unwrapped = (root?.result as { data?: unknown })?.data ?? root?.result ?? null;
  const lot = (Array.isArray(unwrapped) ? unwrapped[0] : unwrapped) as {
    car_photo?: { photo?: unknown };
  } | null;
  const photo = lot?.car_photo?.photo;
  if (!Array.isArray(photo)) return null;
  const urls = photo.filter(
    (u): u is string => typeof u === "string" && u.startsWith("https://")
  );
  return urls.length > 0 ? urls : null;
}

export async function fullGalleryUrls(lotNumber: string): Promise<string[] | null> {
  const token = process.env.APICARS_API_TOKEN?.trim();
  if (!token || !/^\d{6,10}$/.test(lotNumber)) return null;

  const hit = cache.get(lotNumber);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;

  let value: string[] | null = null;
  let ttl = TTL_FAIL_MS;
  try {
    const res = await fetch(APICARS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ lot_number: lotNumber }).toString(),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) {
      value = parseGalleryPayload(await res.json());
      // A 200 with no gallery is an answer, not a failure — the vendor simply
      // has one photo too. Cache it the full day or every view re-bills.
      ttl = TTL_OK_MS;
    }
  } catch {
    // Timeout or network: fall through with the short TTL.
  }

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(lotNumber, { value, at: Date.now(), ttl });
  return value;
}
