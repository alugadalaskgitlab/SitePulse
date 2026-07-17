import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { ChevronLeft, Boxes, AlertTriangle, Calendar, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { format, subDays, startOfMonth } from "date-fns";

type Row = {
  site: string; material: string; matched: boolean; uom: string;
  ordered: number; delivered: number; consumed: number; toSupply: number; lying: number;
  lastDeliveryDate: string | null;
};

const n = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DATE_PRESETS = [
  { label: "All time",   dateFrom: "",                                                  dateTo: "" },
  { label: "Last 30 d",  dateFrom: format(subDays(new Date(), 30), "yyyy-MM-dd"),       dateTo: "" },
  { label: "This month", dateFrom: format(startOfMonth(new Date()), "yyyy-MM-dd"),      dateTo: "" },
];

export default function SiteMaterialStock() {
  const search  = useSearch();
  const backHref = new URLSearchParams(search).get("returnTo") || "/site/hub";

  const [preset, setPreset] = useState(0);
  const { dateFrom, dateTo } = DATE_PRESETS[preset];

  const qp = [dateFrom && `dateFrom=${dateFrom}`, dateTo && `dateTo=${dateTo}`]
    .filter(Boolean).join("&");

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["/api/site-material-stock", dateFrom, dateTo],
    queryFn: () => fetch(`/api/site-material-stock${qp ? `?${qp}` : ""}`).then(r => r.json()),
  });

  const bySite = rows.reduce<Record<string, Row[]>>((acc, r) => {
    (acc[r.site] ??= []).push(r); return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Boxes className="w-5 h-5 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Site Material Stock</h1>
            <p className="text-sm text-muted-foreground">Ordered · Delivered · Consumed · Lying at site (MT)</p>
          </div>
        </div>

        {/* Period filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground font-medium">Period:</span>
          {DATE_PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPreset(i)}
              className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                preset === i
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"
              }`}
              data-testid={`filter-preset-${i}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No site material movement recorded in this period.
          </div>
        ) : (
          Object.entries(bySite).map(([site, items]) => (
            <Card key={site} data-testid={`site-card-${site}`}>
              <CardContent className="p-0">

                {/* Site header + delivery log link */}
                <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
                  <span className="font-semibold text-sm">{site}</span>
                  <Link href={`/site/material-trips?site=${encodeURIComponent(site)}&returnTo=${encodeURIComponent("/site/material-stock")}`}>
                    <a className="text-xs text-muted-foreground hover:text-emerald-700 flex items-center gap-1 transition-colors"
                       data-testid={`link-trips-${site}`}>
                      View delivery log <ExternalLink className="w-3 h-3" />
                    </a>
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="text-left px-4 py-2">Material</th>
                        <th className="text-right px-3 py-2">Ordered</th>
                        <th className="text-right px-3 py-2">Delivered</th>
                        <th className="text-right px-3 py-2">To Supply</th>
                        <th className="text-right px-3 py-2">
                          <span className="inline-flex items-center gap-1">
                            Consumed
                            <span
                              title="Theoretical — calculated from work done × material recipe norm. Not an actual usage log."
                              className="cursor-help text-blue-400 hover:text-blue-600 transition-colors"
                            >
                              <Info className="w-3 h-3" />
                            </span>
                          </span>
                        </th>
                        <th className="text-right px-3 py-2">Lying at Site</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r, i) => (
                        <tr key={i} className="border-b border-muted/40 hover:bg-muted/10 transition-colors"
                            data-testid={`row-${site}-${r.material}`}>
                          <td className="px-4 py-2.5 font-medium">
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                {r.material}
                                {!r.matched && (
                                  <span
                                    title="Name does not match any Materials Master entry — check PI description or recipe spelling"
                                    className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700"
                                  >
                                    <AlertTriangle className="w-3 h-3" /> unmatched
                                  </span>
                                )}
                              </span>
                              {r.lastDeliveryDate && (
                                <span className="text-[10px] text-muted-foreground">
                                  Last delivery: {format(new Date(r.lastDeliveryDate + "T00:00:00"), "d MMM yyyy")}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-500">{n(r.ordered)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-green-700">{n(r.delivered)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-blue-700">{n(r.toSupply)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-orange-700">{n(r.consumed)}</td>
                          <td className={`px-3 py-2.5 text-right font-mono font-bold ${r.lying < 0 ? "text-red-600" : ""}`}>
                            {n(r.lying)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </CardContent>
            </Card>
          ))
        )}

        {/* Footer notes */}
        <div className="space-y-2 px-1">
          <div className="flex items-start gap-2.5 text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-blue-800">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              <strong>About "Consumed":</strong> This is a <em>theoretical</em> figure derived from
              work quantities in DPRs multiplied by the material recipe norm for each BOQ activity.
              It is <strong>not</strong> an actual material usage log — no physical measurement is taken.
              Discrepancies between Consumed and Delivered are expected and normal.
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            All quantities in MT. <span className="text-red-600 font-medium">Negative "Lying at Site"</span> means
            the consumption estimate exceeds recorded deliveries — check that all delivery challans are being logged.
          </p>
        </div>

      </div>
    </div>
  );
}
