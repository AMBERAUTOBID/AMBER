/**
 * Turns an `EmailDocument` into the two parts of one message.
 *
 * This is the whole point of the module: **the text part is generated, never
 * written.** Both renderings walk the same block list, so a change to an email
 * lands in both or in neither. The alternative — a `text:` string maintained
 * by hand next to an HTML template — drifts silently, because the only readers
 * of the text part are spam filters, smart watches and screen readers, none of
 * which file bug reports.
 *
 * Sending HTML at all is a reversal of the note that used to sit at the top of
 * every mailer here ("plain text on purpose — HTML buys spam-filter surface
 * for content that is four lines and a link"). That reasoning held while the
 * emails *were* four lines and a link. It stopped holding once one of them was
 * the receipt for a five-thousand-dollar deposit. The spam-filter concern is
 * answered by shipping `multipart/alternative` rather than HTML alone, which
 * is what `send()` does.
 *
 * ## Conventions this renderer assumes
 *
 * - **One `button` block per email.** Two primary actions is no primary
 *   action. Secondary routes belong in a `paragraph` as an inline link.
 * - **A `urlFallback` follows a `button`** whenever the target is a
 *   single-use link the recipient cannot otherwise reach — a token URL.
 * - Neither is enforced. They are cheap to follow and expensive to police.
 */
import { SITE, siteUrl } from "@/shared/config/site";
import { blockToHtml, blockToText, escapeHtml, inlineToText } from "./blocks";
import { COLOR, FONT, FONT_MONO, LOGO, WIDTH, palette } from "./theme";
import type { EmailDocument, EmailFooter, RenderedEmail } from "./types";

/**
 * The only stylesheet in the message, and the only place a rule is not inline.
 *
 * It exists for the two things an attribute cannot express: media queries and
 * colour-scheme queries. Gmail on a non-Gmail account strips `<style>`
 * entirely, so **nothing here may be load-bearing** — every rule is a refinement
 * of an inline value that already works.
 *
 * `!important` throughout, because an inline `style` attribute outranks a
 * stylesheet rule. That is unusual outside email and correct inside it.
 *
 * `[data-ogsc]` is Outlook.com's dark mode: it copies the original colours onto
 * that attribute and expects the sender to opt in through it.
 */
const STYLE = `
  @media (max-width:620px){
    .m-pad{padding-left:22px !important;padding-right:22px !important}
    .m-h1{font-size:21px !important}
  }
  @media (prefers-color-scheme:dark){
    .m-bg{background:#151312 !important}
    .m-card{background:#1c1a19 !important;border-color:#2f2c2a !important}
    .m-h1{color:#f5f3f1 !important}
    .m-p,.m-val{color:#e6e2de !important}
    .m-label,.m-quiet{color:#8a8581 !important}
    .m-sep{border-color:#2f2c2a !important}
    .m-foot{background:#131110 !important;border-color:#2f2c2a !important}
    .m-panel{background:#241f1a !important}
  }
  [data-ogsc] .m-bg{background:#151312 !important}
  [data-ogsc] .m-card{background:#1c1a19 !important;border-color:#2f2c2a !important}
  [data-ogsc] .m-h1{color:#f5f3f1 !important}
  [data-ogsc] .m-p,[data-ogsc] .m-val{color:#e6e2de !important}
  [data-ogsc] .m-sep{border-color:#2f2c2a !important}
  [data-ogsc] .m-foot{background:#131110 !important;border-color:#2f2c2a !important}
`;

/** Vertical rhythm between blocks. A `divider` sits tighter on both sides. */
function gap(kind: string): string {
  if (kind === "divider") return "18px";
  if (kind === "urlFallback" || kind === "fineprint") return "20px";
  return "26px";
}

/**
 * The masthead: the logo, alone.
 *
 * The reference used to sit here, opposite the logo. It does not any more.
 * Two things were wrong with it, and only one was a bug:
 *
 * - **The bug.** The logo's size was given as `width`/`height` attributes
 *   only. Gmail's mobile app ignores those, drew the image at its intrinsic
 *   460 px, and shoved `SAB-2418` up against the wordmark with no gap. Every
 *   dimension in this file now appears in the inline `style` as well, which is
 *   the rule for email: **an attribute is a hint, CSS is the instruction.**
 * - **The judgement.** Even spaced correctly, a case number beside the
 *   wordmark reads as part of the logo. It belongs to the message, not to the
 *   brand, so it now sits under the heading with the rest of the message.
 *
 * The font rules on the `<img>` are not decoration either: with images
 * blocked, the alt text is drawn in their place, and without them the whole
 * sender identity renders as the client's default serif at whatever size it
 * fancies.
 */
function headerHtml(): string {
  // The logo cell is pinned to white in every scheme — see `theme.ts`.
  return (
    `<tr><td class="m-head m-pad" style="background:${COLOR.card};padding:18px 32px;` +
    `border-bottom:1px solid ${COLOR.rule};">` +
    `<img src="${siteUrl(LOGO.path)}" width="${LOGO.width}" height="${LOGO.height}" ` +
    `alt="${escapeHtml(SITE.name)}" ` +
    `style="display:block;border:0;width:${LOGO.width}px;height:${LOGO.height}px;` +
    `max-width:100%;font-family:${FONT};font-size:18px;font-weight:700;` +
    `letter-spacing:.04em;color:${COLOR.wordmark};">` +
    `</td></tr>`
  );
}

/** The case number, under the heading, where it reads as metadata. */
function referenceHtml(reference: string): string {
  return (
    `<p class="m-label" style="margin:0 0 10px;font-family:${FONT_MONO};font-size:11px;` +
    `letter-spacing:.06em;color:${COLOR.quiet};">${escapeHtml(reference)}</p>`
  );
}

/**
 * Contact details come from `site.ts` and are never written here — invariant 1
 * in ARCHITECTURE.md §5, the one that previously had the phone number living
 * in seven files.
 */
function footerHtml(footer: EmailFooter | undefined): string {
  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="color:${COLOR.quiet};text-decoration:none;">${escapeHtml(label)}</a>`;
  // The brand line and the contact row need no translator, so they are always
  // drawn. The other two are omitted rather than defaulted — an invented
  // "you are receiving this because…" is worse than none at all.
  const entity = footer?.legalName ? ` · ${escapeHtml(footer.legalName)}` : "";
  const note = footer?.note
    ? `<br><span style="font-size:11px;">${escapeHtml(footer.note)}</span>`
    : "";
  // The email gets its own line rather than trailing the other two. On a phone
  // the single row wrapped mid-list and left the "·" separator stranded at the
  // end of a line, which reads as an unfinished sentence. Each item is also
  // `nowrap`, so a phone number can never be split across two lines.
  const nowrap = (inner: string) => `<span style="white-space:nowrap;">${inner}</span>`;
  return (
    `<tr><td class="m-foot m-pad" style="background:${COLOR.footerBg};border-top:1px solid ${COLOR.rule};` +
    `padding:20px 32px;font-family:${FONT};font-size:12px;line-height:1.75;color:${COLOR.quiet};">` +
    `<strong style="color:${COLOR.body};">${escapeHtml(SITE.name)}</strong>${entity}<br>` +
    `${nowrap(link(SITE.url, SITE.domain))} · ` +
    `${nowrap(link(`tel:${SITE.phone.e164}`, SITE.phone.display))}<br>` +
    `${nowrap(link(`mailto:${SITE.email}`, SITE.email))}` +
    note +
    `</td></tr>`
  );
}

export function renderEmail(doc: EmailDocument): RenderedEmail {
  const tone = doc.tone ?? "brand";
  const p = palette(tone);

  const body = doc.blocks
    .map((block, i) => {
      const last = i === doc.blocks.length - 1;
      const margin = last ? "0" : gap(block.kind);
      return `<div style="margin-bottom:${margin};">${blockToHtml(block, tone)}</div>`;
    })
    .join("");

  const badge = doc.badge
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr>` +
      `<td class="m-panel" style="background:${p.badgeBg};border:1px solid ${p.badgeBorder};` +
      `border-radius:99px;padding:5px 14px;font-family:${FONT};font-size:11px;font-weight:700;` +
      `letter-spacing:.1em;text-transform:uppercase;color:${p.badgeText};">${escapeHtml(doc.badge)}</td>` +
      `</tr></table>`
    : "";

  const html =
    `<!doctype html><html lang="${escapeHtml(doc.locale)}"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    // Declares that both schemes are handled, which stops some clients
    // applying their own inversion on top of ours.
    `<meta name="color-scheme" content="light dark">` +
    `<meta name="supported-color-schemes" content="light dark">` +
    `<title>${escapeHtml(doc.heading)}</title>` +
    `<style>${STYLE}</style>` +
    // Outlook on Windows does not recognise `-apple-system` and, rather than
    // moving down the stack, falls all the way back to Times New Roman. Naming
    // a font it does know, for its eyes only, is the whole fix.
    `<!--[if mso]><style>*{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->` +
    `</head>` +
    `<body style="margin:0;padding:0;background:${COLOR.page};">` +
    // The preheader: pulled into the inbox preview, never drawn. The trailing
    // run of zero-width spaces stops clients padding the preview with the
    // first words of the body when the preheader is shorter than the space.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">` +
    `${escapeHtml(doc.preheader)}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `class="m-bg" style="width:100%;background:${COLOR.page};">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" ` +
    `class="m-card" style="width:${WIDTH}px;max-width:${WIDTH}px;background:${COLOR.card};` +
    `border:1px solid ${COLOR.rule};border-radius:12px;overflow:hidden;">` +
    `<tr><td style="height:4px;background:${p.rule};font-size:0;line-height:0;">&nbsp;</td></tr>` +
    headerHtml() +
    // The body cell carries its own background, not just the card behind it.
    // Gmail decides dark-mode colours per element, and a cell with no declared
    // background is one it will invert on its own terms.
    `<tr><td class="m-pad m-card" style="padding:34px 32px;background:${COLOR.card};">` +
    badge +
    `<h1 class="m-h1" style="margin:0 0 14px;font-family:${FONT};font-size:23px;line-height:1.25;` +
    `font-weight:700;color:${COLOR.heading};">${escapeHtml(doc.heading)}</h1>` +
    // Under the heading rather than beside the logo — see `headerHtml`.
    (doc.reference ? referenceHtml(doc.reference) : "") +
    body +
    `</td></tr>` +
    footerHtml(doc.footer) +
    `</table></td></tr></table></body></html>`;

  // A blank line between blocks, so the text part reads as paragraphs rather
  // than as one wall. `urlFallback` renders empty and drops out here.
  const bodyText = doc.blocks
    .map(blockToText)
    .filter((part) => part !== "")
    .join("\n\n");

  const text = [
    doc.badge ? inlineToText(doc.badge).toUpperCase() : null,
    inlineToText(doc.heading),
    doc.reference ? `(${doc.reference})` : null,
    "",
    bodyText,
    "",
    "--",
    SITE.name,
    doc.footer?.legalName ?? null,
    `${SITE.domain} · ${SITE.phone.display} · ${SITE.email}`,
    doc.footer?.note ? "" : null,
    doc.footer?.note ? inlineToText(doc.footer.note) : null,
  ]
    .filter((line) => line !== null)
    .join("\n")
    // Blocks joined with a blank line between them read as paragraphs; three
    // or more consecutive newlines read as a formatting bug.
    .replace(/\n{3,}/g, "\n\n");

  return { html, text };
}
