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
 * Never fatal, always awaited — see `deliverQuietly`, and the same reasoning
 * as the request path: this is reporting something already committed, on a
 * platform that may freeze the function the moment the response is sent.
 */
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { SITE, siteUrl } from "@/shared/config/site";
import { deliver, deliverQuietly } from "./deliver";
import { isPlanKey } from "../model/plans";

export type Decision = "confirmed" | "refunded" | "changed" | "removed";

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
  await deliverQuietly(`deposit ${decision}`, async () => {
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
    // A plan retired from the catalogue would have no translated name. Fall
    // back to the key rather than sending mail addressed to a broken string.
    const planName = isPlanKey(planKey) ? tPlans(`tiers.${planKey}.name`) : planKey;

    const body = [
      t("greeting", { name: user.name }),
      "",
      t(`${decision}.body`, { plan: planName }),
      "",
      t(`${decision}.nextStep`, { url: siteUrl("/account/plan"), email: SITE.email }),
      "",
      t("signature", { site: SITE.name }),
    ].join("\n");

    await deliver({
      to: user.email,
      subject: t(`${decision}.subject`, { plan: planName }),
      text: body,
    });
  });
}
