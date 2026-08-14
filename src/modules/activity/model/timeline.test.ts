/**
 * Merging the two histories into one column.
 *
 * Ordering is the only part of this that can be subtly wrong, and subtly wrong
 * ordering on a screen an admin reads to reconstruct what happened is worse
 * than no screen: it invents a sequence of events.
 */
import { describe, expect, it } from "vitest";
import { mergeTimeline, type AuditRow } from "./timeline";
import type { ActivityRow } from "./events";

const at = (iso: string) => new Date(iso);

function activity(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: "a1",
    kind: "lot.viewed",
    subjectKey: "copart:1",
    label: "2019 BMW X5",
    detail: null,
    count: 1,
    firstSeenAt: at("2026-08-14T10:00:00Z"),
    lastSeenAt: at("2026-08-14T10:00:00Z"),
    ...over,
  } as ActivityRow;
}

function audit(over: Partial<AuditRow> = {}): AuditRow {
  return {
    id: "b1",
    action: "auth.login",
    targetType: "user",
    targetId: "u1",
    detail: null,
    createdAt: at("2026-08-14T09:00:00Z"),
    byOther: false,
    ...over,
  };
}

describe("the two tables interleave by time", () => {
  it("newest first, regardless of which table a row came from", () => {
    const merged = mergeTimeline(
      [
        activity({ id: "a1", lastSeenAt: at("2026-08-14T12:00:00Z") }),
        activity({ id: "a2", lastSeenAt: at("2026-08-14T08:00:00Z") }),
      ],
      [
        audit({ id: "b1", createdAt: at("2026-08-14T13:00:00Z") }),
        audit({ id: "b2", createdAt: at("2026-08-14T10:00:00Z") }),
      ]
    );
    expect(merged.map((e) => e.id)).toEqual(["b1", "a1", "b2", "a2"]);
  });

  it("sources are labelled, so the retention rules stay distinguishable", () => {
    const merged = mergeTimeline([activity()], [audit()]);
    expect(merged.map((e) => e.source)).toEqual(["activity", "audit"]);
  });

  it("either side being empty is not a special case", () => {
    expect(mergeTimeline([], [audit()])).toHaveLength(1);
    expect(mergeTimeline([activity()], [])).toHaveLength(1);
    expect(mergeTimeline([], [])).toEqual([]);
  });
});

describe("identical timestamps do not shuffle between reloads", () => {
  it("a tie is broken deterministically", () => {
    // A login and the row written beside it can share a millisecond. Left to
    // the sort's discretion, the two would swap places between page loads and
    // an admin would see a screen that changes while they read it.
    const same = at("2026-08-14T12:00:00Z");
    const forward = mergeTimeline(
      [activity({ id: "aaa", lastSeenAt: same })],
      [audit({ id: "bbb", createdAt: same })]
    );
    const reversed = mergeTimeline(
      [activity({ id: "bbb", lastSeenAt: same })],
      [audit({ id: "aaa", createdAt: same })]
    );
    expect(forward.map((e) => e.id)).toEqual(["aaa", "bbb"]);
    expect(reversed.map((e) => e.id)).toEqual(["aaa", "bbb"]);
  });
});

describe("repeat counts", () => {
  it("a single hit carries no range", () => {
    // first === last on one hit, and printing a range one instant wide reads
    // as a bug in the page rather than as a fact about the client.
    const [entry] = mergeTimeline([activity({ count: 1 })], []);
    expect(entry.firstAt).toBeNull();
    expect(entry.count).toBe(1);
  });

  it("a collapsed row carries where it started", () => {
    const [entry] = mergeTimeline(
      [
        activity({
          count: 6,
          firstSeenAt: at("2026-08-11T09:00:00Z"),
          lastSeenAt: at("2026-08-14T18:00:00Z"),
        }),
      ],
      []
    );
    expect(entry.count).toBe(6);
    expect(entry.firstAt).toEqual(at("2026-08-11T09:00:00Z"));
  });

  it("audit rows are always single", () => {
    const [entry] = mergeTimeline([], [audit()]);
    expect(entry.count).toBe(1);
    expect(entry.firstAt).toBeNull();
  });
});

describe("who did it", () => {
  it("browsing is always the client's own", () => {
    expect(mergeTimeline([activity()], [])[0].byOther).toBe(false);
  });

  it("a staff action is marked", () => {
    // Without this an admin override renders on the client's own page as
    // something the client chose to do — which is exactly the confusion the
    // held-deposit warning exists to prevent on the other screen.
    expect(mergeTimeline([], [audit({ action: "plan.overridden", byOther: true })])[0].byOther).toBe(
      true
    );
  });
});
