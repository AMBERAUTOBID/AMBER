import {
  estimateVehicleCost,
  inferCoreVehicleKind,
  normalizeApibaraLocation,
  PORT_CUSTOMS,
  USD_TO_EUR,
} from "../../src/lib/costEstimate";
import type { ComparableSoldStats } from "./marketStats";
// The language list is defined next to the keyboard that renders it, so a
// caption can never exist for a language with no button (or vice versa).
import { POST_LANGS, type PostLang } from "../../src/lib/telegramApi";
import { SITE, CONTACT_HREF } from "../../src/shared/config/site";
import type { VehicleListItem } from "./apibaraClient";
import type { ChannelSection, SavedSearchFilter } from "./filters";

export { POST_LANGS, type PostLang };

const DEFAULT_DESTINATION_PORT = "Klaipėda, Lithuania";
const CONTACT_PHONE_DISPLAY = SITE.phone.display;
const CONTACT_WHATSAPP = CONTACT_HREF.whatsapp;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatUsd(v: number): string {
  return `$${Math.round(v).toLocaleString()}`;
}
function formatEur(v: number): string {
  return `€${Math.round(v).toLocaleString()}`;
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Auction times come back as a proper ISO instant with offset (e.g.
 * "2026-07-29T14:00:00+00:00"), so the conversion is exact. Apibara's own
 * pre-`formatted` string is left alone: it happened to read UTC+3 in
 * testing, but nothing documents which zone it's rendered in, and silently
 * inheriting an unknown timezone for a "be there at this time" field is the
 * kind of thing that costs someone an auction.
 */
const AUCTION_TIME_ZONE = "Europe/Vilnius";
const AUCTION_TIME_ZONE_LABEL = "Vilnius";

function formatAuctionLocal(isoInstant: string): string | null {
  const date = new Date(isoInstant);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: AUCTION_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")} (${AUCTION_TIME_ZONE_LABEL})`;
}

// Our own labels only - raw Apibara data values (damage text, run
// condition, sale document name, etc.) stay in English regardless of
// language, same as the website: they're third-party source strings, not
// ours to translate, and mistranslating them could misstate real auction
// facts.
const LABELS: Record<PostLang, Record<string, string>> = {
  en: {
    headlineLive: "🔥 Great find at auction! 🔥",
    headlineBuyNow: "⚡ Buy Now — available immediately ⚡",
    lot: "Lot",
    odometer: "Odometer",
    condition: "Condition",
    damage: "Damage",
    keys: "Keys",
    yes: "Yes",
    no: "No",
    title: "Title",
    auction: "Auction",
    currentBid: "Current bid",
    buyNow: "Buy now",
    recentSales: "Comparable sales",
    sales: "sales",
    avg: "avg",
    noPriceYet: "Bidding hasn't opened yet — message us for a full cost estimate to your port",
    estimatedCostsTo: "Estimated costs to",
    illustrative: "illustrative, not a binding quote",
    lotPrice: "Lot price",
    auctionFees: "Auction fees",
    localTransport: "Local transport",
    oceanFreight: "Ocean freight",
    brokerageFee: "Brokerage fee",
    subtotal: "Subtotal",
    stillToPay: "Still to pay on import",
    duty: "Duty",
    vat: "VAT",
    usaMadeNote: "0% for US-built cars",
    interested: "Interested? Call",
    or: "or",
    whatsapp: "WhatsApp us",
  },
  ru: {
    headlineLive: "🔥 Отличный лот на аукционе! 🔥",
    headlineBuyNow: "⚡ Купить сейчас — доступно сразу ⚡",
    lot: "Лот",
    odometer: "Пробег",
    condition: "Состояние",
    damage: "Повреждение",
    keys: "Ключи",
    yes: "Да",
    no: "Нет",
    title: "Документ",
    auction: "Аукцион",
    currentBid: "Текущая ставка",
    buyNow: "Купить сейчас",
    recentSales: "Продажи аналогов",
    sales: "продаж",
    avg: "средн.",
    noPriceYet: "Торги ещё не начались — напишите нам для полного расчёта до вашего порта",
    estimatedCostsTo: "Примерные расходы до",
    illustrative: "ориентировочно, не является офертой",
    lotPrice: "Цена лота",
    auctionFees: "Аукционные сборы",
    localTransport: "Местная перевозка",
    oceanFreight: "Морской фрахт",
    brokerageFee: "Брокерская комиссия",
    subtotal: "Промежуточный итог",
    stillToPay: "Останется оплатить при импорте",
    duty: "Пошлина",
    vat: "НДС",
    usaMadeNote: "0% для автомобилей, произведённых в США",
    interested: "Интересует? Звоните",
    or: "или",
    whatsapp: "напишите нам в WhatsApp",
  },
  lt: {
    headlineLive: "🔥 Labai geras pasiūlymas aukcione! 🔥",
    headlineBuyNow: "⚡ Pirkti dabar — galima iš karto ⚡",
    lot: "Lotas",
    odometer: "Rida",
    condition: "Būklė",
    damage: "Pažeidimas",
    keys: "Raktai",
    yes: "Taip",
    no: "Ne",
    title: "Dokumentas",
    auction: "Aukcionas",
    currentBid: "Dabartinis pasiūlymas",
    buyNow: "Pirkti dabar",
    recentSales: "Panašių automobilių pardavimai",
    sales: "pardavimai",
    avg: "vid.",
    noPriceYet: "Licitacija dar neprasidėjo — parašykite mums dėl pilno kainos skaičiavimo iki jūsų uosto",
    estimatedCostsTo: "Apytikslės išlaidos iki",
    illustrative: "orientacinis skaičiavimas, ne įpareigojantis pasiūlymas",
    lotPrice: "Loto kaina",
    auctionFees: "Aukciono mokesčiai",
    localTransport: "Vietinis transportavimas",
    oceanFreight: "Jūrų frachtas",
    brokerageFee: "Tarpininkavimo mokestis",
    subtotal: "Tarpinė suma",
    stillToPay: "Liks sumokėti importuojant",
    duty: "Muitas",
    vat: "PVM",
    usaMadeNote: "0% JAV gamybos automobiliams",
    interested: "Domina? Skambinkite",
    or: "arba",
    whatsapp: "rašykite mums per WhatsApp",
  },
};

export function buildCaption(
  v: VehicleListItem,
  search: SavedSearchFilter,
  lang: PostLang,
  section: ChannelSection,
  soldStats: ComparableSoldStats | null
): string {
  const t = LABELS[lang];
  const lines: string[] = [];

  // The saved search's `name` is deliberately not shown - it's an operator
  // label written in English (see filters.ts), so printing it inside a
  // Russian or Lithuanian post left one stray untranslated line.
  lines.push(`🚗 ${section === "buynow" ? t.headlineBuyNow : t.headlineLive}`);
  lines.push(`<b>${escapeHtml(v.title)}</b>`);
  lines.push("");
  lines.push(`🆔 VIN: <code>${escapeHtml(v.vin)}</code>`);
  lines.push(`🔖 ${t.lot} #${escapeHtml(v.lot_number)} (${v.platform.toUpperCase()})`);
  if (v.location?.display) lines.push(`📍 ${escapeHtml(v.location.display)}`);
  if (typeof v.odometer?.mi === "number") lines.push(`🛣 ${t.odometer}: ${v.odometer.mi.toLocaleString()} mi`);
  if (v.condition?.run_condition?.label) lines.push(`🏁 ${t.condition}: ${escapeHtml(v.condition.run_condition.label)}`);
  if (v.condition?.primary_damage) {
    const secondary = v.condition.secondary_damage ? ` / ${escapeHtml(v.condition.secondary_damage)}` : "";
    lines.push(`🔧 ${t.damage}: ${escapeHtml(v.condition.primary_damage)}${secondary}`);
  }
  if (typeof v.condition?.has_key === "boolean") lines.push(`🔑 ${t.keys}: ${v.condition.has_key ? t.yes : t.no}`);
  if (v.sale_document?.name) lines.push(`📄 ${t.title}: ${escapeHtml(v.sale_document.name)}`);

  const auctionLocal = v.auction?.auction_at ? formatAuctionLocal(v.auction.auction_at) : null;
  const auctionWhen = auctionLocal ?? v.auction?.formatted;
  if (auctionWhen) lines.push(`⏳ ${t.auction}: ${escapeHtml(auctionWhen)}`);

  lines.push("");
  const currentBid = v.pricing?.current_bid_usd;
  const buyNow = v.pricing?.buy_now_usd;
  if (typeof currentBid === "number") lines.push(`💰 ${t.currentBid}: ${formatUsd(currentBid)}`);
  if (typeof buyNow === "number") lines.push(`⚡ ${t.buyNow}: ${formatUsd(buyNow)}`);

  if (soldStats) {
    lines.push(
      `💸 ${t.recentSales} ${soldStats.yearFrom}-${soldStats.yearTo} (${soldStats.sampleSize} ${t.sales}): ` +
        `${formatUsd(soldStats.minUsd)} – ${formatUsd(soldStats.maxUsd)}, ${t.avg} ${formatUsd(soldStats.avgUsd)}`
    );
  }

  // Which price the estimate below is built on has to follow the section,
  // not just "whichever exists". Buy Now lots can also carry a current bid,
  // and costing one of those off a $550 bid rather than its $5,100 Buy Now
  // price would understate the real total a reader is being quoted.
  const basePriceUsd =
    section === "buynow" ? (buyNow ?? currentBid ?? 0) : (currentBid ?? buyNow ?? 0);

  const destinationPort = search.destinationPort ?? DEFAULT_DESTINATION_PORT;
  const pickupLocation = v.location?.display ? normalizeApibaraLocation(v.location.display) : "";
  const estimate = estimateVehicleCost({
    vehicleKind: inferCoreVehicleKind(v.vehicle_specs?.body_style),
    lotPriceUsd: basePriceUsd,
    pickupLocation,
    auctionNetwork: v.platform,
    destinationPort,
    // Country of manufacture isn't in the search-list response (only the
    // detail endpoint's undocumented raw pass-through has it), so this
    // conservatively assumes non-US-made and includes the EU duty rather
    // than guessing a waiver that may not apply.
    usaMade: false,
  });

  // Everything up to the port is ours to quote - those are our own rates.
  // Duty and VAT are the destination country's, vary with how the lot is
  // finally valued at clearing, and get published as the rates themselves
  // rather than as computed figures, so a post can't be read as a promise
  // about someone else's tax bill.
  const landedSubtotalUsd =
    estimate.lotPriceUsd +
    estimate.auctionFeesUsd +
    estimate.truckingUsd +
    estimate.shippingUsd +
    estimate.brokerageFeeUsd;

  lines.push("");
  if (basePriceUsd > 0) {
    lines.push(`💵 <b>${t.estimatedCostsTo} ${escapeHtml(destinationPort)}</b> (${t.illustrative}):`);
    lines.push(`  ${t.lotPrice}: ${formatUsd(estimate.lotPriceUsd)}`);
    lines.push(`  ${t.auctionFees}: ${formatUsd(estimate.auctionFeesUsd)}`);
    lines.push(`  ${t.localTransport}: ${formatUsd(estimate.truckingUsd)}`);
    lines.push(`  ${t.oceanFreight}: ${formatUsd(estimate.shippingUsd)}`);
    lines.push(`  ${t.brokerageFee}: ${formatUsd(estimate.brokerageFeeUsd)}`);
    lines.push(
      `  ≈ ${t.subtotal}: <b>${formatUsd(landedSubtotalUsd)}</b> (${formatEur(landedSubtotalUsd * USD_TO_EUR)})`
    );
  } else {
    // Copart routinely lists a lot with no current bid before bidding opens.
    // Running the estimate on a $0 lot price produced a real, publishable
    // post advertising a 2022 BMW 330i landed in Klaipeda for EUR 1,656 - so
    // when there's no price to work from, say so instead of costing nothing.
    lines.push(`💵 ${t.noPriceYet}.`);
  }

  const customs = PORT_CUSTOMS[destinationPort] ?? PORT_CUSTOMS[DEFAULT_DESTINATION_PORT];
  lines.push("");
  lines.push(`🧾 <b>${t.stillToPay}</b>:`);
  const dutyNote = customs.dutyWaivedForUsaMade ? ` — ${t.usaMadeNote}` : "";
  lines.push(`  ✅ ${t.duty}: ${formatPct(customs.duty)}${dutyNote}`);
  lines.push(`  ✅ ${t.vat}: ${formatPct(customs.vat)}`);

  lines.push("");
  lines.push(
    `📞 ${t.interested} ${CONTACT_PHONE_DISPLAY} ${t.or} <a href="${CONTACT_WHATSAPP}">${t.whatsapp}</a>.`
  );

  return lines.join("\n");
}

export function buildAllCaptions(
  v: VehicleListItem,
  search: SavedSearchFilter,
  section: ChannelSection,
  soldStats: ComparableSoldStats | null
): Record<PostLang, string> {
  return Object.fromEntries(
    POST_LANGS.map((lang) => [lang, buildCaption(v, search, lang, section, soldStats)])
  ) as Record<PostLang, string>;
}

export function extractPhotoUrls(v: VehicleListItem): string[] {
  return (
    v.media?.items?.filter((i) => i.type === "image" && i.large).map((i) => i.large as string) ?? []
  );
}
