import { describe, expect, it } from "vitest";
import { vendorBillTripCandidate } from "../shared/vendorBillTripRoles";
import { mapAutoBillItem } from "../shared/vendorBillCandidates";
import { applyTransportCard } from "../shared/vendorBillTransport";
import { vendorBillAutoSourceFromCandidate } from "../shared/siteName";

const trip = { id: 42, date: "2026-10-01", quantity: 28.4, uom: "MT", material: "DUST",
  site: "ROAD", supplier: "HAULER", materialSourceSupplier: "SELLER", transportType: "agency_vendor" };
const card = { id: 1, vendorName: "HAULER", category: "transport", itemKey: "EQ_DUST_TRIP",
  unit: "TRIP", rate: 0, ratePerKm: 950, leadDistanceKm: 12, payloadMt: 30 };
describe("Part C trip bill candidates", () => {
  it("seller gets one material and hauler no material", () => {
    expect(vendorBillTripCandidate(trip,true,false,"material")?.category).toBe("material");
    expect(vendorBillTripCandidate(trip,false,true,"material")).toBeNull();
    expect(vendorBillTripCandidate(trip,true,false,"transport")).toBeNull();
  });
  it("same-party retains exactly the original landed row", () => {
    const row = vendorBillTripCandidate({...trip,supplier:"SELLER"},true,true,"all");
    expect([row].filter(Boolean)).toHaveLength(1);
    expect(row).toEqual({date:"2026-10-01",category:"material",description:"DUST (SITE TRIP)",
      qty:28.4,unit:"MT",source:"auto",sourceId:"site_material_trip:42",siteName:"SITE: ROAD",vehicleNumber:null,receiptNumber:null});
    expect(vendorBillTripCandidate({...trip,supplier:"SELLER"},true,true,"transport")).toBeNull();
  });
  it("own fleet only offers seller material", () => {
    const own={...trip,transportType:"in_house",internalEquipmentId:9,supplier:null};
    expect(vendorBillTripCandidate(own,true,false,"all")?.category).toBe("material");
    expect(vendorBillTripCandidate(own,false,true,"transport")).toBeNull();
  });
  it.each(["isCancelled","isDeleted"])("excludes %s", flag => {
    expect(vendorBillTripCandidate({...trip,[flag]:true},true,true,"all")).toBeNull();
  });
  it("unresolved is neutral and maps warning, never material or transport", () => {
    const row=vendorBillTripCandidate({...trip,materialSourceSupplier:null},false,true,"all")!;
    expect(mapAutoBillItem(row)).toMatchObject({category:"other",rolesUnconfirmed:true,tripId:42});
  });
  it("does not infer around conflicting stored IDs", () => {
    expect(vendorBillTripCandidate({...trip,supplierVendorId:1,materialSourceVendorId:1},true,true,"all")).toHaveProperty("rolesUnconfirmed",true);
  });
  it("prices haulage through existing snapshot math with preserved physical quantity", () => {
    const row=mapAutoBillItem(vendorBillTripCandidate(trip,false,true,"transport")!);
    const result=applyTransportCard(row,[card],"HAULER");
    expect(result).toMatchObject({amount:21584,qty:28.4,unit:"MT",physicalQuantity:28.4,transportPricing:{basis:"mt",payloadMt:30}});
    expect(vendorBillAutoSourceFromCandidate(row)).toBe(row.source);
  });
  it.each([{cards:[]},{cards:[{...card,itemKey:"EQ_SOIL_TRIP"}]},{cards:[card,{...card,id:2}]}])("missing, unrelated or ambiguous cards remain unpriced", ({cards})=>{
    const row=mapAutoBillItem(vendorBillTripCandidate(trip,false,true,"transport")!);
    const result=applyTransportCard(row,cards,"HAULER");
    expect(result.rate).toBe(0); expect(result.amount).toBe(0);
    expect(result.transportPricingNote).toMatch(/^Unpriced/);
  });
  it("saved transport snapshots are never recomputed",()=>{
    const row=mapAutoBillItem(vendorBillTripCandidate(trip,false,true,"transport")!);
    const saved=applyTransportCard(row,[card],"HAULER");
    expect(applyTransportCard(saved,[{...card,ratePerKm:123}],"HAULER")).toBe(saved);
  });
});
