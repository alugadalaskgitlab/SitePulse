import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("equipment allocation lifecycle and view contracts", () => {
  const storage = read("server/storage.ts");

  it("persists allocations in create, replacement, clone, and version paths", () => {
    expect(storage.match(/persistEquipmentActivityAllocationsTx\(/g)?.length).toBeGreaterThanOrEqual(6);
    expect(storage).toContain("preserveOmittedEquipmentAllocationsTx");
    expect(storage).toContain("equipmentLogId: logs[index].id");
    expect(storage).toContain("equipment: { with: { activityAllocations: true } }");
  });

  it("keeps the DPR BOQ project in submitted edit/version payloads", () => {
    const source = read("client/src/pages/SiteEdit.tsx");
    expect(source).toContain("boqProjectId: siteBoqProjectId ?? dpr?.boqProjectId ?? undefined");
  });

  it("keeps diesel and canonical equipment finalization parent-level", () => {
    const persistHelper = storage.slice(
      storage.indexOf("private async persistEquipmentActivityAllocationsTx"),
      storage.indexOf("private async _createEquipmentUsageTxn"),
    );
    expect(persistHelper).not.toContain("processDprEquipmentDieselLedger");
    expect(persistHelper).not.toContain("finalizeDprEquipmentUsageTx");
    expect(persistHelper).not.toContain("calculateHireGroup");
  });

  it("L/M/N: uses the same allocation component in Guided, Classic, and Edit DPR", () => {
    const compact = read("client/src/components/DprEquipmentCompact.tsx");
    expect(compact).toContain("<EquipmentActivityAllocationEditor");
    for (const page of ["GuidedDpr.tsx", "SiteEntry.tsx", "SiteEdit.tsx"]) {
      const source = read(`client/src/pages/${page}`);
      expect(source).toContain("<DprEquipmentCompact");
      expect(source).toContain("boqItems=");
    }
  });

  it("O/P: renders allocations in submitted and manager/admin views", () => {
    const report = read("client/src/pages/SiteReport.tsx");
    expect(report).toContain("<DprEquipmentCompact");
    expect(report).toContain("boqItems={reportBoqItems}");
    expect(read("client/src/pages/AdminReports.tsx")).toContain("activityAllocations");
  });

  it("Work Demand uses child-authoritative/legacy-fallback resolution", () => {
    const source = read("client/src/pages/WorkDemand.tsx");
    expect(source).toContain("resolveEquipmentBoqHours");
    expect(source).toContain("allocation.source === \"legacy_parent\"");
  });

  it("Q: does not add permission or authentication handling to allocation code", () => {
    for (const path of [
      "shared/equipmentActivityAllocations.ts",
      "client/src/components/EquipmentActivityAllocationEditor.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toMatch(/sectionCan|permission|authenticate|session/i);
    }
  });

  it("surfaces allocation validation as a typed 422 response on every DPR write path", () => {
    const routes = read("server/routes.ts");
    expect(routes).toContain("res.status(422).json({ code: err.code, message: err.message })");
    expect(routes.match(/handleEquipmentActivityAllocationError\(err, res\)/g)?.length).toBeGreaterThanOrEqual(5);
  });
});