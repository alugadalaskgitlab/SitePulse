// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  search: "",
  navigate: vi.fn(),
  isOwner: false,
  materials: [] as any[],
  ledger: [] as any[],
  positions: [] as any[],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = String(options.queryKey?.[0] ?? "");
    if (!key || key === "null") return { data: undefined, isLoading: false, refetch: vi.fn() };
    if (key.startsWith("/api/plant-module/materials")) return { data: mocks.materials, isLoading: false, refetch: vi.fn() };
    if (key.startsWith("/api/plant-module/stock-ledger")) return { data: mocks.ledger, isLoading: false, refetch: vi.fn() };
    if (key === "/api/plant-module/packed-stock-positions") return { data: { rows: mocks.positions, canDecant: false }, isLoading: false, refetch: vi.fn() };
    if (key.includes("party-statement")) {
      return {
        data: {
          summary: {
            totalReceived: 0,
            dispatchedOwn: 0,
            borrowedFromHlc: 0,
            replenishedToHlc: 0,
            outstanding: 0,
            uom: "MT",
          },
          entries: [],
        },
        isLoading: false,
        refetch: vi.fn(),
      };
    }
    if (key.includes("stock-balance-ledger-check")) {
      return { data: { rows: [], errors: [] }, isLoading: false, isFetching: false, refetch: vi.fn() };
    }
    return {
      data: key.includes("reconciliation") ? undefined : [],
      isLoading: false,
      refetch: vi.fn(),
    };
  },
  useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), getQueryData: vi.fn() }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
  useLocation: () => ["/plant/stock", mocks.navigate],
  useSearch: () => mocks.search,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, isOwner: mocks.isOwner, isAdmin: mocks.isOwner },
    featureCan: () => true,
    sectionCan: () => true,
  }),
}));
vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlags: () => ({ companyName: "Test Company", companyShortName: "Test", logoFile: null }),
}));
vi.mock("@/hooks/use-origin", () => ({
  useOrigin: () => ({ appendPlantContext: (path: string) => path }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));

import PlantStock from "../client/src/pages/PlantStock";

describe("Plant Stock page navigation", () => {
  it("shows the same tidy positions table and Owner correction action", () => {
    mocks.isOwner = true;
    mocks.positions = [{ materialId:41,materialName:"BITUMEN VG-30",partyId:7,partyName:"Fixture party",stockUom:"MT",
      tank1:26.198,tank2:0,packed:3.775,packedCount:25,unassigned:0,total:29.973 }];
    render(<PlantStock />);
    const table = within(screen.getByTestId("tank-stock-positions"));
    expect(table.getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Material","Party","Tank 1","Tank 2","Barrels","Not in a tank","Total","Owner action"]);
    expect(table.getByText("25 (3.775 MT)")).toBeTruthy();
    expect(table.getByRole("button",{ name:"Correct tank stock" })).toBeTruthy();
  });
  beforeEach(() => {
    mocks.search = "";
    mocks.isOwner = false;
    mocks.materials = [];
    mocks.ledger = [];
    mocks.positions = [];
    mocks.navigate.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => null,
      text: async () => "",
    })));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ["Stores", "?tab=stock&returnTo=%2Fstores%2Fhub", "/stores/hub", "stores"],
    ["HMP Operations", "?tab=stock&returnTo=%2Fplant%2Fhub", "/plant/hub", "hmp"],
    ["Stores with context", "?tab=ledger&context=stores&returnTo=%2Fstores%2Fhub", "/stores/hub", "stores"],
    ["HMP Operations with context", "?tab=ledger&context=hmp&returnTo=%2Fplant%2Fhub", "/plant/hub", "hmp"],
    ["Stores context without returnTo", "?tab=ledger&context=stores", "/stores/hub", "stores"],
    ["HMP context without returnTo", "?tab=stock&context=hmp", "/plant/hub", "hmp"],
    ["Stores without context or returnTo", "?tab=ledger", "/stores/hub", "stores"],
    ["HMP without context or returnTo", "?tab=stock", "/plant/hub", "hmp"],
  ])("opens stock and ledger without crashing from %s", async (_source, search, backHref, context) => {
    mocks.search = search;
    render(<PlantStock />);

    expect(await screen.findByRole("tab", { name: /stock summary/i })).toBeTruthy();
    expect(screen.getByTestId("button-back").closest("a")?.getAttribute("href")).toBe(backHref);

    const ledgerTab = screen.getByRole("tab", { name: /ledger details/i });
    fireEvent.mouseDown(ledgerTab, { button: 0 });
    fireEvent.click(ledgerTab);
    expect(ledgerTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel")).toBeTruthy();

    if (search.includes("&context=")) {
      expect(mocks.navigate).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
      expect(mocks.navigate.mock.calls[0][0]).toContain(`context=${context}`);
      expect(mocks.navigate.mock.calls[0][1]).toEqual({ replace: true });
    }
  });

  it("shows the read-only ledger check and typed maintenance confirmation only to Owner", async () => {
    mocks.isOwner = false;
    const nonOwner = render(<PlantStock />);
    expect(nonOwner.queryByTestId("advanced-owner-section")).toBeNull();
    nonOwner.unmount();

    mocks.isOwner = true;
    render(<PlantStock />);
    const advanced = screen.getByTestId("advanced-owner-section") as HTMLDetailsElement;
    expect(advanced.open).toBe(false);
    fireEvent.click(screen.getByText("Advanced (Owner only)"));
    expect(screen.getByTestId("stock-check-matches")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-reconcile-data"));
    const proceed = screen.getByTestId("button-adv-proceed") as HTMLButtonElement;
    expect(proceed.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("input-confirm-stock-action"), { target: { value: "RECONCILE" } });
    expect(proceed.disabled).toBe(false);
  });
  it("excludes tank assignments from stock-summary and all-time receipt/issue totals", () => {
    mocks.materials = [{ id: 41, name: "LDO", category: "Fuel", defaultUom: "Liters", isActive: 1 }];
    const common = { date: "2026-11-27", materialId: 41, partyId: 7, uom: "Liters", balanceAfter: 80 };
    mocks.ledger = [
      { ...common, id: 1, transactionType: "receipt", quantityIn: 100, quantityOut: 0 },
      { ...common, id: 2, transactionType: "dispatch", quantityIn: 0, quantityOut: 20 },
      { ...common, id: 3, transactionType: "tank_assignment", quantityIn: 0, quantityOut: 50, tankNumber: null },
      { ...common, id: 4, transactionType: "tank_assignment", quantityIn: 50, quantityOut: 0, tankNumber: 1 },
    ];
    const page = render(<PlantStock />);
    expect(page.container.textContent).toContain("+100.000");
    expect(page.container.textContent).toContain("-20.000");
    expect(page.container.textContent).not.toContain("+150.000");
    expect(page.container.textContent).not.toContain("-70.000");
    const balances = screen.getByRole("tab", { name: /current balances/i });
    fireEvent.mouseDown(balances, { button: 0 }); fireEvent.click(balances);
    const card = screen.getByTestId("card-balance-41-7");
    expect(card.textContent).toContain("+100.000");
    expect(card.textContent).toContain("-20.000");
    expect(card.textContent).toContain("80.000");
  });
});
