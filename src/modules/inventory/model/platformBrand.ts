/**
 * The auctions' own colours for the platform badge, owner-requested
 * 2026-08-21: a red IAAI and a blue Copart are recognisable at a glance where
 * two grey pills were not.
 *
 * Both are the brands' actual logo colours, and both were CHECKED, not
 * eyeballed: white text measures 6.67:1 on the Copart blue and 5.88:1 on the
 * IAAI red — above the 4.5:1 text bar, so the badge stays readable, not just
 * pretty. An unknown platform keeps the neutral charcoal pill rather than
 * guessing a brand.
 *
 * Two variants because the two surfaces differ: cards float the badge over a
 * photograph (slight translucency + blur, like the pill it replaces), the lot
 * page sits it on white (solid).
 */
const SOLID: Record<string, string> = {
  copart: "bg-[#005DAA]",
  iaai: "bg-[#C8102E]",
};

const GLASS: Record<string, string> = {
  copart: "bg-[#005DAA]/85",
  iaai: "bg-[#C8102E]/85",
};

export function platformBadgeClass(
  platform: string | null | undefined,
  surface: "photo" | "page" = "page"
): string {
  const key = (platform ?? "").trim().toLowerCase();
  const map = surface === "photo" ? GLASS : SOLID;
  return map[key] ?? (surface === "photo" ? "bg-char-900/80" : "bg-char-900");
}
