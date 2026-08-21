/**
 * Tells everyone that a client has asked for their deposit back.
 *
 * The mirror of `sendPlanRequestEmails`, and needed for the same reason: the
 * request writes rows and appears in a queue, and without this nobody is
 * told. It matters more here than on the way in — a client who has asked for
 * money back and heard nothing will ask again, by phone, and the second
 * request is the expensive one.
 *
 * Two emails, two jobs, exactly as on the request path:
 *
 * - **To us:** who, how much, and a link to the queue. Always English.
 * - **To the client:** an acknowledgement in their own language, saying
 *   plainly that the plan keeps working until the money is actually returned.
 *   That sentence exists because the alternative — a client assuming access
 *   ended the moment they clicked — is how a live bid gets abandoned.
 *
 * Never fatal. The rows are committed before this runs; a mail outage must not
 * turn a successful request into an error the client would repeat.
 */
import { getTranslations } from "next-intl/server";
import { SITE, siteUrl } from "@/shared/config/site";
import { formatUsd, isPlanKey } from "../model/plans";
import {
  renderEmail,
  send,
  sendQuietly,
  type EmailBlock,
  type EmailDocument,
} from "@/shared/mail";

interface RefundRequestMail {
  user: { name: string; email: string; locale: string };
  /** The tier they hold while the request is open. Null if they hold none. */
  planKey: string | null;
  /** The whole sum being asked for, across every row that makes it up. */
  heldCents: number;
  /** A pending upgrade request was withdrawn to make room for this. */
  cancelledPending: boolean;
}

export async function sendRefundRequestEmails(mail: RefundRequestMail): Promise<void> {
  await sendQuietly("refund request", () =>
    Promise.all([sendAdminNotification(mail), sendClientCopy(mail)]).then(() => undefined)
  );
}

async function sendAdminNotification({
  user,
  planKey,
  heldCents,
  cancelledPending,
}: RefundRequestMail): Promise<void> {
  const body = [
    `${user.name} <${user.email}> asked for their deposit back.`,
    "",
    `Held:           ${formatUsd(heldCents)}`,
    `Current plan:   ${planKey ?? "none"}`,
    `Account locale: ${user.locale}`,
    ...(cancelledPending
      ? ["", "NOTE: their open plan request was cancelled by this — do not confirm it."]
      : []),
    "",
    `Review it here: ${siteUrl("/admin/deposits")}`,
    "",
    "Nothing has moved yet. Their plan keeps working until you mark it refunded.",
  ].join("\n");

  await send({
    to: process.env.CONTACT_EMAIL_TO || SITE.email,
    replyTo: user.email,
    subject: `Refund requested: ${formatUsd(heldCents)} — ${user.name}`,
    text: body,
  });
}

/** The already-translated strings the client's copy is assembled from. */
export interface RefundRequestCopy {
  subject: string;
  greeting: string;
  received: string;
  /**
   * Null when the client holds money but no tier — an admin override can leave
   * them that way, and "your Gold plan stays active" with no plan name in it
   * reads as a bug in our software.
   */
  stillActive: string | null;
  nextStep: string;
  signature: string;
}

/**
 * Builds the client's document, and takes no translator so anything can call
 * it — the preview harness included, so the preview cannot drift from what a
 * client actually receives.
 */
export function refundRequestDocument(copy: RefundRequestCopy, locale: string): EmailDocument {
  const blocks: EmailBlock[] = [
    { kind: "paragraph", text: copy.greeting },
    { kind: "paragraph", text: copy.received },
  ];

  // A panel rather than a paragraph: this is the sentence that stops somebody
  // abandoning a live bid, and it has to survive a skim.
  if (copy.stillActive) blocks.push({ kind: "panel", text: copy.stillActive });

  blocks.push({ kind: "paragraph", text: copy.nextStep });

  return {
    locale,
    preheader: copy.received,
    heading: copy.subject,
    // Nobody asks for their money back while pleased with the service. The
    // muted palette is the difference between an acknowledgement and a cheer.
    tone: "neutral",
    blocks,
    footer: { note: copy.signature },
  };
}

async function sendClientCopy({ user, planKey, heldCents }: RefundRequestMail): Promise<void> {
  const t = await getTranslations({ locale: user.locale, namespace: "Plans.refundEmail" });
  const tPlans = await getTranslations({ locale: user.locale, namespace: "Plans" });
  // A plan retired from the catalogue has no translated name; fall back to the
  // raw key rather than sending mail addressed to a broken string.
  const planName = planKey && isPlanKey(planKey) ? tPlans(`tiers.${planKey}.name`) : (planKey ?? "");

  const subject = t("subject");

  const copy: RefundRequestCopy = {
    subject,
    greeting: t("greeting", { name: user.name }),
    received: t("received", { amount: formatUsd(heldCents) }),
    stillActive: planName ? t("stillActive", { plan: planName }) : null,
    nextStep: t("nextStep", { email: SITE.email }),
    signature: t("signature", { site: SITE.name }),
  };

  const { html, text } = renderEmail(refundRequestDocument(copy, user.locale));

  await send({ to: user.email, subject, text, html });
}
