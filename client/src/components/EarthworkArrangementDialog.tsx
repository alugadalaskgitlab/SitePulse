/**
 * Instruction 023/024 — Earthwork Execution Arrangement Dialog
 *
 * Allows PM / Admin to record how earthwork / bulk-fill BOQ items will be
 * executed (agency, in-house, client-supplied, etc.).  The dialog is opened
 * from the Execution Arrangements register (Work Program & BOQ). Procurement
 * is read-only about arrangements — no arrangement means normal HLC
 * self-execution, never a required setup.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import type { EarthworkArrangementSummary } from "@shared/planningEngine";
import { deriveEarthworkSourcingBadge, checkCutFillBalance, suggestCutToFillSourceItem } from "@shared/planningEngine";
import { invalidateArrangementQueries } from "@/lib/arrangementCache";
import { deriveExecutionState, EXECUTION_STATE_COLORS } from "@shared/executionState";
import {
  confirmedWorkingReaches,
  scopeConstraints,
  type ScopeSegmentRecordLike,
} from "@shared/autoSequenceScope";
import { resolveEligibleScope, coverageForStretch } from "@shared/projectScope";
import { resolveArrangementApplicableQty } from "@shared/arrangementApplicableQty";
import { rankCutFillSources, roadwayExcavationCandidates, preselectedSourceId, type ChainageCandidate } from "@/lib/cutFillLedger";
import {
  type WorkCategoryKey,
  BITUMINOUS_ARRANGEMENT_TYPE_LABELS,
  BITUMINOUS_COMPONENT_LABELS,
  bituminousComponentsForItemType,
  bituminousDefaultComponents,
  getCategoryDescriptor,
} from "@shared/executionArrangementCategories";
import { boqItemDisplayName } from "@shared/boqItemName";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArrangementType =
  | "fully_outsourced_composite"
  | "vendor_material_delivered"
  | "hlc_source_outsourced_execution"
  | "hlc_in_house"
  | "partly_outsourced"
  | "client_supplied"
  | "reused_excavated"
  | "not_decided";

export type ComponentResponsibility = "hlc" | "agency" | "client" | "not_applicable" | "not_decided";

export const COMPONENT_KEYS = [
  "material_source",
  "source_identification",
  "excavation",
  "loading",
  "transport",
  "dumping",
  "spreading",
  "watering",
  "compaction",
  "royalty_seigniorage",
  "permits_approvals",
  "equipment",
  "tippers",
  "operators_drivers",
  "diesel_fuel",
  "survey_setting_out",
  "quality_testing",
] as const;

export type ComponentKey = typeof COMPONENT_KEYS[number];

const COMPONENT_LABELS: Record<ComponentKey, string> = {
  material_source: "Material Source",
  source_identification: "Source Identification",
  excavation: "Excavation",
  loading: "Loading",
  transport: "Transport",
  dumping: "Dumping",
  spreading: "Spreading",
  watering: "Watering / Compaction Fluid",
  compaction: "Compaction",
  royalty_seigniorage: "Royalty / Seigniorage",
  permits_approvals: "Permits & Approvals",
  equipment: "Equipment (Excavator etc.)",
  tippers: "Tippers",
  operators_drivers: "Operators & Drivers",
  diesel_fuel: "Diesel / Fuel",
  survey_setting_out: "Survey & Setting Out",
  quality_testing: "Quality Testing",
};

const ARRANGEMENT_TYPE_LABELS: Record<ArrangementType, string> = {
  fully_outsourced_composite: "Fully Outsourced (Composite Rate)",
  vendor_material_delivered: "Vendor Material — Delivered to Site",
  hlc_source_outsourced_execution: "HLC Source + Outsourced Execution",
  hlc_in_house: "HLC In-House",
  partly_outsourced: "Partly Outsourced",
  client_supplied: "Client Supplied",
  reused_excavated: "Reuse of Excavated Material",
  not_decided: "Not Decided",
};

/** Default component responsibility templates per arrangement type. */
function defaultComponents(type: ArrangementType): Record<ComponentKey, ComponentResponsibility> {
  const notDecided = () =>
    Object.fromEntries(COMPONENT_KEYS.map(k => [k, "not_decided"])) as Record<ComponentKey, ComponentResponsibility>;

  switch (type) {
    case "fully_outsourced_composite":
      return {
        material_source: "agency", source_identification: "agency",
        excavation: "agency", loading: "agency", transport: "agency", dumping: "agency",
        spreading: "agency", watering: "agency", compaction: "agency",
        royalty_seigniorage: "agency", permits_approvals: "hlc",
        equipment: "agency", tippers: "agency", operators_drivers: "agency",
        diesel_fuel: "agency", survey_setting_out: "hlc", quality_testing: "hlc",
      };
    case "vendor_material_delivered":
      return {
        material_source: "agency", source_identification: "agency",
        excavation: "agency", loading: "agency", transport: "agency", dumping: "agency",
        spreading: "not_decided", watering: "not_decided", compaction: "not_decided",
        royalty_seigniorage: "agency", permits_approvals: "not_decided",
        equipment: "not_decided", tippers: "agency", operators_drivers: "agency",
        diesel_fuel: "agency", survey_setting_out: "hlc", quality_testing: "hlc",
      };
    case "hlc_source_outsourced_execution":
      return {
        material_source: "hlc", source_identification: "hlc",
        excavation: "agency", loading: "agency", transport: "agency", dumping: "agency",
        spreading: "agency", watering: "agency", compaction: "agency",
        royalty_seigniorage: "hlc", permits_approvals: "hlc",
        equipment: "agency", tippers: "agency", operators_drivers: "agency",
        diesel_fuel: "agency", survey_setting_out: "hlc", quality_testing: "hlc",
      };
    case "hlc_in_house":
      return Object.fromEntries(COMPONENT_KEYS.map(k => [k, "hlc"])) as Record<ComponentKey, ComponentResponsibility>;
    case "partly_outsourced":
      return notDecided();
    case "client_supplied":
      return {
        material_source: "client", source_identification: "client",
        excavation: "not_decided", loading: "not_decided", transport: "not_decided", dumping: "not_decided",
        spreading: "not_decided", watering: "not_decided", compaction: "not_decided",
        royalty_seigniorage: "client", permits_approvals: "client",
        equipment: "not_decided", tippers: "not_decided", operators_drivers: "not_decided",
        diesel_fuel: "not_decided", survey_setting_out: "hlc", quality_testing: "hlc",
      };
    case "reused_excavated":
      return {
        material_source: "hlc", source_identification: "hlc",
        excavation: "hlc", loading: "hlc", transport: "hlc", dumping: "hlc",
        spreading: "not_decided", watering: "not_decided", compaction: "not_decided",
        royalty_seigniorage: "not_applicable", permits_approvals: "hlc",
        equipment: "hlc", tippers: "hlc", operators_drivers: "hlc",
        diesel_fuel: "hlc", survey_setting_out: "hlc", quality_testing: "hlc",
      };
    default:
      return notDecided();
  }
}

const RESPONSIBILITY_LABELS: Record<ComponentResponsibility, string> = {
  hlc: "HLC / Company",
  agency: "Agency / Contractor",
  client: "Client",
  not_applicable: "N/A",
  not_decided: "Not Decided",
};

const RESPONSIBILITY_COLORS: Record<ComponentResponsibility, string> = {
  hlc: "text-blue-700 bg-blue-50 border-blue-200",
  agency: "text-green-700 bg-green-50 border-green-200",
  client: "text-violet-700 bg-violet-50 border-violet-200",
  not_applicable: "text-slate-400 bg-slate-50 border-slate-200",
  not_decided: "text-amber-600 bg-amber-50 border-amber-200",
};

// ─── Status badge ─────────────────────────────────────────────────────────────

export function ArrangementStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "text-amber-700 bg-amber-50 border-amber-200",
    submitted: "text-blue-700 bg-blue-50 border-blue-200",
    approved: "text-emerald-700 bg-emerald-50 border-emerald-200",
    rejected: "text-red-700 bg-red-50 border-red-200",
    cancelled: "text-slate-500 bg-slate-50 border-slate-200",
    mobilisation_pending: "text-yellow-700 bg-yellow-50 border-yellow-200",
    in_progress: "text-blue-700 bg-blue-100 border-blue-300",
    on_hold: "text-orange-700 bg-orange-50 border-orange-200",
    completed: "text-emerald-700 bg-emerald-100 border-emerald-300",
    returned: "text-purple-700 bg-purple-50 border-purple-200",
  };
  const label = status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold border rounded px-1.5 py-0.5 ${styles[status] ?? styles.draft}`}>
      {label}
    </span>
  );
}

// ─── Arrangement summary card (read-only) ─────────────────────────────────────

/** Compact display for a revision field value (null → "—", objects → JSON). */
function fmtRevisionValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function ArrangementSummaryCard({
  arr,
  boqQty,
  projectId,
  onEdit,
  onCancel,
  onSaved,
}: {
  arr: EarthworkArrangementSummary;
  boqQty?: number;
  projectId?: number;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);

  // Instruction 027 §19-20: pending revision (027 shape {fields,...} or legacy flat map)
  const rawPending = (arr as any).pendingRevision;
  const pending = rawPending == null ? null
    : (rawPending.fields && typeof rawPending.fields === "object"
      ? rawPending as { fields: Record<string, unknown>; reason?: string; proposedAt?: string }
      : { fields: rawPending as Record<string, unknown> });
  const history: any[] = Array.isArray((arr as any).revisionHistory) ? (arr as any).revisionHistory : [];

  const revisionMutation = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      const res = await fetch(`/api/earthwork-arrangements/${arr.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionAction: action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
      return data;
    },
    onSuccess: (_, action) => {
      toast(action === "approve"
        ? { title: "Revision approved", description: "New terms are now in effect; demand and value figures refresh immediately." }
        : { title: "Revision rejected", description: "Proposal kept in history; current terms unchanged." });
      if (projectId != null) invalidateArrangementQueries(queryClient, projectId);
      onSaved();
    },
    onError: (err: Error) => toast({ title: "Revision action failed", description: err.message, variant: "destructive" }),
  });

  const estimatedValue = arr.estimatedValue ?? (arr.agreedRate != null ? arr.allocatedQty * arr.agreedRate : null);
  const expectedDays = arr.plannedDailyOutput != null && arr.plannedDailyOutput > 0
    ? Math.ceil(arr.allocatedQty / arr.plannedDailyOutput)
    : null;

  const completedQty = arr.completedQty ?? 0;
  const balanceQty = Math.max(0, arr.allocatedQty - completedQty);
  const completedPct = arr.allocatedQty > 0 ? Math.round((completedQty / arr.allocatedQty) * 100) : 0;

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await fetch(`/api/earthwork-arrangements/${arr.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
      return data;
    },
    onSuccess: (_, newStatus) => {
      toast({ title: `Status updated to ${newStatus.replace(/_/g, " ")}` });
      // Instruction 026 A2: demand must refresh immediately on status change
      if (projectId != null) invalidateArrangementQueries(queryClient, projectId);
      onSaved();
    },
    onError: (err: Error) => {
      toast({ title: "Status update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="rounded border border-slate-200 bg-white p-3 space-y-1.5 text-[12px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-800 truncate">
          {ARRANGEMENT_TYPE_LABELS[arr.arrangementType as ArrangementType] ?? BITUMINOUS_ARRANGEMENT_TYPE_LABELS[arr.arrangementType] ?? arr.arrangementType}
        </span>
        <ArrangementStatusBadge status={arr.status} />
      </div>
      {arr.agencyName && (
        <p className="text-slate-600">Agency: <span className="font-medium">{arr.agencyName}</span></p>
      )}
      {arr.reachLabel && (
        <p className="text-slate-500">Reach: <span className="font-medium">{arr.reachLabel}</span></p>
      )}
      {arr.arrangementType === "reused_excavated" && arr.cutAvailableQty != null && (() => {
        const bal = checkCutFillBalance(arr.cutAvailableQty, arr.allocatedQty);
        return (
          <p className={bal && !bal.sufficient ? "text-amber-700" : "text-slate-600"}>
            Cut available: <span className="font-mono font-semibold">{Number(arr.cutAvailableQty).toLocaleString()} {arr.uom}</span>
            {" "}vs fill: <span className="font-mono font-semibold">{arr.allocatedQty.toLocaleString()} {arr.uom}</span>
            {bal && !bal.sufficient && (
              <span className="ml-1 font-semibold">— short by {bal.shortfall.toLocaleString()} {arr.uom}</span>
            )}
          </p>
        );
      })()}
      <p className="text-slate-600">
        Allocated: <span className="font-mono font-semibold">{arr.allocatedQty.toLocaleString()} {arr.uom}</span>
        {boqQty != null && (
          <span className="text-slate-400 ml-1">/ {boqQty.toLocaleString()} {arr.uom} total</span>
        )}
      </p>
      {completedQty > 0 && (
        <p className="text-slate-600">
          Completed: <span className="font-mono font-semibold">{completedQty.toLocaleString()} CUM</span>
          {" "}&middot; Balance: <span className="font-mono font-semibold">{balanceQty.toLocaleString()} CUM</span>
          {" "}&middot; <span className="font-semibold">{completedPct}%</span>
        </p>
      )}
      {arr.agreedRate != null && (
        <p className="text-slate-600">
          Rate: <span className="font-mono font-semibold">₹{arr.agreedRate.toLocaleString()}/{arr.uom}</span>
          {estimatedValue != null && (
            <span className="text-slate-500 ml-1">(Est. ₹{(estimatedValue / 100000).toFixed(2)} L)</span>
          )}
        </p>
      )}
      <div className="flex gap-3 flex-wrap text-slate-600">
        {arr.plannedStartDate && (
          <span>Start: <span className="font-medium">{arr.plannedStartDate}</span></span>
        )}
        {arr.targetCompletionDate && (
          <span>Target: <span className="font-medium">{arr.targetCompletionDate}</span></span>
        )}
        {expectedDays != null && (
          <span>~{expectedDays} days at {arr.plannedDailyOutput} {arr.uom}/day</span>
        )}
      </div>
      {arr.daysSinceLastEntry != null && arr.daysSinceLastEntry > 7 && (
        <p className="text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-1">
          ⚠ No progress in {arr.daysSinceLastEntry} days
        </p>
      )}

      {/* Instruction 027 §19-20: Pending Revision — current effective vs proposed */}
      {pending && (
        <div className="rounded border border-purple-300 bg-purple-50 p-2 space-y-1.5" data-testid={`pending-revision-${arr.id}`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-purple-800">Revision Pending Approval</span>
            {pending.proposedAt && <span className="text-[10px] text-purple-600">{String(pending.proposedAt).slice(0, 10)}</span>}
          </div>
          {pending.reason && <p className="text-purple-700 italic">"{pending.reason}"</p>}
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-purple-600">
                <th className="text-left font-semibold py-0.5">Field</th>
                <th className="text-left font-semibold py-0.5">Current (in effect)</th>
                <th className="text-left font-semibold py-0.5">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(pending.fields).map(([k, v]) => (
                <tr key={k} className="border-t border-purple-200/60">
                  <td className="py-0.5 pr-2 font-medium text-slate-700">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</td>
                  <td className="py-0.5 pr-2 font-mono text-slate-600">{fmtRevisionValue((arr as any)[k])}</td>
                  <td className="py-0.5 font-mono font-semibold text-purple-800">{fmtRevisionValue(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-purple-600">Current approved values keep driving demand and value until this is approved.</p>
          <div className="flex gap-1.5">
            <Button
              variant="outline" size="sm" className="h-6 text-[11px] px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              disabled={revisionMutation.isPending}
              onClick={() => revisionMutation.mutate("approve")}
              data-testid={`button-approve-revision-${arr.id}`}
            >
              {revisionMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Approve Revision
            </Button>
            <Button
              variant="outline" size="sm" className="h-6 text-[11px] px-2 text-red-700 border-red-300 hover:bg-red-50"
              disabled={revisionMutation.isPending}
              onClick={() => revisionMutation.mutate("reject")}
              data-testid={`button-reject-revision-${arr.id}`}
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Instruction 027 §20/§24: revision & operational-edit history */}
      {history.length > 0 && (
        <div>
          <button
            type="button"
            className="text-[11px] text-slate-500 hover:text-slate-700 underline"
            onClick={() => setShowHistory(v => !v)}
            data-testid={`button-history-${arr.id}`}
          >
            {showHistory ? "Hide" : "Show"} change history ({history.length})
          </button>
          {showHistory && (
            <div className="mt-1 space-y-1 max-h-48 overflow-y-auto">
              {[...history].reverse().map((h, i) => (
                <div key={i} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-700">
                      {h.type === "operational" ? "Operational edit" : `Revision${h.version ? ` v${h.version}` : ""}`}
                      {" · "}
                      <span className={
                        h.outcome === "approved" || h.outcome === "applied" ? "text-emerald-700"
                        : h.outcome === "rejected" ? "text-red-700" : "text-slate-500"
                      }>{h.outcome}{h.appliedNow ? " (applied now)" : ""}</span>
                    </span>
                    <span className="text-slate-400">{String(h.approvedAt ?? h.decidedAt ?? h.changedAt ?? h.appliedAt ?? "").slice(0, 10)}</span>
                  </div>
                  {h.reason && <div className="text-slate-500 italic">"{h.reason}"</div>}
                  {h.changes && (
                    <div className="text-slate-600">
                      {Object.entries(h.changes as Record<string, unknown>).map(([k, v]) => (
                        <div key={k}>
                          {k}: <span className="font-mono">{fmtRevisionValue((h.previous as any)?.[k])}</span> → <span className="font-mono font-semibold">{fmtRevisionValue(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status action buttons */}
      <div className="flex gap-1.5 pt-1 flex-wrap">
        {arr.status === "draft" && (
          <>
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={onEdit}>Edit</Button>
            <Button
              variant="outline" size="sm" className="h-6 text-[11px] px-2 text-blue-600 hover:bg-blue-50"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("submitted")}
            >
              {statusMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Submit for Approval
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 text-red-600 hover:bg-red-50" onClick={onCancel}>
              <Trash2 className="w-3 h-3 mr-1" /> Cancel
            </Button>
          </>
        )}
        {arr.status === "submitted" && (
          <>
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={onEdit}>Edit</Button>
            <Button
              variant="outline" size="sm" className="h-6 text-[11px] px-2 text-emerald-600 hover:bg-emerald-50"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("approved")}
            >
              {statusMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Approve
            </Button>
          </>
        )}
        {arr.status === "approved" && (
          <>
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={onEdit} title="Operational edits apply immediately; commercial changes go through a revision">Edit</Button>
            <Button
              variant="outline" size="sm" className="h-6 text-[11px] px-2 text-amber-600 hover:bg-amber-50"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("mobilisation_pending")}
            >
              Record Mobilisation
            </Button>
            <Button
              variant="outline" size="sm" className="h-6 text-[11px] px-2 text-orange-600 hover:bg-orange-50"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("on_hold")}
            >
              Put On Hold
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 text-red-600 hover:bg-red-50" onClick={onCancel}>
              <Trash2 className="w-3 h-3 mr-1" /> Cancel
            </Button>
          </>
        )}
        {arr.status === "mobilisation_pending" && (
          <>
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={onEdit} title="Operational edits apply immediately; commercial changes go through a revision">Edit</Button>
            <Button
              variant="outline" size="sm" className="h-6 text-[11px] px-2 text-blue-600 hover:bg-blue-50"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("in_progress")}
            >
              {statusMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Mark In Progress
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 text-red-600 hover:bg-red-50" onClick={onCancel}>
              <Trash2 className="w-3 h-3 mr-1" /> Cancel
            </Button>
          </>
        )}
        {arr.status === "in_progress" && (
          <>
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={onEdit} title="Operational edits apply immediately; commercial changes go through a revision">Edit</Button>
            <Button
              variant="outline" size="sm" className="h-6 text-[11px] px-2 text-orange-600 hover:bg-orange-50"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("on_hold")}
            >
              Put On Hold
            </Button>
            <Button
              variant="outline" size="sm" className="h-6 text-[11px] px-2 text-emerald-600 hover:bg-emerald-50"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("completed")}
            >
              {statusMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Mark Completed
            </Button>
          </>
        )}
        {arr.status === "on_hold" && (
          <Button
            variant="outline" size="sm" className="h-6 text-[11px] px-2 text-blue-600 hover:bg-blue-50"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate("in_progress")}
          >
            {statusMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
            Resume
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface EarthworkArrangementDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  projectId: number;
  boqItemId: number | null;
  materialLabel: string;
  boqQty?: number;
  /**
   * Batch 02: the item's CONTRACT BOQ quantity. Drives the resolver-based
   * "Contract BOQ Qty / Applicable Qty" reference panel. Pass only when the
   * value truly is the contract quantity (NOT a bar's planned/remaining qty);
   * omit it and the reference panel is hidden rather than mislabelled.
   */
  contractQty?: number;
  /**
   * Instruction 024: When the Work Demand row has multiple contributing BOQ items
   * (multi-source), pass their IDs here so the dialog can record a split allocation
   * via boqItemAllocations. Each entry also carries the BOQ description for display.
   */
  sourceBoqItems?: Array<{ id: number; description: string; currentQty: number }>;
  /**
   * Instruction 024: The count of source BOQ items expected for this row (from
   * `earthworkSourceBoqItemIds.length`). Used to determine multi-source mode BEFORE
   * `sourceBoqItems` has finished loading — prevents the fallback to single-source
   * mode that would send `boqItemId=null` with no allocations (an orphan arrangement).
   */
  sourceItemCount?: number;
  /** Pre-fill for editing an existing arrangement */
  editArrangement?: EarthworkArrangementSummary & { inclusions?: string; exclusions?: string; notes?: string; borrowSource?: string; avgLeadKm?: number; workCategory?: string; bituminousItemType?: string | null };
  /** Instruction 028: category of the work — drives arrangement types, component
   *  vocabulary and templates. Defaults to earthwork (fully backward-compatible). */
  workCategory?: WorkCategoryKey;
  /** Instruction 028: bituminous sub-type (dbm, prime_coat …) — scopes components. */
  bituminousItemType?: string | null;
  /** Unit of measure for quantities (CUM for earthwork; SQM/MT for bituminous). */
  uom?: string;
}

export function EarthworkArrangementDialog({
  open, onClose, onSaved, projectId, boqItemId, materialLabel, boqQty, contractQty, sourceBoqItems, sourceItemCount, editArrangement,
  workCategory: workCategoryProp, bituminousItemType: bituminousItemTypeProp, uom: uomProp,
}: EarthworkArrangementDialogProps) {
  // ── Instruction 028: category resolution (edit rows win over props) ────────
  const category: WorkCategoryKey = (editArrangement?.workCategory as WorkCategoryKey) ?? workCategoryProp ?? "earthwork";
  const isBituminous = category === "bituminous";
  const bitItemType = editArrangement?.bituminousItemType ?? bituminousItemTypeProp ?? null;
  const displayUom = uomProp || (editArrangement as any)?.uom || (isBituminous ? "SQM" : "CUM");
  const typeLabels: Record<string, string> = isBituminous ? BITUMINOUS_ARRANGEMENT_TYPE_LABELS : ARRANGEMENT_TYPE_LABELS;
  const componentKeysForCategory: readonly string[] = isBituminous ? bituminousComponentsForItemType(bitItemType as any) : COMPONENT_KEYS;
  const componentLabels: Record<string, string> = isBituminous ? BITUMINOUS_COMPONENT_LABELS : COMPONENT_LABELS;
  const defaultComponentsFor = (t: string): Record<string, ComponentResponsibility> =>
    isBituminous
      ? bituminousDefaultComponents(t, bitItemType as any) as Record<string, ComponentResponsibility>
      : defaultComponents(t as ArrangementType);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!editArrangement;
  // Instruction 027 §17-21: editing an operational arrangement follows the
  // controlled-edit rules (operational edits immediate, material via revision).
  const OPERATIONAL_STATUSES = ["approved", "mobilisation_pending", "in_progress", "on_hold"];
  const isOperationalEdit = isEdit && OPERATIONAL_STATUSES.includes(editArrangement!.status);
  // Pending server challenge: material change needs revision, or a reason is required.
  const [editChallenge, setEditChallenge] = useState<{ code: string; fields?: string[]; body: Record<string, unknown> } | null>(null);
  const [editReason, setEditReason] = useState("");

  // Form state
  const [arrangementType, setArrangementType] = useState<ArrangementType>(
    (editArrangement?.arrangementType as ArrangementType) ?? "not_decided"
  );
  const [sourceExcavationBoqItemId, setSourceExcavationBoqItemId] = useState<number | null>(
    (editArrangement as any)?.sourceExcavationBoqItemId != null ? Number((editArrangement as any).sourceExcavationBoqItemId) : null
  );
  const [agencyName, setAgencyName] = useState(editArrangement?.agencyName ?? "");
  const [reachLabel, setReachLabel] = useState(editArrangement?.reachLabel ?? "");

  // ── Instruction 031 B2/B3: Applicable Scope ────────────────────────────────
  // whole  = whole eligible BOQ scope (default; scopeSegmentIds = null)
  // reaches = confirmed Working Reach(es) from Project Scope (authoritative link)
  // custom = free-text reach label + optional chainage (legacy-compatible, B7)
  type ScopeMode = "whole" | "reaches" | "custom";
  const editScopeSegmentIds: number[] = Array.isArray((editArrangement as any)?.scopeSegmentIds)
    ? ((editArrangement as any).scopeSegmentIds as unknown[]).map(Number).filter(n => Number.isFinite(n))
    : [];
  const [scopeMode, setScopeMode] = useState<ScopeMode>(
    editScopeSegmentIds.length > 0 ? "reaches"
      : (editArrangement?.reachLabel || (editArrangement as any)?.chainageFrom != null) ? "custom"
      : "whole"
  );
  const [selectedSegIds, setSelectedSegIds] = useState<number[]>(editScopeSegmentIds);
  const [customChFrom, setCustomChFrom] = useState(
    (editArrangement as any)?.chainageFrom != null ? String((editArrangement as any).chainageFrom) : ""
  );
  const [customChTo, setCustomChTo] = useState(
    (editArrangement as any)?.chainageTo != null ? String((editArrangement as any).chainageTo) : ""
  );

  // Project Scope segments — same query key used by ScopeSetup / WorkProgramme.
  const { data: scopeSegments = [] } = useQuery<ScopeSegmentRecordLike[]>({
    queryKey: [`/api/boq/projects/${projectId}/scope-segments`],
    queryFn: () => fetch(`/api/boq/projects/${projectId}/scope-segments`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: open && projectId > 0,
    staleTime: 30_000,
  });
  const { data: projectBoqItems = [] } = useQuery<any[]>({
    queryKey: ["/api/boq/projects", projectId, "items", "cut-fill"],
    queryFn: async () => {
      const response = await fetch(`/api/boq/projects/${projectId}/items`, { credentials: "include" });
      return response.ok ? response.json() : [];
    },
    enabled: open && projectId > 0 && arrangementType === "reused_excavated",
  });
  const cutFillCandidates = useMemo(() => {
    const destinationIds = [
      boqItemId,
      (editArrangement as any)?.boqItemId,
      ...((editArrangement as any)?.boqItemAllocations ?? []).map((allocation: any) => allocation?.boqItemId),
      ...(sourceBoqItems ?? []).map(item => item.id),
    ];
    const candidates = roadwayExcavationCandidates(
      projectBoqItems.map(item => ({
        id: Number(item.id),
        description: String(item.description ?? item.itemName ?? ""),
        unit: String(item.unit ?? "CUM"),
        chainageFrom: item.chainageFrom ?? item.chainage_from,
        chainageTo: item.chainageTo ?? item.chainage_to,
      })) as ChainageCandidate[],
      destinationIds,
    );
    return rankCutFillSources(candidates, Number((editArrangement as any)?.chainageFrom), Number((editArrangement as any)?.chainageTo));
  }, [projectBoqItems, editArrangement, boqItemId, sourceBoqItems]);
  useEffect(() => {
    if (arrangementType === "reused_excavated" && sourceExcavationBoqItemId == null && cutFillCandidates.length === 1) {
      setSourceExcavationBoqItemId(preselectedSourceId(cutFillCandidates));
    }
  }, [arrangementType, cutFillCandidates, sourceExcavationBoqItemId]);
  const reaches = confirmedWorkingReaches(scopeSegments);
  const constraints = scopeConstraints(scopeSegments);
  const [allocatedQty, setAllocatedQty] = useState(
    editArrangement?.allocatedQty != null ? String(editArrangement.allocatedQty) : ""
  );
  const [agreedRate, setAgreedRate] = useState(
    editArrangement?.agreedRate != null ? String(editArrangement.agreedRate) : ""
  );
  const [borrowSource, setBorrowSource] = useState((editArrangement as any)?.borrowSource ?? "");
  const [avgLeadKm, setAvgLeadKm] = useState(
    (editArrangement as any)?.avgLeadKm != null ? String((editArrangement as any).avgLeadKm) : ""
  );
  const [plannedStartDate, setPlannedStartDate] = useState(editArrangement?.plannedStartDate ?? "");
  const [targetCompletionDate, setTargetCompletionDate] = useState(editArrangement?.targetCompletionDate ?? "");
  const [plannedDailyOutput, setPlannedDailyOutput] = useState(
    editArrangement?.plannedDailyOutput != null ? String(editArrangement.plannedDailyOutput) : ""
  );
  const [notes, setNotes] = useState((editArrangement as any)?.notes ?? "");
  const [components, setComponents] = useState<Record<string, ComponentResponsibility>>(
    editArrangement?.components != null
      ? { ...defaultComponentsFor("not_decided"), ...editArrangement.components as Record<string, ComponentResponsibility> }
      : defaultComponentsFor("not_decided")
  );

  // ── Instruction 024: per-source allocation state (multi-BOQ rows) ──────────
  // isMultiSource is derived from BOTH the loaded items AND the expected count from
  // the parent row's earthworkSourceBoqItemIds.length (sourceItemCount).
  // Using only loaded items would miss the case where details are still loading
  // (sourceBoqItems = undefined → length = 0 → isMultiSource = false → save allowed
  //  with boqItemId=null, creating an orphan arrangement the server now rejects).
  const isMultiSource = (sourceBoqItems?.length ?? sourceItemCount ?? 0) > 1;
  const initSourceAllocations = (): Record<number, string> => {
    if (!isMultiSource || !sourceBoqItems) return {};
    const existing = editArrangement?.boqItemAllocations;
    if (Array.isArray(existing) && existing.length > 0) {
      return Object.fromEntries(existing.map(a => [a.boqItemId, String(a.qty)]));
    }
    return Object.fromEntries(sourceBoqItems.map(s => [s.id, ""]));
  };
  const [sourceAllocations, setSourceAllocations] = useState<Record<number, string>>(initSourceAllocations);

  // ── Instruction 031 B4/B5: eligible vs excluded ranges + suggested qty ─────
  const selectedReaches = reaches.filter(r => selectedSegIds.includes(Number(r.id)));
  const eligibleScope = (scopeSegments.length > 0)
    ? resolveEligibleScope(scopeSegments as any, { boqItemId: boqItemId ?? null, isLinear: true })
    : null;
  const reachCoverage = (eligibleScope && scopeMode === "reaches")
    ? selectedReaches.map(r => ({
        reach: r,
        cov: coverageForStretch(eligibleScope, {
          chainageFrom: Number(r.chainageFrom), chainageTo: Number(r.chainageTo), side: r.side ?? null,
        }),
      }))
    : [];
  // ── Batch 02: resolver-driven Applicable Qty (shared/quantityResolver seam) ─
  // Replaces the old dialog-local eligible-denominator suggestedQty formula.
  // denominatorBasis is always "whole-scope" — arrangement figures must not
  // depend on current programme-bar coverage (see shared/arrangementApplicableQty).
  const customRangeParsed = (() => {
    const f = parseFloat(customChFrom), t = parseFloat(customChTo);
    return isFinite(f) && isFinite(t) && t > f ? { chainageFrom: f, chainageTo: t } : null;
  })();
  const selectedReachRanges = selectedReaches.map(r => ({
    chainageFrom: Number(r.chainageFrom), chainageTo: Number(r.chainageTo), side: r.side ?? null,
  }));
  // Shown in create AND edit mode (reference info) whenever the true contract
  // qty is known; single-source only — multi-source gets per-source figures below.
  const applicable = (!isMultiSource && contractQty != null && contractQty > 0 && boqItemId != null)
    ? resolveArrangementApplicableQty({
        scopeMode,
        item: { boqItemId, totalQty: contractQty, unit: displayUom },
        scopeSegments: scopeSegments as any,
        selectedReaches: selectedReachRanges,
        customRange: customRangeParsed,
      })
    : null;
  // Multi-source: one combined figure would be ambiguous (different BOQ items
  // have different scope applicability), so resolve per source item instead.
  const sourceApplicable: Record<number, number | null> = (isMultiSource && sourceBoqItems && scopeSegments.length > 0)
    ? Object.fromEntries(sourceBoqItems.map(s => {
        const r = resolveArrangementApplicableQty({
          scopeMode,
          item: { boqItemId: s.id, totalQty: s.currentQty, unit: "CUM" },
          scopeSegments: scopeSegments as any,
          selectedReaches: selectedReachRanges,
          customRange: customRangeParsed,
        });
        return [s.id, r.status === "ok" ? r.applicableQty : null];
      }))
    : {};
  const scopeQtyLabel = scopeMode === "whole"
    ? "for whole eligible scope"
    : scopeMode === "reaches"
      ? "for selected reach(es)"
      : customRangeParsed
        ? `for Ch. ${customRangeParsed.chainageFrom.toFixed(3)}–${customRangeParsed.chainageTo.toFixed(3)}`
        : "for custom chainage";

  // Resolved copies of the selected reaches (kept on the record for reporting/audit, B3)
  const resolvedScope = selectedReaches.length > 0 ? {
    reachLabel: selectedReaches.map((r, i) => (r.label && String(r.label).trim()) || `Reach ${i + 1}`).join(", "),
    chainageFrom: Math.min(...selectedReaches.map(r => Number(r.chainageFrom))),
    chainageTo: Math.max(...selectedReaches.map(r => Number(r.chainageTo))),
  } : null;

  // Apply template when arrangement type changes
  function handleTypeChange(t: ArrangementType) {
    setArrangementType(t);
    if (t !== "reused_excavated") setSourceExcavationBoqItemId(null);
    setComponents(defaultComponentsFor(t));
  }

  // Derived
  const multiSourceTotal = isMultiSource
    ? Object.values(sourceAllocations).reduce((s, v) => s + (parseFloat(v) || 0), 0)
    : 0;
  const allocQtyNum = isMultiSource ? multiSourceTotal : (parseFloat(allocatedQty) || 0);
  const rateNum = parseFloat(agreedRate) || 0;
  const dailyOutputNum = parseFloat(plannedDailyOutput) || 0;
  const estimatedValue = allocQtyNum > 0 && rateNum > 0 ? allocQtyNum * rateNum : null;
  const expectedDays = allocQtyNum > 0 && dailyOutputNum > 0 ? Math.ceil(allocQtyNum / dailyOutputNum) : null;

  // Validation — outsourced types come from the category descriptor (028)
  const categoryDescriptor = getCategoryDescriptor(category);
  const needsAgencyName = categoryDescriptor.outsourcedTypes.has(arrangementType as string);
  const sourceRequired = arrangementType === "reused_excavated";
  const canDraft = allocQtyNum > 0 && arrangementType !== "not_decided" && (!sourceRequired || sourceExcavationBoqItemId != null);
  const canSubmit = canDraft && (!needsAgencyName || agencyName.trim().length > 0);

  /**
   * Build the request body for both Save Draft and Submit for Approval.
   *
   * saveIntent is sent explicitly so the server can create the record with the
   * correct final status in a single round-trip — eliminating the previous
   * two-request draft→submit race.
   *
   * Numeric coercion rules:
   *   - empty / unparseable number fields → null (never NaN)
   *   - dates → YYYY-MM-DD string or null
   */
  const buildBody = (saveIntent: "draft" | "submit") => {
    const safeNum = (v: string | undefined) => {
      const n = parseFloat(v ?? "");
      return isFinite(n) ? n : null;
    };

    const base = {
      materialLabel,
      arrangementType,
      saveIntent,
      // Instruction 028: category + sub-type (immutable after create; server validates)
      ...(isEdit ? {} : { workCategory: category, bituminousItemType: isBituminous ? bitItemType : null }),
      allocatedQty: allocQtyNum,
      uom: displayUom,
      agencyName: agencyName.trim() || null,
      // Instruction 031 B2/B3 — Applicable Scope: authoritative segment link
      // (reaches mode) plus resolved chainage copies; custom mode keeps the
      // legacy free-text behaviour (B7); whole scope clears the fields.
      ...(scopeMode === "reaches"
        ? {
            scopeSegmentIds: selectedSegIds,
            reachLabel: resolvedScope?.reachLabel ?? null,
            chainageFrom: resolvedScope?.chainageFrom ?? null,
            chainageTo: resolvedScope?.chainageTo ?? null,
          }
        : scopeMode === "custom"
          ? {
              scopeSegmentIds: null,
              reachLabel: reachLabel.trim() || null,
              chainageFrom: customChFrom.trim() !== "" && isFinite(parseFloat(customChFrom)) ? parseFloat(customChFrom) : null,
              chainageTo: customChTo.trim() !== "" && isFinite(parseFloat(customChTo)) ? parseFloat(customChTo) : null,
            }
          : { scopeSegmentIds: null, reachLabel: null, chainageFrom: null, chainageTo: null }),
      agreedRate: rateNum > 0 ? rateNum : null,
      // Earthwork-only source fields — never sent for bituminous (028 §17)
      borrowSource: isBituminous ? null : (borrowSource.trim() || null),
      avgLeadKm: isBituminous ? null : safeNum(avgLeadKm),
      plannedStartDate: plannedStartDate || null,
      targetCompletionDate: targetCompletionDate || null,
      plannedDailyOutput: dailyOutputNum > 0 ? dailyOutputNum : null,
      notes: notes.trim() || null,
      components,
      sourceExcavationBoqItemId: sourceRequired ? sourceExcavationBoqItemId : null,
      // PATCH (edit) uses `status` directly; POST uses `saveIntent`.
      // Instruction 027 §17: never send status when editing an operational
      // arrangement — that would silently demote approved/in-progress records.
      ...(isOperationalEdit ? {} : (saveIntent === "submit" ? { status: "submitted" } : { status: "draft" })),
    };

    if (isMultiSource && sourceBoqItems && sourceBoqItems.length > 1) {
      // Multi-source: send boqItemAllocations; never send a single boqItemId
      const allocs = sourceBoqItems
        .map(s => ({ boqItemId: s.id, qty: parseFloat(sourceAllocations[s.id] || "0") || 0 }))
        .filter(a => a.qty > 0);
      return { ...base, boqItemId: null, boqItemAllocations: allocs };
    }
    // Single-source
    return { ...base, boqItemId, sourceExcavationBoqItemId: sourceRequired ? sourceExcavationBoqItemId : null };
  };

  /**
   * Instruction 027 §17-21: shared PATCH/POST sender. On a controlled-edit
   * challenge from the server (material change needs a revision, or a reason is
   * required for date/output changes), surface the inline reason form instead
   * of a hard failure.
   */
  const CHALLENGE_CODES = new Set(["MATERIAL_CHANGE_REQUIRES_REVISION", "REVISION_REASON_REQUIRED", "ADMIN_APPLY_REASON_REQUIRED"]);
  const sendArrangement = async (body: Record<string, unknown>) => {
    const url = isEdit
      ? `/api/earthwork-arrangements/${editArrangement!.id}`
      : `/api/boq/projects/${projectId}/earthwork-arrangements`;
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      if (isEdit && CHALLENGE_CODES.has(String(data.error))) {
        setEditChallenge({ code: String(data.error), fields: data.fields, body });
        throw new Error("__CHALLENGE__");
      }
      throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
    }
    return data;
  };
  const onSaveError = (title: string) => (err: Error) => {
    if (err.message === "__CHALLENGE__") return; // handled by inline reason form
    toast({ title, description: err.message, variant: "destructive" });
  };

  // Save Draft — single request, status = "draft"
  const saveDraftMutation = useMutation({
    mutationFn: async () => sendArrangement(buildBody("draft")),
    onSuccess: (data: any) => {
      if (data?.revisionPending) {
        toast({ title: "Revision submitted for approval", description: "Current approved values stay in effect until the revision is approved." });
      } else if (data?.appliedNow) {
        toast({ title: "Changes applied immediately", description: "Recorded as an approved revision (Edit and Apply Now)." });
      } else {
        toast({ title: isOperationalEdit ? "Changes saved" : "Draft saved", description: `Arrangement saved for ${materialLabel}` });
      }
      invalidateArrangementQueries(queryClient, projectId);
      onSaved();
      onClose();
    },
    onError: onSaveError("Save failed"),
  });

  // Resend after the user filled in the reason form (revision / operational reason / apply now)
  const challengeMutation = useMutation({
    mutationFn: async (mode: "revise" | "reason" | "apply_now") => {
      const base = editChallenge!.body;
      const body =
        mode === "revise" ? { ...base, saveIntent: "revise", revisionReason: editReason }
        : mode === "apply_now" ? { ...base, saveIntent: "apply_now", editReason }
        : { ...base, editReason };
      return sendArrangement(body);
    },
    onSuccess: (data: any, mode) => {
      setEditChallenge(null); setEditReason("");
      toast(mode === "revise"
        ? { title: "Revision submitted for approval", description: "Current approved values stay in effect until the revision is approved." }
        : mode === "apply_now"
          ? { title: "Changes applied immediately", description: "Recorded as an approved revision (Edit and Apply Now)." }
          : { title: "Changes saved", description: "Operational change applied and audited." });
      invalidateArrangementQueries(queryClient, projectId);
      onSaved();
      onClose();
    },
    onError: onSaveError("Save failed"),
  });

  // Submit for Approval — single request with saveIntent:"submit"
  // POST: server creates directly as status=submitted (no second PATCH needed)
  // PATCH: body includes status:"submitted" → server sets submittedAt in one round-trip
  const submitMutation = useMutation({
    mutationFn: async () => sendArrangement(buildBody("submit")),
    onSuccess: () => {
      toast({ title: "Submitted for approval", description: `Arrangement submitted for ${materialLabel}` });
      invalidateArrangementQueries(queryClient, projectId);
      onSaved();
      onClose();
    },
    onError: onSaveError("Submit failed"),
  });

  // Instruction 024: For multi-source rows, block save/submit until source BOQ details
  // have been fetched. This prevents the client from sending boqItemId=null + no allocations
  // (the orphan-arrangement case the server now rejects with BOQ_SOURCE_REQUIRED).
  const sourceDetailsLoading = isMultiSource && !sourceBoqItems;

  const isPending = saveDraftMutation.isPending || submitMutation.isPending || challengeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit" : "New"} Execution Arrangement</DialogTitle>
          <p className="text-[12px] text-slate-500">{materialLabel}</p>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Arrangement type */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Arrangement Type *</Label>
            <Select value={arrangementType} onValueChange={v => handleTypeChange(v as ArrangementType)}>
              <SelectTrigger className="h-8 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(typeLabels) as [ArrangementType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-[12px]">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {arrangementType === "reused_excavated" && (
            <div className="space-y-1 rounded border border-blue-200 bg-blue-50/60 p-2" data-testid="cut-fill-source-selector">
              <Label className="text-xs font-semibold text-blue-900">Source roadway excavation BOQ item <span className="text-red-600">*</span></Label>
              <Select value={sourceExcavationBoqItemId == null ? "" : String(sourceExcavationBoqItemId)} onValueChange={value => setSourceExcavationBoqItemId(Number(value))}>
                <SelectTrigger className="h-8 text-[12px] bg-white"><SelectValue placeholder={cutFillCandidates.length ? "Select source item" : "No roadway excavation items found"} /></SelectTrigger>
                <SelectContent>{cutFillCandidates.map(item => {
                  const boqItem = projectBoqItems.find(candidate => Number(candidate.id) === item.id);
                  return <SelectItem key={item.id} value={String(item.id)} className="text-[12px]">{boqItemDisplayName(boqItem ?? item)}</SelectItem>;
                })}</SelectContent>
              </Select>
              <p className="text-[10px] text-blue-800">Proximity only ranks this list; it does not prove that material moved. Confirm the source explicitly.</p>
              {cutFillCandidates.length === 1 && sourceExcavationBoqItemId === cutFillCandidates[0].id && <p className="text-[10px] text-emerald-700">One candidate preselected — review or change before saving.</p>}
              {sourceRequired && sourceExcavationBoqItemId == null && <p className="text-[11px] text-red-600">Choose a source before saving this reused-material arrangement.</p>}
            </div>
          )}

          {/* Agency / Vendor (shown unless not_decided / client_supplied / hlc_in_house / reused_excavated) */}
          {!["hlc_in_house", "reused_excavated", "not_decided"].includes(arrangementType) && (
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                Agency / Vendor Name
                {needsAgencyName && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Input
                className="h-8 text-[12px]"
                placeholder="e.g. M/s Earthcon Contractors"
                value={agencyName}
                onChange={e => setAgencyName(e.target.value)}
              />
              {needsAgencyName && !agencyName.trim() && (
                <p className="text-[11px] text-red-500">Agency name required for outsourced arrangements</p>
              )}
            </div>
          )}

          {/* Allocation section: single-source OR multi-source split */}
          {isMultiSource && sourceBoqItems ? (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">
                Allocation by BOQ Source <span className="text-slate-500 font-normal">(enter qty from each contributing item)</span>
              </Label>
              <div className="border border-slate-200 rounded divide-y">
                {sourceBoqItems.map(src => (
                  <div key={src.id} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="text-[11px] text-slate-600 flex-1 truncate" title={src.description}>
                      {src.description.length > 55 ? src.description.slice(0, 55) + "…" : src.description}
                      <span className="text-slate-400 ml-1">(contract {src.currentQty.toLocaleString()} CUM)</span>
                      {sourceApplicable[src.id] != null && (
                        <span className="text-teal-700 ml-1" data-testid={`text-source-applicable-${src.id}`}>
                          · applicable {sourceApplicable[src.id]!.toLocaleString()}
                        </span>
                      )}
                    </span>
                    <Input
                      className="h-7 text-[12px] font-mono w-28 shrink-0"
                      type="number" min={0}
                      placeholder="0.00"
                      value={sourceAllocations[src.id] ?? ""}
                      onChange={e => setSourceAllocations(prev => ({ ...prev, [src.id]: e.target.value }))}
                    />
                    <span className="text-[11px] text-slate-400 shrink-0">CUM</span>
                  </div>
                ))}
              </div>
              {allocQtyNum > 0 && (
                <p className="text-[11px] text-slate-500">
                  Total: <span className="font-semibold font-mono">{allocQtyNum.toLocaleString()} {displayUom}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {/* Batch 02 — persistent reference figures (never hidden or replaced
                  by the user-entered Arrangement Qty). */}
              {applicable != null && (
                <div className="text-[11px] rounded border border-teal-100 bg-teal-50/60 px-2 py-1.5 space-y-0.5" data-testid="qty-reference-panel">
                  <p data-testid="text-contract-qty">
                    Contract BOQ Qty: <span className="font-mono font-semibold">{applicable.contractQty.toLocaleString()} {displayUom}</span>
                  </p>
                  {applicable.status === "ok" && applicable.applicableQty != null ? (
                    <p className="text-teal-700 flex items-center gap-2 flex-wrap" data-testid="text-applicable-qty">
                      Applicable Qty {scopeQtyLabel}: <span className="font-mono font-semibold">{applicable.applicableQty.toLocaleString()} {displayUom}</span>
                      {!applicable.scopeActive && <span className="text-slate-500">(whole contract — project scope not configured)</span>}
                      {allocatedQty.trim() === "" && (
                        <button type="button" className="underline" onClick={() => setAllocatedQty(String(applicable.applicableQty))} data-testid="button-use-suggested-qty">Use</button>
                      )}
                    </p>
                  ) : (
                    <p className="text-slate-500" data-testid="text-applicable-pending">
                      Applicable Qty: {scopeMode === "reaches" ? "select at least one working reach" : "enter a valid chainage range"} to calculate
                    </p>
                  )}
                </div>
              )}
              <Label className="text-xs font-semibold">Arrangement Quantity ({boqQty != null ? `BOQ: ${boqQty} ${displayUom}` : displayUom})</Label>
              <Input
                className="h-8 text-[12px] font-mono"
                type="number" min={0}
                placeholder="0"
                value={allocatedQty}
                onChange={e => setAllocatedQty(e.target.value)}
              />
              {/* UI-only advisory — commercially arranging a different qty stays allowed */}
              {applicable?.applicableQty != null && allocQtyNum > applicable.applicableQty && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1" data-testid="warning-over-applicable">
                  Arrangement quantity exceeds the applicable quantity {scopeQtyLabel} ({applicable.applicableQty.toLocaleString()} {displayUom}).
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Agreed Rate (₹/{displayUom})</Label>
              <Input
                className="h-8 text-[12px] font-mono"
                type="number" min={0}
                placeholder="0.00"
                value={agreedRate}
                onChange={e => setAgreedRate(e.target.value)}
              />
            </div>
          </div>

          {estimatedValue != null && (
            <p className="text-[12px] text-emerald-700 bg-emerald-50 rounded px-2 py-1">
              Estimated value: <span className="font-mono font-semibold">₹{estimatedValue.toLocaleString()}</span>
              {" "}(₹{(estimatedValue / 100000).toFixed(2)} L)
            </p>
          )}

          {/* Instruction 031 B2 — Applicable Scope */}
          <div className="space-y-2" data-testid="section-applicable-scope">
            <Label className="text-xs font-semibold">Applicable Scope</Label>
            <div className="flex gap-3 flex-wrap text-[12px]">
              {([
                ["whole", "Whole eligible BOQ scope"],
                ["reaches", "Confirmed Working Reach(es)"],
                ["custom", "Custom chainage"],
              ] as const).map(([mode, label]) => (
                <label key={mode} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="scope-mode"
                    checked={scopeMode === mode}
                    onChange={() => setScopeMode(mode)}
                    data-testid={`radio-scope-${mode}`}
                  />
                  {label}
                </label>
              ))}
            </div>

            {scopeMode === "reaches" && (
              <div className="space-y-2">
                {reaches.length === 0 ? (
                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                    No confirmed Working Reaches exist in Project Scope yet. Confirm reaches in Scope Setup, or use Whole scope / Custom chainage.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded divide-y" data-testid="list-working-reaches">
                    {reaches.map((r, i) => {
                      const rid = Number(r.id);
                      const checked = selectedSegIds.includes(rid);
                      return (
                        <label key={rid} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedSegIds(prev => checked ? prev.filter(x => x !== rid) : [...prev, rid])}
                            data-testid={`checkbox-reach-${rid}`}
                          />
                          <span className="text-[12px] text-slate-700 flex-1">
                            {(r.label && String(r.label).trim()) || `Reach ${i + 1}`}
                            <span className="text-slate-400 ml-2 font-mono text-[11px]">
                              Ch. {Number(r.chainageFrom).toFixed(3)}–{Number(r.chainageTo).toFixed(3)}
                            </span>
                            {r.side && <span className="ml-1.5 rounded bg-slate-100 border border-slate-200 px-1 text-[10px] uppercase">{r.side}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* B4 — eligible vs excluded sub-ranges within the selected reaches (no manual split needed) */}
                {reachCoverage.length > 0 && (
                  <div className="space-y-1" data-testid="scope-coverage-preview">
                    {reachCoverage.map(({ reach, cov }) => (
                      <div key={Number(reach.id)} className="text-[11px] rounded border border-slate-200 px-2 py-1.5 bg-slate-50/60">
                        <span className="font-semibold text-slate-600">{(reach.label && String(reach.label).trim()) || `Reach ${Number(reach.id)}`}:</span>{" "}
                        {cov.subRanges.length > 0 ? (
                          <span className="text-emerald-700">
                            eligible {cov.subRanges.map(sr => `Ch. ${sr.from.toFixed(3)}–${sr.to.toFixed(3)}`).join(", ")}
                          </span>
                        ) : (
                          <span className="text-red-600">no eligible coverage for this item</span>
                        )}
                        {(cov.excludedSideLenKm > 0 || cov.withdrawnSideLenKm > 0 || cov.blockedSideLenKm > 0) && (
                          <span className="text-slate-500">
                            {" "}· excluded/blocked ranges are clipped automatically — no manual split needed
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Constraints (read-only, never selectable) */}
                {constraints.length > 0 && (
                  <div className="text-[11px] text-slate-500 space-y-0.5" data-testid="scope-constraints">
                    <span className="font-semibold text-slate-600">Scope constraints (informational):</span>
                    {constraints.map(c => (
                      <div key={c.id}>
                        <span className={c.temporary ? "text-blue-600" : "text-red-600"}>
                          {c.segmentType.replace(/_/g, " ")}
                        </span>{" "}
                        Ch. {c.chainageFrom.toFixed(3)}–{c.chainageTo.toFixed(3)}
                        {c.side ? ` (${c.side})` : ""}{c.reason ? ` — ${c.reason}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {scopeMode === "custom" && (
              <div className="space-y-2">
                <Input
                  className="h-8 text-[12px]"
                  placeholder="Reach / scope label, e.g. 0+000 to 2+500 (LHS)"
                  value={reachLabel}
                  onChange={e => setReachLabel(e.target.value)}
                  data-testid="input-reach-label"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Chainage From (km)</Label>
                    <Input className="h-8 text-[12px] font-mono" type="number" step="0.001" placeholder="e.g. 2.400" value={customChFrom} onChange={e => setCustomChFrom(e.target.value)} data-testid="input-chainage-from" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Chainage To (km)</Label>
                    <Input className="h-8 text-[12px] font-mono" type="number" step="0.001" placeholder="e.g. 3.100" value={customChTo} onChange={e => setCustomChTo(e.target.value)} data-testid="input-chainage-to" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Source details (earthwork-only: borrow pits / leads — hidden for bituminous, 028 §17) */}
          {!isBituminous && ["fully_outsourced_composite", "hlc_source_outsourced_execution", "vendor_material_delivered"].includes(arrangementType) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Borrow Source / Quarry Location</Label>
                <Input className="h-8 text-[12px]" placeholder="e.g. Km 15+300 LHS borrow pit" value={borrowSource} onChange={e => setBorrowSource(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Average Lead (km)</Label>
                <Input className="h-8 text-[12px] font-mono" type="number" min={0} placeholder="0.0" value={avgLeadKm} onChange={e => setAvgLeadKm(e.target.value)} />
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Planned Start Date</Label>
              <Input className="h-8 text-[12px]" type="date" value={plannedStartDate} onChange={e => setPlannedStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Target Completion</Label>
              <Input className="h-8 text-[12px]" type="date" value={targetCompletionDate} onChange={e => setTargetCompletionDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Daily Output ({displayUom}/day)</Label>
              <Input
                className="h-8 text-[12px] font-mono"
                type="number" min={0}
                placeholder="0"
                value={plannedDailyOutput}
                onChange={e => setPlannedDailyOutput(e.target.value)}
              />
            </div>
          </div>

          {expectedDays != null && (
            <p className="text-[12px] text-blue-700 bg-blue-50 rounded px-2 py-1">
              Expected duration: <span className="font-semibold">{expectedDays} working days</span> at {dailyOutputNum} CUM/day
            </p>
          )}

          {/* Component responsibility table */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Component Responsibility</Label>
            <div className="rounded border border-slate-200 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-2 py-1.5 font-semibold text-slate-600 w-1/3">Component</th>
                    <th className="text-left px-2 py-1.5 font-semibold text-slate-600">Responsibility</th>
                  </tr>
                </thead>
                <tbody>
                  {componentKeysForCategory.map((key, i) => (
                    <tr key={key} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="px-2 py-1 text-slate-600 font-medium">{componentLabels[key] ?? key}</td>
                      <td className="px-2 py-1">
                        <Select
                          value={components[key]}
                          onValueChange={v => setComponents(prev => ({ ...prev, [key]: v as ComponentResponsibility }))}
                        >
                          <SelectTrigger className={`h-6 text-[11px] border rounded px-1.5 w-44 ${RESPONSIBILITY_COLORS[components[key]]}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.entries(RESPONSIBILITY_LABELS) as [ComponentResponsibility, string][]).map(([v, label]) => (
                              <SelectItem key={v} value={v} className={`text-[11px] ${RESPONSIBILITY_COLORS[v]}`}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Notes / Special Conditions</Label>
            <Textarea className="text-[12px] min-h-[60px]" placeholder="Any additional conditions, inclusions, exclusions..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {/* Instruction 024: multi-source loading guard */}
        {sourceDetailsLoading && (
          <div className="flex items-center gap-2 px-3 py-2 rounded border border-amber-200 bg-amber-50 text-[12px] text-amber-800">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            Loading BOQ source details — save is disabled until all sources are resolved.
          </div>
        )}

        {/* Instruction 027 §18-21: controlled-edit reason form */}
        {editChallenge && (
          <div className="rounded border border-purple-300 bg-purple-50 p-3 space-y-2 text-[12px]">
            {editChallenge.code === "MATERIAL_CHANGE_REQUIRES_REVISION" ? (
              <p className="text-purple-800">
                <b>This changes commercial/material terms of an operational arrangement</b>
                {editChallenge.fields?.length ? <> ({editChallenge.fields.join(", ")})</> : null}.
                It must go through a controlled revision — current approved values stay in effect (and keep driving demand) until the revision is approved.
              </p>
            ) : (
              <p className="text-purple-800">
                <b>A short reason is required</b> for changing planned dates or daily output on an operational arrangement.
              </p>
            )}
            <Input
              className="h-8 text-[12px] bg-white"
              placeholder="Reason for this change…"
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              data-testid="input-edit-reason"
            />
            <div className="flex gap-2 flex-wrap">
              {editChallenge.code === "MATERIAL_CHANGE_REQUIRES_REVISION" ? (
                <>
                  <Button
                    size="sm" className="h-7 text-[11px]"
                    disabled={!editReason.trim() || challengeMutation.isPending}
                    onClick={() => challengeMutation.mutate("revise")}
                    data-testid="button-submit-revision"
                  >
                    {challengeMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    Submit Revision for Approval
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-7 text-[11px] text-red-700 border-red-300 hover:bg-red-50"
                    disabled={!editReason.trim() || challengeMutation.isPending}
                    onClick={() => challengeMutation.mutate("apply_now")}
                    title="Admin only — applies immediately and records an approved revision"
                    data-testid="button-apply-now"
                  >
                    Edit and Apply Now (Admin)
                  </Button>
                </>
              ) : (
                <Button
                  size="sm" className="h-7 text-[11px]"
                  disabled={!editReason.trim() || challengeMutation.isPending}
                  onClick={() => challengeMutation.mutate("reason")}
                  data-testid="button-save-with-reason"
                >
                  {challengeMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Save with Reason
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { setEditChallenge(null); setEditReason(""); }}>
                Back
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          {isOperationalEdit ? (
            <Button
              disabled={isPending || !canDraft || sourceDetailsLoading || !!editChallenge}
              onClick={() => saveDraftMutation.mutate()}
              data-testid="button-save-changes"
            >
              {saveDraftMutation.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
              Save Changes
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={isPending || !canDraft || sourceDetailsLoading}
                onClick={() => saveDraftMutation.mutate()}
                title={sourceDetailsLoading ? "Waiting for BOQ source data to load" : undefined}
              >
                {saveDraftMutation.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                Save Draft
              </Button>
              <Button
                disabled={isPending || !canSubmit || sourceDetailsLoading}
                onClick={() => submitMutation.mutate()}
                title={sourceDetailsLoading ? "Waiting for BOQ source data to load" : undefined}
              >
                {submitMutation.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                Submit for Approval
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

