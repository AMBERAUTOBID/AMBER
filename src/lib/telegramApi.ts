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

export type PostLang = "en" | "ru" | "lt";
export const POST_LANGS: PostLang[] = ["en", "ru", "lt"];

export function isPostLang(value: unknown): value is PostLang {
  return POST_LANGS.includes(value as PostLang);
}

const SITE_URL = "https://smartautobid.com";

const LANG_BUTTON_LABEL: Record<PostLang, string> = {
  en: "🇬🇧 EN",
  ru: "🇷🇺 RU",
  lt: "🇱🇹 LT",
};

const DETAILS_BUTTON_LABEL: Record<PostLang, string> = {
  en: "🔎 Full details & photos",
  ru: "🔎 Подробнее и все фото",
  lt: "🔎 Išsami informacija ir nuotraukos",
};

/** Deep-links to the site's own lot page for this VIN. next-intl's
 * localePrefix is "as-needed" (see src/i18n/routing.ts), so the default
 * locale - English - carries no prefix while ru/lt do. */
export function vehicleUrl(vin: string, lang: PostLang): string {
  const prefix = lang === "en" ? "" : `/${lang}`;
  return `${SITE_URL}${prefix}/vehicle/${encodeURIComponent(vin)}`;
}

/**
 * Row 1 switches the message's language in place (handled by the webhook);
 * row 2 sends the reader to our own site rather than the auction's, which is
 * the whole point of the channel. `currentLang` only affects presentation -
 * which button is ticked, and which locale the site link opens - so the
 * keyboard has to be rebuilt on every language swap, not reused.
 *
 * callback_data is capped at 64 bytes by Telegram - "lang:" + a 17-char VIN
 * + ":" + a 2-letter code comfortably fits.
 */
export function languageKeyboard(vin: string, currentLang: PostLang = "en") {
  return {
    inline_keyboard: [
      POST_LANGS.map((lang) => ({
        text: lang === currentLang ? `${LANG_BUTTON_LABEL[lang]} ✓` : LANG_BUTTON_LABEL[lang],
        callback_data: `lang:${vin}:${lang}`,
      })),
      [{ text: DETAILS_BUTTON_LABEL[currentLang], url: vehicleUrl(vin, currentLang) }],
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
