import { getVehicleDetail } from "@/modules/inventory/api";
import { snapshotFromLot, type FavoriteSnapshot } from "../model/snapshot";

/**
 * Fetches a lot and reduces it to a saveable row, or null.
 *
 * The reason this exists rather than each route calling `getVehicleDetail`:
 * **that function throws.** `apibaraGet` rejects on any non-2xx, so an
 * unknown lot number, an upstream 502 or an expired API key all arrive as an
 * exception — and an uncaught one in a route handler is a 500. Found by
 * testing: saving a made-up lot reference returned 500 instead of "no such
 * lot", which is both a worse answer and a needless error-log entry.
 *
 * Callers get one honest answer — "there is no snapshot to be had" — and
 * decide their own status code, because the two callers mean different things
 * by it: saving a lot that doesn't exist is the client's mistake (404), while
 * failing to refresh one already saved is ours or Apibara's (502).
 */
export async function fetchLotSnapshot(lotRef: string): Promise<FavoriteSnapshot | null> {
  try {
    const detail = await getVehicleDetail(lotRef);
    if (!detail?.ok || !detail.data) return null;
    return snapshotFromLot(detail.data);
  } catch (e) {
    // Logged, not swallowed silently: a sustained run of these means the key
    // or the quota is the problem, not the lot.
    console.error("[favorites] lot lookup failed:", lotRef, e);
    return null;
  }
}
