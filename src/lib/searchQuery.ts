/**
 * Shared, isomorphic helpers for turning user input (the hero/search widget)
 * into Apibara search filters. Kept separate from src/lib/apibara.ts (which
 * is server-only and holds the API key) so SearchWidget.tsx can import this
 * safely as a client component.
 */

import { MAKES_BY_CATEGORY, MODELS_BY_CATEGORY } from "./vehicleData";

// The "More" category's picker is an equipment type (Trailer, Boat, ATV...),
// not a brand - map it to Apibara's real `type` filter values (confirmed via
// GET /vehicles/filters; exact strings differ slightly, e.g. "Mobile Home"
// vs "MOTOR HOME").
export const MORE_TYPE_TO_APIBARA_TYPE: Record<string, string> = {
  Trailer: "TRAILERS",
  Boat: "BOAT",
  ATV: "ATV",
  Bus: "BUS",
  "Industrial Equipment": "INDUSTRIAL EQUIPMENT",
  "Jet Ski": "JET SKI",
  "Mobile Home": "MOTOR HOME",
  Other: "OTHER",
};

/**
 * Automobile/Truck/Motorcycle share real make names (Honda and BMW both make
 * cars AND motorcycles; Ford/Chevrolet/GMC/Toyota/Nissan/Jeep make both cars
 * AND trucks) - a `make`-only filter can't tell them apart, which is exactly
 * what caused "Motorcycle > Honda" to return Civics and Ridgelines instead of
 * bikes. Apibara's `type` param only accepts one value per request (no OR),
 * so a category maps to a *group* of type values that get queried in
 * parallel and merged - confirmed live that each of these values is real and
 * populated (e.g. Freightliner lots split across both "TRUCK" and "HEAVY
 * DUTY TRUCKS").
 */
export const CATEGORY_TYPE_GROUPS: Record<"automobile" | "truck" | "motorcycle", string[]> = {
  automobile: ["AUTOMOBILE", "SEDAN", "COUPE", "SUV", "VAN"],
  truck: ["PICKUP", "TRUCK", "HEAVY DUTY TRUCKS", "MEDIUM DUTY/BOX TRUCKS"],
  motorcycle: ["MOTORCYCLE", "DIRT BIKE"],
};

const ALL_MAKES = Array.from(new Set(Object.values(MAKES_BY_CATEGORY).flat())).sort(
  (a, b) => b.length - a.length // longest first, so "Land Rover" wins over "Land"
);

const MAKE_MODEL_PAIRS = Object.values(MODELS_BY_CATEGORY)
  .flatMap((modelsByMake) =>
    Object.entries(modelsByMake).flatMap(([make, models]) => models.map((model) => ({ make, model })))
  )
  .sort((a, b) => b.model.length - a.model.length); // longest model name first

/**
 * Apibara's `s` param only matches VIN/lot number/exact title, not a fuzzy
 * "Honda Civic"-style query (confirmed live: "Range Rover Sport" via `s`
 * returned zero results, while make="Land Rover"&model="Range Rover Sport"
 * returned real lots). So free text needs to be split into make/model
 * filters using our own make/model lists instead of passed through as-is.
 */
export function parseFreeTextQuery(q: string): { make?: string; model?: string; s?: string } {
  const trimmed = q.trim();
  if (!trimmed) return {};

  // Looks like a VIN or a lot/stock number - use the strict search param.
  if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(trimmed) || /^\d{6,}$/.test(trimmed)) {
    return { s: trimmed };
  }

  const lower = trimmed.toLowerCase();

  const modelMatch = MAKE_MODEL_PAIRS.find((pair) => lower.includes(pair.model.toLowerCase()));
  if (modelMatch) return { make: modelMatch.make, model: modelMatch.model };

  const matchedMake = ALL_MAKES.find((make) => lower.includes(make.toLowerCase()));
  if (!matchedMake) return { s: trimmed };

  const model = trimmed.toLowerCase().replace(matchedMake.toLowerCase(), "").trim();
  return { make: matchedMake, model: model || undefined };
}
