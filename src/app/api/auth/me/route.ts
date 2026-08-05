import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";

/**
 * "Who is asking?", for the header account widget and nothing else.
 *
 * It exists so `Header.tsx` can stay static (ARCHITECTURE.md §6a): reading
 * the session cookie in the header would force the homepage, About and Terms
 * to render per-request and lose static generation on exactly the pages SEO
 * depends on. One client-side call after hydration costs those pages nothing.
 *
 * Returns the *minimum* the widget renders — a display name. Role, plan and
 * email stay out: this response is the most-called authenticated endpoint on
 * the site and there is no reason for it to carry anything a signed-out
 * observer would find interesting if a cache ever misbehaved.
 */
export async function GET() {
  const user = await currentUser();
  return NextResponse.json(
    { user: user ? { name: user.name } : null },
    {
      // Belt and braces. The response is per-session, so it must never land
      // in a shared cache — not Vercel's, not a corporate proxy's.
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    }
  );
}
