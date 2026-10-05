import { describe, expect, it } from "vitest";
import { calculateTransportRate, transportPerMT, validatedTransportRateFields } from "../shared/transportRate";
import { calcMixRatesAndJobs } from "../client/src/lib/mixCalc";

describe("transport rate basis — shared estimator formula and nullable display", () => {
  it("calculates the approved 950/km, 12 km, 30 MT example", () => {
    expect(calculateTransportRate({ ratePerKm: 950, leadDistanceKm: 12, payloadMt: 30 }))
      .toEqual({ twoWayDistanceKm: 24, perTrip: 22800, perMT: 760 });
  });
  it.each([null, 0])("leaves prices blank for missing/zero lead %s", leadDistanceKm => {
    const value = calculateTransportRate({ ratePerKm: 950, leadDistanceKm, payloadMt: 30 });
    expect(value.perTrip).toBeNull();
    expect(value.perMT).toBeNull();
  });
  it.each([null, 0, -1, NaN, Infinity])("never divides by invalid payload %s", payloadMt => {
    const value = calculateTransportRate({ ratePerKm: 950, leadDistanceKm: 12, payloadMt });
    expect(value.perTrip).toBe(22800);
    expect(value.perMT).toBeNull();
  });
  it("retains the estimator's exact historical numeric semantics", () => {
    for (const distance of [0, 0.1, 12, 14.7, -2]) {
      for (const rate of [0, 0.3, 950, -5]) {
        for (const payload of [0, 0.1, 30, -1]) {
          expect(transportPerMT(distance, rate, payload))
            .toBe(payload > 0 ? distance * 2 * rate / payload : 0);
        }
      }
    }
  });
  it("keeps all-NULL legacy setup blank", () => {
    expect(calculateTransportRate({ ratePerKm: null, leadDistanceKm: null, payloadMt: null }))
      .toEqual({ twoWayDistanceKm: null, perTrip: null, perMT: null });
  });
  it("matches the captured pre-extraction DBM mix result, not only the transport term", () => {
    const result = calcMixRatesAndJobs({
      inputs: { transDist: "12", transRate: "950", transPayload: "30",
        aggDist: "10", aggFreightRate: "50", aggPayload: "25", aggRate: "1000",
        aggDensity: "1.6", bitPrice: "50", marginPct: "10", tph: "100", plantHrsMonth: "200" },
      mixTypes: [{ name: "DBM parity example", binderPct: 5, density: 2.4,
        fractions: { f20mm: 50, f10mm: 20, f6mm: 10, fDust: 15, fFiller: 5 } }],
      equipDefs: [],
    });
    expect(result.mixRates[0]).toEqual({
      name: "DBM parity example", density: 2.4, aggregate: 1040, bitumen: 2500,
      equipment: 0, fuel: 0, hsd: 0, ldo: 0, crew: 0, overhead: 0, margin: 430,
      exPlant: 3540, exPlantPerCum: 8496, transport: 760, transPerCum: 1824,
      laying: 0, layPerCum: 0, finalLaid: 4730, finalLaidPerCum: 11352,
    });
  });
});

describe("transport basis write validation", () => {
  it("ordinary bill write-back omits the new fields instead of clearing them", () => {
    expect(validatedTransportRateFields({ category: "transport" })).toEqual({});
    expect(validatedTransportRateFields({ category: "equipment" })).toEqual({});
  });
  it("permits deliberate NULL and valid numeric setup", () => {
    expect(validatedTransportRateFields({ category: "transport", leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950 }))
      .toEqual({ leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950 });
    expect(validatedTransportRateFields({ category: "transport", leadDistanceKm: null, payloadMt: null, ratePerKm: null }))
      .toEqual({ leadDistanceKm: null, payloadMt: null, ratePerKm: null });
  });
  it.each([0, -1, Infinity, NaN, "30"])("rejects invalid payload %s", payloadMt => {
    expect(() => validatedTransportRateFields({ category: "transport", payloadMt })).toThrow();
  });
  it("rejects negative lead, non-numeric rate and a non-transport setup", () => {
    expect(() => validatedTransportRateFields({ category: "transport", leadDistanceKm: -1 })).toThrow();
    expect(() => validatedTransportRateFields({ category: "transport", ratePerKm: "950" })).toThrow();
    expect(() => validatedTransportRateFields({ category: "equipment", payloadMt: 30 })).toThrow();
  });
});