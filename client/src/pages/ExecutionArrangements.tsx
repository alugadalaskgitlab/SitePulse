/**
 * Instruction 027 §12-15 — Execution Arrangements register.
 *
 * Project-level commercial/audit register of every execution arrangement:
 * who is doing what, on which stretch, at what rate/value, with which
 * effective status and any pending revision. No duplicate editor — the Open
 * action drives into the same stretch panel / dialog used everywhere else.
 */
import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { executionArrangementCategoryForItem, bituminousItemTypeOf } from "@shared/planningEngine";
import { boqItemDisplayName } from "@shared/boqItemName";
import {
  deriveExecutionState,
  EXECUTION_STATE_COLORS,
  EXECUTION_STATE_LABELS,
  type ExecutionState,
} from "@shared/executionState";
import { ArrangementStatusBadge, EarthworkArrangementDialog } from "@/components/EarthworkArrangementDialog";
import { BarArrangementPanel } from "@/components/BarArrangementPanel";
import { useProjectArrangements, type ProjectArrangement } from "@/components/ExecutionStateBadge";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateArrangementQueries } from "@/lib/arrangementCache";

interface ProgrammeBar {
  id: number;
  boqItemId: number;
  reachLabel: string | null;
  side?: string | null;
  chainageFrom: number | null;
  chainageTo: number | null;
  plannedQty: number;
  unit: string | null;
}

interface ScopeSegmentRow {
  id: number;
  segmentType: string;
  status?: string | null;
  label?: string | null;
  chainageFrom: number | string;
  chainageTo: number | string;
  side?: string | null;
}

type RegisterArrangement = ProjectArrangement & {
  materialLabel?: string | null;
  reachLabel?: string | null;
  chainageFrom?: number | null;
  chainageTo?: number | null;
  scopeSegmentIds?: number[] | null;
  agreedRate?: number | null;
  completedQty?: number | null;
  mobilisationDate?: string | null;
  plannedStartDate?: string | null;
  targetCompletionDate?: string | null;
  plannedDailyOutput?: number | null;
  components?: Record<string, string> | null;
  uom?: string | null;
  workCategory?: string | null;
  bituminousItemType?: string | null;
};

const CATEGORY_LABELS: Record<string, string> = { earthwork: "Earthwork", bituminous: "Bituminous" };

const STATE_FILTERS: Array<{ value: ExecutionState | "all" | "pending_revision"; label: string }> = [
  { value: "all", label: "All states" },
  ...Object.entries(EXECUTION_STATE_LABELS).map(([value, label]) => ({ value: value as ExecutionState, label })),
  { value: "pending_revision", label: "Pending Revision" },
];

export default function ExecutionArrangements() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id ?? "0", 10);
  const queryClient = useQueryClient();

  const [stateFilter, setStateFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [openPanel, setOpenPanel] = useState<{ barId: number; boqItemId: number; label: string; qty: number; unit: string } | null>(null);
  const [editTarget, setEditTarget] = useState<RegisterArrangement | null>(null);
  // Instruction 031 B1: Open always shows the arrangement detail first.
  const [detailTargetId, setDetailTargetId] = useState<number | null>(null);
  // Instruction 030: the register is now where arrangements are CREATED too.
  const [showCreatePicker, setShowCreatePicker] = useState(false);
  const [createItemId, setCreateItemId] = useState<number | null>(null);

  const { arrangements, allocations } = useProjectArrangements(projectId, projectId > 0);
  const { data: bars = [], isLoading: barsLoading } = useQuery<ProgrammeBar[]>({
    queryKey: ["/api/boq/projects", projectId, "programme"],
    queryFn: () => fetch(`/api/boq/projects/${projectId}/programme`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: projectId > 0,
  });
  const barById = useMemo(() => new Map(bars.map(b => [b.id, b])), [bars]);

  // Instruction 031 B6: resolve scope_segment_ids → reach labels for the register column.
  const { data: scopeSegments = [] } = useQuery<ScopeSegmentRow[]>({
    queryKey: [`/api/boq/projects/${projectId}/scope-segments`],
    queryFn: () => fetch(`/api/boq/projects/${projectId}/scope-segments`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: projectId > 0,
    staleTime: 30_000,
  });
  const segById = useMemo(() => new Map(scopeSegments.map(s => [Number(s.id), s])), [scopeSegments]);

  /** B6 — "Whole eligible scope" / "Reach 1, Reach 2" / "Custom Ch. 2.400–3.100" */
  const applicableScopeLabel = (a: RegisterArrangement): string => {
    const ids = Array.isArray(a.scopeSegmentIds) ? a.scopeSegmentIds.map(Number) : [];
    if (ids.length > 0) {
      return ids.map(id => {
        const s = segById.get(id);
        if (!s) return `Reach #${id}`;
        const name = (s.label && String(s.label).trim()) || `Reach #${id}`;
        // Flag linked reaches that are no longer confirmed (scope was revised
        // after linking) so the register never silently presents stale scope.
        return s.status === "confirmed" ? name : `${name} (${s.status})`;
      }).join(", ");
    }
    if (a.chainageFrom != null && a.chainageTo != null) {
      return `Custom Ch. ${Number(a.chainageFrom).toFixed(3)}–${Number(a.chainageTo).toFixed(3)}`;
    }
    if (a.reachLabel) return a.reachLabel; // legacy free text (B7)
    return "Whole eligible scope";
  };

  // Arrangement-eligible BOQ items for the New-arrangement picker
  interface PickerItem { id: number; itemCode?: string | null; description: string; displayName?: string | null; itemName?: string | null; currentQty?: number; unit?: string | null; canonicalUnit?: string | null; }
  const { data: allItems = [] } = useQuery<PickerItem[]>({
    queryKey: ["/api/boq/projects", projectId, "items"],
    queryFn: () => fetch(`/api/boq/projects/${projectId}/items`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: projectId > 0 && showCreatePicker,
  });
  const eligibleItems = useMemo(
    () => allItems.filter(it => { try { return executionArrangementCategoryForItem(it as any) != null; } catch { return false; } }),
    [allItems],
  );
  const createItem = createItemId != null ? eligibleItems.find(it => it.id === createItemId) ?? null : null;
  const createCategory = useMemo<"earthwork" | "bituminous">(() => {
    if (!createItem) return "earthwork";
    try { return executionArrangementCategoryForItem(createItem as any) ?? "earthwork"; } catch { return "earthwork"; }
  }, [createItem]);
  const createItemType = useMemo<string | null>(() => {
    if (!createItem || createCategory !== "bituminous") return null;
    try { return bituminousItemTypeOf(createItem as any); } catch { return null; }
  }, [createItem, createCategory]);

  const rows = useMemo(() => {
    return (arrangements as RegisterArrangement[])
      .filter(a => !["cancelled"].includes(a.status))
      .map(a => {
        const allocs = allocations.filter(al => al.arrangementId === a.id);
        const linkedQty = allocs.reduce((s, al) => s + Number(al.allocatedQty), 0);
        const stretchLabels = allocs.map(al => {
          const b = barById.get(al.programmeBarId);
          if (!b) return `Bar #${al.programmeBarId}`;
          return b.reachLabel || (b.chainageFrom != null ? `Ch ${b.chainageFrom}–${b.chainageTo}` : `Bar #${b.id}`);
        });
        const state = deriveExecutionState(Number(a.allocatedQty) || 0, [{
          id: a.id, status: a.status, arrangementType: a.arrangementType,
          qtyForScope: Number(a.allocatedQty), agencyName: a.agencyName,
          components: a.components ?? null, pendingRevision: a.pendingRevision ?? null,
        }], {
          uom: a.uom ?? "CUM",
          category: (a.workCategory as "earthwork" | "bituminous") ?? "earthwork",
          itemType: a.bituminousItemType ?? null,
        });
        const qty = Number(a.allocatedQty) || 0;
        const rate = a.agreedRate != null ? Number(a.agreedRate) : null;
        const value = rate != null ? qty * rate : null;
        const completed = Number(a.completedQty ?? 0);
        return {
          arr: a, allocs, linkedQty, stretchLabels, state,
          qty, rate, value, completed, balance: Math.max(0, qty - completed),
        };
      })
      .filter(r => {
        if (categoryFilter !== "all" && (r.arr.workCategory ?? "earthwork") !== categoryFilter) return false;
        if (stateFilter === "pending_revision") return r.arr.pendingRevision != null;
        if (stateFilter !== "all" && r.state.state !== stateFilter) return false;
        if (agencyFilter && !(r.arr.agencyName ?? "").toLowerCase().includes(agencyFilter.toLowerCase())) return false;
        if (itemFilter && !(`${r.arr.materialLabel ?? ""} ${r.arr.boqItemId ?? ""}`).toLowerCase().includes(itemFilter.toLowerCase())) return false;
        return true;
      });
  }, [arrangements, allocations, barById, stateFilter, categoryFilter, agencyFilter, itemFilter]);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={`/work-program/${projectId}`} className="inline-flex items-center gap-1 text-[12px] text-teal-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Work Programme
        </Link>
        <h1 className="text-lg font-semibold text-slate-800">Execution Arrangements</h1>
        <span className="text-[12px] text-slate-500">{rows.length} arrangement{rows.length !== 1 ? "s" : ""}</span>
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-8 text-[12px]"
          onClick={() => { setShowCreatePicker(v => !v); setCreateItemId(null); }}
          data-testid="button-new-arrangement"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> New arrangement
        </Button>
        <Link href={`/work-program/${projectId}/earthwork`} className="text-[12px] text-teal-600 hover:underline">
          Earthwork Classification & Cut/Fill →
        </Link>
      </div>

      {showCreatePicker && (
        <Card className="p-3 flex items-center gap-2 flex-wrap" data-testid="create-arrangement-picker">
          <span className="text-[12px] font-semibold text-slate-600">Create arrangement for BOQ item:</span>
          <select
            className="h-8 min-w-[280px] max-w-full rounded border border-slate-300 bg-white px-2 text-[12px]"
            value={createItemId ?? ""}
            onChange={e => setCreateItemId(e.target.value ? Number(e.target.value) : null)}
            data-testid="select-create-item"
          >
            <option value="">Select an arrangement-eligible item…</option>
            {eligibleItems.map(it => (
              <option key={it.id} value={it.id}>
                {(it.itemCode ? `${it.itemCode} — ` : "") + boqItemDisplayName(it as any)} ({Number(it.currentQty ?? 0).toLocaleString()} {it.canonicalUnit ?? it.unit ?? ""})
              </option>
            ))}
          </select>
          {eligibleItems.length === 0 && (
            <span className="text-[12px] text-slate-500">No earthwork/bituminous items found in this project.</span>
          )}
        </Card>
      )}

      {/* §14 filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="h-8 rounded border border-slate-300 bg-white px-2 text-[12px]"
          value={stateFilter}
          onChange={e => setStateFilter(e.target.value)}
          data-testid="filter-execution-state"
        >
          {STATE_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        {/* Instruction 028 §31: work-category filter */}
        <select
          className="h-8 rounded border border-slate-300 bg-white px-2 text-[12px]"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          data-testid="filter-work-category"
        >
          <option value="all">All categories</option>
          <option value="earthwork">Earthwork</option>
          <option value="bituminous">Bituminous</option>
        </select>
        <Input className="h-8 w-44 text-[12px]" placeholder="Filter by agency…" value={agencyFilter} onChange={e => setAgencyFilter(e.target.value)} data-testid="filter-agency" />
        <Input className="h-8 w-44 text-[12px]" placeholder="Filter by BOQ item…" value={itemFilter} onChange={e => setItemFilter(e.target.value)} data-testid="filter-boq-item" />
      </div>

      {barsLoading && <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead>BOQ Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Applicable Scope</TableHead>
              <TableHead>Programme Coverage</TableHead>
              <TableHead>Agency</TableHead>
              <TableHead>Execution State</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Mobilisation</TableHead>
              <TableHead className="text-right">Done</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={15} className="text-center text-slate-400 text-sm py-8">No execution arrangements match the current filters.</TableCell></TableRow>
            )}
            {rows.map(r => {
              const c = EXECUTION_STATE_COLORS[r.state.state];
              const uom = r.arr.uom ?? "CUM";
              return (
                <TableRow key={r.arr.id} className="text-[12px]" data-testid={`register-row-${r.arr.id}`}>
                  <TableCell className="max-w-[200px] truncate" title={r.arr.materialLabel ?? undefined}>
                    {r.arr.materialLabel ?? (r.arr.boqItemId != null ? `BOQ item #${r.arr.boqItemId}` : "—")}
                  </TableCell>
                  <TableCell>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${(r.arr.workCategory ?? "earthwork") === "bituminous" ? "bg-stone-100 border-stone-300 text-stone-700" : "bg-amber-50 border-amber-200 text-amber-800"}`} data-testid={`register-category-${r.arr.id}`}>
                      {CATEGORY_LABELS[r.arr.workCategory ?? "earthwork"] ?? r.arr.workCategory}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate" title={applicableScopeLabel(r.arr)} data-testid={`register-scope-${r.arr.id}`}>
                    {applicableScopeLabel(r.arr)}
                  </TableCell>
                  <TableCell className="max-w-[170px]" data-testid={`register-coverage-${r.arr.id}`}>
                    {r.allocs.length > 0 ? (
                      <button
                        className="text-[11px] text-teal-700 hover:underline text-left whitespace-nowrap"
                        onClick={() => setDetailTargetId(r.arr.id)}
                        title={r.stretchLabels.join(", ")}
                        data-testid={`button-view-allocations-${r.arr.id}`}
                      >
                        {r.allocs.length} bar{r.allocs.length !== 1 ? "s" : ""} · {r.linkedQty.toLocaleString()} {uom} allocated
                      </button>
                    ) : (
                      <span className="text-slate-400 text-[11px]">Not linked to programme</span>
                    )}
                  </TableCell>
                  <TableCell>{r.arr.agencyName ?? "—"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${c.bg} ${c.border} ${c.text}`}>
                      {EXECUTION_STATE_LABELS[r.state.state]}
                    </span>
                    {r.arr.pendingRevision != null && (
                      <span className="ml-1 rounded bg-purple-100 border border-purple-300 text-purple-700 px-1 text-[10px] font-semibold" data-testid={`register-pending-${r.arr.id}`}>Rev</span>
                    )}
                  </TableCell>
                  <TableCell className="capitalize">{(r.arr.arrangementType ?? "").replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-right font-mono">{r.qty.toLocaleString()} {uom}</TableCell>
                  <TableCell className="text-right font-mono">{r.rate != null ? `₹${r.rate.toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.value != null ? `₹${(r.value / 100000).toFixed(2)} L` : "—"}</TableCell>
                  <TableCell><ArrangementStatusBadge status={r.arr.status} /></TableCell>
                  <TableCell>{r.arr.mobilisationDate ?? r.arr.plannedStartDate ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.completed > 0 ? r.completed.toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.balance.toLocaleString()}</TableCell>
                  <TableCell>
                    {/* Instruction 031 B1: Open always opens the arrangement itself first */}
                    <button
                      className="text-[11px] text-teal-600 hover:underline whitespace-nowrap"
                      onClick={() => setDetailTargetId(r.arr.id)}
                      data-testid={`button-open-${r.arr.id}`}
                    >
                      Open →
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Instruction 031 B1 — arrangement detail: arrangement first, bars as children */}
      {detailTargetId != null && (() => {
        const r = rows.find(x => x.arr.id === detailTargetId)
          ?? (arrangements as RegisterArrangement[]).filter(a => a.id === detailTargetId).map(a => ({
            arr: a,
            allocs: allocations.filter(al => al.arrangementId === a.id),
            linkedQty: allocations.filter(al => al.arrangementId === a.id).reduce((s, al) => s + Number(al.allocatedQty), 0),
          }))[0];
        if (!r) return null;
        const a = r.arr as RegisterArrangement;
        const uom = a.uom ?? "CUM";
        return (
          <Dialog open onOpenChange={o => { if (!o) setDetailTargetId(null); }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="arrangement-detail">
              <DialogHeader>
                <DialogTitle className="text-base">
                  {a.materialLabel ?? `Arrangement #${a.id}`}
                </DialogTitle>
                <p className="text-[12px] text-slate-500">
                  {(a.arrangementType ?? "").replace(/_/g, " ")} · <ArrangementStatusBadge status={a.status} />
                </p>
              </DialogHeader>
              <div className="space-y-3 text-[12px]">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="text-slate-500">Agency:</span> {a.agencyName ?? "—"}</div>
                  <div><span className="text-slate-500">Allocated:</span> <span className="font-mono">{Number(a.allocatedQty).toLocaleString()} {uom}</span></div>
                  <div className="col-span-2"><span className="text-slate-500">Applicable Scope:</span> {applicableScopeLabel(a)}</div>
                </div>

                <div className="space-y-1">
                  <p className="font-semibold text-slate-700">
                    Programme Coverage — {r.allocs.length} bar{r.allocs.length !== 1 ? "s" : ""} · {Number(r.linkedQty).toLocaleString()} {uom} allocated
                  </p>
                  {r.allocs.length === 0 && (
                    <p className="text-slate-400">Not linked to any programme bar{a.reachLabel ? ` — legacy scope: ${a.reachLabel}` : ""}.</p>
                  )}
                  {r.allocs.length > 0 && (
                    <div className="border border-slate-200 rounded divide-y" data-testid="detail-bar-list">
                      {r.allocs.map(al => {
                        const b = barById.get(al.programmeBarId);
                        const label = b ? (b.reachLabel || (b.chainageFrom != null ? `Ch ${b.chainageFrom}–${b.chainageTo}` : `Bar #${b.id}`)) : `Bar #${al.programmeBarId}`;
                        return (
                          <div key={al.id} className="flex items-center gap-2 px-2 py-1.5" data-testid={`detail-bar-${al.programmeBarId}`}>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-slate-700">{label}</span>
                              {b?.side && <span className="ml-1.5 rounded bg-slate-100 border border-slate-200 px-1 text-[10px] uppercase">{b.side}</span>}
                              {b?.chainageFrom != null && b.reachLabel && (
                                <span className="ml-1.5 text-slate-400 font-mono text-[11px]">Ch. {b.chainageFrom}–{b.chainageTo}</span>
                              )}
                            </div>
                            <span className="font-mono text-slate-600 shrink-0">{Number(al.allocatedQty).toLocaleString()} {uom}</span>
                            {al.arrangementStatus && <span className="text-[10px] text-slate-400 shrink-0">{al.arrangementStatus}</span>}
                            {b && (
                              <button
                                className="text-[11px] text-teal-600 hover:underline shrink-0"
                                onClick={() => {
                                  setDetailTargetId(null);
                                  setOpenPanel({
                                    barId: b.id, boqItemId: al.boqItemId, label,
                                    qty: Number(b.plannedQty ?? 0), unit: b.unit ?? uom,
                                  });
                                }}
                                data-testid={`button-open-bar-${al.programmeBarId}`}
                              >
                                Open bar →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="h-7 text-[11px]" onClick={() => { setDetailTargetId(null); setEditTarget(a); }} data-testid="button-edit-arrangement">
                    Edit arrangement
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDetailTargetId(null)}>Close</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {openPanel && (
        <BarArrangementPanel
          open={!!openPanel}
          onClose={() => setOpenPanel(null)}
          projectId={projectId}
          barId={openPanel.barId}
          boqItemId={openPanel.boqItemId}
          barLabel={openPanel.label}
          barPlannedQty={openPanel.qty}
          unit={openPanel.unit}
        />
      )}
      {createItem && (
        <EarthworkArrangementDialog
          open={!!createItem}
          onClose={() => { setCreateItemId(null); setShowCreatePicker(false); }}
          onSaved={() => invalidateArrangementQueries(queryClient, projectId)}
          projectId={projectId}
          boqItemId={createItem.id}
          materialLabel={boqItemDisplayName(createItem as any)}
          boqQty={Number(createItem.currentQty ?? 0)}
          workCategory={createCategory}
          bituminousItemType={createItemType}
          uom={createItem.canonicalUnit ?? createItem.unit ?? undefined}
        />
      )}
      {editTarget && (
        <EarthworkArrangementDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => invalidateArrangementQueries(queryClient, projectId)}
          projectId={projectId}
          boqItemId={editTarget.boqItemId}
          materialLabel={editTarget.materialLabel ?? `Arrangement #${editTarget.id}`}
          editArrangement={editTarget as any}
          workCategory={(editTarget.workCategory as "earthwork" | "bituminous") ?? "earthwork"}
          bituminousItemType={editTarget.bituminousItemType ?? null}
        />
      )}
    </div>
  );
}
