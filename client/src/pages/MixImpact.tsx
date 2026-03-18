import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Printer, Trash2, GitCompare, FlaskConical, PencilLine, Plus } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MixEstimate, PriceScenario } from "@shared/schema";
import { calcMixRatesAndJobs, diffCalcInputs, type CalcState, type RevisedPrices } from "@/lib/mixCalc";

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

// ── Scenario Comparison Component ──────────────────────────────────────────

interface ScenarioCalcEntry {
  scenario: PriceScenario;
  prices: RevisedPrices;
  calc: ReturnType<typeof calcMixRatesAndJobs>;
  scState: CalcState | null;
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

  function DeltaLine({ base, revised }: { base: number; revised: number }) {
    const delta = revised - base;
    if (Math.abs(delta) < 0.001) return <span className="block text-xs text-muted-foreground/60 mt-0.5">—</span>;
    const sign = delta > 0 ? "+" : "";
    const cls = delta > 0 ? "text-red-500" : "text-green-600";
    return (
      <span className={`block text-xs font-medium mt-0.5 ${cls}`}>
        {sign}₹{delta.toFixed(2)}
      </span>
    );
  }

  // Build union of changed input keys across all scenarios
  const allChangedInputs = useMemo(() => {
    const byKey: Record<string, { key: string; label: string; unit: string }> = {};
    scenarioCalcs.forEach(({ scState, prices }) => {
      if (scState) {
        diffCalcInputs(baseState, scState).forEach(d => {
          byKey[d.key] = { key: d.key, label: d.label, unit: d.unit };
        });
      } else {
        LEGACY_PRICE_ROWS.forEach(({ key, label, unit }) => {
          const baseVal = parseFloat(baseState.inputs?.[key] ?? "0") || 0;
          const revVal = (prices[key as keyof RevisedPrices] as number | undefined) ?? baseVal;
          if (Math.abs(revVal - baseVal) > 0.001) byKey[key] = { key, label, unit };
        });
      }
    });
    return Object.values(byKey);
  }, [scenarioCalcs, baseState]);

  return (
    <Card data-testid="card-scenario-comparison">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-primary" /> Scenario Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-0 pb-4">

        {/* No-changes hint */}
        {allChangedInputs.length === 0 && scenarioCalcs.length > 0 && (
          <div className="mx-4 mt-3 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
            No rate changes detected in {scenarioCalcs.length === 1 ? "this scenario" : "any scenario"}.
            Click <strong>Edit</strong> next to a scenario, adjust any inputs in the calculator, then click
            <strong> Save Scenario &amp; Return</strong> to record the changes.
          </div>
        )}

        {/* Table 1 — Changed Inputs (only rows changed in ≥1 scenario) */}
        {allChangedInputs.length > 0 && (
          <div>
            <p className="px-4 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Changed Input Rates
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className={th1Cls}>Input</th>
                    <th className={thCls}>Base</th>
                    {scenarioCalcs.map(({ scenario }) => (
                      <th key={scenario.id} className={thCls} title={scenario.name}>
                        <span className="block max-w-[120px] truncate ml-auto">{scenario.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allChangedInputs.map(({ key, label, unit }) => {
                    const baseVal = parseFloat(baseState.inputs?.[key] ?? "0") || 0;
                    return (
                      <tr key={key} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-medium text-sm">
                          {label}
                          <span className="block text-xs text-muted-foreground font-normal">{unit}</span>
                        </td>
                        <td className={`${tdBase} font-medium`}>
                          ₹{baseVal.toFixed(2)}
                        </td>
                        {scenarioCalcs.map((entry) => {
                          const rev = getScenarioVal(entry, key, baseVal);
                          const changed = Math.abs(rev - baseVal) > 0.001;
                          return (
                            <td
                              key={entry.scenario.id}
                              className={`${tdBase} ${changed ? "bg-primary/5" : ""}`}
                              data-testid={`cmp-rate-${key}-${entry.scenario.id}`}
                            >
                              <span className={`font-medium ${changed ? (rev > baseVal ? "text-red-600" : "text-green-600") : "text-muted-foreground"}`}>
                                ₹{rev.toFixed(2)}
                              </span>
                              <DeltaLine base={baseVal} revised={rev} />
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
              <p className="px-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Final Laid Rate by Mix Type
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className={th1Cls}>Mix Type</th>
                      <th className={thCls}>Base ₹/MT</th>
                      <th className={thCls}>Base Amt ₹</th>
                      {scenarioCalcs.map(({ scenario }) => (
                        <th key={scenario.id} className={thCls} title={scenario.name} colSpan={2}>
                          <span className="block max-w-[180px] truncate ml-auto">{scenario.name}</span>
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-muted/20 border-b border-border text-xs text-muted-foreground">
                      <th /><th /><th />
                      {scenarioCalcs.map(({ scenario }) => (
                        <Fragment key={scenario.id}>
                          <th className={thCls}>₹/MT</th>
                          <th className={thCls}>Amt ₹</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {baseCalc.mixRates.map((baseMix, i) => (
                      <tr key={baseMix.name} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-semibold">{baseMix.name}</td>
                        <td className={`${tdBase} font-medium`}>₹{baseMix.finalLaid.toFixed(2)}</td>
                        <td className={`${tdBase} text-muted-foreground`}>
                          {baseAmts[i] > 0 ? `₹${Math.round(baseAmts[i]).toLocaleString("en-IN")}` : "—"}
                        </td>
                        {scenarioCalcs.map(({ scenario, calc }) => {
                          const revRate = calc.mixRates[i]?.finalLaid ?? 0;
                          const revAmts = mixAmts(calc);
                          const revAmt = revAmts[i] ?? 0;
                          const rateChanged = Math.abs(revRate - baseMix.finalLaid) > 0.01;
                          const amtChanged = Math.abs(revAmt - (baseAmts[i] ?? 0)) > 1;
                          return (
                            <Fragment key={scenario.id}>
                              <td
                                className={`${tdBase} ${rateChanged ? "bg-primary/5" : ""}`}
                                data-testid={`cmp-mix-${baseMix.name}-${scenario.id}`}
                              >
                                <span className={`font-medium ${rateChanged ? (revRate > baseMix.finalLaid ? "text-red-600" : "text-green-600") : "text-muted-foreground"}`}>
                                  ₹{revRate.toFixed(2)}
                                </span>
                                <DeltaLine base={baseMix.finalLaid} revised={revRate} />
                              </td>
                              <td className={`${tdBase} ${amtChanged ? "bg-primary/5" : ""}`}>
                                <span className={`font-medium ${amtChanged ? (revAmt > (baseAmts[i] ?? 0) ? "text-red-600" : "text-green-600") : "text-muted-foreground"}`}>
                                  {revAmt > 0 ? `₹${Math.round(revAmt).toLocaleString("en-IN")}` : "—"}
                                </span>
                                {amtChanged && (
                                  <DeltaAmt base={baseAmts[i] ?? 0} revised={revAmt} />
                                )}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Table 3 — Job-wise Cost */}
        {baseCalc.jobResults.length > 0 && (
          <div>
            <p className="px-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Job-wise Cost Impact
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className={th1Cls}>Job</th>
                    <th className={thCls}>MT</th>
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
                      <td className="px-3 py-2.5 font-mono font-medium text-xs">{baseJob.id}</td>
                      <td className={`${tdBase} text-muted-foreground`}>{baseJob.totalMt > 0 ? baseJob.totalMt.toFixed(1) : "—"}</td>
                      <td className={`${tdBase} font-medium`}>₹{Math.round(baseJob.totalAmt).toLocaleString("en-IN")}</td>
                      {scenarioCalcs.map(({ scenario, calc }) => {
                        const revJob = calc.jobResults[i];
                        const rev = revJob?.totalAmt ?? 0;
                        const changed = Math.abs(rev - baseJob.totalAmt) >= 1;
                        return (
                          <td
                            key={scenario.id}
                            className={`${tdBase} ${changed ? "bg-primary/5" : ""}`}
                            data-testid={`cmp-job-amt-${baseJob.id}-${scenario.id}`}
                          >
                            <span className={`font-medium ${changed ? (rev > baseJob.totalAmt ? "text-red-600" : "text-green-600") : "text-muted-foreground"}`}>
                              ₹{Math.round(rev).toLocaleString("en-IN")}
                            </span>
                            <span className="block mt-0.5 text-xs"><DeltaAmt base={baseJob.totalAmt} revised={rev} /></span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-primary/40 bg-amber-50/60 dark:bg-amber-950/20 font-bold">
                    <td className="px-3 py-3" colSpan={2}>Grand Total</td>
                    <td className={`${tdBase}`}>₹{Math.round(baseCalc.grandTotalAmt).toLocaleString("en-IN")}</td>
                    {scenarioCalcs.map(({ scenario, calc }) => {
                      const rev = calc.grandTotalAmt;
                      const changed = Math.abs(rev - baseCalc.grandTotalAmt) >= 1;
                      return (
                        <td
                          key={scenario.id}
                          className={`${tdBase} ${changed ? "bg-primary/5" : ""}`}
                          data-testid={`cmp-grand-${scenario.id}`}
                        >
                          <span className={changed ? (rev > baseCalc.grandTotalAmt ? "text-red-600" : "text-green-600") : ""}>
                            ₹{Math.round(rev).toLocaleString("en-IN")}
                          </span>
                          <span className="block mt-0.5 text-xs"><DeltaAmt base={baseCalc.grandTotalAmt} revised={rev} /></span>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────

export default function MixImpact() {
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
    mutationFn: async (payload: { estimateId: number; name: string }) => {
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

  const state = useMemo(() => estimate ? parseState(estimate.state) : null, [estimate]);
  const baseCalc = useMemo(() => state ? calcMixRatesAndJobs(state) : null, [state]);

  const scenarioCalcs = useMemo((): ScenarioCalcEntry[] => {
    if (!state) return [];
    return scenarios.map((sc) => {
      if (sc.state) {
        try {
          const scState = JSON.parse(sc.state) as CalcState;
          return { scenario: sc, prices: {}, calc: calcMixRatesAndJobs(scState), scState };
        } catch {}
      }
      let prices: RevisedPrices = {};
      try { prices = JSON.parse(sc.revisedPrices); } catch {}
      return { scenario: sc, prices, calc: calcMixRatesAndJobs(state, prices), scState: null };
    });
  }, [scenarios, state]);

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
    createScenarioMutation.mutate({ estimateId: selectedId, name: newScenarioName.trim() });
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
        <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print-impact">
          <Printer className="w-4 h-4 mr-1" /> Print
        </Button>
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

      {selectedId && !state && (
        <div className="text-center py-12 text-muted-foreground">Loading estimate…</div>
      )}

      {state && baseCalc && (
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCreateForm((v) => !v)}
                  data-testid="btn-new-scenario"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> New Scenario
                </Button>
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
                      title="Open in Mix Calculator to edit"
                    >
                      <PencilLine className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
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
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Scenario Comparison (visible when 1+ scenarios exist) */}
          {scenarioCalcs.length >= 1 && (
            <ScenarioComparison
              scenarioCalcs={scenarioCalcs}
              baseState={state}
              baseCalc={baseCalc}
            />
          )}
        </>
      )}
    </div>
  );
}
