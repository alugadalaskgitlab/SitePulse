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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";
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
  chainageFrom: number | null;
  chainageTo: number | null;
  plannedQty: number;
  unit: string | null;
}

type RegisterArrangement = ProjectArrangement & {
  materialLabel?: string | null;
  reachLabel?: string | null;
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

  const { arrangements, allocations } = useProjectArrangements(projectId, projectId > 0);
  const { data: bars = [], isLoading: barsLoading } = useQuery<ProgrammeBar[]>({
    queryKey: ["/api/boq/projects", projectId, "programme"],
    queryFn: () => fetch(`/api/boq/projects/${projectId}/programme`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: projectId > 0,
  });
  const barById = useMemo(() => new Map(bars.map(b => [b.id, b])), [bars]);

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
          firstBarAlloc: allocs[0] ?? null,
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
        <Link href={`/work-program/${projectId}/earthwork`} className="text-[12px] text-teal-600 hover:underline">
          Classification & demand view →
        </Link>
      </div>

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
              <TableHead>Stretch / Reach</TableHead>
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
              <TableRow><TableCell colSpan={14} className="text-center text-slate-400 text-sm py-8">No execution arrangements match the current filters.</TableCell></TableRow>
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
                  <TableCell className="max-w-[160px] truncate" title={r.stretchLabels.join(", ")}>
                    {r.stretchLabels.length > 0 ? r.stretchLabels.join(", ") : (r.arr.reachLabel || <span className="text-amber-600" title="Not assigned to a programme stretch">Whole item (legacy)</span>)}
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
                    <button
                      className="text-[11px] text-teal-600 hover:underline whitespace-nowrap"
                      onClick={() => {
                        const al = r.firstBarAlloc;
                        const b = al ? barById.get(al.programmeBarId) : null;
                        if (al && b) {
                          setOpenPanel({
                            barId: b.id, boqItemId: al.boqItemId,
                            label: b.reachLabel || (b.chainageFrom != null ? `Ch ${b.chainageFrom}–${b.chainageTo}` : `Bar #${b.id}`),
                            qty: Number(b.plannedQty ?? 0), unit: b.unit ?? uom,
                          });
                        } else {
                          setEditTarget(r.arr);
                        }
                      }}
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
