/**
 * The allowlist that decides what the browser may claim happened.
 *
 * This is a trust boundary rather than a convenience, so it gets a test whose
 * whole job is to fail loudly if somebody widens it. `/api/activity` is the one
 * endpoint where the client speaks, and the thing it must never be able to say
 * is "I viewed this car" — that row is written server-side from our own fetch,
 * and its label is copied as the single vetted name for a lot.
 */
import { describe, expect, it } from "vitest";
import { CLIENT_RECORDABLE, PORT_KEYS, isClientRecordable } from "./clientEvents";
import { ACTIVITY_KINDS } from "@/shared/db/schema";
import { PORT_MULTIPLIER, PORT_CUSTOMS } from "@/modules/pricing/model/costEstimate";

describe("the browser may only report what it alone can see", () => {
  it("exactly two kinds, and these two", () => {
    expect([...CLIENT_RECORDABLE]).toEqual(["lot.cost_calculated", "lot.external_opened"]);
  });

  it("lot.viewed is NOT client-recordable", () => {
    // The load-bearing assertion in this file. Accepting it would let a client
    // fill their own file with cars they never opened — and, because the
    // endpoint copies the newest label for a lot, name them anything at all.
    expect(isClientRecordable("lot.viewed")).toBe(false);
  });

  it("nor is anything else the server writes", () => {
    for (const kind of ["search.performed", "lot.saved", "lot.unsaved", "contact.submitted", "plans.viewed"]) {
      expect(isClientRecordable(kind), `${kind} must stay server-written`).toBe(false);
    }
  });

  it("unknown strings are refused", () => {
    for (const junk of ["", "lot", "lot.cost_calculated ", "LOT.EXTERNAL_OPENED", "__proto__"]) {
      expect(isClientRecordable(junk)).toBe(false);
    }
  });

  it("every allowed kind is a real one", () => {
    for (const kind of CLIENT_RECORDABLE) {
      expect(ACTIVITY_KINDS as readonly string[]).toContain(kind);
    }
  });
});

describe("the port list is taken from the pricing model, not restated", () => {
  it("matches the calculator's own destinations", () => {
    // Restated, the two would drift silently: a port added to the calculator
    // would simply stop being recorded, and the strongest signal on the site
    // would go missing for whichever destination was newest.
    expect(PORT_KEYS).toEqual(Object.keys(PORT_MULTIPLIER));
  });

  it("is not empty, so the endpoint cannot reject everything", () => {
    expect(PORT_KEYS.length).toBeGreaterThan(0);
  });

  it("every recordable port has a customs model behind it", () => {
    for (const port of PORT_KEYS) {
      expect(PORT_CUSTOMS[port], `no customs model for ${port}`).toBeDefined();
    }
  });
});
