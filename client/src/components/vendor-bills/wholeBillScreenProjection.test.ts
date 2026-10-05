import { describe, expect, it } from "vitest";
import { projectWholeBillScreenSections } from "./wholeBillScreenProjection";
import type { BillExportRow } from "./wholeBillSnapshot";

const row = (date: string, description: string, amount: number): BillExportRow => ({
  date, category: "labour", description, qty: 3.2, unit: "HEAD-DAY", rate: 172.31, amount,
});
describe("existing screen date / labour ordering reuse", () => {
  it("sorts dates like BillDateGroupRows, stable row order, missing dates last, and supplied type subtotal unchanged", () => {
    const [section] = projectWholeBillScreenSections([{
      category: "labour", subtotal: 913.73, rowGroups: [{ rows: [
        row("2026-10-04", "Second date", 17.13), row("", "No date", 11.37),
        row("2026-08-01", "First date row one", 31.49), row("2026-08-01", "First date row two", 47.21),
      ] }],
    }], date => date || "-");
    expect(section.groups.map(group => group.label)).toEqual(["2026-08-01", "2026-10-04", "Missing date"]);
    expect(section.groups[0].rows.map(item => item.description)).toEqual(["First date row one", "First date row two"]);
    expect(section.groups[0].subtotal).toBe(31.49 + 47.21);
    expect(section.subtotal).toBe(913.73);
  });
  it("keeps supplied labour source grouping instead of globally sorting sources", () => {
    const [section] = projectWholeBillScreenSections([{
      category: "labour", subtotal: 17.31, rowGroups: [
        { label: "DPR Site Labour", rows: [row("2026-10-04", "Site", 12.31)] },
        { label: "Plant Shift Manpower", rows: [row("2026-08-01", "Plant", 5)] },
      ],
    }], date => date || "-");
    expect(section.groups[0].label).toBe("DPR Site Labour · 2026-10-04");
    expect(section.groups[1].label).toBe("Plant Shift Manpower · 2026-08-01");
  });
});