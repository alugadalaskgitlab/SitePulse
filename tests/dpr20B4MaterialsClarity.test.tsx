// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import SiteReport from "../client/src/pages/SiteReport";
import DprDetails from "../client/src/pages/DprDetails";
import DprSections from "../client/src/pages/DprSections";
import { dprSectionStates, pickDprSectionPayload } from "../shared/dprSections";
import { evaluateSectionReadiness } from "../shared/dprSectionReadiness";

const state = vi.hoisted(() => ({ dpr: null as any, receipts: [] as any[] }));
vi.mock("../client/src/hooks/use-dprs", () => ({
  useDpr: () => ({ data: state.dpr, isLoading: false, error: null }),
}));
vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "24601" }],
  useLocation: () => ["/", vi.fn()],
  useSearch: () => "",
  Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("../client/src/lib/auth-context", () => ({
  useAuth: () => ({ sectionCan: () => false, isAdmin: false, user: { isAdmin: false } }),
}));
vi.mock("@tanstack/react-query", async importOriginal => {
  const original = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...original,
    useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
      data: String(queryKey[0]).startsWith("/api/materials-received?") ? state.receipts : [],
      isPending: false,
      isError: false,
    }),
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock("../client/src/hooks/use-dpr-boq-items", () => ({
  useDprBoqItems: () => ({
    items: [], projects: [], projectId: null,
    projectsLoaded: true, projectsLoading: false, projectsError: null,
    itemsLoaded: true, itemsLoading: false, itemsError: null,
  }),
}));
vi.mock("../client/src/components/ReportHeader", () => ({ ReportHeader: () => null }));
vi.mock("../client/src/components/DprPhotoGroups", () => ({ DprPhotoGroups: () => null }));
vi.mock("../client/src/components/EditPermissionButton", () => ({ EditPermissionButton: () => null }));
vi.mock("../client/src/components/CancelDialog", () => ({ default: () => null }));
vi.mock("../client/src/components/HistoryDialog", () => ({ default: () => null }));
vi.mock("../client/src/pages/SiteEntry", () => ({
  default: ({ sectionEditor }: { sectionEditor: { section: string } }) => (
    <div data-testid="existing-section-editor">{sectionEditor.section}</div>
  ),
}));
vi.mock("../client/src/pages/SiteEdit", () => ({ default: () => null }));

const title = "Materials Consumed / Issued";
const emptyText = "No materials consumed or issued recorded.";
const note = "Bulk vehicle deliveries are tracked separately in Materials Received.";
const tileTitle = `${title} & Site Purchases`;
const material = {
  id: 24801, type: "Issued", material: "Synthetic cement", quantity: 2.5, uom: "MT",
  vehicleNumber: "SYN-ISSUED", supplier: "Synthetic store", location: "Synthetic work item", receiptNumber: "SYN-I-1",
};
const purchase = {
  id: 24802, itemDescription: "Synthetic gloves", vendor: "Synthetic shop",
  billNo: "SYN-P-1", amount: 125, quantity: 5, uom: "pairs",
};

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  state.dpr = {
    id: 24601, site: "SYNTHETIC B4 SITE", date: "2026-08-07", engineer: "Synthetic engineer",
    dprStatus: "draft", workType: "road", boqProjectId: null, progress: [], equipment: [],
    labour: [], materials: [], sitePurchases: [],
  };
  state.receipts = [{
    id: 24701, source: "trip", material: "Synthetic GSB", quantity: 12, uom: "MT",
    supplier: "Synthetic transporter", vehicleNumber: "SYN-TRIP", unloadedAt: "stretch",
    materialSourceSupplier: "Synthetic quarry", receiptNumber: "SYN-R-1",
  }];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each([
  ["SiteReport", SiteReport],
  ["DprDetails", DprDetails],
])("DPR20 B4 actual %s materials rendering", (_name, Page) => {
  it("separates received trips from explicitly empty consumed/issued materials", () => {
    render(<Page />);
    const received = screen.getByTestId("dpr-materials-received");
    const consumed = screen.getByRole("region", { name: title });
    expect(within(received).getByRole("heading", { name: "Materials Received" })).toBeTruthy();
    expect(within(received).getByTestId("row-material-trip-24701").textContent).toContain("Synthetic GSB");
    expect(within(consumed).getByRole("heading", { name: title })).toBeTruthy();
    expect(within(consumed).getByText(emptyText)).toBeTruthy();
    expect(within(consumed).getByText(note)).toBeTruthy();
    expect(consumed.contains(received)).toBe(false);
    expect(screen.queryByText("No materials recorded.")).toBeNull();
    expect(screen.queryByText("Site Purchases")).toBeNull();
    expect(within(consumed).queryByRole("table")).toBeNull();
  });

  it("keeps empty received and consumed/issued states independently visible", () => {
    state.receipts = [];
    render(<Page />);
    expect(within(screen.getByTestId("dpr-materials-received")).getByText("No materials received this day.")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: title })).getByText(emptyText)).toBeTruthy();
  });

  it("retains all populated legacy material data beside the independent trips panel", () => {
    state.dpr.materials = [material, { ...material, id: 24803, quantity: 1.25 }];
    render(<Page />);
    const consumed = screen.getByRole("region", { name: title });
    expect(within(consumed).getAllByRole("heading", { name: title })).toHaveLength(1);
    expect(within(consumed).queryByText(emptyText)).toBeNull();
    expect(within(consumed).getByText(note)).toBeTruthy();
    const rows = within(consumed).getAllByRole("row").slice(1);
    if (_name === "SiteReport") {
      expect(rows).toHaveLength(2);
      expect(within(consumed).getAllByRole("columnheader").map(node => node.textContent)).toEqual([
        "Type", "Material", "Quantity", "UOM", "Vehicle No.", "Supplier", "Location/Task", "Receipt No.",
      ]);
      expect(rows[0].textContent).toContain("IssuedSynthetic cement2.500MTSYN-ISSUEDSynthetic storeSynthetic work itemSYN-I-1");
      expect(rows[1].textContent).toContain("1.250");
    } else {
      expect(rows).toHaveLength(1);
      expect(within(consumed).getByRole("heading", { name: "Supplier breakdown" })).toBeTruthy();
      expect(within(consumed).getAllByRole("columnheader").map(node => node.textContent)).toEqual([
        "Material", "UOM", "Supplier", "Total Quantity", "Trips",
      ]);
      expect(rows[0].textContent).toBe("Synthetic cementMTSynthetic store3.7502");
    }
    expect(screen.getByTestId("row-material-trip-24701").textContent).toContain("Synthetic GSB");
  });

  it("does not change the existing purchase visibility", () => {
    state.dpr.sitePurchases = [purchase];
    render(<Page />);
    expect(screen.getByRole("region", { name: title }).textContent).toContain(emptyText);
    if (_name === "SiteReport") {
      expect(screen.getByText("Site Purchases")).toBeTruthy();
      expect(screen.getByTestId("row-site-purchase-0").textContent).toBe("Synthetic glovesSynthetic shopSYN-P-1125.0005.000pairs");
    } else {
      // DprDetails never rendered purchases; B4 must not introduce a new table.
      expect(screen.queryByText("Site Purchases")).toBeNull();
      expect(screen.queryByTestId("row-site-purchase-0")).toBeNull();
    }
  });
});

describe("DPR20 B4 section hub wording does not change readiness", () => {
  it.each([
    ["empty", [], [], "Not yet entered"],
    ["incomplete", [{ ...material, quantity: 0 }], [], "Needs completion"],
    ["ready", [material], [], "Ready"],
    ["ready", [], [purchase], "Ready"],
  ])("keeps the persisted %s materials status, issues, submit gate and editor navigation", async (expectedState, materials, purchases, expectedLabel) => {
    state.dpr.materials = materials;
    state.dpr.sitePurchases = purchases;
    const sections = dprSectionStates(state.dpr);
    const readiness = evaluateSectionReadiness(state.dpr, []);
    const snapshot = {
      dpr: state.dpr, sections,
      context: { site: state.dpr.site, date: state.dpr.date, workType: "road", boqProjectId: null },
      headerToken: "synthetic-header",
      sectionTokens: { activity: "a", equipment: "e", labour: "l", materials: "m" },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot });
    vi.stubGlobal("fetch", fetchMock);
    render(<DprSections initialId={24601} />);
    const heading = await screen.findByRole("heading", { name: tileTitle });
    const tile = heading.closest("button")!;
    expect(within(tile).getByText(note)).toBeTruthy();
    expect(within(tile).getByText(`${expectedState} — ${expectedLabel}`)).toBeTruthy();
    for (const issue of sections.materials.issues ?? []) {
      expect(within(tile).getByText(issue.message)).toBeTruthy();
    }
    expect(screen.getAllByText(note)).toHaveLength(1);
    expect(sections.materials.state).toBe(expectedState);
    // Receipts remain a separate concept and are not included in section payload/readiness.
    expect(dprSectionStates({ ...state.dpr, receivedTrips: state.receipts })).toEqual(sections);
    expect(pickDprSectionPayload("materials", { ...state.dpr, receivedTrips: state.receipts })).toEqual({
      materials, sitePurchases: purchases,
    });
    fireEvent.click(screen.getByRole("button", { name: "Review & Submit" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit DPR" }).hasAttribute("disabled")).toBe(!readiness.ready));
    fireEvent.click(tile);
    expect(screen.getByTestId("existing-section-editor").textContent).toBe("materials");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/dpr-sections/24601");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });
});