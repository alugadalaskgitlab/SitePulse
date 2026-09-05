import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  boqProgressQty,
  calculateDprQuantity,
  calculateLengthFromChainage,
} from "../shared/dprGeometry";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("focused DPR restoration", () => {
  it("derives physical length and quantity and converts BOQ credit exactly once", () => {
    const length = calculateLengthFromChainage("1.850", "2.100");
    expect(length).toBe(250);

    const physicalQty = calculateDprQuantity(length, 3.1, null, {
      unit: "HA",
      dprMeasurementMethod: "SQM_formula",
      dprConversionFactor: 0.0001,
    });
    expect(physicalQty).toBe(775);
    expect(boqProgressQty(physicalQty, { dprConversionFactor: 0.0001 })).toBeCloseTo(0.0775, 8);

    expect(calculateLengthFromChainage("1.850", "")).toBeNull();
    expect(calculateLengthFromChainage("bad", "2.100")).toBeNull();
  });

  it("keeps length read-only, removes the reconciliation prompt, and opens DPR equipment details", async () => {
    const [siteEntry, siteEdit, guided] = await Promise.all([
      readSource("client/src/pages/SiteEntry.tsx"),
      readSource("client/src/pages/SiteEdit.tsx"),
      readSource("client/src/pages/GuidedDpr.tsx"),
    ]);

    for (const source of [siteEntry, siteEdit, guided]) {
      expect(source).not.toContain("Chainage changed — recalculated length");
      expect(source).toContain("<details open className=\"group\">");
    }
    expect(siteEntry).toMatch(/data-testid=\{`input-progress-length-\$\{idx\}`\}[\s\S]{0,500}?\/>/);
    expect(siteEntry).toMatch(/<Input[\s\S]{0,350}?readOnly[\s\S]{0,350}?data-testid=\{`input-progress-length-\$\{idx\}`\}/);
    expect(siteEdit).toMatch(/<Input[\s\S]{0,350}?readOnly[\s\S]{0,350}?data-testid=\{`input-length-\$\{idx\}`\}/);
  });

  it("preserves and exposes exact equipment and labour BOQ identities during edit", async () => {
    const siteEdit = await readSource("client/src/pages/SiteEdit.tsx");
    const hydration = siteEdit.slice(
      siteEdit.indexOf("function mapDprToFormState"),
      siteEdit.indexOf("export default function"),
    );

    expect(hydration).toContain("boqItemId: e.boqItemId ?? null");
    expect(hydration).toContain("structureId: e.structureId ?? null");
    expect(hydration).toContain("boqItemId: l.boqItemId ?? null");
    expect(hydration).toContain("structureId: l.structureId ?? null");
    expect(siteEdit).toContain("select-equipment-boqitem-${idx}");
    expect(siteEdit).toContain("select-labour-boqitem-${idx}");
    expect(siteEdit).toContain("<SelectItem value=\"__none__\">Not linked</SelectItem>");
  });

  it("keeps exact arrangement and trip context on existing DPR paths", async () => {
    const [guided, siteEdit, tripPanel] = await Promise.all([
      readSource("client/src/pages/GuidedDpr.tsx"),
      readSource("client/src/pages/SiteEdit.tsx"),
      readSource("client/src/components/DprDayTripsPanel.tsx"),
    ]);

    expect(guided).toContain("earthworkArrangementId: p.earthworkArrangementId ?? null");
    expect(siteEdit).toContain("earthworkArrangementId: p.earthworkArrangementId ?? null");
    expect(siteEdit).toContain("<DprDayTripsPanel siteName={header.site} date={header.date}");
    expect(tripPanel).toContain("t.earthworkArrangementId != null");
    expect(tripPanel).toContain("t.boqItemId != null");
  });
});