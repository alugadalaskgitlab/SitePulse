import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { shortItemName, boqItemDisplayName } from "../shared/boqItemName";

const EMBANKMENT_DESC =
  "Construction of Embankment with Material Obtained from Borrowed useful earth from outside road boundary MDD of 18 KN/Cum including all leads and lifts complete as per technical specification";

describe("boqItemDisplayName priority rules", () => {
  it("prefers the saved displayName short-name override over everything", () => {
    expect(boqItemDisplayName({
      displayName: "Embankment — Borrow Earth",
      itemName: "Construction of Embankment",
      description: EMBANKMENT_DESC,
    })).toBe("Embankment — Borrow Earth");
  });

  it("derives a fallback short name from itemName/description only when no displayName", () => {
    const noSaved = boqItemDisplayName({ displayName: null, itemName: null, description: EMBANKMENT_DESC });
    expect(noSaved).toBe(shortItemName(EMBANKMENT_DESC));
    expect(noSaved.length).toBeLessThanOrEqual(81); // 80 + ellipsis
    expect(noSaved.toLowerCase()).toContain("embankment");
    // Boilerplate must be stripped — no full-contract tail
    expect(noSaved.toLowerCase()).not.toContain("technical specification");
  });

  it("ignores whitespace-only displayName", () => {
    expect(boqItemDisplayName({ displayName: "   ", itemName: null, description: EMBANKMENT_DESC }))
      .toBe(shortItemName(EMBANKMENT_DESC));
  });

  it("falls back to the raw value when short-naming can't produce a label", () => {
    expect(boqItemDisplayName({ displayName: null, itemName: "GSB", description: null })).toBe("GSB");
    expect(boqItemDisplayName(null)).toBe("");
    expect(boqItemDisplayName({})).toBe("");
  });

  it("keeps material keywords and grading in derived names", () => {
    expect(shortItemName("Providing, laying, spreading and compacting Wet Mix Macadam grading II as per MoRTH"))
      .toContain("Wet Mix Macadam");
    expect(shortItemName("Providing and laying Granular Sub-Base grading I including all leads"))
      .toContain("Granular Sub-Base");
  });

  it("never exceeds ~80 chars — long descriptions cannot stretch across the screen", () => {
    const long = "Providing and laying in position " + "very long specification text ".repeat(30);
    expect(boqItemDisplayName({ description: long }).length).toBeLessThanOrEqual(81);
  });
});

describe("operational screens use the shared helper (source regression scan)", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("classic DPR (SiteEntry) no longer stores the full description as activity", () => {
    const src = read("client/src/pages/SiteEntry.tsx");
    expect(src).not.toMatch(/activity = it \? it\.description\.toUpperCase/);
    expect(src).toContain('from "@shared/boqItemName"');
    // BOQ link selectors (equipment/labour/material) use the shared label
    expect(src).not.toContain("{bi.itemName || bi.description}");
    expect(src.match(/boqItemDisplayName\(bi\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("SiteEdit no longer stores/lists full descriptions for BOQ activity", () => {
    const src = read("client/src/pages/SiteEdit.tsx");
    expect(src).not.toMatch(/boqItem\.description\.toUpperCase/);
    expect(src).toContain("boqItemDisplayName(boqItem).toUpperCase()");
  });

  it("Guided DPR uses the shared helper with no local short-name copy", () => {
    const src = read("client/src/pages/GuidedDpr.tsx");
    expect(src).toContain('from "@shared/boqItemName"');
    expect(src).not.toMatch(/function shortName\(/);
  });

  it("BillItemPicker uses the shared helper with no local short-name copy", () => {
    const src = read("client/src/components/BillItemPicker.tsx");
    expect(src).toContain('from "@shared/boqItemName"');
    expect(src).not.toMatch(/const PREFIXES = \[/);
    expect(src).toContain("boqItemDisplayName(it)");
  });

  it("Work Programme / auto-sequence selectors use the shared display name", () => {
    const src = read("client/src/pages/WorkProgramme.tsx");
    expect(src).toContain("boqItemDisplayName");
    expect(src).not.toContain(".displayName || shortItemName(item.description)");
  });

  it("server auto-classify uses the shared short-name (no duplicated logic)", () => {
    const src = read("server/routes.ts");
    expect(src).toContain('shortItemName as sharedShortItemName } from "@shared/boqItemName"');
    expect(src).not.toMatch(/function serverShortItemName\(full/);
  });

  it("DPR Details passes displayName/itemName through to the label (saved override honoured)", () => {
    const src = read("client/src/pages/DprDetails.tsx");
    expect(src).toContain("displayName: (item as any).displayName ?? null");
    expect(src).toContain("boqItemDisplayName(boqItemMap.get(item.boqItemId)!)");
  });

  it("Work Demand and Resource Review use short/display names, not full descriptions", () => {
    const wd = read("client/src/pages/WorkDemand.tsx");
    expect(wd).toContain("boqItemDisplayName(row as any)");
    expect(wd).toContain("{shortItemName(it.description)}"); // readiness list shortened
    const rr = read("client/src/pages/ResourceReview.tsx");
    expect(rr).toContain("boqItemDisplayName(r.it as any)");
  });

  it("BOQ management screens still show the complete imported description", () => {
    // BOQ project detail + item review must keep rendering item.description
    for (const p of ["client/src/pages/BoqProjectDetail.tsx", "client/src/pages/BoqItemReview.tsx"]) {
      const src = read(p);
      expect(src, `${p} must keep full descriptions`).toMatch(/\.description\}/);
    }
  });
});
