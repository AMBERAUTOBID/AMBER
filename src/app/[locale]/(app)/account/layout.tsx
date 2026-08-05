import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/modules/account/model/requireUser";
import AccountShell from "@/modules/account/components/AccountShell";

/**
 * Wraps every account section in the shared shell.
 *
 * The `requireUser` call here is for the shell's benefit — it needs a name to
 * render. It is NOT the security boundary: each page calls `requireUser`
 * itself, for the reasons set out in that file. The two calls cost one query
 * between them.
 */
export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);

  return (
    <AccountShell locale={locale} user={user}>
      {children}
    </AccountShell>
  );
}
