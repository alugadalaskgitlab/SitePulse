/**
 * BarArrangementPanel — Instruction 026 §7-8.
 *
 * Per-bar execution-arrangement panel opened from an earthwork bar in the Work
 * Programme. The Work Programme is now the primary place where execution
 * arrangements are decided and linked to specific stretches (bars), so demand
 * exclusion can be phased by the bar's quantity and dates.
 *
 * Shows: arrangement status chips (incl. "Legacy Arrangement — Stretch Assignment
 * Required"), allocations on this bar, remaining quantity, link-existing form,
 * create-new (prefilled from the bar), and a link to Earthwork Control.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ChevronDown, ChevronRight, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { ArrangementStatusBadge, ArrangementSummaryCard, EarthworkArrangementDialog } from "@/components/EarthworkArrangementDialog";
import { invalidateArrangementQueries } from "@/lib/arrangementCache";

const ACTIVE_STATUSES = new Set(["approved", "mobilisation_pending", "in_progress", "on_hold"]);
const LINKABLE_STATUSES = new Set(["draft", "submitted", "approved", "mobilisation_pending", "in_progress", "on_hold"]);

interface Arrangement {
  id: number;
  status: string;
  agencyName: string | null;
  arrangementType: string | null;
  allocatedQty: number;
  uom: string | null;
  reachLabel: string | null;
  boqItemId: number | null;
  boqItemAllocations: Array<{ boqItemId: number; qty: number }> | null;
  pendingRevision?: Record<string, unknown> | null;
}

interface BarAllocation {
  id: number;
  arrangementId: number;
  programmeBarId: number;
  boqItemId: number;
  allocatedQty: number;
  arrangementStatus?: string;
}

export function BarArrangementPanel({
  open, onClose, projectId, barId, boqItemId, barLabel, barPlannedQty, unit,
  workCategory = "earthwork", bituminousItemType = null,
}: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  barId: number;
  boqItemId: number;
  barLabel: string;
  barPlannedQty: number;
  unit: string;
  /** Instruction 028: category of the bar's BOQ item (drives dialog vocabulary). */
  workCategory?: "earthwork" | "bituminous";
  bituminousItemType?: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [linkArrId, setLinkArrId] = useState<number | null>(null);
  const [linkQty, setLinkQty] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  // Instruction 027 §5-7: this panel is the single detail source — expandable
  // full-detail cards (incl. pending revision + history) and controlled editing.
  const [expandedArrId, setExpandedArrId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<Arrangement | null>(null);

  const { data: arrangements = [], isLoading: arrsLoading } = useQuery<Arrangement[]>({
    queryKey: ["earthwork-arrangements-item", projectId, boqItemId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/earthwork-arrangements/item/${boqItemId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const { data: allAllocations = [] } = useQuery<BarAllocation[]>({
    queryKey: ["/api/boq/projects", projectId, "arrangement-programme-allocations"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/arrangement-programme-allocations`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const activeAllocations = useMemo(
    () => allAllocations.filter(a => !["cancelled", "rejected"].includes(String(a.arrangementStatus ?? ""))),
    [allAllocations],
  );
  const barAllocations = useMemo(() => activeAllocations.filter(a => a.programmeBarId === barId), [activeAllocations, barId]);
  const barAllocatedTotal = barAllocations.reduce((s, a) => s + Number(a.allocatedQty), 0);
  const barRemaining = Math.max(0, barPlannedQty - barAllocatedTotal);

  const linkedByArrangement = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of activeAllocations) m.set(a.arrangementId, (m.get(a.arrangementId) ?? 0) + Number(a.allocatedQty));
    return m;
  }, [activeAllocations]);

  const visibleArrs = arrangements.filter(a => !["cancelled", "rejected"].includes(a.status));
  const linkableArrs = visibleArrs.filter(a => {
    if (!LINKABLE_STATUSES.has(a.status)) return false;
    const unlinked = Number(a.allocatedQty) - (linkedByArrangement.get(a.id) ?? 0);
    return unlinked > 0.001;
  });
  const arrById = new Map(visibleArrs.map(a => [a.id, a]));

  const refresh = () => invalidateArrangementQueries(queryClient, projectId);

  const linkMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/earthwork-arrangements/${linkArrId}/programme-allocations`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programmeBarId: barId, allocatedQty: Number(linkQty) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Arrangement linked to stretch", description: `${linkQty} ${unit} now phased to this bar's programme.` });
      setLinkArrId(null); setLinkQty("");
      refresh();
    },
    onError: (err: Error) => toast({ title: "Link failed", description: err.message, variant: "destructive" }),
  });

  // Instruction 028 §10: PM/Admin manual classification override (server enforces qto_boq edit)
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const overrideMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/boq/items/${boqItemId}/bulk-classification`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classification: overrideValue, reason: overrideReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Classification updated", description: "Manual override recorded; it takes precedence over auto-detection." });
      setOverrideValue(""); setOverrideReason("");
      refresh();
      queryClient.invalidateQueries({ queryKey: ["boq-items"] });
    },
    onError: (err: Error) => toast({ title: "Override failed", description: err.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: async (alloc: BarAllocation) => {
      const res = await fetch(`/api/earthwork-arrangements/${alloc.arrangementId}/programme-allocations/${alloc.id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Unlink failed");
    },
    onSuccess: () => { toast({ title: "Stretch link removed", description: "Quantity falls back to whole-item (legacy) timing." }); refresh(); },
    onError: (err: Error) => toast({ title: "Unlink failed", description: err.message, variant: "destructive" }),
  });

  return (
    <>
      <Dialog open={open && !showCreate} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Execution Arrangements — {barLabel}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-[12px]">
            <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <span>Stretch quantity: <b>{barPlannedQty.toLocaleString()} {unit}</b></span>
              <span>Unassigned: <b className={barRemaining > 0 ? "text-amber-700" : "text-emerald-700"}>{barRemaining.toLocaleString()} {unit}</b></span>
            </div>

            {arrsLoading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>}

            {/* Allocations on this bar */}
            {barAllocations.length > 0 && (
              <div className="space-y-1.5">
                <div className="font-semibold text-slate-600">Linked to this stretch</div>
                {barAllocations.map(al => {
                  const arr = arrById.get(al.arrangementId);
                  return (
                    <div key={al.id} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5" data-testid={`bar-alloc-${al.id}`}>
                      <Link2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span className="flex-1 truncate">
                        {arr?.agencyName || arr?.arrangementType?.replace(/_/g, " ") || `Arrangement #${al.arrangementId}`}
                        {" — "}<b>{Number(al.allocatedQty).toLocaleString()} {unit}</b>
                      </span>
                      {arr && <ArrangementStatusBadge status={arr.status} />}
                      <button
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="Remove stretch link"
                        onClick={() => unlinkMutation.mutate(al)}
                        disabled={unlinkMutation.isPending}
                        data-testid={`button-unlink-${al.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legacy warning: active arrangements with unassigned quantity */}
            {visibleArrs.filter(a => ACTIVE_STATUSES.has(a.status)).map(a => {
              const unlinked = Number(a.allocatedQty) - (linkedByArrangement.get(a.id) ?? 0);
              if (unlinked <= 0.001) return null;
              return (
                <div key={a.id} className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800" data-testid={`legacy-warning-${a.id}`}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    <b>Legacy Arrangement — Stretch Assignment Required:</b>{" "}
                    {a.agencyName || a.arrangementType?.replace(/_/g, " ") || `#${a.id}`} has{" "}
                    <b>{unlinked.toLocaleString()} {unit}</b> not assigned to any stretch.
                    Until assigned, that quantity is excluded across the whole item's timeline instead of specific stretches.
                  </span>
                </div>
              );
            })}

            {/* Link existing arrangement */}
            {linkableArrs.length > 0 && (
              <div className="space-y-1.5 rounded border border-slate-200 p-2">
                <div className="font-semibold text-slate-600">Link an arrangement to this stretch</div>
                <div className="flex items-center gap-2">
                  <select
                    className="flex-1 h-7 rounded border border-slate-300 bg-white px-1.5 text-[12px]"
                    value={linkArrId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      setLinkArrId(id);
                      if (id != null) {
                        const arr = arrById.get(id);
                        const unlinked = arr ? Number(arr.allocatedQty) - (linkedByArrangement.get(id) ?? 0) : 0;
                        setLinkQty(String(Math.min(unlinked, barRemaining) || ""));
                      }
                    }}
                    data-testid="select-link-arrangement"
                  >
                    <option value="">Select arrangement…</option>
                    {linkableArrs.map(a => (
                      <option key={a.id} value={a.id}>
                        {(a.agencyName || a.arrangementType?.replace(/_/g, " ") || `#${a.id}`)} — {(Number(a.allocatedQty) - (linkedByArrangement.get(a.id) ?? 0)).toLocaleString()} {unit} unassigned ({a.status.replace(/_/g, " ")})
                      </option>
                    ))}
                  </select>
                  <Input
                    className="w-24 h-7 text-[12px]"
                    type="number" min={0} placeholder="Qty"
                    value={linkQty} onChange={e => setLinkQty(e.target.value)}
                    data-testid="input-link-qty"
                  />
                  <Button
                    size="sm" className="h-7 text-[11px] px-2"
                    disabled={linkArrId == null || !(Number(linkQty) > 0) || linkMutation.isPending}
                    onClick={() => linkMutation.mutate()}
                    data-testid="button-link-arrangement"
                  >
                    {linkMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Link"}
                  </Button>
                </div>
              </div>
            )}

            {!arrsLoading && visibleArrs.length === 0 && (
              <div className="text-slate-500">No execution arrangements exist for this BOQ item yet.</div>
            )}

            {/* Instruction 027 §5-7: full arrangement details — single source of truth */}
            {visibleArrs.length > 0 && (
              <div className="space-y-1.5">
                <div className="font-semibold text-slate-600">Arrangement details</div>
                {visibleArrs.map(a => {
                  const expanded = expandedArrId === a.id;
                  const hasPending = a.pendingRevision != null;
                  return (
                    <div key={a.id} className="rounded border border-slate-200" data-testid={`arr-detail-${a.id}`}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50"
                        onClick={() => setExpandedArrId(expanded ? null : a.id)}
                        data-testid={`button-expand-arr-${a.id}`}
                      >
                        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                        <span className="flex-1 truncate">
                          {a.agencyName || a.arrangementType?.replace(/_/g, " ") || `Arrangement #${a.id}`}
                          {" — "}{Number(a.allocatedQty).toLocaleString()} {unit}
                        </span>
                        {hasPending && (
                          <span className="shrink-0 rounded bg-purple-100 border border-purple-300 text-purple-700 px-1 text-[10px] font-semibold">Revision Pending</span>
                        )}
                        <ArrangementStatusBadge status={a.status} />
                      </button>
                      {expanded && (
                        <div className="border-t border-slate-100 p-1.5">
                          <ArrangementSummaryCard
                            arr={a as any}
                            projectId={projectId}
                            onEdit={() => setEditTarget(a)}
                            onCancel={() => { /* cancel flow lives in Procurement summary; keep panel simple */ }}
                            onSaved={refresh}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Instruction 028 §10: PM/Admin manual classification override */}
            <div className="rounded border border-slate-200 p-2 space-y-1.5">
              <div className="font-semibold text-slate-600">Arrangement classification (manual override)</div>
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 h-7 rounded border border-slate-300 bg-white px-1.5 text-[12px]"
                  value={overrideValue}
                  onChange={(e) => setOverrideValue(e.target.value)}
                  data-testid="select-classification-override"
                >
                  <option value="">Select classification…</option>
                  {/* Instruction 030: "Keep auto-detected" is now a real, confirmable
                      choice (it records the auto value as a manual confirmation)
                      instead of a placeholder that left Apply permanently disabled. */}
                  <option value={workCategory === "bituminous" ? "bituminous" : "earthwork"}>
                    Confirm auto-detected ({workCategory === "bituminous" ? "Bituminous" : "Earthwork"})
                  </option>
                  <option value="bituminous">Bituminous Arrangement Eligible</option>
                  <option value="not_bituminous">Not Bituminous</option>
                  <option value="review_required">Review Required</option>
                </select>
                <Button
                  size="sm" variant="outline" className="h-7 text-[11px] px-2"
                  disabled={!overrideValue || overrideMutation.isPending}
                  onClick={() => overrideMutation.mutate()}
                  data-testid="button-apply-classification-override"
                >
                  {overrideMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                </Button>
              </div>
              {!overrideValue && (
                <div className="text-[11px] text-slate-500">Choose a classification to enable Apply.</div>
              )}
              {overrideValue && (
                <Input
                  className="h-7 text-[12px]"
                  placeholder="Reason (recorded in audit log)"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  data-testid="input-classification-reason"
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="outline" size="sm" className="h-7 text-[11px] px-2"
                onClick={() => setShowCreate(true)}
                data-testid="button-create-arrangement-from-bar"
              >
                <Plus className="w-3 h-3 mr-1" /> New arrangement for this stretch
              </Button>
              <Link href={`/work-program/${projectId}/earthwork`} className="text-[11px] text-teal-600 hover:underline">
                Earthwork Classification & Cut/Fill →
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showCreate && (
        <EarthworkArrangementDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSaved={() => { refresh(); }}
          projectId={projectId}
          boqItemId={boqItemId}
          materialLabel={barLabel}
          boqQty={barRemaining > 0 ? barRemaining : barPlannedQty}
          workCategory={workCategory}
          bituminousItemType={bituminousItemType}
          uom={unit || undefined}
        />
      )}

      {/* Instruction 027 §17: controlled editing opens the same dialog */}
      {editTarget && (
        <EarthworkArrangementDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { refresh(); }}
          projectId={projectId}
          boqItemId={editTarget.boqItemId ?? boqItemId}
          materialLabel={barLabel}
          editArrangement={editTarget as any}
          workCategory={workCategory}
          bituminousItemType={bituminousItemType}
          uom={unit || undefined}
        />
      )}
    </>
  );
}
