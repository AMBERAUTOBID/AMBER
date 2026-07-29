import { NextResponse } from "next/server";
import { kvGetJson } from "@/lib/upstashKv";
import {
  editMessageText,
  answerCallbackQuery,
  languageKeyboard,
  isPostLang,
  type PostLang,
} from "@/lib/telegramApi";

type CachedCaptions = Record<PostLang, string>;

interface TelegramUpdate {
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number };
    };
  };
}

/**
 * Telegram calls this whenever someone taps a language button on a bot
 * post (see scripts/telegram-bot - that's what posts them). Registered via
 * a one-time setWebhook call - see scripts/telegram-bot/README.md.
 */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const query = update.callback_query;

  if (!query?.data || !query.message) {
    return NextResponse.json({ ok: true });
  }

  const [prefix, vin, lang] = query.data.split(":");
  if (prefix !== "lang" || !vin || !isPostLang(lang)) {
    await answerCallbackQuery(query.id).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  try {
    const captions = await kvGetJson<CachedCaptions>(`bot:captions:${vin}`);
    if (!captions) {
      await answerCallbackQuery(query.id, "This listing is no longer cached.");
      return NextResponse.json({ ok: true });
    }

    await editMessageText(
      query.message.chat.id,
      query.message.message_id,
      captions[lang],
      languageKeyboard(vin, lang)
    );
    await answerCallbackQuery(query.id);
  } catch (e) {
    console.error("Telegram webhook error:", e);
    await answerCallbackQuery(query.id, "Something went wrong.").catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
