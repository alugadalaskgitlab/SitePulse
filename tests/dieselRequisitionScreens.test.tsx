// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as XLSX from "xlsx";
import DieselRequirements from "../client/src/pages/DieselRequirements";

const fx = vi.hoisted(() => ({
  requirement: {
    id: 95, date: "2026-11-22", status: "approved", raisedBy: "Engineer",
    approvedBy: "Owner", raisedFrom: "office", siteId: null,
    totalPlanned: 80, totalApproved: 60, filledDirectly: false,
    items: [
      { id: 1, equipmentId: 1, equipmentName: "Vehicle A", purpose: "Haulage", estHours: 6, norm: 10, plannedQty: 60, approvedQty: 60 },
      { id: 2, equipmentId: 2, equipmentName: "Vehicle B", purpose: "Standby", plannedQty: 20, approvedQty: null },
    ],
  },
  empty: [],
  search: "",
  writeFile: vi.fn(),
}));
vi.mock("wouter", async importOriginal => ({ ...await importOriginal<typeof import("wouter")>(), useSearch: () => fx.search }));
vi.mock("xlsx", async importOriginal => ({ ...await importOriginal<typeof import("xlsx")>(), writeFile: fx.writeFile }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ featureCan: () => true, sectionCan: () => true, isAdmin: true, isOwner: true }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({ getPlantBackLink: () => "/plant" }) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyText: "Fixture", rmcEnabled: false }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/components/AttachmentUploader", () => ({ AttachmentUploader: () => null }));
vi.mock("@/components/AttachmentGallery", () => ({ AttachmentGallery: () => null }));
vi.mock("@/components/EditPermissionButton", () => ({ EditPermissionButton: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey: [path, id] }: any) => {
    if (path === "/api/diesel-requirements") return { data: typeof id === "number" ? fx.requirement : [fx.requirement] };
    if (path === "/api/diesel-requirements/summary") return { data: {} };
    if (path === "/api/diesel-requirements/receipt-status") return { data: {} };
    if (path === "/api/plant-module/equipment") return { data: [
      { id: 1, name: "Vehicle A", ownership: "owned" }, { id: 2, name: "Vehicle B", ownership: "owned" },
    ] };
    return { data: fx.empty };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
afterEach(() => { cleanup(); fx.search = ""; localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); });

describe("DIESEL-02 requisition screen fixtures (no database)", () => {
  it("renders the same number on list and purchase update", () => {
    render(<DieselRequirements />);
    expect(screen.getByTestId("card-requirement-95").textContent).toContain("DSL-REQ/26-27/0095");
    fireEvent.click(screen.getByTestId("card-requirement-95"));
    expect(screen.getByTestId("text-update-title").textContent).toContain("DSL-REQ/26-27/0095");
    fireEvent.click(screen.getByTestId("button-back-update"));
  });
  it("renders the same number in the requirement details header", () => {
    fx.search = "?dieselReqId=95";
    render(<DieselRequirements />);
    expect(screen.getByTestId("text-detail-title").textContent).toContain("DSL-REQ/26-27/0095");
  });
  it("exports the same number as the first workbook column", () => {
    render(<DieselRequirements />);
    fireEvent.click(screen.getByTestId("button-export-requirements"));
    const book = fx.writeFile.mock.calls[0][0];
    const rows = XLSX.utils.sheet_to_json(book.Sheets.Requirements, { header: 1 });
    expect((rows[0] as string[])[0]).toBe("Requisition no.");
    expect((rows[1] as string[])[0]).toBe("DSL-REQ/26-27/0095");
  });
});
