/**
 * The relational schema — every table the application owns.
 *
 * One file rather than per-module fragments, and that is a deliberate
 * exception to "shared/ knows no business": foreign keys cross module
 * boundaries (a deposit references a user; an audit row references both), so
 * splitting the schema by module would force circular imports or duplicate
 * table definitions. Modules own the *behavior* around these tables; this
 * file owns only their shape. See ARCHITECTURE.md §6.
 *
 * Conventions:
 * - Money is integer cents/minor units, never floats — €500 is 50000. The
 *   pricing module learned this lesson already; the same rule applies here.
 * - Timestamps are timestamptz, set by the database (defaultNow), so rows
 *   can't lie about when they were created even if app-server clocks drift.
 * - Soft business state (plan, deposit) lives in its own table with history,
 *   not as mutable columns on users — an admin question like "when was this
 *   deposit confirmed and by whom" must always be answerable.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** lower() for the functional unique index on users.email. */
function sqlLower(col: AnyPgColumn): SQL {
  return sql`lower(${col})`;
}

/**
 * Identity only — what a person needs to log in and be addressed. Their
 * commercial state (plan, deposit, bids) lives in the tables below.
 *
 * `selfBiddingGrantedAt`: the plan makes a client *eligible* for live
 * self-bidding; this column records an admin actually *granting* it after the
 * mandatory contact step. Two different facts, two different places — a plan
 * purchase must never silently unlock live bidding.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    /** Argon2id hash — never a password, never reversible. */
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    /** UI locale (en/ru/lt) so emails arrive in the user's language. */
    locale: text("locale").notNull().default("en"),
    role: text("role", { enum: ["client", "admin"] })
      .notNull()
      .default("client"),
    /** Null until the verification link is clicked; gates login. */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** Which plan row is active. Null = registered but no plan chosen yet. */
    activePlanKey: text("active_plan_key"),
    selfBiddingGrantedAt: timestamp("self_bidding_granted_at", { withTimezone: true }),
    /**
     * Set when the account is erased. The row survives **anonymised** — name,
     * email and phone scrubbed, password made unusable — rather than being
     * deleted outright, because `deposits.user_id` cascades and a real
     * deletion would take the financial history with it. GDPR grants erasure
     * of personal data; it does not require destroying accounting records,
     * and Art. 17(3) explicitly permits keeping what a legal obligation
     * needs.
     *
     * So this column is what separates "a person who left" from "a person".
     * Anything that reads a user must treat a non-null value as gone: login
     * refuses it, and no session may survive it.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique on lower(email) so Foo@x.com can't register alongside foo@x.com.
    uniqueIndex("users_email_lower_idx").on(sqlLower(t.email)),
  ]
);

/**
 * Server-side sessions, one row per logged-in browser. DB-backed rather than
 * JWT by explicit decision: when a deposit is withdrawn or an account is
 * frozen, an admin deletes the rows and access dies *now* — a signed token
 * would stay valid until expiry with no way to recall it.
 *
 * `tokenHash`: the cookie holds a random token; we store only its SHA-256.
 * A leaked database dump therefore contains nothing that logs anyone in.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Coarse context for the account's "active sessions" view and audits. */
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
  ]
);

/**
 * One row per deposit lifecycle event-holder — requested, then confirmed or
 * refunded by a named admin. Deposits arrive by bank transfer and are
 * confirmed manually (decision: no card payments in Phase 2; PCI scope and
 * chargebacks are not worth it while the business runs on transfers).
 */
export const deposits = pgTable(
  "deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planKey: text("plan_key").notNull(),
    /** Integer euro cents. €1500 = 150000. */
    amountCents: integer("amount_cents").notNull(),
    /**
     * "cancelled" is the client withdrawing their own request before anyone
     * acted on it — a terminal state like the others, kept rather than
     * deleted so the queue's history stays honest about what was asked for.
     *
     * No migration needed to add a value here: the column is `text`, and this
     * enum is a TypeScript-level constraint only. Postgres never saw a CHECK.
     */
    status: text("status", {
      enum: ["pending", "confirmed", "cancelled", "refund_requested", "refunded"],
    })
      .notNull()
      .default("pending"),
    /**
     * When the client ticked "I have read and agree" in the plan dialog.
     * Recorded because an agreement you cannot evidence later is not much of
     * an agreement — this is the row that answers "did they accept, and
     * when". Nullable only for rows created before the dialog existed.
     */
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    /**
     * Which admin confirmed/refunded — accountability, not decoration.
     *
     * `set null` rather than the default restrict: without it, deleting any
     * staff account fails with a foreign-key error because it once approved
     * a deposit, which would make an account-deletion request (GDPR) fail on
     * a technicality. The deposit row and its reviewedAt survive regardless,
     * and audit_log independently records who did it and when, so the
     * accountability trail does not depend on this column alone.
     */
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deposits_user_id_idx").on(t.userId), index("deposits_status_idx").on(t.status)]
);

/**
 * Cars a client has saved. One row per (user, lot).
 *
 * **Deliberately denormalised.** Everything needed to draw the card is copied
 * in at save time, so opening the favourites page costs zero calls to Apibara
 * no matter how many entries it holds. Storing only a VIN and re-fetching
 * would mean N upstream calls per page view — a page that gets slower and
 * more fragile the more useful it becomes, against a quota the Telegram bot
 * shares and an API that throws intermittent 502s.
 *
 * The snapshot is a record of what the lot looked like **when saved**, and
 * the UI must say so rather than implying it is current. That is not just
 * caution: auction fields in Apibara *list* responses are batch-stamped and
 * routinely report a long-sold lot as live (see inventory/api/types.ts), so a
 * card claiming live status from saved data would be repeating a known lie.
 * Only the detail endpoint knows the truth, and only a refresh asks it.
 *
 * These rows are written from the SERVER's own fetch, never from the request
 * body — same rule as deposits.amountCents. A client that could supply the
 * title and price could save "Ferrari — $1".
 */
export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Identity. `/vehicles/{vinOrLot}` resolves either, and keeps resolving
     * after the lot sells — a saved car is never unrecoverable. */
    platform: text("platform", { enum: ["copart", "iaai"] }).notNull(),
    lotNumber: text("lot_number").notNull(),
    /** Nullable: salvage rows occasionally lack one, and it is not the key. */
    vin: text("vin"),

    // ── snapshot, for rendering without an upstream call ──────────────
    title: text("title").notNull(),
    year: integer("year"),
    make: text("make"),
    model: text("model"),
    /** Thumbnail URL on the source CDN. Nullable, and may 404 later — the
     * card must degrade to a placeholder rather than a broken image. */
    imageUrl: text("image_url"),
    /**
     * USD cents at save time. **Null means "no bid recorded", never zero** —
     * Copart lots commonly have no current bid before bidding opens, and
     * printing $0 would state a price nobody has offered (invariant #5).
     */
    priceUsdCents: integer("price_usd_cents"),
    /** Scheduled sale time as known at save time. */
    auctionAt: timestamp("auction_at", { withTimezone: true }),
    /** Last time the snapshot was re-fetched; null = never refreshed. */
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Keyed on the lot, not the VIN: lot numbers are unique per platform and
    // always present. Makes a double-clicked save a no-op instead of a
    // duplicate row.
    uniqueIndex("favorites_user_lot_idx").on(t.userId, t.platform, t.lotNumber),
    index("favorites_user_id_idx").on(t.userId),
  ]
);

/**
 * Append-only record of consequential actions: who did what to whom, when.
 * Written by the code paths that change money- or access-relevant state
 * (deposit confirmation, plan assignment, self-bidding grant, admin login).
 * Nothing ever updates or deletes rows here.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Null actor = the system itself (e.g. scheduled cleanup), or an actor
     * whose account was later deleted. `set null` for the same reason as
     * deposits.reviewedBy: an append-only log must never be the thing that
     * blocks erasing a person. Identifying details belong in `detail`, which
     * survives the account.
     */
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    /** Free-form context: old/new values, request metadata. */
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_actor_idx").on(t.actorId), index("audit_log_action_idx").on(t.action)]
);

/**
 * Rate-limit counters (login attempts, contact form, password resets), keyed
 * by e.g. "login:1.2.3.4". A table instead of Redis because the volumes here
 * are tiny and it saves provisioning a second store before Phase 2 needs one;
 * swap for Upstash if these counters ever become hot.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

/**
 * Email verification + password reset tokens. Same hashing rule as sessions:
 * the emailed link carries the token, the row stores only the hash.
 */
export const actionTokens = pgTable(
  "action_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["verify_email", "reset_password"] }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set on first use — tokens are strictly single-use. */
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("action_tokens_hash_idx").on(t.tokenHash),
    index("action_tokens_user_idx").on(t.userId),
  ]
);
