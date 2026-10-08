// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReceiptWorkContext } from "./ReceiptWorkContext";
vi.mock("@tanstack/react-query",()=>({
  useQuery:({queryKey}:any)=>{
    const key=queryKey[0];
    if(key==="/api/boq/projects")return {data:queryKey.length===2?[{id:12,name:"Road"}]:[{id:29,description:"Embankment",unit:"CUM"}]};
    if(key==="earthwork-arrangements-item")return {data:[{
      id:31,boqProjectId:12,boqItemId:29,materialLabel:"Soil",agencyName:"Agency",
      arrangementType:"other_agency",status:"approved",
      get agreedRate(){throw Error("Manual work context must not read rates");},
    }]};
    return {data:[]};
  },
}));
afterEach(cleanup);
describe("manual existing-trip work context",()=>{
  it("does not select the sole arrangement or read money; an explicit selector remains",()=>{
    const onChange=vi.fn();
    render(<ReceiptWorkContext manualOnly siteName="TEST" sitesList={[{id:1,name:"TEST"}] as any}
      operationalDate="2026-10-08" value={{boqProjectId:12,boqItemId:29,programmeBarId:null,earthworkArrangementId:null}} onChange={onChange}/>);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("work-ctx-select-arrangement")).toBeTruthy();
    expect(screen.queryByTestId("work-ctx-arrangement-single")).toBeNull();
  });
  it("does not autofill a project or clear a stored link when merely opened",()=>{
    const onChange=vi.fn();
    render(<ReceiptWorkContext manualOnly siteName="TEST" sitesList={[{id:1,name:"TEST"}] as any}
      operationalDate="2026-10-08" value={{boqProjectId:null,boqItemId:null,programmeBarId:null,earthworkArrangementId:31}} onChange={onChange}/>);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("work-ctx-select-project")).toBeTruthy();
  });
});
