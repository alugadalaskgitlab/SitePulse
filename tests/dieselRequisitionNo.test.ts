import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dieselRequisitionNo } from "../shared/dieselRequisitionNo";

describe("DIESEL-02 display-only requisition numbers", () => {
  it.each([
    ["2026-11-22", 95, "DSL-REQ/26-27/0095"],
    ["2026-03-31", 1, "DSL-REQ/25-26/0001"],
    ["2026-04-01", 9999, "DSL-REQ/26-27/9999"],
    ["2027-03-01", 12345, "DSL-REQ/26-27/12345"],
  ])("uses the Indian financial year for %s", (date, id, expected) => {
    expect(dieselRequisitionNo({ id, date })).toBe(expected);
  });

  it("uses one formatter at all purchase/list/receipt/register/export display points", () => {
    const requirements = readFileSync("client/src/pages/DieselRequirements.tsx", "utf8");
    const receipt = readFileSync("client/src/pages/PlantMaterialReceipts.tsx", "utf8");
    const register = readFileSync("client/src/pages/StoresDieselRegister.tsx", "utf8");
    expect(requirements).toContain("{dieselRequisitionNo(req)}");
    expect(requirements.match(/dieselRequisitionNo\(selectedRequirement\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(requirements).toContain('"Requisition no.": dieselRequisitionNo(requirement)');
    expect(receipt).toContain("{dieselRequisitionNo(requirement)} · {requirement.date} · Purchased");
    expect(register).toContain("{dieselRequisitionNo(requirement)}");
  });
});
