import { useState, useRef } from "react";
import { ProgrammeLink as Link } from "@/components/ProgrammeLink";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BookOpen, ChevronRight, Search, Loader2, RefreshCw, ArrowLeft,
  Wrench, Users, Package, BarChart3, ChevronDown, ChevronUp,
  AlertCircle, Upload, Download, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { getSnlSearchItemTitle } from "@shared/normBook";

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
  specClause: string | null;
  workCategory: string;
  chapterNo: string | null;
  isMixSpecific: boolean;
  hasGradingVariants: boolean;
  notes: string | null;
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

interface RememberedLinkRow {
  id: number;
  normalizedBoqWording: string;
  displayBoqWording: string;
  snlItemId: number;
  itemCode: string;
  itemTitle: string;
  unit: string;
  confirmedBy: string | null;
  confirmedAt: string;
  createdAt: string;
}

interface MorthReloadPreview {
  sourceCode: string;
  sourceName: string;
  fingerprint: string;
  parsedCount: number;
  counts: {
    added: number;
    changed: number;
    unchanged: number;
    preservedOutsideWorkbook: number;
    passed: number;
    copiedFromAnotherItem: number;
    rateOnly: number;
    needsCheck: number;
    projectItemsChanged: number;
    projectItemsUnchanged: number;
  };
  preservedOutsideWorkbookItems: Array<{ code: string; description: string; unit: string }>;
  copiedItems: Array<{ code: string; title: string; unit: string; copyReference: string; costNote: string | null }>;
  rateOnlyItems: Array<{ code: string; title: string; unit: string; shiftOutput: number; reasons: string[] }>;
  needsCheckItems: Array<{ code: string; title: string; unit: string; shiftOutput: number; reasons: string[] }>;
  changes: Array<{
    code: string;
    status: "added" | "changed" | "unchanged";
    validationStatus: "passing" | "copied" | "rate_only" | "needs_check";
    copyReference?: string;
    costNote?: string;
    validationReasons: string[];
    old: null | { title: string; shortLabel: string | null; description: string; unit: string; specClause: string | null; notes: string | null; norms: MorthNormRows };
    new: { title: string; shortLabel: string; description: string; unit: string; specClause: string | null; notes: string | null; norms: MorthNormRows };
    reasons: string[];
  }>;
}

interface MorthNormRows {
  productivity: Array<{ projectCategory: string; shiftOutput: number; shiftHours: number; outputUnit: string; derivedPerHour: number | null }>;
  equipment: Array<{ projectCategory: string; sortOrder: number; equipmentType: string; unit: string; quantityPerShift: number | null; shiftOutputRef: number; derivedPerUnit: number | null; notes?: string | null }>;
  labour: Array<{ projectCategory: string; sortOrder: number; designation: string; skillTier: string; unit: string; quantityPerShift: number; shiftOutputRef: number; derivedPerUnit: number | null }>;
  materials: Array<{ projectCategory: string; sortOrder: number; materialName: string; materialCategory: string; unit: string; quantityPerShift: number; shiftOutputRef: number; derivedPerUnit: number | null }>;
}

function fullNormTitle(item: Pick<SnlSearchResult, "sourceCode" | "shortLabel" | "description">) {
  return getSnlSearchItemTitle({
    ...item,
    sourceName: "",
    itemCode: "",
  });
}

function formatReloadRows(norms: MorthNormRows | null, key: "equipment" | "labour" | "materials") {
  if (!norms) return "—";
  const rows = norms[key];
  if (!rows.length) return "none";
  return rows.map(row => {
    const name = "equipmentType" in row ? row.equipmentType : "designation" in row ? row.designation : row.materialName;
    const qty = row.quantityPerShift == null
      ? "variable"
      : `${row.quantityPerShift.toLocaleString("en-IN")} ${row.unit} per ${row.shiftOutputRef.toLocaleString("en-IN")} ${norms.productivity[0]?.outputUnit ?? ""}`.trim();
    const note = "notes" in row && row.notes ? ` · ${row.notes}` : "";
    return `${row.projectCategory} · ${name}: ${qty}${note}`;
  }).join("; ");
}

function formatReloadProductivity(norms: MorthNormRows | null) {
  if (!norms) return "—";
  if (!norms.productivity.length) return "none";
  return norms.productivity.map(row =>
    `${row.projectCategory}: ${row.shiftOutput.toLocaleString("en-IN")} ${row.outputUnit} per ${row.shiftHours} hr`,
  ).join("; ");
}

interface ImportResult {
  sourceName: string;
  sourceCode: string;
  itemsInserted: number;
  itemsUpdated: number;
  equipment: number;
  labour: number;
  materials: number;
  errors: string[];
}

const SECTOR_OPTIONS = [
  { value: "", label: "All Sectors" },
  { value: "ROAD", label: "ROAD" },
  { value: "STRUCTURE", label: "STRUCTURE" },
  { value: "IRRIGATION", label: "IRRIGATION" },
  { value: "GATES_HOIST", label: "GATES & HOIST" },
  { value: "BUILDING", label: "BUILDING" },
  { value: "WATER", label: "WATER" },
  { value: "ELECTRICAL", label: "ELECTRICAL" },
];

const SECTOR_COLORS: Record<string, string> = {
  ROAD: "bg-orange-100 text-orange-700 border-orange-200",
  STRUCTURE: "bg-blue-100 text-blue-700 border-blue-200",
  IRRIGATION: "bg-teal-100 text-teal-700 border-teal-200",
  GATES_HOIST: "bg-purple-100 text-purple-700 border-purple-200",
  BUILDING: "bg-amber-100 text-amber-700 border-amber-200",
  WATER: "bg-cyan-100 text-cyan-700 border-cyan-200",
  ELECTRICAL: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const CATEGORY_COLORS: Record<string, string> = {
  EARTHWORK: "bg-orange-100 text-orange-700 border-orange-200",
  GRANULAR: "bg-amber-100 text-amber-700 border-amber-200",
  BITUMINOUS: "bg-purple-100 text-purple-700 border-purple-200",
  CONCRETE: "bg-blue-100 text-blue-700 border-blue-200",
  DRAINAGE: "bg-teal-100 text-teal-700 border-teal-200",
  BRIDGE: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function catBadge(cat: string) {
  const cls = SECTOR_COLORS[cat] ?? CATEGORY_COLORS[cat] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${cls}`}>{cat}</span>;
}

function fmtNum(n: number | null | undefined, d = 3) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: d });
}

// ─── Item Detail Panel ───────────────────────────────────────────────────────

function ItemDetailPanel({ itemId, includeOtherBooks = false }: { itemId: number; includeOtherBooks?: boolean }) {
  const [catFilter, setCatFilter] = useState<string>("MEDIUM");
  const [gradingFilter, setGradingFilter] = useState<string>("");

  const { data: item, isLoading } = useQuery<SnlItemFull>({
    queryKey: ["/api/snl/items", itemId, includeOtherBooks],
    queryFn: async () => {
      const res = await fetch(`/api/snl/items/${itemId}${includeOtherBooks ? "?includeOtherBooks=true" : ""}`, { credentials: "include" });
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
  const estimatorNotes = (item.notes ?? "")
    .split(/\r?\n/)
    .filter(line =>
      line.startsWith("MoRTH cost note:") ||
      line.startsWith("MoRTH source:") ||
      line.startsWith("MoRTH spec note:"),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono font-semibold text-teal-700">{item.itemCode}</span>
            {catBadge(item.workCategory)}
            {item.isMixSpecific && <Badge variant="outline" className="text-xs h-4 px-1 border-purple-300 text-purple-700">Mix-specific</Badge>}
            {item.hasGradingVariants && <Badge variant="outline" className="text-xs h-4 px-1 border-amber-300 text-amber-700">Grading variants</Badge>}
          </div>
          <p className="text-sm font-medium mt-0.5 whitespace-normal">{getSnlSearchItemTitle({
            sourceCode: item.source.code,
            sourceName: item.source.name,
            itemCode: item.itemCode,
            shortLabel: item.shortLabel,
            description: item.description,
          })}</p>
          <p className="text-xs text-muted-foreground">
            Unit: <span className="font-medium">{item.unit}</span>
            {item.specClause && <> · Spec clause: <span className="font-medium">{item.specClause}</span></>}
            {" · "}Source: {item.source.code} ({item.source.year}) · {item.source.authority}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {cats.filter(c => c !== "ALL").length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-[12px] text-muted-foreground">Category:</span>
              {cats.filter(c => c !== "ALL").map(c => (
                <button key={c} onClick={() => setCatFilter(c)} className={`text-[12px] px-2 py-0.5 rounded border transition-colors ${catFilter === c ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 text-slate-600 hover:border-teal-400"}`}>{c}</button>
              ))}
            </div>
          )}
          {gradings.filter(Boolean).length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-[12px] text-muted-foreground">Grading:</span>
              <button onClick={() => setGradingFilter("")} className={`text-[12px] px-2 py-0.5 rounded border transition-colors ${!gradingFilter ? "bg-amber-600 text-white border-amber-600" : "border-slate-200 text-slate-600 hover:border-amber-400"}`}>All</button>
              {gradings.filter(Boolean).map(g => (
                <button key={g} onClick={() => setGradingFilter(g)} className={`text-[12px] px-2 py-0.5 rounded border transition-colors ${gradingFilter === g ? "bg-amber-600 text-white border-amber-600" : "border-slate-200 text-slate-600 hover:border-amber-400"}`}>{g}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {estimatorNotes.length > 0 && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
          <p className="font-semibold text-xs uppercase tracking-wide">MoRTH notes</p>
          {estimatorNotes.map((line, index) => (
            <p key={index} className="mt-1">
              {line.replace(/^MoRTH (?:cost note|source|spec note):\s*/, "")}
            </p>
          ))}
        </div>
      )}

      {prod.length > 0 && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-3">
          <p className="text-[12px] font-semibold text-teal-700 mb-2 flex items-center gap-1"><BarChart3 className="w-3 h-3" />SHIFT PRODUCTIVITY</p>
          <div className="grid grid-cols-3 gap-3">
            {prod.map(p => (
              <div key={p.id} className="text-center">
                <p className="text-xs text-muted-foreground">{p.projectCategory}</p>
                <p className="text-lg font-bold text-teal-700">{fmtNum(p.shiftOutput)}</p>
                <p className="text-[12px] text-slate-600">{p.outputUnit}</p>
                {p.workingHoursPerShift && <p className="text-xs text-muted-foreground">{p.workingHoursPerShift} hr/shift</p>}
              </div>
            ))}
          </div>
          {prod[0]?.basis && <p className="text-xs text-muted-foreground mt-2">Basis: {prod[0].basis}</p>}
        </div>
      )}

      <Tabs defaultValue="equipment">
        <TabsList className="h-7">
          <TabsTrigger value="equipment" className="text-sm h-6 px-2"><Wrench className="w-3 h-3 mr-1" />Equipment ({equip.length})</TabsTrigger>
          <TabsTrigger value="labour" className="text-sm h-6 px-2"><Users className="w-3 h-3 mr-1" />Labour ({labour.length})</TabsTrigger>
          <TabsTrigger value="materials" className="text-sm h-6 px-2"><Package className="w-3 h-3 mr-1" />Materials ({mats.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="equipment">
          {equip.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">No equipment data for this category.</p> : (
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="text-[12px] text-muted-foreground border-b">
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
                    <td className="py-1.5 pr-2 text-muted-foreground text-[12px]">{e.purpose ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{fmtNum(e.quantityPerShift, 3)} {e.unit}</td>
                    <td className="py-1.5 pr-2 text-right text-teal-700">{e.derivedPerUnit != null ? fmtNum(e.derivedPerUnit, 5) : "—"}</td>
                    <td className="py-1.5 text-xs text-muted-foreground">{e.formulaType !== "FIXED" ? <span className="font-mono bg-slate-100 px-1 rounded">{e.formulaExpr}</span> : "FIXED"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="labour">
          {labour.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">No labour data for this category.</p> : (
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="text-[12px] text-muted-foreground border-b">
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
          {mats.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">No materials data{gradingFilter ? ` for grading "${gradingFilter}"` : ""}.</p> : (
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="text-[12px] text-muted-foreground border-b">
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
                    <td className="py-1.5 pr-2 text-[12px] text-muted-foreground">{m.materialCategory}</td>
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

function RememberedLinksPanel({ canRemove }: { canRemove: boolean }) {
  const { toast } = useToast();
  const { data: links = [], isLoading } = useQuery<RememberedLinkRow[]>({
    queryKey: ["/api/snl/remembered-links"],
    queryFn: async () => {
      const response = await fetch("/api/snl/remembered-links", { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load remembered links");
      return response.json();
    },
  });
  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/snl/remembered-links/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to remove the remembered link");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/snl/remembered-links"] });
      toast({ title: "Remembered link removed." });
    },
    onError: (error: Error) => toast({ title: "Unable to remove remembered link", description: error.message, variant: "destructive" }),
  });

  return (
    <section className="rounded-lg border bg-white p-3 space-y-2" data-testid="snl-remembered-links">
      <div>
        <h2 className="text-sm font-semibold">Remembered links</h2>
        <p className="text-xs text-muted-foreground">Confirmed MoRTH links suggest the same exact sub-item next time.</p>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">Loading remembered links…</p> :
        links.length === 0 ? <p className="text-xs text-muted-foreground">No remembered MoRTH links yet.</p> : (
          <div className="divide-y rounded border">
            {links.slice(0, 8).map(link => (
              <div key={link.id} className="flex items-center justify-between gap-3 px-2.5 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium truncate">{link.displayBoqWording}</p>
                  <p className="text-muted-foreground">
                    {link.itemCode} · {link.itemTitle} · {link.confirmedBy ?? "User"} · {new Date(link.confirmedAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
                {canRemove && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0"
                    onClick={() => removeMutation.mutate(link.id)}
                    disabled={removeMutation.isPending}
                    data-testid={`button-remove-remembered-link-${link.id}`}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
    </section>
  );
}

// ─── Items List ──────────────────────────────────────────────────────────────

function SourceItemsList({ sourceId, sourceCode, sourceName, sectorFilter, includeOtherBooks = false }: { sourceId: number; sourceCode: string; sourceName: string; sectorFilter?: string; includeOtherBooks?: boolean }) {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [catFilter, setCatFilter] = useState<string>("");

  const { data: items = [], isLoading } = useQuery<SnlSearchResult[]>({
    queryKey: ["/api/snl/sources", sourceId, "items", catFilter, sectorFilter, includeOtherBooks],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (catFilter) params.set("category", catFilter);
      if (sectorFilter) params.set("sector", sectorFilter);
      if (includeOtherBooks) params.set("includeOtherBooks", "true");
      const url = `/api/snl/sources/${sourceId}/items${params.size ? "?" + params.toString() : ""}`;
      const res = await fetch(url, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const categories = Array.from(new Set(items.map(i => i.workCategory)));

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Loading…</div>;

  return (
    <div className="flex gap-4 h-full">
      <div className="w-72 shrink-0 space-y-1 overflow-y-auto pr-1">
        <div className="flex flex-wrap gap-1 mb-2">
          <button onClick={() => setCatFilter("")} className={`text-[12px] px-2 py-0.5 rounded border transition-colors ${!catFilter ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 text-slate-600 hover:border-teal-400"}`}>All</button>
          {categories.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} className={`text-[12px] px-2 py-0.5 rounded border transition-colors ${catFilter === c ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 text-slate-600 hover:border-teal-400"}`}>{c}</button>
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
              <span className="text-[12px] font-mono font-semibold text-teal-600">{item.itemCode}</span>
              {catBadge(item.workCategory)}
            </div>
            <p className="text-sm font-medium mt-0.5 leading-snug whitespace-normal line-clamp-2">{getSnlSearchItemTitle({ ...item, sourceCode, sourceName })}</p>
            {item.shiftOutput && <p className="text-[12px] text-muted-foreground mt-0.5">{fmtNum(item.shiftOutput)} {item.outputUnit}/shift</p>}
          </button>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No items found.</p>}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedItemId ? (
          <ItemDetailPanel itemId={selectedItemId} includeOtherBooks={includeOtherBooks} />
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

function SearchPanel({ sectorFilter, includeOtherBooks = false }: { sectorFilter?: string; includeOtherBooks?: boolean }) {
  const [q, setQ] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const { data: results = [], isLoading, isFetching } = useQuery<SnlSearchResult[]>({
    queryKey: ["/api/snl/search", q, sectorFilter, includeOtherBooks],
    queryFn: async () => {
      const params = new URLSearchParams({ q });
      if (sectorFilter) params.set("sector", sectorFilter);
      if (includeOtherBooks) params.set("includeOtherBooks", "true");
      const res = await fetch(`/api/snl/search?${params.toString()}`, { credentials: "include" });
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
            className="pl-8 h-8 text-sm"
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
              <span className="text-[12px] font-mono font-semibold text-teal-600">{item.itemCode}</span>
              {catBadge(item.workCategory)}
            </div>
            <p className="text-sm font-medium mt-0.5 leading-snug whitespace-normal line-clamp-2">{fullNormTitle(item)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.sourceName}</p>
          </button>
        ))}
        {q.length > 1 && !isLoading && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No results for "{q}".</p>
        )}
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedItemId ? (
          <ItemDetailPanel itemId={selectedItemId} includeOtherBooks={includeOtherBooks} />
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
  const { featureCan, isOwner } = useAuth();
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [tab, setTab] = useState<"browse" | "search">("browse");
  const [sectorFilter, setSectorFilter] = useState<string>("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showOtherBooks, setShowOtherBooks] = useState(false);
  const [reloadFile, setReloadFile] = useState<File | null>(null);
  const [reloadPreview, setReloadPreview] = useState<MorthReloadPreview | null>(null);
  const [reloadResult, setReloadResult] = useState<{ affectedBoqItems: Array<{ boqItemId: number; itemCode: string | null; description: string; projectName: string | null; recipeManualOverride: boolean | null; linkedAs: string[] }> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reloadFileInputRef = useRef<HTMLInputElement>(null);

  const { data: sources = [], isLoading, refetch } = useQuery<SnlSource[]>({
    queryKey: ["/api/snl/sources", showOtherBooks],
    queryFn: async () => {
      const res = await fetch(`/api/snl/sources${showOtherBooks ? "?includeOtherBooks=true" : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load norm sources");
      return res.json();
    },
  });

  const { data: normBook } = useQuery<{ code: string; sourceId: number | null; name: string }>({
    queryKey: ["/api/snl/norm-book"],
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/snl/import", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Import failed");
      }
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: async (data) => {
      setImportResult(data);
      await queryClient.invalidateQueries({ queryKey: ["/api/snl/sources"] });
      toast({
        title: `Import complete — ${data.sourceName}`,
        description: `${data.itemsInserted} inserted, ${data.itemsUpdated} updated, ${data.errors.length} errors`,
      });
    },
    onError: (err: Error) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });

  const reloadPreviewMutation = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/snl/morth/reload-preview", { method: "POST", body, credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to preview the MoRTH workbook");
      return payload as MorthReloadPreview;
    },
    onSuccess: preview => {
      setReloadPreview(preview);
      setReloadResult(null);
      toast({ title: "Review the MoRTH change list before applying." });
    },
    onError: (error: Error) => toast({ title: "MoRTH preview failed", description: error.message, variant: "destructive" }),
  });

  const reloadApplyMutation = useMutation({
    mutationFn: async () => {
      if (!reloadFile || !reloadPreview) throw new Error("Preview the workbook before applying.");
      const body = new FormData();
      body.append("file", reloadFile);
      body.append("fingerprint", reloadPreview.fingerprint);
      const response = await fetch("/api/snl/morth/reload-apply", { method: "POST", body, credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to apply the MoRTH reload");
      return payload as { affectedBoqItems: Array<{ boqItemId: number; itemCode: string | null; description: string; projectName: string | null; recipeManualOverride: boolean | null; linkedAs: string[] }> };
    },
    onSuccess: async result => {
      setReloadResult(result);
      await queryClient.invalidateQueries({ queryKey: ["/api/snl/sources"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/snl/norm-book"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/snl/search"] });
      toast({ title: "MoRTH book reloaded", description: `${result.affectedBoqItems.length} mapped BOQ item(s) need review and re-linking.` });
    },
    onError: (error: Error) => toast({ title: "MoRTH reload not applied", description: error.message, variant: "destructive" }),
  });

  const normBookMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", "/api/snl/norm-book", { code: "MORTH_SDB_2019" });
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/snl/norm-book"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/snl/sources"] });
      toast({ title: "Norm book in use set to MoRTH Standard Data Book (2003)." });
    },
    onError: () => toast({ title: "Unable to set the norm book in use.", variant: "destructive" }),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) importMutation.mutate(file);
    e.target.value = "";
  }

  function handleTemplateDownload() {
    window.location.href = "/api/snl/import-template";
  }

  const hasSource = sources.length > 0;
  const activeSource = sources.find(s => s.id === selectedSourceId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <Link href="/work-program">
        <a className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900" data-testid="link-back-work-program">
          <ArrowLeft className="w-4 h-4" /> Back to Work Programme
        </a>
      </Link>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <h1 className="text-xl font-bold">Standard Norms Library</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reference norms from MoRTH, IS codes, and other authoritative sources. Use "Map to Norm" inside any BOQ item to populate its recipes.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sector filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={sectorFilter}
              onChange={e => setSectorFilter(e.target.value)}
              className="h-8 text-sm rounded-md border border-input bg-background px-2 pr-6 focus:outline-none focus:ring-1 focus:ring-teal-500"
              data-testid="select-sector-filter"
            >
              {SECTOR_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Admin buttons */}
          {featureCan("boq_programme", "edit") && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTemplateDownload}
                className="shrink-0"
                data-testid="button-download-template"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Download template
              </Button>
              <div className="flex flex-col items-end gap-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importMutation.isPending}
                  className="shrink-0"
                  data-testid="button-import-sdb"
                >
                  {importMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                  Import SDB
                </Button>
                <span className="text-[10px] text-muted-foreground pr-0.5">
                  Other SDB formats; MoRTH uses review before apply
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-import-file"
              />
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowOtherBooks(value => !value)} data-testid="button-toggle-other-books">
            {showOtherBooks ? "Hide other books" : "Show other books"}
          </Button>
          {isOwner && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => reloadFileInputRef.current?.click()}
                disabled={reloadPreviewMutation.isPending || reloadApplyMutation.isPending}
                data-testid="button-morth-reload"
              >
                {reloadPreviewMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                Reload MoRTH book
              </Button>
              <input
                ref={reloadFileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  if (!file) return;
                  setReloadFile(file);
                  setReloadPreview(null);
                  reloadPreviewMutation.mutate(file);
                }}
                data-testid="input-morth-reload-file"
              />
            </>
          )}

        </div>
      </div>

      <div className="rounded-lg border bg-slate-50/70 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="font-semibold">Norm book in use:</span>{" "}
          {normBook?.name ?? "MoRTH Standard Data Book (2003)"}
          <p className="text-xs text-muted-foreground mt-0.5">Auto-mapping, recipe application and default library views use this book only.</p>
        </div>
        {isOwner && normBook?.code !== "MORTH_SDB_2019" && (
          <Button size="sm" variant="outline" disabled={normBookMutation.isPending} onClick={() => normBookMutation.mutate()}>
            Use MoRTH Standard Data Book (2003)
          </Button>
        )}
      </div>

      <RememberedLinksPanel canRemove={isOwner} />

      {reloadPreview && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3" data-testid="morth-reload-preview">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-semibold text-amber-950">Review MoRTH changes — {reloadPreview.sourceName}</h2>
              <p className="text-xs text-amber-900 mt-1">
                No data is written until you select Apply. Items outside the workbook are preserved; saved BOQ recipes are not changed.
              </p>
            </div>
            <div className="flex gap-3 text-xs font-medium text-slate-700">
              <span>{reloadPreview.counts.added} added</span>
              <span>{reloadPreview.counts.changed} changed</span>
              <span>{reloadPreview.counts.unchanged} unchanged</span>
              <span>{reloadPreview.counts.preservedOutsideWorkbook} outside workbook, preserved</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-700">
            <span>{reloadPreview.counts.passed} passed</span>
            <span>{reloadPreview.counts.copiedFromAnotherItem} copied from another item</span>
            <span>{reloadPreview.counts.rateOnly} rate-only</span>
            <span className={reloadPreview.counts.needsCheck ? "text-rose-700" : ""}>
              {reloadPreview.counts.needsCheck} needs check
            </span>
          </div>
          <p className="text-xs font-medium text-slate-700">
            Items used by your projects: {reloadPreview.counts.projectItemsChanged} changed · {reloadPreview.counts.projectItemsUnchanged} unchanged
          </p>
          <p className="text-xs text-slate-700">
            Items marked Needs check are excluded from Apply and will not be written.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold">Show all changes ({reloadPreview.changes.length})</summary>
            <div className="mt-2 space-y-3">
          <div className="max-h-80 overflow-auto rounded border bg-white divide-y">
            {reloadPreview.changes.filter(change => change.status !== "unchanged" || change.validationStatus === "copied").map(change => (
              <div key={change.code} className="p-3 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{change.code}</span>
                  <Badge variant="outline" className={change.status === "added" ? "border-emerald-300 text-emerald-700" : "border-amber-300 text-amber-700"}>{change.status}</Badge>
                  <Badge
                    variant="outline"
                    className={
                      change.validationStatus === "needs_check"
                        ? "border-rose-300 text-rose-700"
                        : change.validationStatus === "rate_only"
                          ? "border-sky-300 text-sky-700"
                          : change.validationStatus === "copied"
                            ? "border-indigo-300 text-indigo-700"
                          : "border-emerald-300 text-emerald-700"
                    }
                  >
                    {change.validationStatus === "needs_check"
                      ? "Needs check"
                      : change.validationStatus === "rate_only"
                        ? "Rate-only"
                        : change.validationStatus === "copied"
                          ? "Copied"
                          : "Passing"}
                  </Badge>
                  <span className="text-slate-500">{change.reasons.join(" · ")}</span>
                </div>
                {change.copyReference && <p className="text-indigo-800 font-medium">{change.copyReference}</p>}
                {change.costNote && (
                  <p className="text-sky-800"><span className="font-medium">Estimator cost note:</span> {change.costNote}</p>
                )}
                {change.validationReasons.length > 0 && (
                  <p className={change.validationStatus === "needs_check" ? "text-rose-700" : "text-sky-700"}>
                    {change.validationReasons.join(" ")}
                  </p>
                )}
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="font-semibold">Old:</span> {change.old ? `${change.old.title} · ${change.old.unit}` : "Not in current MoRTH source"}
                    {change.old && change.old.description !== change.old.title && <p className="text-xs text-slate-500">Description: {change.old.description}</p>}
                    {change.old?.specClause && <p className="text-xs text-slate-500">Spec clause: {change.old.specClause}</p>}
                    {change.old && (
                      <ul className="mt-1 text-slate-600 space-y-0.5">
                      <li><span className="font-medium">Productivity:</span> {formatReloadProductivity(change.old.norms)}</li>
                        <li><span className="font-medium">Machines:</span> {formatReloadRows(change.old.norms, "equipment")}</li>
                        <li><span className="font-medium">Labour:</span> {formatReloadRows(change.old.norms, "labour")}</li>
                        <li><span className="font-medium">Materials:</span> {formatReloadRows(change.old.norms, "materials")}</li>
                      </ul>
                    )}
                  </div>
                  <div><span className="font-semibold">New:</span> {change.new.title} · {change.new.unit}
                    {change.new.description !== change.new.title && <p className="text-xs text-slate-500">Description: {change.new.description}</p>}
                    {change.new.specClause && <p className="text-xs text-slate-500">{change.old?.specClause ? "Spec clause" : "Spec clause added"}: {change.new.specClause}</p>}
                    <ul className="mt-1 text-slate-600 space-y-0.5">
                      <li><span className="font-medium">Productivity:</span> {formatReloadProductivity(change.new.norms)}</li>
                      <li><span className="font-medium">Machines:</span> {formatReloadRows(change.new.norms, "equipment")}</li>
                      <li><span className="font-medium">Labour:</span> {formatReloadRows(change.new.norms, "labour")}</li>
                      <li><span className="font-medium">Materials:</span> {formatReloadRows(change.new.norms, "materials")}</li>
                    </ul>
                  </div>
                </div>
              </div>
            ))}
            {reloadPreview.changes.filter(change => change.status !== "unchanged" || change.validationStatus === "copied").length === 0 && (
              <p className="p-3 text-sm text-slate-600">No additions or changes detected.</p>
            )}
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold">Unchanged items ({reloadPreview.counts.unchanged})</summary>
            <div className="mt-2 max-h-40 overflow-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-slate-600">
              {reloadPreview.changes.filter(change => change.status === "unchanged").map(change => (
                <span key={change.code}>{change.code} · {change.new.description} · {change.new.unit}</span>
              ))}
            </div>
          </details>
          <details className="text-xs" open={reloadPreview.needsCheckItems.length > 0}>
            <summary className="cursor-pointer font-semibold text-rose-800">
              Needs check — not applied ({reloadPreview.needsCheckItems.length})
            </summary>
            <div className="mt-2 max-h-56 overflow-auto divide-y rounded border border-rose-200 bg-white">
              {reloadPreview.needsCheckItems.map(item => (
                <div key={item.code} className="p-2">
                  <span className="font-mono font-semibold">{item.code}</span> · {item.title}
                  <div className="text-slate-600">
                    Unit: {item.unit || "missing"} · Output: {item.shiftOutput > 0 ? item.shiftOutput : "missing"}
                    {" · "}{item.reasons.join(" ")}
                  </div>
                </div>
              ))}
              {reloadPreview.needsCheckItems.length === 0 && <p className="p-2 text-slate-600">None</p>}
            </div>
          </details>
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-sky-800">
              Rate-only items ({reloadPreview.rateOnlyItems.length})
            </summary>
            <div className="mt-2 max-h-40 overflow-auto grid sm:grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
              {reloadPreview.rateOnlyItems.map(item => (
                <span key={item.code}>
                  <span className="font-mono">{item.code}</span> · {item.title} · {item.unit} · output {item.shiftOutput}
                </span>
              ))}
              {reloadPreview.rateOnlyItems.length === 0 && <span>None</span>}
            </div>
          </details>
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold">
              Outside workbook items preserved ({reloadPreview.counts.preservedOutsideWorkbook})
            </summary>
            <div className="mt-2 max-h-40 overflow-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-slate-600">
              {reloadPreview.preservedOutsideWorkbookItems.map(item => (
                <span key={item.code}><span className="font-mono">{item.code}</span> · {item.description} · {item.unit}</span>
              ))}
              {reloadPreview.preservedOutsideWorkbookItems.length === 0 && <span>None</span>}
            </div>
          </details>
            </div>
          </details>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!reloadFile || reloadApplyMutation.isPending}
              onClick={() => reloadApplyMutation.mutate()}
              data-testid="button-apply-morth-reload"
            >
              {reloadApplyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}Apply reviewed MoRTH changes
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setReloadPreview(null); setReloadFile(null); }}>Cancel</Button>
          </div>
        </section>
      )}

      {reloadResult && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm" data-testid="morth-reload-result">
          <p className="font-semibold text-emerald-900">Reload complete. {reloadResult.affectedBoqItems.length} mapped BOQ item(s) need review and re-linking.</p>
          {reloadResult.affectedBoqItems.length > 0 && (
            <ul className="mt-2 max-h-48 overflow-auto text-xs space-y-1">
              {reloadResult.affectedBoqItems.map(item => (
                <li key={item.boqItemId}>{item.projectName ?? "Project"} · {item.itemCode ?? "BOQ item"} · {item.description} · {item.linkedAs.join(", ")}{item.recipeManualOverride === true ? " · manual recipe protected (recipes unchanged)" : ""}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Import result summary */}
      {importResult && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-teal-800">Import complete — {importResult.sourceName} ({importResult.sourceCode})</p>
            <button onClick={() => setImportResult(null)} className="text-xs text-muted-foreground hover:text-slate-700">dismiss</button>
          </div>
          <div className="flex gap-4 text-[13px] text-slate-700">
            <span>✓ {importResult.itemsInserted} inserted</span>
            <span>↻ {importResult.itemsUpdated} updated</span>
            <span>⚙ {importResult.equipment} equip rows</span>
            <span>👷 {importResult.labour} labour rows</span>
            <span>📦 {importResult.materials} material rows</span>
          </div>
          {importResult.errors.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-red-600 cursor-pointer">{importResult.errors.length} row error(s)</summary>
              <ul className="mt-1 text-xs text-red-700 space-y-0.5 ml-3">
                {importResult.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</div>
      ) : !hasSource ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <AlertCircle className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium">No norm sources loaded yet.</p>
          <p className="text-xs text-center max-w-xs">
            Use the Owner-only <span className="font-semibold text-slate-700">Reload MoRTH book</span> control to review and apply MoRTH updates. Other books stay separate.
          </p>
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
                    <p className="text-sm font-mono font-bold text-teal-700">{src.code}</p>
                    <p className="text-sm font-semibold leading-tight mt-0.5">{src.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{src.authority} · {src.year}</p>
                  </div>
                  <Badge className="bg-teal-100 text-teal-700 border-teal-200 shrink-0">{src.itemCount} items</Badge>
                </div>
                {src.description && <p className="text-[12px] text-muted-foreground mt-2 line-clamp-2">{src.description}</p>}
              </button>
            ))}
          </div>

          {/* Tabs: Browse / Search */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "browse" | "search")}>
            <TabsList className="h-8">
              <TabsTrigger value="browse" className="text-sm h-7">Browse Source</TabsTrigger>
              <TabsTrigger value="search" className="text-sm h-7"><Search className="w-3 h-3 mr-1" />Search All</TabsTrigger>
            </TabsList>

            <TabsContent value="browse" className="mt-3">
              {selectedSourceId && activeSource ? (
                <div className="rounded-xl border p-4 min-h-[400px]">
                  <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                    {activeSource.name} — {activeSource.itemCount} items{sectorFilter ? ` · filtered: ${sectorFilter}` : ""}
                  </p>
                  <SourceItemsList
                    sourceId={selectedSourceId}
                    sourceCode={activeSource?.code ?? ""}
                    sourceName={activeSource?.name ?? ""}
                    sectorFilter={sectorFilter || undefined}
                    includeOtherBooks={showOtherBooks}
                  />
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
                <SearchPanel sectorFilter={sectorFilter || undefined} includeOtherBooks={showOtherBooks} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
