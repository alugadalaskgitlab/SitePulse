import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertCreateEither } from "../server/auth-routes";
import { calculateHireBilling } from "../shared/hireBilling";

describe("07B hired equipment billing lifecycle wiring", () => {
  const schema = readFileSync("shared/schema.ts", "utf8");
  const storage = readFileSync("server/storage.ts", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");

  it("keeps hire terms on the existing equipment master and snapshots statements separately", () => {
    expect(schema).toContain('hireBillingBasis: text("hire_billing_basis")');
    expect(schema).toContain('hireOperatorResponsibility: text("hire_operator_responsibility")');
    expect(schema).toContain('export const hireStatements = pgTable("hire_statements"');
    expect(schema).toContain('export const hireStatementExceptions = pgTable("hire_statement_exceptions"');
    expect(schema).toContain('equipmentPeriodUq: uniqueIndex("hire_statements_equipment_period_uq")');
    expect(schema).toContain('revision: integer("revision").notNull().default(0)');
  });

  it("serializes overlapping statement creation and protects lifecycle transitions", () => {
    expect(storage).toContain("pg_advisory_xact_lock(1426");
    expect(storage).toContain("lte(hireStatements.periodFrom, data.periodTo)");
    expect(storage).toContain("gte(hireStatements.periodTo, data.periodFrom)");
    expect(storage).toContain('.for("update")');
    expect(storage).toContain("current.revision !== expectedRevision");
    expect(routes).toContain("storage.transitionHireStatement(id, expected.expectedRevision");
    expect(routes).toContain("revision: statement.revision");
    expect(routes).toContain("body.expectedRevision");
    expect(storage).toContain("created: false");
  });

  it("creates one idempotently linked existing-format vendor bill line", () => {
    expect(storage).toContain("if (statement.vendorBillId)");
    expect(storage).toContain('if (statement.status !== "approved")');
    expect(routes).toContain('source: "hire_statement"');
    expect(routes).toContain('assertCreateEither(req, res, "vendor_bills_raise", "vendor_bills")');
    expect(routes).toContain('assertView(req, res, "plant_equipment")');
    expect(storage).toContain('vendorBillId: bill.id,');
    expect(storage).toContain('status: "draft",');
    expect(storage).toContain("revision: statement.revision + 1");
  });

  it("allows linked bill creation through granular or legacy vendor-bill create permission", () => {
    const response = () => {
      const result: any = { statusCode: 200, body: undefined };
      result.status = (code: number) => { result.statusCode = code; return result; };
      result.json = (body: unknown) => { result.body = body; return result; };
      return result;
    };
    const request = (permissions: Record<string, { create: boolean }>) => ({
      authUser: { isAdmin: false, isOwner: false },
      authPermissions: permissions,
    }) as any;

    expect(assertCreateEither(request({ vendor_bills_raise: { create: true } }), response(), "vendor_bills_raise", "vendor_bills")).toBe(true);
    expect(assertCreateEither(request({ vendor_bills: { create: true } }), response(), "vendor_bills_raise", "vendor_bills")).toBe(true);

    const denied = response();
    expect(assertCreateEither(request({}), denied, "vendor_bills_raise", "vendor_bills")).toBe(false);
    expect(denied.statusCode).toBe(403);
  });

  it("calculates statement figures from operational usage and records maintenance for review without duplicate attendance", () => {
    const input = {
      terms: { billingBasis: "hourly" as const, rate: 250, breakdownDeductionEnabled: true },
      periodFrom: "2025-04-11",
      periodTo: "2025-04-12",
      usage: [
        { id: 101, date: "2025-04-11", status: "closed", hoursOrKmRun: 2.5 },
        { id: 102, date: "2025-04-12", status: "closed", hoursOrKmRun: 1.5 },
      ],
      maintenance: [{
        id: 7, date: "2025-04-11", eventType: "breakdown",
        description: "Hydraulic hose repair", downtimeHours: 2,
      }],
    };
    const statement = calculateHireBilling(input);
    expect(statement).toMatchObject({
      quantity: 4,
      grossAmount: 1000,
      deductionAmount: 0,
      netAmount: 1000,
      requiresReview: true,
    });
    expect(statement.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: "maintenance", sourceId: 7, exceptionType: "breakdown", downtimeHours: 2 }),
    ]));
    expect(calculateHireBilling({ ...input, usage: [] }).grossAmount).toBe(0);
    expect(schema).not.toContain('pgTable("hire_attendance"');
  });

  it("keeps equipment-hire discovery separate from generic activity discovery and freezes saved financial snapshots", () => {
    expect(routes).toContain('"/api/vendor-bills/equipment-hire-discovery"');
    expect(routes).toContain('storage.getEquipmentHireVendors(query.periodFrom, query.periodTo)');
    expect(storage).toContain("async getEquipmentHireVendors(periodFrom: string, periodTo: string)");
    expect(storage).toContain("isEquipmentHireBillEligible(equipment, periodFrom, periodTo)");
    expect(storage).toContain("financials: snapshotFinancials,");
    expect(storage).toContain("const usesGrossBreakdownTaxBase = !statement");
    expect(storage).toContain("calculateEquipmentHireFinancialsLegacy");
    expect(storage).toContain("const financials = calculateFinancials({");
    expect(storage).toContain("meterType: equipment.meterType");
    expect(storage).toContain("consumptionNorm: equipment.consumptionNorm");
    expect(storage).toContain("dieselNormOverride: equipment.consumptionNorm");
    expect(storage).toContain('(statement.calculationSnapshot as any)?.billingIntegration === "vb10_automatic"');
  });
});