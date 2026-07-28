import {
  estimateVehicleCost,
  normalizeApibaraLocation,
  type CoreVehicleKind,
} from "../../src/lib/costEstimate";
import type { VehicleListItem } from "./apibaraClient";
import type { SavedSearchFilter } from "./filters";

export type PostLang = "en" | "ru" | "lt";
export const POST_LANGS: PostLang[] = ["en", "ru", "lt"];

const DEFAULT_DESTINATION_PORT = "Klaipėda, Lithuania";
const CONTACT_PHONE_DISPLAY = "+1 (912) 561-2347";
const CONTACT_WHATSAPP = "https://wa.me/19125612347";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatUsd(v: number): string {
  return `$${Math.round(v).toLocaleString()}`;
}
function formatEur(v: number): string {
  return `€${Math.round(v).toLocaleString()}`;
}

function inferVehicleKind(v: VehicleListItem): CoreVehicleKind {
  const body = v.vehicle_specs?.body_style?.toUpperCase() ?? "";
  if (body.includes("SUV") || body.includes("SPORT UTILITY") || body.includes("CROSSOVER")) {
    return "suv";
  }
  return "car";
}

// Our own labels only - raw Apibara data values (damage text, run
// condition, sale document name, etc.) stay in English regardless of
// language, same as the website: they're third-party source strings, not
// ours to translate, and mistranslating them could misstate real auction
// facts.
const LABELS: Record<PostLang, Record<string, string>> = {
  en: {
    newMatch: "New match",
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
    estimatedTotalTo: "Estimated total to",
    illustrative: "illustrative, not a binding quote",
    lotPrice: "Lot price",
    auctionFees: "Auction fees",
    localTransport: "Local transport",
    oceanFreight: "Ocean freight",
    brokerageFee: "Brokerage fee",
    duty: "Duty",
    vat: "VAT",
    total: "Total",
    interested: "Interested? Call",
    or: "or",
    whatsapp: "WhatsApp us",
  },
  ru: {
    newMatch: "Новое совпадение",
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
    estimatedTotalTo: "Примерная стоимость до",
    illustrative: "ориентировочно, не является офертой",
    lotPrice: "Цена лота",
    auctionFees: "Аукционные сборы",
    localTransport: "Местная перевозка",
    oceanFreight: "Морской фрахт",
    brokerageFee: "Брокерская комиссия",
    duty: "Пошлина",
    vat: "НДС",
    total: "Итого",
    interested: "Интересует? Звоните",
    or: "или",
    whatsapp: "напишите нам в WhatsApp",
  },
  lt: {
    newMatch: "Naujas atitikmuo",
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
    estimatedTotalTo: "Apytikslė kaina iki",
    illustrative: "orientacinis skaičiavimas, ne įpareigojantis pasiūlymas",
    lotPrice: "Loto kaina",
    auctionFees: "Aukciono mokesčiai",
    localTransport: "Vietinis transportavimas",
    oceanFreight: "Jūrų frachtas",
    brokerageFee: "Tarpininkavimo mokestis",
    duty: "Muitas",
    vat: "PVM",
    total: "Iš viso",
    interested: "Domina? Skambinkite",
    or: "arba",
    whatsapp: "rašykite mums per WhatsApp",
  },
};

export function buildCaption(v: VehicleListItem, search: SavedSearchFilter, lang: PostLang): string {
  const t = LABELS[lang];
  const lines: string[] = [];

  lines.push(`🚨🔥 ${t.newMatch}: <b>${escapeHtml(search.name)}</b> 🔥🚨`);
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
  if (v.auction?.formatted) lines.push(`📅 ${t.auction}: ${escapeHtml(v.auction.formatted)}${v.auction.state ? ` (${v.auction.state})` : ""}`);

  lines.push("");
  const currentBid = v.pricing?.current_bid_usd;
  const buyNow = v.pricing?.buy_now_usd;
  const basePriceUsd = currentBid ?? buyNow ?? 0;
  if (typeof currentBid === "number") lines.push(`💰 ${t.currentBid}: ${formatUsd(currentBid)}`);
  if (typeof buyNow === "number") lines.push(`⚡ ${t.buyNow}: ${formatUsd(buyNow)}`);

  const destinationPort = search.destinationPort ?? DEFAULT_DESTINATION_PORT;
  const pickupLocation = v.location?.display ? normalizeApibaraLocation(v.location.display) : "";
  const estimate = estimateVehicleCost({
    vehicleKind: inferVehicleKind(v),
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

  lines.push("");
  lines.push(`💵 <b>${t.estimatedTotalTo} ${escapeHtml(destinationPort)}</b> (${t.illustrative}):`);
  lines.push(`  ${t.lotPrice}: ${formatUsd(estimate.lotPriceUsd)}`);
  lines.push(`  ${t.auctionFees}: ${formatUsd(estimate.auctionFeesUsd)}`);
  lines.push(`  ${t.localTransport}: ${formatUsd(estimate.truckingUsd)}`);
  lines.push(`  ${t.oceanFreight}: ${formatUsd(estimate.shippingUsd)}`);
  lines.push(`  ${t.brokerageFee}: ${formatUsd(estimate.brokerageFeeUsd)}`);
  lines.push(`  ${t.duty}: ${formatUsd(estimate.dutyUsd)}`);
  lines.push(`  ${t.vat}: ${formatUsd(estimate.vatUsd)}`);
  lines.push(`  ≈ ${t.total}: <b>${formatEur(estimate.totalEur)}</b>`);

  lines.push("");
  lines.push(
    `📞 ${t.interested} ${CONTACT_PHONE_DISPLAY} ${t.or} <a href="${CONTACT_WHATSAPP}">${t.whatsapp}</a>.`
  );

  return lines.join("\n");
}

export function buildAllCaptions(
  v: VehicleListItem,
  search: SavedSearchFilter
): Record<PostLang, string> {
  return {
    en: buildCaption(v, search, "en"),
    ru: buildCaption(v, search, "ru"),
    lt: buildCaption(v, search, "lt"),
  };
}

export function extractPhotoUrls(v: VehicleListItem): string[] {
  return (
    v.media?.items?.filter((i) => i.type === "image" && i.large).map((i) => i.large as string) ?? []
  );
}
