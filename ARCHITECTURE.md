# SmartAutoBid — Architecture

This document is the contract for where code lives. Read it before adding a
file. If you are about to put something somewhere this document doesn't cover,
that's a signal the document needs updating — not that you should improvise.

Its purpose is narrow and specific: **a new feature should land as a new module,
not as more lines in an existing file.** Everything below serves that.

---

## 1. The layer rule

Three layers, and dependencies only ever point downward:

```
app/       routing, and nothing else
   ↓
modules/   business capabilities — one folder per thing the business does
   ↓
shared/    generic building blocks with no business knowledge
```

| Layer | May import from | Must never import from |
|---|---|---|
| `app/` | any module, `shared/` | — |
| `modules/` | `shared/`, its own internals, another module's **public entry only** | `app/` |
| `shared/` | `shared/` | `modules/`, `app/` |
| `scripts/` | runtime-agnostic module files only | anything importing `next/*` |

Two rules carry most of the weight:

**`shared/` never knows about the business.** A `Button` doesn't know what a lot
is. If a component in `shared/ui/` needs a vehicle type, it belongs in a module.

**`scripts/` cannot import Next.** The Telegram bot runs under plain `tsx` in
GitHub Actions, outside the Next runtime. Any file it shares with the website
must be free of `next/*` imports — that is why types live in a separate
`types.ts` from the fetch client that caches with `next: { revalidate }`.

---

## 2. Directory map

```
src/
  app/                          ROUTING ONLY
    [locale]/                     pages compose modules; they don't hold logic
    api/                          thin handlers that delegate into a module
    sitemap.ts robots.ts          site-wide route metadata

  modules/                      BUSINESS CAPABILITIES
    pricing/                      what a vehicle costs to buy and land
      model/                        pure math + rate tables (no React)
      components/                   the calculators that render it
    inventory/                    auction lots: search, detail, comparables
      api/                          Apibara adapter + runtime-agnostic types
      components/                   lot cards, galleries, spec tables
    leads/                        turning a visitor into a conversation
    telegram/                     the channel bot's shared transport
    consent/                      cookie consent + analytics gating

  shared/                       GENERIC BUILDING BLOCKS
    ui/                           Button, Container, Reveal, SectionHeading…
    layout/                       Header, Footer, LanguageSwitcher
    config/site.ts                THE source for phone, email, domain, socials
    gate/                         pre-launch holding page (temporary — see §7)
    i18n/                         locale routing and navigation

messages/                       one JSON per locale — keys must stay in parity
scripts/telegram-bot/           standalone runner (own process, own entrypoint)
```

---

## 3. Where does a new file go?

Answer the first question that fits:

| If it… | It goes in |
|---|---|
| is a page or an API route | `app/` — and it should be thin |
| encodes a fact about the business (a fee, a port, a tax rule) | `modules/<capability>/model/` |
| talks to an outside service | `modules/<capability>/api/` |
| renders something only one capability cares about | `modules/<capability>/components/` |
| is a phone number, email, domain, or social handle | `shared/config/site.ts` — **never inline** |
| would look identical on a site in a different industry | `shared/ui/` |
| is site chrome present on every page | `shared/layout/` |
| is user-visible text | `messages/*.json`, in **all three** locales |

If a file is needed by two modules, it belongs in `shared/` — or one of the two
modules is really part of the other.

---

## 4. What each module owns

**`pricing/`** — the landed-cost model. Auction fees, brokerage, trucking, ocean
freight, duty and VAT per destination. This is the most consequential code in
the repo: it quotes real money, and it is consumed by the website calculator,
the per-lot calculator, *and* the Telegram bot's published captions. Changes
here move numbers customers have already been given.

> `estimateVehicleCost()` and `estimateLandedCost()` are deliberately separate.
> The first feeds Telegram captions that are already public; the second itemises
> extra fees for the vehicle page. Do not merge them to "reduce duplication" —
> the separation is the point.

**`inventory/`** — everything sourced from Apibara: search, lot detail,
comparable sales, media. Owns the knowledge that this is an unofficial
third-party aggregator whose payloads lie in specific documented ways (batch
stamped auction fields, make/model-level comparables). That knowledge lives in
comments next to the code that compensates for it.

**`leads/`** — the contact form, its reCAPTCHA verification, and the email send.
Every "get in touch" path terminates here.

**`telegram/`** — the Bot API transport and the language-switch keyboard, shared
between the posting script and the webhook so button formats can't drift.

**`consent/`** — the cookie banner and the analytics loading it gates. Analytics
must never load before an explicit Accept.

---

## 5. Invariants

These are not style preferences. Breaking one causes a real defect.

1. **`shared/config/site.ts` is the only place contact details exist.** They
   previously lived in seven files.
2. **Locale key parity is absolute.** `en`, `ru`, `lt` must have identical key
   sets. Adding a string to one means adding it to all three.
3. **Port names are lookup keys, not labels.** `"Klaipėda, Lithuania"` indexes
   the customs and multiplier tables. Translate the *display*, never the key.
4. **Never invent a number.** Placeholder pricing is marked `PLACEHOLDER` in
   comments and shown to users as an estimate. No fabricated stats, no
   testimonials, no track record — the company is new and the copy says so.
5. **Missing source data renders as absent, not as zero.** A `0` odometer means
   "not reported"; a `$0` bid means "bidding hasn't opened". Printing either as
   a real value states something the source never claimed.
6. **Vehicle pages stay `noindex`.** Aggregator terms, plus crawlers burn API
   quota. **Indexing lives in two files** — a page's `robots` metadata and
   `app/sitemap.ts` — and they must always agree. See §6c.
7. **Comments explain why, not what.** The non-obvious constraint — the API
   gotcha, the business reason — is the part worth writing down.

---

## 6. Phase 2 — in progress

Phase 2 is the client login and bid-management system.

**Built:** Neon Postgres (Frankfurt) via the Vercel integration, Drizzle ORM,
`shared/db/`, `modules/auth/` (register, login, email verification, password
reset, DB sessions, rate limiting), `modules/plans/` (catalogue, `can()`,
deposits, the confirmation dialog), `/plans`, and the admin deposit queue at
`app/[locale]/admin`.

`modules/account/` (the signed-in dashboard) is built — see §6a.

**Next:** `modules/bidding/` (2.3), then order history (2.4).

Decisions now settled — do not relitigate casually:

- **SmartAutoBid places bids on clients' behalf.** Clients do NOT bid with
  their own Copart/IAAI credentials, which eliminates the third-party
  credential-storage problem for everyone. The lone exception: the top plan is
  *eligible* for live self-bidding, granted per-user by an admin after a
  mandatory contact step (`users.selfBiddingGrantedAt`). Its security design
  is deliberately deferred until that feature is actually built.
- **`modules/plans/model/plans.ts` is the only place plan limits exist**, and
  `can()` in the same folder is the only authorization decision point. No
  other code may hard-code a plan name or limit; every gate — UI, API route,
  admin console — calls `can()`, and API routes must call it server-side
  regardless of what the UI already checked. Its tests are exhaustive because
  they test the real security boundary. Every plan *number* is now
  owner-confirmed — the file header says so, and `/plans` was un-noindexed on
  that basis (§6c). If figures ever go back to being provisional, the page's
  indexing has to go with them.
- **Sessions are database rows, not JWTs** — withdrawing a deposit must kill
  access instantly, and a signed token can't be recalled. Cookies hold a
  random token; the DB stores only its SHA-256 (same for email-verification
  and reset tokens).
- **Money is integer cents.** Everywhere. €500 is `50000`.
- **No card payments in Phase 2.** Deposits arrive by bank transfer and an
  admin confirms them (`deposits.status`, `reviewedBy`) — matching how the
  business actually runs, and keeping PCI scope and chargebacks out entirely.
- **The schema is one file** (`shared/db/schema.ts`) — a deliberate exception
  to "shared/ knows no business", because foreign keys cross module lines.
  Modules own behavior; the schema file owns shape. Migrations are generated
  SQL committed under `drizzle/` (`npm run db:generate` / `db:migrate`).
- **The pre-launch gate is not auth** (§7) and `modules/auth` must not build
  on it.

---

## 6a. The client account area

The signed-in client dashboard. Shape agreed 2026-08-05 after reviewing how
bidplius.lt and vinas.lt present theirs; **built 2026-08-05** in
`modules/account/` under the `(app)` route group.

### Layout: sidebar, not tabs

vinas.lt uses horizontal tabs, bidplius a left sidebar. **Sidebar**, because
tabs stop working past ~5 entries and the eventual list is longer, and because
every section then has its own URL — so an email can link a client straight to
their plan. Collapses to a horizontal scroller on mobile.

```
/account            overview — plan status and the one next step   BUILT
/account/bids       PLACEHOLDER until 2.3 — see note below
/account/favorites  saved lots, refreshable on demand (§6d)        BUILT
/account/plan       current plan, or pending request + cancel      BUILT
/account/details    name, phone, language, change password         BUILT
/account/orders     Phase 2.4
```

`/account/bids` shipped ahead of its feature at the owner's explicit request
(2026-08-06), bending the no-empty-sections rule. Kept honest: its empty
states describe the real flow today — register, take a plan, then send us the
car (lot link or VIN) by email or WhatsApp — rather than pretending a quiet
feature exists. When 2.3 lands, its two sections become the real lists.

(The slot reserved as `/account/watchlist` shipped as `/account/favorites` —
the owner's word, and the one clients use.)

**Build a section only when it has real data behind it.** An empty "Carfax
reports" tab promises a product that doesn't exist. The sidebar's contents are
`modules/account/model/sections.ts` — one list, so the nav and the pages can't
drift; the three unbuilt routes are named in its comment and absent from the
array. The overview carries no "recent activity" panel for the same reason:
there is no activity until 2.3, and an empty panel saying "nothing yet" only
advertises the gap.

**The gate lives in the pages, and the layout deliberately stays out of it.**
`(app)/layout.tsx` declares `force-dynamic` for the whole group, so nothing
signed-in can ever be statically cached — including pages added later.
`account/layout.tsx` reads the session only because the shell needs a name;
when there is none it renders `children` bare and **does not redirect**.

Two reasons, and both matter:

1. A layout is not a security boundary — it is shared, and can be skipped on
   client-side navigation between siblings. Same rule as §7: middleware and
   layouts are chrome, the page's own `requireUser` is the check.
2. A layout runs *before* its page, so a redirect there always wins the race
   — and the layout has no idea which child is rendering, so it could only
   send people to a generic `/login`. Standing aside is what lets an emailed
   link to `/account/plan` survive the sign-in. This was found by testing:
   the return path was silently swallowed until the layout stopped redirecting.

`currentUser` is wrapped in React `cache`, so the layout's call and the page's
cost one query.

**Post-login return paths go through `safeReturnPath`, always.** Each page
passes its own path to `requireUser` (a page knows where it is; Next gives a
server component no reliable pathname without adding one in `proxy.ts`, which
owns the pre-launch gate and isn't worth touching for this). That becomes
`/login?next=…`, and **the login page validates it on the server before it
reaches the browser** — an unchecked value there is a textbook open redirect,
where an attacker links to our real domain, the victim signs in for real, and
lands on a convincing copy that asks for the password again. The rule is a
whitelist by shape: a path on this site, nothing else. `safeReturnPath.test.ts`
is the specification — every case in it is a real bypass technique.

Two entries on bidplius's sidebar are deliberately NOT ours: **Messages with
the team** (the real channel is WhatsApp/Telegram — a second inbox somebody
must remember to check is worse than none) and **Carfax reports** (a paid
integration, not a dashboard page). One IS worth copying: **cancel a pending
plan request**, which keeps the admin queue free of abandoned ones.

### The header problem — solved with a client-side slot

`Header.tsx` is **static on purpose**: it never reads the session, which is
what lets the marketing pages pre-render. Showing "Nojus" instead of "Log in"
means knowing who is asking, and that would make the homepage, About and Terms
render per-request — losing static generation on exactly the pages SEO depends
on.

Built: **`modules/auth/components/HeaderAccount.tsx`**, a client component that
calls `/api/auth/me` after hydration and swaps the button. It renders *nothing*
in that slot until the answer arrives — showing "Log in" to someone who is
signed in is what looks broken, not a ~100ms gap. `/api/auth/me` returns the
display name and nothing else, under `Cache-Control: private, no-store`.

It reaches the header as a **prop, not an import**: `Header` lives in
`shared/`, which may not depend on `modules/` (§2), so `[locale]/layout.tsx` —
which sits above both — passes `account` and `accountMobile` slots in. Two
slots rather than one because the desktop row and the burger menu style the
button differently, and the desktop row's padding is load-bearing against the
overflow noted in that file. Both instances share one request via a
module-scoped promise; login and logout each do a full navigation, which is
what drops it.

Rejected: server-rendering the header everywhere (costs static generation on
every marketing page), and splitting headers per route group (correct, but two
components to keep in sync for one button).

### ⚠️ Do not collect national ID or IBAN yet

bidplius's "My details" form collects **asmens kodas** (national identity
number) and **IBAN**. Both are sensitive personal data under GDPR and change
our obligations materially: lawful basis, retention limits, encryption at
rest, breach notification. **Collect neither until invoices are actually
issued**, and treat that as a security design task, not a form field. Name,
address, phone and VAT number are ordinary business data and fine.

Likewise vinas.lt's phone-verified ✓/✗ marker: phone verification means SMS,
a paid provider and a per-signup cost. Show the number, don't verify it, until
there is a reason.

### Editing details: what the forms do and don't touch

`/account/details` edits name, phone and notification language, and changes
the password. Three deliberate absences:

- **Email is not editable.** Changing it needs proof of the new address;
  without that it either locks someone out of their own password reset or
  hands the account to whoever typed it. That is a verification flow, not a
  form field.
- **Language is labelled as the language we write to you in**, because that is
  all `users.locale` does. Site language follows the URL and the header
  switcher; claiming otherwise on this form would be a lie.
- **The password change revokes every session and issues a fresh one** for the
  browser that made the change (`changePassword` returns the token, the route
  sets the cookie). Same reasoning as `resetPassword` — if the old password
  leaked, whoever has it is probably signed in somewhere — but the person
  doing the right thing isn't logged out for it. It has **its own rate limit**
  (`passwordChangePerUser`): verifying the current password makes the endpoint
  an oracle for guessing it, and sharing `loginPerEmail`'s budget would let
  failed attempts lock the owner out of logging in.

**Signed-in devices** lists the live sessions with a best-effort "Chrome on
Windows" label, and offers `destroyOtherSessionsForUser` — every session
*except* the caller's. That is a different lever from
`destroyAllSessionsForUser`, which stays for the case where the credentials
themselves are suspect: someone saying "I don't recognise that device" should
not be logged out of the browser they're fixing it from. Two honesty
constraints here: `describeUserAgent` is **presentation only** (user agents
are self-reported and every browser impersonates several others — never
decide anything on it), and the list says *"Signed in <date>"* rather than
"last active", because `expiresAt` only slides forward past half-life and
deriving activity from it would be wrong by up to fifteen days.

**Plan history** (`decidedDepositsFor`) shows confirmed, cancelled and
refunded rows, excluding `pending` — the open request has its own card above
it, and listing it twice reads as two requests.

Cancelling a plan request scopes ownership **in the SQL WHERE clause**, not in
a check before it — `cancelPlanRequest(depositId, userId)` — so there is no
window between checking who owns a row and updating it, and it is guarded on
`status = 'pending'` so a cancel racing an admin's confirmation loses cleanly.
`"cancelled"` needed no migration: `deposits.status` is a `text` column and
that enum is a TypeScript constraint only.

### Notification emails — the gap is closed

A plan request used to write a pending row and appear in the admin queue while
**no email went to anyone**, with the client promised contact "within 1
business day" and nothing starting the admin's clock.
`modules/plans/api/sendPlanRequestEmails.ts` sends two: one to
`info@smartautobid.com` with the client's details, whether they accepted terms
and a link to the queue (always English — staff, not customers); one to the
client in their own language with their copy of what they agreed to.

Three properties to preserve, because **bid requests in 2.3 need the same path
and are far more time-critical** — an auction closes whether or not anyone
checked the console:

- **Never fatal.** The deposit row is already committed; a mail outage must
  not turn a successful request into an error the client retries.
- **Awaited, not fired and forgotten.** Serverless may freeze the function the
  moment the response is sent, so a dangling promise is a notification that
  silently never happens.
- **Only on `status === "requested"`.** A double-submitted dialog returns
  `already_pending` and must not mail the admin twice about one request.

---

## 6b. The admin console, and erasing an account

**`modules/admin/` owns staff screens**, not `modules/plans/` — the console is
going to grow views that have nothing to do with the plan catalogue, so
`DepositQueue` moved here alongside the clients list.

- **`currentAdmin()` is the only admin check.** The `can()` block it wraps was
  previously copy-pasted between the page and the API route; the console will
  grow more of both, and one that forgets the `emailVerified` half would be an
  admin surface guarded differently from the rest with nothing to flag it. It
  returns null rather than throwing so pages can `notFound()` and routes can
  return a 404 body. **404 everywhere, never 403** — a redirect to login tells
  a curious client that /admin is worth returning to with better credentials.
- **The page is a list of `AdminSection`s.** Adding a view should mean adding
  a section, not rewriting the page; that component is also the seam where
  tabs or a sidebar go once the list outgrows one scroll. The Users section
  (2026-08-06) was the first test of that claim and cost one model file, one
  component and three lines in the page — no restructuring.
- **Users is the one place a user is erased.** It absorbed the earlier
  find-by-email panel, and the now-callerless `lookup` action was removed
  from `/api/admin/users`. Two ways to delete a person is how the two drift
  apart, and erasing a row you can see beats erasing whatever a lookup box
  matched. Its list is **bounded** (`USERS_PAGE_SIZE`, currently 50) with the
  shortfall stated on screen — search narrows; offset paging is the next step
  when it's genuinely needed. Erased accounts are excluded and reported as a
  footnote count: nothing of them remains to act on.
- **No role editing anywhere in the console, deliberately.** Admin is granted
  by `scripts/makeAdmin.mjs` only, so a stolen admin session cannot mint more
  admins. If a "make admin" button ever appears, that property is gone.
- Search escapes `%` and `_` before the `ilike`. Unescaped, a search for
  `a_b` silently matches `axb` and a lone `%` returns every user — a
  correctness bug well before it is a security one; both are covered by the
  runtime checks in the commit that added it.
- **Tier names come from `Plans.tiers` only.** The parallel `Admin.tiers` copy
  is gone — the page resolves names once server-side and passes them down.
- Confirming and refunding now **email the client** (§6a's notification path,
  other half). Refund had no button anywhere before this: the queue listed
  only *pending* rows, so a confirmed client vanished from every screen.

### Erasure is anonymisation, not deletion

`deleteAccount()` implements GDPR Art. 17 by **scrubbing the user row and
keeping the money**. `deposits.user_id` cascades, so a real `DELETE FROM
users` would destroy the record that a person paid us, how much and when.
Art. 17(3) permits retaining what a legal obligation needs, and accounting
records are the textbook case.

Erased: name, email, phone, password (set to a value no password can match),
`activePlanKey`, every session, every action token, and **any pending deposit
is cancelled**. Kept: deposit rows and the audit log, neither naming anyone.

- **The email is rewritten, not nulled** — the column is NOT NULL and unique,
  and making the replacement unique per user frees the person's real address
  so they can register again. An erasure that permanently banned someone would
  be a strange reading of a privacy right.
- **`deletedAt` is checked in `loginAccount` and `getSessionUser` too.** Both
  are belt-and-braces — the hash can't match and the email no longer resolves
  — but authentication is not where "shouldn't happen" is good enough.
- **Cancelling pending deposits was found by testing**: without it an erased
  user's request sat in the admin queue as a row labelled "Deleted user", and
  confirming it would have activated a plan for nobody.
- Both entry points share one function; `audit_log.detail.selfService`
  records which. An admin may erase their own account — special-casing it
  would mean the one unerasable account is the one with the most access.

---

## 6d. Favourites — why the table is denormalised

`modules/favorites/` lets an approved client save a lot and come back to it.
The whole design turns on one number: **a favourites page costs zero calls to
Apibara, however many cars are on it.**

Storing only a VIN and re-fetching on view would mean N upstream requests per
page load, against a quota the Telegram bot shares and an API that throws
intermittent 502s — a page that gets slower and more fragile the more a client
uses it. So everything needed to draw the card is copied into the row at save
time: title, year/make/model, thumbnail, price, sale date.

**The snapshot is a record of a moment, and the UI says so** ("As saved on
…"). It never renders a live badge or a countdown, and that is not caution:
auction fields in Apibara *list* responses are batch-stamped and routinely
report long-sold lots as open (§ inventory/api/types.ts). A card claiming
status from saved data would be repeating a known lie. Only the lot page
knows, and it is one click away.

Rules worth keeping:

- **The server builds the snapshot from its own fetch, never from the request
  body.** A client that could supply the title and price could save
  "Ferrari — $1". Same rule as `deposits.amountCents`.
- **A null price means "no bids yet", never zero.** Copart lots routinely have
  no current bid before bidding opens; `snapshot.test.ts` pins this, and the
  €1,656 BMW in the Telegram history is why.
- **Ownership is scoped in the SQL WHERE clause**, not checked before it —
  same as `cancelPlanRequest`. Verified: signed in as a second account,
  deleting another user's favourite by id returns 404 and changes nothing.
- **`getVehicleDetail` throws on any non-2xx**, so callers must catch. Found
  by testing — saving an invented lot number returned a 500 until
  `fetchLotSnapshot` wrapped it. Anything reaching for that function directly
  needs the same care.
- **Losing a plan makes favourites read-only, not inaccessible.** Listing and
  removing need only a session; saving and refreshing need `can(…,
  save_favorite)`. Refresh sits on the plan side because it spends quota —
  reading a stored snapshot costs nothing, asking the auction site again does,
  and it carries its own rate limit for the same reason.
- The save button renders **outside** the card's `<Link>`: a button nested in
  an anchor is invalid HTML and would navigate as well as save.

---

## 6c. What search engines may list, and the /plans decision

**Two files, one decision, and they must agree.** A page's `robots` metadata
(`robots: { index: false }` in `generateMetadata`) controls whether a crawler
that reaches the page may list it. `app/sitemap.ts` controls whether crawlers
are told the page exists. Changing one without the other half-applies the
decision — a sitemapped page marked noindex asks crawlers to find it and then
ignore it. `app/robots.ts` is a third, coarser lever: it blocks *fetching*
(`/api/`, `/vehicle/`) rather than listing.

Indexed: home, `/search`, `/plans`, `/shipping`, `/about`, `/contact`,
`/privacy`, `/terms`. Noindex: every auth page, everything under `/account`,
`/admin`, and `/vehicle/[vin]`.

**`/plans` was un-noindexed 2026-08-06.** It had been hidden while every
figure was a placeholder, so no search engine could cache invented numbers.
Those figures are owner-confirmed now, and the page is one buyers search for
by name.

The three Coming Soon tiers are a reason **to** index it. The owner's stated
intent at launch is that all four plans show, Bronze is self-service, and the
paid tiers advertise the range while routing anyone who needs one into a
conversation — so the page is a lead-generation surface, not an apology. Two
copy changes went with the decision, and both matter more than they look:

- The footnote used to end *"Placeholder figures shown while pricing is
  finalised."* That sentence had quietly become false, and it was the one a
  search engine would have cached and shown to the first organic visitor.
  **When indexing a page, read what is actually on it first.**
- The Coming Soon hint promised to *tell you when it opens* — a mailing list.
  It now offers to arrange the tier by hand, which is the real offer.

**What did NOT change: `available: false` still refuses requests server-side.**
The paid tiers cannot be self-served; a human works out how to deliver them.
`requestPlan` must keep rejecting them and `deposits.test.ts` asserts it. The
contact route is the only way in, by design.

The Coming Soon link now carries `?plan=<key>`, and the contact page
**validates it against the catalogue** before use. It is never echoed as text
— an unvalidated value there would let a crafted link put words into a
visitor's message and send them to us over their own name.

---

## 7. The pre-launch gate — temporary by design

`shared/gate/preLaunchGate.ts` replaces the whole site with a "coming soon"
page unless the visitor has unlocked it. It exists because Vercel's own
Deployment Protection does **not** cover production domains on the Pro plan
without a $150/month add-on — verified empirically, not assumed: with Vercel
Authentication + Standard Protection enabled, the generated deployment URL
returned 302 while `smartautobid.vercel.app` still served the full homepage.

- **Switched by `SITE_GATE_PASSWORD`.** Unset = live. Launching is a dashboard
  change, not a code change — the same convention analytics and reCAPTCHA use.
- **`proxy.ts` runs it before locale routing**, and its matcher now includes
  `/api/` so the contact endpoint isn't left callable behind a hidden site.
  That is the only reason `api` is in the matcher; the `startsWith("/api/")`
  guard exists to stop next-intl rewriting those paths.
- **It is not authentication.** One shared password, no identity, no
  revocation. Phase 2's `modules/auth` must not be built on top of it.
- **Delete it at launch** once the site is public for good: this file plus its
  two call sites in `proxy.ts`, and restore `api` to the matcher exclusion.

## 7a. Maintenance mode — the operator's switch

A button in the admin console closes the site behind a branded 503 page and
reopens it, no deploy involved. Design decisions, in order of importance:

- **The flag is a `site_settings` row, not an env var.** An env var change
  means a redeploy — the exact wait you don't want when the site needs to go
  quiet now. The proxy reads the row through a ~10s in-memory cache, so the
  toggle is effectively instant without costing a query per request.
- **It fails OPEN.** If the settings row can't be read, the site stays up.
  The pre-launch gate (§7) makes the opposite choice; hiding an unlaunched
  site is its whole point. Different stakes, different defaults.
- **The closed sign is raw HTML built in `maintenanceGate.ts`, not a Next
  route.** Maintenance exists for exactly the moments the app is mid-change;
  a page rendered by the app could be broken by the very deploy it covers
  for. Raw response also allows a true 503 + `Retry-After: 300`, which App
  Router pages can't send — crawlers read that as temporary and never index
  the closed sign. Its three translations live in the file (a documented
  exception to invariant #2: importing three 600-key message files into the
  proxy for one sentence each would be absurd).
- **Both directions require the admin's password**, not just a session — a
  console tab left open must not be one click from an outage. Same oracle
  logic as password-change, so it carries its own rate limit.
- **Bypass = one token, hash in the settings row, cookie in the admin's
  browser.** Enabling mints a fresh token (revoking all previous ones);
  an ADMIN logging in mid-window gets a fresh one too, which rotates the
  hash — deliberately favouring the newest device, because this is a
  one-operator business and a bypass-token table would be machinery for a
  problem it doesn't have.
- **Exempt while closed:** `/api/auth/*` (so admins can sign in),
  `/api/admin/*` (so the off switch stays reachable), robots.txt and
  sitemap.xml (a 503 robots.txt halts crawling site-wide). Everything else —
  including client-facing APIs — gets the 503: a client mid-session must not
  keep writing into a database the owner is changing.

## 8. Verification

Before finishing any change, run everything:

```bash
npm run verify
```

That is typecheck → locale parity → unit tests → lint. Individually:

| Command | Checks |
|---|---|
| `npm run typecheck` | Types across `src/` and `scripts/` |
| `npm run check:locales` | en/ru/lt have identical key sets (invariant #2) |
| `npm test` | The cost model — arithmetic that gets published |
| `npm run lint` | ESLint |
| `npm run build` | What Vercel runs; catches client/server boundary errors |

**CI runs all of these plus the production build on every push and pull
request** (`.github/workflows/checks.yml`), so a break is caught at push time
rather than at the next deploy. The build step uses placeholder secrets — no
page fetches Apibara at build time, so real keys are not needed and must never
be added to a workflow that runs on every branch.

Note that a second editing session may be working in this tree concurrently.
Stage explicit paths — never `git add -A` — and re-run `npm run verify` before
committing, since the other session can break the build underneath you.
