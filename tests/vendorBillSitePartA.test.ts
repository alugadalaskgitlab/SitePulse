import { describe, expect, it } from "vitest";
import { createVendorBillRequestSchema } from "../shared/schema";
import {
  untrustedVendorBillAutoItems,
  vendorBillAutoSourceFromCandidate,
  vendorBillItemMatchesSite,
  vendorBillUpdateSiteId,
  vendorBillVisibleToSites,
} from "../shared/siteName";
import fs from "node:fs";

const baseBill = {
  billDate: "2026-08-20",
  billNo: "TEST",
  billType: "material",
  vendorName: "VENDOR",
  items: [],
};

describe("vendor bill site persistence and filtering", () => {
  it("persists a selected site id and keeps legacy/all-sites bills nullable", () => {
    expect(createVendorBillRequestSchema.parse({ ...baseBill, siteId: 17 }).siteId).toBe(17);
    expect(createVendorBillRequestSchema.parse({ ...baseBill, siteId: null }).siteId).toBeNull();
    expect(createVendorBillRequestSchema.parse(baseBill).siteId).toBeUndefined();
  });

  it("matches selected-site pull rows without leaking another site", () => {
    expect(vendorBillItemMatchesSite("SITE: TAKKADPALLY", "Takkadpally")).toBe(true);
    expect(vendorBillItemMatchesSite("SITE*: TAKKADPALLY", "Takkadpally")).toBe(true);
    expect(vendorBillItemMatchesSite("SITE: SIRUR", "Takkadpally")).toBe(false);
    expect(vendorBillItemMatchesSite("PLANT", "Takkadpally")).toBe(false);
  });

  it("shows all-sites bills only when every item is within the viewer's scope", () => {
    const sites = new Map([[1, "SITE A"], [2, "SITE B"]]);
    expect(vendorBillVisibleToSites(
      { siteId: 1, items: [{ siteName: "SITE: SITE B" }] },
      ["SITE A"],
      sites,
    )).toBe(true);
    expect(vendorBillVisibleToSites(
      { siteId: null, items: [{ siteName: "SITE: SITE A" }, { siteName: "SITE: SITE A" }] },
      ["SITE A"],
      sites,
    )).toBe(true);
    expect(vendorBillVisibleToSites(
      { siteId: null, items: [{ siteName: "SITE: SITE A" }, { siteName: "SITE: SITE B" }] },
      ["SITE A"],
      sites,
    )).toBe(false);
  });

  it("preserves site scope for partial PUT and honors explicit All Sites", () => {
    expect(vendorBillUpdateSiteId(false, undefined, 17)).toBe(17);
    expect(vendorBillUpdateSiteId(true, null, 17)).toBeNull();
    expect(vendorBillUpdateSiteId(true, 22, 17)).toBe(22);
  });

  it("revalidates only new or provenance-altered auto rows", () => {
    const saved = [
      { source: "auto:dpr_material:1", date: "2026-08-20", category: "material", description: "SOIL", siteName: "SITE: A" },
      { source: "auto", date: "2026-08-19", category: "material", description: "LEGACY", siteName: "SITE: A" },
    ];
    expect(untrustedVendorBillAutoItems([...saved], saved)).toEqual([]);
    expect(untrustedVendorBillAutoItems([
      { ...saved[0], siteName: "SITE: B" },
      { source: "auto:site_material_trip:9", date: "2026-08-20", category: "material", description: "SOIL", siteName: "SITE: A" },
      { source: "manual", description: "MANUAL" },
      { source: "hire_group", description: "HIRE" },
      { source: "workscope", description: "WORKSCOPE" },
    ], saved)).toEqual([
      { ...saved[0], siteName: "SITE: B" },
      { source: "auto:site_material_trip:9", date: "2026-08-20", category: "material", description: "SOIL", siteName: "SITE: A" },
    ]);
  });

  it("maps regular and material-source candidates to the client source identity", () => {
    expect(vendorBillAutoSourceFromCandidate({ sourceId: "DPR_MATERIAL:8" }))
      .toBe("auto:dpr_material:8");
    expect(vendorBillAutoSourceFromCandidate({
      sourceType: "site_material_trip_material",
      sourceId: 9,
    })).toBe("auto:site_material_trip_material:9");
    expect(vendorBillAutoSourceFromCandidate({ sourceId: null })).toBeNull();
  });

  it("keeps server-side pull, persistence, and site authorization guards", () => {
    const routes = fs.readFileSync("server/routes.ts", "utf8");
    const storage = fs.readFileSync("server/storage.ts", "utf8");
    expect(routes).toContain("resolveVendorBillSite(req, res, req.query.siteId)");
    expect(routes).toContain("Every pulled item must belong to the selected bill site");
    expect(routes).toContain("One or more bill items are outside your permitted sites");
    expect(routes).toContain("One or more auto-pulled items no longer match the selected site and period");
    const putRoute = routes.slice(routes.indexOf('app.put("/api/vendor-bills/:id"'));
    expect(putRoute.indexOf("Access denied for this bill's existing site scope"))
      .toBeLessThan(putRoute.indexOf("vendorBillUpdateSiteId("));
    expect(routes).toContain("scopeVendorBillsToSiteAccess");
    expect(storage).toContain("items.filter(item => vendorBillItemMatchesSite(item.siteName, siteName))");
    expect(storage).toContain("siteId: data.siteId ?? null");
  });

  it("preserves the management-report deep link while exposing the same filter", () => {
    const page = fs.readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    expect(page).toContain('_vbSp?.get("site") ?? ""');
    expect(page).toContain('value={filterSite || "all"}');
    expect(page).toContain('data-testid="filter-site"');
  });

  it("does not relabel retained manual source provenance when Site changes", () => {
    const page = fs.readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    const selector = page.slice(page.indexOf('data-testid="select-bill-site"') - 700, page.indexOf('data-testid="select-bill-site"'));
    expect(selector).toContain(".filter(item => !isGeneratedEvidenceLine(item.source))");
    expect(selector).toContain("item.initialBlank && !item.siteName");
    expect(selector).not.toContain("map(item => ({ ...item, siteName: selectedName }))");
  });
});