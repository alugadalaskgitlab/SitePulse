import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { vendorBillStatusAction, normalizeVendorBillActorName } from "./vendorBillAccess";

describe("vendor bill lifecycle permissions", () => {
  it.each([
    ["draft", "edit"],
    ["verified", "technical_verify"],
    ["approved", "approve"],
    ["paid", "final"],
  ] as const)("requires %s -> %s access", (status, action) => {
    expect(vendorBillStatusAction(status)).toBe(action);
  });

  it("normalizes actor labels only for legacy bills without audit actor IDs", () => {
    expect(normalizeVendorBillActorName("  Audit   User ")).toBe("AUDIT USER");
    expect(normalizeVendorBillActorName(null)).toBe("");
  });

  it("uses the same lifecycle mapping for the server route and bill screen", () => {
    const server = readFileSync("server/routes.ts", "utf8");
    const screen = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    expect(server).toContain('vendorBillStatusAction(status)');
    expect(screen).toContain("vendorBillStatusAction(nextStatus)");
  });
});
