import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { ChevronLeft, Boxes, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Row = {
  site: string; material: string; matched: boolean; uom: string;
  ordered: number; delivered: number; consumed: number; toSupply: number; lying: number;
};

const n = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SiteMaterialStock() {
  const search = useSearch();
  const backHref = new URLSearchParams(search).get("returnTo") || "/site/hub";
  const { data: rows = [], isLoading } = useQuery<Row[]>({ queryKey: ["/api/site-material-stock"] });

  const bySite = rows.reduce<Record<string, Row[]>>((acc, r) => {
    (acc[r.site] ??= []).push(r); return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 space-y-5">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <Boxes className="w-5 h-5 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Site Material Stock</h1>
            <p className="text-sm text-muted-foreground">Ordered · Delivered · Consumed · Lying at site (in MT)</p>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No site material movement yet.</div>
        ) : (
          Object.entries(bySite).map(([site, items]) => (
            <Card key={site} data-testid={`site-card-${site}`}>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b bg-muted/40 font-semibold text-sm">{site}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="text-left px-4 py-2">Material</th>
                        <th className="text-right px-3 py-2">Ordered</th>
                        <th className="text-right px-3 py-2">Delivered</th>
                        <th className="text-right px-3 py-2">To Supply</th>
                        <th className="text-right px-3 py-2">Consumed</th>
                        <th className="text-right px-3 py-2">Lying at Site</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r, i) => (
                        <tr key={i} className="border-b border-muted/40" data-testid={`row-${site}-${r.material}`}>
                          <td className="px-4 py-2 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              {r.material}
                              {!r.matched && (
                                <span title="Material not found in master — check spelling/recipe"
                                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700">
                                  <AlertTriangle className="w-3 h-3" /> unmatched
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-500">{n(r.ordered)}</td>
                          <td className="px-3 py-2 text-right font-mono text-green-700">{n(r.delivered)}</td>
                          <td className="px-3 py-2 text-right font-mono text-blue-700">{n(r.toSupply)}</td>
                          <td className="px-3 py-2 text-right font-mono text-orange-700">{n(r.consumed)}</td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${r.lying < 0 ? "text-red-600" : ""}`}>
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
        <p className="text-xs text-muted-foreground px-1">
          All quantities in MT. <span className="text-red-600 font-medium">Negative "Lying at Site"</span> means
          consumption exceeds recorded deliveries — check that deliveries are being logged.
        </p>
      </div>
    </div>
  );
}
