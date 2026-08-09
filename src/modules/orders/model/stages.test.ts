import { describe, expect, it } from "vitest";
import {
  ORDER_STAGES,
  hasReached,
  isOrderStage,
  nextStage,
  parseStage,
  stageIndex,
  stageProgress,
  stagesUpTo,
  type OrderStage,
} from "./stages";

describe("ORDER_STAGES", () => {
  it("is the route a car actually takes, in order", () => {
    expect([...ORDER_STAGES]).toEqual([
      "won",
      "paid",
      "to_terminal",
      "at_terminal",
      "loaded",
      "at_sea",
      "arrived",
      "delivered",
    ]);
  });

  it("keeps the terminal and the container loading separate", () => {
    // They are two events with two sets of photographs, and a client waiting
    // on a car cares about the difference.
    expect(stageIndex("at_terminal")).toBeLessThan(stageIndex("loaded"));
  });

  it("has no duplicates", () => {
    expect(new Set(ORDER_STAGES).size).toBe(ORDER_STAGES.length);
  });
});

describe("isOrderStage / parseStage", () => {
  it("accepts every real stage", () => {
    for (const stage of ORDER_STAGES) expect(isOrderStage(stage)).toBe(true);
  });

  it("rejects anything else, because stages arrive from URLs", () => {
    // The column's enum is a compile-time constraint on `text`; Postgres never
    // saw a CHECK. A typo in a bookmarked link has to be caught by something
    // that runs.
    for (const bad of ["", "WON", "shipped", "delivered ", 3, null, undefined, {}]) {
      expect(isOrderStage(bad), String(bad)).toBe(false);
    }
  });

  it("parses to null rather than throwing", () => {
    expect(parseStage("at_sea")).toBe("at_sea");
    expect(parseStage("nonsense")).toBeNull();
    expect(parseStage(undefined)).toBeNull();
  });
});

describe("stageProgress", () => {
  it("shows a just-bought car as step 1, not step 0", () => {
    // Nothing has gone wrong when a car has only just been won; the process
    // has started, and an empty progress bar would say otherwise.
    expect(stageProgress("won")).toEqual({ step: 1, total: 8 });
  });

  it("ends at the last step", () => {
    expect(stageProgress("delivered")).toEqual({ step: 8, total: 8 });
  });

  it("moves forward monotonically through the whole sequence", () => {
    let previous = 0;
    for (const stage of ORDER_STAGES) {
      const { step } = stageProgress(stage);
      expect(step).toBe(previous + 1);
      previous = step;
    }
  });
});

describe("nextStage", () => {
  it("advances one step", () => {
    expect(nextStage("won")).toBe("paid");
    expect(nextStage("at_terminal")).toBe("loaded");
  });

  it("stops at the end rather than wrapping round to the start", () => {
    // Wrapping would let an "advance" button send a delivered car back to
    // "won", which is the worst possible thing that button could do.
    expect(nextStage("delivered")).toBeNull();
  });

  it("walks the whole sequence and terminates", () => {
    let stage: OrderStage = ORDER_STAGES[0]!;
    // Annotated: control-flow narrowing types the initialiser as the literal
    // "won", which would make the array refuse every later stage.
    const walked: OrderStage[] = [stage];
    for (let i = 0; i < 20; i++) {
      const next = nextStage(stage);
      if (!next) break;
      stage = next;
      walked.push(stage);
    }
    expect(walked).toEqual([...ORDER_STAGES]);
  });
});

describe("hasReached", () => {
  it("counts the current stage as reached", () => {
    expect(hasReached("loaded", "loaded")).toBe(true);
  });

  it("counts everything behind it as reached", () => {
    // A car that spent two hours at the terminal still went through it, even
    // if nobody photographed it. This answers what happened, not what was
    // recorded.
    expect(hasReached("at_sea", "at_terminal")).toBe(true);
    expect(hasReached("delivered", "won")).toBe(true);
  });

  it("does not claim a stage still ahead", () => {
    expect(hasReached("paid", "loaded")).toBe(false);
    expect(hasReached("won", "delivered")).toBe(false);
  });
});

describe("stagesUpTo", () => {
  it("returns everything through the current stage, oldest first", () => {
    expect(stagesUpTo("to_terminal")).toEqual(["won", "paid", "to_terminal"]);
  });

  it("returns just the first stage for a new file", () => {
    expect(stagesUpTo("won")).toEqual(["won"]);
  });

  it("returns the whole sequence once delivered", () => {
    expect(stagesUpTo("delivered")).toEqual([...ORDER_STAGES]);
  });
});
