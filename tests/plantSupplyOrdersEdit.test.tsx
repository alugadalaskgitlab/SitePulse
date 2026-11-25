// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const mock = vi.hoisted(() => ({
  order: {
    id: 101,
    orderNo: "PO-TEST-101",
    partyId: 3,
    partyName: "Fixture party",
    partyContactPerson: "Fixture contact",
    partyMobile: "9876543210",
    partyGstNo: "GST-TEST",
    partyPanNo: "ABCDE1234F",
    partyAddress: "Fixture address",
    dispatchProSiteId: null,
    siteId: 5,
    siteName: "Fixture site",
    siteWorkDetails: {
      workName: "Current master road",
      clientDepartment: "PWD",
      division: "North",
      mandal: "Test mandal",
      district: "Test district",
      agreementEstimateRef: "AG-1",
      estimateSorYear: "2026",
      mtPerCumFactor: "2.400",
    },
    periodFrom: "2026-11-01",
    periodTo: "2026-11-30",
    workName: "Old order snapshot",
    status: "open",
    createdAt: "2026-11-01T04:00:00.000Z",
    mtPerCumFactor: "2.356",
    lines: [{
      id: 12,
      mixTemplateId: 4,
      mixName: "BC fixture",
      enteredQuantity: 100,
      enteredUnit: "MT",
      orderedMt: 100,
      equivalentCum: 42.445,
      plannedMtPerDay: 10,
      dispatchedMt: 0,
      balanceMt: 100,
      orderMix: { bitumenPercent: 5.2, sourceBitumenPercent: 5.2, components: [] },
      mixVersions: [
        {
          versionId: null,
          mixName: "BC fixture",
          bitumenPercent: 5.2,
          effectiveAt: "2026-11-01T04:00:00.000Z",
          dispatchedMt: 0,
          instructionAttached: false,
          createdByName: "Owner",
          components: [],
          materialUsage: [],
        },
        {
          versionId: 77,
          mixName: "BC fixture",
          bitumenPercent: 5.0,
          effectiveAt: "2026-11-10T04:30:00.000Z",
          reason: "Fixture version change",
          dispatchedMt: 0,
          instructionAttached: true,
          createdByName: "Owner",
          components: [{ materialId: 9, materialName: "20MM", aggregateSharePercent: 94 }],
          materialUsage: [{ materialId: 9, materialName: "20MM", allowance: 777, actual: 888, uom: "MT" }],
          attachments: [],
        },
      ],
    }],
    dispatches: [],
    materials: [{
      materialId: 9,
      materialName: "20MM",
      need: 100,
      uom: "MT",
      scope: "hlc",
      stockAvailable: 50,
      stockUom: "MT",
      shortage: 50,
      runningLow: true,
      dailyNeed: 20,
    }],
    materialUsage: [{ materialId: 9, materialName: "20MM", allowance: 777, actual: 888, variance: 111, uom: "MT" }],
    attachments: [],
    history: [],
    borrowings: [],
    alerts: [],
    dispatchPro: null as any,
  },
  invalidate: vi.fn(),
  toast: vi.fn(),
  isOwner: true,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: any) => {
    const key = options.queryKey?.[0];
    if (key === "/api/plant-module/supply-orders/options") return {
      data: {
        parties: [{ id: 3, name: "Fixture party", dispatchProSiteId: null }],
        sites: [{
          id: 5,
          name: "Fixture site",
          workName: "Current master road",
          clientDepartment: "PWD",
          division: "North",
          mandal: "Test mandal",
          district: "Test district",
          agreementEstimateRef: "AG-1",
          estimateSorYear: "2026",
          mtPerCumFactor: "2.400",
        }],
        mixes: [{ id: 4, name: "BC fixture", mixType: "BC", partyId: null, bitumenPercent: 5.2, ldoNorm: 6 }],
        materials: [{ id: 9, name: "20MM", defaultUom: "MT" }],
        mixComponents: [],
        canManageLifecycle: true,
      },
      isLoading: false,
    };
    if (key === "/api/plant-module/supply-orders" && options.queryKey?.length > 1) return { data: mock.order, isLoading: false };
    if (key === "/api/plant-module/supply-orders") return { data: [mock.order], isLoading: false };
    return { data: [], isLoading: false };
  },
  useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: mock.invalidate }),
}));
vi.mock("wouter", () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
  useSearch: () => "?orderId=101",
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ isOwner: mock.isOwner, sectionVisible: () => true }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock("@/hooks/use-upload", () => ({ useUpload: () => ({ uploadFile: vi.fn() }) }));
vi.mock("@/components/HubShell", () => ({
  HubShell: ({ children }: any) => <main>{children}</main>,
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(async () => ({ json: async () => ({ id: 101 }) })),
}));

import PlantSupplyOrders from "../client/src/pages/PlantSupplyOrders";

afterEach(() => cleanup());

describe("ORDERS-02 order detail and editing UI", () => {
  it("shows mix changes collapsed and keeps usage figures out of the regular order view", async () => {
    render(<PlantSupplyOrders />);
    const changes = await screen.findByTestId("order-mix-changes");
    expect(changes).toHaveTextContent("Mix changes (1)");
    expect(changes).not.toHaveAttribute("open");
    expect(screen.queryByText(/Material allowance and actual use/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Actually used/)).not.toBeInTheDocument();
    expect(screen.getByText(/Instruction attached/)).toBeInTheDocument();
    expect(document.querySelector("#supply-order-print")?.textContent).not.toContain("888");
    expect(document.querySelector("#supply-order-print")?.textContent).not.toContain("777");
  });

  it("offers order editing and a date-effective mix change to lifecycle managers", async () => {
    render(<PlantSupplyOrders />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Edit order/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Change mix from a date and time/i })).toBeInTheDocument();
    expect(screen.getByText(/Order history/)).toBeInTheDocument();
  });

  it("shows current Party and Site master details and hides copying when Site details exist", async () => {
    render(<PlantSupplyOrders />);
    await waitFor(() => expect(screen.getByTestId("order-party-master-details")).toBeInTheDocument());
    expect(screen.getAllByText("Current master road").length).toBeGreaterThan(0);
    expect(screen.getByTestId("order-party-master-details").textContent).toContain("Fixture contact");
    expect(screen.getByTestId("order-party-master-details").textContent).toContain("PAN no.: ABCDE1234F");
    expect(screen.getByRole("link", { name: "Edit in Party master" })).toHaveAttribute("href", "/plant/dashboard#party-master");
    expect(screen.queryByRole("button", { name: /Copy work details to Site master/i })).not.toBeInTheDocument();
    expect(document.querySelector("#supply-order-print")?.textContent).toContain("PAN no.: ABCDE1234F");
    expect(screen.queryByText("Old order snapshot")).not.toBeInTheDocument();
    expect(screen.getByTestId("dispatchpro-order-status")).toHaveTextContent("DispatchPro: not sent");
    expect(screen.getByTestId("order-material-status")).toHaveTextContent("Available at plant");
    expect(screen.getByTestId("order-material-status")).toHaveTextContent("50.0 MT");
    expect(screen.getByTestId("order-material-status")).toHaveTextContent("Raise indent");
    expect(screen.queryByText(/Quantity conversion/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MT · \\d+\\.\\d+ cum/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Material supply for remaining mix/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("order-no-work-documents")).toHaveTextContent("Work documents: none");

  });

  it("shows no mix changes until the order actually has a saved version", async () => {
    const savedVersions = mock.order.lines[0].mixVersions;
    mock.order.lines[0].mixVersions = [mock.order.lines[0].mixVersions[0]];
    render(<PlantSupplyOrders />);
    await waitFor(() => expect(screen.getAllByText("Order quantity").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("order-mix-changes")).not.toBeInTheDocument();
    mock.order.lines[0].mixVersions = savedVersions;
  });

  it("keeps the Edit order form to approved fields and includes each material supplier", async () => {
    render(<PlantSupplyOrders />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit order/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Who supplies each material");
    expect(dialog).toHaveTextContent("20MM");
    expect(screen.getByRole("combobox", { name: "Who supplies 20MM" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("MT per cum factor");
    expect(dialog).not.toHaveTextContent("Work details");
    expect(dialog).not.toHaveTextContent("Division");
    expect(dialog).not.toHaveTextContent("Mandal");
    expect(dialog).not.toHaveTextContent("District");
    expect(dialog).not.toHaveTextContent("Agreement / estimate reference");
    expect(dialog).not.toHaveTextContent("Estimate SOR year");
  });

  it("offers copying typed work only when the Site master has no work details", async () => {
    const saved = {
      siteWorkDetails: mock.order.siteWorkDetails,
      workName: mock.order.workName,
      division: mock.order.division,
    };
    mock.order.siteWorkDetails = {
      workName: null,
      clientDepartment: null,
      division: null,
      mandal: null,
      district: null,
      agreementEstimateRef: null,
      estimateSorYear: null,
      mtPerCumFactor: null,
    };
    mock.order.workName = "Legacy typed work";
    mock.order.division = "Legacy division";
    render(<PlantSupplyOrders />);
    expect(await screen.findByTestId("order-no-site-master-details")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy work details to Site master/i })).toBeInTheDocument();
    cleanup();

    mock.order.workName = null;
    mock.order.division = null;
    render(<PlantSupplyOrders />);
    await screen.findByTestId("order-no-site-master-details");
    expect(screen.queryByRole("button", { name: /Copy work details to Site master/i })).not.toBeInTheDocument();
    Object.assign(mock.order, saved);
  });

  it("shows the no-details message when the Party master fields are empty", async () => {
    const saved = {
      partyContactPerson: mock.order.partyContactPerson,
      partyMobile: mock.order.partyMobile,
      partyGstNo: mock.order.partyGstNo,
      partyPanNo: mock.order.partyPanNo,
      partyAddress: mock.order.partyAddress,
    };
    Object.assign(mock.order, {
      partyContactPerson: null,
      partyMobile: null,
      partyGstNo: null,
      partyPanNo: null,
      partyAddress: null,
    });
    render(<PlantSupplyOrders />);
    expect(await screen.findByTestId("order-no-contractor-details")).toHaveTextContent("No contractor details in Party master");
    Object.assign(mock.order, saved);
  });

  it("shows the DispatchPro link status and Owner-only conflict choices", async () => {
    mock.order.dispatchPro = {
      status: "sent",
      lastError: null,
      responseSiteId: "DP-NEW",
      responseSiteName: "NEW-SITE",
      linkedSiteId: "MANUAL-3",
      partyLinkId: "MANUAL-3",
      existingLinkId: "MANUAL-3",
      conflictSource: "party",
      needsOwnerChoice: true,
      hasSite: true,
    };
    mock.isOwner = true;
    render(<PlantSupplyOrders />);
    expect(await screen.findByText(/Party already linked to MANUAL-3 in DispatchPro/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use it" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();

    cleanup();
    mock.isOwner = false;
    render(<PlantSupplyOrders />);
    expect(screen.getByText("Waiting for the Owner to choose.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use it" })).not.toBeInTheDocument();
    mock.isOwner = true;
    delete mock.order.dispatchPro;
  });

  it("asks for a SitePulse site instead of offering Retry when the order has no site", async () => {
    mock.order.dispatchPro = { status: "not_sent", lastError: null, hasSite: false };
    render(<PlantSupplyOrders />);

    expect(await screen.findByText("DispatchPro: choose a site for this order first")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
    mock.order.dispatchPro = null;
  });
});
