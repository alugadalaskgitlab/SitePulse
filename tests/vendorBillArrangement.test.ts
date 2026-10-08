import { describe, it, expect } from "vitest";
import { priceArrangementTrip, tripBillSourcesConflict } from "../shared/vendorBillArrangement";
import { vendorBillTripCandidate } from "../shared/vendorBillTripRoles";
import { mapAutoBillItem, groupRateItems } from "../shared/vendorBillCandidates";
import { arrangementBillValidationError } from "../shared/vendorBillArrangementValidation";
import { applyTransportCard } from "../shared/vendorBillTransport";
import { calcCandidateAmount } from "../shared/vendorBillCandidates";
const trip = { id: 41, date: "2026-10-08", quantity: 600, uom: "CFT", material: "Soil", site: "Site A",
  materialSourceType: "own_source", transportType: "agency_vendor", supplier: "Agency" } as const;
const arrangement = { id: 4, billingTerms: { scope: "full_service", basis: "trip" } as const,
  tripRates: [300,600,800,1000].map((quantity,i) => ({ quantity, uom: "CFT", rate: 1000 + i * 250 })), agreedRate: 100 };
describe("arrangement billing", () => {
  it("leaves the existing kilometre transport-card arithmetic unchanged",()=>{
    const row={category:"transport",description:"Soil - TRANSPORT",equipmentId:null,qty:1,unit:"TRIP",rate:0,amount:0};
    const priced=applyTransportCard(row,[{vendorName:"Agency",category:"transport",itemKey:"unused",unit:"TRIP",rate:10,ratePerKm:10,leadDistanceKm:25,payloadMt:20}],"Agency");
    expect(calcCandidateAmount(priced)).toBe(25*2*10);
  });
  it.each([300,600,800,1000])("prices %i CFT once per trip, not physical quantity", size => {
    const result = vendorBillTripCandidate({...trip,quantity:size},false,true,"all",arrangement,true)!;
    expect(result.qty).toBe(1); expect(result.rate).toBe(arrangement.tripRates.find(r=>r.quantity===size)!.rate);
    expect(result.amount).toBe(result.rate); expect(result.sourceType).toBe("site_material_trip_arrangement");
  });
  it("groups 114 identical trips without losing their individual source identities", () => {
    const rows = Array.from({length:114},(_,i)=>mapAutoBillItem(vendorBillTripCandidate({...trip,id:i+1},false,true,"all",arrangement,true)));
    expect(groupRateItems(rows)).toHaveLength(1);expect(groupRateItems(rows)[0].count).toBe(114);
    expect(rows.reduce((sum,r)=>sum+r.amount,0)).toBe(1250*114);expect(new Set(rows.map(r=>r.source)).size).toBe(114);
  });
  it("does not guess unmatched sizes or UOMs", () => {
    for(const t of [{...trip,quantity:700},{...trip,uom:"cum"}]) {
      const p=priceArrangementTrip(t,arrangement);expect(p.rateApplied).toBe(0);expect(p.reason).toContain("no unique exact");
    }
  });
  it("does not infer terms from either rate store",()=> {
    const p=priceArrangementTrip(trip,{...arrangement,billingTerms:null});
    expect(p.rateApplied).toBe(0);expect(p.reason).toContain("no declared");
  });
  it("converts volume only with the specified exact divisor",()=>{
    const p=priceArrangementTrip(trip,{...arrangement,billingTerms:{scope:"full_service",basis:"cum"}});
    expect(p.billedQty).toBe(600/35.3147);expect(p.rateApplied*p.billedQty).toBe(100*600/35.3147);
    expect(priceArrangementTrip({...trip,uom:"MT"}, {...arrangement,billingTerms:{scope:"full_service",basis:"cum"}}).reason).toContain("cannot be converted");
  });
  it.each(["mt","km"] as const)("leaves %s unpriced",basis=>{
    const p=priceArrangementTrip(trip,{...arrangement,billingTerms:{scope:"full_service",basis}});
    expect(p.rateApplied).toBe(0);expect(p.reason).toContain("not supported");
  });
  it("retains landed material and shows both sides of transport-only conflict",()=>{
    const row=vendorBillTripCandidate({...trip,materialSourceType:"vendor",materialSourceSupplier:"Agency"},true,true,"all",
      {...arrangement,billingTerms:{scope:"transport_only",basis:"trip"}},true)!;
    expect(row.category).toBe("material");expect(row.sourceType).toBeNull();expect(row.rate).toBe(0);
    expect(row.arrangementPricing?.reason).toContain("landed material");expect(row.arrangementPricing?.reason).toContain("transport-only Arrangement #4");
  });
  it("preserves a different seller's material liability",()=>{
    const row=vendorBillTripCandidate({...trip,materialSourceType:"vendor",materialSourceSupplier:"Seller"},true,false,"all",arrangement,false)!;
    expect(row.sourceType).toBe("site_material_trip_material");
  });
  it("blocks arrangement identity against all trip roles in both directions, retaining separate seller/transporter identities",()=>{
    for(const role of ["","_transport","_material","_arrangement"]) {
      expect(tripBillSourcesConflict("auto:site_material_trip_arrangement:41",`auto:site_material_trip${role}:41`)).toBe(true);
      expect(tripBillSourcesConflict(`auto:site_material_trip${role}:41`,"auto:site_material_trip_arrangement:41")).toBe(true);
    }
    expect(tripBillSourcesConflict("auto:site_material_trip_material:41","auto:site_material_trip_transport:41")).toBe(false);
  });
  it("keeps frozen snapshot despite later rate change and rejects forged numbers",()=>{
    const candidate=vendorBillTripCandidate(trip,false,true,"all",arrangement,true)!;
    const item=mapAutoBillItem(candidate);
    const changed=vendorBillTripCandidate(trip,false,true,"all",{...arrangement,tripRates:[{quantity:600,uom:"CFT",rate:9999}]},true)!;
    expect(arrangementBillValidationError([item],[changed],[item])).toBeNull();
    expect(arrangementBillValidationError([{...item,rate:9999}],[changed],[item])).toContain("frozen");
    expect(arrangementBillValidationError([{...item,source:item.source.toUpperCase(),rate:9999}],[changed],[item])).toContain("frozen");
    expect(arrangementBillValidationError([{...item,amount:0}],[candidate])).toContain("no longer matches");
    expect(arrangementBillValidationError([{...item,arrangementPricing:null}],[candidate])).toContain("no longer matches");
  });
});
