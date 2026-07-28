import { telegramCall, languageKeyboard } from "../../src/lib/telegramApi";

function chatId(): string {
  const id = process.env.TELEGRAM_CHANNEL_ID;
  if (!id) throw new Error("TELEGRAM_CHANNEL_ID is not set (expected as a GitHub Actions secret).");
  return id;
}

/**
 * Posts a photo album (no caption - Telegram doesn't support reply_markup
 * on sendMediaGroup at all), then a separate text message carrying the
 * actual details plus the language-switch keyboard. Falls back to a
 * text-only message when there are no photos.
 *
 * Set DRY_RUN=true to log what would be posted instead of actually calling
 * Telegram - lets the search/filter/format pipeline be tested before real
 * bot credentials are wired up.
 */
export async function postVehicleToChannel(
  photos: string[],
  captionEn: string,
  vin: string
): Promise<void> {
  const keyboard = languageKeyboard(vin);

  if (process.env.DRY_RUN === "true") {
    console.log("--- DRY RUN: would post ---");
    console.log(`Photos (${photos.length}):`, photos.slice(0, 3), photos.length > 3 ? "..." : "");
    console.log(captionEn);
    console.log("keyboard:", JSON.stringify(keyboard));
    console.log("--- end dry run ---");
    return;
  }

  if (photos.length > 0) {
    await telegramCall("sendMediaGroup", {
      chat_id: chatId(),
      media: photos.slice(0, 10).map((url) => ({ type: "photo", media: url })),
    });
  }

  await telegramCall("sendMessage", {
    chat_id: chatId(),
    text: captionEn.slice(0, 4096),
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}
