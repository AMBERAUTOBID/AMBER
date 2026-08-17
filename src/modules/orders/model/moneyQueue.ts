/**
 * The admin money list: who owes what, and what to do about each of them.
 *
 * ── WHY THIS IS A SEPARATE SCREEN FROM `/admin/orders` ──────────────────
 * The vehicle list answers "where is this car?" and sorts by when the file was
 * opened. Money asks a different question with a different clock: a car that
 * arrives next month can be perfectly fine while a car won last night is four
 * hours from a Copart late fee. Sorting by creation date buries exactly the
 * row that needed reading first, and the two orders can never be the same one.
 *
 * ── THE THREE LISTS, AND WHY THEY ARE NOT ONE ───────────────────────────
 * Each row here wants a *different action*, and a single sorted list would mix
 * them so that the operator has to read every line to find out which:
 *
 *   1. `notInvoiced`  — we have not priced the car. **Our** failure, and the
 *                       one that blocks everything: the client cannot pay a
 *                       figure nobody has sent them, while their deadline runs.
 *   2. `declared`     — the client says the wire has left. Action: look in the
 *                       bank, then record the payment. Not a chase.
 *   3. `owed`         — money is outstanding and nobody has said anything.
 *                       Action: chase, hardest at the top.
 *
 * The buckets are mutually exclusive, so the counts beside the headings add up
 * to the number of unsettled files — a total that would be a lie if a declared
 * order also appeared in the chase list.
 *
 * ── AND WHY SETTLED ORDERS ARE ABSENT ENTIRELY ──────────────────────────
 * A queue that lists finished work stops being a queue. `/admin/orders` is
 * where every file lives; this is only what is unresolved, and an empty page
 * here is the correct and desirable state.
 */
import { orderMoney, type MoneyRow, type OrderCurrency } from "./money";
import { paymentStatus, type PaymentStatus } from "./payment";

/**
 * One order's money, already aggregated by the database.
 *
 * The sums arrive **per currency** rather than as individual rows, and that is
 * safe for one specific reason: `orderMoney` only ever adds cost lines up
 * within a currency, so one row carrying the total is indistinguishable from
 * fifty rows carrying the parts. `costLineCount` and `paymentCount` are passed
 * separately because they are not sums — `settled` and the short-payment
 * tolerance both depend on *whether* rows exist, not on what they add up to.
 */
export interface MoneyQueueInput {
  id: string;
  reference: string;
  soldAt: Date | null;
  year: number | null;
  make: string | null;
  model: string | null;
  lotNumber: string;
  clientName: string;
  clientEmail: string;
  rateMicros: number | null;
  costUsdCents: number;
  costEurCents: number;
  costLineCount: number;
  paidUsdCents: number;
  paidEurCents: number;
  paymentCount: number;
  /** When the client last pressed "I've sent the transfer". Null if never. */
  declaredAt: Date | null;
  /** When an admin last recorded a payment — the moment we acted, not the
   * date the money is said to have arrived. Null if none. */
  lastPaymentRecordedAt: Date | null;
}

export interface MoneyQueueRow extends MoneyQueueInput {
  status: PaymentStatus;
  /** What the client is quoted in — EUR once a rate is frozen, else USD. */
  currency: OrderCurrency;
  /**
   * True when the client has said the money is on its way and nobody has
   * recorded a payment since.
   *
   * Compared against when the payment was **recorded**, not the date it is
   * marked as received: an admin entering a wire that landed last Tuesday is
   * acting today, and the declaration is answered by that act. Using `paidAt`
   * would leave a back-dated payment looking like it predated the client's
   * message and keep the row in the queue for ever.
   */
  awaitingCheck: boolean;
}

export interface MoneyQueue {
  notInvoiced: MoneyQueueRow[];
  declared: MoneyQueueRow[];
  owed: MoneyQueueRow[];
  /** Everything outstanding, summed per currency. */
  totals: MoneyTotals;
}

export interface MoneyTotals {
  usdCents: number;
  eurCents: number;
  /** Orders counted in the sums above. */
  orders: number;
  /**
   * Orders whose balance could not be computed at all, so they are in **no**
   * total. Surfaced rather than dropped: a figure quietly missing an order is
   * worse than a figure that admits what it excludes.
   */
  unknown: number;
}

/** Cost/payment sums back into the row shape `orderMoney` expects. */
function rows(usdCents: number, eurCents: number, count: number): MoneyRow[] {
  // Empty when there are none, because `orderMoney` reads the *length* to
  // decide whether "paid in full" is a statement it may make at all. Zero-value
  // rows are otherwise harmless — summing to nothing changes no total.
  if (count === 0) return [];
  return [
    { amountCents: usdCents, currency: "USD" },
    { amountCents: eurCents, currency: "EUR" },
  ];
}

/** One order's money, resolved. */
export function moneyQueueRow(input: MoneyQueueInput, now: Date): MoneyQueueRow {
  const money = orderMoney(
    rows(input.costUsdCents, input.costEurCents, input.costLineCount),
    rows(input.paidUsdCents, input.paidEurCents, input.paymentCount),
    input.rateMicros
  );

  /**
   * Which currency the client was asked for — the same figure their own order
   * page shows them, because an admin answering "how much do I owe?" must be
   * reading the client's number, not a second one derived differently.
   *
   * Decided by whether the file **holds** a euro figure — a frozen rate, or
   * euro cost lines — rather than by "is `balanceEur` non-null?". The two agree
   * everywhere except on an empty file, where both balances are a legitimate
   * zero and the null test picks EUR for a car whose costs, when they arrive,
   * will be in dollars. Nothing renders that particular zero today; the rule is
   * written this way so nothing has to remember that.
   */
  const quotedInEur = (input.rateMicros ?? 0) > 0 || input.costEurCents > 0;
  const currency: OrderCurrency = quotedInEur ? "EUR" : "USD";
  const balanceCents = quotedInEur ? money.balanceEur : money.balanceUsd;

  const status = paymentStatus(
    {
      soldAt: input.soldAt,
      balanceCents,
      paymentsMade: input.paymentCount,
      costLineCount: input.costLineCount,
    },
    now
  );

  const awaitingCheck =
    input.declaredAt !== null &&
    (input.lastPaymentRecordedAt === null || input.lastPaymentRecordedAt < input.declaredAt);

  return { ...input, status, currency, awaitingCheck };
}

/**
 * Deadline first, and nothing else.
 *
 * The states are labels on one underlying quantity — hours left — so ranking
 * by state and *then* by time would be the same order written twice: every
 * `overdue` row has fewer hours left than every `urgent` one by construction.
 * The one case the number cannot express is a file with no recorded sale
 * instant, which goes last: it is owed, but no deadline can be claimed against
 * it, so it must never displace a row that has one.
 */
export function byUrgency(a: MoneyQueueRow, b: MoneyQueueRow): number {
  const left = a.status.hoursLeft;
  const right = b.status.hoursLeft;
  if (left === null && right === null) return a.reference.localeCompare(b.reference);
  if (left === null) return 1;
  if (right === null) return -1;
  if (left !== right) return left - right;
  return a.reference.localeCompare(b.reference);
}

/**
 * Sorted by when the money was **due**, not by hours left.
 *
 * For the un-invoiced list `hoursLeft` is deliberately null — there is no
 * countdown to a figure nobody has sent — so `byUrgency` would treat every row
 * as undated and order them by reference. The deadline itself still exists and
 * is the right order: the car whose 24 hours expire first is the one to price
 * first.
 */
function byDueAt(a: MoneyQueueRow, b: MoneyQueueRow): number {
  const left = a.status.dueAt?.getTime() ?? null;
  const right = b.status.dueAt?.getTime() ?? null;
  if (left === null && right === null) return a.reference.localeCompare(b.reference);
  if (left === null) return 1;
  if (right === null) return -1;
  if (left !== right) return left - right;
  return a.reference.localeCompare(b.reference);
}

/** Oldest declaration first — the one we have left waiting longest. */
function byDeclaredAt(a: MoneyQueueRow, b: MoneyQueueRow): number {
  const left = a.declaredAt?.getTime() ?? 0;
  const right = b.declaredAt?.getTime() ?? 0;
  if (left !== right) return left - right;
  return a.reference.localeCompare(b.reference);
}

/**
 * Every unsettled order, in the three lists an operator acts on.
 *
 * ⚠️ The order of the tests below is the whole behaviour. `notInvoiced` is
 * checked before `declared` because a client can press "I've sent it" on an
 * order nobody has priced — they are told what the car cost by us, and some
 * will pay against an emailed figure or their own arithmetic. That row belongs
 * in the un-invoiced list: the missing invoice is still the thing blocking it,
 * and the declaration is shown on the row rather than moving it.
 */
export function buildMoneyQueue(inputs: MoneyQueueInput[], now: Date): MoneyQueue {
  const notInvoiced: MoneyQueueRow[] = [];
  const declared: MoneyQueueRow[] = [];
  const owed: MoneyQueueRow[] = [];
  const totals: MoneyTotals = { usdCents: 0, eurCents: 0, orders: 0, unknown: 0 };

  for (const input of inputs) {
    const row = moneyQueueRow(input, now);
    const state = row.status.state;

    if (state === "settled") continue;

    if (state === "awaiting_costs" || state === "needs_rate") {
      notInvoiced.push(row);
      // Counted as an order with money outstanding but no known amount —
      // which is exactly what it is. Adding 0 to the total would understate
      // the page's headline figure while looking complete.
      totals.unknown++;
      continue;
    }

    if (row.currency === "EUR") totals.eurCents += row.status.outstandingCents;
    else totals.usdCents += row.status.outstandingCents;
    totals.orders++;

    if (row.awaitingCheck) declared.push(row);
    else owed.push(row);
  }

  notInvoiced.sort(byDueAt);
  declared.sort(byDeclaredAt);
  owed.sort(byUrgency);

  return { notInvoiced, declared, owed, totals };
}
