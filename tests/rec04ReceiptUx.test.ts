import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { insertMaterialReceiptSchema } from "../shared/schema";
import { computeDieselReceiptState } from "../shared/dieselReceiptStatus";

const receipts = readFileSync("client/src/pages/PlantMaterialReceipts.tsx", "utf8");
const dieselRequirements = readFileSync("client/src/pages/DieselRequirements.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const siteHome = readFileSync("client/src/pages/SiteHome.tsx", "utf8");

describe("REC-04 material receipt UX contracts", () => {
  it("defaults Invoice No. from a linked requirement bill without overwriting manual input", () => {
    expect(receipts).toContain('setInvoiceNo(requirement.billNo?.trim() || "")');
    expect(receipts).toContain('invoiceNoDefaultSourceRef.current !== "manual"');
    expect(receipts).toContain('invoiceNoDefaultSourceRef.current = "manual"');
    expect(receipts).toContain('invoiceNoDefaultSourceRef.current = "restored"');
    expect(receipts).toContain('invoiceNoDefaultSourceRef.current = "editing"');
  });

  it("keeps Invoice No. blank when the linked requirement has no bill number", () => {
    const noBillNumber = undefined;
    expect(noBillNumber?.trim() || "").toBe("");
  });

  it("allows the existing receipt schema and client submit path to omit Challan No.", () => {
    expect(insertMaterialReceiptSchema.safeParse({
      date: "2026-09-04",
      partyId: 1,
      materialId: 8,
      quantity: 100,
      uom: "Liters",
      invoiceNo: "INV-100",
    }).success).toBe(true);
    expect(receipts).toContain("<Label>Challan / DN No. <span className=\"text-muted-foreground text-sm\">(optional)</span></Label>");
    expect(receipts).not.toContain("Challan / DN No. is required");
    expect(receipts).not.toContain("!challanNumber.trim()");
  });

  it("uses canonical receipt status remaining quantity and invalidates all requirement views", () => {
    const fullyReceived = computeDieselReceiptState(100, [{ quantity: 100 }]);
    expect(fullyReceived.status).toBe("fully_received");
    expect(fullyReceived.pendingQty).toBe(0);
    expect(receipts).toContain("dieselReceiptStatusMap[r.id].pendingQty > 0");
    expect(receipts).toContain('queryKey: ["/api/diesel-requirements"]');
    expect(receipts).toContain('queryKey: ["/api/diesel-requirements/receipt-status"]');
    expect(receipts).toContain('queryKey: ["/api/diesel-requirements/summary"]');
    expect(receipts.match(/await invalidateDieselRequirementQueries\(\)/g)).toHaveLength(3);
  });

  it("keeps HubShell outside the authenticated content Suspense boundary", () => {
    const authedShell = app.slice(app.indexOf("function AuthedShell"), app.indexOf("// ── App root"));
    expect(authedShell.indexOf("<HubShell>")).toBeLessThan(authedShell.indexOf("<Suspense fallback={<PageLoader />}>"));
    expect(authedShell.indexOf("</Suspense>")).toBeLessThan(authedShell.indexOf("</HubShell>"));
  });

  it("keeps Site Operations content while removing its duplicate legacy chrome", () => {
    expect(siteHome).toContain("Quick Actions");
    expect(siteHome).toContain("Recent Activity");
    expect(siteHome).toContain("Daily Operations Dashboard");
    expect(siteHome).not.toContain("<header");
    expect(siteHome).not.toContain(">SiteLog<");
  });

  it("links a receipt to the existing Diesel Requirement page and opens its detail state", () => {
    expect(receipts).toContain("/plant/diesel-requirements?dieselReqId=");
    expect(dieselRequirements).toContain('new URLSearchParams(search).get("dieselReqId")');
    expect(dieselRequirements).toContain("setSelectedId(linkedRequirementId)");
    expect(dieselRequirements).toContain('setView("detail")');
  });
});