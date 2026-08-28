import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertCreateEither } from "../server/auth-routes";

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

  it("uses operational usage and maintenance without a duplicate attendance table", () => {
    expect(routes).toContain("storage.getEquipmentUsage({ equipmentId: statement.equipmentId");
    expect(routes).toContain("storage.getMaintenanceLogs({ equipmentId: statement.equipmentId");
    expect(schema).not.toContain('pgTable("hire_attendance"');
  });
});