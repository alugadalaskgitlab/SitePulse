// INSTRUCTION 06S — Site Material Trips: procurement match + work-front/yard
// tracking. Tests A–O per the batch spec.
//
// PERMANENT RULE under test: GSB/WMM/aggregates/soil are NEVER Stores
// inventory — no Store GRN, stock, or Issue. The receipt records where the
// truck actually unloaded, permanently; DPR records what was consumed.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  isHlcProcurementResponsible,
  AGENCY_SUPPLIED_ARRANGEMENT_TYPES,
} from "../shared/materialReceiptSummary";
import { insertSiteMaterialTripSchema } from "../shared/schema";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");
const storageSrc = read("server/storage.ts");
const routesSrc = read("server/routes.ts");
const stripSrc = read("client/src/components/ActivityReceiptStrip.tsx");
const standaloneSrc = read("client/src/pages/SiteMaterialTrips.tsx");
const schemaSrc = read("shared/schema.ts");
const procurementRouteMigration = read("migrations/0018_plant_materials_procurement_route_no_default.sql");

describe("06S supply responsibility helper (Test A groundwork)", () => {
  it("agency-supplied arrangement types skip the PI lookup entirely", () => {
    for (const t of AGENCY_SUPPLIED_ARRANGEMENT_TYPES) {
      expect(isHlcProcurementResponsible(t)).toBe(false);
    }
  });
  it("HLC-procured types and NO arrangement are HLC-responsible by default", () => {
    expect(isHlcProcurementResponsible("hlc_in_house")).toBe(true);
    expect(isHlcProcurementResponsible("hlc_source_outsourced_execution")).toBe(true);
    expect(isHlcProcurementResponsible("vendor_material_delivered")).toBe(true);
    expect(isHlcProcurementResponsible("not_decided")).toBe(true);
    expect(isHlcProcurementResponsible(null)).toBe(true);
    expect(isHlcProcurementResponsible(undefined)).toBe(true);
  });
  it("daily fulfilment override precedence mirrors 06G §4: other_agency → agency, hlc → HLC", () => {
    expect(isHlcProcurementResponsible("hlc_in_house", "other_agency")).toBe(false);
    expect(isHlcProcurementResponsible("client_supplied", "hlc")).toBe(true);
  });
});

describe("06S §1 hardening — unconfigured route never defaults into Stores (Test F)", () => {
  it("auto-GRN fires ONLY for an explicit 'stores' route; null route is skipped with a warning", () => {
    // The old vulnerable condition must be gone:
    expect(storageSrc).not.toContain(`(dbRoute === "stores" || dbRoute === null) && item.qty > 0`);
    // Explicit stores route still auto-creates a draft GRN (unchanged behaviour):
    expect(storageSrc).toContain(`if (!(dbRoute === "stores" && item.qty > 0)) continue;`);
    // Null route collects a warning instead of creating a GRN:
    expect(storageSrc).toContain(`if (dbRoute === null && item.qty > 0) {`);
    expect(storageSrc).toContain("Procurement route not configured for");
    expect(storageSrc).toContain("set it in Material Master before this can be received");
    // Warnings are returned to the route and surfaced via the existing toast:
    expect(storageSrc).toContain("return { txnIdsByItemId, grnIdsByItemId, routeWarnings };");
    expect(routesSrc).toContain("routeWarnings: paResult.routeWarnings ?? []");
    expect(read("client/src/pages/PurchaseIndents.tsx")).toContain("result?.routeWarnings ?? []");
  });
  it("no silent Stores default anywhere: schema has no default, form forces a choice, recordDelivery needs explicit stores", () => {
    // schema: null = unconfigured, never defaulted to 'stores'
    expect(schemaSrc).not.toContain(`procurementRoute: text("procurement_route").default("stores")`);
    // DB source of truth: versioned migration drops the legacy default.
    expect(procurementRouteMigration).toContain("ALTER COLUMN procurement_route DROP DEFAULT");
    // Runtime startup is not the schema authority and must not mask DB drift.
    expect(storageSrc).not.toContain("ALTER TABLE plant_materials ALTER COLUMN procurement_route DROP DEFAULT");
    // Material Master form: no preselected route; submit blocked until chosen
    const plantSrc = read("client/src/pages/Plant.tsx");
    expect(plantSrc).toContain(`useState("")`);
    expect(plantSrc).toContain("Choose a procurement route");
    expect(plantSrc).not.toContain(`setProcurementRoute("stores")`);
    // recordDelivery (Route A delivery): GRN only on explicit stores route
    expect(storageSrc).toContain(`if (userId && existingItem.procurementRoute === "stores") {`);
    expect(storageSrc).not.toContain(`existingItem.procurementRoute === "stores" || existingItem.procurementRoute === null`);
  });
});

describe("06S §2 resolver — explicit chain only (Tests B/E, O)", () => {
  const block = storageSrc.slice(
    storageSrc.indexOf("async getApplicablePiForBoqItem"),
    storageSrc.indexOf("async migrateBulkPlantToMaterial"),
  );
  it("uses the explicit requirement→PI chain, never fuzzy name matching", () => {
    expect(block).toContain("eq(materialRequirements.boqProjectId, boqProjectId)");
    expect(block).toContain("eq(materialRequirements.sourceBoqItemId, boqItemId)");
    expect(block).toContain("eq(purchaseIndents.requirementId, materialRequirements.id)");
    expect(block).toContain("eq(purchaseIndentItems.indentId, purchaseIndents.id)");
    expect(block).not.toMatch(/ilike|similarity|levenshtein/i);
  });
  it("only approved/ordered/in-progress statuses qualify (derivePiStatus vocabulary)", () => {
    expect(block).toContain(`["approved", "purchasing", "purchaser_actioned", "awaiting_delivery", "ordered", "partially_received"]`);
  });
  it("Test E: a Stores-routed item can NEVER be the applicable match", () => {
    expect(block).toContain(`inArray(purchaseIndentItems.procurementRoute, ["material", "bulk_plant"])`);
  });
  it("never guesses on multiple matches; null on none", () => {
    expect(block).toContain("if (rows.length === 0) return null;");
    expect(block).toContain("if (rows.length > 1) return { ambiguous: true as const, count: rows.length };");
  });
  it("received = linked trips (non-cancelled) + bulk_receipt transactions; Store GRNs excluded", () => {
    expect(block).toContain("eq(siteMaterialTrips.indentItemId, it.indentItemId)");
    expect(block).toContain("isCancelled");
    expect(block).toContain(`eq(piItemTransactions.transactionType, "bulk_receipt")`);
    expect(block).not.toContain("storeGrn");
  });
  it("Test O: the resolver and its route never create a Purchase Indent", () => {
    expect(block).not.toContain("insert(purchaseIndents");
    expect(block).not.toContain("createPurchaseIndent");
    const routeBlock = routesSrc.slice(
      routesSrc.indexOf(`app.get("/api/procurement/applicable-pi"`),
      routesSrc.indexOf("// Batch 06E: app-level validation"),
    );
    expect(routeBlock).toContain("storage.getApplicablePiForBoqItem(boqProjectId, boqItemId)");
    expect(routeBlock).not.toMatch(/createPurchaseIndent|insert\(/);
  });
});

describe("06S §3 ActivityReceiptStrip (Tests A/B/C/D)", () => {
  it("Test A: agency-supplied — PI query disabled, 'no HLC PI required' shown", () => {
    expect(stripSrc).toContain("enabled: hlcResponsible && !!boqProjectId && !!boqItemId");
    expect(stripSrc).toContain("Supply responsibility: Agency — no HLC PI required.");
  });
  it("Test B: single match shows vendor/order/balance and auto-attaches indentId/indentItemId to the POST", () => {
    expect(stripSrc).toContain("Material supply: {piMatch.vendor ?? \"Vendor TBD\"} · {piMatch.indentNo}");
    expect(stripSrc).toContain("indentId: piMatch?.indentId ?? undefined");
    expect(stripSrc).toContain("indentItemId: piMatch?.indentItemId ?? undefined");
  });
  it("Test C: no match → non-blocking warning; save button logic untouched by PI state", () => {
    expect(stripSrc).toContain("No approved/ordered Purchase Indent found for this HLC-supplied material.");
    // Save is disabled only by pending/quantity — never by PI resolution state:
    expect(stripSrc).toContain("disabled={createMutation.isPending || !form.quantity || parseFloat(form.quantity) <= 0}");
  });
  it("Test D: ambiguous → message, and piMatch stays null so nothing attaches", () => {
    expect(stripSrc).toContain("Multiple approved Purchase Indents match — link the correct one from the Purchase Indent screen.");
    expect(stripSrc).toContain("!piMatchRaw.ambiguous && piMatchRaw.indentItemId != null ? piMatchRaw : null");
  });
});

describe("06S §5 schema + §6 forms (Tests H/N)", () => {
  it("Test N: exactly unloadedAt/yardLabel added to site_material_trips, nullable text", () => {
    expect(schemaSrc).toContain(`unloadedAt: text("unloaded_at")`);
    expect(schemaSrc).toContain(`yardLabel: text("yard_label")`);
    // startup ensure DDL covers live DBs (established migration convention):
    expect(storageSrc).toContain("ADD COLUMN IF NOT EXISTS unloaded_at text");
    expect(storageSrc).toContain("ADD COLUMN IF NOT EXISTS yard_label text");
  });
  it("Test H: omitting unloadedAt is valid — insert schema parses a pre-batch payload unchanged", () => {
    const parsed = insertSiteMaterialTripSchema.parse({
      date: "2026-08-17", site: "NH-44", material: "GSB", quantity: 30, uom: "MT",
    });
    expect((parsed as any).unloadedAt ?? null).toBeNull();
    expect((parsed as any).yardLabel ?? null).toBeNull();
  });
  it("yard receipt parses with label", () => {
    const parsed = insertSiteMaterialTripSchema.parse({
      date: "2026-08-17", site: "NH-44", material: "GSB", quantity: 300, uom: "MT",
      unloadedAt: "yard", yardLabel: "Yard A",
    });
    expect((parsed as any).unloadedAt).toBe("yard");
    expect((parsed as any).yardLabel).toBe("Yard A");
  });
  it("both entry points offer Work Stretch / Temporary Yard and send yardLabel only for yard", () => {
    for (const src of [stripSrc, standaloneSrc]) {
      expect(src).toContain("Work Stretch");
      expect(src).toContain("Temporary Yard");
    }
    expect(stripSrc).toContain(`yardLabel: form.unloadedAt === "yard" ? form.yardLabel : undefined`);
    expect(standaloneSrc).toContain(`yardLabel: data.unloadedAt === "yard" ? data.yardLabel : undefined`);
  });
  it("Test G: standalone PI-linked deep-link flow unchanged (piIndentId/piItemId prefill intact)", () => {
    expect(standaloneSrc).toContain("payload.indentId = piParams.piIndentId");
    expect(standaloneSrc).toContain("payload.indentItemId = piParams.piItemId");
    expect(standaloneSrc).toContain("enabled: !isPILinked");
  });
});

describe("06S §7 reconciliation (Tests I/J/L/K)", () => {
  const recon = storageSrc.slice(
    storageSrc.indexOf("async getSiteMaterialReconciliation"),
    storageSrc.indexOf("async getAllMaterialsReceived"),
  );
  it("Test L: reports deliveredAtStretch/deliveredAtYard as informational totals only — no consumption allocation", () => {
    expect(recon).toContain(`if ((t as any).unloadedAt === "yard") row.deliveredAtYard += mt;`);
    expect(recon).toContain("else row.deliveredAtStretch += mt;");
    // lying stays SITE-WIDE — never split between yard and stretch:
    expect(recon).toContain("lying: round(r.delivered - r.consumed)");
    // No arithmetic ever draws consumption from either bucket:
    expect(recon).not.toMatch(/deliveredAtStretch\s*-|deliveredAtYard\s*-|-\s*r\.deliveredAt/);
  });
  it("Tests I/J/K: reconciliation is read-only — never updates, rewrites, or creates receipts", () => {
    expect(recon).not.toMatch(/\.update\(|\.insert\(|\.delete\(/);
  });
  it("rows without unloadedAt count as stretch (matches §5 default)", () => {
    // the yard branch is the only special case; everything else (incl. null) is stretch
    expect(recon.indexOf(`=== "yard"`)).toBeGreaterThan(-1);
    expect(recon).not.toContain(`=== "stretch"`);
  });
});

describe("06S what-not-to-touch (Test M spot checks)", () => {
  it("no diesel / plant-stock guard code was touched by 06S markers", () => {
    // 06S markers must not appear in diesel or plant-stock guard seams
    const dieselFiles = ["shared/plannedWork.ts", "shared/dprProgrammeLink.ts"];
    for (const f of dieselFiles) {
      expect(read(f)).not.toContain("06S");
    }
  });
  it("PATCH /api/site-material-trips edit path was not restricted or extended by this batch (correction-only remains)", () => {
    // Edit route unchanged: linkage guard comment still governs, no unloadedAt-specific blocking added
    expect(routesSrc).not.toContain("unloadedAt is immutable");
  });
});
