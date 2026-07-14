import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ChevronLeft, Wrench, CheckCircle2, Sparkles } from "lucide-react";
import { classifyItem, detectAnomalies, plantToClear } from "@/lib/resourceReview";
import { shortItemName } from "@/lib/itemName";

type RecipeItem = {
  id: number; itemCode: string | null; description: string; unit: string;
  categoryName?: string | null; workCategory?: string | null; sortOrder?: number | null;
  layerConfig?: { layerType?: string } | null;
  equipment: any[]; labour: any[]; materials: any[];
};

export default function ResourceReview() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id);
  const { toast } = useToast();
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: items = [], isLoading } = useQuery<RecipeItem[]>({
    queryKey: ["/api/boq/projects", projectId, "resource-review"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/resource-review`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const rows = useMemo(() => items.map((it) => {
    const ri = { ...it, layerType: it.layerConfig?.layerType ?? (it as any).layerType };
    return { it, cls: classifyItem(ri), flags: detectAnomalies(ri), clear: plantToClear(ri) };
  }).sort((a, b) => (a.it.sortOrder ?? 0) - (b.it.sortOrder ?? 0)), [items]);

  const flagged = rows.filter((r) => r.flags.length);
  const high = rows.filter((r) => r.flags.some((f) => f.level === "high"));
  const cleanable = rows.filter((r) => r.clear.length);
  const shown = onlyFlagged ? flagged : rows;

  const clearOne = async (row: typeof rows[number]) => {
    const keep = row.it.equipment.filter((e: any) => !row.clear.includes(e.equipmentName));
    await apiRequest("PUT", `/api/boq/items/${row.it.id}/equipment`, { rows: keep });
    queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "resource-review"] });
    toast({ title: "Cleaned", description: `Removed ${row.clear.length} wrong machine(s).` });
  };

  const autoCleanAll = async () => {
    setBusy(true);
    try {
      for (const r of cleanable) {
        const keep = r.it.equipment.filter((e: any) => !r.clear.includes(e.equipmentName));
        await apiRequest("PUT", `/api/boq/items/${r.it.id}/equipment`, { rows: keep });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "resource-review"] });
      toast({ title: `Auto-cleaned ${cleanable.length} items` });
    } catch {
      toast({ title: "Auto-clean failed", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const clsColor: Record<string, string> = {
    pavement: "bg-amber-100 text-amber-800", concrete: "bg-slate-200 text-slate-800",
    earthwork: "bg-orange-100 text-orange-800", structural: "bg-blue-100 text-blue-800",
    counted: "bg-emerald-100 text-emerald-800", lumpsum: "bg-violet-100 text-violet-800",
    spray: "bg-teal-100 text-teal-800", other: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4" data-testid="resource-review-page">
      <Link href={`/work-program/${projectId}`}>
        <a className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700"><ChevronLeft className="w-4 h-4" /> Back to BOQ</a>
      </Link>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="w-6 h-6 text-blue-600" /> Resource Review</h1>
          <p className="text-sm text-slate-500">Auto-flagged mis-mapped equipment & labour. Fix only what's flagged.</p>
        </div>
        <Button onClick={autoCleanAll} disabled={busy || cleanable.length === 0} data-testid="button-auto-clean-all" className="bg-blue-600 hover:bg-blue-700">
          <Sparkles className="w-4 h-4 mr-1.5" /> Auto-clean {cleanable.length} items
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total items", value: rows.length },
          { label: "Flagged", value: flagged.length },
          { label: "High severity", value: high.length },
          { label: "Auto-cleanable", value: cleanable.length },
        ].map((t) => (
          <Card key={t.label}><CardContent className="p-3">
            <p className="text-xs text-slate-500">{t.label}</p>
            <p className="text-2xl font-bold">{t.value}</p>
          </CardContent></Card>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} data-testid="checkbox-only-flagged" />
        Show only flagged items
      </label>

      {isLoading ? <p className="text-sm text-slate-500">Loading…</p> : (
        <div className="space-y-2">
          {shown.map((r) => (
            <Card key={r.it.id} data-testid={`review-row-${r.it.id}`}>
              <CardContent className="p-3 flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.it.itemCode && <span className="font-mono text-xs text-slate-500">{r.it.itemCode}</span>}
                    <span className="font-semibold text-sm" title={r.it.description}>{shortItemName(r.it.description)}</span>
                    <Badge className={`text-[10px] ${clsColor[r.cls]}`}>{r.cls}</Badge>
                    <span className="text-[11px] text-slate-400">{r.it.unit} · {r.it.equipment.length} eq · {r.it.labour.length} lab · {r.it.materials.length} mat</span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {r.flags.length === 0 && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Looks correct</span>}
                    {r.flags.map((f, i) => (
                      <div key={i} className={`text-xs flex items-center gap-1 ${f.level === "high" ? "text-red-600" : "text-amber-600"}`}>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {f.message}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {r.clear.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => clearOne(r)} data-testid={`button-clear-${r.it.id}`}>
                      Clear {r.clear.length} machine{r.clear.length > 1 ? "s" : ""}
                    </Button>
                  )}
                  <Link href={`/work-program/${projectId}?recipeItem=${r.it.id}`}>
                    <a><Button size="sm" variant="ghost" data-testid={`button-open-recipe-${r.it.id}`}>Open recipe</Button></a>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
          {shown.length === 0 && <p className="text-sm text-emerald-600">No flagged items 🎉</p>}
        </div>
      )}
    </div>
  );
}
