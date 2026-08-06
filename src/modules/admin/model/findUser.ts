import { and, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";

/**
 * Looks a client up by email so an admin can act on them.
 *
 * Exists because erasure requests arrive the way everything else does here —
 * by email or WhatsApp — so the one identifier an admin reliably has is the
 * address the person wrote from. A full searchable users view is a later
 * project; until then, "paste the address, see who it is, then act" covers
 * the request that actually turns up.
 *
 * The two-step (look up, *then* delete by id) is deliberate. Deleting
 * straight from a typed address means a typo silently erases the wrong
 * person, and this is the one action with no undo. Showing the name first
 * makes the admin confirm a human being, not a string.
 */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
  activePlanKey: string | null;
  createdAt: Date;
}

export async function findUserByEmail(emailRaw: string): Promise<UserSummary | null> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return null;

  const rows = await db()
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      activePlanKey: schema.users.activePlanKey,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    // Already-erased accounts are not findable: there is nothing left to act
    // on, and surfacing the placeholder row would only invite someone to
    // "delete" it twice.
    .where(and(sql`lower(${schema.users.email}) = ${email}`, isNull(schema.users.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
}
