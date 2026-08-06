/**
 * Maintenance mode — the write side. The read side (proxy check, cache,
 * closed-sign page) lives in shared/gate/maintenanceGate.ts, which shared/
 * layering forbids from importing this file; the two meet only at the
 * site_settings row and the cookie name.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { generateToken, hashToken } from "@/modules/auth/model/token";

export interface MaintenanceState {
  on: boolean;
  updatedAt: Date | null;
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const rows = await db()
    .select({
      maintenance: schema.siteSettings.maintenance,
      updatedAt: schema.siteSettings.updatedAt,
    })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.id, 1))
    .limit(1);
  return rows[0]
    ? { on: rows[0].maintenance, updatedAt: rows[0].updatedAt }
    : { on: false, updatedAt: null };
}

/**
 * Closes the site and returns the bypass token for the admin's own cookie.
 *
 * A FRESH token every time it's enabled, deliberately: yesterday's bypass
 * cookie — on a machine that was since lent out, or in a browser profile
 * someone else uses — must not open today's maintenance window. Enabling is
 * the revocation moment for every previously issued bypass.
 */
export async function enableMaintenance(adminId: string): Promise<{ bypassToken: string }> {
  const bypassToken = generateToken();
  await db()
    .insert(schema.siteSettings)
    .values({
      id: 1,
      maintenance: true,
      bypassTokenHash: hashToken(bypassToken),
      updatedBy: adminId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.siteSettings.id,
      set: {
        maintenance: true,
        bypassTokenHash: hashToken(bypassToken),
        updatedBy: adminId,
        updatedAt: new Date(),
      },
    });
  await recordAudit(adminId, "maintenance.enabled");
  return { bypassToken };
}

/** Reopens the site and voids every bypass token with it. */
export async function disableMaintenance(adminId: string): Promise<void> {
  await db()
    .insert(schema.siteSettings)
    .values({ id: 1, maintenance: false, bypassTokenHash: null, updatedBy: adminId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.siteSettings.id,
      set: { maintenance: false, bypassTokenHash: null, updatedBy: adminId, updatedAt: new Date() },
    });
  await recordAudit(adminId, "maintenance.disabled");
}

/**
 * Fresh bypass for an admin who signs in WHILE the site is closed — the
 * "turn it back on from my phone" path. Returns null when the site is open,
 * because then there is nothing to bypass.
 *
 * The row holds ONE bypass hash, so issuing a fresh token here rotates it —
 * which quietly invalidates the bypass cookie of whoever enabled
 * maintenance on another device. That trade is deliberate: the alternative
 * is a bypass-tokens table, which is real machinery for what is in practice
 * a one-operator business. If two admins genuinely work a window together,
 * the one who gets bounced signs in again and becomes the current holder.
 * Revisit only if a second full-time operator ever exists.
 */
export async function issueBypassForAdminLogin(adminId: string): Promise<string | null> {
  const state = await getMaintenanceState();
  if (!state.on) return null;

  const bypassToken = generateToken();
  await db()
    .update(schema.siteSettings)
    .set({ bypassTokenHash: hashToken(bypassToken) })
    .where(eq(schema.siteSettings.id, 1));
  await recordAudit(adminId, "maintenance.bypass_reissued");
  return bypassToken;
}

/** Same never-fatal audit pattern as deposits.ts. */
async function recordAudit(actorId: string, action: string): Promise<void> {
  try {
    await db()
      .insert(schema.auditLog)
      .values({ actorId, action, targetType: "site", targetId: "1" });
  } catch (e) {
    console.error("[audit] failed to record", action, e);
  }
}
