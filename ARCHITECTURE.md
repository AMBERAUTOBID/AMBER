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
   quota.
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
  they test the real security boundary. All plan *numbers* are PLACEHOLDERS
  (invariant #4) until the owner supplies real ones.
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
/account/plan       current plan, or pending request + cancel      BUILT
/account/details    name, phone, language, change password         BUILT
/account/bids       Phase 2.3
/account/watchlist  Phase 2.4
/account/orders     Phase 2.4
```

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
