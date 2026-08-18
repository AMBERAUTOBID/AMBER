"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, Clock } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "@/i18n/navigation";

export interface OrderDetails {
  titleReceivedAt: string | null;
  consigneeName: string | null;
  consigneeCompany: string | null;
  consigneePhone: string | null;
  consigneeEmail: string | null;
  consigneeAddress: string | null;
  consigneeCountry: string | null;
  containerNumber: string | null;
  billOfLading: string | null;
  vesselName: string | null;
  departurePort: string | null;
  destinationPort: string | null;
  etaAt: string | null;
  internalNote: string | null;
}

/**
 * The order's own facts: the title, who receives the car, the shipping
 * references, and the note the client never sees.
 *
 * Three panels rather than one long form, because they are answered by
 * different people at different times — the title by whoever opens the post,
 * the consignee by the client, the container by the forwarder — and a single
 * Save button would make each of them responsible for the others' blanks.
 */
export default function OrderDetailsEditor({
  orderId,
  details,
}: {
  orderId: string;
  details: OrderDetails;
}) {
  // Two namespaces on purpose: only the title and the consignee are new copy.
  // The shipping heading and the internal note already have wording elsewhere,
  // and a second copy of either would be free to drift from the first.
  const t = useTranslations("AdminOrders.details");
  const tc = useTranslations("AdminOrders");
  const tShip = useTranslations("Orders.shipping");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function send(action: string, payload: Record<string, unknown>) {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <TitlePanel
        received={details.titleReceivedAt}
        busy={busy === "titleReceived"}
        onSet={(receivedAt) => send("titleReceived", { receivedAt })}
      />

      <Panel title={t("consignee.heading")} hint={t("consignee.hint")}>
        <ConsigneeForm
          details={details}
          busy={busy === "consignee"}
          onSave={(values) => send("consignee", values)}
        />
      </Panel>

      <Panel title={tShip("heading")}>
        <ShippingForm
          details={details}
          busy={busy === "shipping"}
          onSave={(values) => send("shipping", values)}
        />
      </Panel>

      <Panel title={tc("internalNote.heading")} hint={tc("internalNote.hint")}>
        <NoteForm
          value={details.internalNote}
          busy={busy === "internalNote"}
          onSave={(note) => send("internalNote", { note })}
        />
      </Panel>
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-char-200 bg-white p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-char-500">{title}</h3>
      {hint && <p className="mt-1 text-xs text-char-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * Has the physical title arrived?
 *
 * A single, prominent yes/no with a date, and **reversible**. It gets ticked
 * off a courier notification and then the envelope turns out to hold the wrong
 * car's paperwork; a one-way flag would leave the file claiming the export is
 * unblocked when it is not.
 */
function TitlePanel({
  received,
  busy,
  onSet,
}: {
  received: string | null;
  busy: boolean;
  onSet: (receivedAt: string | null) => void;
}) {
  const t = useTranslations("AdminOrders.details.title");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  if (received) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50/60 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-green-900">
          <CheckCircle size={17} weight="fill" />
          {t("received", { date: received.slice(0, 10) })}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSet(null)}
          className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-50"
        >
          {t("undo")}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-char-900">
        <Clock size={17} weight="fill" className="text-amber-600" />
        {t("waiting")}
      </p>
      <p className="mt-1 text-xs text-char-600">{t("hint")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => onSet(new Date(`${date}T12:00:00Z`).toISOString())}
          className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
        >
          {t("mark")}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  wide,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
  rows?: number;
}) {
  return (
    <label className={`text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-char-600">{label}</span>
      {rows ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
        />
      )}
    </label>
  );
}

function SaveButton({ busy, label, saving, onClick }: { busy: boolean; label: string; saving: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="mt-3 rounded-full border border-char-200 bg-white px-4 py-2 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700 disabled:opacity-50"
    >
      {busy ? saving : label}
    </button>
  );
}

function ConsigneeForm({
  details,
  busy,
  onSave,
}: {
  details: OrderDetails;
  busy: boolean;
  onSave: (v: Record<string, string>) => void;
}) {
  const t = useTranslations("AdminOrders.details.consignee");
  const tc = useTranslations("AdminOrders");
  const [v, setV] = useState({
    name: details.consigneeName ?? "",
    company: details.consigneeCompany ?? "",
    phone: details.consigneePhone ?? "",
    email: details.consigneeEmail ?? "",
    address: details.consigneeAddress ?? "",
    country: details.consigneeCountry ?? "",
  });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("name")} value={v.name} onChange={(x) => setV({ ...v, name: x })} />
        <Field label={t("company")} value={v.company} onChange={(x) => setV({ ...v, company: x })} />
        <Field label={t("phone")} value={v.phone} onChange={(x) => setV({ ...v, phone: x })} />
        <Field label={t("email")} value={v.email} onChange={(x) => setV({ ...v, email: x })} />
        <Field label={t("country")} value={v.country} onChange={(x) => setV({ ...v, country: x })} />
        <Field
          label={t("address")}
          value={v.address}
          onChange={(x) => setV({ ...v, address: x })}
          wide
          rows={3}
        />
      </div>
      <SaveButton busy={busy} label={tc("costs.save")} saving={tc("stage.saving")} onClick={() => onSave(v)} />
    </>
  );
}

function ShippingForm({
  details,
  busy,
  onSave,
}: {
  details: OrderDetails;
  busy: boolean;
  onSave: (v: Record<string, string>) => void;
}) {
  const t = useTranslations("Orders.shipping");
  const tc = useTranslations("AdminOrders");
  const [v, setV] = useState({
    containerNumber: details.containerNumber ?? "",
    billOfLading: details.billOfLading ?? "",
    vesselName: details.vesselName ?? "",
    departurePort: details.departurePort ?? "",
    destinationPort: details.destinationPort ?? "",
    etaAt: details.etaAt?.slice(0, 10) ?? "",
  });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("container")} value={v.containerNumber} onChange={(x) => setV({ ...v, containerNumber: x })} />
        <Field label={t("billOfLading")} value={v.billOfLading} onChange={(x) => setV({ ...v, billOfLading: x })} />
        <Field label={t("vessel")} value={v.vesselName} onChange={(x) => setV({ ...v, vesselName: x })} />
        <Field label={t("departurePort")} value={v.departurePort} onChange={(x) => setV({ ...v, departurePort: x })} />
        <Field label={t("destinationPort")} value={v.destinationPort} onChange={(x) => setV({ ...v, destinationPort: x })} />
        <label className="text-sm">
          <span className="text-char-600">{t("eta")}</span>
          <input
            type="date"
            value={v.etaAt}
            onChange={(e) => setV({ ...v, etaAt: e.target.value })}
            className="mt-1 w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
      <SaveButton
        busy={busy}
        label={tc("costs.save")}
        saving={tc("stage.saving")}
        onClick={() =>
          onSave({ ...v, etaAt: v.etaAt ? new Date(`${v.etaAt}T12:00:00Z`).toISOString() : "" })
        }
      />
    </>
  );
}

function NoteForm({
  value,
  busy,
  onSave,
}: {
  value: string | null;
  busy: boolean;
  onSave: (note: string) => void;
}) {
  const tc = useTranslations("AdminOrders");
  const [note, setNote] = useState(value ?? "");
  return (
    <>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        className="w-full rounded-xl border border-char-200 bg-white px-3 py-2 text-sm"
      />
      <SaveButton busy={busy} label={tc("costs.save")} saving={tc("stage.saving")} onClick={() => onSave(note)} />
    </>
  );
}
