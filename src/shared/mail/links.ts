/**
 * A `mailto:` that opens the recipient's own mail app with the subject filled in.
 *
 * This exists because of one specific flow. A client who has paid by bank
 * transfer has to send us the bank's confirmation, and the thing that makes
 * that arrive — rather than arrive at the wrong address, or with a subject
 * nobody can match to an invoice — is a button that composes the message for
 * them. Aivi's own invoices do exactly this, and it works because it is not
 * clever: no upload form, no login, no attachment size limit of ours to hit.
 * The client presses it, attaches whatever their bank gave them, and sends.
 *
 * The subject is the whole value. `Nojus Mikalken - payment confirmation -
 * SAB-2418-01` can be matched to a case by eye in a full inbox; `Re: your
 * invoice` cannot.
 *
 * No `body` parameter on purpose. Prefilling the body puts a cursor after our
 * text rather than in an empty message, and the one thing we actually need
 * from them — the attachment — is not something a mailto can carry anyway.
 */
export function mailtoHref(to: string, subject: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}`;
}
