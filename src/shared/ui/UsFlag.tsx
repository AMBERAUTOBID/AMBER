/**
 * The flag of the United States, drawn rather than typed.
 *
 * ⚠️ THIS EXISTS BECAUSE THE EMOJI DOES NOT RENDER ON WINDOWS. The badge used
 * to be the literal character `🇺🇸`, which is not a glyph at all — it is the
 * regional-indicator pair `U` + `S`, and a font is expected to substitute a
 * flag for it. Windows ships no flag glyphs in Segoe UI Emoji, so the browser
 * falls back to drawing the two indicator letters, and the badge read
 * **"us Pagaminta JAV"** to every visitor on Windows. Reported by the owner
 * 2026-08-17 from their own screen.
 *
 * The failure is invisible on macOS, iOS and Android, where the same string
 * looks perfect — which is exactly why it survived review. An emoji flag is a
 * font-dependent promise; an SVG is not.
 *
 * Proportions are the official ones (Executive Order 10834): 1:1.9 overall,
 * 13 stripes, and a canton 7 stripes tall by two fifths of the width. At badge
 * size the 50 stars resolve into a pale haze, which is what a real flag does
 * at that distance too — the point is that it reads as *this* flag at a glance
 * and stays crisp when scaled up.
 */

/** Official geometry, in flag units. Kept as numbers so the star field below
 *  is derived from them rather than hand-placed. */
const W = 7410;
const H = 3900;
const STRIPE = H / 13;
const CANTON_W = 0.4 * W;
const CANTON_H = 7 * STRIPE;

/**
 * All fifty stars as ONE path.
 *
 * Fifty `<use>` elements would need a unique `id` per flag instance to stay
 * valid HTML, and a search page renders a dozen flags at once — so the whole
 * field is concatenated into a single `d` string, computed once when the
 * module loads. One path element per flag, no ids, nothing to collide.
 */
const STAR_FIELD = (() => {
  const outer = (STRIPE * 4) / 5 / 2;
  const inner = outer * 0.382;
  const dx = CANTON_W / 12;
  const dy = CANTON_H / 10;

  function star(cx: number, cy: number) {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      // Starts at -90° so a point faces up, then alternates outer/inner.
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return `M${pts.join("L")}Z`;
  }

  const paths: string[] = [];
  // Nine rows, alternating six and five stars — the standard arrangement.
  for (let row = 0; row < 9; row++) {
    const count = row % 2 === 0 ? 6 : 5;
    for (let col = 0; col < count; col++) {
      const cx = dx * (row % 2 === 0 ? 1 + col * 2 : 2 + col * 2);
      paths.push(star(cx, dy * (row + 1)));
    }
  }
  return paths.join("");
})();

const STRIPES = Array.from({ length: 13 }, (_, i) => i).filter((i) => i % 2 === 0);

/**
 * @param size Rendered width in pixels. Height follows the official ratio.
 */
export default function UsFlag({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={size / (W / H)}
      className={className}
      // Decorative: the label beside it already says "made in the USA", and a
      // screen reader announcing the country twice is noise, not access.
      aria-hidden="true"
      focusable="false"
    >
      <rect width={W} height={H} fill="#fff" />
      {STRIPES.map((i) => (
        <rect key={i} y={i * STRIPE} width={W} height={STRIPE} fill="#b22234" />
      ))}
      <rect width={CANTON_W} height={CANTON_H} fill="#3c3b6e" />
      <path d={STAR_FIELD} fill="#fff" />
    </svg>
  );
}
