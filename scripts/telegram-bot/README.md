# Telegram inventory bot

Runs on a schedule via `.github/workflows/telegram-bot.yml` (GitHub Actions,
not Vercel - see that file's comment for why). Searches Apibara for each
profile in `filters.ts`, and posts any new matching lot to the Telegram
channel: a photo album, followed by a details message (VIN, mileage,
damage, condition, and a full cost estimate to the destination port,
reusing `src/lib/costEstimate.ts`) with 🇬🇧 EN / 🇷🇺 RU / 🇱🇹 LT buttons that
swap the message's language in place when tapped.

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
- `TELEGRAM_CHANNEL_ID` - the channel the bot posts to (bot must be admin
  there). Public channels: `@channelusername`. Private channels: the
  numeric chat ID (forward a channel message to
  [@userinfobot](https://t.me/userinfobot) to get it).
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
model, year range, price cap, damage types, title-type keyword, etc). See
the comments in that file for exactly which fields are confirmed-working
Apibara filters vs. best-effort client-side matching. Commit and push -
no other changes needed, the next scheduled run picks it up.

## Testing locally without posting anything

```bash
DRY_RUN=true APIBARA_API_KEY=<your key> npm run bot:run
```

This runs the real Apibara searches and logs what *would* be posted (photos +
caption + keyboard) instead of calling Telegram, and skips the KV caching
step too - useful for checking a new filter profile's results before it goes
live. Drop `DRY_RUN` (and add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`,
`KV_REST_API_URL`, `KV_REST_API_TOKEN`) to actually post for real.

## How "already posted" tracking works

`postedLots.json` records every VIN the bot has posted, so re-running the
same search doesn't repost the same car. The GitHub Actions workflow commits
this file back to the repo after every run - there's no database for this
part, git is the whole persistence layer. Entries older than 45 days are
pruned automatically (see `postedStore.ts`) so the file doesn't grow
forever. (The language captions in Vercel KV expire on the same 45-day
schedule, independently, via each entry's own TTL.)
