# Auction mirror ingest

Fills and maintains `auction_lots` — our own copy of the apicars.auction active
catalogue — so that a vendor outage becomes stale data rather than a broken
page. See `ARCHITECTURE.md` for how search reads it.

Everything here targets the **Neon `auction-mirror` branch** and nothing else.
Every script refuses to run against the production endpoint, and refuses to fall
back to `DATABASE_URL` when the mirror URL is missing — a forgotten env override
is the accident worth engineering against, not one worth remembering to avoid.

## The nightly sweep

`.github/workflows/auction-sweep.yml` runs a full sweep once a day at 22:17 UTC,
so it is finished by about 02:00 UTC — 05:00 in Vilnius, before anyone in our
market opens the site.

It runs on GitHub Actions rather than Vercel for two reasons: the free Hobby plan
caps cron at once a day with nothing to spare, and a sweep takes 3.5–4 hours,
which is far past any serverless timeout. The Telegram bot already runs this way.

Three steps: sweep, check, alert.

| step | what it proves |
|---|---|
| `sweep:run` | the catalogue was walked end to end |
| `sweep:health` | the mirror that resulted is actually current |
| `notify-sweep-failure.ts` | somebody finds out when it is not |

**Why the second step exists.** A sweep that dies does not break anything you can
see. Search keeps answering, every page renders, and the only symptom is that
bids and sale dates quietly drift away from reality. `auction_ingest_runs` has
always recorded the failure and nothing ever read it — the check is what turns
that record into a signal, and `INGEST_REQUIRE_COMPLETE=1` is what stops the
sweep exiting 0 after stopping at page 12 with an HTTP 402.

**What it cannot watch is itself.** GitHub disables scheduled workflows in a
repository with no activity for 60 days, and a cron that never fires never
alerts. If the repo goes quiet for a while, check the Actions tab.

## Required secrets

**GitHub Actions secrets** (Settings → Secrets and variables → Actions):

- `APICARS_API_TOKEN` — the vendor key, same value as in `.env.local`. Shown in
  full only at creation, so a lost one must be rotated rather than recovered.
- `DATABASE_URL_MIRROR_UNPOOLED` — the **mirror** branch's unpooled connection
  string. Not production, and not the pooled URL: a transaction pooler misbehaves
  on the long-running writes a sweep makes.
- `TELEGRAM_BOT_TOKEN` — already set for the bot; the alert reuses it.
- `TELEGRAM_ALERT_CHAT_ID` — **optional, and the one worth setting.** A *private*
  chat with the bot, never the public listings channel. Get the number by sending
  the bot any message and opening
  `https://api.telegram.org/bot<TOKEN>/getUpdates`, or by forwarding a message
  from the target chat to [@userinfobot](https://t.me/userinfobot).

With `TELEGRAM_ALERT_CHAT_ID` unset the alert step still runs, prints the message
it would have sent, and exits 0 — leaving GitHub's own failure email to the
repository owner as the only notification. That email is the backstop: it needs
no configuration and cannot be forgotten. It also lands next to every other
GitHub notification, which is why the Telegram message is worth the two minutes.

## Running by hand

```bash
npm run sweep:local            # capped 300-page development sweep, strided
npm run sweep:health:local     # is the mirror current? exits 1 if not
```

`:local` variants load `.env.local`; the plain ones read the environment, which
is what CI does. Useful environment variables:

- `INGEST_MAX_PAGES` — default 300. The catalogue is ~2,950 pages.
- `INGEST_STRIDE=0` — walk consecutively instead of sampling. **Required for a
  real sweep**: a strided run deliberately sees a slice and can never be marked
  complete, so it can never date a lot's disappearance.
- `INGEST_REQUIRE_COMPLETE=1` — exit non-zero if the sweep did not finish the
  catalogue. Off by default, because a capped development run is incomplete on
  purpose.
- `RENORMALIZE_ALL=1` — for `renormalize.ts`, after adding a classification
  column. Its default scope tests three columns only, so a newly added one leaves
  those populated and the default run skips exactly the rows that need work.

There is no renormalise step in the nightly workflow on purpose: the mapper
classifies every filter column as it writes, so `renormalize.ts` is only needed
when the normalisers themselves change — a code change, not a nightly event.

## What the health check is checking

Thresholds live in `src/modules/inventory/model/sweepHealth.ts` with the
measurements they came from, and are unit-tested against the two complete sweeps
on record (2,931 pages / 146,081 written and 2,887 / 143,341, both with **zero**
skipped rows).

1. **Stale** — no complete sweep finished in the last 30 h. One missed night
   alerts; a scheduled run running a few hours late, which GitHub does routinely,
   does not.
2. **Errored** — the most recent sweep ended with a note. A `page cap (N)` note is
   what every local development run writes and is deliberately not an incident; a
   monitor that is normally red is a monitor nobody reads.
3. **Hung** — a run started more than 6 h ago and never wrote its counters. A
   complete sweep takes ~4 h, so this means the process was killed.
4. **Shape change** — the mapper refused more than 1% of lots. Baseline is exactly
   0.00% across 290,853 lots, so this is how a vendor field changing type
   announces itself. The reasons are printed in the sweep's own log.
5. **Silent shrink** — a sweep completed, reported success, and wrote less than
   75% of what the previous one did. Nothing else in the pipeline would notice.

## When the alert fires

Read the run's summary on its Actions page — the check writes its verdict there,
not only into the log. Then, in order of how often it has actually been the cause:

- **HTTP 402 from the vendor** — the Active Lots Pro subscription lapsed, or the
  card on file failed. Check the apicars.auction dashboard.
- **A row the mapper refused** — the sweep survives these one row at a time and
  counts the reason. A jump means the vendor changed a field's shape; the fix is
  in `src/modules/inventory/model/apicarsLot.ts`, then a
  `RENORMALIZE_ALL=1 renormalize.ts` over the rows already stored.
- **The job hit its 300-minute step timeout** — the sweep is database-bound at
  0.25 CU, and raising `DB_BATCH` will not help (measured: 100 → 500 bought 1.4×).
  A bigger Neon compute during ingest is the only real lever.
- **Nothing ran at all** — see the 60-day note above.

Search itself degrades safely while this is broken: the disappearance rule needs
two *complete* sweeps and simply shows everything when it has fewer, so a failed
sweep can only leave a departed lot visible. It can never empty the results.
