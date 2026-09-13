import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const report = readFileSync("client/src/pages/EquipmentPerformanceReport.tsx", "utf8");
const master = readFileSync("client/src/pages/Plant.tsx", "utf8");
const shell = readFileSync("client/src/components/HubShell.tsx", "utf8");

describe("EQUIP-07 equipment performance UI contract", () => {
  it("uses the canonical Equipment Master formatter while keeping equipmentId values", () => {
    expect(report).toContain('import { formatEquipmentOptionLabel } from "@shared/equipmentLabel";');
    expect(report).toContain("label: formatEquipmentOptionLabel(item)");
    expect(report).toContain("{item.label ?? item.name ?? item}");
    expect(report).toContain("value={String(item.id ?? item.value ?? item)}");
    expect(report).toContain("value={filters.equipmentId}");
  });

  it("renders no historical card for zero pending rows and keeps the pending card conditional", () => {
    expect(master).toContain("if (!canReview || rows.length === 0) return null;");
    expect(master).toContain('data-testid="equipment-needing-identification"');
    expect(master).not.toContain("Previously Identified DPR Equipment");
    expect(master).not.toContain("previously-identified-equipment-corrections");
  });

  it("keeps the report inside the sidebar content area and scrolls only its wide table", () => {
    expect(report).toContain('<div className="space-y-6" data-testid="page-equipment-performance">');
    expect(report).not.toContain("equip-shell");
    expect(report).not.toContain("-mx-4");
    expect(report).not.toContain("md:-mx-8");
    expect(report).not.toContain("min-h-[100dvh]");
    expect(report).toContain('data-testid="equipment-performance-table-scroll"');
    expect(report).toContain("min-w-[1550px]");
    expect(shell).toContain("md:pl-56 min-h-screen");
    expect(shell).toContain("min-w-0 flex-1 overflow-auto");
  });

  it("keeps the Reports Hub breadcrumb, roomy filter grid, columns, and drilldown contract", () => {
    expect(report).toContain('href="/reports/hub"');
    expect(report).toContain('data-testid="link-reports-hub"');
    expect(report).toContain('ChevronRight as Crumb');
    expect(report).toContain("xl:grid-cols-8");
    expect(report).toContain('label="Owner / Vendor"');
    expect(report).toContain('selectOptions(report.data, "owners")');
    expect(report).toContain('<th className="px-4 py-2.5">Equipment</th><th>Owned / Hired</th><th>Owner / Vendor</th>');
    expect(report).toContain("Consumption Rate");
    expect(report).toContain('colSpan={14}');
    expect(report).toContain('data-testid="equipment-performance-table-scroll"');
    expect(report).toContain("function MachineDialog");
    expect(report).toContain("Daily details");
    expect(report).toContain("View Source Records");
  });
});