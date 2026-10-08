import { describe, it, expect } from "vitest";
import { arrangementTripRatesSchema as schema } from "../shared/arrangementTripRates";
import { classifyArrangementEdit } from "../shared/executionState";
import { readFileSync } from "node:fs";
const rates = [600,800,1000].map(quantity => ({quantity,uom:"CFT",rate:quantity*2}));
describe("arrangement trip-rate storage contract", () => {
  it("retains three independent flat rates, including zero", () => {
    expect(schema.parse(rates)).toEqual(rates);
    expect(schema.parse([{quantity:600,uom:" cft ",rate:0}])).toEqual([{quantity:600,uom:"CFT",rate:0}]);
  });
  it("stores empty rows as null and retains explicit null", () => {
    expect(schema.parse([])).toBeNull();
    expect(schema.parse(null)).toBeNull();
  });
  it.each([
    [{quantity:0,uom:"CFT",rate:20}],
    [{quantity:-1,uom:"CFT",rate:20}],
    [{quantity:600,uom:" ",rate:20}],
    [{quantity:600,uom:"CFT",rate:-1}],
    [{quantity:600,uom:"CFT",rate:Infinity}],
    [{quantity:"600",uom:"CFT",rate:20}],
    [{quantity:600,uom:"CFT",rate:20,unexpected:true}],
  ])("rejects invalid rows %j", row => expect(schema.safeParse([row]).success).toBe(false));
  it("rejects duplicates despite case and whitespace and allows different UOMs", () => {
    const result=schema.safeParse([rates[0],{...rates[0],uom:" cft "}]);
    expect(result.success).toBe(false);
    if(!result.success)expect(result.error.issues[0].message).toContain("Duplicate trip size");
    expect(schema.parse([rates[0],{...rates[0],uom:"CUM"}])).toHaveLength(2);
  });
  it("keeps trip rates within the existing commercial-revision guard", () => {
    expect(classifyArrangementEdit({tripRates:null},{tripRates:rates}).material).toEqual(["tripRates"]);
    expect(classifyArrangementEdit({tripRates:rates},{tripRates:rates}).material).toEqual([]);
  });
  it("never connects rates to billing or vendor rate-card pricing", () => {
    expect(readFileSync("shared/vendorBillTransport.ts","utf8")).not.toContain("tripRates");
  });
});
