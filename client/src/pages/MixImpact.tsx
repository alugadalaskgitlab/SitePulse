import { useState, useMemo, Fragment, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, ChevronDown, Printer, Trash2, GitCompare, FlaskConical, PencilLine, Plus } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MixEstimate, PriceScenario } from "@shared/schema";
import { calcMixRatesAndJobs, diffCalcInputs, type CalcState, type RevisedPrices } from "@/lib/mixCalc";
import { readEstimatorRole } from "@/lib/estimatorAuth";
import { useAuth } from "@/lib/auth-context";

function fmtI(v: number) { return Math.round(v).toLocaleString("en-IN"); }
function fmtDateTime(d?: string | Date | null) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) +
    ", " + dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function parseState(stateJson: string): CalcState | null {
  try { return JSON.parse(stateJson); } catch { return null; }
}

function DeltaAmt({ base, revised }: { base: number; revised: number }) {
  const delta = revised - base;
  if (Math.abs(delta) < 1) return <span className="text-muted-foreground">—</span>;
  if (delta > 0) {
    return <span className="text-red-600 font-semibold">+₹{fmtI(delta)}</span>;
  }
  return <span className="text-green-600 font-semibold">-₹{fmtI(Math.abs(delta))}</span>;
}

function computeGrandCum(calc: ReturnType<typeof calcMixRatesAndJobs>): number {
  return calc.jobResults.reduce((s, j) => s + (j.totalCum ?? 0), 0);
}

function computeInputImpact(
  key: string, baseVal: number, revVal: number,
  state: CalcState, baseCalc: ReturnType<typeof calcMixRatesAndJobs>,
): number | null {
  const delta = revVal - baseVal;
  if (Math.abs(delta) < 0.0001) return 0;
  const totalMT = baseCalc.grandTotalMt;
  if (totalMT <= 0) return null;
  const inputs = state.inputs || {};
  const pf = (k: string) => parseFloat(inputs[k] || '0') || 0;
  const mf = 1 + pf('marginPct') / 100;
  const mts = state.mixTypes || [];
  const mixMTs: number[] = Array(mts.length).fill(0);
  baseCalc.jobResults.forEach(j => j.mixes.forEach(m => {
    if (m.mixIdx < mixMTs.length) mixMTs[m.mixIdx] += m.mt;
  }));
  switch (key) {
    case 'aggRate': {
      let f = 1;
      if ((state.aggBasis || 'MT') === 'CFT') { const d = pf('aggDensity'); if (d > 0) f = 35.3147 / d; }
      let tAgg = 0;
      for (let i = 0; i < mts.length; i++) {
        const fr = ['f20mm','f10mm','f6mm','fDust','fFiller'].reduce(
          (s, fk) => s + ((mts[i].fractions as Record<string, number>)?.[fk] ?? 0), 0) / 100;
        tAgg += (mixMTs[i] || 0) * fr;
      }
      return tAgg * delta * f * mf;
    }
    case 'bitPrice': {
      let bk = 0;
      for (let i = 0; i < mts.length; i++) bk += (mixMTs[i] || 0) * (mts[i].binderPct / 100) * 1000;
      return bk * delta * mf;
    }
    case 'hsdPrice': {
      const tph = pf('tph'), lp = pf('layProductivity');
      let pL = 0, lL = 0;
      (state.equipDefs || []).forEach(eq => {
        if (!eq.enabled) return;
        const fc = eq.fuelConsump ?? 0;
        if (!eq.isLaying) { if (tph > 0) pL += fc / tph; }
        else { if (lp > 0) lL += fc * (eq.hireHrsDay || 8) / lp; }
      });
      return totalMT * (pL * mf + lL) * delta;
    }
    case 'ldoRate': return totalMT * pf('ldoConsump') * delta * mf;
    case 'boilerFuelRate': {
      const bc = pf('boilerCampaignMt'); if (bc <= 0) return 0;
      const bl = (pf('boilerProdLhr') * pf('boilerProdHrs') + pf('boilerPreheatLhr') * pf('boilerPreheatHrs')) / bc;
      return totalMT * bl * delta * mf;
    }
    case 'transRate': { const p = pf('transPayload'); return p > 0 ? totalMT * (pf('transDist') * 2 / p) * delta : 0; }
    case 'transDist': { const p = pf('transPayload'); return p > 0 ? totalMT * (2 * pf('transRate') / p) * delta : 0; }
    case 'marginPct': {
      let weightedSub = 0;
      for (let i = 0; i < baseCalc.mixRates.length; i++) {
        const mr = baseCalc.mixRates[i];
        weightedSub += (mixMTs[i] || 0) * (mr.exPlant - mr.margin);
      }
      return weightedSub > 0 ? weightedSub * delta / 100 : null;
    }
    default: return null;
  }
}

// ── Scenario Comparison Component ──────────────────────────────────────────

interface ScenarioCalcEntry {
  scenario: PriceScenario;
  prices: RevisedPrices;
  calc: ReturnType<typeof calcMixRatesAndJobs>;
  scState: CalcState | null;
  frozenBaseState: CalcState;
  frozenBaseCalc: ReturnType<typeof calcMixRatesAndJobs>;
}

const LEGACY_PRICE_ROWS: { key: keyof RevisedPrices; label: string; unit: string }[] = [
  { key: "aggRate",  label: "Aggregate Rate", unit: "₹/MT" },
  { key: "bitPrice", label: "Bitumen Price",  unit: "₹/kg" },
  { key: "hsdPrice", label: "HSD Price",      unit: "₹/L"  },
  { key: "ldoRate",  label: "LDO Rate",       unit: "₹/L"  },
];

function getScenarioVal(entry: ScenarioCalcEntry, key: string, baseVal: number): number {
  if (entry.scState) {
    return parseFloat(entry.scState.inputs?.[key] ?? "0") || 0;
  }
  const legacyKey = key as keyof RevisedPrices;
  return (entry.prices[legacyKey] as number | undefined) ?? baseVal;
}

function ScenarioComparison({
  scenarioCalcs,
  baseState,
  baseCalc,
}: {
  scenarioCalcs: ScenarioCalcEntry[];
  baseState: CalcState;
  baseCalc: ReturnType<typeof calcMixRatesAndJobs>;
}) {
  const thCls = "px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap";
  const th1Cls = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap";
  const tdBase = "px-3 py-2.5 text-right align-top";

  const [openSections, setOpenSections] = useState({ inputs: false, rates: true, jobs: true });
  const toggleSection = (key: keyof typeof openSections) => setOpenSections(p => ({ ...p, [key]: !p[key] }));

  function DeltaLine({ base, revised }: { base: number; revised: number }) {
    const delta = revised - base;
    if (Math.abs(delta) < 0.001) return <span className="block text-xs text-muted-foreground/60 mt-0.5">—</span>;
    const sign = delta > 0 ? "+" : "";
    const cls = delta > 0 ? "text-red-600" : "text-green-600";
    return (
      <span className={`block text-xs font-semibold mt-0.5 ${cls}`}>
        {sign}₹{delta.toFixed(2)}
      </span>
    );
  }

  // Build union of changed input keys across all scenarios
  const allChangedInputs = useMemo(() => {
    const byKey: Record<string, { key: string; label: string; unit: string }> = {};
    scenarioCalcs.forEach(({ scState, prices, frozenBaseState: fbs }) => {
      if (scState) {
        diffCalcInputs(fbs, scState).forEach(d => {
          byKey[d.key] = { key: d.key, label: d.label, unit: d.unit };
        });
      } else {
        LEGACY_PRICE_ROWS.forEach(({ key, label, unit }) => {
          const baseVal = parseFloat(fbs.inputs?.[key] ?? "0") || 0;
          const revVal = (prices[key as keyof RevisedPrices] as number | undefined) ?? baseVal;
          if (Math.abs(revVal - baseVal) > 0.001) byKey[key] = { key, label, unit };
        });
      }
    });
    return Object.values(byKey);
  }, [scenarioCalcs]);

  return (
    <Card data-testid="card-scenario-comparison">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-primary" /> Scenario Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-0 pb-4">

        {/* Variation Summary */}
        {(() => {
          const anyChange = scenarioCalcs.some(({ calc, frozenBaseCalc: fbc }) => Math.abs(calc.grandTotalAmt - fbc.grandTotalAmt) >= 1);
          if (!anyChange) return null;
          return (
            <div className="mx-4 mt-3 space-y-2" data-testid="variation-summary">
              {scenarioCalcs.map(({ scenario, calc, frozenBaseCalc: fbc }) => {
                const totalMT = fbc.grandTotalMt;
                const totalCUM = computeGrandCum(fbc);
                if (totalMT <= 0) return null;
                const ci = calc.grandTotalAmt - fbc.grandTotalAmt;
                if (Math.abs(ci) < 1) return null;
                const baseCostPerMT = fbc.grandTotalAmt / totalMT;
                const iMT = ci / totalMT;
                const iCUM = totalCUM > 0 ? ci / totalCUM : 0;
                const rMT = calc.grandTotalAmt / totalMT;
                const up = ci > 0;
                const cls = up ? "text-red-600" : "text-green-600";
                const sign = up ? "+" : "\u2212";
                return (
                  <div key={scenario.id} className="rounded-md border border-border p-3" data-testid={`variation-summary-${scenario.id}`}>
                    {scenarioCalcs.length > 1 && <div className="text-xs font-semibold text-muted-foreground mb-1.5">{scenario.name}</div>}
                    <div className="space-y-0.5 text-sm">
                      <div>{up ? "Cost Increase" : "Cost Decrease"}: <span className={`font-bold ${cls}`}>{sign}₹{fmtI(Math.abs(Math.round(ci)))}</span></div>
                      <div>Impact: <span className={`font-bold ${cls}`}>{sign}₹{Math.abs(iMT).toFixed(2)} /MT</span>{totalCUM > 0 && <>{" | "}<span className={`font-bold ${cls}`}>{sign}₹{Math.abs(iCUM).toFixed(2)} /CUM</span></>}</div>
                      <div>Revised Cost: <span className="font-bold">₹{baseCostPerMT.toFixed(2)}</span>{" → "}<span className={`font-bold ${cls}`}>₹{rMT.toFixed(2)} /MT</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* No-changes hint */}
        {allChangedInputs.length === 0 && scenarioCalcs.length > 0 && (() => {
          const KEY_RATES = [
            { key: "bitPrice", label: "Bitumen Price", unit: "₹/kg" },
            { key: "hsdPrice", label: "HSD Price", unit: "₹/L" },
            { key: "ldoRate",  label: "LDO Rate",   unit: "₹/L" },
            { key: "aggRate",  label: "Agg Rate",    unit: "₹"   },
          ];
          return (
            <div className="mx-4 mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <div className="p-3 text-sm text-amber-800 dark:text-amber-300">
                No rate changes detected. The scenario state was saved but its key rates match the base estimate.
                Click <strong>Edit</strong>, change any rates in the calculator, then click
                <strong> Save Scenario &amp; Return</strong>.
              </div>
              <div className="overflow-x-auto border-t border-amber-200 dark:border-amber-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-amber-100/60 dark:bg-amber-900/30">
                      <th className="px-3 py-1.5 text-left font-semibold text-amber-700 dark:text-amber-400">Rate Input</th>
                      <th className="px-3 py-1.5 text-right font-semibold text-amber-700 dark:text-amber-400">Base</th>
                      {scenarioCalcs.map(({ scenario }) => (
                        <th key={scenario.id} className="px-3 py-1.5 text-right font-semibold text-amber-700 dark:text-amber-400">
                          {scenario.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {KEY_RATES.map(({ key, label, unit }) => {
                      const bv = parseFloat(baseState.inputs?.[key] ?? "0") || 0;
                      return (
                        <tr key={key} className="border-t border-amber-200/50 dark:border-amber-800/50">
                          <td className="px-3 py-1.5 text-amber-800 dark:text-amber-300">{label} <span className="text-amber-500">({unit})</span></td>
                          <td className="px-3 py-1.5 text-right font-medium text-amber-900 dark:text-amber-200">₹{bv.toFixed(2)}</td>
                          {scenarioCalcs.map((entry) => {
                            const sv = entry.scState
                              ? (parseFloat(entry.scState.inputs?.[key] ?? "0") || 0)
                              : ((entry.prices[key as keyof RevisedPrices] as number | undefined) ?? bv);
                            return (
                              <td key={entry.scenario.id} className="px-3 py-1.5 text-right font-medium text-amber-900 dark:text-amber-200">
                                ₹{sv.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Table 1 — Changed Inputs (only rows changed in ≥1 scenario) */}
        {allChangedInputs.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection("inputs")}
              className="w-full flex items-center gap-2 px-4 pt-3 pb-2 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wide hover:bg-muted/30 cursor-pointer transition-colors"
            >
              {openSections.inputs ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
              Changed Input Rates
              <span className="ml-auto font-normal normal-case text-[10px]">{openSections.inputs ? "Collapse" : "Expand"}</span>
            </button>
            {openSections.inputs && <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className={th1Cls}>Input</th>
                    <th className={thCls}>Base</th>
                    {scenarioCalcs.map(({ scenario }) => (
                      <Fragment key={scenario.id}>
                        <th className={thCls} title={scenario.name}>
                          <span className="block max-w-[120px] truncate ml-auto">{scenario.name}</span>
                        </th>
                        <th className={thCls}>Impact ₹</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allChangedInputs.map(({ key, label, unit }) => {
                    const displayBaseVal = parseFloat(baseState.inputs?.[key] ?? "0") || 0;
                    return (
                      <tr key={key} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-medium text-sm">
                          {label}
                          <span className="block text-xs text-muted-foreground font-normal">{unit}</span>
                        </td>
                        <td className={`${tdBase} font-medium`}>
                          ₹{displayBaseVal.toFixed(2)}
                        </td>
                        {scenarioCalcs.map((entry) => {
                          const entryBaseVal = parseFloat(entry.frozenBaseState.inputs?.[key] ?? "0") || 0;
                          const rev = getScenarioVal(entry, key, entryBaseVal);
                          const changed = Math.abs(rev - entryBaseVal) > 0.001;
                          const impact = changed ? computeInputImpact(key, entryBaseVal, rev, entry.frozenBaseState, entry.frozenBaseCalc) : null;
                          return (
                            <Fragment key={entry.scenario.id}>
                              <td
                                className={`${tdBase} ${changed ? "bg-primary/5" : ""}`}
                                data-testid={`cmp-rate-${key}-${entry.scenario.id}`}
                              >
                                <span className={`font-medium ${changed ? (rev > entryBaseVal ? "text-red-600" : "text-green-600") : "text-muted-foreground"}`}>
                                  ₹{rev.toFixed(2)}
                                </span>
                                <DeltaLine base={entryBaseVal} revised={rev} />
                              </td>
                              <td className={tdBase} data-testid={`cmp-impact-${key}-${entry.scenario.id}`}>
                                {impact != null && Math.abs(impact) >= 1
                                  ? <span className={`font-bold ${impact > 0 ? "text-red-600" : "text-green-600"}`}>{impact > 0 ? "+" : "\u2212"}₹{fmtI(Math.abs(Math.round(impact)))}</span>
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
          </div>
        )}

        {/* Table 2 — Rate by Mix Type (with Amount) */}
        {baseCalc.mixRates.length > 0 && (() => {
          function mixAmts(calc: ReturnType<typeof calcMixRatesAndJobs>): number[] {
            const amts: number[] = Array(calc.mixRates.length).fill(0);
            calc.jobResults.forEach((job) => {
              job.mixes.forEach((m) => {
                if (m.mixIdx < amts.length) amts[m.mixIdx] += m.amt;
              });
            });
            return amts;
          }
          const baseAmts = mixAmts(baseCalc);
          return (
            <div>
              <button
                onClick={() => toggleSection("rates")}
                className="w-full flex items-center gap-2 px-4 pt-3 pb-2 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wide hover:bg-muted/30 cursor-pointer transition-colors"
              >
                {openSections.rates ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                Final Laid Rate by Mix Type
                <span className="ml-auto font-normal normal-case text-[10px]">{openSections.rates ? "Collapse" : "Expand"}</span>
              </button>
              {openSections.rates && <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className={th1Cls}>Mix Type</th>
                      <th className={thCls}>Base Rate</th>
                      <th className={thCls}>Base Amt ₹</th>
                      {scenarioCalcs.map(({ scenario }) => (
                        <th key={scenario.id} className={thCls} title={scenario.name} colSpan={2}>
                          <span className="block max-w-[180px] truncate ml-auto">{scenario.name}</span>
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-muted/20 border-b border-border text-xs text-muted-foreground">
                      <th /><th className={thCls}>₹/MT · ₹/CUM</th><th />
                      {scenarioCalcs.map(({ scenario }) => (
                        <Fragment key={scenario.id}>
                          <th className={thCls}>₹/MT · ₹/CUM</th>
                          <th className={thCls}>Amt ₹</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {baseCalc.mixRates.map((baseMix, i) => (
                      <tr key={baseMix.name} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-semibold">{baseMix.name}</td>
                        <td className={`${tdBase} font-medium`}>
                          <span className="block">₹{baseMix.finalLaid.toFixed(2)} /MT</span>
                          <span className="block">₹{baseMix.finalLaidPerCum.toFixed(2)} /CUM</span>
                        </td>
                        <td className={`${tdBase} text-muted-foreground`}>
                          {baseAmts[i] > 0 ? `₹${Math.round(baseAmts[i]).toLocaleString("en-IN")}` : "—"}
                        </td>
                        {scenarioCalcs.map(({ scenario, calc, frozenBaseCalc: fbc }) => {
                          const fMix = fbc.mixRates[i];
                          const fLaid = fMix?.finalLaid ?? baseMix.finalLaid;
                          const fCum = fMix?.finalLaidPerCum ?? baseMix.finalLaidPerCum;
                          const fAmts = mixAmts(fbc);
                          const revRateMt = calc.mixRates[i]?.finalLaid ?? 0;
                          const revRateCum = calc.mixRates[i]?.finalLaidPerCum ?? 0;
                          const revAmts = mixAmts(calc);
                          const revAmt = revAmts[i] ?? 0;
                          const rateChanged = Math.abs(revRateMt - fLaid) > 0.01;
                          const amtChanged = Math.abs(revAmt - (fAmts[i] ?? 0)) > 1;
                          const rateColor = rateChanged ? (revRateMt > fLaid ? "text-red-600" : "text-green-600") : "text-muted-foreground";
                          return (
                            <Fragment key={scenario.id}>
                              <td
                                className={`${tdBase} ${rateChanged ? "bg-primary/5" : ""}`}
                                data-testid={`cmp-mix-${baseMix.name}-${scenario.id}`}
                              >
                                <span className={`block font-medium ${rateColor}`}>₹{revRateMt.toFixed(2)} /MT</span>
                                <span className={`block font-medium ${rateColor}`}>₹{revRateCum.toFixed(2)} /CUM</span>
                                {rateChanged && (
                                  <>
                                    <span className={`block text-sm font-semibold mt-1 ${revRateMt > fLaid ? "text-red-600" : "text-green-600"}`}>
                                      {revRateMt > fLaid ? "+" : ""}₹{(revRateMt - fLaid).toFixed(2)} /MT
                                    </span>
                                    {fCum > 0 && (
                                      <span className={`block text-sm font-semibold ${revRateCum > fCum ? "text-red-600" : "text-green-600"}`}>
                                        {revRateCum > fCum ? "+" : ""}₹{(revRateCum - fCum).toFixed(2)} /CUM
                                      </span>
                                    )}
                                  </>
                                )}
                              </td>
                              <td className={`${tdBase} ${amtChanged ? "bg-primary/5" : ""}`}>
                                <span className={`font-medium ${amtChanged ? (revAmt > (fAmts[i] ?? 0) ? "text-red-600" : "text-green-600") : "text-muted-foreground"}`}>
                                  {revAmt > 0 ? `₹${Math.round(revAmt).toLocaleString("en-IN")}` : "—"}
                                </span>
                                {amtChanged && (
                                  <DeltaAmt base={fAmts[i] ?? 0} revised={revAmt} />
                                )}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
            </div>
          );
        })()}

        {/* Table 3 — Job-wise Cost */}
        {baseCalc.jobResults.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection("jobs")}
              className="w-full flex items-center gap-2 px-4 pt-3 pb-2 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wide hover:bg-muted/30 cursor-pointer transition-colors"
            >
              {openSections.jobs ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
              Job-wise Cost Impact
              <span className="ml-auto font-normal normal-case text-[10px]">{openSections.jobs ? "Collapse" : "Expand"}</span>
            </button>
            {openSections.jobs && <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className={th1Cls}>Job</th>
                    <th className={thCls}>MT</th>
                    <th className={thCls}>CUM</th>
                    <th className={thCls}>Base ₹</th>
                    {scenarioCalcs.map(({ scenario }) => (
                      <th key={scenario.id} className={thCls} title={scenario.name}>
                        <span className="block max-w-[120px] truncate ml-auto">{scenario.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {baseCalc.jobResults.map((baseJob, i) => (
                    <tr key={baseJob.id} className="border-t border-border/40 hover:bg-muted/20" data-testid={`cmp-job-${baseJob.id}`}>
                      <td className="px-3 py-2.5 font-semibold">
                        {baseJob.siteName && <span className="block text-[10px] font-normal text-muted-foreground">{baseJob.siteName}</span>}
                        {baseJob.id}
                      </td>
                      <td className={`${tdBase} text-muted-foreground`}>{baseJob.totalMt > 0 ? baseJob.totalMt.toFixed(1) : "—"}</td>
                      <td className={`${tdBase} text-muted-foreground`}>{(baseJob.totalCum ?? 0) > 0 ? (baseJob.totalCum ?? 0).toFixed(2) : "—"}</td>
                      <td className={`${tdBase} font-medium`}>₹{Math.round(baseJob.totalAmt).toLocaleString("en-IN")}</td>
                      {scenarioCalcs.map(({ scenario, calc, frozenBaseCalc: fbc }) => {
                        const fBaseJob = fbc.jobResults[i];
                        const revJob = calc.jobResults[i];
                        const rev = revJob?.totalAmt ?? 0;
                        const fBaseAmt = fBaseJob?.totalAmt ?? baseJob.totalAmt;
                        const changed = Math.abs(rev - fBaseAmt) >= 1;
                        const jobDelta = rev - fBaseAmt;
                        const bMT = fBaseJob?.totalMt ?? baseJob.totalMt;
                        const bCUM = fBaseJob?.totalCum ?? baseJob.totalCum ?? 0;
                        return (
                          <td
                            key={scenario.id}
                            className={`${tdBase} ${changed ? "bg-primary/5" : ""}`}
                            data-testid={`cmp-job-amt-${baseJob.id}-${scenario.id}`}
                          >
                            <span className={`font-medium ${changed ? (rev > fBaseAmt ? "text-red-600" : "text-green-600") : "text-muted-foreground"}`}>
                              ₹{Math.round(rev).toLocaleString("en-IN")}
                            </span>
                            <span className="block mt-0.5 text-xs"><DeltaAmt base={fBaseAmt} revised={rev} /></span>
                            {changed && bMT > 0 && (
                              <span className={`block text-xs font-semibold mt-0.5 ${jobDelta > 0 ? "text-red-600" : "text-green-600"}`}>
                                {jobDelta > 0 ? "+" : "\u2212"}₹{Math.abs(jobDelta / bMT).toFixed(2)} /MT
                              </span>
                            )}
                            {changed && bCUM > 0 && (
                              <span className={`block text-xs font-semibold ${jobDelta > 0 ? "text-red-600" : "text-green-600"}`}>
                                {jobDelta > 0 ? "+" : "\u2212"}₹{Math.abs(jobDelta / bCUM).toFixed(2)} /CUM
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-primary/40 bg-amber-50/60 dark:bg-amber-950/20 font-bold text-base">
                    <td className="px-3 py-4" colSpan={3}>Grand Total</td>
                    <td className={`${tdBase} text-base`}>₹{Math.round(baseCalc.grandTotalAmt).toLocaleString("en-IN")}</td>
                    {scenarioCalcs.map(({ scenario, calc, frozenBaseCalc: fbc }) => {
                      const rev = calc.grandTotalAmt;
                      const fBaseGrand = fbc.grandTotalAmt;
                      const changed = Math.abs(rev - fBaseGrand) >= 1;
                      const gDelta = rev - fBaseGrand;
                      const gMT = fbc.grandTotalMt;
                      const gCUM = computeGrandCum(fbc);
                      return (
                        <td
                          key={scenario.id}
                          className={`${tdBase} ${changed ? "bg-primary/5" : ""}`}
                          data-testid={`cmp-grand-${scenario.id}`}
                        >
                          <span className={changed ? (rev > fBaseGrand ? "text-red-600" : "text-green-600") : ""}>
                            ₹{Math.round(rev).toLocaleString("en-IN")}
                          </span>
                          <span className="block mt-0.5 text-xs"><DeltaAmt base={fBaseGrand} revised={rev} /></span>
                          {changed && gMT > 0 && (
                            <span className={`block text-xs font-semibold mt-0.5 ${gDelta > 0 ? "text-red-600" : "text-green-600"}`}>
                              {gDelta > 0 ? "+" : "\u2212"}₹{Math.abs(gDelta / gMT).toFixed(2)} /MT
                            </span>
                          )}
                          {changed && gCUM > 0 && (
                            <span className={`block text-xs font-semibold ${gDelta > 0 ? "text-red-600" : "text-green-600"}`}>
                              {gDelta > 0 ? "+" : "\u2212"}₹{Math.abs(gDelta / gCUM).toFixed(2)} /CUM
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────

export default function MixImpact() {
  const { sectionCan, isAdmin, isLoading: authLoading } = useAuth();
  const hasMainAppAccess = isAdmin || sectionCan("mix_calculator", "create");
  const canEdit = readEstimatorRole() === "admin" || hasMainAppAccess;

  useEffect(() => {
    // Wait for auth to finish loading before deciding to redirect
    if (authLoading) return;
    const r = readEstimatorRole();
    // Only redirect to estimator login if the user has no main-app access either
    if (!r && !hasMainAppAccess) {
      window.location.href = "/estimator-login?returnTo=" + encodeURIComponent(window.location.pathname + window.location.search);
    }
  }, [hasMainAppAccess, authLoading]);

  const search = useSearch();
  const params = new URLSearchParams(search);
  const initEstimateId = parseInt(params.get("estimateId") || "0") || null;

  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(initEstimateId);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: estimates = [] } = useQuery<MixEstimate[]>({
    queryKey: ["/api/mix-estimates"],
  });

  const { data: estimate } = useQuery<MixEstimate>({
    queryKey: ["/api/mix-estimates", selectedId],
    queryFn: () => fetch(`/api/mix-estimates/${selectedId}`).then(r => r.json()),
    enabled: !!selectedId,
  });

  const { data: scenarios = [] } = useQuery<PriceScenario[]>({
    queryKey: ["/api/price-scenarios", selectedId],
    queryFn: () => fetch(`/api/price-scenarios?estimateId=${selectedId}`).then(r => r.json()),
    enabled: !!selectedId,
  });

  const createScenarioMutation = useMutation({
    mutationFn: async (payload: { estimateId: number; name: string; baseState?: string }) => {
      const res = await apiRequest("POST", "/api/price-scenarios", payload);
      return res.json() as Promise<PriceScenario>;
    },
    onSuccess: (sc: PriceScenario) => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-scenarios", selectedId] });
      setNewScenarioName("");
      setShowCreateForm(false);
      window.location.href = `/mix-calculator?scenarioId=${sc.id}&estimateId=${selectedId}`;
    },
    onError: () => toast({ title: "Failed to create scenario", variant: "destructive" }),
  });

  const deleteScenarioMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/price-scenarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-scenarios", selectedId] });
      toast({ title: "Scenario deleted" });
    },
  });

  const estimateState = useMemo(() => estimate ? parseState(estimate.state) : null, [estimate]);

  const scenarioCalcs = useMemo((): ScenarioCalcEntry[] => {
    if (!estimateState) return [];
    return scenarios.map((sc) => {
      const frozenBaseState: CalcState = sc.baseState
        ? (() => { try { return JSON.parse(sc.baseState) as CalcState; } catch { return estimateState; } })()
        : estimateState;
      const frozenBaseCalc = calcMixRatesAndJobs(frozenBaseState);

      if (sc.state) {
        try {
          const scState = JSON.parse(sc.state) as CalcState;
          return { scenario: sc, prices: {}, calc: calcMixRatesAndJobs(scState), scState, frozenBaseState, frozenBaseCalc };
        } catch {}
      }
      let prices: RevisedPrices = {};
      try { prices = JSON.parse(sc.revisedPrices); } catch {}
      return { scenario: sc, prices, calc: calcMixRatesAndJobs(frozenBaseState, prices), scState: null, frozenBaseState, frozenBaseCalc };
    });
  }, [scenarios, estimateState]);

  const displayBaseState = scenarioCalcs.length > 0 ? scenarioCalcs[0].frozenBaseState : estimateState;
  const displayBaseCalc = scenarioCalcs.length > 0 ? scenarioCalcs[0].frozenBaseCalc : (estimateState ? calcMixRatesAndJobs(estimateState) : null);

  function handleEstimateChange(id: number) {
    setSelectedId(id);
    setNewScenarioName("");
    setShowCreateForm(false);
  }

  function handleCreateScenario() {
    if (!selectedId || !newScenarioName.trim()) {
      toast({ title: "Enter a scenario name", variant: "destructive" });
      return;
    }
    createScenarioMutation.mutate({
      estimateId: selectedId,
      name: newScenarioName.trim(),
      baseState: estimate?.state || undefined,
    });
  }

  function openInCalculator(scenarioId: number) {
    window.location.href = `/mix-calculator?scenarioId=${scenarioId}&estimateId=${selectedId}`;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/admin/mix-estimates">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="w-4 h-4 mr-1" /> Estimates
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-primary" /> Price Impact Analysis
            </h1>
            <p className="text-xs text-muted-foreground">Create scenarios to compare full calculator states</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedId && scenarios.length >= 2 && (
            <Link href={`/admin/scenario-comparison?estimateId=${selectedId}`}>
              <Button variant="outline" size="sm" data-testid="btn-compare-scenarios">
                <GitCompare className="w-4 h-4 mr-1" /> Compare Scenarios
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print-impact">
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Estimate selector */}
      <Card className="no-print">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Estimate:</label>
            <select
              value={selectedId ?? ""}
              onChange={(e) => handleEstimateChange(parseInt(e.target.value))}
              className="flex-1 border border-border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="select-estimate"
            >
              <option value="">— Select an estimate —</option>
              {estimates.map((est) => (
                <option key={est.id} value={est.id}>
                  {est.contractor ? `${est.contractor} — ` : ""}{est.name}
                  {est.updatedAt
                    ? ` · Edited ${fmtDateTime(est.updatedAt)}`
                    : est.createdAt
                    ? ` · Saved ${fmtDateTime(est.createdAt)}`
                    : ""}
                </option>
              ))}
            </select>
          </div>
          {estimate && (
            <p className="text-xs text-muted-foreground mt-2">
              Base: <span className="font-medium">{estimate.name}</span>
              {estimate.updatedAt && (
                <span className="ml-2">· Last edited {fmtDateTime(estimate.updatedAt)}</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {!selectedId && (
        <div className="text-center py-20 text-muted-foreground">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-medium">Select an estimate to begin</p>
          <p className="text-sm mt-1">Choose a saved estimate from the dropdown above</p>
        </div>
      )}

      {selectedId && !estimateState && (
        <div className="text-center py-12 text-muted-foreground">Loading estimate…</div>
      )}

      {estimateState && (
        <>
          {/* Print header */}
          <div className="print-only hidden print:block mb-4">
            <h2 className="text-lg font-bold">Price Impact Analysis — {estimate?.name}</h2>
            <p className="text-sm text-gray-500">Generated {new Date().toLocaleDateString("en-IN")}</p>
          </div>

          {/* Scenarios management card */}
          <Card className="no-print">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Scenarios</CardTitle>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCreateForm((v) => !v)}
                    data-testid="btn-new-scenario"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> New Scenario
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">

              {/* Create form */}
              {showCreateForm && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-primary/40 bg-primary/5">
                  <input
                    type="text"
                    placeholder="e.g. Bitumen hike — March 2026"
                    value={newScenarioName}
                    onChange={(e) => setNewScenarioName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateScenario()}
                    className="flex-1 border border-border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                    data-testid="input-new-scenario-name"
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateScenario}
                    disabled={createScenarioMutation.isPending || !newScenarioName.trim()}
                    data-testid="btn-create-scenario"
                  >
                    {createScenarioMutation.isPending ? "Creating…" : "Create & Edit"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowCreateForm(false); setNewScenarioName(""); }}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Scenario list */}
              {scenarios.length === 0 && !showCreateForm && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No scenarios yet. Click "New Scenario" to create one — it will open the calculator pre-loaded with this estimate's data so you can tweak any inputs and save as a scenario.
                </p>
              )}

              {scenarios.map((sc) => (
                <div
                  key={sc.id}
                  className="flex items-start justify-between gap-3 px-4 py-3 rounded-md border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                  data-testid={`row-scenario-${sc.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{sc.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sc.state
                        ? <span className="text-green-700 dark:text-green-400 font-medium">Full state saved</span>
                        : <span className="text-amber-600 dark:text-amber-400">Legacy (price overrides only)</span>
                      }
                      <span className="mx-1.5">·</span>
                      Saved {fmtDateTime(sc.createdAt)}
                      {sc.updatedAt && (
                        <span className="ml-1.5">· Edited {fmtDateTime(sc.updatedAt)}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openInCalculator(sc.id)}
                      data-testid={`btn-edit-scenario-${sc.id}`}
                      title={canEdit ? "Open in Mix Calculator to edit" : "View in Mix Calculator (read-only)"}
                    >
                      <PencilLine className="w-3.5 h-3.5 mr-1" /> {canEdit ? "Edit" : "View"}
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteScenarioMutation.mutate(sc.id)}
                        disabled={deleteScenarioMutation.isPending}
                        className="text-destructive hover:text-destructive"
                        data-testid={`btn-delete-scenario-${sc.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Scenario Comparison (visible when 1+ scenarios exist) */}
          {scenarioCalcs.length >= 1 && displayBaseState && displayBaseCalc && (
            <ScenarioComparison
              scenarioCalcs={scenarioCalcs}
              baseState={displayBaseState}
              baseCalc={displayBaseCalc}
            />
          )}
        </>
      )}
    </div>
  );
}
