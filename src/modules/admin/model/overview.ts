import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";

/**
 * The numbers the console's front page is made of.
 *
 * Counts only — deliberately not "fetch every list and take `.length`", which
 * is what the single-page console effectively did. That was free at three
 * users and is a full table read per page view at three thousand. The lists
 * themselves are loaded by the section that shows them.
 */
export interface AdminOverview {
  /** Deposits waiting for a decision — the one number that means "act now". */
  pendingDeposits: number;
  activeClients: number;
  /** Live accounts; erased ones are excluded, as everywhere else. */
  users: number;
}

export async function adminOverview(): Promise<AdminOverview> {
  const [pending, clients, users] = await Promise.all([
    db()
      .select({ n: sql<number>`count(*)` })
      .from(schema.deposits)
      .where(eq(schema.deposits.status, "pending")),
    db()
      .select({ n: sql<number>`count(*)` })
      .from(schema.users)
      .where(and(isNotNull(schema.users.activePlanKey), isNull(schema.users.deletedAt))),
    db()
      .select({ n: sql<number>`count(*)` })
      .from(schema.users)
      .where(isNull(schema.users.deletedAt)),
  ]);

  // Postgres counts arrive as strings through the driver.
  return {
    pendingDeposits: Number(pending[0]?.n ?? 0),
    activeClients: Number(clients[0]?.n ?? 0),
    users: Number(users[0]?.n ?? 0),
  };
}
