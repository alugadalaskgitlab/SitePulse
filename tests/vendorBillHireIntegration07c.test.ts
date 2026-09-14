import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("07C vendor-bill hire transaction wiring", () => {
  const schema = readFileSync("shared/schema.ts", "utf8");
  const storage = readFileSync("server/storage.ts", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");
  const client = readFileSync("client/src/pages/VendorBills.tsx", "utf8");

  it("has a unique nullable item-to-statement link", () => {
    expect(schema).toContain('hireStatementId: integer("hire_statement_id")');
    expect(schema).toContain('uniqueIndex("vendor_bill_items_hire_statement_uq")');
    expect(schema).toContain("vendor_bill_items_hire_statement_id_hire_statements_id_fk");
  });

  it("recalculates only draft groups under the established equipment advisory lock", () => {
    expect(storage).toContain("reconcileVendorBillHireGroups");
    expect(storage).toContain('bill.status !== "draft"');
    expect(storage).toContain("pg_advisory_xact_lock(1426");
    expect(storage).toContain("calculateHireGroup({ terms");
    expect(storage).toContain("A hire group cannot claim another bill's statement");
  });

  it("retains non-hire compatibility while reconciling explicit groups", () => {
    expect(storage).toContain("data.hireGroups === undefined");
    expect(storage).toContain("isNull(vendorBillItems.hireStatementId)");
    expect(storage).toContain("hireStatementId: null");
    expect(storage).toContain('["hire_statement", "hire_group"]');
    expect(storage).toContain("totalAmount = Math.round");
  });

  it("synchronizes linked statement statuses with the bill lifecycle", () => {
    expect(storage).toContain('status === "verified" ? "reviewed"');
    expect(storage).toContain('status === "approved" ? "approved"');
    expect(storage).toContain('status === "paid" ? "billed"');
    expect(storage).toContain("const statementStatus = status === \"paid\" ? \"billed\"");
    expect(storage).toContain('filter(statement => statement.status !== "billed")');
    expect(storage).not.toContain('status === "paid"\n          ? eq(hireStatements.vendorBillId, id)');
    expect(storage).toContain("getHireReviewGaps");
    expect(storage).toContain("Complete the hire review before verification");
  });

  it("closes edit and permission bypasses around linked hire bills", () => {
    expect(storage).toContain("Edits to a bill with linked hire statements must include its hire groups");
    expect(storage).toContain('existing.status !== "draft"');
    expect(routes).toContain('assertCreateEither(req, res, "vendor_bills_raise", "vendor_bills")');
  });

  it("rejects raw auto rows covered by hire groups without touching manual rows", () => {
    expect(storage.match(/rawAutoItemCoveredByHireGroup\(item, data\.hireGroups\)/g)?.length).toBe(2);
    expect(storage).toContain("is already covered by a hire group for this bill");
    expect(client).toContain("availableOtherBillItems(mappedAutoItems, lineItems, hireGroups)");
    expect(client).toContain("Removed ${covered.length} raw activity row");
  });

  it("keeps monthly activity out of ordinary auto-items while retaining grouped review", () => {
    expect(storage).toContain('if ((entryType || "").toLowerCase() === "monthly") return false');
    expect(storage).toContain('if (entryTypeFilter === "daily_hourly") return ["daily", "hourly", "time_meter"].includes(et)');
    expect(storage).toContain('if (entryTypeFilter === "trip_based") return et === "trip_based"');
    expect(client).toContain("HistoricalHireWorkingSheet");
  });

  it("keeps Pull Items additive and derives its count from final eligibility", () => {
    expect(client).toContain("availableOtherBillItems(mappedAutoItems, lineItems, hireGroups)");
    expect(client).toContain("setLineItems(prev => mergeOtherBillItems(");
    expect(client).toContain("mapped,");
    expect(client).not.toContain("setLineItems(uncovered)");
    expect(client).toContain("PULL ALL ${availableOtherItems.length}");
    expect(client).toContain("candidatePullGroups");
    expect(client).toContain('const isGrouped = billType === "all" || billType === "equipment"');
    expect(client).not.toContain('const singleType = billType === "equipment"');
  });

  it("keeps source-qualified auto evidence read-only and visibly marked as auto", () => {
    expect(client).toContain('const isAutoLineSource = (source: string) => source === "auto" || source.startsWith("auto:")');
    expect(client.match(/isGeneratedEvidenceLine\(item\.source\)/g)).toHaveLength(3);
    expect(client).toContain("isAutoLineSource(item.source) ? \"AUTO\" : \"-\"");
  });

  it("keeps historical hire snapshots readable without restoring the removed composer", () => {
    expect(client).toContain("HistoricalHireWorkingSheet");
    expect(client).toContain("EQUIPMENT HIRE CALCULATION SNAPSHOT");
    expect(client).toContain('isHistoricalHireEdit && billType === "equipment"');
    expect(client).not.toContain("false &&");
    expect(client).not.toContain("EDIT QTY / AMOUNT");
    expect(client).toContain("historicalHireBillId");
    expect(client).toContain("setHistoricalHireBillId(persisted.length > 0 ? bill.id : null)");
    expect(client).toContain("setHireGroups(prev => prev.map(group => ({ ...group, periodFrom: value })))");
    expect(client).toContain("setHireGroups(prev => prev.map(group => ({ ...group, periodTo: value })))");
    expect(client).not.toContain("setHireGroups([]); }\n                 }} data-testid=\"input-period-from\"");
    expect(client).not.toContain("setHireGroups([]); }\n                 }} data-testid=\"input-period-to\"");
  });

  it("retains the historical working-sheet snapshot as read-only evidence", () => {
    expect(client).toContain("HistoricalHireWorkingSheet");
    expect(client).toContain("HSD ACTUAL / EXPECTED");
    expect(client).toContain("FINAL RECOVERY");
  });

  it("routes itemized equipment details through the shared PDF action", () => {
    expect(client).toContain("const hasPersistedHireStatements = Array.isArray");
    expect(client).toContain("!hasPersistedHireStatements");
    expect(client).toContain('data-testid="button-export-pdf"');
    expect(client).toContain('href = `/api/vendor-bills/${bill.id}/pdf`');
  });

  it("loads authoritative diesel purchase evidence and freezes calculated recovery", () => {
    expect(storage).toContain("dieselPurchaseRates");
    expect(storage).toContain('eq(dieselRequirements.status, "purchased")');
    expect(storage).toContain("lte(dieselRequirements.date, periodTo)");
    expect(storage).toContain("dieselPurchases,");
    expect(storage).toContain("dieselRecoveryFinalAmount: calc.diesel.finalRecoveryAmount");
  });

  it("keeps the historical equipment editor's terms, fuel, daily activity, and exports", () => {
    expect(client).toContain('data-testid="equipment-hire-straight-form"');
    expect(client).toContain('data-testid="select-equipment-hire"');
    expect(client).toContain('data-testid="select-equipment-hire-project"');
    expect(client).toContain("<Select value={selectedHireEquipmentId ? String(selectedHireEquipmentId) : \"\"} disabled>");
    expect(client).toContain("View Daily Activity");
    expect(client).toContain("EquipmentHireExportButtons");
    expect(client).toContain("Trip Candidate Review");
    expect(storage).toContain("computeEquipmentUsage(equipmentDefault, row)");
    expect(storage).toContain("? Number(row.expectedDiesel)");
    expect(storage).toContain(": calculated.expectedDiesel");
    expect(client).toContain("Tank Readings N/A");
  });

  it("does not put Equipment Master hire-term validation on the shared new-bill flow", () => {
    expect(client).not.toContain("const configuredHireBasis = (value: unknown): HireBillingBasis | null");
    expect(client).not.toContain('["monthly", "daily", "trip"].includes(eq.hireBillingBasis) ? eq.hireBillingBasis : "daily"');
    expect(client).not.toContain('eq.hireBillingBasis === "daily" ? "Daily Hire Available" : "Monthly Hire Available"');
    expect(client).not.toContain("Correct the Equipment Master hire terms first.");
    expect(storage).toContain("Hire group basis must match the Equipment Master hire billing basis");
  });

  it("supports hourly hire end-to-end and prevents duplicate overlapping groups", () => {
    expect(schema).toContain('basis: z.enum(["monthly", "daily", "hourly", "trip"])');
    expect(client).toContain('group.basis === "hourly" ? "HRS" : "TRIPS"');
    expect(client).toContain("hireGroups.map(group =>");
    expect(client).toContain("historicalHireBillId === editingBillId");
    expect(storage).toContain('group.basis === "hourly" ? "HRS" : "TRIPS"');
    expect(storage).toContain("Hire groups for the same equipment cannot overlap");
    expect(storage).toContain('source: "hire_statement"');
    expect(storage).toContain("is already covered by a hire group for this bill");
  });

  it("serializes draft reconciliation against lifecycle transitions", () => {
    expect(storage.match(/from\(vendorBills\).*?for\("update"\)/gs)?.length).toBeGreaterThanOrEqual(3);
    expect(storage.match(/from\(hireStatements\).*?for\("update"\)/gs)?.length).toBeGreaterThanOrEqual(3);
    expect(storage).toContain("const linkedStatements: HireStatement[]");
    expect(storage).toContain("A verified, approved, or paid hire bill cannot be deleted");
  });
});