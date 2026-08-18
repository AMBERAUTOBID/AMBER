import { clsx } from "clsx";
import UsFlag from "@/shared/ui/UsFlag";

/**
 * "Made in USA" — one component, so the claim is worded and dressed the same
 * everywhere it appears.
 *
 * It matters commercially rather than decoratively: a US-built car clears EU
 * customs at 0% duty, which is the single largest saving on the whole landed
 * cost. The badge is how a visitor spots those while scanning, so it has to be
 * legible at a glance on a photo and never look like a stray bit of text.
 *
 * ⚠️ Whether a car qualifies is NOT decided here. `isUsaBuiltVin()` in
 * modules/pricing answers that, and it is the same function the duty waiver
 * uses — a second rule living in this module is how a card would come to fly a
 * flag over a quote that still charged 10%.
 *
 * Two dressings, because the badge sits on two very different backgrounds:
 * `overlay` floats on a photo of unknown colour and needs its own opaque
 * ground; `inline` sits in the page next to other chips and needs a border
 * instead.
 */
export default function MadeInUsaBadge({
  label,
  variant = "overlay",
}: {
  label: string;
  variant?: "overlay" | "inline";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        variant === "overlay"
          ? "bg-white/95 px-2.5 py-1 text-xs text-char-800 shadow-sm shadow-char-900/10 backdrop-blur-sm"
          : "border border-char-200 bg-white px-3 py-1.5 text-xs text-char-700"
      )}
    >
      {/* The hairline ring keeps the white stripes from bleeding into a white
          pill — without it the flag loses its right-hand edge. */}
      <UsFlag size={19} className="shrink-0 rounded-[2px] ring-1 ring-char-900/15" />
      {label}
    </span>
  );
}
