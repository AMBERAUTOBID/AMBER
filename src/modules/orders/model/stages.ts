import { ORDER_STAGES, type OrderStage } from "@/shared/db/schema";

/**
 * The shipping stages as a sequence, and the questions asked about them.
 *
 * The vocabulary lives in `schema.ts` because three columns constrain
 * themselves to it. The *order* lives here, because it is a fact about the
 * business — the route a car takes from a Texas auction to a Klaipėda yard —
 * not a fact about a table.
 *
 * The eight match the six steps `/shipping` has published to clients since
 * before this feature existed, split where the owner's own workflow splits
 * them: the terminal and the container loading are two separate events with
 * separate photographs, and a client waiting on a car cares about the
 * difference.
 */
export { ORDER_STAGES, type OrderStage };

/**
 * A runtime guard, because stages arrive from URLs and form fields.
 *
 * TypeScript's enum on the column is a compile-time constraint on a `text`
 * column; Postgres never saw a CHECK. So a query string reading
 * `?stage=delivered` has to be checked by something that runs, or a typo in a
 * bookmarked link becomes a filter matching nothing with no explanation.
 */
export function isOrderStage(value: unknown): value is OrderStage {
  return typeof value === "string" && (ORDER_STAGES as readonly string[]).includes(value);
}

/** The stage, or null — for parsing a query parameter without throwing. */
export function parseStage(value: unknown): OrderStage | null {
  return isOrderStage(value) ? value : null;
}

/** Position in the sequence, 0-based. -1 for anything unrecognised. */
export function stageIndex(stage: OrderStage): number {
  return ORDER_STAGES.indexOf(stage);
}

/**
 * How far along a file is, 1-based, for a progress indicator.
 *
 * `won` is step 1 of 8 rather than 0 of 8: a client whose car has just been
 * bought should not be shown an empty progress bar, because nothing has gone
 * wrong — the process has started.
 */
export function stageProgress(stage: OrderStage): { step: number; total: number } {
  return { step: stageIndex(stage) + 1, total: ORDER_STAGES.length };
}

/** The next stage, or null at the end. Used by the "advance" control. */
export function nextStage(stage: OrderStage): OrderStage | null {
  const i = stageIndex(stage);
  return i >= 0 && i < ORDER_STAGES.length - 1 ? ORDER_STAGES[i + 1]! : null;
}

/**
 * Has a file reached this stage yet?
 *
 * Comparison by position rather than by "is there a timeline event", because a
 * stage can legitimately be passed without anyone photographing it — a car
 * that spent two hours at the terminal still went through it. The timeline
 * shows what was recorded; this answers what has happened.
 */
export function hasReached(current: OrderStage, stage: OrderStage): boolean {
  return stageIndex(current) >= stageIndex(stage);
}

/**
 * Stages a file has passed or is in, oldest first.
 *
 * This is what the client's timeline iterates: everything up to and including
 * where the car is now, with the rest drawn as pending.
 */
export function stagesUpTo(current: OrderStage): OrderStage[] {
  const i = stageIndex(current);
  return i < 0 ? [] : ORDER_STAGES.slice(0, i + 1);
}
