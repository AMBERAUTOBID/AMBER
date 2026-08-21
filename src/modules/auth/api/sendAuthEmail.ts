/**
 * Transactional auth emails: verification and password reset.
 *
 * Strings live in messages/*.json (Auth.emails.*) so the locale-parity check
 * covers them — a verification email must never fall back to English for a
 * Russian-speaking customer just because a key was missed.
 *
 * Transport, branding and the "log instead of send" degradation now come from
 * `@/shared/mail`; without credentials the text is written to the server log,
 * which in local dev doubles as the way to grab the link without an inbox.
 *
 * ## Why the button *and* the raw link
 *
 * The copy says "click the link below", and for years the link was all there
 * was. A button is still that link, so the sentence stays true — but these are
 * single-use token URLs, and the recipient may be reading on a device that
 * strips buttons, or forwarding the address to the laptop where they actually
 * want to sign in. `urlFallback` prints the address in full underneath, which
 * is the difference between an email that works everywhere and one that works
 * in Gmail.
 *
 * The button labels are borrowed from the pages the links lead to
 * (`Auth.verify.title`, `Auth.reset.title`, `Auth.login.submit`) rather than
 * written fresh: it means this email needed no new translation keys, and a
 * label that matches the heading of the page it opens is a small honesty.
 */
import { getTranslations } from "next-intl/server";
import { SITE } from "@/shared/config/site";
import { renderEmail, send, type EmailBlock, type EmailDocument } from "@/shared/mail";

interface AuthMail {
  to: string;
  locale: string;
  /** `exists` = someone tried to register an address that already has an
   * account; the owner gets a heads-up and a login link instead of a
   * duplicate. The registering party sees the identical "ok" either way —
   * the inbox is the only place the truth lands. */
  kind: "verify" | "reset" | "exists";
  /** Absolute link — the token link for verify/reset, the login page for
   * exists (which has no token and no expiry). */
  link: string;
}

/** Which page each link opens, so its heading can label the button. */
const CTA_KEY: Record<AuthMail["kind"], string> = {
  verify: "verify.title",
  reset: "reset.title",
  exists: "login.submit",
};

/** The already-translated strings this email is assembled from. */
export interface AuthEmailCopy {
  subject: string;
  greeting: string;
  instruction: string;
  /** Expiry for a token link; the what-now line for the `exists` notice. */
  closing: string;
  /** The button label, taken from the heading of the page the link opens. */
  cta: string;
  signature: string;
}

/**
 * Builds the document, and takes no translator so anything can call it.
 *
 * Extracted for one specific reason. The preview harness used to hand-copy
 * this block list, the two drifted, and a **fixed** bug went on appearing in
 * every test email — the instruction printed twice, long after the code that
 * printed it twice was gone. A preview that mirrors the real assembly by hand
 * is a preview that eventually lies, which is the same argument that keeps the
 * HTML and text parts generated from one block list rather than written twice.
 */
export function authEmailDocument(copy: AuthEmailCopy, link: string, locale: string): EmailDocument {
  const blocks: EmailBlock[] = [
    { kind: "paragraph", text: copy.greeting },
    { kind: "paragraph", text: copy.instruction },
    { kind: "button", label: copy.cta, href: link },
    // No hint: the instruction is already the paragraph above the button, and
    // printing it a second time reads as a fault in the email rather than as
    // a fallback. The bare address under a button explains itself.
    { kind: "urlFallback", href: link },
    { kind: "divider" },
    { kind: "fineprint", text: copy.closing },
  ];

  return {
    locale,
    // The expiry, or the reassurance — the fact the recipient most needs from
    // the preview line, and the one the subject cannot carry.
    preheader: copy.closing,
    heading: copy.subject,
    blocks,
    // No "you are receiving this because…" line here on purpose: on a verify
    // email the recipient has had an account for four seconds, and any
    // sentence claiming a relationship would overstate it.
    footer: { note: copy.signature },
  };
}

export async function sendAuthEmail(mail: AuthMail): Promise<void> {
  const t = await getTranslations({ locale: mail.locale, namespace: "Auth.emails" });
  const tAuth = await getTranslations({ locale: mail.locale, namespace: "Auth" });

  const copy: AuthEmailCopy = {
    subject: t(`${mail.kind}.subject`),
    greeting: t(`${mail.kind}.greeting`),
    instruction: t(`${mail.kind}.instruction`),
    // Token links expire; the exists notice instead carries a what-now line
    // (reset hint, and reassurance if the attempt wasn't the owner's).
    closing: mail.kind === "exists" ? t("exists.note") : t(`${mail.kind}.expiry`),
    cta: tAuth(CTA_KEY[mail.kind]),
    signature: t("signature", { site: SITE.name }),
  };

  const { html, text } = renderEmail(authEmailDocument(copy, mail.link, mail.locale));

  await send({ to: mail.to, subject: copy.subject, text, html });
}
