import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyMatrix, type Action, type PermissionMatrix, type SectionKey } from "../shared/permissions";

const purchaseIndents = readFileSync("client/src/pages/PurchaseIndents.tsx", "utf8");
const irnList = readFileSync("client/src/pages/irn/IrnListPage.tsx", "utf8");
const dieselRequirements = readFileSync("client/src/pages/DieselRequirements.tsx", "utf8");
const materialReceipts = readFileSync("client/src/pages/PlantMaterialReceipts.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const storesHub = readFileSync("client/src/pages/StoresHub.tsx", "utf8");

// Exercise the actual page guard expressions with the same sectionCan API
// provided by auth-context, without mounting data-fetching pages.
function pageGuard(source: string, name: string, permissions: PermissionMatrix, isAdmin = false): boolean {
  const expression = source.match(new RegExp(`const ${name} = ([^;]+);`))?.[1];
  if (!expression) throw new Error(`Missing page guard: ${name}`);
  const sectionCan = (section: SectionKey, action: Action) => !!permissions[section]?.[action];
  return Function("sectionCan", "isAdmin", "isOwnerOrAdmin", `return (${expression});`)(
    sectionCan, isAdmin, isAdmin,
  ) as boolean;
}

function grant(section: SectionKey, action: Action): PermissionMatrix {
  const permissions = emptyMatrix();
  permissions[section][action] = true;
  return permissions;
}

describe("PERM-01 client raise gates", () => {
  it("permits both granular-only and legacy-only purchase-indent creation and editing independently", () => {
    for (const [section, action] of [
      ["purchase_indents_raise", "create"],
      ["site_procurement", "create"],
    ] as const) {
      const permissions = grant(section, action);
      expect(pageGuard(purchaseIndents, "canCreate", permissions)).toBe(true);
      expect(pageGuard(irnList, "canProcure", permissions)).toBe(true);
    }
    for (const [section, action] of [
      ["purchase_indents_raise", "edit"],
      ["site_procurement", "edit"],
    ] as const) {
      expect(pageGuard(purchaseIndents, "canEdit", grant(section, action))).toBe(true);
    }
    expect(pageGuard(purchaseIndents, "canEdit", grant("purchase_indents_raise", "create"))).toBe(false);
    expect(pageGuard(purchaseIndents, "canCreate", grant("purchase_indents_raise", "edit"))).toBe(false);
    expect(pageGuard(purchaseIndents, "canCreate", grant("purchase_indents_view", "view"))).toBe(false);
    expect(pageGuard(purchaseIndents, "canEdit", grant("purchase_indents_view", "view"))).toBe(false);
  });

  it("permits both granular-only and legacy-only diesel creation and editing independently", () => {
    for (const [section, action] of [
      ["diesel_req_raise", "create"],
      ["site_diesel", "create"],
    ] as const) {
      expect(pageGuard(dieselRequirements, "canCreate", grant(section, action))).toBe(true);
    }
    for (const [section, action] of [
      ["diesel_req_raise", "edit"],
      ["site_diesel", "edit"],
    ] as const) {
      const permissions = grant(section, action);
      expect(pageGuard(dieselRequirements, "canEdit", permissions)).toBe(true);
      expect(pageGuard(dieselRequirements, "canEditDiesel", permissions)).toBe(true);
      expect(pageGuard(materialReceipts, "canRecordStandaloneDiesel", permissions)).toBe(true);
    }
    expect(pageGuard(dieselRequirements, "canEdit", grant("diesel_req_raise", "create"))).toBe(false);
    expect(pageGuard(dieselRequirements, "canEditDiesel", grant("diesel_req_raise", "create"))).toBe(false);
    expect(pageGuard(materialReceipts, "canRecordStandaloneDiesel", grant("diesel_req_raise", "create"))).toBe(false);
    expect(pageGuard(dieselRequirements, "canCreate", grant("diesel_req_raise", "edit"))).toBe(false);
    expect(pageGuard(dieselRequirements, "canCreate", grant("diesel_req_view", "view"))).toBe(false);
    expect(pageGuard(dieselRequirements, "canEdit", grant("diesel_req_view", "view"))).toBe(false);
  });

  it("keeps approval separate from raise while honoring diesel legacy edit access", () => {
    expect(pageGuard(dieselRequirements, "canApprove", grant("diesel_req_raise", "create"))).toBe(false);
    expect(pageGuard(dieselRequirements, "canApprove", grant("diesel_req_approve", "approve"))).toBe(true);
    expect(pageGuard(dieselRequirements, "canApprove", grant("site_diesel", "edit"))).toBe(true);
    expect(purchaseIndents).toContain('canApprove("purchase_indents_approve")');
  });

  it("opens both routes for raise-only users and shows the Stores PI entry", () => {
    expect(app).toMatch(/gatedEither\(PurchaseIndents, "purchase_indents_view", "site_procurement", "purchase_indents_raise"\)/);
    expect(app).toMatch(/gatedEither\(DieselRequirements, "diesel_req_view", "site_diesel", "diesel_req_raise"\)/);
    expect(storesHub).toMatch(/const canPi = .*sectionVisible\("purchase_indents_raise"\)/);
  });
});