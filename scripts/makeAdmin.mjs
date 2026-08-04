/**
 * Promote a registered user to admin — or demote one back to client.
 *
 *   node --env-file=.env.local scripts/makeAdmin.mjs someone@smartautobid.com
 *   node --env-file=.env.local scripts/makeAdmin.mjs someone@smartautobid.com --demote
 *
 * Demotion exists because granting admin by mistake must be as easy to undo
 * as it was to do, without hand-writing SQL against production.
 *
 * Deliberately a command-line script and not a page: there must be no route
 * anywhere in the app that grants admin, because such a route is the single
 * most valuable target in the system. Bootstrapping the first admin has to
 * happen with database credentials in hand, which means physical possession
 * of the .env file — not a session cookie.
 *
 * The user must already exist (register through the site first).
 */
import { neon } from "@neondatabase/serverless";

const email = process.argv[2]?.trim().toLowerCase();
const demote = process.argv.includes("--demote");
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/makeAdmin.mjs <email> [--demote]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Pass --env-file=.env.local.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const targetRole = demote ? "client" : "admin";

const rows = await sql`
  update users set role = ${targetRole}
  where lower(email) = ${email}
  returning id, email, role, email_verified_at
`;

if (rows.length === 0) {
  console.error(`No user with email ${email}. Register through the site first.`);
  process.exit(1);
}

const user = rows[0];
console.log(`${user.email} is now ${user.role}.`);
if (!user.email_verified_at) {
  console.warn("Note: this account's email is not verified yet, so it cannot log in.");
}

// Role changes are exactly the kind of event the audit log exists for.
await sql`
  insert into audit_log (actor_id, action, target_type, target_id, detail)
  values (null, ${demote ? "user.demoted_to_client" : "user.promoted_to_admin"}, 'user', ${user.id}, ${JSON.stringify({ email: user.email, via: "scripts/makeAdmin.mjs" })})
`;
