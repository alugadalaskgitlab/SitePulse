import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  shortItemName,
  boqItemDisplayName,
  trustedCanonicalBoqName,
} from "../shared/boqItemName";

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

  it("uses the BOQ item's own description when no saved short name exists", () => {
    const noSaved = boqItemDisplayName({ displayName: null, itemName: null, description: EMBANKMENT_DESC });
    expect(noSaved).toBe(EMBANKMENT_DESC);
    expect(noSaved.toLowerCase()).toContain("embankment");
    expect(noSaved.toLowerCase()).toContain("technical specification");
  });

  it("ignores whitespace-only displayName", () => {
    expect(boqItemDisplayName({ displayName: "   ", itemName: null, description: EMBANKMENT_DESC }))
      .toBe(EMBANKMENT_DESC);
  });

  it("falls back to the BOQ item name before its description", () => {
    expect(boqItemDisplayName({ displayName: null, itemName: "GSB", description: "Long imported GSB description" })).toBe("GSB");
    expect(boqItemDisplayName(null)).toBe("");
    expect(boqItemDisplayName({})).toBe("");
  });

  it("keeps material keywords and grading in derived names", () => {
    expect(shortItemName("Providing, laying, spreading and compacting Wet Mix Macadam grading II as per MoRTH"))
      .toContain("Wet Mix Macadam");
    expect(shortItemName("Providing and laying Granular Sub-Base grading I including all leads"))
      .toContain("Granular Sub-Base");
  });

  it("preserves the BOQ item's own casing and technical abbreviations", () => {
    expect(boqItemDisplayName({
      description: "   providing RCC M25 PCC NP4 DBM BC WMM GSB M15 complete   ",
    })).toBe("providing RCC M25 PCC NP4 DBM BC WMM GSB M15 complete");
  });

  it("keeps canonical mappings available internally but never uses them as the BOQ display name", () => {
    expect(boqItemDisplayName({
      description: EMBANKMENT_DESC,
      mappingStatus: "mapped",
      snlShortLabel: "Embankment Construction | forming embankment borrow fill",
      snlMappedBy: "rule",
      snlMappingIsAuto: true,
      snlConfidence: 1,
    })).toBe(EMBANKMENT_DESC);
    expect(trustedCanonicalBoqName({
      mappingStatus: "mapped",
      snlShortLabel: "RCC Pipe NP4 1000mm — single row",
      snlMappedBy: "planner",
      snlMappingIsAuto: false,
      snlConfidence: 0.61,
    })).toBe("RCC Pipe NP4 1000mm — single row");
  });

  it("never treats an unconfirmed fuzzy mapping as the display name", () => {
    expect(boqItemDisplayName({
      description: "providing RCC NP4 pipe 1200mm",
      mappingStatus: "mapped",
      snlShortLabel: "Wrong fuzzy label",
      snlMappedBy: "auto",
      snlMappingIsAuto: true,
      snlConfidence: 0.92,
    })).toBe("providing RCC NP4 pipe 1200mm");
  });

  it("honours every saved BOQ display name, including previously generated short names", () => {
    const generated = shortItemName(EMBANKMENT_DESC);
    expect(boqItemDisplayName({ displayName: generated, description: EMBANKMENT_DESC }))
      .toBe(generated);
    expect(boqItemDisplayName({ displayName: "Borrow Earth Embankment", description: EMBANKMENT_DESC }))
      .toBe("Borrow Earth Embankment");
  });

  it("keeps Takkadpally's saved names even when production SNL labels are unrelated", () => {
    const rows = [
      ["Clearing and grubbing", "DBM Grading-II (26.5mm)"],
      ["Scarifying the existing B.T", "Extra over item No( v ) A and( v ) B for cutting rivets."],
      ["roadway excavation", "RCC M25 (Structural Concrete)"],
      ["embankment - excavated earth", null],
      ["Embankment - Borrow earth", "Clearing & Grubbing"],
      ["Construction of Sub grade", null],
      ["Construction of earthen shoulders", null],
      ["Construction of Granular sub-base", "Dismantling Existing Pavement"],
      ["Wet Mix macadem", "WMM — Plant Mix Method"],
      ["Providing and applying prime", "Earthen Shoulders"],
      ["Providing and applying tack", "Loading and Unloading of Stone Boulder/Stone aggregates/Sand"],
      ["Providing 40 mm thick Bituminous Concrete", "Sub-grade Preparation"],
    ] as const;

    expect(rows.map(([displayName, canonicalDisplayName]) =>
      boqItemDisplayName({ displayName, canonicalDisplayName, description: "Unrelated full description" }),
    )).toEqual(rows.map(([displayName]) => displayName));
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

  it("server auto-classify no longer persists a generic display name", () => {
    const src = read("server/routes.ts");
    expect(src).toContain("const toClassify = allItems.filter(it => it.needsReview || !it.workCategory?.trim());");
    expect(src).not.toMatch(/updateBoqItem\(item\.id,\s*\{[\s\S]{0,100}displayName:/);
    expect(src).not.toMatch(/function serverShortItemName\(full/);
  });

  it("DPR Details passes displayName/itemName through to the label (saved override honoured)", () => {
    const src = read("client/src/pages/DprDetails.tsx");
    expect(src).toContain("displayName: (item as any).displayName ?? null");
    expect(src).toContain("canonicalDisplayName: (item as any).canonicalDisplayName ?? null");
    expect(src).toContain("boqItemDisplayName(boqItemMap.get(item.boqItemId)!)");
  });

  it("Work Demand and Resource Review use short/display names, not full descriptions", () => {
    const wd = read("client/src/pages/WorkDemand.tsx");
    expect(wd).toContain("boqItemDisplayName(row as any)");
    expect(wd).not.toMatch(/\{shortItemName\((?:b\.fullDescription \?\? b\.itemDescription|it\.description)\)\}/);
    expect(wd).toContain("{boqItemDisplayName(it)}");
    const rr = read("client/src/pages/ResourceReview.tsx");
    expect(rr).toContain("boqItemDisplayName(r.it as any)");
  });

  it("Progress Report routes operational item labels through the shared helper", () => {
    const src = read("client/src/pages/ProgressReport.tsx");
    expect(src).toContain('from "@shared/boqItemName"');
    expect(src).toContain("const itemLabel = (b: ReportItem[\"boqItem\"]) => boqItemDisplayName(b);");
    expect(src).not.toContain("b.displayName || b.itemName || b.description");

    const routes = read("server/routes.ts");
    const exportBlock = routes.slice(
      routes.indexOf('["Progress Report — RA-style DPR Rollup"]'),
      routes.indexOf('const wb = XLSX.utils.book_new()', routes.indexOf('["Progress Report — RA-style DPR Rollup"]')),
    );
    expect(exportBlock.match(/boqItemDisplayName\(it\.boqItem\)/g)).toHaveLength(2);
    expect(exportBlock).not.toContain("it.boqItem.displayName || it.boqItem.itemName || it.boqItem.description");
  });

  it("BOQ management screens still show the complete imported description", () => {
    // BOQ project detail + item review must keep rendering item.description
    for (const p of ["client/src/pages/BoqProjectDetail.tsx", "client/src/pages/BoqItemReview.tsx"]) {
      const src = read(p);
      expect(src, `${p} must keep full descriptions`).toMatch(/\.description\}/);
    }
  });
});
