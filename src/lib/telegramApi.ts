/**
 * Shared Telegram Bot API pieces (plain fetch, no SDK) used by both the
 * standalone bot script (scripts/telegram-bot, posts new lots) and the
 * Next.js webhook (src/app/api/telegram/webhook, handles the language
 * switch buttons on those posts) - kept here rather than duplicated so the
 * button layout/callback_data format can't drift between the two.
 */
const TELEGRAM_API = "https://api.telegram.org";

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  return token;
}

export async function telegramCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Telegram ${method} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

/** callback_data is capped at 64 bytes by Telegram - "lang:" + a 17-char
 * VIN + ":" + a 2-letter code comfortably fits. */
export function languageKeyboard(vin: string) {
  return {
    inline_keyboard: [
      [
        { text: "🇬🇧 EN", callback_data: `lang:${vin}:en` },
        { text: "🇷🇺 RU", callback_data: `lang:${vin}:ru` },
        { text: "🇱🇹 LT", callback_data: `lang:${vin}:lt` },
      ],
    ],
  };
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  keyboard: ReturnType<typeof languageKeyboard>
): Promise<void> {
  await telegramCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, 4096),
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await telegramCall("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}
