import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({queries:[] as any[]}));
vi.mock("@tanstack/react-query",()=>({useQuery:(options:any)=>{state.queries.push(options);return {data:[]};}}));
import { ReceiptWorkContext } from "../client/src/components/ReceiptWorkContext";
beforeEach(()=>{state.queries=[];vi.unstubAllGlobals();});
it("manual trip corrections use site-scoped edit options and keep only the selected item's project and allocations",async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>[
  {id:1,boqProjectId:2,boqItemId:5},
  {id:2,boqProjectId:2,boqItemId:null,boqItemAllocations:[{boqItemId:5}]},
  {id:3,boqProjectId:9,boqItemId:5},{id:4,boqProjectId:2,boqItemId:6},
 ]});vi.stubGlobal("fetch",fetch);
 renderToStaticMarkup(<ReceiptWorkContext manualOnly siteName="Site A" sitesList={[]} operationalDate="2026-10-08" value={{boqProjectId:2,boqItemId:5,programmeBarId:null,earthworkArrangementId:null}} onChange={()=>{}}/>);
 const query=state.queries.find(q=>q.queryKey[0]==="earthwork-arrangements-item");
 expect((await query.queryFn()).map((r:any)=>r.id)).toEqual([1,2]);
 expect(fetch).toHaveBeenCalledWith("/api/site-material-trips/arrangement-options?site=Site%20A",{credentials:"include"});
 expect(state.queries.find(q=>q.queryKey[0]==="arrangement-programme-allocations").enabled).toBe(false);
});
it("a refused ordinary arrangement-options read is an error, not a fabricated empty success",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:403}));
 renderToStaticMarkup(<ReceiptWorkContext manualOnly siteName="Site A" sitesList={[]} operationalDate="2026-10-08" value={{boqProjectId:2,boqItemId:5,programmeBarId:null,earthworkArrangementId:null}} onChange={()=>{}}/>);
 await expect(state.queries.find(q=>q.queryKey[0]==="earthwork-arrangements-item").queryFn()).rejects.toThrow("Could not load");
});
