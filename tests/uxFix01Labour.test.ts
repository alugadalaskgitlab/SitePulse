import { describe, expect, it } from "vitest";
import { isFilledLabourRow } from "../shared/labourEntry";
import { evaluateDprSubmitReadiness } from "../shared/dprSubmitReadiness";
import { insertLabourSchema, labourLogs } from "../shared/schema";
import { getTableColumns } from "drizzle-orm";

describe("UX-FIX-01 labour entry", () => {
  it("ignores blank rows with category defaults and suggested BOQ", () => {
    expect(isFilledLabourRow({count:null,workerNames:[" "]})).toBe(false);
    expect(evaluateDprSubmitReadiness({labour:[{category:"Unskilled",count:null,boqItemId:13}]}).mandatory).toEqual([]);
  });
  it.each([{task:"Cleaning"},{contractor:"Direct / local hire"},{hours:4},{workerNames:["Worker"]}])("requires count for entered evidence %j", fields => {
    expect(isFilledLabourRow(fields)).toBe(true);
    expect(evaluateDprSubmitReadiness({labour:[{category:"Unskilled",...fields}]}).mandatory.map(x=>x.message)).toEqual(["Enter the number of workers"]);
  });
  it("keeps zero a deliberate entered count", () => {
    expect(isFilledLabourRow({count:0})).toBe(true);
    expect(evaluateDprSubmitReadiness({labour:[{category:"Unskilled",count:0}]}).mandatory).toEqual([]);
  });
  it("validates optional hours without changing count", () => {
    for(const hours of [undefined,null,0.5,4,24]) expect(insertLabourSchema.safeParse({category:"Unskilled",count:2,hours}).success).toBe(true);
    for(const hours of [0,0.49,24.1,Infinity,NaN]) expect(insertLabourSchema.safeParse({category:"Unskilled",count:2,hours}).success).toBe(false);
    const c=getTableColumns(labourLogs).hours;
    expect(c.notNull).toBe(false);expect(c.hasDefault).toBe(false);
  });
});