"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MagnifyingGlass, WarningCircle, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "@/i18n/navigation";

interface LotPreview {
  platform: "copart" | "iaai";
  lotNumber: string;
  vin: string | null;
  title: string;
  auctionName: string | null;
  titleClass: string | null;
  odometer: number | null;
  odometerUnit: string | null;
  primaryDamage: string | null;
}

interface Duplicate {
  reference: string;
  clientName: string;
  createdAt: string;
}

interface ClientRow {
  id: string;
  name: string;
  email: string;
}

/**
 * Opening a case file: find the car, choose the client, create.
 *
 * Two deliberate shapes here.
 *
 * **The lookup is a preview, not the payload.** What comes back is shown so an
 * admin can confirm they have the right car; the create call sends only the
 * lot number and the client id, and the server fetches the auction again.
 * Anything else would let a crafted request file a car that was never bought.
 *
 * **A duplicate is a warning, not a refusal.** The server answers 409 with the
 * existing files attached, and the admin decides — Copart relists unsold
 * vehicles under the same number, so a second file is sometimes correct, and a
 * hard block would meet a real situation with a dead end.
 */
export default function NewOrderForm() {
  const t = useTranslations("AdminOrders");
  const router = useRouter();

  const [term, setTerm] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lot, setLot] = useState<LotPreview | null>(null);
  const [media, setMedia] = useState<{ photos: number; videos: number } | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);

  const [manual, setManual] = useState(false);
  const [manualFields, setManualFields] = useState({
    platform: "copart",
    lotNumber: "",
    vin: "",
    year: "",
    make: "",
    model: "",
  });

  const [clientQuery, setClientQuery] = useState("");
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [client, setClient] = useState<ClientRow | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { res, data: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  }

  async function doLookup() {
    if (!term.trim()) return;
    setLooking(true);
    setLookupError(null);
    setLot(null);
    setMedia(null);
    setDuplicates([]);
    try {
      const { res, data } = await post({ action: "lookup", lotOrVin: term.trim() });
      if (res.status === 404) setLookupError(t("lookup.notFound"));
      else if (!res.ok || !data?.ok) setLookupError(t("lookup.failed"));
      else {
        setLot(data.lot as LotPreview);
        setMedia(data.media as { photos: number; videos: number });
        setDuplicates((data.duplicates as Duplicate[]) ?? []);
        setManual(false);
      }
    } catch {
      setLookupError(t("lookup.failed"));
    }
    setLooking(false);
  }

  async function searchClients() {
    const { data } = await post({ action: "clients", query: clientQuery.trim() });
    setClients((data?.clients as ClientRow[]) ?? []);
  }

  async function submit(confirmDuplicate = false) {
    if (!client) return;
    setSaving(true);
    setSaveError(null);

    const payload: Record<string, unknown> = {
      action: "create",
      userId: client.id,
      confirmDuplicate,
    };
    if (manual) {
      payload.manual = {
        platform: manualFields.platform,
        lotNumber: manualFields.lotNumber.trim(),
        vin: manualFields.vin.trim() || undefined,
        year: manualFields.year ? Number(manualFields.year) : undefined,
        make: manualFields.make.trim() || undefined,
        model: manualFields.model.trim() || undefined,
      };
    } else {
      payload.lotOrVin = lot?.lotNumber ?? term.trim();
    }

    try {
      const { res, data } = await post(payload);
      if (res.status === 409) {
        setDuplicates((data?.duplicates as Duplicate[]) ?? []);
        setSaving(false);
        return;
      }
      if (!res.ok || !data?.ok) {
        setSaveError(t("createFailed"));
        setSaving(false);
        return;
      }
      // Straight to the file, where the import runs with its progress on
      // screen. Landing back on the list would hide the one thing that still
      // needs watching.
      router.push(`/admin/orders/${data.id as string}`);
    } catch {
      setSaveError(t("createFailed"));
      setSaving(false);
    }
  }

  const canSubmit = client && (manual ? manualFields.lotNumber.trim().length > 0 : lot !== null);

  return (
    <div className="space-y-8">
      {/* ── 1. the car ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-char-200/70 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("lookup.legend")}
        </h2>
        <p className="mt-2 text-sm text-char-600">{t("lookup.hint")}</p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void doLookup();
              }
            }}
            placeholder={t("lookup.placeholder")}
            aria-label={t("lookup.placeholder")}
            className="w-full rounded-xl border border-char-200 bg-char-50 px-4 py-3 text-sm text-char-900 outline-none transition-colors placeholder:text-char-500 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
          />
          <button
            type="button"
            onClick={() => void doLookup()}
            disabled={looking || !term.trim()}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-char-200 bg-white px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700 disabled:opacity-50"
          >
            <MagnifyingGlass size={16} weight="bold" />
            {looking ? t("lookup.searching") : t("lookup.search")}
          </button>
        </div>

        {lookupError && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3">
            <p className="text-sm text-char-700">{lookupError}</p>
            <button
              type="button"
              onClick={() => setManual(true)}
              className="mt-2 text-sm font-semibold text-amber-700 underline-offset-4 hover:underline"
            >
              {t("lookup.manual")}
            </button>
          </div>
        )}

        {lot && !manual && (
          <div className="mt-4 rounded-xl border border-char-200 bg-char-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-char-900">
              <CheckCircle size={16} weight="fill" className="text-green-600" />
              {lot.title}
            </p>
            <p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-char-500">
              {lot.platform} · {lot.lotNumber}
              {lot.vin ? ` · ${lot.vin}` : ""}
            </p>
            <p className="mt-1 text-sm text-char-600">
              {[lot.auctionName, lot.primaryDamage, lot.titleClass].filter(Boolean).join(" · ")}
            </p>
            {media && (
              <p className="mt-2 text-sm text-char-700">
                {t("lookup.photos", { count: media.photos + media.videos })}
              </p>
            )}
          </div>
        )}

        {manual && (
          <div className="mt-4 space-y-3 rounded-xl border border-char-200 bg-char-50 p-4">
            <p className="text-xs text-char-600">{t("lookup.manualHint")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-char-600">{t("fields.platform")}</span>
                <select
                  value={manualFields.platform}
                  onChange={(e) => setManualFields({ ...manualFields, platform: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="copart">Copart</option>
                  <option value="iaai">IAAI</option>
                </select>
              </label>
              {(["lotNumber", "vin", "year", "make", "model"] as const).map((field) => (
                <label key={field} className="text-sm">
                  <span className="text-char-600">{t(`fields.${field}`)}</span>
                  <input
                    value={manualFields[field]}
                    onChange={(e) => setManualFields({ ...manualFields, [field]: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── the duplicate warning ──────────────────────────────────────── */}
      {duplicates.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5">
          <p className="flex items-start gap-2 font-semibold text-char-900">
            <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
            {t("duplicate.heading")}
          </p>
          {duplicates.map((d) => (
            <p key={d.reference} className="mt-2 text-sm leading-relaxed text-char-700">
              {t("duplicate.body", {
                reference: d.reference,
                client: d.clientName,
                date: d.createdAt.slice(0, 10),
              })}
            </p>
          ))}
        </section>
      )}

      {/* ── 2. the client ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-char-200/70 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("client.legend")}
        </h2>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={clientQuery}
            onChange={(e) => setClientQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void searchClients();
              }
            }}
            placeholder={t("client.placeholder")}
            aria-label={t("client.placeholder")}
            className="w-full rounded-xl border border-char-200 bg-char-50 px-4 py-3 text-sm text-char-900 outline-none transition-colors placeholder:text-char-500 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
          />
          <button
            type="button"
            onClick={() => void searchClients()}
            className="shrink-0 rounded-full border border-char-200 bg-white px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
          >
            {t("client.search")}
          </button>
        </div>

        {client && (
          <p className="mt-3 text-sm font-semibold text-green-800">
            {t("client.selected", { name: client.name })}
          </p>
        )}

        {clients !== null && clients.length === 0 && (
          <p className="mt-3 text-sm text-char-600">{t("client.empty")}</p>
        )}

        {clients && clients.length > 0 && (
          <div className="mt-3 space-y-2">
            {clients.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClient(c)}
                className={`block w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  client?.id === c.id
                    ? "border-amber-400 bg-amber-50"
                    : "border-char-200 bg-white hover:border-amber-300"
                }`}
              >
                <span className="font-semibold text-char-900">{c.name}</span>
                <span className="block text-char-600">{c.email}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {saveError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{saveError}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submit(duplicates.length > 0)}
          disabled={!canSubmit || saving}
          className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? t("submitting") : duplicates.length > 0 ? t("duplicate.continue") : t("submit")}
        </button>
        {!manual && (
          <button
            type="button"
            onClick={() => setManual(true)}
            className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline"
          >
            {t("lookup.manual")}
          </button>
        )}
      </div>
    </div>
  );
}
