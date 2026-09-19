import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("task1479 backend BOQ credit integration", () => {
  const storage = readFileSync("server/storage.ts", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");

  it("routes every backend actual aggregation through row-aware shared credit", () => {
    const reported = storage.slice(
      storage.indexOf("async getReportedQtyByBar"),
      storage.indexOf("async getProgrammeBarOutcomeEventCounts"),
    );
    const planActual = storage.slice(
      storage.indexOf("async getPlanVsActual"),
      storage.indexOf("// ─── BOQ Item Recipes"),
    );
    expect(reported).toContain("entryBoqCredit(");
    expect(planActual).toContain("entryBoqCredit(");
    expect(reported).not.toContain("quantity} * coalesce");
    expect(planActual).not.toContain("SUM(pe.quantity * COALESCE");
    expect(planActual).not.toContain("SUM(dsi.quantity * COALESCE");
    expect(planActual).toContain("actualIncomplete");
    expect(planActual).toContain("conversionWarnings");
    expect(planActual).not.toContain("actualReviewRequired");
  });

  it("never seeds a customer-specific item factor at startup", () => {
    const ensure = routes.slice(
      routes.indexOf("async function ensureBoqDprConversionFactor"),
      routes.indexOf("async function ensureDprEntryKeyColumns"),
    );
    expect(ensure).not.toContain("WHERE id = 13");
    expect(ensure).not.toContain("SET dpr_conversion_factor = 0.0001");
  });

  it("keeps admin physical normalization separate from BOQ credit", () => {
    const validator = routes.slice(
      routes.indexOf("async function validateVersionProgressGeometry"),
      routes.indexOf("function equipmentLifecycleIdentityConflict"),
    );
    expect(validator).toContain("resolveDprUnitConversion(");
    expect(validator).toContain("Physical input normalization");
    expect(validator).not.toContain("boqItem as any).dprConversionFactor");
  });

  it("accepts known method-null Ha conversion but rejects custom factors without provenance", async () => {
    const { boqConversionConfigError } = await import("../server/boqConversionConfig");
    expect(boqConversionConfigError(
      { unit: "Ha", dprMeasurementMethod: null, dprConversionFactor: null },
      { dprConversionFactor: 0.0001 },
    )).toBeNull();
    expect(boqConversionConfigError(
      { unit: "Sqm", dprMeasurementMethod: null, dprConversionFactor: null },
      { unit: "Ha", dprConversionFactor: null },
    )).toBeNull();
    expect(boqConversionConfigError(
      { unit: "MT", dprMeasurementMethod: null, dprConversionFactor: null },
      { dprConversionFactor: 2 },
    )).toMatch(/Ignored stale conversion factor/i);
    expect(boqConversionConfigError(
      { unit: "Sqm", dprMeasurementMethod: null, dprConversionFactor: null },
      { dprConversionFactor: 0.0001 },
    )).toMatch(/Ignored stale conversion factor/i);
    expect(boqConversionConfigError(
      { unit: "MT", dprMeasurementMethod: "NOS_manual", dprConversionFactor: 2 },
      { dprConversionFactor: null },
    )).toMatch(/explicit NOS→MT conversion profile factor/i);
    expect(boqConversionConfigError(
      { unit: "MT", dprMeasurementMethod: "NOS_manual", dprConversionFactor: 2 },
      { dprConversionFactor: 1 },
    )).toMatch(/explicit non-identity factor/i);
  });
});