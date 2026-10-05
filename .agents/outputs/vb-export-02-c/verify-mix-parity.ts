import fs from "node:fs";
import assert from "node:assert/strict";
import * as oldModule from "/tmp/vbc-original-mixCalc";
import * as current from "../../../client/src/lib/mixCalc";

const old = (oldModule as any).default ?? oldModule;
const state: current.CalcState = {
  inputs: {
    transDist: "12", transRate: "950", transPayload: "30",
    aggDist: "10", aggFreightRate: "50", aggPayload: "25", aggRate: "1000",
    aggDensity: "1.6", bitPrice: "50", marginPct: "10", tph: "100",
    plantHrsMonth: "200",
  },
  mixTypes: [{ name: "DBM parity example", binderPct: 5, density: 2.4,
    fractions: { f20mm: 50, f10mm: 20, f6mm: 10, fDust: 15, fFiller: 5 } }],
  equipDefs: [],
  sites: [{ id: "PARITY", name: "Parity site", transLead: 14,
    jobs: [{ id: "JOB", basis: "BOQ", mixes: [{ mixIdx: 0, qty_mt: 100 }] }] }],
};
const before = old.calcMixRatesAndJobs(state);
const after = current.calcMixRatesAndJobs(state);
assert.deepEqual(after, before);
const otherExports: string[] = [];
for (const name of ["calcMixingSubCosts", "calcScopedRevenue"]) {
  if (typeof (old as any)[name] === "function" && typeof (current as any)[name] === "function") {
    assert.deepEqual((current as any)[name](state), (old as any)[name](state));
    otherExports.push(name);
  }
}
const result = { identical: true, state, before, after, otherExports };
fs.writeFileSync(".agents/outputs/vb-export-02-c/estimator-before-after.json", JSON.stringify(result, null, 2));
console.log({ identical: true, before: before.mixRates[0], after: after.mixRates[0], otherExports });