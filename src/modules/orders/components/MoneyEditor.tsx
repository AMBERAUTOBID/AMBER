"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash, EyeSlash } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "@/i18n/navigation";
import {
  formatMoney,
  formatRate,
  orderMoney,
  parseAmountToCents,
  parseRateToMicros,
  ORDER_COST_KINDS,
  type OrderCurrency,
} from "../model/money";

const METHODS = ["bank_transfer", "cash", "other"] as const;

export interface CostRow {
  id: string;
  kind: string;
  label: string | null;
  amountCents: number;
  currency: OrderCurrency;
  visibleToClient: boolean;
}

export interface PaymentRow {
  id: string;
  amountCents: number;
  currency: OrderCurrency;
  paidAt: string;
  method: string;
  reference: string | null;
  visibleToClient: boolean;
}

/**
 * What the car costs, what has come in, and the rate that reconciles them.
 *
 * **The amount is parsed here, in front of the person who typed it**, and only
 * an integer number of cents is sent. That is deliberate: `1.420,50` and
 * `1,420.50` are the same money written two ways, and resolving them out of
 * sight on the server is how a comma becomes a factor of a hundred with nobody
 * to notice. Here the understood figure is echoed back under the field before
 * anything is saved.
 *
 * The totals shown are computed by the SAME function the client's page uses,
 * so an admin is looking at the number the client will see — including the
 * refusal to total a mixed-currency file with no rate set.
 */
export default function MoneyEditor({
  orderId,
  costs,
  payments,
  rateMicros,
  rateSetAt,
  locale,
}: {
  orderId: string;
  costs: CostRow[];
  payments: PaymentRow[];
  rateMicros: number | null;
  rateSetAt: string | null;
  locale: string;
}) {
  const t = useTranslations("AdminOrders.costs");
  const tp = useTranslations("AdminOrders.payments");
  const tk = useTranslations("Orders.costKind");
  const tm = useTranslations("Orders.payments.method");
  const tOrders = useTranslations("Orders.costs");
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const money = orderMoney(costs, payments, rateMicros);

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/money`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) router.refresh();
      return res.ok;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── the rate ─────────────────────────────────────────────────── */}
      <RateField
        current={rateMicros}
        setAt={rateSetAt}
        label={t("rate")}
        hint={t("rateHint")}
        save={t("save")}
        busy={busy}
        onSave={(micros) => send({ action: "setRate", usdToEurMicros: micros })}
      />

      {/* ── cost lines ───────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("heading")}
        </h3>

        {costs.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <tbody>
              {costs.map((line) => (
                <tr key={line.id} className="border-b border-char-100 last:border-0">
                  <td className="py-2 text-char-700">
                    {line.label || tk(line.kind)}
                    {!line.visibleToClient && (
                      <EyeSlash size={13} className="ml-1.5 inline text-char-500" />
                    )}
                  </td>
                  <td className="py-2 text-right font-medium text-char-900">
                    {formatMoney(line.amountCents, line.currency, locale)}
                  </td>
                  <td className="w-8 py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void send({ action: "deleteCost", rowId: line.id })}
                      aria-label={t("delete")}
                      className="text-char-500 transition-colors hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <AmountForm
          kinds={ORDER_COST_KINDS}
          kindLabel={(k) => tk(k)}
          labels={{ kind: t("kind"), label: t("label"), amount: t("amount"), currency: t("currency"), add: t("add"), visible: t("visibleToClient") }}
          busy={busy}
          locale={locale}
          onAdd={(values) =>
            send({
              action: "addCost",
              kind: values.kind,
              label: values.label,
              amountCents: values.amountCents,
              currency: values.currency,
              visibleToClient: values.visible,
            })
          }
        />
      </div>

      {/* ── totals, exactly as the client will see them ──────────────── */}
      <dl className="space-y-1 rounded-xl bg-char-50 p-4 text-sm">
        <Line
          label={tOrders("total")}
          value={
            money.cost.totalEur !== null
              ? formatMoney(money.cost.totalEur, "EUR", locale)
              : formatMoney(money.cost.usdOnly, "USD", locale)
          }
        />
        <Line
          label={tOrders("paid")}
          value={
            money.paid.totalEur !== null
              ? formatMoney(money.paid.totalEur, "EUR", locale)
              : formatMoney(money.paid.usdOnly, "USD", locale)
          }
        />
        {money.settled ? (
          <p className="pt-1 font-semibold text-green-800">{tOrders("settled")}</p>
        ) : money.balanceEur !== null ? (
          <Line label={tOrders("balance")} value={formatMoney(money.balanceEur, "EUR", locale)} strong />
        ) : (
          // The honest state: a mixed-currency file with no rate cannot be
          // totalled, and saying so beats printing a partial sum.
          <p className="pt-1 text-xs text-amber-700">{t("rateHint")}</p>
        )}
      </dl>

      {/* ── payments ─────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {tp("heading")}
        </h3>

        {payments.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="text-char-600">
                  {p.paidAt.slice(0, 10)} · {tm(p.method)}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-char-900">
                    {formatMoney(p.amountCents, p.currency, locale)}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send({ action: "deletePayment", rowId: p.id })}
                    aria-label={tp("delete")}
                    className="text-char-500 transition-colors hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <PaymentForm
          methods={METHODS}
          methodLabel={(m) => tm(m)}
          labels={{ amount: tp("amount"), paidAt: tp("paidAt"), method: tp("method"), reference: tp("reference"), add: tp("add") }}
          busy={busy}
          locale={locale}
          onAdd={(values) => send({ action: "addPayment", ...values })}
        />
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "font-semibold text-char-900" : "text-char-600"}>{label}</dt>
      <dd className={strong ? "font-semibold text-char-900" : "text-char-900"}>{value}</dd>
    </div>
  );
}

function RateField({
  current,
  setAt,
  label,
  hint,
  save,
  busy,
  onSave,
}: {
  current: number | null;
  setAt: string | null;
  label: string;
  hint: string;
  save: string;
  busy: boolean;
  onSave: (micros: number) => void;
}) {
  const [value, setValue] = useState(current ? formatRate(current) : "");
  const parsed = parseRateToMicros(value);

  return (
    <div className="rounded-xl border border-char-200 bg-char-50 p-4">
      <label className="block text-sm">
        <span className="text-char-600">{label}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          placeholder="0.9250"
          className="mt-1 w-40 rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <p className="mt-1 text-xs text-char-500">{hint}</p>
      {value && parsed === null && (
        // Shown before saving is possible, so a misplaced decimal is caught by
        // the person who made it rather than by a client reading their balance.
        <p className="mt-1 text-xs text-red-700">0.1 – 10</p>
      )}
      {setAt && (
        <p className="mt-1 text-xs text-char-500">{setAt.slice(0, 10)}</p>
      )}
      <button
        type="button"
        disabled={busy || parsed === null}
        onClick={() => parsed !== null && onSave(parsed)}
        className="mt-2 rounded-full border border-char-200 bg-white px-4 py-2 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700 disabled:opacity-50"
      >
        {save}
      </button>
    </div>
  );
}

function AmountForm({
  kinds,
  kindLabel,
  labels,
  busy,
  locale,
  onAdd,
}: {
  kinds: readonly string[];
  kindLabel: (kind: string) => string;
  labels: Record<"kind" | "label" | "amount" | "currency" | "add" | "visible", string>;
  busy: boolean;
  locale: string;
  onAdd: (v: {
    kind: string;
    label: string | null;
    amountCents: number;
    currency: OrderCurrency;
    visible: boolean;
  }) => Promise<boolean>;
}) {
  const [kind, setKind] = useState(kinds[0]!);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<OrderCurrency>("USD");
  const [visible, setVisible] = useState(true);

  const cents = parseAmountToCents(amount);

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-char-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-char-600">{labels.kind}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="text-char-600">{labels.label}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm">
          <span className="text-char-600">{labels.amount}</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1420,50"
            className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
          />
          {/* Echoes what was understood, before anything is saved. This is the
              whole defence against a comma meaning two different things. */}
          {amount && (
            <span
              className={`mt-1 block text-xs ${cents === null ? "text-red-700" : "text-char-500"}`}
            >
              {cents === null ? "—" : formatMoney(cents, currency, locale)}
            </span>
          )}
        </label>

        <label className="text-sm">
          <span className="text-char-600">{labels.currency}</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as OrderCurrency)}
            className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-char-700">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        {labels.visible}
      </label>

      <button
        type="button"
        disabled={busy || cents === null}
        onClick={async () => {
          if (cents === null) return;
          const done = await onAdd({ kind, label: label.trim() || null, amountCents: cents, currency, visible });
          if (done) {
            setAmount("");
            setLabel("");
          }
        }}
        className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
      >
        <Plus size={14} weight="bold" />
        {labels.add}
      </button>
    </div>
  );
}

function PaymentForm({
  methods,
  methodLabel,
  labels,
  busy,
  locale,
  onAdd,
}: {
  methods: readonly string[];
  methodLabel: (m: string) => string;
  labels: Record<"amount" | "paidAt" | "method" | "reference" | "add", string>;
  busy: boolean;
  locale: string;
  onAdd: (v: Record<string, unknown>) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<OrderCurrency>("USD");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(methods[0]!);
  const [reference, setReference] = useState("");

  const cents = parseAmountToCents(amount);

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-char-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-char-600">{labels.amount}</span>
          <div className="mt-1 flex gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="500,00"
              className="w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as OrderCurrency)}
              className="rounded-xl border border-char-200 bg-white px-2 py-2 text-sm"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          {amount && (
            <span
              className={`mt-1 block text-xs ${cents === null ? "text-red-700" : "text-char-500"}`}
            >
              {cents === null ? "—" : formatMoney(cents, currency, locale)}
            </span>
          )}
        </label>

        <label className="text-sm">
          <span className="text-char-600">{labels.paidAt}</span>
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm">
          <span className="text-char-600">{labels.method}</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
          >
            {methods.map((m) => (
              <option key={m} value={m}>
                {methodLabel(m)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="text-char-600">{labels.reference}</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={busy || cents === null}
        onClick={async () => {
          if (cents === null) return;
          const done = await onAdd({
            amountCents: cents,
            currency,
            // Midday, for the same reason the stage date is: a date stored at
            // midnight becomes the previous day west of UTC.
            paidAt: new Date(`${paidAt}T12:00:00Z`).toISOString(),
            method,
            reference: reference.trim() || null,
          });
          if (done) {
            setAmount("");
            setReference("");
          }
        }}
        className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
      >
        <Plus size={14} weight="bold" />
        {labels.add}
      </button>
    </div>
  );
}
