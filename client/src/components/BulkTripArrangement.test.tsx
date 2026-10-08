// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BulkTripArrangement } from "./BulkTripArrangement";
import { apiRequest, queryClient } from "@/lib/queryClient";
vi.mock("@/lib/queryClient",async()=>{
  const {QueryClient}=await import("@tanstack/react-query");
  return {apiRequest:vi.fn(),queryClient:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})};
});
const filters={site:"TEST SITE",material:"SOIL",supplier:"CARRIER",vehicleNumber:"TS01",dateFrom:"2026-10-01",dateTo:"2026-10-08",onlyUnassigned:false,onlyWithoutArrangement:false,roleFilter:"all"};
beforeEach(()=>{
  vi.mocked(apiRequest).mockReset().mockImplementation(async(method,url,body:any)=>{
    const data=url.includes("arrangement-options")
      ? [{id:11,agencyName:"Agency",materialLabel:"Soil",reachLabel:"Reach A",chainageFrom:1,chainageTo:2,projectName:"Road"}]
      : url.endsWith("preview") ? {eligibleCount:body.onlyUnlinked?2:3,overwriteCount:body.onlyUnlinked?0:1,alreadyLinkedCount:1,previewToken:"explicit-confirmation"}
      : {updatedCount:body.onlyUnlinked?2:3};
    return {json:async()=>data} as Response;
  });
});
afterEach(()=>{cleanup();queryClient.clear();});
async function choose(){
  const details=screen.getByTestId("bulk-arrangement-tool") as HTMLDetailsElement;
  details.open=true;fireEvent(details,new Event("toggle"));
  await screen.findByRole("option",{name:/Agency.*Soil.*Reach A/});
  fireEvent.change(screen.getByLabelText("Bulk Execution Arrangement"),{target:{value:"11"}});
  await waitFor(()=>expect(screen.getByTestId("arrangement-eligible-count").textContent).toContain("2 eligible trips"));
}
describe("explicit bulk arrangement confirmation",()=>{
  it("shows the authoritative count and every filter; only confirm sends a write",async()=>{
    render(<QueryClientProvider client={queryClient}><BulkTripArrangement filters={filters}/></QueryClientProvider>);
    await choose();
    fireEvent.click(screen.getByText("Link 2 eligible trips"));
    for(const text of ["Site: TEST SITE","Material: SOIL","Transporter: CARRIER","Vehicle: TS01","Dates: 2026-10-01 to 2026-10-08","No-arrangement list filter: No"])
      expect(screen.getByText(text)).toBeTruthy();
    expect(vi.mocked(apiRequest).mock.calls.filter(c=>c[1].endsWith("/bulk"))).toHaveLength(0);
    fireEvent.click(screen.getByText("Confirm arrangement links"));
    await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith("POST","/api/site-material-trips/arrangement/bulk",expect.objectContaining({...filters,onlyUnlinked:true,earthworkArrangementId:11,previewToken:"explicit-confirmation"})));
  });
  it("overwrite is a separate deliberate choice with its own count and confirmation",async()=>{
    render(<QueryClientProvider client={queryClient}><BulkTripArrangement filters={filters}/></QueryClientProvider>);
    await choose();
    fireEvent.click(screen.getByLabelText("Only trips not yet linked to an arrangement"));
    await waitFor(()=>expect(screen.getByTestId("arrangement-eligible-count").textContent).toContain("3 eligible trips"));
    fireEvent.click(screen.getByText("Link 3 eligible trips"));
    expect(screen.getByText(/1 of these 3 already point at another arrangement/)).toBeTruthy();
    expect(screen.getByText(/Only not yet linked: No/)).toBeTruthy();
  });
  it("blocks role subsets and requires an explicit arrangement rather than guessing",async()=>{
    render(<QueryClientProvider client={queryClient}><BulkTripArrangement filters={{...filters,roleFilter:"own_source_agency"}}/></QueryClientProvider>);
    const details=screen.getByTestId("bulk-arrangement-tool") as HTMLDetailsElement;
    details.open=true;fireEvent(details,new Event("toggle"));
    await screen.findByRole("option",{name:/Agency/});
    expect((screen.getByLabelText("Bulk Execution Arrangement") as HTMLSelectElement).value).toBe("");
    expect((screen.getByText("Link 0 eligible trips") as HTMLButtonElement).disabled).toBe(true);
    expect(vi.mocked(apiRequest).mock.calls.some(c=>c[1].endsWith("/preview"))).toBe(false);
  });
});
