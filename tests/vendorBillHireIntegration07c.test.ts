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
    expect(client).toContain("Excluded ${covered.length} raw activity row");
    expect(client).toContain("Removed ${covered.length} raw activity row");
  });

  it("keeps monthly activity out of ordinary auto-items while retaining grouped review", () => {
    expect(storage).toContain('if ((entryType || "").toLowerCase() === "monthly") return false');
    expect(storage).toContain('if (entryTypeFilter === "daily_hourly") return ["daily", "hourly", "time_meter"].includes(et)');
    expect(storage).toContain('if (entryTypeFilter === "trip_based") return et === "trip_based"');
    expect(client).toContain("EQUIPMENT HIRE WORKING SHEET · {activityDays.length} DATES");
  });

  it("loads authoritative diesel purchase evidence and freezes calculated recovery", () => {
    expect(storage).toContain("dieselPurchaseRates");
    expect(storage).toContain('eq(dieselRequirements.status, "purchased")');
    expect(storage).toContain("lte(dieselRequirements.date, periodTo)");
    expect(storage).toContain("dieselPurchases,");
    expect(storage).toContain("dieselRecoveryFinalAmount: calc.diesel.finalRecoveryAmount");
  });

  it("serializes draft reconciliation against lifecycle transitions", () => {
    expect(storage.match(/from\(vendorBills\).*?for\("update"\)/gs)?.length).toBeGreaterThanOrEqual(3);
    expect(storage.match(/from\(hireStatements\).*?for\("update"\)/gs)?.length).toBeGreaterThanOrEqual(3);
    expect(storage).toContain("const linkedStatements: HireStatement[]");
    expect(storage).toContain("A verified, approved, or paid hire bill cannot be deleted");
  });
});