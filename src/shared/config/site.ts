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
  /**
   * Public profiles, `null` until the account exists.
   *
   * NULL IS LOAD-BEARING, not a placeholder to be tidied away. Every consumer
   * renders only the entries that are set, so an unfilled network is silently
   * absent rather than a live icon pointing at somebody else's profile or a
   * 404 — a broken social link on a header is a trust problem, not a cosmetic
   * one. Fill one in and it appears everywhere at once; that is the whole
   * reason this file exists.
   */
  social: {
    // Supplied by the owner 2026-08-12. The Facebook page has no vanity URL
    // yet, so it is the numeric `profile.php?id=` form — correct, not a
    // placeholder; replace it if a username is ever claimed.
    instagram: "https://www.instagram.com/smartautobid/" as string | null,
    youtube: "https://www.youtube.com/channel/UCq5H09nS6NpUPt9C97Q19sw" as string | null,
    facebook: "https://www.facebook.com/profile.php?id=61591581285345" as string | null,
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

/** The networks a social row may show, in the order they are shown. */
export type SocialNetwork = "instagram" | "youtube" | "whatsapp" | "facebook";

/**
 * The social profiles that actually exist, in display order.
 *
 * Returns keys rather than icons: this file is imported by the Telegram bot
 * from a plain `tsx` process and must stay free of React. The caller maps a key
 * to whatever it draws. WhatsApp is always present because it is the phone
 * number we already publish, not a separate account someone has to create.
 */
export function socialLinks(): Array<{ network: SocialNetwork; href: string }> {
  const entries: Array<{ network: SocialNetwork; href: string | null }> = [
    { network: "instagram", href: SITE.social.instagram },
    { network: "youtube", href: SITE.social.youtube },
    { network: "whatsapp", href: CONTACT_HREF.whatsapp },
    { network: "facebook", href: SITE.social.facebook },
  ];
  return entries.filter((e): e is { network: SocialNetwork; href: string } => e.href !== null);
}

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
