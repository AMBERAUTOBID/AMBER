import { setRequestLocale } from "next-intl/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import AccountShell from "@/modules/account/components/AccountShell";

/**
 * Wraps every account section in the shared shell.
 *
 * Note what this does NOT do: redirect. It reads the session only because the
 * shell needs a name to render, and when there is no session it renders the
 * children bare and lets the page handle it — every page calls `requireUser`
 * itself, which is the actual boundary (see that file).
 *
 * That split matters for more than tidiness. A layout runs before its page,
 * so a redirect here would always win the race — and the layout has no idea
 * which child is rendering, so it could only ever send people to a generic
 * `/login` with no return path. Standing aside is what lets an emailed link
 * to `/account/plan` survive the sign-in.
 *
 * `currentUser` is request-deduplicated, so this call and the page's are one
 * query between them.
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
  const user = await currentUser();
  if (!user) return children;

  return (
    <AccountShell locale={locale} user={user}>
      {children}
    </AccountShell>
  );
}
