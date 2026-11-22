import { describe, expect, it } from "vitest";
import {
  contextKeyForReturnPath,
  purchaseIndentReturnPath,
  resolveInternalReturnTo,
  storesGrnListQuery,
} from "../client/src/lib/procurementNavigation";

describe("purchase and GRN navigation context", () => {
  it("returns purchase indents to their originating section, with finance as the direct-entry default", () => {
    expect(purchaseIndentReturnPath({ context: "stores" })).toBe("/stores/hub");
    expect(purchaseIndentReturnPath({ context: "hmp" })).toBe("/plant/hub");
    expect(purchaseIndentReturnPath({ context: "site" })).toBe("/site/hub");
    expect(purchaseIndentReturnPath({ context: "finance" })).toBe("/finance/hub");
    expect(purchaseIndentReturnPath({ tab: "operations" })).toBe("/plant/hub");
    expect(purchaseIndentReturnPath({})).toBe("/finance/hub");
    expect(purchaseIndentReturnPath({ origin: "portal" })).toBe("/");
    expect(purchaseIndentReturnPath({ returnTo: "/stores/grns?statusMode=finalized" })).toBe("/stores/grns?statusMode=finalized");
  });

  it("defaults store screens to the Stores Hub and preserves safe requested destinations", () => {
    expect(resolveInternalReturnTo(null, "/stores/hub")).toBe("/stores/hub");
    expect(resolveInternalReturnTo("/stores?tab=items", "/stores/hub")).toBe("/stores?tab=items");
    expect(contextKeyForReturnPath("/finance/hub")).toBe("finance");
    expect(contextKeyForReturnPath("/reports/hub")).toBe("reports");
    expect(contextKeyForReturnPath("/plant/hub")).toBe("hmp");
    expect(contextKeyForReturnPath("/stores/hub")).toBe("stores");
  });

  it("keeps all GRN list filters and the originating context when opening and closing details", () => {
    const query = storesGrnListQuery({
      returnTo: "/stores/hub",
      context: "stores",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-22",
      indentRef: "HLC/PI/26-27/0001",
      supplier: "Vendor A",
      siteId: "8",
      statusMode: "pending_receipt",
      category: "Electricals",
      item: "Cable",
    });
    const params = new URLSearchParams(query);
    expect([...params.keys()]).toEqual([
      "returnTo", "context", "dateFrom", "dateTo", "indentRef",
      "supplier", "siteId", "statusMode", "category", "item",
    ]);
    expect(params.get("returnTo")).toBe("/stores/hub");
    expect(params.get("indentRef")).toBe("HLC/PI/26-27/0001");
    expect(params.get("statusMode")).toBe("pending_receipt");
    expect(params.get("item")).toBe("Cable");
  });
});
