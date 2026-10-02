// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import PurchaseIndents from "@/pages/PurchaseIndents";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    isAdmin: true, isOwner: true, isAuthenticated: true,
    sectionCan: () => true, sectionVisible: () => true, canApprove: () => true,
    user: { id: 1, fullName: "SYNTHETIC REVIEWER" }, permissions: {},
  }),
}));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyName: "Synthetic", licensedModules: [], rmcEnabled: true }) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({ getPlantBackLink: () => "/plant/operations" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-persisted-filters", async () => await import("./fixtures/pi01/mock-persisted-filters"));

let calls: Array<{ method: string; path: string; body?: any }>;
const orderedItem = {
  id: 101, indentId: 1, description: "WMM", spec: null, partNo: null,
  qty: 1500, uom: "MT", purpose: "SITE", priority: "normal", materialId: null,
  estRate: null as number | null, estAmount: null as number | null, requiredBy: "2020-01-15", procurementRoute: "material",
  purchaseStatus: "ordered", vendor: "SYNTHETIC VENDOR", rate: 875,
  orderedQty: 1500, qtyPurchased: 1500, totalPurchasedQty: 1500, deliveredQty: 600,
  receivingLocation: "site", receivingSiteId: 11, deliveryEvidence: [], deliveryWarnings: [],
};
const indent = {
  id: 1, indentNo: "SYNTHETIC/PI/0004", date: "2027-02-10",
  proposedBy: "SYNTHETIC REQUESTER", raisedBy: "SYNTHETIC ENGINEER",
  remarks: "ORIGINAL REMARKS", status: "ordered", storesStatus: "bypassed",
  siteId: 11, raisedFrom: "ALLADURG", piType: "material",
  approvedBy: "SYNTHETIC APPROVER", approvedAt: "2027-02-10T09:00:00Z",
  createdAt: "2027-02-10T08:00:00Z", items: [orderedItem],
};
let fixtureIndent: typeof indent;

beforeEach(() => {
  queryClient.clear();
  calls = [];
  fixtureIndent = structuredClone(indent);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: RequestInit) => {
    const path = String(input);
    const method = String(init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    let value: any = [];
    if (path === "/api/purchase-indents" && method === "GET") value = [fixtureIndent];
    else if (path === "/api/purchase-indents/1") value = method === "PUT" ? { ...fixtureIndent, remarks: body.remarks } : fixtureIndent;
    else if (path === "/api/sites") value = [{ id: 11, name: "ALLADURG", isActive: true }];
    else if (method !== "GET") throw new Error(`Unexpected synthetic write: ${method} ${path}`);
    return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });

async function openEdit() {
  render(<QueryClientProvider client={queryClient}><PurchaseIndents /></QueryClientProvider>);
  fireEvent.click(await screen.findByTestId("card-indent-1"));
  fireEvent.click(await screen.findByTestId("button-edit-indent-purchase"));
  await screen.findByTestId("button-submit-indent");
}
async function submit() {
  fireEvent.click(screen.getByTestId("button-submit-indent"));
  await waitFor(() => expect(calls.some(call => call.method === "PUT")).toBe(true));
  return calls.find(call => call.method === "PUT")!.body;
}

describe("PI-01 B1 existing item identities through the actual edit form", () => {
  it("round-trips the persisted ID on an ordered-item no-op update", async () => {
    await openEdit();
    const payload = await submit();
    expect(payload.items[0]).toMatchObject({ id: 101, description: "WMM", qty: 1500, uom: "MT" });
    expect(payload.items[0]).not.toHaveProperty("vendor");
    expect(payload.items[0]).not.toHaveProperty("purchaseStatus");
    expect(payload.items[0]).not.toHaveProperty("orderedQty");
  });
  it("retains the item ID when only General Remarks changes", async () => {
    await openEdit();
    fireEvent.change(screen.getByTestId("input-remarks"), { target: { value: "corrected remarks" } });
    const payload = await submit();
    expect(payload.remarks).toBe("CORRECTED REMARKS");
    expect(payload.items.map((row: any) => row.id)).toEqual([101]);
  });
  it("omits the ID for a newly added row while preserving the existing one", async () => {
    await openEdit();
    fireEvent.click(screen.getByTestId("button-add-item"));
    fireEvent.change(screen.getByTestId("input-item-desc-1"), { target: { value: "NEW SYNTHETIC ITEM" } });
    const payload = await submit();
    expect(payload.items[0].id).toBe(101);
    expect(payload.items[1].description).toBe("NEW SYNTHETIC ITEM");
    expect(payload.items[1]).not.toHaveProperty("id");
    expect(calls.filter(call => call.method !== "GET")).toHaveLength(1);
  });
  it("preserves persisted zero estimates on an ordered-item no-op update", async () => {
    fixtureIndent.items[0] = { ...fixtureIndent.items[0], estRate: 0, estAmount: 0 };
    await openEdit();
    const payload = await submit();
    expect(payload.items[0]).toMatchObject({ id: 101, estRate: 0, estAmount: 0 });
  });
  it("preserves a historical required-by date on an urgent no-op update", async () => {
    fixtureIndent.items[0].priority = "urgent";
    await openEdit();
    const payload = await submit();
    expect(payload.items[0]).toMatchObject({ id: 101, priority: "urgent", requiredBy: "2020-01-15" });
  });
  it("still permits deliberately clearing a date through the existing date input", async () => {
    await openEdit();
    const dateInput = document.querySelector('input[type="date"][value="2020-01-15"]')!;
    fireEvent.change(dateInput, { target: { value: "" } });
    const payload = await submit();
    expect(payload.items[0]).not.toHaveProperty("requiredBy");
  });
});