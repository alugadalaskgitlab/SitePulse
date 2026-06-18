import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, FileSpreadsheet, Loader2, Upload, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { BoqProject, BoqItemWithCategory } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-red-50 text-red-600 border-red-200",
};

export default function BoqProjectDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const projectId = parseInt(params.id);

  const { data: project, isLoading: projLoading } = useQuery<BoqProject>({
    queryKey: ["/api/boq/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load project");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<BoqItemWithCategory[]>({
    queryKey: ["/api/boq/projects", projectId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load items");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const isLoading = projLoading || itemsLoading;

  // Group items by category
  const grouped = items.reduce<Record<string, BoqItemWithCategory[]>>((acc, item) => {
    const cat = item.categoryName ?? "Uncategorised";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const totalAmount = items.reduce((s, i) => s + (i.clientAmount ?? 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading project…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-slate-600">Project not found.</p>
        <Button variant="outline" onClick={() => navigate("/work-program")} data-testid="button-back-notfound">
          ← Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/work-program")}
          className="mt-0.5 text-muted-foreground h-8 w-8 flex-shrink-0" data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 truncate">{project.name}</h1>
            <Badge variant="outline"
              className={`text-xs flex-shrink-0 ${STATUS_COLORS[project.status] ?? STATUS_COLORS.draft}`}>
              {project.status.toUpperCase()}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
            {project.contractNo && <span>Contract: {project.contractNo}</span>}
            {project.client && <span>· {project.client}</span>}
            {project.contractor && <span>· {project.contractor}</span>}
          </div>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "BOQ Items", value: String(items.length), icon: ListOrdered },
          { label: "Categories", value: String(Object.keys(grouped).length), icon: FileSpreadsheet },
          { label: "Road Length", value: project.roadLengthKm != null ? `${project.roadLengthKm} km` : "—", icon: FileSpreadsheet },
          { label: "Total BOQ Value", value: totalAmount > 0 ? `₹${(totalAmount / 1e7).toFixed(2)} Cr` : "—", icon: FileSpreadsheet },
        ].map(({ label, value }) => (
          <Card key={label} className="border-slate-200">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Items table */}
      {items.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileSpreadsheet className="w-14 h-14 text-slate-200 mx-auto" />
          <p className="font-semibold text-slate-600">No BOQ items yet</p>
          <p className="text-sm text-muted-foreground">Go back and use "Import BOQ" on the project card to import from Excel</p>
          <Button variant="outline" onClick={() => navigate("/work-program")} data-testid="button-go-import">
            <Upload className="w-4 h-4 mr-1.5" /> Import BOQ
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, catItems]) => (
            <Card key={cat} className="border-slate-200 overflow-hidden">
              <div className="bg-slate-800 px-4 py-2.5 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{cat}</p>
                <span className="text-xs text-slate-400">{catItems.length} items</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-20">Code</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-16">Unit</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-24">BOQ Qty</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-24">Rate (₹)</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-28">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catItems.map((item, i) => (
                      <tr key={item.id}
                        className={`border-b border-slate-100 last:border-0 ${i % 2 === 1 ? "bg-slate-50/50" : ""}`}
                        data-testid={`row-boqitem-${item.id}`}
                      >
                        <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{item.itemCode ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{item.description}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{item.unit}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">
                          {item.boqQty.toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">
                          {item.clientRate != null ? item.clientRate.toLocaleString("en-IN") : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-800">
                          {item.clientAmount != null
                            ? item.clientAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          {/* Grand total */}
          {totalAmount > 0 && (
            <div className="flex justify-end">
              <div className="bg-slate-800 rounded-lg px-6 py-3 text-white text-sm flex items-center gap-4">
                <span className="text-slate-400">Total Contract Value</span>
                <span className="font-bold text-lg">
                  ₹{totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
