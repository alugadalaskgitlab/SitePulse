// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ArrangementTripRatesEditor, ArrangementTripRatesView, parseTripRateDrafts, type TripRateDraft } from "./ArrangementTripRates";
import { renderToStaticMarkup } from "react-dom/server";
afterEach(cleanup);
function Harness() {
  const [rows,setRows]=useState<TripRateDraft[]>([]);
  return <><ArrangementTripRatesEditor rows={rows} onChange={setRows} /><output>{JSON.stringify(parseTripRateDrafts(rows))}</output></>;
}
describe("arrangement trip-rate entry", () => {
  it("round-trips three entered values without deriving a bill amount", async () => {
    const rows=[600,800,1000].map(quantity=>({quantity:String(quantity),uom:"CFT",rate:String(quantity*2)}));
    const result=parseTripRateDrafts(rows);
    expect(result.success).toBe(true);
    if(!result.success)throw Error("Invalid fixture");
    expect(result.data).toEqual([600,800,1000].map(quantity=>({quantity,uom:"CFT",rate:quantity*2})));
    if(process.env.ARRANGEMENT_TRIP_RATES_EVIDENCE){
      const fs=await import("node:fs");
      const css=fs.readdirSync("dist/public/assets").find(n=>n.startsWith("index-")&&n.endsWith(".css"))!;
      const cases=[
        ["Three rates / reopen",rows],
        ["Duplicate rejected",[...rows,rows[0]]],
        ["Negative rate rejected",[{...rows[0],rate:"-1"}]],
        ["Zero quantity rejected",[{...rows[0],quantity:"0"}]],
        ["Row removed",rows.slice(0,2)],
        ["No rows — stores null",[]],
      ] as const;
      const html=cases.map(([label,values])=>`<section class="p-4 border rounded mb-4"><h2 class="font-bold mb-2">${label}</h2>${renderToStaticMarkup(<ArrangementTripRatesEditor rows={[...values]} onChange={()=>{}} />)}</section>`).join("");
      fs.writeFileSync("reports/vb-arrange02a/component-fixtures.html",`<!doctype html><html><head><meta charset="utf-8"><style>${fs.readFileSync(`dist/public/assets/${css}`,"utf8")}</style></head><body class="p-6 bg-background text-foreground"><h1 class="font-bold text-lg mb-4">Component test fixtures — not saved arrangements</h1>${html}<h2>Read-only display</h2>${renderToStaticMarkup(<ArrangementTripRatesView rates={result.data} />)}</body></html>`);
    }
  });
  it("adds rows, flags duplicates before saving, removes rows and returns null when empty", () => {
    render(<Harness />);
    for(let i=1;i<=2;i++){
      fireEvent.click(screen.getByText("+ Add row"));
      for(const [label,value] of [["Trip quantity","600"],["Trip UOM",i===1?"CFT":" cft "],["Rate per trip","1200"]])
        fireEvent.change(screen.getByLabelText(`${label} ${i}`),{target:{value}});
    }
    expect(screen.getByRole("alert").textContent).toContain("Duplicate trip size");
    fireEvent.click(screen.getByLabelText("Remove trip rate 2"));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByLabelText("Trip quantity 1"),{target:{value:"0"}});
    expect(screen.getByRole("alert").textContent).toContain("greater than zero");
    fireEvent.change(screen.getByLabelText("Trip quantity 1"),{target:{value:"600"}});
    fireEvent.change(screen.getByLabelText("Rate per trip 1"),{target:{value:"-1"}});
    expect(screen.getByRole("alert").textContent).toContain("negative");
    fireEvent.click(screen.getByLabelText("Remove trip rate 1"));
    expect(screen.getByRole("status").textContent).toContain('"data":null');
  });
  it("shows saved rates read-only and renders nothing for legacy null", () => {
    const view=render(<ArrangementTripRatesView rates={[{quantity:600,uom:"CFT",rate:1200}]} />);
    expect(screen.getByText(/600 CFT — ₹1,200 per trip/)).toBeTruthy();
    expect(screen.getByText(/extraction, loading, haulage and dumping/)).toBeTruthy();
    view.rerender(<ArrangementTripRatesView rates={null} />);
    expect(view.container.innerHTML).toBe("");
  });
});
