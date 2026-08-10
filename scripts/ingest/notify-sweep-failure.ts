/**
 * Sends one Telegram message when the nightly sweep breaks.
 *
 * WHY TELEGRAM AND NOT EMAIL: GitHub already emails the repository owner when a
 * workflow fails, and that email is the backstop — it needs no configuration and
 * cannot be forgotten. But it lands in a mailbox next to every other GitHub
 * notification, and the failure it describes is invisible on the site itself, so
 * it is exactly the kind of alert that gets skimmed for a week. The bot is
 * already wired up, already trusted with a token, and already somewhere the user
 * looks.
 *
 * Run (CI does this only on failure):
 *   npx tsx scripts/ingest/notify-sweep-failure.ts "the sweep step failed"
 *
 * NOT the public channel. `TELEGRAM_ALERT_CHAT_ID` must be a private chat with
 * the bot — the operational state of our mirror is nobody else's business, and
 * `TELEGRAM_CHANNEL_ID` is deliberately not used as a fallback. With it unset
 * this prints the alert and exits 0, leaving GitHub's own email as the only
 * notification.
 *
 * ALWAYS EXITS 0. The job that called it has already failed; a failure to
 * deliver the alert must not overwrite that with a more confusing one. It says
 * so loudly in the log instead.
 */
import { neon } from "@neondatabase/serverless";
import { telegramCall } from "../../src/modules/telegram/api/botApi";
import { assessSweepHealth, type IngestRunRecord } from "../../src/modules/inventory/model/sweepHealth";

const reason = process.argv.slice(2).join(" ").trim() || "the nightly sweep did not finish cleanly";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Link back to the run that failed, when GitHub is the caller. */
function runUrl(): string | null {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return null;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

/**
 * Ask the run log what is actually wrong, so the message says "the last complete
 * sweep is 31 h old" rather than only "a step failed".
 *
 * Best effort by design: the sweep may have failed precisely because the
 * database was unreachable, and in that case the alert must still go out.
 */
async function problemsFromRunLog(): Promise<string[]> {
  const url = process.env.DATABASE_URL_MIRROR_UNPOOLED ?? process.env.DATABASE_URL_MIRROR;
  if (!url) return [];
  try {
    const sql = neon(url);
    const rows = await sql`
      select kind, started_at, finished_at, is_partial,
             pages_fetched, lots_seen, lots_written, lots_skipped, note
      from auction_ingest_runs
      order by started_at desc
      limit 25
    `;
    const runs: IngestRunRecord[] = rows.map((row) => ({
      kind: row.kind as IngestRunRecord["kind"],
      startedAt: new Date(row.started_at as string),
      finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
      isPartial: Boolean(row.is_partial),
      pagesFetched: Number(row.pages_fetched ?? 0),
      lotsSeen: Number(row.lots_seen ?? 0),
      lotsWritten: Number(row.lots_written ?? 0),
      lotsSkipped: Number(row.lots_skipped ?? 0),
      note: (row.note as string | null) ?? null,
    }));
    return assessSweepHealth(runs, new Date()).problems;
  } catch (e) {
    return [`(could not read the run log: ${e instanceof Error ? e.message : String(e)})`];
  }
}

async function main() {
  const problems = await problemsFromRunLog();

  const lines = [
    "🔴 <b>Auction mirror sweep failed</b>",
    "",
    escapeHtml(reason),
  ];
  if (problems.length > 0) {
    lines.push("", ...problems.map((p) => `• ${escapeHtml(p)}`));
  }
  lines.push(
    "",
    "Search still answers — it is serving data from the last sweep that worked, " +
      "which gets older every day this is not fixed."
  );
  const url = runUrl();
  if (url) lines.push("", `<a href="${escapeHtml(url)}">Open the failed run</a>`);

  const text = lines.join("\n");

  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) {
    console.error(
      "No Telegram alert configured (needs TELEGRAM_ALERT_CHAT_ID and TELEGRAM_BOT_TOKEN).\n" +
        "GitHub's own failure email is the only notification for this run. The message would have been:\n"
    );
    console.error(text);
    return;
  }

  try {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    console.log("Alert sent.");
  } catch (e) {
    console.error(`Could not send the alert: ${e instanceof Error ? e.message : e}`);
    console.error(text);
  }
}

main().catch((e) => {
  // See the header: never turn a sweep failure into an alerting failure.
  console.error("notify aborted:", e instanceof Error ? e.message : e);
});
