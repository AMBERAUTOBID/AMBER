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

## 6. Phase 2 — planned, not built

Phase 2 is a client login with real Copart/IAAI bidding. The current structure
leaves specific room for it; these are the intended slots, deliberately empty
today:

- `app/[locale]/(marketing)/` and `app/[locale]/(app)/` — route groups splitting
  public pages from the authenticated area, which needs its own layout. Today's
  `[locale]/layout.tsx` is the marketing layout; it moves into `(marketing)/`
  when the app area lands.
- `modules/auth/` — sessions and identity.
- `modules/bidding/` — placing and tracking bids.
- `modules/account/` — order and bid history.
- A persistence layer. The site has none today: every dynamic value is fetched
  live and cached. Phase 2 is where a database first becomes necessary.

**Open decision that must not be made casually:** the plan has clients bidding
with *their own* auction credentials. Storing third-party credentials is a
materially different security posture from anything the site does today. Decide
the approach deliberately — delegated/token-based access is strongly preferable
to holding customer passwords in any form.

---

## 7. Verification

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
