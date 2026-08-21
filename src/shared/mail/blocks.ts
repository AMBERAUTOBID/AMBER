/**
 * How each block becomes HTML, and how the same block becomes plain text.
 *
 * The two renderers live side by side in this file rather than in two files
 * on purpose: they are one decision expressed twice, and splitting them is how
 * a block gets added to one and forgotten in the other.
 *
 * **Everything is escaped.** No caller string reaches the HTML unescaped —
 * see `inline()`. Names, vehicle titles and admin-entered notes all pass
 * through here, and `Smith & Sons` must render as `Smith & Sons` rather than
 * as a broken entity, quite apart from anything hostile.
 *
 * The markup style is 2005 on purpose: nested `<table>` elements, attributes
 * for alignment, every rule written inline. Outlook on Windows renders through
 * Word, which has no flexbox, no grid, no `float` worth relying on, and — the
 * one that catches people — ignores a stylesheet's rules on elements it
 * decided to lay out itself.
 */
import { COLOR, FONT, FONT_MONO, WIDTH, palette } from "./theme";
import type { DetailRow, EmailBlock } from "./types";

/* ------------------------------------------------------------------ text --- */

/** The five characters that change meaning inside markup or an attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only these schemes become links.
 *
 * A caller assembling a link from user input is not a scenario we expect, but
 * `javascript:` and `data:` URLs in mail are a known phishing shape, and the
 * cost of excluding them is a regex alternation. Anything else stays literal
 * text, visibly wrong rather than silently dangerous.
 */
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g;

/** `**bold**` → `<strong>`. Applied after escaping, where `*` is inert. */
function bold(escaped: string): string {
  return escaped.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

/**
 * A web address or an email address written into a sentence, unmarked.
 *
 * Copy that predates this module says things like "view it here: {url}" or
 * "write to {email}" and interpolates the bare thing. Two different failures
 * follow from leaving them alone, and both were visible in a real inbox:
 *
 * - A **URL** renders as grey text the recipient has to select and paste.
 * - An **email address** does get linked — by the mail client, which styles it
 *   in its own link blue. Every other link in the message is brand amber, so
 *   one stray blue address is the single element that looks like it came from
 *   somewhere else.
 *
 * Matching both here means we own the styling of both. The URL alternative is
 * tried first, so an address inside a URL cannot be mistaken for an email.
 *
 * The URL's trailing class excludes `.,;:!?)` so an address ending a sentence
 * does not swallow the full stop into the link.
 */
const BARE_LINK =
  /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

function anchor(href: string, innerHtml: string): string {
  return (
    `<a href="${escapeHtml(href)}" style="color:${COLOR.accentStrong};text-decoration:underline;">` +
    `${innerHtml}</a>`
  );
}

/** Escapes a stretch of plain text and links any bare address inside it. */
function autolink(raw: string): string {
  let out = "";
  let last = 0;
  for (const match of raw.matchAll(BARE_LINK)) {
    const [whole, url, email] = match;
    out += bold(escapeHtml(raw.slice(last, match.index)));
    // An email needs the scheme added; a URL already carries its own.
    out += anchor(url ?? `mailto:${email}`, escapeHtml(whole));
    last = match.index + whole.length;
  }
  return out + bold(escapeHtml(raw.slice(last)));
}

/**
 * Escapes a string and applies the inline subset: `**bold**`, explicit links
 * and bare URLs.
 *
 * The explicit form is matched first and its segments are handed to
 * `autolink` individually, so a URL that already sits inside `[label](url)`
 * cannot be wrapped in a second anchor.
 *
 * None of this can be done as a `replace` over already-escaped input — a URL
 * has to be recognised before `&` in its query string becomes `&amp;`.
 */
export function inline(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label = "", href = ""] = match;
    out += autolink(text.slice(last, match.index));
    out += anchor(href, bold(escapeHtml(label)));
    last = match.index + whole.length;
  }
  return out + autolink(text.slice(last));
}

/** Line breaks survive into HTML; blocks stay separate elements. */
function inlineMultiline(text: string): string {
  return inline(text).replace(/\n/g, "<br>");
}

/** The same inline subset flattened for the text part: `label (url)`, no `**`. */
export function inlineToText(text: string): string {
  return text
    .replace(LINK, (_, label: string, href: string) => `${label} (${href})`)
    .replace(/\*\*([^*\n]+)\*\*/g, "$1");
}

/* ------------------------------------------------------------------ html --- */

const P = `margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:${COLOR.body};`;
const QUIET = `margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${COLOR.quiet};`;
/** The bar is 8px: thick enough to read as a bar, thin enough not to shout. */
const BAR_HEIGHT = 8;

/**
 * The usable width inside the card: the 600px card less its 32px padding on
 * each side. Anything measured against the column is measured against this,
 * in pixels, rather than as a percentage a client is free to reinterpret.
 */
const CONTENT_WIDTH = WIDTH - 64;
const HALF_WIDTH = CONTENT_WIDTH / 2;

const CELL = `padding:11px 0;border-top:1px solid ${COLOR.rule};font-family:${FONT};`;

function detailsHtml(rows: DetailRow[]): string {
  const cells = rows
    .map((row, i) => {
      // The final row closes the table with a rule of its own; without it the
      // last value floats against the whitespace below and the block stops
      // reading as a table.
      const last = i === rows.length - 1 ? `border-bottom:1px solid ${COLOR.rule};` : "";
      const value = row.emphasis
        ? `font-size:17px;font-weight:700;color:${COLOR.heading};`
        : `font-size:15px;color:${COLOR.heading};`;
      const note = row.note
        ? `<br><span class="m-quiet" style="font-size:12px;color:${COLOR.quiet};">${inline(row.note)}</span>`
        : "";
      return (
        `<tr>` +
        `<td class="m-label m-sep" style="${CELL}${last}font-size:11px;letter-spacing:.1em;` +
        `text-transform:uppercase;color:${COLOR.quiet};">${inline(row.label)}</td>` +
        `<td class="m-val m-sep" align="right" style="${CELL}${last}${value}">` +
        `${inline(row.value)}${note}</td>` +
        `</tr>`
      );
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${cells}</table>`;
}

/**
 * The schemes a button or a fallback URL may point at.
 *
 * `mailto:` earns its place here rather than being an oversight: the payment
 * confirmation button is a `mailto:` that opens the client's own mail app with
 * the subject already filled in. Everything else is refused — a button is the
 * one element a recipient is being invited to press, and `javascript:` or
 * `data:` behind one is the shape a phishing message takes.
 *
 * Refusing renders the button as inert text rather than throwing: an email
 * that reports something already committed must still go out, and a visibly
 * dead button is a better outcome than a client told nothing at all.
 */
const SAFE_HREF = /^(https?:|mailto:)/i;

function buttonHtml(label: string, href: string, tone: "brand" | "neutral"): string {
  const p = palette(tone);
  if (!SAFE_HREF.test(href)) {
    console.warn(`[mail] refusing a button href with an unsupported scheme: ${href}`);
    return `<p class="m-p" style="${P}"><strong>${escapeHtml(label)}</strong></p>`;
  }
  // The colour sits on the <td> and the padding on the <a>: a background on
  // the anchor alone leaves an unclickable border in Outlook, and padding on
  // the cell alone leaves the click target the size of the text.
  const bg = p.buttonBg === "transparent" ? "" : ` bgcolor="${p.buttonBg}"`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center"${bg} style="border:1px solid ${p.buttonBorder};border-radius:6px;">` +
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 30px;` +
    // Word lays out the anchor itself and drops the padding, collapsing the
    // coloured area onto the text. `mso-padding-alt` is the one it reads.
    `mso-padding-alt:13px 30px;font-family:${FONT};` +
    `font-size:15px;font-weight:600;color:${p.buttonText};text-decoration:none;border-radius:6px;">` +
    `${escapeHtml(label)}</a></td></tr></table>`
  );
}

function progressHtml(
  step: number,
  total: number,
  startLabel: string,
  endLabel: string,
  tone: "brand" | "neutral"
): string {
  const p = palette(tone);
  const done = clampPercent(step, total);

  /**
   * The bar is measured in **pixels, not percentages**, and that is the whole
   * point of this function.
   *
   * Three rounds of fixes failed on one phone while looking perfect on a
   * desktop: the attribute-only width, then the CSS width, then explicit
   * percentages on both cells with `table-layout:fixed`. Each one assumed the
   * client would resolve a percentage against a container width it agreed
   * with. Gmail's mobile app lays the message out at 600 px and then scales
   * the whole thing down to the screen — and a percentage resolved against a
   * container it has already decided is narrower collapses to its content,
   * which here is a zero-width space.
   *
   * A pixel width has nothing to resolve against. It survives the scaling
   * because everything else scales with it.
   *
   * Height is declared three ways for the same class of reason — the `height`
   * attribute, CSS `height`, and `line-height` on real content — because
   * clients honour different ones and a bar with no height is invisible. The
   * content is `&#8203;`, a zero-width space, rather than `&nbsp;`, which some
   * clients draw as a visible space wider than the cell and bulge one end.
   */
  const filledPx = Math.round((CONTENT_WIDTH * done) / 100);
  const restPx = CONTENT_WIDTH - filledPx;

  const bar = (background: string, radius: string, px: number) =>
    `<td width="${px}" height="${BAR_HEIGHT}" bgcolor="${background}" ` +
    `style="width:${px}px;height:${BAR_HEIGHT}px;line-height:${BAR_HEIGHT}px;font-size:1px;` +
    `mso-line-height-rule:exactly;background:${background};border-radius:${radius};">&#8203;</td>`;

  const filled = filledPx > 0 ? bar(p.bar, restPx === 0 ? "4px" : "4px 0 0 4px", filledPx) : "";
  const rest = restPx > 0 ? bar(COLOR.rule, filledPx === 0 ? "4px" : "0 4px 4px 0", restPx) : "";

  return (
    `<table role="presentation" width="${CONTENT_WIDTH}" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:${CONTENT_WIDTH}px;max-width:100%;table-layout:fixed;margin-bottom:10px;">` +
    `<tr>${filled}${rest}</tr></table>` +
    // Pixels here too, and for the same reason. Left to resolve a percentage
    // the phone sized both cells to their text and the two labels met in the
    // middle as one run-on word — "Laimėta aukcionePristatyta".
    `<table role="presentation" width="${CONTENT_WIDTH}" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:${CONTENT_WIDTH}px;max-width:100%;table-layout:fixed;"><tr>` +
    `<td width="${HALF_WIDTH}" class="m-quiet" style="width:${HALF_WIDTH}px;font-family:${FONT};` +
    `font-size:12px;color:${COLOR.quiet};">${inline(startLabel)}</td>` +
    `<td width="${HALF_WIDTH}" align="right" class="m-quiet" style="width:${HALF_WIDTH}px;` +
    `font-family:${FONT};font-size:12px;color:${COLOR.quiet};">${inline(endLabel)}</td>` +
    `</tr></table>`
  );
}

/** Guards against a caller's off-by-one becoming a bar wider than its track. */
function clampPercent(step: number, total: number): number {
  if (!Number.isFinite(step) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((step / total) * 100)));
}

export function blockToHtml(block: EmailBlock, tone: "brand" | "neutral"): string {
  const p = palette(tone);
  switch (block.kind) {
    case "paragraph":
      return `<p class="m-p" style="${P}">${inlineMultiline(block.text)}</p>`;

    case "details":
      return detailsHtml(block.rows);

    case "button":
      return buttonHtml(block.label, block.href, tone);

    case "urlFallback":
      return (
        (block.hint
          ? `<p class="m-quiet" style="${QUIET}margin-bottom:6px;">${inline(block.hint)}</p>`
          : "") +
        `<p style="margin:0;font-family:${FONT_MONO};font-size:12px;line-height:1.5;word-break:break-all;">` +
        `<a href="${escapeHtml(block.href)}" style="color:${COLOR.accentStrong};text-decoration:underline;">` +
        `${escapeHtml(block.href)}</a></p>`
      );

    case "panel":
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>` +
        `<td class="m-panel" style="background:${COLOR.mutedBg};border-left:3px solid ${p.panelBorder};padding:16px 18px;">` +
        (block.title
          ? `<p class="m-val" style="margin:0 0 6px;font-family:${FONT};font-size:14px;font-weight:700;color:${COLOR.heading};">${inline(block.title)}</p>`
          : "") +
        `<p class="m-p" style="${P}font-size:14px;">${inlineMultiline(block.text)}</p>` +
        `</td></tr></table>`
      );

    case "progress":
      return progressHtml(block.step, block.total, block.startLabel, block.endLabel, tone);

    case "image":
      // `width:100%` with `height:auto` lets the image shrink on a phone;
      // the `width`/`height` attributes reserve the space before it loads and
      // stop Outlook rendering it at its intrinsic size.
      return (
        `<img src="${escapeHtml(block.src)}" width="${block.width}" height="${block.height}" ` +
        `alt="${escapeHtml(block.alt)}" style="display:block;width:100%;max-width:${WIDTH}px;` +
        `height:auto;border:0;">`
      );

    case "fineprint":
      return `<p class="m-quiet" style="${QUIET}font-size:12px;">${inlineMultiline(block.text)}</p>`;

    case "divider":
      return `<div class="m-sep" style="border-top:1px solid ${COLOR.rule};font-size:0;line-height:0;">&nbsp;</div>`;
  }
}

/* ------------------------------------------------------------ plain text --- */

export function blockToText(block: EmailBlock): string {
  switch (block.kind) {
    case "paragraph":
      return inlineToText(block.text);

    case "details":
      return block.rows
        .map((row) => {
          const value = inlineToText(row.value);
          const note = row.note ? ` (${inlineToText(row.note)})` : "";
          return `${inlineToText(row.label)}: ${value}${note}`;
        })
        .join("\n");

    case "button":
      // An arrow rather than a bare URL: in a wall of plain text the action is
      // otherwise indistinguishable from the fine print's terms link.
      return `-> ${block.label}\n   ${block.href}`;

    case "urlFallback":
      // The HTML part shows this URL because the button might not render. In
      // the text part the button already *is* a URL, so repeating it adds a
      // second identical link and nothing else.
      return "";

    case "panel":
      return block.title
        ? `${inlineToText(block.title)}\n${inlineToText(block.text)}`
        : inlineToText(block.text);

    case "progress": {
      const filled = Math.max(0, Math.min(block.total, Math.round(block.step)));
      const bar = "=".repeat(filled) + "-".repeat(Math.max(0, block.total - filled));
      return `[${bar}] ${block.step}/${block.total}\n${inlineToText(block.startLabel)} -> ${inlineToText(block.endLabel)}`;
    }

    case "image":
      // The alt text, in brackets, so the text part says what was shown rather
      // than silently dropping it.
      return `[${inlineToText(block.alt)}]`;

    case "fineprint":
      return inlineToText(block.text);

    case "divider":
      return "---";
  }
}
