// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as XLSX from "xlsx";
import PlantBitumenStock from "../client/src/pages/PlantBitumenStock";
import PlantLdoFlowMeter from "../client/src/pages/PlantLdoFlowMeter";

const fx = vi.hoisted(() => ({
  positions: {} as any,
  empty: [],
  materials: [{ id: 1, name: "BITUMEN VG-30", defaultUom: "MT" }],
  writeFile: vi.fn(),
  owner: false,
}));
vi.mock("xlsx", async original => ({ ...await original<typeof import("xlsx")>(), writeFile: fx.writeFile }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  featureCan: () => true, sectionCan: () => false, user: { id: 1, fullName: "Fixture", isOwner: fx.owner },
}) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyName: "Fixture", companyShortName: "FIX", defaultPlantName: "Main Plant", ownCompanyPartyId: 7 }) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({
  getPlantBackLink: () => "/plant", appendOrigin: (url: string) => url, appendPlantContext: (url: string) => url,
}) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/components/NegativeBalanceBanner", () => ({ NegativeBalanceBanner: () => null }));
vi.mock("@/components/LdoUsableStockStrip", () => ({ LdoUsableStockStrip: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey: [key] }: any) => ({
    isLoading: false,
    data: key === "/api/plant-module/packed-stock-positions" ? fx.positions
      : key === "/api/plant-module/materials" ? fx.materials : fx.empty,
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
afterEach(() => { cleanup(); fx.owner = false; vi.clearAllMocks(); });

describe("FIX-BIT-01 packed stock response", () => {
  it("renders the real rows envelope and MT positions, not raw stock-unit quantities", () => {
    fx.positions = { rows: [{
      materialId: 1, materialName: "BITUMEN VG-30", partyId: 7, partyName: "Fixture party",
      tank1: 1000, tank1Mt: 1, tank2Mt: 2, packedMt: 3, packedCount: 20, totalMt: 6,
    }], canDecant: false };
    render(<PlantBitumenStock />);
    expect(screen.getByText("Bitumen stock positions from the ledger")).toBeTruthy();
    expect(screen.getByText("1.000 MT")).toBeTruthy();
    expect(screen.getByText("6.000 MT")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-export-excel"));
    const book = fx.writeFile.mock.calls[0][0];
    expect(XLSX.utils.sheet_to_json(book.Sheets["Stock Positions"])).toEqual([{
      Material: "BITUMEN VG-30", Party: "Fixture party", "Tank 1 (MT)": 1, "Tank 2 (MT)": 2,
      "Packed count": 20, "Packed (MT)": 3, "Total (MT)": 6,
    }]);
  });
  it.each([{ rows: [], canDecant: true }, {}, undefined])("renders safely when rows are empty or missing (%s)", positions => {
    fx.positions = positions;
    render(<PlantBitumenStock />);
    expect(screen.queryByText("Bitumen stock positions from the ledger")).toBeNull();
  });
  it("shows dashes for non-numbers, including numeric strings, NaN and infinity", () => {
    fx.positions = { rows: [{
      materialId: 1, materialName: "BITUMEN", partyId: null, partyName: "Plant common",
      tank1Mt: "1.2", tank2Mt: NaN, packedCount: undefined, packedMt: Infinity, totalMt: null,
    }], canDecant: false };
    render(<PlantBitumenStock />);
    const row = screen.getByText("Plant common").closest("tr")!;
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByTestId("button-export-excel"));
    const book = fx.writeFile.mock.calls[0][0];
    expect(XLSX.utils.sheet_to_json(book.Sheets["Stock Positions"])[0]).toMatchObject({
      "Tank 1 (MT)": "—", "Tank 2 (MT)": "—", "Packed count": "—", "Packed (MT)": "—", "Total (MT)": "—",
    });
  });
  it.each(["BITUMEN", "LDO"])("places the Owner action on a non-zero %s tracker row", materialName => {
    fx.owner = true;
    fx.positions = { rows: [{
      materialId: 1, materialName, partyId: 7, partyName: "Fixture party", stockUom: "Liters",
      tank1: -1000, tank2: 0, unassigned: 1000, total: 0,
      tank1Mt: -1, tank2Mt: 0, packedMt: 0, packedCount: 0, packed: 0, totalMt: 0,
    }], canDecant: true };
    render(materialName === "LDO" ? <PlantLdoFlowMeter /> : <PlantBitumenStock />);
    expect(screen.getByRole("button", { name: "Move to tank" })).toBeTruthy();
  });
});
