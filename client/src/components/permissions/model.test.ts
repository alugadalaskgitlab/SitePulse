import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ACTIONS, SECTION_KEYS, ROLE_TEMPLATES, emptyMatrix, applyRoleTemplate,
} from "@shared/permissions";
import { proposeRole } from "@/components/user-role-review";
import {
  inventory, availableActions, editLegacyCell, changedCells, legacySaveBody,
  legacyBitExplanation, previewChanges, capabilityPreview, nodeMatches,
  functionById, canonicalCapabilityId, hasObservedConflict,
} from "./model";
import { capabilitiesFor } from "./capabilities";

describe("display inventory completeness and safe provenance", () => {
  it("accounts for every discovery declaration without fabricating permissions", () => {
    expect(inventory.counts).toMatchObject({
      routes: 130, tiles: 92, operations: 643, controls: 2995, pages: 125,
      cells: 736, background: 106, notifications: 191,
      navigationConfigurations: 43, navigationLinks: 351, frontendApiCalls: 2010,
    });
    expect(inventory.routes).toHaveLength(130);
    expect(inventory.operations).toHaveLength(643);
    expect(new Set(inventory.operations.map(o => o[0])).size).toBe(643);
    expect(inventory.controls).toHaveLength(2995);
    expect(inventory.tiles).toHaveLength(92);
    expect(inventory.systems).toHaveLength(297);
    expect(inventory.apiCalls).toHaveLength(2010);
    expect(inventory.cells).toHaveLength(SECTION_KEYS.length * ACTIONS.length);
    expect(SECTION_KEYS).toHaveLength(92);
  });
  it("maps every stored section and all 92 actual tiles to canonical functions", () => {
    for (const section of SECTION_KEYS) {
      expect(functionById.get(`legacy:${section}`)?.sections).toEqual([section]);
      for (const action of ACTIONS) expect(inventory.cells.some(c => c[0] === section && c[1] === action)).toBe(true);
    }
    for (const tile of inventory.tiles) {
      expect((tile[3] as string[]).length, String(tile[0])).toBeGreaterThan(0);
      for (const id of tile[3] as string[]) expect(functionById.has(id)).toBe(true);
    }
    for (const [route, id] of inventory.routes) expect(functionById.get(String(id))?.routes.some(r => r[0] === route)).toBe(true);
  });
  it("retains all controls and operation records including navigation-unlinked evidence", () => {
    const controls = new Set(inventory.functions.flatMap(f => f.controls));
    expect(controls.size).toBe(2995);
    const names = new Set(inventory.functions.flatMap(f => f.operations));
    for (const operation of inventory.operations) expect(names.has(operation[0]), operation[0]).toBe(true);
    expect(inventory.functions.filter(f => f.classification === "api-only")).toHaveLength(80);
    expect(inventory.functions.filter(f => f.classification === "legacy-unreachable")).toHaveLength(2);
    expect(functionById.get("BoqItemRecipes")?.classification).toBe("embedded");
    expect(functionById.has("PermissionMigrationAudit")).toBe(true);
  });
  it("retains baseline hashes and no raw handlers/HTML/event definitions in the client", () => {
    for (const [name, hash] of Object.entries(inventory.provenance)) {
      const actual = createHash("sha256").update(readFileSync(`reports/user-perm-redesign01/${name}`)).digest("hex");
      expect(hash, name).toBe(actual);
    }
    const json = readFileSync("client/src/components/permissions/inventory.generated.json", "utf8");
    for (const pattern of ["=>", "<div", "<table", "queryFn:", "mutationFn:", "await fetch", "sendPushToAudience(", "req.body", "storage.ensure"]) {
      expect(json.includes(pattern), pattern).toBe(false);
    }
    expect(inventory.apiCalls.every(c => String(c[1]).length < 100)).toBe(true);
  });
  it("classifies non-user functions without executable per-user background switches", () => {
    expect(capabilitiesFor("system:background")).toEqual([]);
    expect(capabilitiesFor("system:notification")).toEqual([]);
    expect(capabilitiesFor("DprDetails")).toEqual([]);
    expect(inventory.operations.some(o => o[3] === "privileged/conditional")).toBe(true);
    expect(inventory.operations.some(o => o[3] === "auth/legacy/unresolved")).toBe(true);
  });
});

describe("legacy draft preservation and preview separation", () => {
  it("changes one active legacy bit and preserves hidden and unknown fields", () => {
    const before = emptyMatrix();
    before.site_hub.export = true;
    before.site_dprs.notify = true;
    const withUnknown = Object.assign(before, { preservedFutureField: { enabled: true } });
    const next = editLegacyCell(withUnknown, "site_dprs", "view", true, () => true);
    expect(changedCells(before, next)).toEqual([{ section: "site_dprs", action: "view", before: false, after: true }]);
    expect(next.site_hub.export).toBe(true);
    expect(next.site_dprs.notify).toBe(true);
    expect(next.site_hub).toBe(before.site_hub);
    expect((next as unknown as { preservedFutureField: unknown }).preservedFutureField).toEqual({ enabled: true });
    expect(before.site_dprs.view).toBe(false);
  });
  it("does not enable unavailable, retained unwired or delegation-capped cells", () => {
    const matrix = emptyMatrix();
    expect(availableActions("hmp_operations")).toEqual([]);
    expect(editLegacyCell(matrix, "hmp_operations", "create", true, () => true)).toBe(matrix);
    expect(editLegacyCell(matrix, "site_dprs", "view", true, () => false)).toBe(matrix);
    expect(editLegacyCell(matrix, "vendor_bill_aliases", "view", true, () => true)).toBe(matrix);
  });
  it("serializes only the existing matrix/designation contract", () => {
    const matrix = emptyMatrix();
    const previews = { "site_requirements.allocate_labour": "deny" as const, "operation.84": "allow" as const };
    expect(previewChanges(previews)).toHaveLength(2);
    expect(legacySaveBody(matrix)).toBe(matrix);
    expect(legacySaveBody(matrix, null)).toEqual({ matrix, businessRole: null });
    const body = JSON.stringify(legacySaveBody(matrix, "project_manager"));
    expect(body).not.toContain("operation.");
    expect(body).not.toContain("inherit");
    expect(body).not.toContain("deny");
    expect(body).not.toContain("site_requirements.allocate_labour");
  });
  it("explains compatible OR alternatives instead of claiming revocation", () => {
    const matrix = emptyMatrix();
    matrix.site_procurement.approve = true;
    const result = legacyBitExplanation(matrix, "purchase_indents_approve", "approve");
    expect(result.stillAllowed).toBe(true);
    expect(result.alternatives).toEqual([["site_procurement", "approve"]]);
    expect(result.label).toContain("compatible OR");
  });
  it("keeps generic operation unions conditional, never proves OR from different methods", () => {
    for (const node of inventory.functions) {
      for (const capability of capabilitiesFor(node.id)) {
        expect(capability.semantics).toBe("conditional");
        if (capability.id.startsWith("operation.") && capability.sources.length) expect(capability.authority).toContain("do not infer OR/AND");
      }
    }
  });
  it("makes preview deny and allow visibly non-enforcing without mutating the matrix", () => {
    const matrix = emptyMatrix();
    matrix.labour_management.create = true;
    const capability = capabilitiesFor("SiteRequirementsList").find(c => c.id === "site_requirements.allocate_labour")!;
    const snapshot = JSON.stringify(matrix);
    expect(capabilityPreview(capability, matrix, matrix, "deny").effective).toContain("backend unchanged");
    expect(capabilityPreview(capability, matrix, matrix, "allow").proposed).toContain("proposed only");
    expect(JSON.stringify(matrix)).toBe(snapshot);
  });
  it("shares proposed state across requirement pages and operation entry points", () => {
    expect(canonicalCapabilityId("SiteRequirementsList", "allocate_labour")).toBe(canonicalCapabilityId("MyPlans", "allocate_labour"));
    expect(canonicalCapabilityId("VendorBills", "operation:38")).toBe(canonicalCapabilityId("RateCards", "operation:38"));
    expect(canonicalCapabilityId("SiteEntry", "submit")).toBe(canonicalCapabilityId("GuidedDpr", "submit"));
    const node = functionById.get("SiteRequirementsList")!;
    expect(node.locations.some(l => l[0] === "Equipment & Fleet")).toBe(true);
    expect(node.locations.some(l => l[0] === "Stores & Inventory")).toBe(true);
  });
  it("searches actual tab/control labels and returns shared proposed changes", () => {
    const matrix = emptyMatrix();
    const programme = functionById.get("WorkProgramme")!;
    expect(nodeMatches(programme, "gantt", "all", matrix, matrix, {})).toBe(true);
    const preview = { "site_requirements.allocate_labour": "deny" as const };
    for (const id of ["SiteRequirementsList", "SiteRequirementNew", "MyPlans"]) {
      expect(nodeMatches(functionById.get(id)!, "", "changed", matrix, matrix, preview)).toBe(true);
    }
    expect(nodeMatches(functionById.get("VendorBills")!, "unmatched xyz", "all", matrix, matrix, {})).toBe(false);
  });
  it("distinguishes observed concurrent matrix conflicts from unchanged refetch", () => {
    const matrix = emptyMatrix();
    expect(hasObservedConflict(matrix, undefined)).toBe(false);
    expect(hasObservedConflict(matrix, structuredClone(matrix))).toBe(false);
    const latest = emptyMatrix(); latest.site_hub.view = true;
    expect(hasObservedConflict(matrix, latest)).toBe(true);
  });
  it("all ten actual templates remain explicit proposals and cannot erase unowned grants", () => {
    expect(ROLE_TEMPLATES).toHaveLength(10);
    for (const template of ROLE_TEMPLATES) {
      const before = emptyMatrix(); before.site_hub.export = true;
      const snapshot = JSON.stringify(before);
      const proposed = proposeRole(before, applyRoleTemplate(template.id), "replace", (s, a) => !(s === "site_hub" && a === "export"));
      expect(JSON.stringify(before), template.id).toBe(snapshot);
      expect(proposed.matrix.site_hub.export, template.id).toBe(true);
    }
  });
});
