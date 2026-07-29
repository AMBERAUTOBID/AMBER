import { telegramCall, languageKeyboard } from "../../src/lib/telegramApi";
import type { ChannelSection } from "./filters";

/**
 * Where each feed gets posted. Two topologies work with the same config,
 * which is why the chat id and the thread id are separate settings:
 *
 * 1. One forum supergroup, one topic per section (how bidauto.online does
 *    it - their "LIVE Auctions" / "Buy Now" tabs are forum topics). Set
 *    TELEGRAM_CHANNEL_ID once, plus a *_THREAD_ID per section. Get a
 *    thread id by opening the topic in Telegram Web - it's the last number
 *    in the URL.
 * 2. Two separate channels. Set TELEGRAM_LIVE_CHAT_ID /
 *    TELEGRAM_BUYNOW_CHAT_ID and leave the thread ids unset.
 */
const SECTION_ENV: Record<ChannelSection, { chatId: string; threadId: string }> = {
  live: { chatId: "TELEGRAM_LIVE_CHAT_ID", threadId: "TELEGRAM_LIVE_THREAD_ID" },
  buynow: { chatId: "TELEGRAM_BUYNOW_CHAT_ID", threadId: "TELEGRAM_BUYNOW_THREAD_ID" },
};

interface PostTarget {
  chat_id: string;
  message_thread_id?: number;
}

export function sectionTarget(section: ChannelSection): PostTarget {
  const env = SECTION_ENV[section];
  const chatId = process.env[env.chatId] || process.env.TELEGRAM_CHANNEL_ID;
  if (!chatId) {
    throw new Error(
      `No chat configured for the "${section}" section - set ${env.chatId}, or TELEGRAM_CHANNEL_ID to post every section to one chat.`
    );
  }

  const rawThread = process.env[env.threadId];
  if (!rawThread) return { chat_id: chatId };

  const threadId = Number(rawThread);
  if (!Number.isInteger(threadId)) {
    throw new Error(`${env.threadId} must be a whole number, got "${rawThread}".`);
  }
  return { chat_id: chatId, message_thread_id: threadId };
}

/**
 * Posts a photo album (no caption - Telegram doesn't support reply_markup
 * on sendMediaGroup at all), then a separate text message carrying the
 * actual details plus the language-switch and site-link keyboard. Falls
 * back to a text-only message when there are no photos.
 *
 * Set DRY_RUN=true to log what would be posted instead of actually calling
 * Telegram - lets the search/filter/format pipeline be tested before real
 * bot credentials are wired up.
 */
export async function postVehicleToChannel(
  photos: string[],
  captionEn: string,
  vin: string,
  section: ChannelSection
): Promise<void> {
  const keyboard = languageKeyboard(vin);

  if (process.env.DRY_RUN === "true") {
    console.log(`--- DRY RUN: would post to [${section}] ---`);
    console.log(`Photos (${photos.length}):`, photos.slice(0, 3), photos.length > 3 ? "..." : "");
    console.log(captionEn);
    console.log("keyboard:", JSON.stringify(keyboard));
    console.log("--- end dry run ---");
    return;
  }

  const target = sectionTarget(section);

  if (photos.length > 0) {
    await telegramCall("sendMediaGroup", {
      ...target,
      media: photos.slice(0, 10).map((url) => ({ type: "photo", media: url })),
    });
  }

  await telegramCall("sendMessage", {
    ...target,
    text: captionEn.slice(0, 4096),
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}
