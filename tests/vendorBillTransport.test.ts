import { describe, expect, it } from "vitest";
import { applyTransportCard, changeTransportBasis, quantityInMt, transportWorking, transportPricingSchema } from "../shared/vendorBillTransport";
import { calcCandidateAmount, mapAutoBillItem } from "../shared/vendorBillCandidates";

const card = { id: 3, vendorName: "VENDOR", category: "transport", itemKey: "TRIP", unit: "TRIP", rate: 95, leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950 };
const row = { category: "transport", description: "TIPPER", equipmentId: null, qty: 1, unit: "TRIP", rate: 0, amount: 0, actualMt: 28.4, leadDistance: null };
describe("opt-in transport billing", () => {
  it("pulls a unique vendor setup per trip without multiplying by carried MT", () => {
    const result = applyTransportCard(row, [card], "VENDOR");
    expect(result).toMatchObject({ qty: 1, unit: "TRIP", amount: 22800, rate: 950, leadDistance: 12 });
    expect(transportWorking(result)).toContain("carried 28.4 MT");
    expect(transportWorking(result)).toContain("₹760/MT");
    expect(card.rate).toBe(95);
  });
  it("switches only the selected row to actual MT, retaining card and other rows", () => {
    const first = applyTransportCard(row, [card], "VENDOR");
    const second = applyTransportCard(row, [card], "VENDOR");
    const changed = changeTransportBasis(first, "mt");
    expect(changed.amount).toBeCloseTo(21584);
    expect(changed).toMatchObject({ qty: 28.4, unit: "MT" });
    expect(first.amount).toBe(22800);
    expect(second.amount).toBe(22800);
    expect(changeTransportBasis(changed, "trip").amount).toBe(22800);
    expect(card).toMatchObject({ rate: 95, leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950 });
  });
  it("uses a receipt's actual weight as the default, never its payload", () => {
    const result = applyTransportCard({ ...row, qty: 28.4, unit: "MT" }, [card], "VENDOR");
    expect(result.amount).toBeCloseTo(21584);
    expect(result.transportPricing?.basis).toBe("mt");
  });
  it("preserves source weight supplied separately on a receipt candidate", () => {
    const mapped = mapAutoBillItem({ ...row, actualMt: null, physicalQuantity: 28400, physicalUnit: "KG" });
    expect(applyTransportCard(mapped, [card], "VENDOR")).toMatchObject({ qty: 28.4, unit: "MT", amount: 21584 });
  });
  it("uses the row's 14 km, retaining the card's 12 km for comparison", () => {
    const result = applyTransportCard({ ...row, leadDistance: 14 }, [card], "VENDOR");
    expect(result.amount).toBe(26600);
    expect(result.transportPricing?.cardLeadDistanceKm).toBe(12);
    expect(result.leadDistance).toBe(14);
  });
  it("does not replace an explicit zero lead with the card distance", () => {
    expect(applyTransportCard({ ...row, leadDistance: 0 }, [card], "VENDOR").amount).toBe(0);
  });
  it("does not select an ambiguous vendor default or change non-transport rows", () => {
    expect(applyTransportCard(row, [card, { ...card, id: 4, itemKey: "OTHER" }], "VENDOR")).toBe(row);
    const material = { ...row, category: "material" };
    expect(applyTransportCard(material, [card], "VENDOR")).toBe(material);
  });
  it.each([null, 0, -1, NaN])("does not enable setup with invalid payload %s", payloadMt => {
    expect(applyTransportCard(row, [{ ...card, payloadMt }], "VENDOR")).toBe(row);
  });
  it("never fabricates weight from CFT, descriptions, or rated payload", () => {
    expect(quantityInMt(30, "CFT")).toBeNull();
    const unknown = applyTransportCard({ ...row, actualMt: null, description: "TRUCK (28 MT)" }, [card], "VENDOR");
    expect(unknown.transportPricing?.actualMt).toBeNull();
    expect(changeTransportBasis(unknown, "mt")).toBe(unknown);
  });
  it("keeps the legacy NULL-basis calculation exactly unchanged", () => {
    expect(calcCandidateAmount({ ...row, qty: 99, rate: 950, leadDistance: 12, transportPricing: null })).toBe(22800);
    expect(calcCandidateAmount({ ...row, qty: 2, rate: 95, transportPricing: null })).toBe(190);
  });
  it("never refreshes a saved snapshot from a changed card", () => {
    const saved = { ...applyTransportCard(row, [card], "VENDOR"), amount: 12345 };
    expect(applyTransportCard(saved, [{ ...card, ratePerKm: 1500 }], "VENDOR")).toBe(saved);
    expect(saved.amount).toBe(12345);
    expect(transportPricingSchema.parse(JSON.parse(JSON.stringify(saved.transportPricing)))).toEqual(saved.transportPricing);
    expect(transportPricingSchema.safeParse({ ...saved.transportPricing, payloadMt: 0 }).success).toBe(false);
  });
});
