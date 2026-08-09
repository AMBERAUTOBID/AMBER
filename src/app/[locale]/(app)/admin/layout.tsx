import { setRequestLocale } from "next-intl/server";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import AdminShell from "@/modules/admin/components/AdminShell";

/**
 * Wraps every admin section in the shared shell.
 *
 * Note what this does NOT do: 404. It reads the admin only because the shell
 * needs a name to render; when there is no admin it renders the children bare
 * and lets the page decide. **Every page calls `currentAdmin()` itself** —
 * that is the boundary, for the reason spelled out in `requireUser.ts`: a
 * layout is shared and can be skipped on client-side navigation between
 * sibling routes, so a check living only here is a check that sometimes
 * doesn't run.
 *
 * `currentAdmin` goes through `currentUser`, which is request-deduplicated, so
 * this call and the page's are one query between them.
 *
 * The route sits inside the `(app)` group, which already declares
 * `force-dynamic` for everything signed-in. That group's own comment
 * anticipated this move: it "deliberately adds no markup" so a non-account app
 * page would not inherit the account sidebar.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await currentAdmin();
  if (!user) return children;

  return (
    <AdminShell locale={locale} user={user}>
      {children}
    </AdminShell>
  );
}
