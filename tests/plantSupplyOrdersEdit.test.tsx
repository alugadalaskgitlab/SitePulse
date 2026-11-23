// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const mock = vi.hoisted(() => ({
  order: {
    id: 101,
    orderNo: "PO-TEST-101",
    partyId: 3,
    partyName: "Fixture party",
    dispatchProSiteId: null,
    periodFrom: "2026-11-01",
    periodTo: "2026-11-30",
    workName: "Fixture road",
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
          materialUsage: [{ materialId: 9, materialName: "20MM", allowance: 95, actual: 94, uom: "MT" }],
          attachments: [],
        },
      ],
    }],
    dispatches: [],
    materials: [],
    materialUsage: [],
    attachments: [],
    history: [],
    borrowings: [],
    alerts: [],
  },
  invalidate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: any) => {
    const key = options.queryKey?.[0];
    if (key === "/api/plant-module/supply-orders/options") return {
      data: {
        parties: [{ id: 3, name: "Fixture party", dispatchProSiteId: null }],
        sites: [],
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
  useAuth: () => ({ isOwner: true, sectionVisible: () => true }),
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
  it("shows the order's two dated mix versions with per-version allowance and actual", async () => {
    render(<PlantSupplyOrders />);
    await waitFor(() => expect(screen.getByTestId("order-mix-timeline-12")).toBeInTheDocument());
    expect(screen.getByText(/Original order mix/)).toBeInTheDocument();
    expect(screen.getByText(/Version 1/)).toBeInTheDocument();
    expect(screen.getByText(/allowance 95\.000 MT · actual 94\.000 MT/)).toBeInTheDocument();
    expect(screen.getByText(/Mix instruction attached/)).toBeInTheDocument();
  });

  it("offers order editing and a date-effective mix change to lifecycle managers", async () => {
    render(<PlantSupplyOrders />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Edit order/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Change mix from a date and time/i })).toBeInTheDocument();
    expect(screen.getByText(/Order history/)).toBeInTheDocument();
  });
});
