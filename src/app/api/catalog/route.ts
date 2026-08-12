import { NextResponse, type NextRequest } from "next/server";
import { listMakes, getModelTree } from "@/modules/inventory/api/postgresSource";
import { getAuctionSource } from "@/modules/inventory/api";

/**
 * The search box's own vocabulary: which makes exist and, for one make, which
 * models — both counted from the catalogue we hold.
 *
 * WHY A ROUTE RATHER THAN A GENERATED FILE. The alternative was to write the
 * lists into a `.ts` file at build time. That ships 5,263 make/model pairs to
 * every visitor whether they open the picker or not, and freezes the counts at
 * whenever the file was last regenerated. Here the makes are one small
 * response, a make's models are fetched only when that make is chosen, and both
 * are an hour old at worst.
 *
 * DEGRADES TO THE HAND-WRITTEN LIST. When search is served by Apibara the
 * `auction_*` tables are empty, so this answers with nothing and the widget
 * falls back to `vehicleData.ts` — the standing rule that the Apibara build
 * must stay shippable on its own.
 */

/**
 * A category tab in the widget, as normalised vehicle classes.
 *
 * "More" is everything that is not a car, a bike or a truck, listed rather than
 * negated so a class added to the normaliser later does not silently start
 * appearing under it.
 */
const CATEGORY_CLASSES: Record<string, string[]> = {
  automobile: ["automobile"],
  motorcycle: ["motorcycle"],
  truck: ["truck"],
  more: ["trailer", "boat", "jet_ski", "atv", "bus", "equipment", "rv", "other"],
};

export async function GET(request: NextRequest) {
  // Only the local source owns a catalogue to read. Asked while Apibara is
  // serving search, this answers empty rather than erroring — the widget reads
  // an empty list as "use the built-in one".
  if (getAuctionSource().name !== "postgres") {
    return NextResponse.json({ makes: [], tree: [] });
  }

  const params = request.nextUrl.searchParams;
  const make = params.get("make");
  const category = params.get("category");
  const classes = category ? CATEGORY_CLASSES[category] : undefined;

  try {
    if (make) {
      const tree = await getModelTree(make, classes);
      return NextResponse.json(
        { tree },
        // Shared cache only: a browser holding this for an hour would keep
        // showing yesterday's counts after a hard refresh.
        {
          headers: {
            // `max-age=0` is load-bearing: without it a browser applies its own
            // heuristic freshness and keeps serving yesterday's list from disk,
            // which is exactly what it did during development — the shared
            // cache is the one that should hold this, not the visitor's.
            "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
      );
    }

    const makes = await listMakes(classes);
    return NextResponse.json(
      { makes },
      {
          headers: {
            // `max-age=0` is load-bearing: without it a browser applies its own
            // heuristic freshness and keeps serving yesterday's list from disk,
            // which is exactly what it did during development — the shared
            // cache is the one that should hold this, not the visitor's.
            "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
    );
  } catch (error) {
    // A picker that cannot reach the database must not take the search page
    // with it: the widget still works from the built-in list.
    console.error("[catalog] lookup failed", error);
    return NextResponse.json({ makes: [], tree: [] }, { status: 200 });
  }
}
