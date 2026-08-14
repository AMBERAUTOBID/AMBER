import { and, desc, eq, isNull, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";

/**
 * The Users view: every registered account, searchable.
 *
 * Replaces the old find-by-email panel. One list rather than a lookup box is
 * what "control client accounts" actually needs — you search, you see who it
 * is, and you act on the row in front of you, instead of erasing whatever an
 * email string happened to match.
 */
export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "client" | "admin";
  activePlanKey: string | null;
  emailVerified: boolean;
  createdAt: Date;
  favorites: number;
  deposits: number;
}

/**
 * Hard cap on any one page of results.
 *
 * Deliberately bounded rather than "select everything and let the browser
 * cope" — that is fine at ten users and a slow, memory-hungry mistake at ten
 * thousand. Search narrows; when the list genuinely outgrows one page,
 * offset paging is the next step and this constant is where it starts.
 */
export const USERS_PAGE_SIZE = 50;

export interface UsersResult {
  rows: AdminUserRow[];
  /** Total matching the filter, so the UI can admit what it isn't showing. */
  total: number;
}

/**
 * Newest first — a list of people is browsed as "who joined recently", and
 * anyone older is found by searching rather than by scrolling.
 *
 * The two counts are correlated subqueries rather than joins: a join with
 * GROUP BY would multiply rows across two unrelated one-to-many tables and
 * need distinct-counting to undo it. At this scale the planner handles the
 * subqueries fine, and the query stays readable.
 */
export async function listUsers(query: string): Promise<UsersResult> {
  const filter = buildFilter(query);

  const rows = await db()
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      phone: schema.users.phone,
      role: schema.users.role,
      activePlanKey: schema.users.activePlanKey,
      emailVerifiedAt: schema.users.emailVerifiedAt,
      createdAt: schema.users.createdAt,
      favorites: sql<number>`(select count(*) from ${schema.favorites} where ${schema.favorites.userId} = ${schema.users.id})`,
      deposits: sql<number>`(select count(*) from ${schema.deposits} where ${schema.deposits.userId} = ${schema.users.id})`,
    })
    .from(schema.users)
    .where(filter)
    .orderBy(desc(schema.users.createdAt))
    .limit(USERS_PAGE_SIZE);

  const counted = await db()
    .select({ total: sql<number>`count(*)` })
    .from(schema.users)
    .where(filter);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      activePlanKey: r.activePlanKey,
      emailVerified: r.emailVerifiedAt !== null,
      createdAt: r.createdAt,
      // Postgres counts come back as strings through the driver.
      favorites: Number(r.favorites),
      deposits: Number(r.deposits),
    })),
    total: Number(counted[0]?.total ?? 0),
  };
}

/**
 * One person, for their own page.
 *
 * A separate query rather than filtering `listUsers`, because the two answer
 * different questions and want different shapes — and because this one must
 * be able to return an **erased** account. The list hides them (nothing left
 * to act on), but a direct link to one has to resolve to something honest
 * rather than a 404 that reads as "no such person".
 */
export async function findUser(id: string): Promise<AdminUserRow & { deletedAt: Date | null } | null> {
  const rows = await db()
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      phone: schema.users.phone,
      role: schema.users.role,
      activePlanKey: schema.users.activePlanKey,
      emailVerifiedAt: schema.users.emailVerifiedAt,
      deletedAt: schema.users.deletedAt,
      createdAt: schema.users.createdAt,
      favorites: sql<number>`(select count(*) from ${schema.favorites} where ${schema.favorites.userId} = ${schema.users.id})`,
      deposits: sql<number>`(select count(*) from ${schema.deposits} where ${schema.deposits.userId} = ${schema.users.id})`,
    })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    activePlanKey: r.activePlanKey,
    emailVerified: r.emailVerifiedAt !== null,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    favorites: Number(r.favorites),
    deposits: Number(r.deposits),
  };
}

/**
 * Always excludes erased accounts, plus a case-insensitive partial match on
 * name or email when a search term is given.
 *
 * Erased rows are hidden because there is nothing left of them to act on:
 * name, email and phone are gone, and the deposit rows they retain are
 * already visible in the deposits sections. Their existence is reported as a
 * footnote count instead, so an admin can still see that erasures happened.
 *
 * The term is parameterised through drizzle's `sql` template, so the search
 * box is not an injection surface. `%` and `_` are escaped inside it:
 * without that, searching "a_b" would silently match "axb" — a correctness
 * bug well before it is a security one.
 */
function buildFilter(query: string): SQL | undefined {
  const live = isNull(schema.users.deletedAt);
  const term = query.trim().slice(0, 200);
  if (!term) return live;

  const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;
  return and(
    live,
    or(
      sql`${schema.users.email} ilike ${pattern}`,
      sql`${schema.users.name} ilike ${pattern}`
    )
  );
}

/** How many accounts have been erased. Shown as a footnote so an admin can
 * see that erasures happened without the anonymised rows cluttering the
 * list — they carry no name, no email and nothing left to act on. */
export async function erasedUserCount(): Promise<number> {
  const rows = await db()
    .select({ total: sql<number>`count(*)` })
    .from(schema.users)
    .where(isNotNull(schema.users.deletedAt));
  return Number(rows[0]?.total ?? 0);
}

