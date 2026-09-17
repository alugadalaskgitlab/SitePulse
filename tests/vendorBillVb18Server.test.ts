import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  createVendorBillRequestSchema,
  normalizeVendorBillAdditionalAdjustments,
  vendorBillAdditionalAdjustmentSchema,
  vendorBills,
} from "../shared/schema";

describe("VB18 server vendor-bill adjustment contract", () => {
  it("adds a nullable JSONB adjustment list with an empty-array database default", () => {
    const columns = getTableColumns(vendorBills) as any;
    expect(columns.additionalAdjustments.name).toBe("additional_adjustments");
    expect(columns.additionalAdjustments.notNull).toBe(false);
    expect(columns.additionalAdjustments.hasDefault).toBe(true);
  });

  it("accepts finite signed amounts and trims non-empty labels", () => {
    expect(vendorBillAdditionalAdjustmentSchema.parse({
      label: "  CASH ADVANCE  ",
      amount: -1250.5,
    })).toEqual({ label: "CASH ADVANCE", amount: -1250.5 });
    expect(vendorBillAdditionalAdjustmentSchema.parse({
      label: "CREDIT",
      amount: 42,
    })).toEqual({ label: "CREDIT", amount: 42 });
  });

  it("rejects blank labels and non-finite amounts", () => {
    expect(() => vendorBillAdditionalAdjustmentSchema.parse({ label: " ", amount: 1 })).toThrow();
    expect(() => vendorBillAdditionalAdjustmentSchema.parse({ label: "BAD", amount: Number.NaN })).toThrow();
    expect(() => vendorBillAdditionalAdjustmentSchema.parse({ label: "BAD", amount: Number.POSITIVE_INFINITY })).toThrow();
  });

  it("normalizes legacy null/missing values and request omissions to []", () => {
    expect(normalizeVendorBillAdditionalAdjustments(null)).toEqual([]);
    expect(normalizeVendorBillAdditionalAdjustments(undefined)).toEqual([]);
    const parsed = createVendorBillRequestSchema.parse({
      billDate: "2026-09-17",
      billNo: "CLIENT-IGNORED",
      billType: "material",
      vendorName: "TEST VENDOR",
      items: [],
    });
    expect(parsed.additionalAdjustments).toEqual([]);
  });
});