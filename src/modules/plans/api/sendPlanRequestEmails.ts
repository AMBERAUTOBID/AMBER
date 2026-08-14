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
import { getTranslations } from "next-intl/server";
import { SITE, siteUrl } from "@/shared/config/site";
import { formatUsd, type Plan } from "../model/plans";
import { deliver, deliverQuietly } from "./deliver";

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
  await deliverQuietly("plan request", () =>
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

  await deliver({
    to: process.env.CONTACT_EMAIL_TO || SITE.email,
    // Reply goes to the customer, not to ourselves — the admin's first
    // action on this email is usually to answer them.
    replyTo: user.email,
    subject: `${topUp ? "Plan upgrade" : "Plan request"}: ${plan.key} — ${user.name}`,
    text: body,
  });
}

async function sendClientCopy({ user, plan, amountDueCents, topUp }: PlanRequestMail): Promise<void> {
  const t = await getTranslations({ locale: user.locale, namespace: "Plans.requestEmail" });
  const tPlans = await getTranslations({ locale: user.locale, namespace: "Plans" });
  const planName = tPlans(`tiers.${plan.key}.name`);

  const body = [
    t("greeting", { name: user.name }),
    "",
    topUp ? t("receivedUpgrade", { plan: planName }) : t("received", { plan: planName }),
    "",
    // Omitted entirely for a free plan rather than stated as $0 — the same
    // rule the plan cards follow: an amount that isn't owed is absent. On an
    // upgrade the line names the difference and says what it is a difference
    // from, so the client can check the arithmetic against their own records.
    ...(amountDueCents > 0
      ? [
          topUp
            ? t("topUpDue", {
                amount: formatUsd(amountDueCents),
                total: formatUsd(plan.depositUsdCents),
              })
            : t("depositDue", { amount: formatUsd(amountDueCents) }),
          "",
        ]
      : []),
    t("nextStep"),
    "",
    t("termsRecorded", { url: siteUrl("/terms") }),
    "",
    t("signature", { site: SITE.name }),
  ].join("\n");

  await deliver({ to: user.email, subject: t("subject", { plan: planName }), text: body });
}
