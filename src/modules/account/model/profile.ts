import { eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";

/**
 * The editable fields the session doesn't already carry.
 *
 * Only `phone` today. It isn't in `SessionUser` because a session is loaded
 * on every authenticated request across the whole site, and widening it for
 * one field that one page needs would make every other page pay for it.
 */
export interface Profile {
  phone: string | null;
}

export async function profileFor(userId: string): Promise<Profile | null> {
  const rows = await db()
    .select({ phone: schema.users.phone })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}
