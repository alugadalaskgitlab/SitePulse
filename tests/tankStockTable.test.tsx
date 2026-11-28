// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TankStockPositions } from "../client/src/components/TankStockPositions";
import { TANK_STOCK_HEADERS, TANK_STOCK_NOTE, tankStockCells, tankStockExportRows, tankStockPrintTable, visibleTankStockRows, type TankStockPosition } from "../shared/tankAssignment";
vi.mock("@/components/TankAssignmentButton", () => ({ TankAssignmentButton: () => <button>Correct tank stock</button> }));
const row: TankStockPosition = { materialId:41,materialName:"BITUMEN VG-30",partyId:7,partyName:"Fixture party",stockUom:"MT",
  tank1:26.198,tank2:0,packed:3.775,packedCount:25,unassigned:0,total:29.973 };
const empty = { ...row,partyId:8,partyName:"Empty party",tank1:0,tank2:0,packed:0,packedCount:0,unassigned:0,total:0 };
afterEach(cleanup);
it("uses the required header order and only figures plus units in quantity cells", () => {
  render(<TankStockPositions rows={[row]} owner={true} showAll={false} onShowAllChange={() => {}} />);
  const table = within(screen.getByTestId("tank-stock-positions"));
  expect(table.getAllByRole("columnheader").map(header => header.textContent)).toEqual([...TANK_STOCK_HEADERS,"Owner action"]);
  expect(table.getAllByRole("cell").slice(2,7).map(cell => cell.textContent)).toEqual(["26.198 MT","0.000 MT","25 (3.775 MT)","0.000 MT","29.973 MT"]);
  expect(screen.getAllByText(TANK_STOCK_NOTE)).toHaveLength(1);
});
it("hides zero rows until Show all is ticked, but retains offsetting negative positions", () => {
  function Fixture() { const [all,setAll] = useState(false); return <TankStockPositions rows={[row,empty]} owner={false} showAll={all} onShowAllChange={setAll} />; }
  render(<Fixture />); expect(screen.queryByText("Empty party")).toBeNull();
  expect(screen.queryByRole("button",{ name:"Correct tank stock" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox",{ name:"Show all" })); expect(screen.getByText("Empty party")).toBeTruthy();
  expect(visibleTankStockRows([{ ...empty,tank1:-1,unassigned:1 }],false)).toHaveLength(1);
});
it("uses exactly the screen cells for Excel, PDF rows and safely escaped print HTML", () => {
  const cells = tankStockCells(row);
  expect(Object.values(tankStockExportRows([row])[0])).toEqual(cells);
  const html = tankStockPrintTable([{ ...row,partyName:"A & <B>" }]);
  expect(html).toContain("A &amp; &lt;B&gt;"); expect(html).not.toContain("<B>");
  expect(html).toContain("<td>25 (3.775 MT)</td>"); expect(html).not.toContain("Tank 1:");
  for (const heading of TANK_STOCK_HEADERS) expect(html).toContain(`<th>${heading}</th>`);
});
it("formats LDO as litres and converts unassigned bitumen kilograms to MT", () => {
  expect(tankStockCells({ ...row,materialName:"LDO",stockUom:"Liters",tank1:4500,packed:2000,packedCount:10,total:6500 })).toContain("10 (2,000 L)");
  expect(tankStockCells({ ...row,stockUom:"Kg",unassigned:475 })[5]).toBe("0.475 MT");
});
