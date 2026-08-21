import { getTranslations } from "next-intl/server";
import Container from "@/shared/ui/Container";
import { Link } from "@/i18n/navigation";
import LogoutButton from "@/modules/auth/components/LogoutButton";
import SectionNav from "@/shared/ui/SectionNav";
import { accountSectionsFor } from "../model/sections";

interface AccountShellProps {
  locale: string;
  user: { name: string; email: string; role: "client" | "admin" };
  children: React.ReactNode;
}

/**
 * The frame every account page renders inside: identity, sidebar, log out.
 *
 * A server component — only the nav needs the client, for the active-link
 * highlight. Pages supply their own headings so each section can title
 * itself; the shell owns everything shared.
 */
export default async function AccountShell({ locale, user, children }: AccountShellProps) {
  const t = await getTranslations({ locale, namespace: "Account" });

  return (
    <Container className="py-12 md:py-16">
      <div className="md:flex md:gap-12">
        <aside className="md:w-56 md:shrink-0">
          <div className="md:sticky md:top-24">
            <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold tracking-tight text-char-900">
              {user.name}
            </p>
            <p className="mt-0.5 truncate text-xs text-char-500" title={user.email}>
              {user.email}
            </p>

            <div className="mt-6 border-t border-char-200/70 pt-4">
              <SectionNav
                label={t("nav.label")}
                items={accountSectionsFor(user.role).map((s) => ({
                  href: s.href,
                  label: t(`nav.${s.key}`),
                }))}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-char-200/70 pt-4">
              {/* Reachable from anywhere in the area rather than only the
                  overview — an admin is normally here to answer a client
                  question, not to read their own account page. */}
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="text-sm font-semibold text-amber-700 underline-offset-4 hover:underline"
                >
                  {t("adminConsole")}
                </Link>
              )}
              <LogoutButton />
            </div>
          </div>
        </aside>

        <div className="mt-10 min-w-0 flex-1 md:mt-0">{children}</div>
      </div>
    </Container>
  );
}
