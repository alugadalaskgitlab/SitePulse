// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import PurchaseIndents from "@/pages/PurchaseIndents";

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    isAdmin: true, isOwner: true, isAuthenticated: true,
    sectionCan: () => true, sectionVisible: () => true, featureCan: () => true, canApprove: () => true,
    user: { id: 1, fullName: "SYNTHETIC REVIEWER" }, permissions: {},
  }),
}));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyName: "Synthetic", licensedModules: [], rmcEnabled: true }) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({ getPlantBackLink: () => "/plant/operations" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }) }));
vi.mock("@/hooks/use-persisted-filters", async () => await import("./fixtures/pi01/mock-persisted-filters"));

let calls: Array<{ method: string; path: string; body?: any }>;
let plantMaterialList: any[];
let materialCreateStatus: number;
let materialCreateBody: any;
let createdMaterial: any;
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
  toastSpy.mockClear();
  plantMaterialList = [];
  materialCreateStatus = 201;
  materialCreateBody = null;
  createdMaterial = { id: 77, name: "SYNTHETIC NEW MATERIAL", category: "Electricals", defaultUom: "METERS", isActive: 1 };
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
    else if (path === "/api/plant-module/materials" && method === "GET") value = plantMaterialList;
    else if (path === "/api/plant-module/materials" && method === "POST") {
      if (materialCreateStatus >= 400) {
        return new Response(JSON.stringify(materialCreateBody), { status: materialCreateStatus, headers: { "Content-Type": "application/json" } });
      }
      createdMaterial = { ...createdMaterial, ...body };
      plantMaterialList = [...plantMaterialList, createdMaterial];
      return new Response(JSON.stringify(createdMaterial), { status: materialCreateStatus, headers: { "Content-Type": "application/json" } });
    }
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
async function openNewMaterialDialogFromIndent(name: string) {
  await openEdit();
  fireEvent.change(screen.getByTestId("input-item-desc-0"), { target: { value: name } });
  fireEvent.mouseDown(await screen.findByTestId("option-add-new-store-item"));
  await screen.findByTestId("button-save-new-store-item");
}
async function finishNewMaterialBasics(category = "Electricals") {
  fireEvent.click(screen.getByTestId("select-new-store-item-category"));
  fireEvent.click(await screen.findByRole("option", { name: category }));
  fireEvent.click(screen.getByTestId("select-new-store-item-route"));
  fireEvent.click(await screen.findByRole("option", { name: /Stores \/ spares \/ tools \/ consumables/i }));
}

describe("PI-01 B1 existing item identities through the actual edit form", () => {
  it("shows the purchase next step on the indent card and detail", async () => {
    fixtureIndent.status = "approved";
    fixtureIndent.piType = "stores";
    fixtureIndent.items[0].purchaseStatus = "";
    fixtureIndent.items[0].procurementRoute = "stores";
    render(<QueryClientProvider client={queryClient}><PurchaseIndents /></QueryClientProvider>);

    expect(await screen.findByTestId("button-next-purchase-1")).toHaveTextContent("Next: Purchase");
    fireEvent.click(await screen.findByTestId("card-indent-1"));
    expect(await screen.findByTestId("button-procurement-next-purchase")).toHaveTextContent("Next: Purchase");
    expect(screen.getByTestId("text-procurement-next-step")).toHaveTextContent("Next: Purchase");
  });

  it("opens the draft GRN from the indent next step", async () => {
    fixtureIndent.status = "awaiting_delivery";
    fixtureIndent.piType = "stores";
    fixtureIndent.items[0] = {
      ...fixtureIndent.items[0],
      procurementRoute: "stores",
      purchaseStatus: "purchased",
      grnReceivedQty: 0,
      grnHasHistory: true,
      grnDocuments: [{ id: 55, grnNumber: "STORE/26-27/0055", status: "draft" }],
    } as any;
    render(<QueryClientProvider client={queryClient}><PurchaseIndents /></QueryClientProvider>);

    fireEvent.click(await screen.findByTestId("card-indent-1"));
    const nextStep = await screen.findByTestId("button-indent-next-receive");
    expect(nextStep).toHaveTextContent("Open GRN STORE/26-27/0055");
    expect(nextStep.closest("a")).toHaveAttribute("href", expect.stringContaining("/stores/grns/55?"));
    expect(screen.getByTestId("text-indent-next-step")).toHaveTextContent("Waiting for delivery → Receive material");
  });

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

  it("creates and links a material from the purchase-indent item form without sending isActive", async () => {
    await openNewMaterialDialogFromIndent("POWER CABLE 35 SQ MM");
    await finishNewMaterialBasics();
    fireEvent.click(screen.getByTestId("button-save-new-store-item"));

    await waitFor(() => expect(calls.some(call => call.method === "POST" && call.path === "/api/plant-module/materials")).toBe(true));
    const createCall = calls.find(call => call.method === "POST" && call.path === "/api/plant-module/materials")!;
    expect(createCall.body).toMatchObject({ name: "POWER CABLE 35 SQ MM", category: "Electricals", defaultUom: "MT", procurementRoute: "stores" });
    expect(createCall.body).not.toHaveProperty("isActive");

    const updateBody = await submit();
    expect(updateBody.items[0]).toMatchObject({ description: "POWER CABLE 35 SQ MM", materialId: 77 });
  });

  it("creates and links a new material from the GRN dialog as a plant-material line", async () => {
    fixtureIndent.items[0].purchaseStatus = "purchased";
    fixtureIndent.items[0].qtyPurchased = 600;
    render(<QueryClientProvider client={queryClient}><PurchaseIndents /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-indent-1"));
    fireEvent.click(await screen.findByTestId("button-create-grn"));
    const search = await screen.findByTestId("input-grn-item-search-0");
    fireEvent.focus(search);
    fireEvent.mouseDown(await screen.findByTestId("button-grn-add-catalogue-0"));
    await screen.findByTestId("button-save-new-store-item");
    fireEvent.click(screen.getByTestId("select-new-store-item-route"));
    fireEvent.click(await screen.findByRole("option", { name: /Stores \/ spares \/ tools \/ consumables/i }));
    fireEvent.click(screen.getByTestId("button-save-new-store-item"));

    await waitFor(() => expect(calls.some(call => call.method === "POST" && call.path === "/api/plant-module/materials")).toBe(true));
    const createCall = calls.find(call => call.method === "POST" && call.path === "/api/plant-module/materials")!;
    expect(createCall.body).toMatchObject({ name: "WMM", category: "Spares", defaultUom: "MT", procurementRoute: "stores" });
    expect(createCall.body).not.toHaveProperty("isActive");
    expect(await screen.findByTestId("badge-linked-0")).toBeInTheDocument();
  });

  it("shows strict-schema validation details returned by the server", async () => {
    materialCreateStatus = 400;
    materialCreateBody = {
      message: "Invalid request body",
      errors: { formErrors: [], fieldErrors: { defaultUom: ["Unit is required"] } },
    };
    await openNewMaterialDialogFromIndent("INVALID MATERIAL");
    await finishNewMaterialBasics();
    fireEvent.click(screen.getByTestId("button-save-new-store-item"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      title: "Error adding material",
      description: "defaultUom: Unit is required",
      variant: "destructive",
    });
  });

  it("shows a clear pick-from-list message for server duplicate-name errors", async () => {
    materialCreateStatus = 409;
    materialCreateBody = { message: "Material name already exists" };
    await openNewMaterialDialogFromIndent("DUPLICATE MATERIAL");
    await finishNewMaterialBasics();
    fireEvent.click(screen.getByTestId("button-save-new-store-item"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      title: "A material with this name already exists — pick it from the list",
      variant: "destructive",
    });
  });
});