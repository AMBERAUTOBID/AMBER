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
 *   scan at speed than three.
 * - **To the client:** their copy of what they just agreed to, in their own
 *   language. An agreement the other party has no record of is a weak
 *   agreement, and this is the record landing in their inbox.
 *
 * **Never fatal.** A mail failure must not lose the request — the deposit row
 * is already committed by the time this runs, and throwing here would turn a
 * successful request into an error the client would reasonably retry.
 *
 * Same Gmail transport and same "log instead" degradation as the auth and
 * leads mailers; in local dev the log is how you see what would have gone
 * out. Plain text on purpose — HTML mail buys spam-filter surface and
 * rendering bugs for content that is four lines and a link.
 */
import nodemailer from "nodemailer";
import { getTranslations } from "next-intl/server";
import { SITE, siteUrl } from "@/shared/config/site";
import { formatUsd, type Plan } from "../model/plans";

interface PlanRequestMail {
  user: { name: string; email: string; locale: string };
  plan: Plan;
  /** The client ticked the agreement box. Recorded in the email as evidence. */
  acceptedTerms: boolean;
}

export async function sendPlanRequestEmails(mail: PlanRequestMail): Promise<void> {
  try {
    await Promise.all([sendAdminNotification(mail), sendClientCopy(mail)]);
  } catch (e) {
    // Caught here rather than by the caller so neither email can take the
    // other down, and so no caller has to remember this rule.
    console.error("[plans] plan request notification failed:", e);
  }
}

async function sendAdminNotification({ user, plan, acceptedTerms }: PlanRequestMail): Promise<void> {
  const deposit = plan.depositUsdCents > 0 ? formatUsd(plan.depositUsdCents) : "none";
  const body = [
    `${user.name} <${user.email}> requested the ${plan.key} plan.`,
    "",
    `Deposit due:    ${deposit}`,
    `Account locale: ${user.locale}`,
    `Terms accepted: ${acceptedTerms ? "yes" : "NO — check before proceeding"}`,
    "",
    `Review it here: ${siteUrl("/admin")}`,
    "",
    "The plan activates only when the deposit is confirmed in the queue.",
  ].join("\n");

  await deliver({
    to: process.env.CONTACT_EMAIL_TO || SITE.email,
    // Reply goes to the customer, not to ourselves — the admin's first
    // action on this email is usually to answer them.
    replyTo: user.email,
    subject: `Plan request: ${plan.key} — ${user.name}`,
    text: body,
  });
}

async function sendClientCopy({ user, plan }: PlanRequestMail): Promise<void> {
  const t = await getTranslations({ locale: user.locale, namespace: "Plans.requestEmail" });
  const tPlans = await getTranslations({ locale: user.locale, namespace: "Plans" });
  const planName = tPlans(`tiers.${plan.key}.name`);

  const body = [
    t("greeting", { name: user.name }),
    "",
    t("received", { plan: planName }),
    "",
    // Omitted entirely for a free plan rather than stated as $0 — the same
    // rule the plan cards follow: an amount that isn't owed is absent.
    ...(plan.depositUsdCents > 0
      ? [t("depositDue", { amount: formatUsd(plan.depositUsdCents) }), ""]
      : []),
    t("nextStep"),
    "",
    t("termsRecorded", { url: siteUrl("/terms") }),
    "",
    t("signature", { site: SITE.name }),
  ].join("\n");

  await deliver({ to: user.email, subject: t("subject", { plan: planName }), text: body });
}

interface Outgoing {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

async function deliver(message: Outgoing): Promise<void> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    console.warn(`[plans] mail credentials unset — would send to ${message.to}:\n${message.text}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });
  await transporter.sendMail({
    from: `"${SITE.name}" <${gmailUser}>`,
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
  });
}
