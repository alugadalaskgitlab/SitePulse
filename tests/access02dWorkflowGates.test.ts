import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routes = readFileSync("server/routes.ts", "utf8");
const purchaseIndents = readFileSync("client/src/pages/PurchaseIndents.tsx", "utf8");
const grnPage = readFileSync("client/src/pages/StoresGrn.tsx", "utf8");
const scopePage = readFileSync("client/src/pages/ScopeSetup.tsx", "utf8");

function routeBlock(startMarker: string, endMarker: string) {
  const start = routes.indexOf(startMarker);
  const end = routes.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return routes.slice(start, end);
}

describe("ACCESS-02D workflow permission alignment", () => {
  it("uses PI Verify for stock and service verification, and PI Approve for decisions", () => {
    expect(routeBlock('app.patch("/api/purchase-indents/:id/stores-verify"', 'app.'))
      .toContain('assertFeatureAction(req, res, "purchase_indent", "verify")');
    expect(routeBlock('app.post("/api/purchase-indents/:id/service-completion"', 'app.'))
      .toContain('assertFeatureAction(req, res, "purchase_indent", "verify")');
    expect(routeBlock('app.patch("/api/purchase-indents/:id/approve"', 'app.'))
      .toContain('assertFeatureAction(req, res, "purchase_indent", "approve")');
    expect(purchaseIndents).toContain('featureCan("purchase_indent", "verify")');
    expect(purchaseIndents).toContain('featureCan("purchase_indent", "approve")');
    expect(purchaseIndents).toContain("canVerifyIndent");
  });

  it("uses Purchase Orders Approve for the PO queue and action controls", () => {
    expect(routes).toContain('if (!assertFeatureAction(req, res, "purchase_orders", "approve")) return;');
    expect(purchaseIndents).toContain('featureCan("purchase_orders", "approve")');
    expect(purchaseIndents).toContain("canApprovePurchaseOrder");
  });

  it("uses GRN Verify for finalisation and GRN Edit for draft changes", () => {
    const grnRoute = routeBlock('app.patch("/api/stores/grns/:id"', 'app.put("/api/stores/grns/:id"');
    expect(grnRoute).toContain('assertFeatureAction(req, res, "grn", "verify")');
    expect(grnRoute).toContain('assertFeatureAction(req, res, "grn", "edit")');
    expect(grnPage).toContain('featureCan("grn", "verify")');
    expect(grnPage).toContain('data-testid="button-finalise-grn"');
  });

  it("uses Programme Approve for confirming a scope record", () => {
    expect(routeBlock('app.post("/api/boq/scope-segments/:segId/confirm"', 'app.'))
      .toContain('assertFeatureAction(req, res, "boq_programme", "approve")');
    expect(scopePage).toContain('featureCan("boq_programme", "approve")');
    expect(scopePage).toContain("canConfirmScope");
  });
});
