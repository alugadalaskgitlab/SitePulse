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
  canEdit: true,
}));
vi.mock("@/lib/queryClient", async (original) => ({ ...await original<object>(), apiRequest: harness.request }));
vi.mock("wouter", () => ({
  useSearch: () => harness.search,
  useLocation: () => ["/site/material-trips", vi.fn()],
  Link: ({ children }: any) => <span>{children}</span>,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: harness.toast }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ sectionCan: () => harness.canEdit, isAdmin: false, isOwner: false }) }));
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
    <button type="button" onClick={() => { onChange({ ...value, earthworkArrangementId: 31 }); onArrangementPrefill?.({ material: "Soil", supplier: "SANGANNA", clientSupplied: true, external: false }); }}>Apply arrangement</button>
    <span data-testid="work-context-value">{JSON.stringify(value)}</span>
  </div>,
}));
vi.mock("@/hooks/use-trip-masters", () => ({
  useTripEquipmentMasters: () => ({ master: { data: equipment }, owners: { data: [hiredEquipment] } }),
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

const vendors = [{ id: 7, name: "SANGANNA", isActive: true }, { id: 18, name: "NARASIMHULU", isActive: true }];
const hiredEquipment = { id: 43, name: "Hired Tipper", registrationNumber: "TS15UF4308", ownership: "hired", isActive: 1, vendorId: 18, linkedVendorName: "NARASIMHULU" };
const equipment = [{ id: 42, name: "TIPPER-03", registrationNumber: "TS09AB4321", ownership: "owned", isActive: 1 }, hiredEquipment] as EquipmentMasterType[];
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
  setInput("select-trip-site", "NH-44");
  await waitFor(() => expect(screen.getByTestId("input-trip-material-source-supplier")).not.toBeDisabled());
}
function fillBasic() {
  setInput("select-trip-site", "NH-44");
  setInput("select-trip-material", "Soil");
  setInput("input-trip-material-source-supplier", "sanganna");
  selectVendor("Material Supplier", "7");
  setInput("input-trip-quantity", "14");
  selectVehicle("43");
  fireEvent.click(screen.getByText("Choose intended item"));
}
function selectVendor(label: string, id: string) {
  const vendor = vendors.find(item => item.id === Number(id))!;
  const input = screen.getByRole("combobox", { name: new RegExp(label) });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: vendor.name } });
  fireEvent.click(screen.getByRole("option", { name: vendor.name }));
}
function selectVehicle(id: string) {
  const vehicle = equipment.find(item => item.id === Number(id))!;
  const input = screen.getByRole("combobox", { name: /Vehicle \/ Tipper/ });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: vehicle.registrationNumber } });
  fireEvent.click(screen.getByRole("option", { name: new RegExp(vehicle.registrationNumber!) }));
}
function chooseEditSource() {
  setInput("input-edit-trip-material-source-supplier", "SANGANNA");
  selectVendor("Material Supplier", "7");
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
  harness.canEdit = true;
  queryClient.clear();
  queryClient.setQueryData(["/api/site-material-trips/vendor-options?site=NH-44"], vendors);
  queryClient.setDefaultOptions({ queries: { retry: false, queryFn: async ({ queryKey }) => {
    const url = String(queryKey[0]);
    harness.queries.push(url);
    if (url === "/api/sites") return [{ id: 11, name: "NH-44", isActive: true }];
    if (url === "/api/vendor-master" || url.startsWith("/api/site-material-trips/vendor-options?site=")) return vendors;
    if (url === "/api/plant-module/equipment") return equipment;
    if (url === "/api/site-material-trips/hired-vehicle-options") return [];
    const reviewMatch = url.match(/^\/api\/site-material-trips\/(\d+)\/hire-link$/);
    if (reviewMatch) return { trip: rows.find(row => row.id === Number(reviewMatch[1])),
      equipment: [], confirmation: null, suggestedEquipmentId: null, fingerprint: "reviewed-trip", version: null };
    if (url.startsWith("/api/site-material-trips")) return url.includes("onlyUnassigned=true") ? rows.filter((row) => !row.materialSourceSupplier?.trim()) : rows;
    return [];
  } }, mutations: { retry: false } });
  harness.request.mockImplementation(async (method, url, payload) => ({
    json: async () => method === "PATCH"
      ? { ...rows.find(row => url === `/api/site-material-trips/${row.id}`), ...payload }
      : { id: 101 },
  }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) });
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });

describe("VB-SPLIT Parts A/B entry behavior", () => {
  it("loads Supplier and Transporter from the same site-scoped records; SARA/NARSI/4308 survive Add → Edit", async () => {
    const fixtureVendors = [
      { id: 7, name: "Saravana", businessName: "SARAVANA METAL INDUSTRIES", isActive: true },
      { id: 18, name: "Gangaram Narsimulu", businessName: "G N Transport", isActive: true },
    ];
    const page = renderPage();
    await screen.findByTestId("row-trip-1");
    expect(screen.getByTestId("input-trip-material-source-supplier")).toBeDisabled();
    expect(screen.getByText("Choose Site to search Vendor Master.")).toBeInTheDocument();
    expect(harness.queries.some(url => url.startsWith("/api/site-material-trips/vendor-options"))).toBe(false);
    await ready();
    queryClient.setQueryData(["/api/site-material-trips/vendor-options?site=NH-44"], fixtureVendors);
    fireEvent.click(screen.getByTestId("trip-role-different_parties"));
    const source = screen.getByRole("combobox", { name: /Material Supplier/ });
    fireEvent.change(source, { target: { value: "SARA" } });
    fireEvent.click(await screen.findByRole("option", { name: "SARAVANA METAL INDUSTRIES" }));
    const transporter = screen.getByRole("combobox", { name: /Transporter/ });
    fireEvent.change(transporter, { target: { value: "NARSI" } });
    fireEvent.keyDown(transporter, { key: "ArrowDown" });
    fireEvent.keyDown(transporter, { key: "Enter" });
    const vehicle = screen.getByRole("combobox", { name: /Vehicle \/ Tipper/ });
    fireEvent.change(vehicle, { target: { value: "4308" } });
    fireEvent.click(screen.getByRole("option", { name: /TS15UF4308/ }));
    setInput("select-trip-material", "Soil");
    setInput("input-trip-quantity", "14");
    fireEvent.click(screen.getByText("Choose intended item"));
    const payload = await submit();
    expect(payload).toMatchObject({ materialSourceVendorId: 7, supplierVendorId: 18, masterSelection: { equipmentId: 43 } });
    expect(harness.request).toHaveBeenCalledTimes(1);
    page.unmount();
    const saved = trip({ ...payload, id: 101 });
    queryClient.setQueryData(["/api/site-material-trips/101/hire-link"], { trip: saved, confirmation: { equipmentId: 43, valid: true } });
    render(<QueryClientProvider client={queryClient}><TripRoleEditDialog trip={saved} vendors={fixtureVendors} equipment={equipment}
      vendorsLoading={false} vendorsError={false} onRetryVendors={vi.fn()} onClose={vi.fn()} /></QueryClientProvider>);
    expect(screen.getByRole("combobox", { name: /Material Supplier/ })).toHaveValue("Saravana");
    expect(screen.getByRole("combobox", { name: /Transporter/ })).toHaveValue("Gangaram Narsimulu");
    await waitFor(() => expect((screen.getByRole("combobox", { name: /Vehicle \/ Tipper/ }) as HTMLInputElement).value).toContain("TS15UF4308"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(harness.request).toHaveBeenCalledTimes(2));
    expect(harness.request.mock.calls[1][2]).toMatchObject({ materialSourceVendorId: 7, supplierVendorId: 18 });
    expect(harness.request.mock.calls[1][2]).not.toHaveProperty("masterSelection");
  });
  it("A1 saves selected source and same-party transporter IDs with the hired Equipment Master ID", async () => {
    renderPage(); await ready(); fillBasic();
    expect(screen.getByTestId("trip-role-same_party")).toBeChecked();
    const payload = await submit();
    expect(payload).toMatchObject({ materialSourceSupplier: "SANGANNA", materialSourceVendorId: 7, supplier: "SANGANNA", supplierVendorId: 7, transportType: "agency_vendor", internalEquipmentId: null, quantity: 14 });
    expect(harness.request).toHaveBeenCalledTimes(1);
    expect(payload.masterSelection).toEqual({ equipmentId: 43 });
    expect(payload).not.toHaveProperty("hireEquipmentLink");
    expect(harness.queries.some(url => url.includes("/api/vendor-master"))).toBe(false);
  });

  it("A2 records a different transporter and prefills a blank carrier from the confirmed hired Master owner", async () => {
    renderPage(); await ready();
    fireEvent.click(screen.getByTestId("trip-role-different_parties"));
    fillBasic();
    expect(screen.getByTestId("input-trip-supplier")).toHaveValue("NARASIMHULU");
    const payload = await submit();
    expect(payload).toMatchObject({ materialSourceSupplier: "SANGANNA", materialSourceVendorId: 7, supplier: "NARASIMHULU", supplierVendorId: 18, vehicleNumber: "TS15UF4308", transportType: "agency_vendor", internalEquipmentId: null });
  });

  it("switching to Same party keeps the selected source; historical names never enter the vehicle picker", async () => {
    renderPage(); await ready(); fillBasic();
    fireEvent.click(screen.getByTestId("trip-role-different_parties"));
    fireEvent.click(screen.getByTestId("trip-role-same_party"));
    expect(screen.queryByRole("option", { name: "UNREGISTERED NAME" })).not.toBeInTheDocument();
    expect(screen.getByTestId("input-trip-material-source-supplier")).toHaveValue("SANGANNA");
    const payload = await submit();
    expect(payload).toMatchObject({ supplier: "SANGANNA", supplierVendorId: 7, materialSourceVendorId: 7 });
  });

  it("A3 requires equipment-master selection and writes NULL transporter columns and master vehicle number", async () => {
    renderPage(); await ready(); fillBasic();
    fireEvent.click(screen.getByTestId("trip-role-different_parties"));
    fireEvent.click(screen.getByTestId("trip-role-in_house"));
    expect(screen.queryByTestId("input-trip-vehicle")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-submit-trip"));
    expect(harness.request).not.toHaveBeenCalled();
    expect(harness.toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: "Choose our own vehicle from the equipment master." }));
    selectVehicle("42");
    const payload = await submit();
    expect(payload).toMatchObject({ materialSourceSupplier: "SANGANNA", materialSourceVendorId: 7, supplier: null, supplierVendorId: null, transportType: "in_house", internalEquipmentId: 42, vehicleNumber: "TS09AB4321" });
    expect(payload.masterSelection).toEqual({ equipmentId: 42 });
  });

  it("requires explicit Other for manual names, preserves them unlinked, and rejects a blank manual source", async () => {
    renderPage(); await ready(); fillBasic();
    const source = screen.getByRole("combobox", { name: /Material Supplier/ });
    fireEvent.change(source, { target: { value: "UNREGISTERED NAME" } });
    fireEvent.click(screen.getByRole("option", { name: /Other \/ Not in Master/ }));
    fireEvent.change(source, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("button-submit-trip"));
    await waitFor(() => expect(harness.toast).toHaveBeenCalled());
    expect(harness.request).not.toHaveBeenCalled();
    fireEvent.change(source, { target: { value: "UNREGISTERED NAME" } });
    const payload = await submit();
    expect(payload).toMatchObject({
      materialSourceSupplier: "UNREGISTERED NAME", materialSourceVendorId: null,
      supplier: "UNREGISTERED NAME", supplierVendorId: null,
    });
  });

  it("blocks the same Vendor Master under Another transporter", async () => {
    renderPage(); await ready(); fillBasic();
    setInput("input-trip-material-source-supplier", "SANGANNA");
    selectVendor("Material Supplier", "7");
    fireEvent.click(screen.getByTestId("trip-role-different_parties"));
    selectVendor("Transporter", "7");
    fireEvent.click(screen.getByTestId("button-submit-trip"));
    expect(harness.request).not.toHaveBeenCalled();
    await waitFor(() => expect(harness.toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: "Choose a different transporter, or select Same party." })));
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
    expect(screen.getByRole("combobox", { name: /Vehicle \/ Tipper/ })).toHaveValue("");
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
    selectVendor("Material Supplier", "7");
    selectVehicle("43");
    setInput("input-trip-location", "5.200");
    fireEvent.click(screen.getByText("Choose intended item"));
    const payload = await submit();
    expect(payload).toMatchObject({ indentId: 53, indentItemId: 87, pendingReceiptId: 92, material: "Soil", site: "NH-44", uom: "Cum", unloadedAt: "stretch", location: "5.200", supplierVendorId: 7, materialSourceVendorId: 7 });
    expect(payload.yardLabel).toBeUndefined();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /Vehicle \/ Tipper/ })).toHaveValue(""));
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
    selectVendor("Transporter", "18");
    fireEvent.click(within(screen.getByTestId("checkbox-keep-context")).getByRole("checkbox"));
    await submit();
    await waitFor(() => expect(screen.getByTestId("trip-role-same_party")).toBeChecked());
    expect(screen.getByTestId("input-trip-material-source-supplier")).toHaveValue("");
    expect(screen.getByTestId("select-trip-material")).toHaveValue("");
    expect(screen.getByTestId("work-context-value")).toHaveTextContent('"boqItemId":null');
  });
});

describe("A4/A5 ordinary master-based editing", () => {
  it("explicit work-context edits accompany roles and normal trip fields in one PATCH", async () => {
    await openEditor();
    chooseEditSource();
    fireEvent.click(screen.getByTestId("edit-trip-role-same_party"));
    fireEvent.click(screen.getByText("Choose intended item"));
    fireEvent.click(screen.getByText("Apply arrangement"));
    fireEvent.click(screen.getByTestId("button-save-trip-roles"));
    await waitFor(()=>expect(harness.request).toHaveBeenCalled());
    const body=harness.request.mock.calls[0][2];
    expect(body).toMatchObject({boqProjectId:12,boqItemId:29,earthworkArrangementId:31});
    expect(body).toMatchObject({ quantity: 14, date: "2026-08-17", site: "NH-44", material: "Soil", receiptNumber: "", masterSelection: { equipmentId: null } });
  });
  it("untouched saved work context is omitted, never cleared by role confirmation", async () => {
    await openEditor({...rows[3],boqProjectId:12,boqItemId:29,programmeBarId:50,earthworkArrangementId:31});
    chooseEditSource();
    fireEvent.click(screen.getByTestId("edit-trip-role-same_party"));
    fireEvent.click(screen.getByTestId("button-save-trip-roles"));
    await waitFor(()=>expect(harness.request).toHaveBeenCalled());
    for(const key of ["boqProjectId","boqItemId","programmeBarId","earthworkArrangementId"])expect(harness.request.mock.calls[0][2]).not.toHaveProperty(key);
  });
  function renderEditor(row = rows[3]) {
    return render(<QueryClientProvider client={queryClient}><TripRoleEditDialog trip={row} vendors={vendors} equipment={equipment} vendorsLoading={false} vendorsError={false} onRetryVendors={vi.fn()} onClose={vi.fn()} /></QueryClientProvider>);
  }
  async function openEditor(row = rows[3]) {
    const view = renderEditor(row);
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading saved vehicle association" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    return view;
  }
  it("A4 ambiguous existing trip has no option selected and save is blocked without a choice", async () => {
    await openEditor();
    for (const choice of ["same_party", "different_parties", "in_house"]) expect(screen.getByTestId(`edit-trip-role-${choice}`)).not.toBeChecked();
    chooseEditSource();
    fireEvent.click(screen.getByTestId("button-save-trip-roles"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose the transporter arrangement");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("A5 opening and cancelling ambiguous history writes nothing and leaves the original unchanged", async () => {
    const before = JSON.stringify(rows[3]);
    const view = renderEditor();
    expect(screen.getByTestId("input-edit-trip-material-source-supplier")).toHaveValue("");
    fireEvent.click(screen.getByTestId("edit-trip-role-different_parties"));
    expect(screen.getByTestId("input-edit-trip-supplier")).toHaveValue("NARASIMHULU");
    fireEvent.click(screen.getByText("Cancel"));
    view.unmount();
    expect(harness.request).not.toHaveBeenCalled();
    expect(JSON.stringify(rows[3])).toBe(before);
  });
  it("PATCH contains selected IDs alongside normal trip fields and only occurs on explicit Save", async () => {
    await openEditor();
    chooseEditSource();
    fireEvent.click(screen.getByTestId("edit-trip-role-same_party"));
    expect(harness.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-save-trip-roles"));
    await waitFor(() => expect(harness.request).toHaveBeenCalledWith("PATCH", "/api/site-material-trips/4", expect.objectContaining({
      materialSourceSupplier: "SANGANNA", materialSourceVendorId: 7, supplier: "SANGANNA", supplierVendorId: 7, transportType: "agency_vendor", internalEquipmentId: null, vehicleNumber: "TS15UF4308",
      quantity: 14, masterSelection: { equipmentId: null },
    })));
    expect(harness.request).toHaveBeenCalledTimes(1);
  });
  it.each(["different_parties", "in_house"] as const)("ordinary editing saves %s plus unchanged normal trip fields", async (choice) => {
    await openEditor();
    chooseEditSource();
    fireEvent.click(screen.getByTestId(`edit-trip-role-${choice}`));
    if (choice === "in_house") selectVehicle("42");
    fireEvent.click(screen.getByTestId("button-save-trip-roles"));
    await waitFor(() => expect(harness.request).toHaveBeenCalledTimes(1));
    const payload = harness.request.mock.calls[0][2];
    expect(payload).toMatchObject({ quantity: 14, date: "2026-08-17", materialSourceVendorId: 7 });
    expect(payload).not.toHaveProperty("fingerprint");
    expect(payload).not.toHaveProperty("reason");
    expect(payload).toMatchObject(choice === "in_house"
      ? { transportType: "in_house", supplier: null, supplierVendorId: null, internalEquipmentId: 42, vehicleNumber: "TS09AB4321" }
      : { transportType: "agency_vendor", supplier: "NARASIMHULU", supplierVendorId: 18, materialSourceVendorId: 7 });
    expect(payload.masterSelection).toEqual({ equipmentId: choice === "in_house" ? 42 : null });
  });
  it("failed explicit PATCH leaves the editor open with actionable error and does not mutate stored raw values", async () => {
    const before = JSON.stringify(rows[3]);
    harness.request.mockRejectedValueOnce(new Error("Roles could not be saved. Retry."));
    await openEditor();
    chooseEditSource();
    fireEvent.click(screen.getByTestId("edit-trip-role-same_party"));
    fireEvent.click(screen.getByTestId("button-save-trip-roles"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Roles could not be saved. Retry.");
    expect(screen.getByTestId("dialog-trip-roles")).toBeInTheDocument();
    expect(JSON.stringify(rows[3])).toBe(before);
    expect(harness.request).toHaveBeenCalledTimes(1);
  });
  it("a view-only user can inspect original links but cannot enter the correction form", async () => {
    harness.canEdit = false;
    renderEditor();
    expect(screen.getByTestId("dialog-trip-roles")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toBeDisabled();
    expect(screen.getByTestId("input-edit-trip-material-source-supplier")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Authorised identity corrections" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-save-trip-roles")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirm vendor links")).not.toBeInTheDocument();
    expect(harness.request).not.toHaveBeenCalled();
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
    const view = render(<QueryClientProvider client={queryClient}><TripTransportRoleFields {...props} vendorsLoading /></QueryClientProvider>);
    expect(screen.getByRole("status", { name: "Loading existing vendors" })).toBeInTheDocument();
    for (const choice of ["same_party", "different_parties", "in_house"]) expect(screen.getByTestId(`trip-role-${choice}`)).not.toBeChecked();
    expect(screen.getByTestId("input-trip-material-source-supplier")).toBeDisabled();
    view.rerender(<QueryClientProvider client={queryClient}><TripTransportRoleFields {...props} vendorsError /></QueryClientProvider>);
    fireEvent.click(screen.getByText("Retry"));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Existing vendors could not be loaded");
    view.rerender(<QueryClientProvider client={queryClient}><TripTransportRoleFields {...props} /></QueryClientProvider>);
    expect(screen.getByText(/No existing vendors are available/)).toBeInTheDocument();
  });
});

describe("B1/B2 role list and filter scope", () => {
  it("shows Date before Time and challans in the existing source cell without changing other columns", async () => {
    const originals = rows.slice();
    rows[0] = trip({date:"2026-08-17",receiptNumber:"CH-123"});
    rows[1] = trip({id:2,date:"2026-08-16",receiptNumber:"   "});
    try {
      renderPage(); await ready();
      expect(screen.getAllByRole("columnheader").map(e=>e.textContent)).toEqual(["Date","Time","Site","Material","Transporter","Material Source","Vehicle","Qty","UOM","Location","Photos","Action"]);
      const first=within(screen.getByTestId("row-trip-1")).getAllByRole("cell");
      expect(first[0]).toHaveTextContent("17-AUG-2026");
      expect(first[1]).toHaveTextContent("10:21");
      expect(first[5]).toContainElement(screen.getByTestId("trip-receipt-1"));
      expect(screen.getByTestId("trip-receipt-1")).toHaveTextContent("CH-123");
      expect(screen.getByTestId("trip-receipt-2").textContent).toBe("-");
      expect(screen.getByTestId("trip-receipt-3").textContent).toBe("-");
      expect(within(screen.getByTestId("row-trip-2")).getAllByRole("cell")[0]).toHaveTextContent("16-AUG-2026");
      if (process.env.TRIPS_DISPLAY_EVIDENCE) {
        const fs = await import("node:fs");
        const css = fs.readdirSync("dist/public/assets").find(name => name.startsWith("index-") && name.endsWith(".css"))!;
        fs.writeFileSync("reports/trips-filter01b/blank-challan-fixture.html",
          `<!doctype html><html><head><meta charset="utf-8"><style>${fs.readFileSync(`dist/public/assets/${css}`, "utf8")}</style></head><body class="p-6 bg-background text-foreground"><h1 class="text-xl font-bold mb-6">Component test fixture — not saved trip data</h1>${document.querySelector("table")!.outerHTML}</body></html>`);
      }
    } finally { rows.splice(0,rows.length,...originals); }
  });
  it("keeps own-source rows visible but excludes them from both bulk counts", async () => {
    const own = trip({id:99,materialSourceType:"own_source",materialSourceSupplier:null,materialSourceVendorId:null});
    rows.push(own);
    try {
      renderPage(); await ready();
      setInput("select-filter-site","NH-44");
      await screen.findByTestId("input-bulk-material-source-supplier");
      setInput("input-bulk-material-source-supplier","SOURCE");
      expect(screen.getAllByTestId(/^row-trip-/)).toHaveLength(6);
      expect(screen.getByTestId("button-bulk-assign-material-source")).toHaveTextContent("Assign to 5 matching trips");
      fireEvent.click(screen.getByTestId("button-bulk-assign-material-source"));
      const dialog = await screen.findByTestId("dialog-confirm-bulk-material-source");
      expect(dialog).toHaveTextContent("Assign material source to 5 trips?");
      expect(dialog).toHaveTextContent("1 own-source trip excluded");
      expect(harness.request).not.toHaveBeenCalled();
    } finally { rows.pop(); }
  });
  it("renders all role cases in plain words and unresolved in amber", async () => {
    renderPage(); await ready();
    expect(screen.getByTestId("trip-role-description-1")).toHaveTextContent("from SANGANNA · brought by SANGANNA");
    expect(screen.getByTestId("trip-role-description-2")).toHaveTextContent("from SANGANNA · brought by NARASIMHULU (TS15UF4308)");
    expect(screen.getByTestId("trip-role-description-3")).toHaveTextContent("from SANGANNA · brought by our TIPPER-03");
    expect(screen.getByTestId("trip-role-description-4")).toHaveTextContent("NARASIMHULU · roles not confirmed");
    expect(screen.getByTestId("trip-role-description-4")).toHaveClass("text-amber-700");
    for (const id of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`button-edit-trip-roles-${id}`)).toHaveTextContent("Edit");
    }
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
    expect(within(screen.getByTestId("dialog-trip-roles")).getByRole("button", { name: "Save" })).toBeInTheDocument();
    for (const choice of ["same_party", "different_parties", "in_house"]) expect(screen.getByTestId(`edit-trip-role-${choice}`)).not.toBeChecked();
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
