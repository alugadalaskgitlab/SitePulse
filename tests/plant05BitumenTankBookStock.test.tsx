// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDeadStockVolume, getVolumeAtDepth, BITUMEN_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = options.queryKey?.[0];
    if (key === "/api/plant-module/bitumen-tank-balances") return {
      data: {
        tank1: 10,
        tank2: 4,
        total: 14,
        byParty: [
          { partyId: 1, partyName: "Alladurg Plant", tank1: 3, tank2: 1 },
          { partyId: 2, partyName: "High Lane Constructions", tank1: 7, tank2: 3 },
        ],
      },
    };
    if (key === "/api/plant-module/plant-settings") return { data: { primaryPartyId: 1 } };
    if (key === "/api/plant-module/parties") return {
      data: [
        { id: 1, name: "Alladurg Plant" },
        { id: 2, name: "High Lane Constructions" },
      ],
    };
    return { data: [] };
  },
}));
vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlags: () => ({ ownCompanyPartyId: 2 }),
}));

import { BitumenTankBookStock } from "../client/src/components/BitumenTankBookStock";

describe("PLANT-05 live bitumen tank book stock", () => {
  afterEach(() => cleanup());

  it("shows ledger stock split by party and compares a typed dip with the ledger", () => {
    render(<BitumenTankBookStock plantName="HMP Plant" tankNumber={1} dipCm="50" showBookSummary />);

    const deadStockMt = getDeadStockVolume() * BITUMEN_DENSITY_KG_PER_LITER / 1000;
    const dipMt = getVolumeAtDepth(50) * BITUMEN_DENSITY_KG_PER_LITER / 1000;
    const difference = 10 - dipMt;
    const hint = screen.getByTestId("bitumen-book-stock-1");

    expect(hint).toHaveTextContent(`Book stock 10.000 MT (usable ${(10 - deadStockMt).toFixed(3)} MT · dead stock ${deadStockMt.toFixed(3)} MT)`);
    expect(hint).toHaveTextContent("Alladurg Plant 3.000 MT · HLC 7.000 MT");
    expect(screen.getByTestId("bitumen-dip-book-difference-1")).toHaveTextContent(
      `Dip shows ${dipMt.toFixed(3)} MT — ${difference.toFixed(3)} MT less than book`,
    );
  });
});
