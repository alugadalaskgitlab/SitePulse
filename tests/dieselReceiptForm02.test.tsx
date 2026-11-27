// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PlantMaterialReceipts from "../client/src/pages/PlantMaterialReceipts";

const fx = vi.hoisted(() => ({
  search: "",
  material: { id: 41, name: "DIESEL", category: "Diesel", defaultUom: "Liters", packedUnitName: "Barrel", packedUnitVolumeLiters: 200 },
  materials: [] as any[],
  parties: [{ id: 7, name: "Fixture party" }],
  requirements: [{ id: 95, date: "2026-11-22", status: "purchased", qtyPurchased: 200, items: [] }],
  receiptStatus: { 95: { pendingQty: 200, status: "receipt_pending" } },
  empty: [],
  mutate: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("wouter", async importOriginal => ({ ...await importOriginal<typeof import("wouter")>(), useSearch: () => fx.search }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  featureCan: () => true, sectionCan: () => true, isOwner: true, isAdmin: true,
  user: { id: 7, fullName: "Fixture engineer" },
}) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({
  companyName: "Fixture", companyShortName: "Fixture", companyInfo: {}, defaultPlantName: "Fixture plant", ownCompanyPartyId: 99,
}) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({ getPlantBackLink: () => "/plant" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/hooks/use-upload", () => ({ useUpload: () => ({ uploadFile: vi.fn() }) }));
vi.mock("@/hooks/use-before-unload", () => ({ useBeforeUnload: () => ({ confirmLeave: () => true }) }));
vi.mock("@/hooks/use-autosave", () => ({ useAutosave: () => ({
  hasDraft: false, isDirty: false, clearDraft: vi.fn(), restoreDraft: vi.fn(), discardDraft: vi.fn(),
}) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/components/AttachmentGallery", () => ({ AttachmentGallery: () => null }));
vi.mock("@/components/AttachmentUploader", () => ({ AttachmentUploader: () => null }));
vi.mock("@/components/MaterialReceiptSlipActions", () => ({ MaterialReceiptSlipActions: () => null }));
// Native selects keep these page-behaviour tests independent of portal/pointer APIs.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => <select value={value} disabled={disabled} onChange={event => onValueChange?.(event.target.value)}>{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value, disabled }: any) => <option value={value} disabled={disabled}>{children}</option>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey: [path] }: any) => ({
    isLoading: false,
    data: path === "/api/plant-module/materials" ? fx.materials
      : path === "/api/plant-module/parties" ? fx.parties
      : path === "/api/diesel-requirements" ? fx.requirements
      : path === "/api/diesel-requirements/receipt-status" ? fx.receiptStatus
      : path === "/api/plant-module/next-receipt-number" ? { number: "FIXTURE-001" }
      : fx.empty,
  }),
  useMutation: () => ({ mutate: fx.mutate, isPending: false }),
}));

beforeEach(() => {
  fx.search = "?autoOpen=1&materialId=41&qty=100&dieselReqId=95";
  fx.material.name = "DIESEL";
  fx.material.category = "Diesel";
  fx.materials = [fx.material];
});
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); });

function selectParty() {
  fireEvent.change(screen.getByRole("option", { name: "Fixture party" }).closest("select")!, { target: { value: "7" } });
}

describe("DIESEL-02 receipt form (fixtures only)", () => {
  it.each(["DIESEL", "HSD"])("%s hides tank and barrel controls and saves a linked purchase in Liters", async name => {
    fx.material.name = name;
    render(<PlantMaterialReceipts />);
    expect(await screen.findByRole("option", { name: "DSL-REQ/26-27/0095 · 2026-11-22 · Purchased 200 L" })).toBeTruthy();
    expect(screen.queryByText(/Receiving tank/)).toBeNull();
    expect(screen.queryByText(/Bulk fuel must go into a tank/)).toBeNull();
    expect(screen.queryByTestId("packed-receipt-fields")).toBeNull();
    expect(screen.queryByText(/Set barrel weight/)).toBeNull();
    expect(screen.queryByText(/assigned to a tank/)).toBeNull();
    selectParty();
    fireEvent.click(screen.getByTestId("button-save-receipt"));
    await waitFor(() => expect(fx.mutate).toHaveBeenCalled());
    expect(fx.mutate.mock.calls.at(-1)?.[0]).toMatchObject({
      materialId: 41, quantity: 100, uom: "Liters", tankNumber: null, packedCount: null, linkedDieselRequirementId: 95,
    });
  });
  it.each(["BITUMEN", "LDO", "EMULSION"])("%s keeps its tank requirement, barrel option and messages", async name => {
    fx.material.name = name;
    fx.material.category = name;
    fx.search = "?autoOpen=1&materialId=41&qty=100";
    render(<PlantMaterialReceipts />);
    expect(await screen.findByText(/Receiving tank/)).toBeTruthy();
    expect(screen.getByText(/Bulk fuel must go into a tank/)).toBeTruthy();
    expect(screen.getByTestId("checkbox-receive-as-packed")).toBeTruthy();
    selectParty();
    fireEvent.click(screen.getByTestId("button-save-receipt"));
    expect(fx.mutate).not.toHaveBeenCalled();
    expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Receiving tank required" }));
    fireEvent.click(screen.getByTestId("checkbox-receive-as-packed"));
    expect(screen.getByText(/Standard volume: 200 L per barrel/)).toBeTruthy();
  });
});
