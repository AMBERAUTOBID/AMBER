import { getTranslations } from "next-intl/server";
import Container from "@/shared/ui/Container";
import { Link } from "@/i18n/navigation";
import SectionNav from "@/shared/ui/SectionNav";
import { ADMIN_SECTIONS } from "../model/sections";

interface AdminShellProps {
  locale: string;
  user: { name: string; email: string };
  children: React.ReactNode;
}

/**
 * The frame every admin page renders inside.
 *
 * The console used to be a single scrolling page of stacked `AdminSection`s,
 * and that file's own comment named this as the seam: "when the list outgrows
 * one scroll, this is where a sidebar or tabs go". It outgrew it. Four
 * sections already meant scrolling past the deposit queue to reach
 * maintenance, and the vehicle case files coming next are a list-plus-detail
 * view that cannot live inside a shared scroll at all.
 *
 * Same shape as `AccountShell` on purpose, down to the shared `SectionNav`:
 * the two areas are the same product seen from two sides, and an operator who
 * has learned one should not have to learn the other.
 *
 * `AdminSection` survives and is still the unit *within* a page — several
 * still belong together on one screen (the deposit queue and the clients it
 * feeds). What changed is that it is no longer the only structure available.
 */
export default async function AdminShell({ locale, user, children }: AdminShellProps) {
  const t = await getTranslations({ locale, namespace: "Admin" });

  return (
    <Container className="py-12 md:py-16">
      <div className="md:flex md:gap-12">
        <aside className="md:w-56 md:shrink-0">
          <div className="md:sticky md:top-24">
            <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold tracking-tight text-char-900">
              {t("title")}
            </p>
            <p className="mt-0.5 truncate text-xs text-char-500" title={user.email}>
              {user.name}
            </p>

            <div className="mt-6 border-t border-char-200/70 pt-4">
              <SectionNav
                label={t("nav.label")}
                items={ADMIN_SECTIONS.map((s) => ({
                  href: s.href,
                  label: t(`nav.${s.key}`),
                }))}
              />
            </div>

            {/* The way back to the client-facing account area. An admin is
                normally in here to answer a client's question, and the fastest
                way to answer it is often to look at what the client sees. */}
            <div className="mt-4 border-t border-char-200/70 pt-4">
              <Link
                href="/account/details"
                className="text-sm font-semibold text-amber-700 underline-offset-4 hover:underline"
              >
                {t("nav.backToAccount")}
              </Link>
            </div>
          </div>
        </aside>

        <div className="mt-10 min-w-0 flex-1 md:mt-0">{children}</div>
      </div>
    </Container>
  );
}
