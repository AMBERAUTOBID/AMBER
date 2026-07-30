/**
 * The single source of truth for who SmartAutoBid is and how to reach them.
 *
 * Every phone number, email address, social handle and canonical URL on the
 * site resolves from here. Before this file existed the phone number was
 * hardcoded in seven separate files across two runtimes, which made changing
 * it a search-and-hope exercise with no way to prove you'd caught every copy.
 *
 * Deliberately free of `next/*` imports: the Telegram bot imports this from a
 * plain `tsx` process in GitHub Actions, outside the Next runtime entirely.
 * Keep it that way — plain data and pure functions only.
 *
 * User-visible *labels* still belong in messages/*.json. What lives here is
 * the underlying fact ("the phone number is X"), not its translation.
 */

const PHONE_E164 = "+19125612347";
/** wa.me and t.me both want bare digits, no punctuation, no leading "+". */
const PHONE_DIGITS = PHONE_E164.replace(/\D/g, "");
const TELEGRAM_HANDLE = "SmartAutoBid";
const EMAIL = "info@smartautobid.com";

/** Canonical origin. No `www`, no trailing slash — it is concatenated with
 * paths that carry their own leading slash. Also the registrar-chosen primary:
 * smartautobid.lt redirects here rather than serving its own copy. */
const URL_ORIGIN = "https://smartautobid.com";

export const SITE = {
  name: "SmartAutoBid",
  url: URL_ORIGIN,
  /** Bare host, for display in places a full URL would look wrong. */
  domain: URL_ORIGIN.replace(/^https?:\/\//, ""),
  email: EMAIL,
  phone: {
    /** Formatted for reading. */
    display: "+1 (912) 561-2347",
    /** Formatted for dialling. */
    e164: PHONE_E164,
  },
  telegram: {
    handle: TELEGRAM_HANDLE,
    /** Rendered form, with the @ a user expects to see. */
    display: `@${TELEGRAM_HANDLE}`,
  },
} as const;

/**
 * Ready-to-use `href` values. Callers should reach for these rather than
 * assembling their own from the parts above — that is exactly how the seven
 * divergent copies of the WhatsApp link came about.
 */
export const CONTACT_HREF = {
  tel: `tel:${PHONE_E164}`,
  whatsapp: `https://wa.me/${PHONE_DIGITS}`,
  telegram: `https://t.me/${TELEGRAM_HANDLE}`,
  email: `mailto:${EMAIL}`,
} as const;

/**
 * A WhatsApp deep link that opens the chat with a message already typed in.
 * Used where the visitor is enquiring about something specific (a lot number,
 * a quote) and retyping it would lose the context.
 */
export function whatsappHref(prefilledMessage?: string): string {
  if (!prefilledMessage) return CONTACT_HREF.whatsapp;
  return `${CONTACT_HREF.whatsapp}?text=${encodeURIComponent(prefilledMessage)}`;
}

/**
 * Absolute URL for a site path. Phase 2 aside, the only rule is that `path`
 * carries its own leading slash.
 */
export function siteUrl(path = ""): string {
  return `${URL_ORIGIN}${path}`;
}
