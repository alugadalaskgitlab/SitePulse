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
    expect(report).not.toContain("-mx-4");
    expect(report).not.toContain("md:-mx-8");
    expect(report).toContain("min-w-0 max-w-full overflow-x-hidden");
    expect(report).toContain('data-testid="equipment-performance-table-scroll"');
    expect(report).toContain("min-w-[1550px]");
    expect(shell).toContain("md:pl-56 min-h-screen");
    expect(shell).toContain("min-w-0 flex-1 overflow-auto");
  });
});