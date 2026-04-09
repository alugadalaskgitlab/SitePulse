import { useMemo, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Download, Printer, BarChart3 } from "lucide-react";
import type { MixEstimate } from "@shared/schema";
import { buildMixComparisonData, type ComparisonData } from "@/lib/mixComparisonData";
import { readEstimatorRole } from "@/lib/estimatorAuth";

function fmt0(v: number) { return v > 0 ? Math.round(v).toLocaleString("en-IN") : "—"; }
function fmt2(v: number) { return v > 0 ? v.toFixed(2) : "—"; }

async function doExport(data: ComparisonData) {
  const { allMixNames, contractors, rateMap, ledgerRows } = data;
  const XLSX = await import("xlsx");

  const rateHeaders = ["Mix Type", ...contractors.flatMap((c) => [`${c} ₹/MT`, `${c} ₹/CUM`])];
  const rateRows = allMixNames.map((mixName) => [
    mixName,
    ...contractors.flatMap((c) => {
      const r = rateMap[c]?.rates.find((x) => x.name === mixName);
      return r ? [r.finalLaid.toFixed(2), r.finalLaidPerCum.toFixed(2)] : ["", ""];
    }),
  ]);

  const ledgerHeaders = [
    "Contractor", "Job", "Mix Type", "Area (Sqm)",
    "MT", "CUM",
    "Plant ₹/MT", "Plant ₹/CUM",
    "Trans ₹/MT", "Trans ₹/CUM",
    "Lay ₹/MT", "Lay ₹/CUM",
    "Prime ₹", "Tack ₹",
    "Total ₹/MT", "Total ₹/CUM",
    "Amount (₹)",
  ];
  const ledgerData = ledgerRows.map((r) => [
    r.contractor, r.jobId, r.mixType,
    r.areaSqm > 0 ? r.areaSqm.toFixed(1) : "",
    r.mt > 0 ? r.mt.toFixed(1) : "",
    r.cum > 0 ? r.cum.toFixed(2) : "",
    r.plantPerMt > 0 ? r.plantPerMt.toFixed(2) : "",
    r.plantPerCum > 0 ? r.plantPerCum.toFixed(2) : "",
    r.transPerMt > 0 ? r.transPerMt.toFixed(2) : "",
    r.transPerCum > 0 ? r.transPerCum.toFixed(2) : "",
    r.layPerMt > 0 ? r.layPerMt.toFixed(2) : "",
    r.layPerCum > 0 ? r.layPerCum.toFixed(2) : "",
    r.primeAmt > 0 ? Math.round(r.primeAmt).toString() : "",
    r.tackAmt > 0 ? Math.round(r.tackAmt).toString() : "",
    r.totalPerMt > 0 ? r.totalPerMt.toFixed(2) : "",
    r.totalPerCum > 0 ? r.totalPerCum.toFixed(2) : "",
    r.totalAmt > 0 ? Math.round(r.totalAmt).toString() : "",
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([rateHeaders, ...rateRows]), "Rate Comparison");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ledgerHeaders, ...ledgerData]), "Job Ledger");
  XLSX.writeFile(wb, `Comparative_Rate_Statement_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

interface ContentProps {
  data: ComparisonData;
  printable?: boolean;
}

export function MixComparisonContent({ data, printable = false }: ContentProps) {
  const { contractors, allMixNames, rateMap, ledgerRows } = data;

  const grandTotals = useMemo(
    () => ledgerRows.reduce((s, r) => ({ mt: s.mt + r.mt, cum: s.cum + r.cum, amt: s.amt + r.totalAmt }), { mt: 0, cum: 0, amt: 0 }),
    [ledgerRows]
  );

  return (
    <div className="space-y-6">
      <div className={`flex items-center gap-2 ${printable ? "no-print" : ""}`}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => doExport(data)}
          data-testid="btn-export-excel"
        >
          <Download className="w-4 h-4 mr-1" /> Export Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="btn-print">
          <Printer className="w-4 h-4 mr-1" /> Print
        </Button>
        {printable && (
          <span className="text-xs text-muted-foreground ml-2">
            {contractors.length} contractor{contractors.length !== 1 ? "s" : ""} · {ledgerRows.length} job{ledgerRows.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Section 1: Rate Comparison */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base">Section 1 — Rate Comparison (Final Laid ₹/MT & ₹/CUM)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {contractors.length < 2 ? (
            <p className="text-center py-6 text-sm text-muted-foreground px-4">
              Rate comparison requires at least two contractors.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse" data-testid="table-rate-comparison">
              <thead>
                <tr className="bg-amber-50 dark:bg-amber-950/30 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-semibold border-b border-border">Mix Type</th>
                  {contractors.map((c) => (
                    <th key={c} className="text-right px-4 py-2.5 font-semibold border-b border-border whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allMixNames.map((mixName) => {
                  const cells = contractors.map((c) => {
                    const r = rateMap[c]?.rates.find((x) => x.name === mixName);
                    return { contractor: c, rate: r?.finalLaid ?? 0, rateCum: r?.finalLaidPerCum ?? 0 };
                  });
                  const validRates = cells.filter((x) => x.rate > 0).map((x) => x.rate);
                  const minRate = validRates.length ? Math.min(...validRates) : 0;
                  const maxRate = validRates.length ? Math.max(...validRates) : 0;
                  const spread = maxRate > minRate;

                  return (
                    <tr key={mixName} className="border-t border-border/50 hover:bg-muted/10" data-testid={`row-rate-${mixName}`}>
                      <td className="px-4 py-2.5 font-semibold">{mixName}</td>
                      {cells.map(({ contractor, rate, rateCum }) => {
                        const isMin = spread && rate > 0 && rate === minRate;
                        const isMax = spread && rate > 0 && rate === maxRate;
                        return (
                          <td
                            key={contractor}
                            className={`px-4 py-2.5 text-right font-mono font-medium ${
                              isMin
                                ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                                : isMax
                                ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                                : ""
                            }`}
                            data-testid={`cell-rate-${mixName}-${contractor}`}
                          >
                            {rate > 0 ? (
                              <>
                                <span className="block">₹{rate.toFixed(2)} /MT{isMin && <span className="ml-1 text-xs">(L)</span>}{isMax && <span className="ml-1 text-xs">(H)</span>}</span>
                                <span className="block">₹{rateCum.toFixed(2)} /CUM</span>
                              </>
                            ) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
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
            <p className="text-center py-6 text-sm text-muted-foreground px-4">No jobs found in any estimate.</p>
          ) : (
            <table className="w-full text-sm border-collapse" data-testid="table-job-ledger">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-semibold">Contractor</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Job</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Mix Type</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Area (Sqm)</th>
                  <th className="text-right px-4 py-2.5 font-semibold">MT · CUM</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Plant /MT · /CUM</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Trans /MT · /CUM</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Lay /MT · /CUM</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Prime ₹</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Tack ₹</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Total /MT · /CUM</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((contractor) => {
                  const rows = ledgerRows.filter((r) => r.contractor === contractor);
                  if (rows.length === 0) return null;
                  const subMt = rows.reduce((s, r) => s + r.mt, 0);
                  const subCum = rows.reduce((s, r) => s + r.cum, 0);
                  const subAmt = rows.reduce((s, r) => s + r.totalAmt, 0);
                  return (
                    <Fragment key={`grp-${contractor}`}>
                      {rows.map((row, ri) => (
                        <tr
                          key={`${contractor}-${row.estimateName}-${row.jobId}-${ri}`}
                          className="border-t border-border/50 hover:bg-muted/10"
                          data-testid={`row-job-${contractor}-${ri}`}
                        >
                          <td className="px-4 py-2.5">
                            {ri === 0 ? <span className="font-semibold">{contractor}</span> : ""}
                          </td>
                          <td className="px-4 py-2.5 font-mono font-medium text-sm">{row.jobId}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">{row.mixType}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{row.areaSqm > 0 ? row.areaSqm.toFixed(1) : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono">
                            <span className="block">{row.mt > 0 ? `${row.mt.toFixed(1)} MT` : "—"}</span>
                            <span className="block">{row.cum > 0 ? `${row.cum.toFixed(2)} CUM` : "—"}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                            <span className="block">{fmt2(row.plantPerMt)} /MT</span>
                            <span className="block">{fmt2(row.plantPerCum)} /CUM</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                            <span className="block">{fmt2(row.transPerMt)} /MT</span>
                            <span className="block">{fmt2(row.transPerCum)} /CUM</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                            <span className="block">{fmt2(row.layPerMt)} /MT</span>
                            <span className="block">{fmt2(row.layPerCum)} /CUM</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{row.primeAmt > 0 ? `₹${fmt0(row.primeAmt)}` : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{row.tackAmt > 0 ? `₹${fmt0(row.tackAmt)}` : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium">
                            <span className="block">{fmt2(row.totalPerMt)} /MT</span>
                            <span className="block">{fmt2(row.totalPerCum)} /CUM</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold">₹{fmt0(row.totalAmt)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-primary/20 bg-amber-50/50 dark:bg-amber-950/20">
                        <td className="px-4 py-2 font-bold text-xs uppercase text-primary" colSpan={5}>
                          {contractor} Subtotal
                        </td>
                        <td className="px-4 py-2 text-right font-bold font-mono">
                          <span className="block">{subMt.toFixed(1)} MT</span>
                          <span className="block">{subCum.toFixed(2)} CUM</span>
                        </td>
                        <td colSpan={5} />
                        <td className="px-4 py-2 text-right font-bold">₹{fmt0(subAmt)}</td>
                      </tr>
                    </Fragment>
                  );
                })}
                <tr className="border-t-2 border-primary/40 bg-amber-100/60 dark:bg-amber-950/40 font-bold">
                  <td className="px-4 py-3 text-base" colSpan={5}>Grand Total</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className="block">{grandTotals.mt.toFixed(1)} MT</span>
                    <span className="block">{grandTotals.cum.toFixed(2)} CUM</span>
                  </td>
                  <td colSpan={5} />
                  <td className="px-4 py-3 text-right text-base">₹{fmt0(grandTotals.amt)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MixComparativeReport() {
  useEffect(() => {
    const r = readEstimatorRole();
    if (!r) {
      window.location.href = "/estimator-login?returnTo=" + encodeURIComponent(window.location.pathname + window.location.search);
    }
  }, []);

  const { data: estimates = [], isLoading } = useQuery<MixEstimate[]>({
    queryKey: ["/api/mix-estimates"],
  });

  const comparisonData = useMemo(() => buildMixComparisonData(estimates), [estimates]);

  if (isLoading) {
    return <div className="text-center py-20 text-muted-foreground">Loading estimates…</div>;
  }

  if (estimates.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <Link href="/admin/mix-estimates">
          <Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
        <div className="text-center py-20 text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-medium">No estimates to compare</p>
          <p className="text-sm mt-1">Save estimates in the Mix Calculator to see a comparison here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3 no-print">
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
            {comparisonData.contractors.length} contractor{comparisonData.contractors.length !== 1 ? "s" : ""} · {estimates.length} estimate{estimates.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <div className="hidden print:block mb-2 text-center">
        <h2 className="text-lg font-bold">Contractor Comparative Rate Statement</h2>
        <p className="text-sm text-gray-500">{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
      </div>
      <MixComparisonContent data={comparisonData} printable />
    </div>
  );
}
