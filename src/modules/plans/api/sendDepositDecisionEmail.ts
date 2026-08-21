/**
 * Tells a client what an admin just decided about their deposit.
 *
 * The other half of the notification path. `sendPlanRequestEmails` covers the
 * moment a request arrives; this covers the moment it is answered — and until
 * it existed, confirming a deposit activated someone's plan and **told them
 * nothing**. They found out by logging in and looking, which is a poor way to
 * learn that the thing you paid for has started.
 *
 * Refunds are announced for the sharper version of the same reason: a plan
 * silently disappearing looks like a fault, and a client whose access stopped
 * working deserves to know it was deliberate.
 *
 * The same argument extends to an admin override (`changed` / `removed`).
 * That path moves no money, which makes it *more* important to send, not
 * less: nothing else — no transfer, no bank line, no request of their own —
 * would tell the client their limits moved.
 *
 * Never fatal, always awaited — see `sendQuietly`, and the same reasoning as
 * the request path: this is reporting something already committed, on a
 * platform that may freeze the function the moment the response is sent.
 *
 * ## The two halves of `nextStep`
 *
 * Every `nextStep` string is two lines: where to look, then what to do if it
 * looks wrong. The first line's job now belongs to the button, so only the
 * second is printed as copy — otherwise the same address appears twice, once
 * as a button and once as a sentence pointing at it.
 *
 * The split is defensive. All four decisions in all three locales carry that
 * newline today, but a translator is free to drop it, and a missing newline
 * must never silently delete half a sentence. A string that does not split is
 * printed whole and the button is left out.
 */
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { SITE, siteUrl } from "@/shared/config/site";
import {
  renderEmail,
  send,
  sendQuietly,
  type EmailBlock,
  type EmailDocument,
} from "@/shared/mail";
import { isPlanKey } from "../model/plans";

export type Decision = "confirmed" | "refunded" | "changed" | "removed";

/**
 * Which decisions are bad news for the recipient.
 *
 * These get the muted palette: an amber call-to-action under "your plan is no
 * longer active" reads as pleased about it.
 */
const NEUTRAL: ReadonlySet<Decision> = new Set<Decision>(["refunded", "removed"]);

/** The already-translated strings this email is assembled from. */
export interface DecisionEmailCopy {
  subject: string;
  greeting: string;
  body: string;
  /** The raw two-line string; the split happens inside the builder. */
  nextStep: string;
  ctaLabel: string;
  signature: string;
}

/**
 * Builds the document, and takes no translator so anything can call it.
 *
 * Extracted so the preview harness can render exactly what a client receives
 * instead of a hand-copied imitation of it. The imitation is not a theoretical
 * risk: the auth email's copy drifted, and a bug that had already been fixed
 * went on appearing in every test email until someone noticed the two files
 * disagreed.
 */
export function depositDecisionDocument(
  copy: DecisionEmailCopy,
  planUrl: string,
  locale: string,
  neutral: boolean
): EmailDocument {
  const [whereToLook, whatIfWrong] = splitNextStep(copy.nextStep);

  const blocks: EmailBlock[] = [
    { kind: "paragraph", text: copy.greeting },
    { kind: "paragraph", text: copy.body },
  ];

  if (whatIfWrong === null) {
    blocks.push({ kind: "paragraph", text: whereToLook });
  } else {
    blocks.push({ kind: "button", label: copy.ctaLabel, href: planUrl });
    blocks.push({ kind: "paragraph", text: whatIfWrong });
  }

  return {
    locale,
    // The subject says what happened; the preview line says what to do about
    // it. Repeating the subject here would waste the second line of the two
    // the recipient reads in a list.
    preheader: whatIfWrong ?? whereToLook,
    heading: copy.subject,
    tone: neutral ? "neutral" : "brand",
    blocks,
    footer: { note: copy.signature },
  };
}

/**
 * Looks the recipient up rather than taking them as an argument: the admin
 * route knows a deposit id and an admin's session, never the client's email
 * or which of the three languages to write in.
 */
export async function sendDepositDecisionEmail(
  userId: string,
  planKey: string,
  decision: Decision
): Promise<void> {
  await sendQuietly(`deposit ${decision}`, async () => {
    const rows = await db()
      .select({
        email: schema.users.email,
        name: schema.users.name,
        locale: schema.users.locale,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const user = rows[0];
    if (!user) return;

    const t = await getTranslations({ locale: user.locale, namespace: "Plans.decisionEmail" });
    const tPlans = await getTranslations({ locale: user.locale, namespace: "Plans" });
    const tAccount = await getTranslations({ locale: user.locale, namespace: "Account" });
    // A plan retired from the catalogue would have no translated name. Fall
    // back to the key rather than sending mail addressed to a broken string.
    const planName = isPlanKey(planKey) ? tPlans(`tiers.${planKey}.name`) : planKey;

    const planUrl = siteUrl("/account/plan");
    const neutral = NEUTRAL.has(decision);

    const copy: DecisionEmailCopy = {
      subject: t(`${decision}.subject`, { plan: planName }),
      greeting: t("greeting", { name: user.name }),
      body: t(`${decision}.body`, { plan: planName }),
      nextStep: t(`${decision}.nextStep`, { url: planUrl, email: SITE.email }),
      // A plan that still exists is managed; one that is gone is replaced.
      ctaLabel: neutral ? tAccount("viewPlans") : tAccount("managePlan"),
      signature: t("signature", { site: SITE.name }),
    };

    const { html, text } = renderEmail(
      depositDecisionDocument(copy, planUrl, user.locale, neutral)
    );

    await send({ to: user.email, subject: copy.subject, text, html });
  });
}

/** `[wholeString, null]` when there is no newline to split on. */
function splitNextStep(value: string): [string, string | null] {
  const at = value.indexOf("\n");
  if (at < 0) return [value, null];
  return [value.slice(0, at).trim(), value.slice(at + 1).trim()];
}
