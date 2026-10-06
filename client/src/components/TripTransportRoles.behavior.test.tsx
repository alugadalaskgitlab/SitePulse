// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import type { EquipmentMasterType, SiteMaterialTrip } from "@shared/schema";
import SiteMaterialTrips from "@/pages/SiteMaterialTrips";
import { TripRoleEditDialog } from "@/components/TripRoleEditDialog";
import { TripTransportRoleFields } from "@/components/TripTransportRoleFields";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { existingTripVendorSuggestions, filterTripsByRole, resolveTripVendor, tripRoleDescription } from "./trip-role-utils";

const harness = vi.hoisted(() => ({
  search: "", toast: vi.fn(), request: vi.fn(), queries: [] as string[],
  lateAssociation: null as null | (() => void),
}));
vi.mock("@/lib/queryClient", async (original) => ({ ...await original<object>(), apiRequest: harness.request }));
vi.mock("wouter", () => ({
  useSearch: () => harness.search,
  useLocation: () => ["/site/material-trips", vi.fn()],
  Link: ({ children }: any) => <span>{children}</span>,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: harness.toast }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ sectionCan: () => true }) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyName: "HLC", logoFile: "logo.png" }) }));
vi.mock("@/hooks/use-upload", () => ({ useUpload: () => ({ uploadFile: vi.fn() }) }));
vi.mock("@/components/AttachmentGallery", () => ({ AttachmentGallery: () => null }));
vi.mock("@/components/CancelDialog", () => ({ default: () => null }));
vi.mock("@/components/HistoryDialog", () => ({ default: () => null }));
vi.mock("@/components/ReceiptWorkContext", () => ({
  EMPTY_WORK_CONTEXT: { boqProjectId: null, boqItemId: null, programmeBarId: null, earthworkArrangementId: null },
  hasRequiredWorkContext: (value: any) => value.boqItemId != null,
  TripWorkContextSummary: () => null,
  ReceiptWorkContext: ({ value, onChange, onArrangementPrefill }: any) => <div>
    <button type="button" onClick={() => onChange({ ...value, boqProjectId: 12, boqItemId: 29 })}>Choose intended item</button>
    <button type="button" onClick={() => { onChange({ ...value, earthworkArrangementId: 31 }); onArrangementPrefill({ material: "Soil", supplier: "SANGANNA", clientSupplied: true, external: false }); }}>Apply arrangement</button>
    <span data-testid="work-context-value">{JSON.stringify(value)}</span>
  </div>,
}));
vi.mock("@/components/VehicleSupplierAssociationNotice", () => ({
  VehicleSupplierAssociationNotice: ({ onSupplierApplied, site, vehicleNumber }: any) => {
    harness.lateAssociation = () => onSupplierApplied("NARASIMHULU", { site, vehicleNumber });
    return <button type="button" onClick={harness.lateAssociation}>Apply vehicle transporter</button>;
  },
}));
vi.mock("@/hooks/use-site-material-suggestions", async (original) => ({
  ...await original<object>(),
  invalidateSiteMaterialSuggestions: vi.fn(),
  useSiteMaterialSuggestions: () => ({
    suppliers: ["NARASIMHULU", "UNREGISTERED NAME"],
    materialSourceSuppliers: ["SANGANNA"],
    vehicles: ["TS15UF4308"],
    vehicleSuppliers: { TS15UF4308: { status: "linked", supplier: "NARASIMHULU", version: "v1" } },
    canCorrectVehicleSupplier: true, error: null,
  }),
}));
// Use a native select in behavioral tests; production keeps its existing Radix picker.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  return {
    Select: ({ value, onValueChange, children }: any) => {
      const trigger = React.Children.toArray(children).find((child: any) => child.props?.["data-testid"]) as any;
      return <select value={value} onChange={(event) => onValueChange(event.target.value)} data-testid={trigger?.props["data-testid"]}><option value="">Choose</option>{children}</select>;
    },
    SelectTrigger: () => null, SelectValue: () => null,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  };
});

const vendors = [{ id: 7, name: "SANGANNA" }, { id: 18, name: "NARASIMHULU" }];
const equipment = [{ id: 42, name: "TIPPER-03", registrationNumber: "TS09AB4321", ownership: "owned", isActive: 1 }] as EquipmentMasterType[];
function trip(overrides: Partial<SiteMaterialTrip> = {}): SiteMaterialTrip {
  return {
    id: 1, date: "2026-08-17", time: "10:21", site: "NH-44", material: "Soil", quantity: 14, uom: "Cum",
    transportType: "agency_vendor", materialSourceSupplier: "SANGANNA", materialSourceVendorId: 7,
    supplier: "SANGANNA", supplierVendorId: 7, vehicleNumber: "TS15UF4308", internalEquipmentId: null,
    ...overrides,
  } as SiteMaterialTrip;
}
const rows = [
  trip(),
  trip({ id: 2, supplier: "NARASIMHULU", supplierVendorId: 18 }),
  trip({ id: 3, transportType: "in_house", supplier: null, supplierVendorId: null, internalEquipmentId: 42, vehicleNumber: "TS09AB4321" }),
  trip({ id: 4, materialSourceSupplier: null, materialSourceVendorId: null, supplier: "NARASIMHULU", supplierVendorId: 18 }),
  trip({ id: 5, transportType: "in_house", internalEquipmentId: null, supplier: null, supplierVendorId: null }),
];
function renderPage() {
  return render(<QueryClientProvider client={queryClient}><SiteMaterialTrips /></QueryClientProvider>);
}
function setInput(id: string, value: string) {
  fireEvent.change(screen.getByTestId(id), { target: { value } });
}
async function ready() {
  await screen.findByTestId("row-trip-1");
  await waitFor(() => expect(screen.getByTestId("input-trip-material-source-supplier")).not.toBeDisabled());
}
function fillBasic() {
  setInput("select-trip-site", "NH-44");
  setInput("select-trip-material", "Soil");
  setInput("input-trip-material-source-supplier", "sanganna");
  setInput("input-trip-quantity", "14");
  setInput("input-trip-vehicle", "TS15UF4308");
  fireEvent.click(screen.getByText("Choose intended item"));
}
async function submit() {
  fireEvent.click(screen.getByTestId("button-submit-trip"));
  await waitFor(() => expect(harness.request).toHaveBeenCalledWith("POST", "/api/site-material-trips", expect.any(Object)));
  return harness.request.mock.calls.find((call) => call[0] === "POST")![2];
}

beforeEach(() => {
  harness.search = "";
  harness.request.mockReset();
  harness.toast.mockReset();
  harness.queries = [];
  harness.lateAssociation = null;
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, queryFn: async ({ queryKey }) => {
    const url = String(queryKey[0]);
    harness.queries.push(url);
    if (url === "/api/sites") return [{ id: 11, name: "NH-44", isActive: true }];
    if (url === "/api/vendor-master") return vendors;
    if (url === "/api/plant-module/equipment") return equipment;
    if (url.startsWith("/api/site-material-trips")) return url.includes("onlyUnassigned=true") ? rows.filter((row) => !row.materialSourceSupplier?.trim()) : rows;
    return [];
  } }, mutations: { retry: false } });
  harness.request.mockResolvedValue({ json: async () => ({ id: 101 }) });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) });
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });

describe("VB-SPLIT Parts A/B entry behavior", () => {
  it("A1 explicitly writes same existing vendor and ID into both columns; source wins over vehicle associations", async () => {
    renderPage(); await ready(); fillBasic();
    expect(screen.getByTestId("trip-role-same_party")).toBeChecked();
    const vehicle = screen.getByTestId("input-trip-vehicle");
    fireEvent.focus(vehicle);
    fireEvent.click(await screen.findByRole("option", { name: "TS15UF4308" }));
    const payload = await submit();
    expect(payload).toMatchObject({ materialSourceSupplier: "SANGANNA", materialSourceVendorId: 7, supplier: "SANGANNA", supplierVendorId: 7, transportType: "agency_vendor", internalEquipmentId: null, quantity: 14 });
    expect(harness.request).toHaveBeenCalledTimes(1);
    expect(harness.queries).toContain("/api/vendor-master");
  });

  it("A2 records a different existing transporter, uses vehicle suggestions, and saves vehicle number", async () => {
    renderPage(); await ready(); fillBasic();
    fireEvent.click(screen.getByTestId("trip-role-different_parties"));
    fireEvent.focus(screen.getByTestId("input-trip-vehicle"));
    fireEvent.click(await screen.findByRole("option", { name: "TS15UF4308" }));
    expect(screen.getByTestId("input-trip-supplier")).toHaveValue("NARASIMHULU");
    const payload = await submit();
    expect(payload).toMatchObject({ materialSourceSupplier: "SANGANNA", materialSourceVendorId: 7, supplier: "NARASIMHULU", supplierVendorId: 18, vehicleNumber: "TS15UF4308", transportType: "agency_vendor", internalEquipmentId: null });
  });

  it("a late transporter-association callback after switching to Same party cannot replace the source", async () => {
    renderPage(); await ready(); fillBasic();
    fireEvent.click(screen.getByTestId("trip-role-different_parties"));
    const delayedCallback = harness.lateAssociation;
    fireEvent.click(screen.getByTestId("trip-role-same_party"));
    delayedCallback?.();
    expect(screen.getByTestId("input-trip-material-source-supplier")).toHaveValue("SANGANNA");
    const payload = await submit();
    expect(payload).toMatchObject({ supplier: "SANGANNA", supplierVendorId: 7, materialSourceVendorId: 7 });
  });

  it("A3 requires equipment-master selection and writes NULL transporter columns and master vehicle number", async () => {
    renderPage(); await ready(); fillBasic();
    fireEvent.click(screen.getByTestId("trip-role-different_parties"));
    const delayedCallback = harness.lateAssociation;
    fireEvent.click(screen.getByTestId("trip-role-in_house"));
    delayedCallback?.();
    expect(screen.queryByTestId("input-trip-vehicle")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-submit-trip"));
    expect(harness.request).not.toHaveBeenCalled();
    expect(harness.toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: "Choose our own vehicle from the equipment master." }));
    setInput("select-trip-internal-equipment", "42");
    const payload = await submit();
    expect(payload).toMatchObject({ materialSourceSupplier: "SANGANNA", materialSourceVendorId: 7, supplier: null, supplierVendorId: null, transportType: "in_house", internalEquipmentId: 42, vehicleNumber: "TS09AB4321" });
  });

  it("blocks unregistered/ambiguous names, blank source, and same vendor under Another transporter", async () => {
    renderPage(); await ready(); fillBasic();
    for (const name of ["", "UNREGISTERED NAME"]) {
      setInput("input-trip-material-source-supplier", name);
      fireEvent.click(screen.getByTestId("button-submit-trip"));
      expect(harness.request).not.toHaveBeenCalled();
    }
    setInput("input-trip-material-source-supplier", "SANGANNA");
    fireEvent.click(screen.getByTestId("trip-role-different_parties"));
    setInput("input-trip-supplier", "SANGANNA");
    fireEvent.click(screen.getByTestId("button-submit-trip"));
    expect(harness.request).not.toHaveBeenCalled();
    expect(harness.toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: "Choose a different transporter, or select Same party." }));
    expect(() => resolveTripVendor("SANGANNA", [...vendors, { id: 19, name: " sanganna " }])).toThrow(/multiple/);
  });

  it("A6 repeat entry preserves material, roles, work context, arrangement, unloading, location and UoM while clearing truck-specific fields", async () => {
    renderPage(); await ready(); fillBasic();
    fireEvent.click(screen.getByText("Apply arrangement"));
    setInput("select-trip-unloaded-at", "yard");
    setInput("input-trip-yard-label", "YARD A");
    setInput("input-trip-receipt", "CH-28");
    setInput("select-trip-worktype", "road");
    setInput("select-trip-uom", "Cum");
    const payload = await submit();
    expect(payload).toMatchObject({ unloadedAt: "yard", yardLabel: "YARD A", earthworkArrangementId: 31, boqProjectId: 12, boqItemId: 29, workType: "road", receiptNumber: "CH-28", uom: "Cum", materialSourceSupplier: "SANGANNA" });
    await waitFor(() => expect(screen.getByTestId("input-trip-quantity")).toHaveValue(null));
    expect(screen.getByTestId("input-trip-vehicle")).toHaveValue("");
    expect(screen.getByTestId("input-trip-receipt")).toHaveValue("");
    expect(screen.getByTestId("select-trip-material")).toHaveValue("Soil");
    expect(screen.getByTestId("input-trip-material-source-supplier")).toHaveValue("SANGANNA");
    expect(screen.getByTestId("input-trip-yard-label")).toHaveValue("YARD A");
    expect(screen.getByTestId("select-trip-worktype")).toHaveValue("road");
    expect(screen.getByTestId("work-context-value")).toHaveTextContent('"earthworkArrangementId":31');
  });

  it("A6 PI query prefill links IDs, preserves remaining context and stretch location in the payload", async () => {
    harness.search = "?piIndentId=53&piItemId=87&pendingReceiptId=92&material=Soil&supplier=SANGANNA&qty=14&uom=Cum&site=NH-44";
    renderPage(); await ready();
    expect(screen.getByTestId("input-trip-material-source-supplier")).toHaveValue("SANGANNA");
    setInput("input-trip-vehicle", "TS15UF4308");
    setInput("input-trip-location", "5.200");
    fireEvent.click(screen.getByText("Choose intended item"));
    const payload = await submit();
    expect(payload).toMatchObject({ indentId: 53, indentItemId: 87, pendingReceiptId: 92, material: "Soil", site: "NH-44", uom: "Cum", unloadedAt: "stretch", location: "5.200", supplierVendorId: 7, materialSourceVendorId: 7 });
    expect(payload.yardLabel).toBeUndefined();
    await waitFor(() => expect(screen.getByTestId("input-trip-vehicle")).toHaveValue(""));
    expect(screen.getByTestId("input-trip-material-source-supplier")).toHaveValue("SANGANNA");
    expect(screen.getByTestId("input-trip-location")).toHaveValue("5.200");
  });

  it("A6 arrangement changes never overwrite a deliberate source or material", async () => {
    renderPage(); await ready(); fillBasic();
    setInput("select-trip-material", "GSB");
    setInput("input-trip-material-source-supplier", "NARASIMHULU");
    fireEvent.click(screen.getByText("Apply arrangement"));
    expect(screen.getByTestId("select-trip-material")).toHaveValue("GSB");
    expect(screen.getByTestId("input-trip-material-source-supplier")).toHaveValue("NARASIMHULU");
    expect(harness.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Kept your entries" }));
  });

  it("disabling repeat context resets the role to Same party and clears source/work context after save", async () => {
    renderPage(); await ready(); fillBasic();
    fireEvent.click(screen.getByTestId("trip-role-different_parties"));
    setInput("input-trip-supplier", "NARASIMHULU");
    fireEvent.click(within(screen.getByTestId("checkbox-keep-context")).getByRole("checkbox"));
    await submit();
    await waitFor(() => expect(screen.getByTestId("trip-role-same_party")).toBeChecked());
    expect(screen.getByTestId("input-trip-material-source-supplier")).toHaveValue("");
    expect(screen.getByTestId("select-trip-material")).toHaveValue("");
    expect(screen.getByTestId("work-context-value")).toHaveTextContent('"boqItemId":null');
  });
});

describe("A4/A5 explicit role-only editing", () => {
  function renderEditor(row = rows[3]) {
    return render(<QueryClientProvider client={queryClient}><TripRoleEditDialog trip={row} vendors={vendors} equipment={equipment} vendorsLoading={false} vendorsError={false} onRetryVendors={vi.fn()} onClose={vi.fn()} /></QueryClientProvider>);
  }
  it("A4 ambiguous existing trip has no option selected and save is blocked without a choice", async () => {
    renderEditor();
    expect(screen.getByTestId("trip-roles-unresolved")).toHaveTextContent("Transport/source roles not yet confirmed — set Material from and Who brought it");
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    setInput("input-edit-trip-material-source-supplier", "SANGANNA");
    fireEvent.click(screen.getByTestId("button-save-trip-roles"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose Who brought it");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("A5 opening, reading raw values and closing ambiguous history writes nothing and leaves the object byte-for-byte unchanged", async () => {
    const before = JSON.stringify(rows[3]);
    const view = renderEditor();
    expect(screen.getByTestId("trip-role-raw-values")).toHaveTextContent("materialSourceSupplierNULL");
    expect(screen.getByTestId("trip-role-raw-values")).toHaveTextContent('supplier"NARASIMHULU"');
    fireEvent.click(screen.getByText("Cancel"));
    view.unmount();
    expect(harness.request).not.toHaveBeenCalled();
    expect(JSON.stringify(rows[3])).toBe(before);
  });
  it("PATCH contains only role fields and only occurs on explicit save", async () => {
    renderEditor();
    setInput("input-edit-trip-material-source-supplier", "SANGANNA");
    fireEvent.click(screen.getByTestId("edit-trip-role-same_party"));
    expect(harness.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-save-trip-roles"));
    await waitFor(() => expect(harness.request).toHaveBeenCalledWith("PATCH", "/api/site-material-trips/4", {
      materialSourceSupplier: "SANGANNA", materialSourceVendorId: 7, supplier: "SANGANNA", supplierVendorId: 7, transportType: "agency_vendor", internalEquipmentId: null, vehicleNumber: "TS15UF4308",
    }));
    expect(harness.request).toHaveBeenCalledTimes(1);
  });
  it.each(["different_parties", "in_house"] as const)("role-only editing can explicitly save %s without quantity/context fields", async (choice) => {
    renderEditor();
    setInput("input-edit-trip-material-source-supplier", "SANGANNA");
    fireEvent.click(screen.getByTestId(`edit-trip-role-${choice}`));
    if (choice === "in_house") setInput("select-edit-trip-internal-equipment", "42");
    fireEvent.click(screen.getByTestId("button-save-trip-roles"));
    await waitFor(() => expect(harness.request).toHaveBeenCalledTimes(1));
    const payload = harness.request.mock.calls[0][2];
    expect(Object.keys(payload).sort()).toEqual(["materialSourceSupplier", "materialSourceVendorId", "supplier", "supplierVendorId", "transportType", "internalEquipmentId", "vehicleNumber"].sort());
    expect(payload).toMatchObject(choice === "in_house"
      ? { transportType: "in_house", supplier: null, supplierVendorId: null, internalEquipmentId: 42, vehicleNumber: "TS09AB4321" }
      : { transportType: "agency_vendor", supplier: "NARASIMHULU", supplierVendorId: 18, materialSourceVendorId: 7 });
  });
  it("failed explicit PATCH leaves the editor open with actionable error and does not mutate stored raw values", async () => {
    const before = JSON.stringify(rows[3]);
    harness.request.mockRejectedValueOnce(new Error("Roles could not be saved. Retry."));
    renderEditor();
    setInput("input-edit-trip-material-source-supplier", "SANGANNA");
    fireEvent.click(screen.getByTestId("edit-trip-role-same_party"));
    fireEvent.click(screen.getByTestId("button-save-trip-roles"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Roles could not be saved. Retry.");
    expect(screen.getByTestId("dialog-trip-roles")).toBeInTheDocument();
    expect(JSON.stringify(rows[3])).toBe(before);
    expect(harness.request).toHaveBeenCalledTimes(1);
  });
});

describe("focused role fields loading/error/empty states", () => {
  it("null Who brought it does not select anything; vendor loading/error prevents input and Retry is wired", () => {
    const retry = vi.fn();
    const props = {
      choice: null, onChoice: vi.fn(), value: { materialSourceSupplier: "", supplier: "", vehicleNumber: "", internalEquipmentId: null },
      onChange: vi.fn(), vendors: [], equipment: [], sourceSuggestions: [], supplierSuggestions: [], vehicleSuggestions: [],
      onRetryVendors: retry,
    };
    const view = render(<TripTransportRoleFields {...props} vendorsLoading />);
    expect(screen.getByRole("status", { name: "Loading existing vendors" })).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    expect(screen.getByTestId("input-trip-material-source-supplier")).toBeDisabled();
    view.rerender(<TripTransportRoleFields {...props} vendorsError />);
    fireEvent.click(screen.getByText("Retry"));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Existing vendors could not be loaded");
    view.rerender(<TripTransportRoleFields {...props} />);
    expect(screen.getByText(/No existing vendors are available/)).toBeInTheDocument();
  });
});

describe("B1/B2 role list and filter scope", () => {
  it("renders all role cases in plain words and unresolved in amber", async () => {
    renderPage(); await ready();
    expect(screen.getByTestId("trip-role-description-1")).toHaveTextContent("from SANGANNA · brought by SANGANNA");
    expect(screen.getByTestId("trip-role-description-2")).toHaveTextContent("from SANGANNA · brought by NARASIMHULU (TS15UF4308)");
    expect(screen.getByTestId("trip-role-description-3")).toHaveTextContent("from SANGANNA · brought by our TIPPER-03");
    expect(screen.getByTestId("trip-role-description-4")).toHaveTextContent("NARASIMHULU · roles not confirmed");
    expect(screen.getByTestId("trip-role-description-4")).toHaveClass("text-amber-700");
    expect(harness.request).not.toHaveBeenCalled();
  });
  it("All is not silently scoped by legacy onlyUnassigned; every role filter returns exact count including unresolved with a source", async () => {
    renderPage(); await ready();
    expect(screen.getByTestId("checkbox-filter-only-unassigned")).not.toBeChecked();
    expect(harness.queries.some((url) => url.includes("onlyUnassigned=true"))).toBe(false);
    for (const [role, count, ids] of [
      ["all", 5, [1, 2, 3, 4, 5]], ["same_party", 1, [1]], ["different_parties", 1, [2]], ["in_house", 1, [3]], ["unresolved", 2, [4, 5]],
    ] as const) {
      setInput("select-filter-trip-role", role);
      expect(screen.getByTestId("trip-role-filter-count")).toHaveTextContent(`${count} matching trip`);
      expect(screen.getAllByTestId(/^row-trip-/)).toHaveLength(count);
      for (const id of ids) expect(screen.getByTestId(`row-trip-${id}`)).toBeInTheDocument();
    }
    expect(harness.request).not.toHaveBeenCalled();
  });
  it("selecting a role clears the explicit legacy missing-source checkbox; bulk tool is not executed or role-scoped", async () => {
    renderPage(); await ready();
    fireEvent.click(screen.getByTestId("checkbox-filter-only-unassigned"));
    await waitFor(() => expect(screen.getAllByTestId(/^row-trip-/)).toHaveLength(1));
    expect(screen.getByTestId("select-filter-trip-role")).toHaveValue("all");
    setInput("select-filter-trip-role", "unresolved");
    await waitFor(() => expect(screen.getAllByTestId(/^row-trip-/)).toHaveLength(2));
    expect(screen.getByTestId("checkbox-filter-only-unassigned")).not.toBeChecked();
    expect(screen.getByTestId("bulk-material-source-panel")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-material-source-panel")).toHaveTextContent("Select All in the transport/source role filter before using this bulk tool");
    setInput("select-filter-site", "NH-44");
    await screen.findByTestId("input-bulk-material-source-supplier");
    setInput("input-bulk-material-source-supplier", "SANGANNA");
    expect(screen.getByTestId("button-bulk-assign-material-source")).toBeDisabled();
    fireEvent.click(screen.getByTestId("button-bulk-assign-material-source"));
    expect(harness.request).not.toHaveBeenCalled();
  });
  it("page opens ambiguous editor without a write", async () => {
    renderPage(); await ready();
    fireEvent.click(screen.getByTestId("button-edit-trip-roles-4"));
    expect(await screen.findByTestId("dialog-trip-roles")).toBeInTheDocument();
    for (const radio of within(screen.getByTestId("dialog-trip-roles")).getAllByRole("radio")) expect(radio).not.toBeChecked();
    expect(harness.request).not.toHaveBeenCalled();
  });
  it("existing suggestions omit unknown and duplicate ambiguous vendor names; role utility remains read-only", () => {
    expect(existingTripVendorSuggestions(["UNREGISTERED NAME", "narasimhulu"], vendors)).toEqual(["NARASIMHULU", "SANGANNA"]);
    expect(existingTripVendorSuggestions(["SANGANNA"], [...vendors, { id: 19, name: "sanganna" }])).toEqual(["NARASIMHULU"]);
    const before = JSON.stringify(rows);
    expect(filterTripsByRole(rows, "unresolved").map((row) => row.id)).toEqual([4, 5]);
    expect(tripRoleDescription(rows[3])).toContain("roles not confirmed");
    expect(JSON.stringify(rows)).toBe(before);
  });
});
