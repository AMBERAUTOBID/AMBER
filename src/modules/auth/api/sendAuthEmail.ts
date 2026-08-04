/**
 * Transactional auth emails: verification and password reset.
 *
 * Same Gmail transport and same "logged" degradation as the leads module:
 * without credentials the email text is written to the server log instead,
 * which in local dev doubles as the way to grab the link without an inbox.
 *
 * Strings live in messages/*.json (Auth.emails.*) so the locale-parity check
 * covers them — a verification email must never fall back to English for a
 * Russian-speaking customer just because a key was missed.
 *
 * Plain text on purpose. HTML mail adds spam-filter surface and rendering
 * bugs for zero benefit when the entire content is one link.
 */
import nodemailer from "nodemailer";
import { getTranslations } from "next-intl/server";
import { SITE } from "@/shared/config/site";

interface AuthMail {
  to: string;
  locale: string;
  kind: "verify" | "reset";
  /** Absolute link, already carrying its token. */
  link: string;
}

export async function sendAuthEmail(mail: AuthMail): Promise<void> {
  const t = await getTranslations({ locale: mail.locale, namespace: "Auth.emails" });
  const subject = t(`${mail.kind}.subject`);
  const body = [
    t(`${mail.kind}.greeting`),
    "",
    t(`${mail.kind}.instruction`),
    "",
    mail.link,
    "",
    t(`${mail.kind}.expiry`),
    "",
    t("signature", { site: SITE.name }),
  ].join("\n");

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    console.warn(`[auth] mail credentials unset — ${mail.kind} link for ${mail.to}: ${mail.link}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });
  await transporter.sendMail({
    from: `"${SITE.name}" <${gmailUser}>`,
    to: mail.to,
    subject,
    text: body,
  });
}
