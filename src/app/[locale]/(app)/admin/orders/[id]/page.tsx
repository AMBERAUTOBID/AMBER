import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FileText, FilmSlate, Image as ImageIcon } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import {
  auctionImportSummary,
  getOrder,
  listCostLines,
  listOrderFiles,
  listPayments,
  listStageEvents,
} from "@/modules/orders/model/orders";
import { orderTitle } from "@/modules/orders/model/orderSnapshot";
import { ORDER_STAGES, hasReached, stageProgress } from "@/modules/orders/model/stages";
import { signFiles } from "@/modules/orders/api/signFiles";
import StageBadge from "@/modules/orders/components/StageBadge";
import ImportProgress from "@/modules/orders/components/ImportProgress";
import StageEditor from "@/modules/orders/components/StageEditor";
import FileUploader from "@/modules/orders/components/FileUploader";
import MoneyEditor from "@/modules/orders/components/MoneyEditor";
import AdminSection from "@/modules/admin/components/AdminSection";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AdminOrders" });
  return { title: t("heading"), robots: { index: false } };
}

/**
 * One case file, as staff see it: everything, including what the client
 * cannot.
 *
 * This first version reads. Editing a stage, uploading files and entering
 * costs come next; what it already proves is the part that could not be
 * proved any other way — that a real lot becomes a real file with its real
 * photographs stored somewhere we control.
 */
export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await currentAdmin();
  if (!user) notFound();
  if (!UUID.test(id)) notFound();

  const order = await getOrder(id);
  if (!order) notFound();

  const t = await getTranslations({ locale, namespace: "AdminOrders" });
  const tOrders = await getTranslations({ locale, namespace: "Orders" });

  const [files, events, importState, costs, payments] = await Promise.all([
    listOrderFiles(id),
    listStageEvents(id),
    auctionImportSummary(id),
    listCostLines(id),
    listPayments(id),
  ]);

  const signed = await signFiles(files);
  const byStage = new Map<string, typeof signed>();
  for (const file of signed) {
    const list = byStage.get(file.stage) ?? [];
    list.push(file);
    byStage.set(file.stage, list);
  }

  const progress = stageProgress(order.stage);
  const eventByStage = new Map(events.map((e) => [e.stage, e]));

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/orders"
        className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline"
      >
        ← {t("heading")}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
            {orderTitle(order)}
          </h1>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-sm text-char-500">
            {order.reference} · {order.platform} {order.lotNumber}
            {order.vin ? ` · ${order.vin}` : ""}
          </p>
        </div>
        <StageBadge stage={order.stage} />
      </div>

      <p className="mt-2 text-sm text-char-600">
        {tOrders("progress", progress)}
      </p>

      {/* The import is the only thing on this page that is still happening,
          so it sits at the top until it is finished. */}
      {importState.total > 0 && importState.remaining + importState.failed > 0 && (
        <div className="mt-6 rounded-2xl border border-char-200/70 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
            {t("import.heading")}
          </h2>
          <div className="mt-4">
            <ImportProgress
              orderId={id}
              initialRemaining={importState.remaining}
              initialFailed={importState.failed}
              total={importState.total}
            />
          </div>
        </div>
      )}

      <div className="mt-8">
        <AdminSection title={tOrders("stage.won")}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Fact label={tOrders("lotNumber")} value={order.lotNumber} />
            <Fact label={tOrders("vin")} value={order.vin} />
            <Fact
              label={tOrders("odometer")}
              value={
                order.odometer !== null
                  ? `${order.odometer.toLocaleString(locale)} ${order.odometerUnit ?? ""}`.trim()
                  : null
              }
            />
            <Fact label={tOrders("damage")} value={order.primaryDamage} />
            <Fact label={tOrders("document")} value={order.docType} />
            <Fact
              label={tOrders("keys")}
              value={
                order.hasKeys === null
                  ? null
                  : order.hasKeys
                    ? tOrders("keysYes")
                    : tOrders("keysNo")
              }
            />
          </dl>
        </AdminSection>

        {/* The timeline. Stages that have not been reached are drawn faint
            rather than hidden, so the whole route is visible from the start —
            an operator planning work needs to see what is still ahead. */}
        <AdminSection title={t("stage.heading")}>
          {/* The editor sits above the timeline rather than inside a stage:
              recording an event and moving the car are one action, and the
              stage it applies to is a field in it. */}
          <StageEditor orderId={id} currentStage={order.stage} />

          <ol className="mt-6 space-y-6">
            {ORDER_STAGES.map((stage) => {
              const reached = hasReached(order.stage, stage);
              const event = eventByStage.get(stage);
              const stageFiles = byStage.get(stage) ?? [];
              return (
                <li key={stage} className={reached ? "" : "opacity-45"}>
                  <p className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-char-900">
                    {tOrders(`stage.${stage}`)}
                    {event && (
                      <span className="font-normal text-xs text-char-500">
                        {event.happenedAt.toISOString().slice(0, 10)}
                      </span>
                    )}
                    {!reached && (
                      <span className="font-normal text-xs text-char-400">
                        {tOrders("stagePending")}
                      </span>
                    )}
                  </p>
                  {event?.note && (
                    <p className="mt-1 text-sm text-char-600">
                      {!event.noteVisibleToClient && (
                        <span className="mr-1 rounded bg-char-100 px-1.5 py-0.5 text-xs font-semibold text-char-600">
                          {t("stage.hiddenFromClient")}
                        </span>
                      )}
                      {event.note}
                    </p>
                  )}
                  {stageFiles.length > 0 && <FileStrip files={stageFiles} />}
                  {/* Every stage takes files, including ones the car has not
                      reached yet — documents often arrive before the event
                      they belong to. */}
                  <FileUploader orderId={id} stage={stage} />
                </li>
              );
            })}
          </ol>
        </AdminSection>

        <AdminSection title={t("costs.heading")}>
          <MoneyEditor
            orderId={id}
            locale={locale}
            rateMicros={order.usdToEurMicros}
            rateSetAt={order.rateSetAt?.toISOString() ?? null}
            costs={costs.map((c) => ({
              id: c.id,
              kind: c.kind,
              label: c.label,
              amountCents: c.amountCents,
              currency: c.currency,
              visibleToClient: c.visibleToClient,
            }))}
            payments={payments.map((p) => ({
              id: p.id,
              amountCents: p.amountCents,
              currency: p.currency,
              // ISO across the boundary — Dates don't survive it intact.
              paidAt: p.paidAt.toISOString(),
              method: p.method,
              reference: p.reference,
              visibleToClient: p.visibleToClient,
            }))}
          />
        </AdminSection>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-char-500">{label}</dt>
      {/* An em dash rather than a blank: "we do not know" is information, and
          an empty cell reads as a rendering bug. */}
      <dd className="mt-0.5 text-char-900">{value || "—"}</dd>
    </div>
  );
}

function FileStrip({
  files,
}: {
  files: Array<{ id: string; kind: string; url: string | null; fileName: string }>;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {files.map((file) => {
        if (file.kind === "photo" && file.url) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={file.id}
              src={file.url}
              alt={file.fileName}
              loading="lazy"
              className="h-16 w-24 rounded-lg object-cover"
            />
          );
        }
        const Icon = file.kind === "video" ? FilmSlate : file.kind === "photo" ? ImageIcon : FileText;
        return (
          <a
            key={file.id}
            href={file.url ?? undefined}
            className="inline-flex h-16 w-24 items-center justify-center rounded-lg border border-char-200 bg-char-50 text-char-500 transition-colors hover:border-amber-400"
            title={file.fileName}
          >
            <Icon size={20} />
          </a>
        );
      })}
    </div>
  );
}
