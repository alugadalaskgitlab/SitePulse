import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BookOpen, ChevronRight, Search, Loader2, RefreshCw,
  Wrench, Users, Package, BarChart3, ChevronDown, ChevronUp,
  Database, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SnlSource {
  id: number;
  code: string;
  name: string;
  authority: string;
  year: number;
  description: string | null;
  isActive: boolean;
  itemCount: number;
}

interface SnlSearchResult {
  id: number;
  itemCode: string;
  shortLabel: string;
  description: string;
  unit: string;
  workCategory: string;
  isMixSpecific: boolean;
  hasGradingVariants: boolean;
  sourceName: string;
  sourceCode: string;
  shiftOutput: number | null;
  outputUnit: string | null;
}

interface SnlItemFull {
  id: number;
  sourceId: number;
  itemCode: string;
  shortLabel: string;
  description: string;
  unit: string;
  workCategory: string;
  chapterNo: string | null;
  isMixSpecific: boolean;
  hasGradingVariants: boolean;
  source: { code: string; name: string; authority: string; year: number };
  productivity: Array<{
    id: number;
    projectCategory: string;
    shiftOutput: number;
    outputUnit: string;
    workingHoursPerShift: number | null;
    basis: string | null;
  }>;
  equipment: Array<{
    id: number;
    projectCategory: string;
    sortOrder: number;
    equipmentType: string;
    equipmentSpec: string | null;
    purpose: string | null;
    unit: string;
    quantityPerShift: number;
    derivedPerUnit: number | null;
    formulaType: string;
    formulaExpr: string | null;
    notes: string | null;
  }>;
  labour: Array<{
    id: number;
    projectCategory: string;
    sortOrder: number;
    designation: string;
    skillTier: string;
    unit: string;
    quantityPerShift: number;
    derivedPerUnit: number | null;
  }>;
  materials: Array<{
    id: number;
    gradingVariant: string | null;
    sortOrder: number;
    materialName: string;
    materialCategory: string;
    unit: string;
    derivedPerUnit: number;
    isDesignSpecific: boolean;
    notes: string | null;
  }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  EARTHWORK: "bg-orange-100 text-orange-700 border-orange-200",
  GRANULAR: "bg-amber-100 text-amber-700 border-amber-200",
  BITUMINOUS: "bg-purple-100 text-purple-700 border-purple-200",
  CONCRETE: "bg-blue-100 text-blue-700 border-blue-200",
  DRAINAGE: "bg-teal-100 text-teal-700 border-teal-200",
  BRIDGE: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function catBadge(cat: string) {
  const cls = CATEGORY_COLORS[cat] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>{cat}</span>;
}

function fmtNum(n: number | null | undefined, d = 3) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: d });
}

// ─── Item Detail Panel ───────────────────────────────────────────────────────

function ItemDetailPanel({ itemId }: { itemId: number }) {
  const [catFilter, setCatFilter] = useState<string>("MEDIUM");
  const [gradingFilter, setGradingFilter] = useState<string>("");

  const { data: item, isLoading } = useQuery<SnlItemFull>({
    queryKey: ["/api/snl/items", itemId],
    queryFn: async () => {
      const res = await fetch(`/api/snl/items/${itemId}`, { credentials: "include" });
      return res.ok ? res.json() : Promise.reject("Not found");
    },
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</div>;
  if (!item) return <div className="py-12 text-center text-muted-foreground">Item not found.</div>;

  const cats = Array.from(new Set([...item.productivity.map(p => p.projectCategory), ...item.equipment.map(e => e.projectCategory), ...item.labour.map(l => l.projectCategory)]));
  const gradings = Array.from(new Set(item.materials.map(m => m.gradingVariant ?? "")));

  const prod = item.productivity.filter(p => p.projectCategory === catFilter || p.projectCategory === "ALL");
  const equip = item.equipment.filter(e => e.projectCategory === catFilter || e.projectCategory === "ALL").sort((a, b) => a.sortOrder - b.sortOrder);
  const labour = item.labour.filter(l => l.projectCategory === catFilter || l.projectCategory === "ALL").sort((a, b) => a.sortOrder - b.sortOrder);
  const mats = item.materials.filter(m => !gradingFilter || (m.gradingVariant ?? "") === gradingFilter).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-semibold text-teal-700">{item.itemCode}</span>
            {catBadge(item.workCategory)}
            {item.isMixSpecific && <Badge variant="outline" className="text-[9px] h-4 px-1 border-purple-300 text-purple-700">Mix-specific</Badge>}
            {item.hasGradingVariants && <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-300 text-amber-700">Grading variants</Badge>}
          </div>
          <p className="text-sm font-medium mt-0.5">{item.description}</p>
          <p className="text-[11px] text-muted-foreground">Unit: <span className="font-medium">{item.unit}</span> · Source: {item.source.code} ({item.source.year}) · {item.source.authority}</p>
        </div>
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {cats.filter(c => c !== "ALL").length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Category:</span>
              {cats.filter(c => c !== "ALL").map(c => (
                <button key={c} onClick={() => setCatFilter(c)} className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${catFilter === c ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 text-slate-600 hover:border-teal-400"}`}>{c}</button>
              ))}
            </div>
          )}
          {gradings.filter(Boolean).length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Grading:</span>
              <button onClick={() => setGradingFilter("")} className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${!gradingFilter ? "bg-amber-600 text-white border-amber-600" : "border-slate-200 text-slate-600 hover:border-amber-400"}`}>All</button>
              {gradings.filter(Boolean).map(g => (
                <button key={g} onClick={() => setGradingFilter(g)} className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${gradingFilter === g ? "bg-amber-600 text-white border-amber-600" : "border-slate-200 text-slate-600 hover:border-amber-400"}`}>{g}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Productivity */}
      {prod.length > 0 && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-3">
          <p className="text-[10px] font-semibold text-teal-700 mb-2 flex items-center gap-1"><BarChart3 className="w-3 h-3" />SHIFT PRODUCTIVITY</p>
          <div className="grid grid-cols-3 gap-3">
            {prod.map(p => (
              <div key={p.id} className="text-center">
                <p className="text-[9px] text-muted-foreground">{p.projectCategory}</p>
                <p className="text-lg font-bold text-teal-700">{fmtNum(p.shiftOutput)}</p>
                <p className="text-[10px] text-slate-600">{p.outputUnit}</p>
                {p.workingHoursPerShift && <p className="text-[9px] text-muted-foreground">{p.workingHoursPerShift} hr/shift</p>}
              </div>
            ))}
          </div>
          {prod[0]?.basis && <p className="text-[9px] text-muted-foreground mt-2">Basis: {prod[0].basis}</p>}
        </div>
      )}

      <Tabs defaultValue="equipment">
        <TabsList className="h-7">
          <TabsTrigger value="equipment" className="text-xs h-6 px-2"><Wrench className="w-3 h-3 mr-1" />Equipment ({equip.length})</TabsTrigger>
          <TabsTrigger value="labour" className="text-xs h-6 px-2"><Users className="w-3 h-3 mr-1" />Labour ({labour.length})</TabsTrigger>
          <TabsTrigger value="materials" className="text-xs h-6 px-2"><Package className="w-3 h-3 mr-1" />Materials ({mats.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="equipment">
          {equip.length === 0 ? <p className="text-xs text-muted-foreground py-3 text-center">No equipment data for this category.</p> : (
            <table className="w-full text-xs border-collapse mt-2">
              <thead>
                <tr className="text-[10px] text-muted-foreground border-b">
                  <th className="text-left py-1 pr-2 font-medium">#</th>
                  <th className="text-left py-1 pr-2 font-medium">Equipment</th>
                  <th className="text-left py-1 pr-2 font-medium">Purpose</th>
                  <th className="text-right py-1 pr-2 font-medium">Qty/Shift</th>
                  <th className="text-right py-1 pr-2 font-medium">Per Unit</th>
                  <th className="text-left py-1 font-medium">Formula</th>
                </tr>
              </thead>
              <tbody>
                {equip.map((e, i) => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-1.5 pr-2 text-muted-foreground">{e.sortOrder || i + 1}</td>
                    <td className="py-1.5 pr-2 font-medium">{e.equipmentType}{e.equipmentSpec && <span className="text-muted-foreground ml-1">({e.equipmentSpec})</span>}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground text-[10px]">{e.purpose ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{fmtNum(e.quantityPerShift, 3)} {e.unit}</td>
                    <td className="py-1.5 pr-2 text-right text-teal-700">{e.derivedPerUnit != null ? fmtNum(e.derivedPerUnit, 5) : "—"}</td>
                    <td className="py-1.5 text-[9px] text-muted-foreground">{e.formulaType !== "FIXED" ? <span className="font-mono bg-slate-100 px-1 rounded">{e.formulaExpr}</span> : "FIXED"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="labour">
          {labour.length === 0 ? <p className="text-xs text-muted-foreground py-3 text-center">No labour data for this category.</p> : (
            <table className="w-full text-xs border-collapse mt-2">
              <thead>
                <tr className="text-[10px] text-muted-foreground border-b">
                  <th className="text-left py-1 pr-2 font-medium">#</th>
                  <th className="text-left py-1 pr-2 font-medium">Designation</th>
                  <th className="text-left py-1 pr-2 font-medium">Skill</th>
                  <th className="text-right py-1 pr-2 font-medium">Qty/Shift</th>
                  <th className="text-right py-1 font-medium">Per Unit</th>
                </tr>
              </thead>
              <tbody>
                {labour.map((l, i) => (
                  <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-1.5 pr-2 text-muted-foreground">{l.sortOrder || i + 1}</td>
                    <td className="py-1.5 pr-2 font-medium">{l.designation}</td>
                    <td className="py-1.5 pr-2"><Badge variant="outline" className="text-[8px] h-4 px-1">{l.skillTier}</Badge></td>
                    <td className="py-1.5 pr-2 text-right">{fmtNum(l.quantityPerShift, 1)}</td>
                    <td className="py-1.5 text-right text-teal-700">{l.derivedPerUnit != null ? fmtNum(l.derivedPerUnit, 5) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="materials">
          {mats.length === 0 ? <p className="text-xs text-muted-foreground py-3 text-center">No materials data{gradingFilter ? ` for grading "${gradingFilter}"` : ""}.</p> : (
            <table className="w-full text-xs border-collapse mt-2">
              <thead>
                <tr className="text-[10px] text-muted-foreground border-b">
                  <th className="text-left py-1 pr-2 font-medium">#</th>
                  <th className="text-left py-1 pr-2 font-medium">Material</th>
                  <th className="text-left py-1 pr-2 font-medium">Category</th>
                  <th className="text-right py-1 pr-2 font-medium">Per Unit</th>
                  <th className="text-left py-1 font-medium">UOM</th>
                </tr>
              </thead>
              <tbody>
                {mats.map((m, i) => (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-1.5 pr-2 text-muted-foreground">{m.sortOrder || i + 1}</td>
                    <td className="py-1.5 pr-2 font-medium">{m.materialName}{m.isDesignSpecific && <Badge variant="outline" className="text-[8px] h-3.5 px-0.5 ml-1 text-blue-600 border-blue-300">design</Badge>}</td>
                    <td className="py-1.5 pr-2 text-[10px] text-muted-foreground">{m.materialCategory}</td>
                    <td className="py-1.5 pr-2 text-right text-teal-700 font-medium">{fmtNum(m.derivedPerUnit, 4)}</td>
                    <td className="py-1.5 text-muted-foreground">{m.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Items List ──────────────────────────────────────────────────────────────

function SourceItemsList({ sourceId }: { sourceId: number }) {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [catFilter, setCatFilter] = useState<string>("");

  const { data: items = [], isLoading } = useQuery<SnlSearchResult[]>({
    queryKey: ["/api/snl/sources", sourceId, "items", catFilter],
    queryFn: async () => {
      const url = catFilter ? `/api/snl/sources/${sourceId}/items?category=${catFilter}` : `/api/snl/sources/${sourceId}/items`;
      const res = await fetch(url, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const categories = Array.from(new Set(items.map(i => i.workCategory)));

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Loading…</div>;

  return (
    <div className="flex gap-4 h-full">
      <div className="w-72 shrink-0 space-y-1 overflow-y-auto pr-1">
        {/* Category filter */}
        <div className="flex flex-wrap gap-1 mb-2">
          <button onClick={() => setCatFilter("")} className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${!catFilter ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 text-slate-600 hover:border-teal-400"}`}>All</button>
          {categories.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${catFilter === c ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 text-slate-600 hover:border-teal-400"}`}>{c}</button>
          ))}
        </div>
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => setSelectedItemId(item.id === selectedItemId ? null : item.id)}
            className={`w-full text-left rounded-lg border p-2.5 transition-colors ${selectedItemId === item.id ? "border-teal-500 bg-teal-50/60 dark:bg-teal-900/20" : "border-slate-200 hover:border-teal-300 hover:bg-slate-50/60"}`}
            data-testid={`snl-item-${item.id}`}
          >
            <div className="flex items-center gap-1.5 justify-between">
              <span className="text-[10px] font-mono font-semibold text-teal-600">{item.itemCode}</span>
              {catBadge(item.workCategory)}
            </div>
            <p className="text-xs font-medium mt-0.5 leading-tight">{item.shortLabel}</p>
            {item.shiftOutput && <p className="text-[10px] text-muted-foreground mt-0.5">{fmtNum(item.shiftOutput)} {item.outputUnit}/shift</p>}
          </button>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No items found.</p>}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedItemId ? (
          <ItemDetailPanel itemId={selectedItemId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <ChevronRight className="w-6 h-6 opacity-30" />
            <p className="text-sm">Select an item to view its norms</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Search Panel ────────────────────────────────────────────────────────────

function SearchPanel() {
  const [q, setQ] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const { data: results = [], isLoading, isFetching } = useQuery<SnlSearchResult[]>({
    queryKey: ["/api/snl/search", q],
    queryFn: async () => {
      const res = await fetch(`/api/snl/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: q.trim().length > 1 || q === "",
  });

  return (
    <div className="flex gap-4 h-full">
      <div className="w-72 shrink-0 space-y-2 overflow-y-auto pr-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="Search by code or description…"
            value={q}
            onChange={e => setQ(e.target.value)}
            data-testid="input-snl-search"
          />
          {isFetching && <Loader2 className="absolute right-2.5 top-2.5 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
        {results.map(item => (
          <button
            key={item.id}
            onClick={() => setSelectedItemId(item.id === selectedItemId ? null : item.id)}
            className={`w-full text-left rounded-lg border p-2.5 transition-colors ${selectedItemId === item.id ? "border-teal-500 bg-teal-50/60" : "border-slate-200 hover:border-teal-300 hover:bg-slate-50/60"}`}
            data-testid={`snl-search-result-${item.id}`}
          >
            <div className="flex items-center gap-1.5 justify-between">
              <span className="text-[10px] font-mono font-semibold text-teal-600">{item.itemCode}</span>
              {catBadge(item.workCategory)}
            </div>
            <p className="text-xs font-medium mt-0.5 leading-tight">{item.shortLabel}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{item.sourceName}</p>
          </button>
        ))}
        {q.length > 1 && !isLoading && results.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No results for "{q}".</p>
        )}
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedItemId ? (
          <ItemDetailPanel itemId={selectedItemId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <Search className="w-6 h-6 opacity-30" />
            <p className="text-sm">Search above, then select an item</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NormsLibrary() {
  const { toast } = useToast();
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [tab, setTab] = useState<"browse" | "search">("browse");

  const { data: sources = [], isLoading, refetch } = useQuery<SnlSource[]>({
    queryKey: ["/api/snl/sources"],
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/snl/seed", {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/snl/sources"] });
      toast({ title: "MoRTH SDB 2019 seeded successfully" });
    },
    onError: () => toast({ title: "Seed failed", variant: "destructive" }),
  });

  const hasSource = sources.length > 0;
  const activeSource = sources.find(s => s.id === selectedSourceId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <h1 className="text-xl font-bold">Standard Norms Library</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reference norms from MoRTH, IS codes, and other authoritative sources. Use "Map to Norm" inside any BOQ item to populate its recipes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => seedMutation.mutate()}
          disabled={seedMutation.isPending}
          className="shrink-0"
          data-testid="button-seed-snl"
        >
          {seedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Database className="w-3.5 h-3.5 mr-1" />}
          {hasSource ? "Re-seed MoRTH SDB" : "Load MoRTH SDB 2019"}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</div>
      ) : !hasSource ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
          <AlertCircle className="w-10 h-10 opacity-30" />
          <p className="text-sm">No norm sources loaded yet.</p>
          <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white" data-testid="button-seed-snl-empty">
            {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
            Load MoRTH SDB 2019 (5 items)
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Source cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sources.map(src => (
              <button
                key={src.id}
                onClick={() => { setSelectedSourceId(src.id === selectedSourceId ? null : src.id); setTab("browse"); }}
                className={`text-left rounded-xl border p-4 transition-all ${selectedSourceId === src.id ? "border-teal-500 bg-teal-50/60 shadow-sm dark:bg-teal-900/20" : "border-slate-200 hover:border-teal-300 hover:bg-slate-50/60"}`}
                data-testid={`snl-source-card-${src.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-bold text-teal-700">{src.code}</p>
                    <p className="text-sm font-semibold leading-tight mt-0.5">{src.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{src.authority} · {src.year}</p>
                  </div>
                  <Badge className="bg-teal-100 text-teal-700 border-teal-200 shrink-0">{src.itemCount} items</Badge>
                </div>
                {src.description && <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{src.description}</p>}
              </button>
            ))}
          </div>

          {/* Tabs: Browse / Search */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "browse" | "search")}>
            <TabsList className="h-8">
              <TabsTrigger value="browse" className="text-xs h-7">Browse Source</TabsTrigger>
              <TabsTrigger value="search" className="text-xs h-7"><Search className="w-3 h-3 mr-1" />Search All</TabsTrigger>
            </TabsList>

            <TabsContent value="browse" className="mt-3">
              {selectedSourceId && activeSource ? (
                <div className="rounded-xl border p-4 min-h-[400px]">
                  <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">{activeSource.name} — {activeSource.itemCount} items</p>
                  <SourceItemsList sourceId={selectedSourceId} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2 rounded-xl border border-dashed">
                  <ChevronRight className="w-5 h-5 opacity-30" />
                  <p className="text-sm">Click a source card above to browse its items</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="search" className="mt-3">
              <div className="rounded-xl border p-4 min-h-[400px]">
                <SearchPanel />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
