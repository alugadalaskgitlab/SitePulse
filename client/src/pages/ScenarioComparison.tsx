import { useState, useMemo, Fragment, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, GitCompare, Printer } from "lucide-react";
import type { MixEstimate, PriceScenario } from "@shared/schema";
import { calcMixRatesAndJobs, calcSiteProfitCosts, calcRevenue, type CalcState, type CalcResult, type RevenueResult, type SiteProfitResult } from "@/lib/mixCalc";
import { readEstimatorRole } from "@/lib/estimatorAuth";
import { useAuth } from "@/lib/auth-context";

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
  revenue: RevenueResult;
  profitCosts: SiteProfitResult;
}

export default function ScenarioComparison() {
  const { sectionCan, isAdmin, isLoading: authLoading } = useAuth();
  const hasMainAppAccess = isAdmin || sectionCan("mix_calculator", "create") || sectionCan("mix_calculator", "edit");

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
  const baseRevenue = useMemo(() => baseState && baseCalc ? calcRevenue(baseState, baseCalc) : null, [baseState, baseCalc]);
  const baseProfitCosts = useMemo(() => baseState && baseCalc ? calcSiteProfitCosts(baseState, baseCalc.mixRates) : null, [baseState, baseCalc]);

  const scenarioEntries: ScenarioEntry[] = useMemo(() => {
    if (!baseState || !baseCalc) return [];
    return scenarios
      .filter(sc => selectedIds.has(sc.id))
      .map(sc => {
        const scState = parseState(sc.state);
        if (!scState) return null;
        const calc = calcMixRatesAndJobs(scState);
        const rev = calcRevenue(scState, calc);
        const profitCosts = calcSiteProfitCosts(scState, calc.mixRates);
        return { scenario: sc, state: scState, calc, revenue: rev, profitCosts } as ScenarioEntry;
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

  const greenBg = "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400";
  const redBg = "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400";

  function cellColor(val: number | null, best: number | null, worst: number | null, lowerIsBetter = true) {
    if (val == null || best == null || worst == null) return "";
    if (best === worst) return "";
    if (lowerIsBetter) {
      if (val === best) return greenBg;
      if (val === worst) return redBg;
    } else {
      if (val === best) return redBg;
      if (val === worst) return greenBg;
    }
    return "";
  }

  function profitHighlight(val: number | null, allVals: (number | null)[]) {
    if (val == null) return "";
    const valid = allVals.filter(v => v != null) as number[];
    if (valid.length < 2) return "";
    const hi = Math.max(...valid);
    const lo = Math.min(...valid);
    if (hi === lo) return "";
    if (val === hi) return greenBg;
    if (val === lo) return redBg;
    return "";
  }

  const thCls = "px-3 py-2 text-right text-sm font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap";
  const th1Cls = "px-3 py-2 text-left text-sm font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap";
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
                        <p className="text-sm text-muted-foreground">{fmtDateTime(sc.updatedAt || sc.createdAt)}</p>
                      </div>
                      {!hasState && <Badge variant="outline" className="text-sm shrink-0">Legacy</Badge>}
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
                  {(baseProfitCosts ? baseProfitCosts.siteCosts : (baseCalc.siteResults || []).map(sr => ({ siteId: sr.siteId, siteName: sr.siteName, fullCost: sr.siteTotal, inScopeCost: sr.siteTotal, siteMt: sr.siteMt }))).map((baseSite, sIdx) => {
                    const scCosts = scenarioEntries.map(e => {
                      const ss = e.profitCosts.siteCosts.find(s => s.siteId === baseSite.siteId);
                      return ss?.inScopeCost ?? null;
                    });
                    const allCosts = [baseSite.inScopeCost, ...scCosts];
                    const { best, worst } = bestWorst(allCosts);

                    return (
                      <tr key={sIdx} className="border-b border-border/30">
                        <td className={tdL}>{baseSite.siteName}</td>
                        <td className={`${tdR} text-muted-foreground`}>{fmtI(baseSite.siteMt)}</td>
                        <td className={`${tdR} font-semibold ${cellColor(baseSite.inScopeCost, best, worst)}`}>
                          ₹{fmtI(baseSite.inScopeCost)}
                        </td>
                        {scenarioEntries.map(e => {
                          const ss = e.profitCosts.siteCosts.find(s => s.siteId === baseSite.siteId);
                          const cost = ss?.inScopeCost ?? null;
                          const delta = cost != null ? cost - baseSite.inScopeCost : null;
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
                    <td className={`${tdR} text-muted-foreground`}>{fmtI(baseProfitCosts ? baseProfitCosts.grandMt : baseCalc.grandTotalMt)}</td>
                    <td className={tdR}>₹{fmtI(baseProfitCosts ? baseProfitCosts.grandInScopeCost : baseCalc.grandTotalAmt)}</td>
                    {scenarioEntries.map(e => {
                      const bCost = baseProfitCosts ? baseProfitCosts.grandInScopeCost : baseCalc.grandTotalAmt;
                      const sCost = e.profitCosts.grandInScopeCost;
                      const delta = sCost - bCost;
                      return (
                        <Fragment key={e.scenario.id}>
                          <td className={tdR}>₹{fmtI(sCost)}</td>
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
                    <td className={`${tdR} font-semibold`}>₹{fmtI(baseProfitCosts ? baseProfitCosts.grandInScopeCost : baseCalc.grandTotalAmt)}</td>
                    {scenarioEntries.map(e => {
                      const bCost = baseProfitCosts ? baseProfitCosts.grandInScopeCost : baseCalc.grandTotalAmt;
                      const sCost = e.profitCosts.grandInScopeCost;
                      const delta = sCost - bCost;
                      const cls = Math.abs(delta) < 1 ? "" : delta < 0 ? "text-green-600" : "text-red-600";
                      return (
                        <td key={e.scenario.id} className={`${tdR} font-semibold ${cls}`}>
                          ₹{fmtI(sCost)}
                          {Math.abs(delta) >= 1 && (
                            <span className="block text-sm mt-0.5">
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
                      <td className={`${tdR}`}>₹{fmtR((baseProfitCosts ? baseProfitCosts.grandInScopeCost : baseCalc.grandTotalAmt) / baseCalc.grandTotalMt)}</td>
                      {scenarioEntries.map(e => {
                        const sCost = e.profitCosts.grandInScopeCost;
                        const bCost = baseProfitCosts ? baseProfitCosts.grandInScopeCost : baseCalc.grandTotalAmt;
                        const scAvg = e.calc.grandTotalMt > 0 ? sCost / e.calc.grandTotalMt : 0;
                        const baseAvg = bCost / baseCalc.grandTotalMt;
                        const delta = scAvg - baseAvg;
                        const cls = Math.abs(delta) < 0.01 ? "" : delta < 0 ? "text-green-600" : "text-red-600";
                        return (
                          <td key={e.scenario.id} className={`${tdR} ${cls}`}>
                            ₹{fmtR(scAvg)}
                            {Math.abs(delta) >= 0.01 && (
                              <span className="block text-sm mt-0.5">
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
                      const bCost = baseProfitCosts ? baseProfitCosts.grandInScopeCost : baseCalc.grandTotalAmt;
                      const sCost = e.profitCosts.grandInScopeCost;
                      const saving = bCost - sCost;
                      const cls = saving > 0 ? "text-green-600" : saving < 0 ? "text-red-600" : "";
                      return (
                        <td key={e.scenario.id} className={`${tdR} ${cls}`}>
                          {Math.abs(saving) < 1
                            ? <span className="text-muted-foreground">—</span>
                            : saving > 0
                              ? `₹${fmtI(saving)}`
                              : `-₹${fmtI(Math.abs(saving))}`
                          }
                          {bCost > 0 && Math.abs(saving) >= 1 && (
                            <span className="block text-sm mt-0.5">
                              ({(saving / bCost * 100).toFixed(1)}%)
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

          {/* Section 4: Profitability Comparison */}
          {baseRevenue && baseProfitCosts && (baseRevenue.hasAnyRevenue || scenarioEntries.some(e => e.revenue.hasAnyRevenue)) && (
            <Card>
              <CardContent className="py-4 overflow-x-auto">
                <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">Profitability Comparison</h3>
                {baseProfitCosts.grandInScopeCost !== baseProfitCosts.grandFullCost && (
                  <p className="text-sm text-muted-foreground mb-2">Costs reflect Scope Quotation selections from the calculator.</p>
                )}
                <table className="w-full border-collapse text-sm" data-testid="table-profitability">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={th1Cls}>Site</th>
                      <th className={thCls}>Base Revenue ₹</th>
                      <th className={thCls}>Base Cost ₹</th>
                      <th className={thCls}>Base Profit ₹</th>
                      {scenarioEntries.map(e => (
                        <Fragment key={e.scenario.id}>
                          <th className={thCls}>{e.scenario.name} Rev ₹</th>
                          <th className={thCls}>{e.scenario.name} Cost ₹</th>
                          <th className={thCls}>{e.scenario.name} Profit ₹</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(baseRevenue.siteRevenues || []).map((baseSiteRev, sIdx) => {
                      const baseSitePc = baseProfitCosts.siteCosts.find(s => s.siteId === baseSiteRev.siteId);
                      const bCost = baseSitePc?.inScopeCost ?? 0;
                      const bRev = baseSiteRev.revenue ?? 0;
                      const bProfit = baseSiteRev.hasRev ? bRev - bCost : null;

                      const profitVals: (number | null)[] = [bProfit, ...scenarioEntries.map(e => {
                        const sr = e.revenue.siteRevenues.find(s => s.siteId === baseSiteRev.siteId);
                        const sc = e.profitCosts.siteCosts.find(s => s.siteId === baseSiteRev.siteId);
                        if (!sr?.hasRev) return null;
                        return (sr.revenue ?? 0) - (sc?.inScopeCost ?? 0);
                      })];

                      return (
                        <tr key={sIdx} className="border-b border-border/30">
                          <td className={tdL}>{baseSiteRev.siteName}</td>
                          <td className={tdR}>
                            {baseSiteRev.hasRev ? `₹${fmtI(bRev)}` : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={tdR}>₹{fmtI(bCost)}</td>
                          <td className={`${tdR} font-semibold ${profitHighlight(bProfit, profitVals)}`}>
                            {bProfit != null
                              ? <span className={bProfit >= 0 ? "text-green-600" : "text-red-600"}>₹{fmtI(bProfit)}</span>
                              : <span className="text-muted-foreground">—</span>
                            }
                          </td>
                          {scenarioEntries.map(e => {
                            const sr = e.revenue.siteRevenues.find(s => s.siteId === baseSiteRev.siteId);
                            const sc = e.profitCosts.siteCosts.find(s => s.siteId === baseSiteRev.siteId);
                            const hasSite = !!sc;
                            const sRev = sr?.revenue ?? 0;
                            const sCost = sc?.inScopeCost ?? 0;
                            const sProfit = (hasSite && sr?.hasRev) ? sRev - sCost : null;

                            return (
                              <Fragment key={e.scenario.id}>
                                <td className={tdR}>
                                  {sr?.hasRev ? `₹${fmtI(sRev)}` : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className={tdR}>
                                  {hasSite ? `₹${fmtI(sCost)}` : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className={`${tdR} font-semibold ${profitHighlight(sProfit, profitVals)}`}>
                                  {sProfit != null
                                    ? <span className={sProfit >= 0 ? "text-green-600" : "text-red-600"}>₹{fmtI(sProfit)}</span>
                                    : <span className="text-muted-foreground">—</span>
                                  }
                                </td>
                              </Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {/* Grand total row */}
                    {(() => {
                      const bGrandRev = baseRevenue.grandRevenue;
                      const bGrandCost = baseProfitCosts.grandInScopeCost;
                      const bGrandProfit = baseRevenue.hasAnyRevenue ? bGrandRev - bGrandCost : null;
                      const bMargin = bGrandProfit != null && bGrandRev > 0 ? (bGrandProfit / bGrandRev * 100) : null;

                      const grandProfitVals: (number | null)[] = [bGrandProfit, ...scenarioEntries.map(e => {
                        return e.revenue.hasAnyRevenue ? e.revenue.grandRevenue - e.profitCosts.grandInScopeCost : null;
                      })];

                      return (
                        <tr className="border-t-2 border-foreground/30 font-bold bg-muted/30">
                          <td className={tdL}>GRAND TOTAL</td>
                          <td className={tdR}>
                            {baseRevenue.hasAnyRevenue ? `₹${fmtI(bGrandRev)}` : "—"}
                          </td>
                          <td className={tdR}>₹{fmtI(bGrandCost)}</td>
                          <td className={`${tdR} ${profitHighlight(bGrandProfit, grandProfitVals)}`}>
                            {bGrandProfit != null ? (
                              <>
                                <span className={bGrandProfit >= 0 ? "text-green-600" : "text-red-600"}>₹{fmtI(bGrandProfit)}</span>
                                {bMargin != null && (
                                  <span className="block text-sm font-normal mt-0.5">
                                    ({bMargin.toFixed(1)}% margin)
                                  </span>
                                )}
                              </>
                            ) : "—"}
                          </td>
                          {scenarioEntries.map(e => {
                            const sRev = e.revenue.grandRevenue;
                            const sCost = e.profitCosts.grandInScopeCost;
                            const sProfit = e.revenue.hasAnyRevenue ? sRev - sCost : null;
                            const sMargin = sProfit != null && sRev > 0 ? (sProfit / sRev * 100) : null;

                            return (
                              <Fragment key={e.scenario.id}>
                                <td className={tdR}>
                                  {e.revenue.hasAnyRevenue ? `₹${fmtI(sRev)}` : "—"}
                                </td>
                                <td className={tdR}>₹{fmtI(sCost)}</td>
                                <td className={`${tdR} ${profitHighlight(sProfit, grandProfitVals)}`}>
                                  {sProfit != null ? (
                                    <>
                                      <span className={sProfit >= 0 ? "text-green-600" : "text-red-600"}>₹{fmtI(sProfit)}</span>
                                      {sMargin != null && (
                                        <span className="block text-sm font-normal mt-0.5">
                                          ({sMargin.toFixed(1)}% margin)
                                        </span>
                                      )}
                                    </>
                                  ) : "—"}
                                </td>
                              </Fragment>
                            );
                          })}
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
