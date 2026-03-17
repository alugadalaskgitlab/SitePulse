import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Printer, Save, Trash2, TrendingUp, TrendingDown, Minus, FlaskConical, BookOpen } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MixEstimate, PriceScenario } from "@shared/schema";
import { calcMixRatesAndJobs, type CalcState } from "@/lib/mixCalc";

function fmtR(v: number) { return v.toFixed(2); }
function fmtI(v: number) { return Math.round(v).toLocaleString("en-IN"); }
function fmtAmt(v: number | null | undefined) {
  if (!v) return "—";
  if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + " Cr";
  if (v >= 100000) return "₹" + (v / 100000).toFixed(2) + " L";
  return "₹" + fmtI(v);
}
function fmtDate(d?: string | Date | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function parseState(stateJson: string): CalcState | null {
  try { return JSON.parse(stateJson); } catch { return null; }
}

function getInputVal(state: CalcState | null, key: string, def = 0): number {
  const v = parseFloat(state?.inputs?.[key] ?? "");
  return isNaN(v) ? def : v;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.01) return <span className="text-muted-foreground">—</span>;
  const pct = delta > 0 ? "+" : "";
  if (delta > 0) {
    return (
      <span className="text-red-600 font-semibold flex items-center gap-0.5">
        <TrendingUp className="w-3 h-3" />+₹{fmtR(delta)}/MT
      </span>
    );
  }
  return (
    <span className="text-green-600 font-semibold flex items-center gap-0.5">
      <TrendingDown className="w-3 h-3" />-₹{fmtR(Math.abs(delta))}/MT
    </span>
  );
}

function DeltaAmt({ base, revised }: { base: number; revised: number }) {
  const delta = revised - base;
  if (Math.abs(delta) < 1) return <span className="text-muted-foreground">—</span>;
  if (delta > 0) {
    return <span className="text-red-600 font-semibold">+₹{fmtI(delta)}</span>;
  }
  return <span className="text-green-600 font-semibold">-₹{fmtI(Math.abs(delta))}</span>;
}

interface PriceInputs {
  aggRate: string;
  bitPrice: string;
  hsdPrice: string;
  ldoRate: string;
}

export default function MixImpact() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initEstimateId = parseInt(params.get("estimateId") || "0") || null;

  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(initEstimateId);
  const [revised, setRevised] = useState<PriceInputs>({ aggRate: "", bitPrice: "", hsdPrice: "", ldoRate: "" });
  const [scenarioName, setScenarioName] = useState("");

  const { data: estimates = [] } = useQuery<MixEstimate[]>({
    queryKey: ["/api/mix-estimates"],
  });

  const { data: estimate } = useQuery<MixEstimate>({
    queryKey: ["/api/mix-estimates", selectedId],
    queryFn: () => fetch(`/api/mix-estimates/${selectedId}`).then(r => r.json()),
    enabled: !!selectedId,
  });

  const { data: scenarios = [], refetch: refetchScenarios } = useQuery<PriceScenario[]>({
    queryKey: ["/api/price-scenarios", selectedId],
    queryFn: () => fetch(`/api/price-scenarios?estimateId=${selectedId}`).then(r => r.json()),
    enabled: !!selectedId,
  });

  const saveScenarioMutation = useMutation({
    mutationFn: (payload: { estimateId: number; name: string; revisedPrices: string }) =>
      apiRequest("POST", "/api/price-scenarios", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-scenarios", selectedId] });
      toast({ title: "Scenario saved" });
      setScenarioName("");
    },
    onError: () => toast({ title: "Failed to save scenario", variant: "destructive" }),
  });

  const deleteScenarioMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/price-scenarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-scenarios", selectedId] });
      toast({ title: "Scenario deleted" });
    },
  });

  const state = useMemo(() => estimate ? parseState(estimate.state) : null, [estimate]);

  const basePrices = useMemo(() => ({
    aggRate: getInputVal(state, "aggRate"),
    bitPrice: getInputVal(state, "bitPrice"),
    hsdPrice: getInputVal(state, "hsdPrice"),
    ldoRate: getInputVal(state, "ldoRate"),
  }), [state]);

  const revisedPrices = useMemo(() => ({
    aggRate: revised.aggRate !== "" ? parseFloat(revised.aggRate) : basePrices.aggRate,
    bitPrice: revised.bitPrice !== "" ? parseFloat(revised.bitPrice) : basePrices.bitPrice,
    hsdPrice: revised.hsdPrice !== "" ? parseFloat(revised.hsdPrice) : basePrices.hsdPrice,
    ldoRate: revised.ldoRate !== "" ? parseFloat(revised.ldoRate) : basePrices.ldoRate,
  }), [revised, basePrices]);

  const baseCalc = useMemo(() => state ? calcMixRatesAndJobs(state) : null, [state]);
  const revisedCalc = useMemo(() => state ? calcMixRatesAndJobs(state, revisedPrices) : null, [state, revisedPrices]);

  const hasChange = useMemo(() =>
    Object.keys(revisedPrices).some(
      (k) => Math.abs((revisedPrices as Record<string, number>)[k] - (basePrices as Record<string, number>)[k]) > 0.001
    ), [revisedPrices, basePrices]);

  function handleEstimateChange(id: number) {
    setSelectedId(id);
    setRevised({ aggRate: "", bitPrice: "", hsdPrice: "", ldoRate: "" });
    setScenarioName("");
  }

  function loadScenario(scenario: PriceScenario) {
    try {
      const p = JSON.parse(scenario.revisedPrices);
      setRevised({
        aggRate: p.aggRate != null ? String(p.aggRate) : "",
        bitPrice: p.bitPrice != null ? String(p.bitPrice) : "",
        hsdPrice: p.hsdPrice != null ? String(p.hsdPrice) : "",
        ldoRate: p.ldoRate != null ? String(p.ldoRate) : "",
      });
      toast({ title: `Loaded: ${scenario.name}` });
    } catch {
      toast({ title: "Failed to load scenario", variant: "destructive" });
    }
  }

  function saveScenario() {
    if (!selectedId || !scenarioName.trim()) {
      toast({ title: "Enter a scenario name", variant: "destructive" });
      return;
    }
    saveScenarioMutation.mutate({
      estimateId: selectedId,
      name: scenarioName.trim(),
      revisedPrices: JSON.stringify(revisedPrices),
    });
  }

  const priceFields: { key: keyof PriceInputs; label: string; unit: string }[] = [
    { key: "aggRate", label: "Aggregate Rate", unit: "₹/MT" },
    { key: "bitPrice", label: "Bitumen Price", unit: "₹/kg" },
    { key: "hsdPrice", label: "HSD Price", unit: "₹/L" },
    { key: "ldoRate", label: "LDO Rate", unit: "₹/L" },
  ];

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
            <p className="text-xs text-muted-foreground">See how raw material price changes affect job costs</p>
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
                </option>
              ))}
            </select>
          </div>
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

      {state && baseCalc && revisedCalc && (
        <>
          {/* Print header */}
          <div className="print-only hidden print:block mb-4">
            <h2 className="text-lg font-bold">Price Impact Analysis — {estimate?.name}</h2>
            <p className="text-sm text-gray-500">Generated {new Date().toLocaleDateString("en-IN")}</p>
          </div>

          {/* Price inputs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Revised Prices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {priceFields.map(({ key, label, unit }) => {
                  const base = basePrices[key as keyof typeof basePrices];
                  const rev = revisedPrices[key as keyof typeof revisedPrices];
                  const changed = Math.abs(rev - base) > 0.001;
                  return (
                    <div key={key} className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            step="0.01"
                            value={revised[key]}
                            placeholder={String(base)}
                            onChange={(e) => setRevised((p) => ({ ...p, [key]: e.target.value }))}
                            className={`w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${changed ? "border-primary bg-primary/5" : "border-border"}`}
                            data-testid={`input-price-${key}`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Base: <span className="font-medium">₹{base.toFixed(2)}</span>
                        {changed && (
                          <span className={`ml-1 font-semibold ${rev > base ? "text-red-600" : "text-green-600"}`}>
                            {rev > base ? "↑" : "↓"} {rev > base ? "+" : ""}{(rev - base).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!hasChange && (
                <p className="text-xs text-muted-foreground mt-4 text-center">
                  Enter revised prices above to see the cost impact
                </p>
              )}
            </CardContent>
          </Card>

          {/* Mix-type rate comparison */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rate Impact by Mix Type</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-semibold">Mix</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Base ₹/MT</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Revised ₹/MT</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Δ ₹/MT</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Δ %</th>
                  </tr>
                </thead>
                <tbody>
                  {baseCalc.mixRates.map((base, i) => {
                    const rev = revisedCalc.mixRates[i];
                    if (!rev) return null;
                    const delta = rev.finalLaid - base.finalLaid;
                    const deltaPct = base.finalLaid > 0 ? (delta / base.finalLaid) * 100 : 0;
                    return (
                      <tr key={base.name} className="border-t border-border/50 hover:bg-muted/20">
                        <td className="px-4 py-3 font-semibold">{base.name}</td>
                        <td className="px-4 py-3 text-right">₹{fmtR(base.finalLaid)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${hasChange ? (rev.finalLaid > base.finalLaid ? "text-red-600" : rev.finalLaid < base.finalLaid ? "text-green-600" : "") : ""}`}>
                          ₹{fmtR(rev.finalLaid)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasChange ? <DeltaBadge delta={delta} /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasChange && Math.abs(delta) > 0.01 ? (
                            <span className={delta > 0 ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                              {delta > 0 ? "+" : ""}{deltaPct.toFixed(2)}%
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Per-job impact */}
          {baseCalc.jobResults.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Job-wise Cost Impact</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5 font-semibold">Job</th>
                      <th className="text-left px-4 py-2.5 font-semibold">Contractor</th>
                      <th className="text-right px-4 py-2.5 font-semibold">MT</th>
                      <th className="text-right px-4 py-2.5 font-semibold">Base Total</th>
                      <th className="text-right px-4 py-2.5 font-semibold">Revised Total</th>
                      <th className="text-right px-4 py-2.5 font-semibold">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baseCalc.jobResults.map((baseJob, i) => {
                      const revJob = revisedCalc.jobResults[i];
                      if (!revJob) return null;
                      const delta = revJob.totalAmt - baseJob.totalAmt;
                      return (
                        <tr key={baseJob.id} className="border-t border-border/50 hover:bg-muted/20" data-testid={`row-job-${baseJob.id}`}>
                          <td className="px-4 py-3 font-mono font-medium">{baseJob.id}</td>
                          <td className="px-4 py-3 text-muted-foreground">{baseJob.contractor || "—"}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{baseJob.totalMt > 0 ? baseJob.totalMt.toFixed(1) : "—"}</td>
                          <td className="px-4 py-3 text-right">₹{fmtI(baseJob.totalAmt)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${hasChange ? (revJob.totalAmt > baseJob.totalAmt ? "text-red-600" : revJob.totalAmt < baseJob.totalAmt ? "text-green-600" : "") : ""}`}>
                            ₹{fmtI(revJob.totalAmt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hasChange ? <DeltaAmt base={baseJob.totalAmt} revised={revJob.totalAmt} /> : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Grand total */}
                    <tr className="border-t-2 border-primary/30 bg-amber-50/50 dark:bg-amber-950/20 font-bold">
                      <td className="px-4 py-3" colSpan={2}>Grand Total</td>
                      <td className="px-4 py-3 text-right">{baseCalc.grandTotalMt.toFixed(1)} MT</td>
                      <td className="px-4 py-3 text-right">₹{fmtI(baseCalc.grandTotalAmt)}</td>
                      <td className={`px-4 py-3 text-right ${hasChange ? (revisedCalc.grandTotalAmt > baseCalc.grandTotalAmt ? "text-red-600" : "text-green-600") : ""}`}>
                        ₹{fmtI(revisedCalc.grandTotalAmt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasChange ? <DeltaAmt base={baseCalc.grandTotalAmt} revised={revisedCalc.grandTotalAmt} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Save scenario */}
          <Card className="no-print">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" /> Save Scenario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="e.g. Bitumen hike — March 2026"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  className="flex-1 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-scenario-name"
                />
                <Button
                  size="sm"
                  onClick={saveScenario}
                  disabled={saveScenarioMutation.isPending || !scenarioName.trim()}
                  data-testid="btn-save-scenario"
                >
                  <Save className="w-4 h-4 mr-1" />
                  {saveScenarioMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>

              {/* Saved scenarios list */}
              {scenarios.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saved Scenarios</p>
                  {scenarios.map((sc) => {
                    let scPrices: Partial<typeof revisedPrices> = {};
                    try { scPrices = JSON.parse(sc.revisedPrices); } catch {}
                    return (
                      <div
                        key={sc.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                        data-testid={`row-scenario-${sc.id}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{sc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDate(sc.createdAt)}
                            {scPrices.bitPrice && <span className="ml-2">Bit: ₹{scPrices.bitPrice}/kg</span>}
                            {scPrices.aggRate && <span className="ml-2">Agg: ₹{scPrices.aggRate}/MT</span>}
                            {scPrices.hsdPrice && <span className="ml-2">HSD: ₹{scPrices.hsdPrice}/L</span>}
                            {scPrices.ldoRate && <span className="ml-2">LDO: ₹{scPrices.ldoRate}/L</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadScenario(sc)}
                            data-testid={`btn-load-scenario-${sc.id}`}
                          >
                            Load
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
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
