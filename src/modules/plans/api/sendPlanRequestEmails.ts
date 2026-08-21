/**
 * Tells somebody that a plan request arrived.
 *
 * This closes a real gap: a request wrote a pending row and appeared in the
 * admin queue, and **nobody was told** — while the client had just been
 * promised contact within one business day and nothing started anyone's
 * clock (ARCHITECTURE.md §6a).
 *
 * Two emails, and they are different jobs:
 *
 * - **To us:** who asked, for what, and a link to the queue. Always English —
 *   it goes to staff, not customers, and one predictable format is easier to
 *   scan at speed than three. **Deliberately still plain text**, for the same
 *   reason: this one is read in three seconds while deciding whether to open
 *   the queue, and a layout would slow that down rather than help it.
 * - **To the client:** their copy of what they just agreed to, in their own
 *   language, and branded — an agreement the other party has no record of is
 *   a weak agreement, and a record that looks like a machine wrote it is a
 *   weaker one.
 *
 * **Never fatal.** A mail failure must not lose the request — the deposit row
 * is already committed by the time this runs, and throwing here would turn a
 * successful request into an error the client would reasonably retry.
 *
 * There is no button in the client's copy on purpose. Their next action is a
 * bank transfer, not a click, and a call-to-action pointing anywhere else
 * would compete with the one thing that has to happen.
 */
import { getTranslations } from "next-intl/server";
import { SITE, siteUrl } from "@/shared/config/site";
import {
  renderEmail,
  send,
  sendQuietly,
  type EmailBlock,
  type EmailDocument,
} from "@/shared/mail";
import { formatUsd, type Plan } from "../model/plans";

interface PlanRequestMail {
  user: { name: string; email: string; locale: string };
  plan: Plan;
  /** The client ticked the agreement box. Recorded in the email as evidence. */
  acceptedTerms: boolean;
  /**
   * What actually has to be transferred — the tier's deposit for a first
   * request, or **only the difference** for a client moving up.
   *
   * Passed in rather than read off `plan.depositUsdCents`, because those two
   * numbers stop being the same the moment upgrades exist, and this email is
   * the one place a client is told a figure before they go to their bank.
   * Quoting the headline price to somebody who already has $1,500 with us
   * would collect $2,500 for a $2,500 tier and leave us holding $4,000.
   */
  amountDueCents: number;
  /** They already hold a deposit; this request tops it up to a higher tier. */
  topUp: boolean;
}

export async function sendPlanRequestEmails(mail: PlanRequestMail): Promise<void> {
  // Caught here rather than by the caller so neither email can take the other
  // down, and so no caller has to remember the rule.
  await sendQuietly("plan request", () =>
    Promise.all([sendAdminNotification(mail), sendClientCopy(mail)]).then(() => undefined)
  );
}

async function sendAdminNotification({
  user,
  plan,
  acceptedTerms,
  amountDueCents,
  topUp,
}: PlanRequestMail): Promise<void> {
  const due = amountDueCents > 0 ? formatUsd(amountDueCents) : "none";
  const body = [
    `${user.name} <${user.email}> requested the ${plan.key} plan.`,
    "",
    // Both numbers on an upgrade, never one. The admin is about to watch a
    // bank account for a specific figure, and "$2,500 plan" next to a $1,000
    // transfer is how a correct payment gets queried.
    topUp
      ? `To transfer:    ${due}  (top-up to the ${formatUsd(plan.depositUsdCents)} tier)`
      : `Deposit due:    ${due}`,
    `Account locale: ${user.locale}`,
    `Terms accepted: ${acceptedTerms ? "yes" : "NO — check before proceeding"}`,
    "",
    `Review it here: ${siteUrl("/admin")}`,
    "",
    "The plan activates only when the deposit is confirmed in the queue.",
  ].join("\n");

  await send({
    to: process.env.CONTACT_EMAIL_TO || SITE.email,
    // Reply goes to the customer, not to ourselves — the admin's first
    // action on this email is usually to answer them.
    replyTo: user.email,
    subject: `${topUp ? "Plan upgrade" : "Plan request"}: ${plan.key} — ${user.name}`,
    text: body,
  });
}

/** The already-translated strings the client's copy is assembled from. */
export interface PlanRequestCopy {
  subject: string;
  greeting: string;
  received: string;
  /** Absent for a free plan — an amount that is not owed is not printed. */
  amountLine: string | null;
  nextStep: string;
  termsRecorded: string;
  signature: string;
}

/**
 * Builds the client's document, and takes no translator so anything can call
 * it — the preview harness included, which is the point. A harness that
 * re-types the block list eventually disagrees with the mailer and starts
 * reporting bugs that no longer exist.
 */
export function planRequestDocument(copy: PlanRequestCopy, locale: string): EmailDocument {
  const blocks: EmailBlock[] = [
    { kind: "paragraph", text: copy.greeting },
    { kind: "paragraph", text: copy.received },
  ];

  // The figure gets its own tinted block rather than a third paragraph. It is
  // the one line the client will come back to this email to re-read, and in a
  // run of same-weight paragraphs it is the one that gets skimmed past.
  if (copy.amountLine) blocks.push({ kind: "panel", text: copy.amountLine });

  blocks.push({ kind: "paragraph", text: copy.nextStep });
  blocks.push({ kind: "divider" });
  blocks.push({ kind: "fineprint", text: copy.termsRecorded });

  return {
    locale,
    // The amount if there is one: it is what the client needs to act on, and
    // the subject already carries the plan name.
    preheader: copy.amountLine ?? copy.nextStep,
    heading: copy.subject,
    blocks,
    footer: { note: copy.signature },
  };
}

async function sendClientCopy({
  user,
  plan,
  amountDueCents,
  topUp,
}: PlanRequestMail): Promise<void> {
  const t = await getTranslations({ locale: user.locale, namespace: "Plans.requestEmail" });
  const tPlans = await getTranslations({ locale: user.locale, namespace: "Plans" });
  const planName = tPlans(`tiers.${plan.key}.name`);
  const subject = t("subject", { plan: planName });

  // Omitted entirely for a free plan rather than stated as $0 — the same rule
  // the plan cards follow: an amount that isn't owed is absent. On an upgrade
  // the line names the difference and says what it is a difference from, so
  // the client can check the arithmetic against their own records.
  const amountLine =
    amountDueCents > 0
      ? topUp
        ? t("topUpDue", {
            amount: formatUsd(amountDueCents),
            total: formatUsd(plan.depositUsdCents),
          })
        : t("depositDue", { amount: formatUsd(amountDueCents) })
      : null;

  const copy: PlanRequestCopy = {
    subject,
    greeting: t("greeting", { name: user.name }),
    received: topUp ? t("receivedUpgrade", { plan: planName }) : t("received", { plan: planName }),
    amountLine,
    nextStep: t("nextStep"),
    termsRecorded: t("termsRecorded", { url: siteUrl("/terms") }),
    signature: t("signature", { site: SITE.name }),
  };

  const { html, text } = renderEmail(planRequestDocument(copy, user.locale));

  await send({ to: user.email, subject, text, html });
}
