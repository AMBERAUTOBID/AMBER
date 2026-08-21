/**
 * The module's public surface.
 *
 * Import from `@/shared/mail`, not from the files inside it — `theme.ts` and
 * `blocks.ts` are implementation, and pinning a caller to them makes the
 * rendering impossible to change without a search across the repo.
 *
 * Composing an email looks like this, and note where the pieces come from:
 * every user-visible string is translated by the caller, because `shared/`
 * holds no copy (ARCHITECTURE.md §1) and no business knowledge.
 *
 * ```ts
 * const t = await getTranslations({ locale: user.locale, namespace: "Plans.decisionEmail" });
 * const { html, text } = renderEmail({
 *   locale: user.locale,
 *   preheader: t("confirmed.preheader", { date }),
 *   badge: t("confirmed.badge"),
 *   heading: t("confirmed.heading", { plan: planName }),
 *   reference: order.reference,
 *   blocks: [
 *     { kind: "paragraph", text: t("confirmed.body", { name: user.name }) },
 *     { kind: "details", rows: [{ label: t("field.plan"), value: planName }] },
 *     { kind: "button", label: t("confirmed.cta"), href: siteUrl("/account/plan") },
 *   ],
 *   footer: { legalName: t("legalName"), note: t("footerNote.account") },
 * });
 *
 * await sendQuietly("deposit confirmed", () =>
 *   send({ to: user.email, subject: t("confirmed.subject", { plan: planName }), text, html })
 * );
 * ```
 */
export { renderEmail } from "./layout";
export { mailtoHref } from "./links";
export {
  send,
  sendQuietly,
  resetTransportForTests,
  type SendResult,
  type Sender,
} from "./transport";
export type {
  DetailRow,
  EmailBlock,
  EmailDocument,
  EmailFooter,
  EmailTone,
  InlineText,
  EmailAttachment,
  Outgoing,
  RenderedEmail,
} from "./types";
