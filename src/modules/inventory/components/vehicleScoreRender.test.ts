import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import VehicleScoreBadge from "./VehicleScoreBadge";

const LABELS = {
  title: "IAAI būklės įvertinimas",
  intro: "intro",
  scaleHigh: "high",
  scaleLow: "low",
  factors: "factors",
  copartNote: "copart",
  source: "source",
  close: "Uždaryti",
};

const render = (raw: string) =>
  renderToStaticMarkup(createElement(VehicleScoreBadge, { raw, labels: LABELS }));

describe("VehicleScoreBadge", () => {
  it("shows the score over IAAI's 0–50 scale, as their own portal does", () => {
    expect(render("35")).toContain("35/50");
  });

  it("passes a non-numeric value through rather than inventing a denominator", () => {
    // The field is the vendor's raw string; a shape we have not seen must not
    // gain a "/50" it never had.
    expect(render("A")).toContain(">A<");
    expect(render("A")).not.toContain("A/50");
  });

  it("refuses the denominator outside the documented scale", () => {
    expect(render("120")).not.toContain("120/50");
  });

  it("keeps the modal closed on first paint", () => {
    expect(render("35")).not.toContain("intro");
  });
});
