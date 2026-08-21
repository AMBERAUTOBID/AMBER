"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import {
  inputClass,
  labelClass,
  submitClass,
  errorBoxClass,
  successBoxClass,
} from "@/modules/auth/components/formStyles";
import {
  SHIPPING_PORTS,
  normalizeShippingProfile,
  shippingProfileErrors,
  type ShippingProfileValues,
} from "@/modules/account/model/shippingProfileRules";

/**
 * The shipping profile form — the client's half of the Aivi order.
 *
 * It imports the RULES module, never the DB one: the same split as
 * `passwordPolicy`, and for the same crash. Live validation here and the
 * server's verdict are therefore one spelling of the truth.
 *
 * Saving a draft is always allowed; what the missing fields cost is the gate
 * staying shut, and the strip above the form says exactly that.
 */

interface Props {
  initial: ShippingProfileValues;
}

type FieldKey =
  | "buyerName"
  | "companyCode"
  | "vatCode"
  | "buyerCountry"
  | "buyerPhone"
  | "buyerAddress"
  | "receiverName"
  | "receiverPhone"
  | "receiverEmail"
  | "receiverAddress"
  | "receiverCountry";

export default function ShippingProfileForm({ initial }: Props) {
  const t = useTranslations("Account.shipping");

  const [buyerType, setBuyerType] = useState<"person" | "company">(initial.buyerType);
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    buyerName: initial.buyerName ?? "",
    companyCode: initial.companyCode ?? "",
    vatCode: initial.vatCode ?? "",
    buyerCountry: initial.buyerCountry ?? "",
    buyerPhone: initial.buyerPhone ?? "",
    buyerAddress: initial.buyerAddress ?? "",
    receiverName: initial.receiverName ?? "",
    receiverPhone: initial.receiverPhone ?? "",
    receiverEmail: initial.receiverEmail ?? "",
    receiverAddress: initial.receiverAddress ?? "",
    receiverCountry: initial.receiverCountry ?? "",
  });
  const [destinationPort, setDestinationPort] = useState(initial.destinationPort ?? "");
  const [receiverSame, setReceiverSame] = useState(initial.receiverSame);
  // Hidden from the form for now (owner, 2026-08-20) — the 1% insurance
  // offer waits until Aivi answer what the 1% is OF. The stored value still
  // rides through every save unchanged, so nothing is lost or invented.
  const insurance = initial.insurance;
  const [shareContainer, setShareContainer] = useState(initial.shareContainer);
  const [paymentRail, setPaymentRail] = useState<string>(initial.paymentRail ?? "");
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  /**
   * Set the first time Save is pressed. Until then missing fields stay
   * neutral — painting half the form red while somebody is still typing
   * their name punishes them for not being done yet. After an attempt the
   * gaps light up and stay lit, going quiet one by one as they are filled.
   */
  const [attempted, setAttempted] = useState(false);

  const set = (key: FieldKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [key]: e.target.value }));
    setState("idle");
  };

  /** The submission as the server will see it — one normalise, both sides. */
  const values = useMemo(
    () =>
      normalizeShippingProfile({
        buyerType,
        destinationPort,
        receiverSame,
        insurance,
        shareContainer,
        paymentRail,
        ...fields,
      }),
    [buyerType, destinationPort, receiverSame, insurance, shareContainer, paymentRail, fields]
  );
  const missing = useMemo(() => shippingProfileErrors(values), [values]);

  /** Red border that outranks inputClass's own — hence the importants. */
  const alarm = " !border-red-400 !bg-red-50/40 ring-1 ring-red-200";

  const bad = (key: string): boolean => attempted && (missing as string[]).includes(key);
  const field = (key: string): string => (bad(key) ? inputClass + alarm : inputClass);
  const mark = (key: string): string => (bad(key) ? labelClass + " !text-red-700" : labelClass);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setState("busy");
    try {
      const res = await fetch("/api/account/shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerType,
          destinationPort,
          receiverSame,
          insurance,
          shareContainer,
          paymentRail,
          ...fields,
        }),
      });
      setState(res.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  }

  const sectionClass = "mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5";
  const headingClass = "text-sm font-semibold uppercase tracking-wide text-char-500";
  const segActive = "border-amber-600 bg-amber-50 text-amber-700 ring-1 ring-amber-600";
  const segIdle = "border-char-200 bg-white text-char-500 hover:border-char-300";
  const segClass = "flex-1 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition";

  return (
    <form onSubmit={submit}>
      {/* ── 1 · who buys ──────────────────────────────────────────────── */}
      <section className={sectionClass}>
        <h2 className={headingClass}>{t("buyer.heading")}</h2>
        <p className="mt-1 text-sm text-char-500">{t("buyer.exactly")}</p>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setBuyerType("person")}
            className={`${segClass} ${buyerType === "person" ? segActive : segIdle}`}
          >
            {t("buyer.person")}
          </button>
          <button
            type="button"
            onClick={() => setBuyerType("company")}
            className={`${segClass} ${buyerType === "company" ? segActive : segIdle}`}
          >
            {t("buyer.company")}
          </button>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="ship-buyer-name" className={mark("buyerName")}>
              {buyerType === "company" ? t("buyer.companyName") : t("buyer.fullName")} *
            </label>
            <input
              id="ship-buyer-name"
              className={field("buyerName")}
              value={fields.buyerName}
              onChange={set("buyerName")}
              autoComplete="name"
            />
          </div>

          {buyerType === "company" ? (
            <>
              <div>
                <label htmlFor="ship-company-code" className={mark("companyCode")}>
                  {t("buyer.companyCode")} *
                </label>
                <input
                  id="ship-company-code"
                  className={field("companyCode")}
                  value={fields.companyCode}
                  onChange={set("companyCode")}
                />
              </div>
              <div>
                <label htmlFor="ship-vat-code" className={labelClass}>
                  {t("buyer.vatCode")}
                </label>
                <input
                  id="ship-vat-code"
                  className={inputClass}
                  value={fields.vatCode}
                  onChange={set("vatCode")}
                />
              </div>
            </>
          ) : null}

          <div>
            <label htmlFor="ship-buyer-country" className={mark("buyerCountry")}>
              {t("buyer.country")} *
            </label>
            <input
              id="ship-buyer-country"
              className={field("buyerCountry")}
              value={fields.buyerCountry}
              onChange={set("buyerCountry")}
              autoComplete="country-name"
            />
          </div>
          <div>
            <label htmlFor="ship-buyer-phone" className={mark("buyerPhone")}>
              {t("buyer.phone")} *
            </label>
            <input
              id="ship-buyer-phone"
              className={field("buyerPhone")}
              value={fields.buyerPhone}
              onChange={set("buyerPhone")}
              autoComplete="tel"
              placeholder="+370"
            />
            <p className="mt-1 text-xs text-char-500">{t("buyer.phoneHint")}</p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="ship-buyer-address" className={mark("buyerAddress")}>
              {t("buyer.address")} *
            </label>
            <textarea
              id="ship-buyer-address"
              rows={3}
              className={field("buyerAddress")}
              value={fields.buyerAddress}
              onChange={set("buyerAddress")}
              autoComplete="street-address"
              placeholder={t("buyer.addressPlaceholder")}
            />
          </div>
        </div>
      </section>

      {/* ── 2 · where the car goes ────────────────────────────────────── */}
      <section className={sectionClass}>
        <h2 className={headingClass}>{t("destination.heading")}</h2>
        <p className="mt-1 text-sm text-char-500">{t("destination.note")}</p>

        <div className="mt-4 max-w-sm">
          <label htmlFor="ship-port" className={mark("destinationPort")}>
            {t("destination.port")} *
          </label>
          <select
            id="ship-port"
            className={field("destinationPort")}
            value={destinationPort}
            onChange={(e) => {
              setDestinationPort(e.target.value);
              setState("idle");
            }}
          >
            <option value="">{t("destination.portUnset")}</option>
            {SHIPPING_PORTS.map((port) => (
              <option key={port} value={port}>
                {port}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ── 3 · who receives it ───────────────────────────────────────── */}
      <section className={sectionClass}>
        <h2 className={headingClass}>{t("receiver.heading")}</h2>
        <p className="mt-1 text-sm text-char-500">{t("receiver.note")}</p>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setReceiverSame(true)}
            className={`${segClass} ${receiverSame ? segActive : segIdle}`}
          >
            {t("receiver.same")}
          </button>
          <button
            type="button"
            onClick={() => setReceiverSame(false)}
            className={`${segClass} ${!receiverSame ? segActive : segIdle}`}
          >
            {t("receiver.other")}
          </button>
        </div>

        {!receiverSame ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="ship-recv-name" className={mark("receiverName")}>
                {t("receiver.name")} *
              </label>
              <input
                id="ship-recv-name"
                className={field("receiverName")}
                value={fields.receiverName}
                onChange={set("receiverName")}
              />
              <p className="mt-1 text-xs text-char-500">{t("receiver.nameHint")}</p>
            </div>
            <div>
              <label htmlFor="ship-recv-country" className={mark("receiverCountry")}>
                {t("receiver.country")} *
              </label>
              <input
                id="ship-recv-country"
                className={field("receiverCountry")}
                value={fields.receiverCountry}
                onChange={set("receiverCountry")}
              />
            </div>
            <div>
              <label htmlFor="ship-recv-phone" className={mark("receiverPhone")}>
                {t("receiver.phone")} *
              </label>
              <input
                id="ship-recv-phone"
                className={field("receiverPhone")}
                value={fields.receiverPhone}
                onChange={set("receiverPhone")}
                placeholder="+370"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ship-recv-email" className={labelClass}>
                {t("receiver.email")}
              </label>
              <input
                id="ship-recv-email"
                type="email"
                className={inputClass}
                value={fields.receiverEmail}
                onChange={set("receiverEmail")}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ship-recv-address" className={mark("receiverAddress")}>
                {t("receiver.address")} *
              </label>
              <textarea
                id="ship-recv-address"
                rows={3}
                className={field("receiverAddress")}
                value={fields.receiverAddress}
                onChange={set("receiverAddress")}
              />
            </div>
          </div>
        ) : null}
      </section>

      {/* ── 4 · preferences ───────────────────────────────────────────── */}
      <section className={sectionClass}>
        <h2 className={headingClass}>{t("prefs.heading")}</h2>
        <p className="mt-1 text-sm text-char-500">{t("prefs.note")}</p>

        <div className="mt-4 divide-y divide-char-100">
          <label className="flex cursor-pointer items-start gap-3 py-4">
            <input
              type="checkbox"
              checked={shareContainer}
              onChange={(e) => setShareContainer(e.target.checked)}
              className="mt-1 h-4 w-4 accent-amber-600"
            />
            <span>
              <span className="block text-sm font-semibold text-char-800">
                {t("prefs.shareContainer")}
              </span>
              <span className="block text-sm text-char-500">{t("prefs.shareContainerNote")}</span>
            </span>
          </label>
        </div>

        {/* The payment rail — the question that saves a day at 23:40. */}
        <div className="mt-2 border-t border-char-100 pt-5">
          <span className={mark("paymentRail")}>{t("prefs.rail")} *</span>
          <p className="mt-1 text-sm text-char-500">{t("prefs.railWhy")}</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setPaymentRail("wise")}
              className={`${segClass} ${paymentRail === "wise" ? segActive : segIdle}${bad("paymentRail") ? " !border-red-400 ring-1 ring-red-200" : ""}`}
            >
              {t("prefs.railWise")}
              <span className="mt-1 block text-xs font-normal">{t("prefs.railWiseNote")}</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentRail("bank")}
              className={`${segClass} ${paymentRail === "bank" ? segActive : segIdle}${bad("paymentRail") ? " !border-red-400 ring-1 ring-red-200" : ""}`}
            >
              {t("prefs.railBank")}
              <span className="mt-1 block text-xs font-normal">{t("prefs.railBankNote")}</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── save ──────────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col gap-4">
        {state === "saved" ? (
          <p className={successBoxClass}>
            <CheckCircle size={18} weight="fill" className="inline align-[-3px]" />{" "}
            {missing.length === 0 ? t("savedComplete") : t("savedDraft", { count: missing.length })}
          </p>
        ) : null}
        {state === "error" ? (
          <p className={errorBoxClass}>
            <WarningCircle size={18} weight="fill" className="inline align-[-3px]" />{" "}
            {t("saveFailed")}
          </p>
        ) : null}

        <div className="flex items-center gap-4">
          <button type="submit" disabled={state === "busy"} className={submitClass}>
            {state === "busy" ? t("saving") : t("save")}
          </button>
          {missing.length > 0 ? (
            <span
              className={
                attempted ? "text-sm font-semibold text-red-700" : "text-sm text-char-500"
              }
            >
              {t("missingCount", { count: missing.length })}
            </span>
          ) : (
            <span className="text-sm font-medium text-emerald-700">{t("allDone")}</span>
          )}
        </div>
      </div>
    </form>
  );
}
