import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FeatureAction, FeatureId, FeatureTicks } from "../shared/featureAccess";

const purchaseIndents = readFileSync("client/src/pages/PurchaseIndents.tsx", "utf8");
const irnList = readFileSync("client/src/pages/irn/IrnListPage.tsx", "utf8");
const dieselRequirements = readFileSync("client/src/pages/DieselRequirements.tsx", "utf8");
const materialReceipts = readFileSync("client/src/pages/PlantMaterialReceipts.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const storesHub = readFileSync("client/src/pages/StoresHub.tsx", "utf8");

// Exercise actual page guard expressions with the feature permission API,
// without mounting data-fetching pages.
function pageGuard(source: string, name: string, permissions: FeatureTicks): boolean {
  const expression = source.match(new RegExp(`const ${name} = ([^;]+);`))?.[1];
  if (!expression) throw new Error(`Missing page guard: ${name}`);
  const featureCan = (feature: FeatureId, action: FeatureAction) => !!permissions[feature]?.[action];
  return Function("featureCan", `return (${expression});`)(
    featureCan,
  ) as boolean;
}

function grant(feature: FeatureId, action: FeatureAction): FeatureTicks {
  return { [feature]: { [action]: true } };
}

describe("PERM-01 client raise gates", () => {
  it("uses distinct PI add and edit actions", () => {
    expect(pageGuard(purchaseIndents, "canCreate", grant("purchase_indent", "add"))).toBe(true);
    expect(pageGuard(irnList, "canProcure", grant("purchase_indent", "add"))).toBe(true);
    expect(pageGuard(purchaseIndents, "canEdit", grant("purchase_indent", "edit"))).toBe(true);
    expect(pageGuard(purchaseIndents, "canEdit", grant("purchase_indent", "add"))).toBe(false);
    expect(pageGuard(purchaseIndents, "canCreate", grant("purchase_indent", "edit"))).toBe(false);
    expect(pageGuard(purchaseIndents, "canCreate", grant("purchase_indent", "view"))).toBe(false);
    expect(pageGuard(purchaseIndents, "canEdit", grant("purchase_indent", "view"))).toBe(false);
  });

  it("uses separate Diesel requirement add, edit and approval actions", () => {
    expect(pageGuard(dieselRequirements, "canCreate", grant("diesel_requirement", "add"))).toBe(true);
    expect(pageGuard(dieselRequirements, "canEdit", grant("diesel_requirement", "edit"))).toBe(true);
    expect(pageGuard(dieselRequirements, "canEditDiesel", grant("diesel_requirement", "edit"))).toBe(true);
    expect(pageGuard(materialReceipts, "canRecordStandaloneDiesel", grant("diesel_issue", "edit"))).toBe(true);
    expect(pageGuard(materialReceipts, "canRecordStandaloneDiesel", grant("plant_receipts", "add"))).toBe(true);
    expect(pageGuard(dieselRequirements, "canApprove", grant("diesel_requirement", "approve"))).toBe(true);
    expect(pageGuard(dieselRequirements, "canApprove", grant("diesel_requirement", "add"))).toBe(false);
    expect(pageGuard(dieselRequirements, "canEdit", grant("diesel_requirement", "add"))).toBe(false);
    expect(pageGuard(dieselRequirements, "canCreate", grant("diesel_requirement", "edit"))).toBe(false);
    expect(pageGuard(dieselRequirements, "canEdit", grant("diesel_requirement", "view"))).toBe(false);
    expect(pageGuard(dieselRequirements, "canCreate", grant("diesel_issue", "add"))).toBe(false);
  });

  it("keeps approval separate from Diesel entry", () => {
    expect(pageGuard(dieselRequirements, "canApprove", grant("diesel_issue", "add"))).toBe(false);
  });

  it("gates the pages and Stores entry with the corresponding feature", () => {
    expect(app).toMatch(/featureGated\(PurchaseIndents, "purchase_indent"\)/);
    expect(app).toMatch(/featureGated\(DieselRequirements, "diesel_requirement"\)/);
    expect(app.match(/featureGated\(VendorBills, "vendor_bills"\)/g)).toHaveLength(2);
    expect(storesHub).toContain('featureCan("purchase_indent", "view")');
  });
});