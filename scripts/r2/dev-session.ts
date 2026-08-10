/**
 * Mints a session cookie for the MIRROR branch so the browser can be driven
 * through the case-file pages.
 *
 *   npx tsx --env-file=.env.local scripts/r2/dev-session.ts [email]
 *
 * Why this exists: the mirror carries a copy of `sessions` taken on the day the
 * branch was made, so no cookie from the real site resolves against it, and the
 * only accounts in there belong to other people whose passwords we do not have.
 * Every layer below the page has been proved by script, but a page nobody has
 * ever clicked is not a page anyone has verified.
 *
 * Three things keep this from being a back door:
 *   - it refuses to run against anything but the mirror endpoint, by name;
 *   - it needs DATABASE_URL_MIRROR, which lives only in a developer's
 *     `.env.local` and is not set on any deployment;
 *   - it writes a normal session row with the normal 30-day expiry, so
 *     `destroyAllSessionsForUser` and account erasure revoke it like any other.
 *
 * It never reads or bypasses a password. It grants nothing an admin doesn't
 * already have; it just hands the key to a database full of test data.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../../src/shared/db/client";
import { createSession, SESSION_COOKIE } from "../../src/modules/auth/model/session";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
const MIRROR_ENDPOINT = "ep-misty-resonance-asjvq39e";

const mirror = process.env.DATABASE_URL_MIRROR ?? process.env.DATABASE_URL_MIRROR_UNPOOLED;
if (!mirror) {
  console.error("DATABASE_URL_MIRROR is not set. Refusing to guess.");
  process.exit(1);
}
if (mirror.includes(PRODUCTION_ENDPOINT) || !mirror.includes(MIRROR_ENDPOINT)) {
  console.error("ABORT: DATABASE_URL_MIRROR does not point at the mirror branch.");
  process.exit(1);
}
process.env.DATABASE_URL = mirror;

async function main() {
  const email = process.argv[2]?.toLowerCase();

  const rows = await db()
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(
      email
        ? and(eq(schema.users.email, email), isNull(schema.users.deletedAt))
        : and(eq(schema.users.role, "admin"), isNull(schema.users.deletedAt))
    )
    .limit(1);

  const user = rows[0];
  if (!user) {
    console.error(email ? `No live account for ${email} in the mirror.` : "No admin account in the mirror.");
    process.exit(1);
  }

  const { token, expiresAt } = await createSession(user.id, {
    userAgent: "dev-session.ts (mirror)",
    ip: "127.0.0.1",
  });

  console.log(`signed in as ${user.name} <${user.email}> (${user.role})`);
  console.log(`expires     ${expiresAt.toISOString()}\n`);
  console.log(`document.cookie = "${SESSION_COOKIE}=${token}; path=/";`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
