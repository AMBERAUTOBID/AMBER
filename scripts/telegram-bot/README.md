# Telegram inventory bot

Runs on a schedule via `.github/workflows/telegram-bot.yml` (GitHub Actions,
not Vercel - see that file's comment for why). Searches Apibara for each
profile in `filters.ts`, and posts any new matching lot to the Telegram
channel: a photo album, followed by a details message (VIN, mileage,
damage, condition, auction time in Vilnius, comparable recent sales, and a
cost estimate to the destination port reusing `src/lib/costEstimate.ts`)
with 🇬🇧 EN / 🇷🇺 RU / 🇱🇹 LT buttons that
swap the message's language in place when tapped, plus a link button to
that lot's own page on the website (`/vehicle/<vin>`) in the currently
selected language.

## The two sections

Every saved search runs once per section, and the two never overlap:

| Section  | What lands there                    | Apibara `lot_status` |
| -------- | ----------------------------------- | -------------------- |
| `live`   | Lots with **no** Buy Now price      | `Timed`              |
| `buynow` | Lots **with** a Buy Now price       | `Buy Now`            |

That split is a real server-side filter, confirmed against the live API
(`Buy Now` came back 20/20 carrying a `buy_now_usd`, `Timed` 0/20), and
`run.ts` re-checks each lot's price client-side before posting anyway.

Cost estimates follow the section: a Buy Now lot is costed off its Buy Now
price even when it also shows a current bid, since that's the number the
reader would actually pay.

## What a post claims, and what it doesn't

Costs are split into two blocks on purpose:

- **Our own numbers** (lot price, auction fees, local transport, ocean
  freight, brokerage) are added up into a subtotal in USD and EUR.
- **Duty and VAT are published as rates, not amounts.** They're the
  destination country's, they depend on how the lot is finally valued at
  clearing, and a channel post is the wrong place to imply a firm figure.
  Rates come from `PORT_CUSTOMS` in `src/lib/costEstimate.ts`, so the EU's
  US-built-car duty waiver stays accurate if that table changes.

**Comparable sales** (`marketStats.ts`) are quoted as a range plus sample
size and year span, never as a bare average, and are omitted entirely when
fewer than 3 genuinely comparable sales exist. Apibara's `/related` matches
at make/model level only - the same twelve Civic sales come back for a 2010
VP and a 2020 Sport Touring alike, spanning 2010-2026 and mixing a burnt
shell at $150 with a clean 2024 at $17,000 - so the unfiltered average is
meaningless. Expect roughly a third of posts to carry no sales line, and
some models (BMW X5, in testing) to have no `past` data at all.

This costs one extra API call per *posted* lot. `/related` also returns an
occasional 502; that's caught and the post goes out without the line.

**Auction times** are converted to Europe/Vilnius from the ISO instant in
`auction.auction_at`. Apibara's own pre-formatted time string is ignored -
it read UTC+3 in testing, but nothing documents which zone it's in, and
inheriting an unknown timezone for a "be there at this time" field is how
somebody misses an auction. Change `AUCTION_TIME_ZONE` in `formatPost.ts`
to show a different one.

Set `sections: ["buynow"]` on a saved search to keep it out of one feed;
omit the field and it fills both.

## How the language switch works

Telegram media groups (`sendMediaGroup`) can't carry buttons at all, so each
post is actually two messages: the photo album, then a text message with
the details + buttons. When someone taps a button:

1. Telegram calls the website's webhook (`src/app/api/telegram/webhook`)
   with which VIN/language was requested.
2. The webhook looks up that VIN's pre-built EN/RU/LT captions in a small
   shared key-value store (Vercel KV, cached at post time - see below) and
   calls Telegram's `editMessageText` to swap in the requested language.

Captions are all built and cached **once, at post time** - a button tap
never triggers a fresh Apibara call, so channel engagement can't add
surprise API cost.

## Required secrets/env vars

**GitHub Actions secrets** (Settings -> Secrets and variables -> Actions -
these are for the posting side, `run.ts`):

- `APIBARA_API_KEY` - same key used by the website.
- `TELEGRAM_BOT_TOKEN` - from [@BotFather](https://t.me/BotFather).
- `TELEGRAM_CHANNEL_ID` - the chat the bot posts to (bot must be admin
  there). Public: `@channelusername`. Private: the numeric chat ID (forward
  a message from it to [@userinfobot](https://t.me/userinfobot) to get it).

Then pick one of the two layouts for the sections above:

**A. One forum supergroup, one topic per section** (how bidauto.online does
it - their "LIVE Auctions" / "Buy Now" tabs are forum topics). Turn on
Topics in the group's settings, create both topics, then set:

- `TELEGRAM_LIVE_THREAD_ID` / `TELEGRAM_BUYNOW_THREAD_ID` - open each topic
  in Telegram Web; the thread ID is the last number in the URL.

**B. Two separate channels.** Leave the thread IDs unset and instead set:

- `TELEGRAM_LIVE_CHAT_ID` / `TELEGRAM_BUYNOW_CHAT_ID` - same format as
  `TELEGRAM_CHANNEL_ID` above.

Set none of these and both sections post into `TELEGRAM_CHANNEL_ID` as one
undivided feed - fine for a first smoke test, but readers can't filter.
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` - same Vercel KV instance the
  website's webhook uses (see below) - the bot writes captions here, the
  webhook reads them.

**Vercel project env vars** (for the webhook route, which lives on the
website):

- `TELEGRAM_BOT_TOKEN` - same value as above (needed to call
  `editMessageText`/`answerCallbackQuery`).
- `TELEGRAM_WEBHOOK_SECRET` - any random string you generate; verifies
  webhook calls really came from Telegram.
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` - auto-set once you provision
  Vercel KV (Storage tab -> Create -> KV, powered by Upstash - the free
  tier's 256MB storage / 30K daily commands is far more than this needs).

## One-time webhook registration

Once the site is deployed and the Vercel env vars above are set, tell
Telegram where to send button-tap events (replace both placeholders):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://smartautobid.com/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Run this again any time the token, domain, or secret changes. To confirm it
took effect: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`.

## Editing what the bot looks for

Edit `filters.ts` - each entry in `SAVED_SEARCHES` is one saved search (make,
model, year range, price cap, damage types, title-type keyword, section, etc). See
the comments in that file for exactly which fields are confirmed-working
Apibara filters vs. best-effort client-side matching. Commit and push -
no other changes needed, the next scheduled run picks it up.

## Testing locally without posting anything

```bash
DRY_RUN=true npm run bot:local
```

`bot:local` reads `.env.local`, so a local run needs no exported variables -
useful for a first real post from your own machine before the GitHub Actions
secrets exist. (`bot:run` is the CI entry point and takes its config from the
environment instead.)

This runs the real Apibara searches and logs what *would* be posted (photos +
caption + keyboard) instead of calling Telegram, and skips the KV caching
step too - useful for checking a new filter profile's results before it goes
live. A dry run writes no state at all, so the lots it previews are still
posted for real on the next scheduled run. Drop `DRY_RUN` (and add
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `KV_REST_API_URL`,
`KV_REST_API_TOKEN`) to actually post for real.

## How "already posted" tracking works

`postedLots.json` records every lot the bot has posted, keyed
`<section>:<vin>`, so re-running the same search doesn't repost the same
car. The key includes the section deliberately: a lot whose Buy Now price
lapses into a bid-only listing is new information for the LIVE feed, not a
repost. The GitHub Actions workflow commits
this file back to the repo after every run - there's no database for this
part, git is the whole persistence layer. Entries older than 45 days are
pruned automatically (see `postedStore.ts`) so the file doesn't grow
forever. (The language captions in Vercel KV expire on the same 45-day
schedule, independently, via each entry's own TTL.)
