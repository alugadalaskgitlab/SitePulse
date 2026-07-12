import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Search, RefreshCw, AlertTriangle, CheckCircle2, Filter, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { shortItemName } from "@/lib/itemName";
import type { BoqItemWithCategory } from "@shared/schema";

const DPR_METHOD_OPTIONS = [
  { value: "", label: "— Auto (from BOQ unit) —" },
  { value: "CUM_LWT", label: "CUM — Length × Width × Thickness" },
  { value: "SQM_LW", label: "SQM — Length × Width" },
  { value: "RMT_L", label: "RMT — Length only" },
  { value: "MT_manual", label: "MT — Manual quantity" },
  { value: "NOS_manual", label: "NOS — Manual count" },
  { value: "LS_manual", label: "LS — Lump-sum manual" },
];

const WORK_TYPE_OPTIONS = [
  { value: "road", label: "Road / Linear" },
  { value: "structure", label: "Structure / Point" },
];

type ItemRow = BoqItemWithCategory & {
  displayName?: string | null;
  dprMeasurementMethod?: string | null;
  includeInDpr?: boolean;
  includeInProcurement?: boolean;
  needsReview?: boolean;
};

function ItemEditRow({
  item,
  projectId,
}: {
  item: ItemRow;
  projectId: number;
}) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(item.displayName ?? "");
  const [dprMethod, setDprMethod] = useState(item.dprMeasurementMethod ?? "");
  const [workType, setWorkType] = useState(item.planningWorkType ?? "road");
  const [includeInDpr, setIncludeInDpr] = useState(item.includeInDpr ?? true);
  const [includeInPlanning, setIncludeInPlanning] = useState(item.includedInPlanning ?? true);
  const [includeInProcurement, setIncludeInProcurement] = useState(item.includeInProcurement ?? true);
  const [needsReview, setNeedsReview] = useState(item.needsReview ?? false);

  const patch = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/boq/items/${item.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "items"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  function save(extra: Record<string, unknown> = {}) {
    patch.mutate({
      displayName: displayName.trim() || null,
      dprMeasurementMethod: dprMethod || null,
      planningWorkType: workType,
      includeInDpr,
      includedInPlanning: includeInPlanning,
      includeInProcurement,
      needsReview,
      ...extra,
    });
  }

  const autoShort = shortItemName(item.itemName || item.description);
  const isSaving = patch.isPending;

  return (
    <tr
      className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors ${isSaving ? "opacity-60" : ""} ${needsReview ? "bg-amber-50/40" : ""}`}
      data-testid={`review-row-${item.id}`}
    >
      <td className="py-2 px-3 text-xs text-slate-500 font-mono whitespace-nowrap">{item.itemCode ?? "—"}</td>
      <td className="py-2 px-3 max-w-[220px]">
        <p className="text-xs text-slate-500 truncate" title={item.description}>{item.description}</p>
      </td>
      <td className="py-2 px-3 min-w-[180px]">
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          onBlur={() => save()}
          placeholder={autoShort}
          className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-teal-400"
          data-testid={`input-display-name-${item.id}`}
        />
      </td>
      <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">
        {item.categoryName ?? <span className="text-amber-500 font-medium">Unmapped</span>}
      </td>
      <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">{item.unit}</td>
      <td className="py-2 px-3 min-w-[130px]">
        <Select
          value={workType}
          onValueChange={v => { setWorkType(v); save({ planningWorkType: v }); }}
        >
          <SelectTrigger className="h-7 text-xs" data-testid={`select-work-type-${item.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORK_TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 px-3 min-w-[170px]">
        <Select
          value={dprMethod}
          onValueChange={v => { setDprMethod(v); save({ dprMeasurementMethod: v || null }); }}
        >
          <SelectTrigger className="h-7 text-xs" data-testid={`select-dpr-method-${item.id}`}>
            <SelectValue placeholder="Auto" />
          </SelectTrigger>
          <SelectContent>
            {DPR_METHOD_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 px-3 text-center">
        <Switch
          checked={includeInDpr}
          onCheckedChange={v => { setIncludeInDpr(v); save({ includeInDpr: v }); }}
          data-testid={`switch-include-dpr-${item.id}`}
        />
      </td>
      <td className="py-2 px-3 text-center">
        <Switch
          checked={includeInPlanning}
          onCheckedChange={v => { setIncludeInPlanning(v); save({ includedInPlanning: v }); }}
          data-testid={`switch-include-planning-${item.id}`}
        />
      </td>
      <td className="py-2 px-3 text-center">
        <Switch
          checked={includeInProcurement}
          onCheckedChange={v => { setIncludeInProcurement(v); save({ includeInProcurement: v }); }}
          data-testid={`switch-include-procurement-${item.id}`}
        />
      </td>
      <td className="py-2 px-3 text-center">
        <Switch
          checked={needsReview}
          onCheckedChange={v => { setNeedsReview(v); save({ needsReview: v }); }}
          data-testid={`switch-needs-review-${item.id}`}
        />
      </td>
      <td className="py-2 px-3">
        {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" />}
      </td>
    </tr>
  );
}

export default function BoqItemReview() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id);
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "needsReview" | "unmapped">("all");

  const { data: project } = useQuery<any>({
    queryKey: ["/api/boq/projects", projectId],
    queryFn: () => fetch(`/api/boq/projects/${projectId}`).then(r => r.json()),
    enabled: !isNaN(projectId),
  });

  const { data: items = [], isLoading } = useQuery<ItemRow[]>({
    queryKey: ["/api/boq/projects", projectId, "items"],
    queryFn: () => fetch(`/api/boq/projects/${projectId}/items`).then(r => r.json()),
    enabled: !isNaN(projectId),
  });

  const autoMap = useMutation({
    mutationFn: () => apiRequest("POST", `/api/boq/projects/${projectId}/auto-map-all`, {}),
    onSuccess: () => {
      toast({ title: "Auto-classify complete", description: "Items have been re-mapped." });
      queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "items"] });
    },
    onError: () => toast({ title: "Auto-classify failed", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    let list = items as ItemRow[];
    if (filterMode === "needsReview") list = list.filter(i => i.needsReview);
    else if (filterMode === "unmapped") list = list.filter(i => !i.categoryName?.trim());
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.description?.toLowerCase().includes(q) ||
        i.itemCode?.toLowerCase().includes(q) ||
        i.categoryName?.toLowerCase().includes(q) ||
        (i.displayName ?? "")?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filterMode, search]);

  const needsReviewCount = (items as ItemRow[]).filter(i => i.needsReview).length;
  const unmappedCount = (items as ItemRow[]).filter(i => !i.categoryName?.trim()).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/work-program/${projectId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5" data-testid="btn-back">
              <ArrowLeft className="w-4 h-4" />
              Back to Project
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
              BOQ Item Review
            </h1>
            {project?.name && (
              <p className="text-sm text-slate-500 truncate">{project.name}</p>
            )}
          </div>
          <Button
            onClick={() => autoMap.mutate()}
            disabled={autoMap.isPending}
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            data-testid="btn-auto-classify"
          >
            {autoMap.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Auto-classify
          </Button>
        </div>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant="outline" className="text-slate-600">
            {items.length} items total
          </Badge>
          {needsReviewCount > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {needsReviewCount} flagged for review
            </Badge>
          )}
          {unmappedCount > 0 && (
            <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
              {unmappedCount} without category
            </Badge>
          )}
          {needsReviewCount === 0 && unmappedCount === 0 && items.length > 0 && (
            <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              All items mapped
            </Badge>
          )}
        </div>

        {/* Filters */}
        <Card className="mb-4">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  placeholder="Search by code, name, or category…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-search"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <Select value={filterMode} onValueChange={v => setFilterMode(v as any)}>
                  <SelectTrigger className="h-8 text-sm w-[180px]" data-testid="select-filter-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All items</SelectItem>
                    <SelectItem value="needsReview">Needs review only</SelectItem>
                    <SelectItem value="unmapped">Unmapped only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-500">{filtered.length} shown</p>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading items…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No items match the current filter.</div>
            ) : (
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900">
                    <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Code</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">Full Description</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">Short Name (editable)</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Category</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Unit</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Work Type</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">DPR Method</th>
                    <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">DPR</th>
                    <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">Programme</th>
                    <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">Procurement</th>
                    <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">Needs Review</th>
                    <th className="py-2 px-3 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <ItemEditRow key={item.id} item={item} projectId={projectId} />
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
