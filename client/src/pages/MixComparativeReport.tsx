import { useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Download, Printer, BarChart3 } from "lucide-react";
import type { MixEstimate } from "@shared/schema";
import { calcMixRatesAndJobs, type CalcState, type MixRate, type JobResult } from "@/lib/mixCalc";

function fmtI(v: number) { return v > 0 ? Math.round(v).toLocaleString("en-IN") : "—"; }

interface EstimateData {
  estimate: MixEstimate;
  contractor: string;
  state: CalcState;
  mixRates: MixRate[];
  jobResults: JobResult[];
  grandTotalMt: number;
  grandTotalAmt: number;
}

function parseEstimate(est: MixEstimate): EstimateData | null {
  try {
    const state: CalcState = JSON.parse(est.state);
    if (!state.mixTypes || !Array.isArray(state.mixTypes)) return null;
    const result = calcMixRatesAndJobs(state);
    return {
      estimate: est,
      contractor: est.contractor?.trim().toUpperCase() || "UNASSIGNED",
      state,
      mixRates: result.mixRates,
      jobResults: result.jobResults,
      grandTotalMt: result.grandTotalMt,
      grandTotalAmt: result.grandTotalAmt,
    };
  } catch { return null; }
}

async function exportToExcel(
  contractorRateRows: { mixName: string; rates: { contractor: string; rate: number }[] }[],
  contractors: string[],
  ledgerRows: { contractor: string; estimateName: string; jobId: string; mt: number; exPlant: number; transport: number; laying: number; finalLaid: number; totalAmt: number }[]
) {
  const XLSX = await import("xlsx");

  // Sheet 1: Rate Comparison
  const rateHeaders = ["Mix Type", ...contractors];
  const rateData = [rateHeaders, ...contractorRateRows.map(row => [
    row.mixName,
    ...contractors.map(c => {
      const r = row.rates.find(r => r.contractor === c);
      return r ? r.rate.toFixed(2) : "";
    })
  ])];

  // Sheet 2: Job Ledger
  const ledgerHeaders = ["Contractor", "Estimate", "Job", "MT", "Plant ₹/MT", "Trans ₹/MT", "Lay ₹/MT", "Total ₹/MT", "Total Amount (₹)"];
  const ledgerData = [ledgerHeaders, ...ledgerRows.map(r => [
    r.contractor, r.estimateName, r.jobId, r.mt.toFixed(1),
    r.exPlant.toFixed(2), r.transport.toFixed(2), r.laying.toFixed(2),
    r.finalLaid.toFixed(2), Math.round(r.totalAmt).toString()
  ])];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rateData), "Rate Comparison");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ledgerData), "Job Ledger");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Comparative_Rate_Statement_${date}.xlsx`);
}

export default function MixComparativeReport() {
  const { data: estimates = [], isLoading } = useQuery<MixEstimate[]>({
    queryKey: ["/api/mix-estimates"],
  });

  const data = useMemo(() => {
    const parsed = estimates.map(parseEstimate).filter(Boolean) as EstimateData[];
    return parsed;
  }, [estimates]);

  // All distinct mix type names across all estimates (preserving order of first occurrence)
  const allMixNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    data.forEach(d => d.mixRates.forEach(mr => { if (!seen.has(mr.name)) { seen.add(mr.name); names.push(mr.name); } }));
    return names;
  }, [data]);

  // Unique contractors in order (most recent first)
  const contractors = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    data.forEach(d => { if (!seen.has(d.contractor)) { seen.add(d.contractor); list.push(d.contractor); } });
    return list;
  }, [data]);

  // Rate comparison: for each mix name, get rates per contractor (latest estimate per contractor)
  // If contractor has multiple estimates, use the one with the lowest ID for its primary rates (first saved = base)
  // Actually, let's use first occurrence per contractor in `data` (already sorted by updatedAt desc)
  const contractorPrimaryData = useMemo(() => {
    const map: Record<string, EstimateData> = {};
    // data is in estimate order (most recent first for each contractor)
    [...data].reverse().forEach(d => { map[d.contractor] = d; }); // last write wins = most recent
    return map;
  }, [data]);

  // Rate table rows
  const rateRows = useMemo(() => {
    return allMixNames.map(mixName => {
      const rates = contractors.map(contractor => {
        const estData = contractorPrimaryData[contractor];
        if (!estData) return { contractor, rate: 0, exPlant: 0, transport: 0, laying: 0 };
        const mr = estData.mixRates.find(m => m.name === mixName);
        return {
          contractor,
          rate: mr?.finalLaid ?? 0,
          exPlant: mr?.exPlant ?? 0,
          transport: mr?.transport ?? 0,
          laying: mr?.laying ?? 0,
        };
      });
      const validRates = rates.filter(r => r.rate > 0).map(r => r.rate);
      const minRate = validRates.length ? Math.min(...validRates) : 0;
      const maxRate = validRates.length ? Math.max(...validRates) : 0;
      return { mixName, rates, minRate, maxRate };
    });
  }, [allMixNames, contractors, contractorPrimaryData]);

  // Job ledger: grouped by contractor
  const ledgerRows = useMemo(() => {
    type LedgerRow = {
      contractor: string;
      estimateName: string;
      jobId: string;
      mt: number;
      exPlant: number;
      transport: number;
      laying: number;
      finalLaid: number;
      totalAmt: number;
    };
    const rows: LedgerRow[] = [];
    data.forEach(d => {
      d.jobResults.forEach(job => {
        if (job.totalMt <= 0 && job.totalAmt <= 0) return;
        const mixNames = job.mixes.map(m => m.mixName).join("+");
        const totalMt = job.totalMt;
        // Weighted avg rates from mix breakdown
        let exPlantSum = 0, transSum = 0, laySum = 0, finalSum = 0;
        let mtSum = 0;
        job.mixes.forEach(m => {
          const mr = d.mixRates.find(r => r.name === m.mixName);
          if (mr && m.mt > 0) {
            exPlantSum += mr.exPlant * m.mt;
            transSum += mr.transport * m.mt;
            laySum += mr.laying * m.mt;
            finalSum += mr.finalLaid * m.mt;
            mtSum += m.mt;
          }
        });
        const wAvg = (v: number) => mtSum > 0 ? v / mtSum : 0;
        rows.push({
          contractor: d.contractor,
          estimateName: d.estimate.name,
          jobId: `${job.id}${mixNames ? ` (${mixNames})` : ""}`,
          mt: totalMt,
          exPlant: wAvg(exPlantSum),
          transport: wAvg(transSum),
          laying: wAvg(laySum),
          finalLaid: wAvg(finalSum),
          totalAmt: job.totalAmt,
        });
      });
    });
    return rows;
  }, [data]);

  // Grand totals for ledger
  const grandTotals = useMemo(() => {
    return ledgerRows.reduce(
      (s, r) => ({ mt: s.mt + r.mt, amt: s.amt + r.totalAmt }),
      { mt: 0, amt: 0 }
    );
  }, [ledgerRows]);

  // Excel export payload
  const contractorRateRowsForExport = useMemo(() =>
    rateRows.map(r => ({ mixName: r.mixName, rates: r.rates.map(rt => ({ contractor: rt.contractor, rate: rt.rate })) })),
    [rateRows]
  );

  if (isLoading) {
    return <div className="text-center py-20 text-muted-foreground">Loading estimates…</div>;
  }

  if (data.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/admin/mix-estimates">
          <Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
        <div className="text-center py-20 text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-medium">No estimates to compare</p>
          <p className="text-sm mt-1">Save at least two estimates to see a comparison.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/admin/mix-estimates">
            <Button variant="ghost" size="sm" data-testid="btn-back">
              <ChevronLeft className="w-4 h-4 mr-1" /> Estimates
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" /> Contractor Comparative Rate Statement
            </h1>
            <p className="text-xs text-muted-foreground">
              {contractors.length} contractor{contractors.length !== 1 ? "s" : ""} · {data.length} estimate{data.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToExcel(contractorRateRowsForExport, contractors, ledgerRows)}
            data-testid="btn-export-excel"
          >
            <Download className="w-4 h-4 mr-1" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print">
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-2">
        <h2 className="text-lg font-bold text-center">Contractor Comparative Rate Statement</h2>
        <p className="text-sm text-center text-gray-500">{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
      </div>

      {/* Section 1: Rate Comparison */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base">Section 1 — Rate Comparison (Final Laid ₹/MT)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {contractors.length < 2 ? (
            <div className="text-center py-6 text-sm text-muted-foreground px-4">
              Only one contractor found. Add estimates from more contractors to compare rates.
            </div>
          ) : (
            <table className="w-full text-sm border-collapse" data-testid="table-rate-comparison">
              <thead>
                <tr className="bg-amber-50 dark:bg-amber-950/30 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-semibold border-b border-border">Mix Type</th>
                  {contractors.map(c => (
                    <th key={c} className="text-right px-4 py-2.5 font-semibold border-b border-border whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rateRows.map(({ mixName, rates, minRate, maxRate }) => (
                  <tr key={mixName} className="border-t border-border/50 hover:bg-muted/10" data-testid={`row-rate-${mixName}`}>
                    <td className="px-4 py-2.5 font-semibold">{mixName}</td>
                    {rates.map(({ contractor, rate }) => {
                      const isMin = rate > 0 && rate === minRate && minRate !== maxRate;
                      const isMax = rate > 0 && rate === maxRate && minRate !== maxRate;
                      return (
                        <td
                          key={contractor}
                          className={`px-4 py-2.5 text-right font-mono font-medium ${
                            isMin ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" :
                            isMax ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400" : ""
                          }`}
                          data-testid={`cell-rate-${mixName}-${contractor}`}
                        >
                          {rate > 0 ? (
                            <>
                              ₹{rate.toFixed(2)}
                              {isMin && <span className="ml-1 text-xs">(L)</span>}
                              {isMax && <span className="ml-1 text-xs">(H)</span>}
                            </>
                          ) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Ex-Plant breakdown row */}
                {rateRows.length > 0 && (
                  <>
                    <tr className="border-t-2 border-border bg-muted/20 text-xs text-muted-foreground">
                      <td className="px-4 py-2 italic" colSpan={contractors.length + 1}>Rate breakdown (for primary mix type — {rateRows[0]?.mixName})</td>
                    </tr>
                    {["Ex-Plant", "Transport", "Laying"].map((label, li) => (
                      <tr key={label} className="border-t border-border/30 text-xs text-muted-foreground">
                        <td className="px-4 py-1.5 pl-6">{label} ₹/MT</td>
                        {contractors.map(c => {
                          const estData = contractorPrimaryData[c];
                          const mr = estData?.mixRates[0];
                          const val = li === 0 ? mr?.exPlant : li === 1 ? mr?.transport : mr?.laying;
                          return (
                            <td key={c} className="px-4 py-1.5 text-right font-mono">
                              {val && val > 0 ? `₹${val.toFixed(2)}` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Job Ledger */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base">Section 2 — Job Ledger</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {ledgerRows.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground px-4">No jobs found in any estimate.</div>
          ) : (
            <table className="w-full text-sm border-collapse" data-testid="table-job-ledger">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-semibold">Contractor</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Estimate / Job</th>
                  <th className="text-right px-4 py-2.5 font-semibold">MT</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Plant ₹/MT</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Trans ₹/MT</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Lay ₹/MT</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Total ₹/MT</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {contractors.map(contractor => {
                  const rows = ledgerRows.filter(r => r.contractor === contractor);
                  if (rows.length === 0) return null;
                  const subMt = rows.reduce((s, r) => s + r.mt, 0);
                  const subAmt = rows.reduce((s, r) => s + r.totalAmt, 0);
                  return (
                    <Fragment key={`grp-${contractor}`}>
                      {rows.map((row, ri) => (
                        <tr
                          key={`${contractor}-${ri}`}
                          className="border-t border-border/50 hover:bg-muted/10"
                          data-testid={`row-job-${contractor}-${ri}`}
                        >
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {ri === 0 ? <span className="font-semibold text-foreground">{contractor}</span> : ""}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-foreground">{row.jobId}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-xs">{row.estimateName}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">{row.mt > 0 ? row.mt.toFixed(1) : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{row.exPlant > 0 ? `₹${row.exPlant.toFixed(0)}` : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{row.transport > 0 ? `₹${row.transport.toFixed(0)}` : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{row.laying > 0 ? `₹${row.laying.toFixed(0)}` : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium">{row.finalLaid > 0 ? `₹${row.finalLaid.toFixed(0)}` : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{row.totalAmt > 0 ? `₹${fmtI(row.totalAmt)}` : "—"}</td>
                        </tr>
                      ))}
                      {/* Contractor subtotal */}
                      <tr className="border-t border-primary/20 bg-amber-50/50 dark:bg-amber-950/20">
                        <td className="px-4 py-2 font-bold text-xs uppercase text-primary" colSpan={2}>
                          {contractor} Subtotal
                        </td>
                        <td className="px-4 py-2 text-right font-bold font-mono">{subMt.toFixed(1)}</td>
                        <td colSpan={4} />
                        <td className="px-4 py-2 text-right font-bold">₹{fmtI(subAmt)}</td>
                      </tr>
                    </Fragment>
                  );
                })}
                {/* Grand total */}
                <tr className="border-t-2 border-primary/40 bg-amber-100/60 dark:bg-amber-950/40 font-bold">
                  <td className="px-4 py-3 text-base" colSpan={2}>Grand Total</td>
                  <td className="px-4 py-3 text-right font-mono">{grandTotals.mt.toFixed(1)} MT</td>
                  <td colSpan={4} />
                  <td className="px-4 py-3 text-right text-base">₹{fmtI(grandTotals.amt)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
