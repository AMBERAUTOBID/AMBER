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
  bigint,
  boolean,
  customType,
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

/**
 * Postgres full-text type. Drizzle has no built-in `tsvector`, and the
 * alternative — an expression index that schema.ts knows nothing about — would
 * be invisible to `drizzle-kit generate` and liable to be dropped by a later
 * migration. Declaring the type keeps the index under the same management as
 * every other one.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

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
 * Site-wide operator switches. One row, id fixed at 1 — this is a settings
 * record, not a collection.
 *
 * Maintenance mode lives in the database rather than an env var for one
 * reason: the owner flips it with a button, and an env var change means a
 * redeploy — the exact thing you don't want to wait for when the site needs
 * to go quiet NOW. The proxy reads this row with a short in-memory cache
 * (see shared/gate/maintenanceGate.ts), so the toggle takes effect within
 * seconds without costing a query per request.
 *
 * `bypassTokenHash` follows the session-token rule: the admin's browser
 * carries the random token, the row stores only its SHA-256.
 */
export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey(),
  maintenance: boolean("maintenance").notNull().default(false),
  /** Hash of the cookie that lets admins browse the site while it's down. */
  bypassTokenHash: text("bypass_token_hash"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

// ─────────────────────────────────────────────────────────────────────────────
// Our own mirror of the auction catalogue.
//
// WHY THESE EXIST: every lot the site shows is currently fetched from a
// third-party aggregator once per page view, which makes their uptime our
// uptime — on 2026-08-06 Apibara returned HTTP 500 for 75+ minutes and /search
// had nothing to render. It is also slow: a make-only category browse measured
// 12-28s of server time because one browse fans out into several upstream
// calls. Owning the rows fixes both, and unlocks what no aggregator search API
// gives us: a result count, facet counts, real full-text, and archived browsing.
//
// These tables are ADDITIVE and nothing else references them. The site keeps
// running entirely on the live API until `SEARCH_SOURCE` says otherwise, so a
// half-finished mirror cannot affect a visitor.
//
// TWO RULES LEARNED FROM MEASURING THE VENDOR, both of which cost money if
// ignored:
//
// 1. NEVER ASSUME A CURRENCY. A Canadian IAAI lot came back stamped
//    `currency: {char_code: "BRL"}` — Brazilian Real. Amounts are therefore
//    stored next to the currency the vendor claimed, and a cost estimate must
//    refuse to run rather than guess. The precedent is the post that once
//    advertised a 2022 BMW landed in Klaipėda for €1,656, which came from
//    treating a null bid as $0.
// 2. NEVER ASSUME A UNIT. There is no unit field on `odometer`, and the
//    catalogue spans US, Canadian and Finnish branches. A 2006 F-350 showing
//    484,007 is plausible as km and absurd as miles, so the number is stored
//    verbatim with the unit recorded separately as an explicit inference.
//
// Vendor strings are stored close to verbatim (whitespace trimmed only — their
// vehicle type is literally `"TRUCK "` with a trailing space). Derived and
// normalised values sit in their OWN columns so a bad normalisation can be
// recomputed from stored data instead of re-fetching. `raw_json` is
// deliberately NOT kept for every lot: at ~141k active lots that is gigabytes
// against a 0.5 GB free tier, and a full re-sweep costs ~2,850 requests.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row per lot currently listed at a source auction.
 *
 * Keyed on `(platform, lotNumber)` rather than VIN: lot numbers are always
 * present and unique per platform, while salvage rows sometimes arrive with no
 * VIN at all — the same reasoning as `favorites`.
 *
 * DISAPPEARANCE IS NORMAL, NOT AN ERROR. The vendor exposes no "updated since"
 * filter (`updated_at_from` is silently ignored; only `created_at_from` works),
 * so freshness comes from periodic full sweeps. `lastSeenAt` is what makes that
 * safe: every sweep stamps the rows it saw, and anything not stamped has left
 * the active set — sold, withdrawn or relisted. Rows are kept and marked, never
 * deleted, because a client who saved a lot must still be able to open it.
 */
export const auctionLots = pgTable(
  "auction_lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // ── identity ────────────────────────────────────────────────────────────
    /** Normalised to the auction house. Derived from `auctionName`, which is
     * NOT a two-value field — `"IAAI CANADA"` is a real observed value. */
    platform: text("platform", { enum: ["copart", "iaai"] }).notNull(),
    /** The vendor's own string, kept because it carries the region that
     * `platform` throws away, and region decides export eligibility. */
    auctionName: text("auction_name").notNull(),
    /** Arrives as a JSON number; stored as text so it can never be reformatted
     * by numeric handling and stop matching the auction's own reference. */
    lotNumber: text("lot_number").notNull(),
    vin: text("vin"),
    /** The vendor's primary key. Exceeds int4, hence bigint. */
    vendorLotId: bigint("vendor_lot_id", { mode: "number" }),

    // ── classification: every signal, because the usable one isn't known yet ─
    // The vendor has TWO type taxonomies and neither is trustworthy alone. The
    // top-level field yields values like "Light Truck"; `car_info` yields a
    // 9-value uppercase set whose API filter matched only 9.3% of the
    // catalogue. Storing all of them makes choosing between them a query-time
    // decision instead of a re-sweep. `COUNT(*) … GROUP BY` over these columns
    // answers "which one is actually populated?" for free once ingested.
    vehicleType: text("vehicle_type"),
    bodyStyle: text("body_style"),
    carInfoVehicleType: text("car_info_vehicle_type"),
    carInfoBodyClass: text("car_info_body_class"),
    vehicleTypeId: integer("vehicle_type_id"),
    bodyClassId: integer("body_class_id"),

    // ── what it is ──────────────────────────────────────────────────────────
    year: integer("year"),
    make: text("make"),
    model: text("model"),
    series: text("series"),
    /** The vendor's canonical taxonomy ids, so make/model filters can key on
     * something stable rather than on a display string. */
    makeId: integer("make_id"),
    modelId: integer("model_id"),
    seriesId: integer("series_id"),

    // ── specs, one column per filter in the target filter panel ─────────────
    color: text("color"),
    /** Text, not an integer: the vendor sends `"8 Cyl"`. A numeric column is
     * derivable from this later without going back to the API. */
    cylinders: text("cylinders"),
    engineType: text("engine_type"),
    fuel: text("fuel"),
    transmission: text("transmission"),
    drive: text("drive"),
    /** Verbatim, unit-free — see rule 2 above. */
    odometer: integer("odometer"),
    /** `mi` or `km`, INFERRED from the auction region, never sent by the
     * vendor. Null means "not established" and must not be rendered as either. */
    odometerUnit: text("odometer_unit", { enum: ["mi", "km"] }),
    /** "Actual" / "Not Actual" / "Exempt" — the one filter with no obvious
     * source field; nullable until a source is confirmed. */
    odometerBrand: text("odometer_brand"),

    // ── condition and paperwork ─────────────────────────────────────────────
    primaryDamage: text("primary_damage"),
    secondaryDamage: text("secondary_damage"),
    /** Carries a jurisdiction suffix as sent — `"Repairable (AB)"`. Normalise
     * for display, but keep this so the normalisation stays fixable. */
    docType: text("doc_type"),
    /** The vendor sends the string `"no"`, so the boolean is our reading of it
     * and null genuinely means unknown rather than "no keys". */
    hasKeys: boolean("has_keys"),
    /** Run and Drive / Starts / Stationary — drives the Lot Condition filter. */
    highlights: text("highlights"),

    // ── who is selling, and from where ──────────────────────────────────────
    /** Often null in practice; seller *type* comes from `isInsurance`. */
    sellerName: text("seller_name"),
    isInsurance: boolean("is_insurance"),
    locationRaw: text("location_raw"),

    // ── money: minor units, and NEVER without its currency ──────────────────
    currentBidCents: integer("current_bid_cents"),
    buyNowCents: integer("buy_now_cents"),
    estRetailCents: integer("est_retail_cents"),
    /** ISO code as the vendor claimed it. Read this before doing arithmetic:
     * it has been observed disagreeing with the lot's own country. */
    currencyCode: text("currency_code"),
    currencyCodeId: integer("currency_code_id"),

    // ── timing ──────────────────────────────────────────────────────────────
    /** Parsed from `active_bidding[0].sale_date`, which is epoch milliseconds
     * inside a string. */
    saleDate: timestamp("sale_date", { withTimezone: true }),
    /** The vendor's `created_at` arrives with NO timezone
     * (`"2026-05-01 05:47:49"`); the ingest worker records the assumption it
     * made, and this column is not authoritative for anything user-facing. */
    vendorCreatedAt: timestamp("vendor_created_at", { withTimezone: true }),

    // ── normalised, for the filter panel ────────────────────────────────────
    // The auctions describe identical facts differently and inconsistently:
    // `fuel` arrives as GAS / Gasoline / Gas, `drive` as FRONT WHEEL DRIVE /
    // Front Wheel Drive / Front-wheel Drive, and `doc_type` has 415 distinct
    // values. These columns hold the folded classification that a filter can
    // offer and a GROUP BY can count, while every raw column above is preserved
    // untouched — so a corrected mapping is a re-run over stored rows rather
    // than another 2,900-request sweep.
    //
    // NULL always means "could not be classified", never a default bucket. A
    // filter renders that as absent; inventing a value would quietly mislabel
    // inventory.
    /** automobile | motorcycle | truck | other — drives the category tabs, from
     * `vehicleType` (99.9% populated), never from the `car_info` taxonomy whose
     * own API filter matched just 9.3% of the catalogue. */
    vehicleClass: text("vehicle_class"),
    /** sedan | suv | pickup | coupe | hatchback | van | wagon | convertible |
     * truck | motorcycle — folds four spellings of "SUV" into one. */
    bodyType: text("body_type"),
    fuelClass: text("fuel_class"),
    /** fwd | rwd | awd | 4wd | 2wd. `4X2` becomes `2wd` rather than a guess at
     * which axle drives. */
    driveClass: text("drive_class"),
    /** clean | salvage | rebuildable | non_repairable | no_title | other.
     * Rebuildable is deliberately NOT merged into salvage: it changes what a
     * client may legally do with the car after import. */
    titleClass: text("title_class"),
    /** run_and_drive | starts | stationary, or NULL when genuinely unknown —
     * which includes every Copart "ENHANCED VEHICLES" lot, since that flag is
     * cosmetic and says nothing about whether the car runs. */
    conditionClass: text("condition_class"),
    /** Seller permitted cosmetic cleaning or parts removal. Real information,
     * but NOT a condition guarantee and not even a promise the work happened —
     * so it lives apart from `conditionClass`. */
    isEnhanced: boolean("is_enhanced").notNull().default(false),
    /** Displacement in cc — integer for the same reason money is in cents: a
     * range filter comparing floats drops boundary matches. 2.0L = 2000. */
    engineCc: integer("engine_cc"),
    /** Parsed from `"4"` (Copart) or `"4 Cyl"` (IAAI). The auctions' `0` means
     * "not recorded" and becomes null, never a selectable zero. */
    cylinderCount: integer("cylinder_count"),
    /**
     * The damage buckets, from 77 distinct `primaryDamage` and 75
     * `secondaryDamage` values measured over 134,647 rows. Both raw fields share
     * one vocabulary, so both classify through the same function.
     *
     * `FRONT END` (26,246) and `Front End` (18,092) are one concept, as are
     * `NORMAL WEAR` and `Normal Wear & Tear` — unfolded, the filter panel offers
     * every option twice. Corners fold into their side (`Right Front` → `front`),
     * and the handful of values that describe why the car is at auction rather
     * than what is broken (`Charity`, `Cash For Clunkers`) become `other`.
     */
    primaryDamageClass: text("primary_damage_class"),
    secondaryDamageClass: text("secondary_damage_class"),
    /**
     * Paint colour, from 58 raw values. `WHITE` (15,413) and `White` (15,303)
     * were one filter option pretending to be two. Also folds `Grey` into
     * `Gray`, the truncated `SILVE` into silver, and every shade of blue into
     * blue. NULL for the 212 lots whose colour field says `BURN` — that is a
     * burned car, not a paint colour, and the damage columns already say so.
     */
    colorClass: text("color_class"),
    /** automatic | manual. `Automatic` (66,425) and `AUTOMATIC` (59,178) split
     * 125,000 lots across two identical options. CVT counts as automatic (no
     * clutch pedal); `BOTH AUTOMATED MANUAL` counts as neither. */
    transmissionClass: text("transmission_class"),

    /**
     * Everything a person might type, as one searchable document.
     *
     * MEASURED BEFORE BUILDING THIS: the old free-text box matched only an exact
     * VIN, an exact lot number, or a single make/model substring. So `ford`
     * returned 14,660 lots while **`ford f150` returned zero**, as did
     * `toyota camry`, `bmw x5` and `honda civic 2018`. Every natural multi-word
     * query — which is how people actually search — found nothing at all.
     *
     * GENERATED ALWAYS, not maintained by the sweep. The mapper cannot forget to
     * set it, a renormalise cannot leave it stale, and rows written by any future
     * tool are indexed on arrival. That costs the expression being immutable,
     * which is why the text-search config is named explicitly: bare
     * `to_tsvector(x)` depends on a session setting and Postgres rejects it here.
     *
     * `simple` rather than `english`: stemming helps prose and hurts model names
     * — an English stemmer would happily conflate distinct trims.
     *
     * THE PUNCTUATION COPY IS THE POINT OF THE LAST TWO LINES. `F-150` tokenises
     * as {f-150, f, 150} and `f150` as {f150}, so neither query finds the other —
     * and both spellings are real in this catalogue (1,323 lots vs 1,090).
     * Appending a punctuation-stripped copy of model and series puts `f150` in
     * the document too, so either spelling matches either listing.
     */
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('simple',
        coalesce("make", '') || ' ' ||
        coalesce("model", '') || ' ' ||
        coalesce("series", '') || ' ' ||
        coalesce("year"::text, '') || ' ' ||
        coalesce("body_style", '') || ' ' ||
        coalesce("color", '') || ' ' ||
        coalesce("vin", '') || ' ' ||
        coalesce("lot_number", '') || ' ' ||
        regexp_replace(coalesce("model", ''), '[^a-zA-Z0-9]', '', 'g') || ' ' ||
        regexp_replace(coalesce("series", ''), '[^a-zA-Z0-9]', '', 'g')
      )`
    ),

    // ── our own bookkeeping ─────────────────────────────────────────────────
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Stamped by every sweep that saw this lot. Stale = gone from the active
     * set; see the note on disappearance above. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Makes a sweep's write idempotent: re-ingesting the same lot updates one
    // row instead of accumulating duplicates.
    uniqueIndex("auction_lots_platform_lot_idx").on(t.platform, t.lotNumber),
    index("auction_lots_vin_idx").on(t.vin),
    // The common browse: a make, optionally a model, newest sale first.
    index("auction_lots_make_model_idx").on(t.make, t.model, t.year),
    index("auction_lots_sale_date_idx").on(t.saleDate),
    // Finding what a sweep did NOT stamp.
    index("auction_lots_last_seen_idx").on(t.lastSeenAt),
    // The category tabs plus the two filters most likely to narrow a query hard.
    index("auction_lots_class_idx").on(t.vehicleClass, t.bodyType),
    index("auction_lots_title_idx").on(t.titleClass),
    // Primary damage only: it is the one the filter panel exposes and the one
    // with real selectivity (26,246 lots on its largest bucket). Secondary is a
    // refinement applied after primary has already narrowed the set, so it does
    // not earn its own index.
    index("auction_lots_damage_idx").on(t.primaryDamageClass),
    // GIN is the right structure for a tsvector: one entry per lexeme pointing at
    // every row containing it, which is what makes "2015 ford f150" an index
    // intersection rather than a scan of 134,647 rows.
    index("auction_lots_search_tsv_idx").using("gin", t.searchTsv),
    // NOTE: there are deliberately NO gin_trgm_ops indexes here, though migration
    // 0013 created a pair and 0014 drops them again. They only serve pg_trgm's
    // `<%` operator, and `<%` is pinned to the 0.6 session default — measured too
    // high to catch `porshe` (0.571). The misspelling fallback therefore calls
    // `word_similarity()` at an explicit 0.5, which no trigram index can serve.
    // Keeping them would have cost write time on every sweep to support a query
    // nothing issues. pg_trgm itself stays: it provides `word_similarity`.
    // "Buy Now only" is a headline toggle, and ~49,400 of ~147,000 lots qualify.
    // Partial index: the rows without a price are exactly the ones it must never
    // scan, and excluding them keeps it a fraction of the size.
    index("auction_lots_buy_now_idx")
      .on(t.buyNowCents)
      .where(sql`${t.buyNowCents} is not null`),
    // Full-text search (tsvector + GIN) comes with the query layer, once local
    // profiling shows which columns are populated enough to be worth indexing.
  ]
);

/**
 * One row per ingest run — the log that makes `auctionLots.lastSeenAt`
 * interpretable.
 *
 * WHY THIS IS NOT OPTIONAL: the catalogue is a continuous feed, not a snapshot.
 * Copart and IAAI add lots every day (~6,500/day measured), and the vendor
 * offers no "updated since" filter, so freshness comes from repeated sweeps.
 * A stale `lastSeenAt` is how we know a lot has left the active set — but "stale"
 * only means anything relative to when a sweep actually ran and whether it
 * finished. Without this table, `lastSeenAt` is an undated fact.
 *
 * A lot is still live when `lastSeenAt >= startedAt` of the most recent
 * **complete** full sweep.
 *
 * ⚠️ THE `isPartial` FLAG IS A CORRECTNESS GUARD, NOT BOOKKEEPING. A partial
 * sweep — a development run over 300 of 2,850 pages, or one that hit a request
 * budget or crashed halfway — has NOT seen most of the catalogue. Using it as
 * the reference point would mark ~90% of live lots as ended and empty the
 * search results. Only a run with `isPartial = false` AND a non-null
 * `finishedAt` may ever be used to conclude a lot has disappeared.
 *
 * `skipped` earns its place too: mapping rejects lots it cannot understand
 * (unsupported auctions, missing identity) rather than throwing, and a silent
 * rise in that number is how a vendor schema change would first show up.
 */
export const auctionIngestRuns = pgTable(
  "auction_ingest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * `full_sweep` walks everything and is the only kind that can date
     * disappearance. `incremental` uses `created_at_from` to pick up new
     * arrivals cheaply and deliberately sees only a slice. `backfill` is
     * historical import, which says nothing about what is live now.
     */
    kind: text("kind", { enum: ["full_sweep", "incremental", "backfill"] }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null while running, or forever if the run died. Either way: unusable as
     * a reference point. */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** See the warning above. Defaults to true so a run must *earn* the right to
     * be treated as complete — a crash between the first page and the final
     * update leaves the safe value in place. */
    isPartial: boolean("is_partial").notNull().default(true),
    /** The `created_at_from` value an incremental run used, so the next one can
     * resume from it instead of guessing an overlap window. */
    watermark: timestamp("watermark", { withTimezone: true }),
    pagesFetched: integer("pages_fetched").notNull().default(0),
    lotsSeen: integer("lots_seen").notNull().default(0),
    lotsWritten: integer("lots_written").notNull().default(0),
    /** Rows the mapper refused. A jump here means the vendor changed shape. */
    lotsSkipped: integer("lots_skipped").notNull().default(0),
    /** Populated when the run failed or stopped early, so a silent no-op sweep
     * is distinguishable from a healthy one that found nothing. */
    note: text("note"),
  },
  (t) => [
    // "the most recent complete full sweep" is the query this exists to serve.
    index("auction_ingest_runs_kind_started_idx").on(t.kind, t.startedAt),
  ]
);

/**
 * Lot photography, one row per image.
 *
 * The vendor passes through URLs on the auction's own CDN rather than
 * re-hosting (`vis.iaai.com/resizer?imageKeys=…`), which means every photo on
 * our site would break the day Copart or IAAI add a referer check. `imageKey`
 * is extracted so images can be served through our own proxy route at whatever
 * size we ask for; `sourceUrl` is kept because Copart's URL shape differs and
 * the key is not always recoverable.
 */
export const auctionLotImages = pgTable(
  "auction_lot_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => auctionLots.id, { onDelete: "cascade" }),
    /** Damage shots arrive in their own array and are worth distinguishing:
     * a card should lead with the general photo, not a close-up of a dent. */
    kind: text("kind", { enum: ["photo", "damage"] }).notNull(),
    position: integer("position").notNull(),
    sourceUrl: text("source_url").notNull(),
    /** The `imageKeys` value, when the URL exposes one. Null = proxy the URL. */
    imageKey: text("image_key"),
  },
  (t) => [uniqueIndex("auction_lot_images_lot_kind_pos_idx").on(t.lotId, t.kind, t.position)]
);

/**
 * Append-only record of what lots actually sold for.
 *
 * THE ONE ASSET THAT CANNOT BE BOUGHT BACK LATER, which is why it exists before
 * there is anything to put in it: `sales_history` came back as an empty array on
 * every lot sampled, so ingest writes opportunistically and this table may stay
 * empty for a while. Starting late means permanently missing that window.
 *
 * Deliberately NOT foreign-keyed to `auctionLots`. A sale outlives the listing,
 * and cascading a sold lot's removal would delete the very history we are trying
 * to accumulate. Identity is the VIN plus the platform's lot number.
 *
 * Fixes the comparables problem too: the previous source matched only on
 * make/model, so a 2010 base model and a 2020 top trim received the identical
 * twelve sales spanning a decade — mixing a burnt shell at $150 with a clean
 * car at $17,000, and an average over that is a confident number that means
 * nothing. Owning the rows means filtering by year and trim before quoting.
 */
export const auctionSalesHistory = pgTable(
  "auction_sales_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * The vendor's own id for this history entry, and the dedupe key.
     *
     * Keying on (platform, lotNumber, soldAt) instead looked reasonable and was
     * wrong: Postgres treats NULLs as distinct in a unique index, so every entry
     * with no sale date — and plenty have none — would insert a fresh duplicate
     * on every sweep, growing without bound. An entry arriving without an id is
     * skipped rather than risk that.
     */
    vendorEntryId: bigint("vendor_entry_id", { mode: "number" }).notNull(),
    platform: text("platform", { enum: ["copart", "iaai"] }).notNull(),
    lotNumber: text("lot_number").notNull(),
    vin: text("vin"),
    year: integer("year"),
    make: text("make"),
    model: text("model"),
    /** Null means "no sale recorded", NEVER zero — roughly a third of the old
     * source's entries were a literal 0 meaning exactly that, and averaging
     * them in dragged every estimate down. */
    soldPriceCents: integer("sold_price_cents"),
    currencyCode: text("currency_code"),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    /** The auction's own words for the outcome, e.g. sold vs on-approval. */
    saleStatus: text("sale_status"),
    /** Small volume and irregularly shaped, so unlike `auctionLots` the source
     * entry is worth keeping whole — it is the record of what we were told. */
    raw: jsonb("raw"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The same entry re-observed on a later sweep must not create a second row.
    uniqueIndex("auction_sales_vendor_entry_idx").on(t.vendorEntryId),
    // Non-unique: one lot legitimately has several past appearances.
    index("auction_sales_platform_lot_idx").on(t.platform, t.lotNumber),
    index("auction_sales_vin_idx").on(t.vin),
    // The comparables query — same model, near year, and only sales that
    // actually happened.
    index("auction_sales_make_model_year_idx").on(t.make, t.model, t.year),
  ]
);
