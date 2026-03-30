import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, GitCompare, Printer } from "lucide-react";
import type { MixEstimate, PriceScenario } from "@shared/schema";
import { calcMixRatesAndJobs, type CalcState, type CalcResult } from "@/lib/mixCalc";

function fmtI(v: number) { return Math.round(v).toLocaleString("en-IN"); }
function fmtR(v: number) { return v.toFixed(2).replace(/\B(?=(\d{2})+(\d)(?!\d))/g, ","); }
function fmtDateTime(d?: string | Date | null) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) +
    ", " + dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function parseState(json: string | null | undefined): CalcState | null {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

interface ScenarioEntry {
  scenario: PriceScenario;
  state: CalcState;
  calc: CalcResult;
}

export default function ScenarioComparison() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const estimateId = parseInt(params.get("estimateId") || "0");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: estimate } = useQuery<MixEstimate>({
    queryKey: ["/api/mix-estimates", estimateId],
    enabled: estimateId > 0,
  });

  const { data: scenarios = [] } = useQuery<PriceScenario[]>({
    queryKey: ["/api/price-scenarios", estimateId],
    queryFn: () => fetch(`/api/price-scenarios?estimateId=${estimateId}`).then(r => r.json()),
    enabled: estimateId > 0,
  });

  const baseState = useMemo(() => parseState(estimate?.state), [estimate]);
  const baseCalc = useMemo(() => baseState ? calcMixRatesAndJobs(baseState) : null, [baseState]);

  const scenarioEntries: ScenarioEntry[] = useMemo(() => {
    if (!baseState || !baseCalc) return [];
    return scenarios
      .filter(sc => selectedIds.has(sc.id))
      .map(sc => {
        const scState = parseState(sc.state);
        if (!scState) return null;
        const calc = calcMixRatesAndJobs(scState);
        return { scenario: sc, state: scState, calc } as ScenarioEntry;
      })
      .filter(Boolean) as ScenarioEntry[];
  }, [scenarios, selectedIds, baseState, baseCalc]);

  function toggleScenario(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(scenarios.filter(s => !!s.state).map(s => s.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  const mixNames = useMemo(() => {
    if (!baseState) return [];
    return (baseState.mixTypes || []).map(m => m.name);
  }, [baseState]);

  const siteNames = useMemo(() => {
    if (!baseState) return [];
    return (baseState.sites || []).map(s => s.name || s.id);
  }, [baseState]);

  function bestWorst(values: (number | null)[]) {
    const valid = values.filter(v => v != null) as number[];
    if (valid.length < 2) return { best: null, worst: null };
    return { best: Math.min(...valid), worst: Math.max(...valid) };
  }

  function cellColor(val: number | null, best: number | null, worst: number | null, lowerIsBetter = true) {
    if (val == null || best == null || worst == null) return "";
    if (best === worst) return "";
    if (lowerIsBetter) {
      if (val === best) return "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400";
      if (val === worst) return "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400";
    } else {
      if (val === best) return "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400";
      if (val === worst) return "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400";
    }
    return "";
  }

  const thCls = "px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap";
  const th1Cls = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap";
  const tdR = "px-3 py-2 text-right text-sm tabular-nums";
  const tdL = "px-3 py-2 text-left text-sm font-medium";

  return (
    <div className="p-6 max-w-7xl mx-auto print:p-2 print:max-w-none">
      <div className="flex items-center gap-4 mb-5 print:hidden">
        <Link href={`/admin/mix-impact?estimateId=${estimateId}`}>
          <Button variant="ghost" size="sm" data-testid="btn-back">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Price Impact
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GitCompare className="w-6 h-6 text-primary" />
            Scenario Comparison
          </h1>
          {estimate && (
            <p className="text-sm text-muted-foreground mt-1">
              {estimate.contractor && <span className="font-medium">{estimate.contractor}</span>}
              {estimate.contractor && " — "}
              {estimate.name}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print">
          <Printer className="w-4 h-4 mr-1" /> Print
        </Button>
      </div>

      <div className="print:hidden mb-6">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-foreground">Select scenarios to compare</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} data-testid="btn-select-all">Select All</Button>
                <Button variant="ghost" size="sm" onClick={selectNone} data-testid="btn-select-none">Clear</Button>
              </div>
            </div>
            {scenarios.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scenarios found for this estimate. Create scenarios from the Price Impact page first.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {scenarios.map(sc => {
                  const hasState = !!sc.state;
                  return (
                    <label
                      key={sc.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedIds.has(sc.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      } ${!hasState ? "opacity-50" : ""}`}
                      data-testid={`checkbox-scenario-${sc.id}`}
                    >
                      <Checkbox
                        checked={selectedIds.has(sc.id)}
                        onCheckedChange={() => toggleScenario(sc.id)}
                        disabled={!hasState}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{sc.name}</p>
                        <p className="text-xs text-muted-foreground">{fmtDateTime(sc.updatedAt || sc.createdAt)}</p>
                      </div>
                      {!hasState && <Badge variant="outline" className="text-xs shrink-0">Legacy</Badge>}
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="print:block hidden mb-4">
        <h2 className="text-xl font-bold">Scenario Comparison — {estimate?.contractor} — {estimate?.name}</h2>
        <p className="text-sm text-muted-foreground">
          Comparing: Base vs {scenarioEntries.map(e => e.scenario.name).join(", ")}
        </p>
      </div>

      {scenarioEntries.length === 0 && scenarios.length > 0 && (
        <div className="text-center py-12 text-muted-foreground print:hidden">
          <GitCompare className="w-10 h-10 mx-auto mb-3 opacity-40" />
          {selectedIds.size > 0 ? (
            <p className="font-medium">Selected scenarios don't have full calculator states for comparison</p>
          ) : (
            <p className="font-medium">Select scenarios above to compare them side by side</p>
          )}
        </div>
      )}

      {scenarioEntries.length > 0 && baseCalc && baseState && (
        <div className="space-y-6">
          {/* Section 1: Final Laid Rate by Mix Type */}
          <Card>
            <CardContent className="py-4 overflow-x-auto">
              <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">Final Laid Rate by Mix Type</h3>
              <table className="w-full border-collapse text-sm" data-testid="table-mix-rates">
                <thead>
                  <tr className="border-b border-border">
                    <th className={th1Cls}>Mix Type</th>
                    <th className={thCls}>Base ₹/MT</th>
                    <th className={thCls}>Base ₹/CUM</th>
                    {scenarioEntries.map(e => (
                      <th key={e.scenario.id} className={thCls} colSpan={2}>
                        {e.scenario.name}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <th className={th1Cls}></th>
                    <th className={thCls}></th>
                    <th className={thCls}></th>
                    {scenarioEntries.map(e => (
                      <Fragment key={e.scenario.id}>
                        <th className={thCls}>₹/MT</th>
                        <th className={thCls}>Δ ₹/MT</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mixNames.map((name, idx) => {
                    const baseMr = baseCalc.mixRates[idx];
                    if (!baseMr) return null;
                    const scVals = scenarioEntries.map(e => e.calc.mixRates[idx]?.finalLaid ?? null);
                    const allVals = [baseMr.finalLaid, ...scVals];
                    const { best, worst } = bestWorst(allVals);

                    return (
                      <tr key={idx} className="border-b border-border/30">
                        <td className={tdL}>{name}</td>
                        <td className={`${tdR} font-semibold ${cellColor(baseMr.finalLaid, best, worst)}`}>
                          ₹{fmtR(baseMr.finalLaid)}
                        </td>
                        <td className={`${tdR} text-muted-foreground`}>₹{fmtR(baseMr.finalLaidPerCum)}</td>
                        {scenarioEntries.map((e, si) => {
                          const mr = e.calc.mixRates[idx];
                          if (!mr) return <Fragment key={si}><td className={tdR}>—</td><td className={tdR}>—</td></Fragment>;
                          const delta = mr.finalLaid - baseMr.finalLaid;
                          return (
                            <Fragment key={e.scenario.id}>
                              <td className={`${tdR} font-semibold ${cellColor(mr.finalLaid, best, worst)}`}>
                                ₹{fmtR(mr.finalLaid)}
                              </td>
                              <td className={tdR}>
                                {Math.abs(delta) < 0.01
                                  ? <span className="text-muted-foreground">—</span>
                                  : delta > 0
                                    ? <span className="text-red-600 font-semibold">+₹{fmtR(delta)}</span>
                                    : <span className="text-green-600 font-semibold">-₹{fmtR(Math.abs(delta))}</span>
                                }
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Section 2: Site-wise Cost Comparison */}
          <Card>
            <CardContent className="py-4 overflow-x-auto">
              <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">Site-wise Cost Comparison</h3>
              <table className="w-full border-collapse text-sm" data-testid="table-site-costs">
                <thead>
                  <tr className="border-b border-border">
                    <th className={th1Cls}>Site</th>
                    <th className={thCls}>MT</th>
                    <th className={thCls}>Base Cost ₹</th>
                    {scenarioEntries.map(e => (
                      <th key={e.scenario.id} className={thCls} colSpan={2}>
                        {e.scenario.name}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <th className={th1Cls}></th>
                    <th className={thCls}></th>
                    <th className={thCls}></th>
                    {scenarioEntries.map(e => (
                      <Fragment key={e.scenario.id}>
                        <th className={thCls}>Cost ₹</th>
                        <th className={thCls}>Δ ₹</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(baseCalc.siteResults || []).map((baseSite, sIdx) => {
                    const scCosts = scenarioEntries.map(e => {
                      const ss = e.calc.siteResults?.find(s => s.siteId === baseSite.siteId);
                      return ss?.siteTotal ?? null;
                    });
                    const allCosts = [baseSite.siteTotal, ...scCosts];
                    const { best, worst } = bestWorst(allCosts);

                    return (
                      <tr key={sIdx} className="border-b border-border/30">
                        <td className={tdL}>{baseSite.siteName}</td>
                        <td className={`${tdR} text-muted-foreground`}>{fmtI(baseSite.siteMt)}</td>
                        <td className={`${tdR} font-semibold ${cellColor(baseSite.siteTotal, best, worst)}`}>
                          ₹{fmtI(baseSite.siteTotal)}
                        </td>
                        {scenarioEntries.map(e => {
                          const ss = e.calc.siteResults?.find(s => s.siteId === baseSite.siteId);
                          const cost = ss?.siteTotal ?? null;
                          const delta = cost != null ? cost - baseSite.siteTotal : null;
                          return (
                            <Fragment key={e.scenario.id}>
                              <td className={`${tdR} font-semibold ${cellColor(cost, best, worst)}`}>
                                {cost != null ? `₹${fmtI(cost)}` : "—"}
                              </td>
                              <td className={tdR}>
                                {delta == null || Math.abs(delta) < 1
                                  ? <span className="text-muted-foreground">—</span>
                                  : delta > 0
                                    ? <span className="text-red-600 font-semibold">+₹{fmtI(delta)}</span>
                                    : <span className="text-green-600 font-semibold">-₹{fmtI(Math.abs(delta))}</span>
                                }
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {/* Grand total row */}
                  <tr className="border-t-2 border-foreground/30 font-bold bg-muted/30">
                    <td className={tdL}>GRAND TOTAL</td>
                    <td className={`${tdR} text-muted-foreground`}>{fmtI(baseCalc.grandTotalMt)}</td>
                    <td className={tdR}>₹{fmtI(baseCalc.grandTotalAmt)}</td>
                    {scenarioEntries.map(e => {
                      const delta = e.calc.grandTotalAmt - baseCalc.grandTotalAmt;
                      return (
                        <Fragment key={e.scenario.id}>
                          <td className={tdR}>₹{fmtI(e.calc.grandTotalAmt)}</td>
                          <td className={tdR}>
                            {Math.abs(delta) < 1
                              ? <span className="text-muted-foreground">—</span>
                              : delta > 0
                                ? <span className="text-red-600 font-semibold">+₹{fmtI(delta)}</span>
                                : <span className="text-green-600 font-semibold">-₹{fmtI(Math.abs(delta))}</span>
                            }
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Section 3: Summary */}
          <Card>
            <CardContent className="py-4 overflow-x-auto">
              <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">Summary</h3>
              <table className="w-full border-collapse text-sm" data-testid="table-summary">
                <thead>
                  <tr className="border-b border-border">
                    <th className={th1Cls}>Metric</th>
                    <th className={thCls}>Base</th>
                    {scenarioEntries.map(e => (
                      <th key={e.scenario.id} className={thCls}>{e.scenario.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/30">
                    <td className={tdL}>Total MT</td>
                    <td className={tdR}>{fmtI(baseCalc.grandTotalMt)}</td>
                    {scenarioEntries.map(e => (
                      <td key={e.scenario.id} className={tdR}>{fmtI(e.calc.grandTotalMt)}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className={tdL}>Total Cost ₹</td>
                    <td className={`${tdR} font-semibold`}>₹{fmtI(baseCalc.grandTotalAmt)}</td>
                    {scenarioEntries.map(e => {
                      const delta = e.calc.grandTotalAmt - baseCalc.grandTotalAmt;
                      const cls = Math.abs(delta) < 1 ? "" : delta < 0 ? "text-green-600" : "text-red-600";
                      return (
                        <td key={e.scenario.id} className={`${tdR} font-semibold ${cls}`}>
                          ₹{fmtI(e.calc.grandTotalAmt)}
                          {Math.abs(delta) >= 1 && (
                            <span className="block text-xs mt-0.5">
                              ({delta > 0 ? "+" : ""}₹{fmtI(delta)})
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {baseCalc.grandTotalMt > 0 && (
                    <tr className="border-b border-border/30">
                      <td className={tdL}>Avg Cost ₹/MT</td>
                      <td className={`${tdR}`}>₹{fmtR(baseCalc.grandTotalAmt / baseCalc.grandTotalMt)}</td>
                      {scenarioEntries.map(e => {
                        const scAvg = e.calc.grandTotalMt > 0 ? e.calc.grandTotalAmt / e.calc.grandTotalMt : 0;
                        const baseAvg = baseCalc.grandTotalAmt / baseCalc.grandTotalMt;
                        const delta = scAvg - baseAvg;
                        const cls = Math.abs(delta) < 0.01 ? "" : delta < 0 ? "text-green-600" : "text-red-600";
                        return (
                          <td key={e.scenario.id} className={`${tdR} ${cls}`}>
                            ₹{fmtR(scAvg)}
                            {Math.abs(delta) >= 0.01 && (
                              <span className="block text-xs mt-0.5">
                                ({delta > 0 ? "+" : ""}₹{fmtR(delta)})
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                  <tr className="border-t-2 border-foreground/30 font-bold bg-muted/30">
                    <td className={tdL}>Savings vs Base ₹</td>
                    <td className={`${tdR} text-muted-foreground`}>—</td>
                    {scenarioEntries.map(e => {
                      const saving = baseCalc.grandTotalAmt - e.calc.grandTotalAmt;
                      const cls = saving > 0 ? "text-green-600" : saving < 0 ? "text-red-600" : "";
                      return (
                        <td key={e.scenario.id} className={`${tdR} ${cls}`}>
                          {Math.abs(saving) < 1
                            ? <span className="text-muted-foreground">—</span>
                            : saving > 0
                              ? `₹${fmtI(saving)}`
                              : `-₹${fmtI(Math.abs(saving))}`
                          }
                          {baseCalc.grandTotalAmt > 0 && Math.abs(saving) >= 1 && (
                            <span className="block text-xs mt-0.5">
                              ({(saving / baseCalc.grandTotalAmt * 100).toFixed(1)}%)
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
