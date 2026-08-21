/**
 * The vocabulary an email is written in.
 *
 * Deliberately a small, closed set of blocks rather than "pass me some HTML".
 * Two reasons, and both have teeth:
 *
 * 1. **One source, two renderings.** Every email goes out as
 *    `multipart/alternative` — an HTML part and a plain-text part. If callers
 *    hand over HTML, the text part has to be written by hand a second time,
 *    and within a few months the two say different things and nobody notices,
 *    because nobody reads the text part until a spam filter does.
 *
 * 2. **No caller can inject markup.** Every string here is escaped on the way
 *    into the HTML. A customer whose name is `<script>` or, far more likely,
 *    `O'Brien & Sons` is then a rendering detail rather than a defect.
 *
 * `shared/` holds no business knowledge (ARCHITECTURE.md §1), so nothing in
 * this file knows what a plan, a lot or a deposit is — and no user-visible
 * sentence lives here either. Copy arrives already translated from the module
 * that composes the email.
 */
import type { Sender } from "./transport";

/**
 * Inline markup permitted inside block text.
 *
 * A tiny subset of Markdown — `**bold**` and `[label](https://…)` — chosen so
 * that a sentence with a link in the middle of it doesn't force a caller to
 * break the sentence into three blocks. Anything else is literal text.
 *
 * Only `http:` and `https:` links survive; see `inline()` in `blocks.ts`.
 */
export type InlineText = string;

/** One row of the label/value table that turns a message into a record. */
export interface DetailRow {
  /** Short, uppercased in the rendering. Not a sentence. */
  label: string;
  value: InlineText;
  /** A quieter second line under the value — a caveat, a unit, a condition. */
  note?: string;
  /** Renders the value larger and bolder. For the one figure that matters. */
  emphasis?: boolean;
}

export type EmailBlock =
  /** Body copy. `\n` becomes a line break; blocks are separated by space. */
  | { kind: "paragraph"; text: InlineText }
  /** The label/value table. This is what makes an email keepable as a receipt. */
  | { kind: "details"; rows: DetailRow[] }
  /** The single primary action. At most one per email — see `renderEmail`. */
  | { kind: "button"; label: string; href: string }
  /**
   * The same URL again, in full, as text. Belongs under a button whose target
   * the recipient may need to reach when the button doesn't render or a
   * corporate mail client strips it.
   *
   * `hint` is optional and should usually be left out. The first version of
   * the verification email passed the paragraph above the button, which then
   * appeared twice in a row — the recipient reads a repeated sentence as a
   * fault in the email, not as a helpful fallback. A bare address under a
   * button explains itself.
   */
  | { kind: "urlFallback"; hint?: string; href: string }
  /** A tinted aside — "what happens next", "your access ended". */
  | { kind: "panel"; title?: string; text: InlineText }
  /** A progress bar with its two endpoint labels. `step` is 1-based. */
  | { kind: "progress"; step: number; total: number; startLabel: string; endLabel: string }
  /**
   * A full-width image. `alt` is required rather than optional: a great many
   * clients block images by default, and an unlabelled gap is worse than no
   * image at all.
   */
  | { kind: "image"; src: string; alt: string; width: number; height: number }
  /** Small print above the footer — terms reference, expiry, security notice. */
  | { kind: "fineprint"; text: InlineText }
  /** A horizontal rule, for when two sections would otherwise run together. */
  | { kind: "divider" };

/**
 * Brand-level vs. deliberately muted.
 *
 * `neutral` exists for the emails that report something the recipient did not
 * want — a refund, a lost auction, a cancellation. An amber call-to-action on
 * "we could not buy your car" reads as cheerful about it. The tone switch
 * drops the accent colour to grey and makes the button secondary.
 */
export type EmailTone = "brand" | "neutral";

/**
 * The footer's localised lines. Supplied by the caller — see the file header.
 *
 * Both fields are optional, and the footer as a whole is too. The brand name
 * and the contact row come from `site.ts` and are always drawn; these two are
 * the parts that need a translator, and an email is better off without a line
 * than with one that overclaims. A verification email, for instance, cannot
 * honestly say "you are receiving this because you are our client" — the
 * person has had an account for four seconds.
 */
export interface EmailFooter {
  /**
   * The legal entity, e.g. "Smart Auto Bid LLC". It currently exists only
   * inside the Terms and Privacy prose, so most callers cannot supply it yet.
   */
  legalName?: string;
  /**
   * Why this message was received — "you have an account with us", "this
   * relates to your payment". One sentence. Not marketing.
   */
  note?: string;
}

export interface EmailDocument {
  /** BCP-47 tag. Sets `lang`/`dir` so screen readers pronounce it correctly. */
  locale: string;
  /**
   * The hidden first line, which fills the grey preview text beside the
   * subject in an inbox list. Without one, clients improvise from the greeting
   * and every email previews as "Hello, Firstname,".
   *
   * Write it to carry the single most useful fact, and never to repeat the
   * subject — together they are two lines of the recipient's attention.
   */
  preheader: string;
  /** A short status word above the heading, e.g. an event name. Optional. */
  badge?: string;
  heading: string;
  /** A reference shown in the header and worth repeating in the subject. */
  reference?: string;
  tone?: EmailTone;
  blocks: EmailBlock[];
  footer?: EmailFooter;
}

/** What `renderEmail` produces: the two halves of one message. */
export interface RenderedEmail {
  html: string;
  text: string;
}

/** A message ready for the transport. */
export interface Outgoing {
  to: string;
  subject: string;
  text: string;
  /** Omitted for the plain-text-only sends that predate this module. */
  html?: string;
  /** Set when a reply should reach a customer rather than ourselves. */
  replyTo?: string;
  /**
   * Which mailbox this leaves from. Defaults to `general` (info@).
   *
   * Use `billing` for anything about money — an invoice, a request to
   * confirm a transfer, a receipt. The client's reply then lands in the
   * inbox that deals with it rather than among sales enquiries, and no
   * `replyTo` is needed to arrange that.
   */
  from?: Sender;
  /**
   * Files to attach. Empty or omitted for every email that predates invoices.
   *
   * `content` is bytes we already hold, never a path or a URL the transport
   * would fetch: the invoice PDF lives in R2 behind a presigned URL that
   * expires, and a caller that hands nodemailer a URL discovers the fetch
   * failed only in a bounce. Fetching it ourselves means we can decide what to
   * do when it fails — and the decision is to send the email anyway, because
   * an invoice the client is not told about is worse than one without the
   * attachment next to the link that always works.
   */
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  /** What the recipient sees in their mail client, e.g. `INV-2026-0001.pdf`. */
  filename: string;
  content: Buffer | Uint8Array;
  /** Defaults to `application/pdf` — the only kind we send today. */
  contentType?: string;
}
