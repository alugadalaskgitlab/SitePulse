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
    expect(storage).toContain('ne(hireStatements.status, "billed")');
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
    expect(client).toContain("WORKING / MEASUREMENT SHEET — {activityDays.length} DAYS");
  });

  it("keeps Pull Other Items additive and derives its count from final eligibility", () => {
    expect(client).toContain("availableOtherBillItems(mappedAutoItems, lineItems, hireGroups)");
    expect(client).toContain("setLineItems(prev => mergeOtherBillItems(");
    expect(client).toContain("mapped,");
    expect(client).not.toContain("setLineItems(uncovered)");
    expect(client).toContain("PULL ${availableOtherItems.length} OTHER ITEM");
  });

  it("keeps source-qualified auto evidence read-only and visibly marked as auto", () => {
    expect(client).toContain('const isAutoLineSource = (source: string) => source === "auto" || source.startsWith("auto:")');
    expect(client.match(/isGeneratedEvidenceLine\(item\.source\)/g)).toHaveLength(3);
    expect(client).toContain("isAutoLineSource(item.source) ? \"AUTO\" : \"-\"");
  });

  it("presents part-month monthly hire as calendar days rather than one month", () => {
    expect(client).toContain("${periodDays}/${calendarDays} CALENDAR DAYS");
    expect(client).toContain("CONTRACT DIVISOR: ${customDivisor} DAYS");
    expect(client).toContain("CONTRACT DIVISOR: 30 DAYS");
    expect(client).toContain("EDIT QTY / AMOUNT");
    expect(client).not.toContain('result.quantity.toFixed(2)} MONTHS');
  });

  it("shows recorded descriptions as primary evidence and computed no-activity separately", () => {
    expect(client).toContain("RECORDED ACTIVITY");
    expect(client).toContain('<span className="font-semibold text-muted-foreground">NO ACTIVITY</span>');
    expect(client).toContain('Number(day.activityCount || 0) > 0');
    expect(client).toContain("TOTAL TRIPS");
    expect(client).toContain("NET HSD VARIANCE");
  });

  it("loads authoritative diesel purchase evidence and freezes calculated recovery", () => {
    expect(storage).toContain("dieselPurchaseRates");
    expect(storage).toContain('eq(dieselRequirements.status, "purchased")');
    expect(storage).toContain("lte(dieselRequirements.date, periodTo)");
    expect(storage).toContain("dieselPurchases,");
    expect(storage).toContain("dieselRecoveryFinalAmount: calc.diesel.finalRecoveryAmount");
  });

  it("surfaces hire equipment directly and derives missing expected diesel from existing activity norms", () => {
    expect(client).toContain("Monthly Hire Available");
    expect(client).toContain("ADD TO BILL");
    expect(client).toContain("ADD HIRE ITEM");
    expect(client).not.toContain("> ADD GROUP");
    expect(storage).toContain("computeEquipmentUsage(equipmentDefault, row)");
    expect(storage).toContain("? Number(row.expectedDiesel)");
    expect(storage).toContain(": calculated.expectedDiesel");
    expect(client).toContain("Expected diesel unavailable — review norm/activity");
  });

  it("serializes draft reconciliation against lifecycle transitions", () => {
    expect(storage.match(/from\(vendorBills\).*?for\("update"\)/gs)?.length).toBeGreaterThanOrEqual(3);
    expect(storage.match(/from\(hireStatements\).*?for\("update"\)/gs)?.length).toBeGreaterThanOrEqual(3);
    expect(storage).toContain("const linkedStatements: HireStatement[]");
    expect(storage).toContain("A verified, approved, or paid hire bill cannot be deleted");
  });
});