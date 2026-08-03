/**
 * Instruction 023/024 — Earthwork Execution Arrangement Dialog
 *
 * Allows PM / Admin to record how earthwork / bulk-fill BOQ items will be
 * executed (agency, in-house, client-supplied, etc.).  The dialog is opened
 * from the Work Demand page's "Execution Arrangement Required" cell.
 */

import { useState } from "react";
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
import { deriveEarthworkSourcingBadge, checkCutFillBalance } from "@shared/planningEngine";

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

function ArrangementSummaryCard({
  arr,
  boqQty,
  onEdit,
  onCancel,
  onSaved,
}: {
  arr: EarthworkArrangementSummary;
  boqQty?: number;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();

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
          {ARRANGEMENT_TYPE_LABELS[arr.arrangementType as ArrangementType] ?? arr.arrangementType}
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
  editArrangement?: EarthworkArrangementSummary & { inclusions?: string; exclusions?: string; notes?: string; borrowSource?: string; avgLeadKm?: number };
}

export function EarthworkArrangementDialog({
  open, onClose, onSaved, projectId, boqItemId, materialLabel, boqQty, sourceBoqItems, sourceItemCount, editArrangement,
}: EarthworkArrangementDialogProps) {
  const { toast } = useToast();
  const isEdit = !!editArrangement;

  // Form state
  const [arrangementType, setArrangementType] = useState<ArrangementType>(
    (editArrangement?.arrangementType as ArrangementType) ?? "not_decided"
  );
  const [agencyName, setAgencyName] = useState(editArrangement?.agencyName ?? "");
  const [reachLabel, setReachLabel] = useState(editArrangement?.reachLabel ?? "");
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
  const [components, setComponents] = useState<Record<ComponentKey, ComponentResponsibility>>(
    editArrangement?.components != null
      ? { ...defaultComponents("not_decided"), ...editArrangement.components as Record<ComponentKey, ComponentResponsibility> }
      : defaultComponents("not_decided")
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

  // Apply template when arrangement type changes
  function handleTypeChange(t: ArrangementType) {
    setArrangementType(t);
    setComponents(defaultComponents(t));
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

  // Validation
  const outsourcedTypes: ArrangementType[] = [
    "fully_outsourced_composite",
    "vendor_material_delivered",
    "hlc_source_outsourced_execution",
    "partly_outsourced",
  ];
  const needsAgencyName = outsourcedTypes.includes(arrangementType);
  const canDraft = allocQtyNum > 0 && arrangementType !== "not_decided";
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
      allocatedQty: allocQtyNum,
      uom: "CUM",
      agencyName: agencyName.trim() || null,
      reachLabel: reachLabel.trim() || null,
      agreedRate: rateNum > 0 ? rateNum : null,
      borrowSource: borrowSource.trim() || null,
      avgLeadKm: safeNum(avgLeadKm),
      plannedStartDate: plannedStartDate || null,
      targetCompletionDate: targetCompletionDate || null,
      plannedDailyOutput: dailyOutputNum > 0 ? dailyOutputNum : null,
      notes: notes.trim() || null,
      components,
      // PATCH (edit) uses `status` directly; POST uses `saveIntent`
      ...(saveIntent === "submit" ? { status: "submitted" } : { status: "draft" }),
    };

    if (isMultiSource && sourceBoqItems && sourceBoqItems.length > 1) {
      // Multi-source: send boqItemAllocations; never send a single boqItemId
      const allocs = sourceBoqItems
        .map(s => ({ boqItemId: s.id, qty: parseFloat(sourceAllocations[s.id] || "0") || 0 }))
        .filter(a => a.qty > 0);
      return { ...base, boqItemId: null, boqItemAllocations: allocs };
    }
    // Single-source
    return { ...base, boqItemId };
  };

  // Save Draft — single request, status = "draft"
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const body = buildBody("draft");
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
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Draft saved", description: `Draft arrangement saved for ${materialLabel}` });
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  // Submit for Approval — single request with saveIntent:"submit"
  // POST: server creates directly as status=submitted (no second PATCH needed)
  // PATCH: body includes status:"submitted" → server sets submittedAt in one round-trip
  const submitMutation = useMutation({
    mutationFn: async () => {
      const body = buildBody("submit");
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
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Submitted for approval", description: `Arrangement submitted for ${materialLabel}` });
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Submit failed", description: err.message, variant: "destructive" });
    },
  });

  // Instruction 024: For multi-source rows, block save/submit until source BOQ details
  // have been fetched. This prevents the client from sending boqItemId=null + no allocations
  // (the orphan-arrangement case the server now rejects with BOQ_SOURCE_REQUIRED).
  const sourceDetailsLoading = isMultiSource && !sourceBoqItems;

  const isPending = saveDraftMutation.isPending || submitMutation.isPending;

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
                {(Object.entries(ARRANGEMENT_TYPE_LABELS) as [ArrangementType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-[12px]">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                      <span className="text-slate-400 ml-1">({src.currentQty.toLocaleString()} CUM)</span>
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
                  Total: <span className="font-semibold font-mono">{allocQtyNum.toLocaleString()} CUM</span>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Allocated Quantity ({boqQty != null ? `BOQ: ${boqQty} CUM` : "CUM"})</Label>
              <Input
                className="h-8 text-[12px] font-mono"
                type="number" min={0}
                placeholder="0"
                value={allocatedQty}
                onChange={e => setAllocatedQty(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Agreed Rate (₹/CUM)</Label>
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

          {/* Reach / scope */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Reach / Scope Label (optional)</Label>
            <Input
              className="h-8 text-[12px]"
              placeholder="e.g. 0+000 to 2+500 (LHS), or Leave blank for full item"
              value={reachLabel}
              onChange={e => setReachLabel(e.target.value)}
            />
          </div>

          {/* Source details (shown for earth-supply arrangements) */}
          {["fully_outsourced_composite", "hlc_source_outsourced_execution", "vendor_material_delivered"].includes(arrangementType) && (
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
              <Label className="text-xs font-semibold">Daily Output (CUM/day)</Label>
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
                  {COMPONENT_KEYS.map((key, i) => (
                    <tr key={key} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="px-2 py-1 text-slate-600 font-medium">{COMPONENT_LABELS[key]}</td>
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

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── EarthworkArrangementCell ─────────────────────────────────────────────────
// Rendered inside Work Demand for rows with procurementStatus = "earthwork_arrangement_required"

interface EarthworkArrangementCellProps {
  row: {
    materialName: string;
    totalDemand: number;
    demandUpToSelectedDate: number;
    uom: string;
    earthworkBoqItemId?: number | null;
    earthworkArrangements?: EarthworkArrangementSummary[];
    earthworkSourceBoqItemIds?: number[];
  };
  projectId: number;
  onSaved: () => void;
}

export function EarthworkArrangementCell({ row, projectId, onSaved }: EarthworkArrangementCellProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<EarthworkArrangementSummary | null>(null);
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);
  const [showCutToFill, setShowCutToFill] = useState(false);
  const [cutSourceItemId, setCutSourceItemId] = useState<number | null>(null);
  const { toast } = useToast();

  const arrangements = row.earthworkArrangements ?? [];
  // Rejected arrangements no longer hold quantity — align with badge derivation
  // and the server-side over-allocation guard (both exclude cancelled + rejected).
  const activeArrs = arrangements.filter(a => a.status !== "cancelled" && a.status !== "rejected");
  const allocatedTotal = activeArrs.reduce((s, a) => s + a.allocatedQty, 0);
  const unallocatedQty = Math.max(0, row.totalDemand - allocatedTotal);
  const sourcingBadge = deriveEarthworkSourcingBadge(activeArrs, row.totalDemand);

  const hasMultipleSources = (row.earthworkSourceBoqItemIds?.length ?? 0) > 1;

  // Instruction 024: Fetch BOQ item details for multi-source rows so the dialog
  // can show per-source allocation inputs and send boqItemAllocations to the API.
  const { data: sourceBoqItemDetails } = useQuery<Array<{ id: number; description: string; currentQty: number }>>({
    queryKey: ["boq-items-multi", row.earthworkSourceBoqItemIds ?? []],
    queryFn: async () => {
      const ids = row.earthworkSourceBoqItemIds;
      if (!ids || ids.length <= 1) return [];
      const params = ids.map(id => `ids[]=${id}`).join("&");
      const res = await fetch(`/api/boq/items/by-ids?projectId=${projectId}&${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: hasMultipleSources,
    staleTime: 60_000,
  });

  // Cut-to-fill: candidate roadway-excavation BOQ items for optional source linkage.
  // Fetched lazily — only when the quick-action panel is open.
  const { data: excavationCandidates } = useQuery<Array<{ id: number; description: string; currentQty: number; unit: string }>>({
    queryKey: ["boq-excavation-items", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/items`, { credentials: "include" });
      if (!res.ok) return [];
      const items = await res.json();
      return (items as Array<{ id: number; description: string; currentQty: number; unit: string }>)
        .filter(it => /excavat|cutting/i.test(it.description ?? ""));
    },
    enabled: showCutToFill,
    staleTime: 60_000,
  });

  // Cut-to-fill quick action: one click creates a minimal reused_excavated
  // arrangement covering the remaining unallocated demand — no agency, rate,
  // or component matrix needed. Submitted immediately (no draft step).
  const cutToFillMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        materialLabel: row.materialName,
        arrangementType: "reused_excavated",
        saveIntent: "submit",
        uom: row.uom || "CUM",
        components: defaultComponents("reused_excavated"),
        notes: "Cut-to-fill: embankment built from roadway cutting (quick action)",
        ...(cutSourceItemId != null ? { sourceExcavationBoqItemId: cutSourceItemId } : {}),
      };
      if (hasMultipleSources && sourceBoqItemDetails?.length) {
        // Per-source remaining = BOQ qty − qty already allocated to that item
        // (counting both split allocations AND direct single-source arrangements).
        const allocatedPerItem = new Map<number, number>();
        for (const a of activeArrs) {
          if (a.boqItemAllocations?.length) {
            for (const al of a.boqItemAllocations) {
              allocatedPerItem.set(al.boqItemId, (allocatedPerItem.get(al.boqItemId) ?? 0) + al.qty);
            }
          } else {
            // Single-source arrangement: attribute its full allocatedQty to its boqItemId
            const directId = (a as { boqItemId?: number | null }).boqItemId;
            if (directId != null) {
              allocatedPerItem.set(directId, (allocatedPerItem.get(directId) ?? 0) + a.allocatedQty);
            }
          }
        }
        // Greedily fill each source up to its remaining BOQ capacity, but never
        // allocate more than this row's remaining demand in total.
        let stillNeeded = unallocatedQty;
        const allocations: Array<{ boqItemId: number; qty: number }> = [];
        for (const it of sourceBoqItemDetails) {
          if (stillNeeded <= 0.001) break;
          const remaining = Math.max(0, Number(it.currentQty ?? 0) - (allocatedPerItem.get(it.id) ?? 0));
          const take = Math.min(remaining, stillNeeded);
          if (take > 0.001) {
            const qty = Math.round(take * 1000) / 1000;
            allocations.push({ boqItemId: it.id, qty });
            stillNeeded -= qty;
          }
        }
        if (!allocations.length) throw new Error("Nothing left to allocate across source BOQ items.");
        body.boqItemAllocations = allocations;
        body.allocatedQty = allocations.reduce((s, al) => s + al.qty, 0);
      } else {
        if (!row.earthworkBoqItemId) throw new Error("No BOQ item linked to this row.");
        body.boqItemId = row.earthworkBoqItemId;
        body.allocatedQty = unallocatedQty;
      }
      const res = await fetch(`/api/boq/projects/${projectId}/earthwork-arrangements`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Marked as cut-to-fill", description: "Internally sourced from roadway excavation — no procurement needed." });
      setShowCutToFill(false);
      setCutSourceItemId(null);
      onSaved();
    },
    onError: (err: Error) => toast({ title: "Cut-to-fill failed", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/earthwork-arrangements/${id}`, {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelled from Work Demand" }),
      });
      if (!res.ok) throw new Error("Cancel failed");
    },
    onSuccess: () => {
      toast({ title: "Arrangement cancelled" });
      setCancelTarget(null);
      onSaved();
    },
    onError: () => toast({ title: "Cancel failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-2">
      {/* Header badge */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {sourcingBadge === "internally_sourced" ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
            <CheckCircle2 className="w-3 h-3" />
            Internally Sourced — Cut-to-Fill
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5">
            <AlertCircle className="w-3 h-3" />
            Execution Arrangement Required
          </span>
        )}
        {allocatedTotal > 0 && (
          <span className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
            {allocatedTotal.toLocaleString()} CUM allocated · {unallocatedQty.toLocaleString()} CUM open
          </span>
        )}
      </div>

      {/* Multiple BOQ sources note */}
      {hasMultipleSources && (
        <p className="text-[11px] text-slate-500 italic">
          Multiple BOQ sources — use Earthwork Control for split allocation
        </p>
      )}

      {/* Earthwork Control link */}
      <a
        href={`/work-program/${projectId}/earthwork`}
        className="text-[11px] text-teal-600 hover:underline"
      >
        View Earthwork Control
      </a>

      {/* Existing arrangements */}
      {activeArrs.length > 0 && (
        <div className="space-y-1.5">
          {activeArrs.map(arr => (
            <ArrangementSummaryCard
              key={arr.id}
              arr={arr}
              boqQty={row.totalDemand}
              onEdit={() => setEditTarget(arr)}
              onCancel={() => setCancelTarget(arr.id)}
              onSaved={onSaved}
            />
          ))}
        </div>
      )}

      {/* Fully allocated (non-cut-to-fill; internally sourced shows its own header badge) */}
      {sourcingBadge !== "internally_sourced" && allocatedTotal >= row.totalDemand - 0.001 && activeArrs.length > 0 && (
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
          <CheckCircle2 className="w-3 h-3" /> Fully Arranged
        </span>
      )}

      {/* Add arrangement button + cut-to-fill quick action */}
      {unallocatedQty > 0.001 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 hover:bg-teal-100 transition-colors"
          >
            <Plus className="w-3 h-3" />
            {activeArrs.length === 0 ? "Set Up Execution Arrangement" : "Add Partial Arrangement"}
          </button>
          <button
            onClick={() => setShowCutToFill(v => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 hover:bg-emerald-100 transition-colors"
            title="Mark as internally sourced from roadway cutting (no procurement needed)"
          >
            <CheckCircle2 className="w-3 h-3" />
            Cut-to-Fill
          </button>
        </div>
      )}

      {/* Cut-to-fill quick action panel */}
      {showCutToFill && unallocatedQty > 0.001 && (
        <div className="p-2 rounded border border-emerald-200 bg-emerald-50/50 space-y-1.5 text-[11px]">
          <p className="text-slate-700">
            Mark <span className="font-mono font-semibold">{unallocatedQty.toLocaleString()} {row.uom || "CUM"}</span> as
            internally sourced from roadway excavation (cut-to-fill). No agency or rate needed.
          </p>
          <div className="flex items-center gap-1.5">
            <label className="text-slate-600 shrink-0">Source cut item (optional):</label>
            <select
              value={cutSourceItemId ?? ""}
              onChange={e => setCutSourceItemId(e.target.value ? Number(e.target.value) : null)}
              className="border border-slate-300 rounded px-1 py-0.5 bg-white text-[11px] max-w-[260px]"
            >
              <option value="">— none / decide later —</option>
              {(excavationCandidates ?? []).map(it => (
                <option key={it.id} value={it.id}>
                  {it.description?.slice(0, 60)} ({Number(it.currentQty ?? 0).toLocaleString()} {it.unit})
                </option>
              ))}
            </select>
          </div>
          {cutSourceItemId != null && (() => {
            const cand = (excavationCandidates ?? []).find(it => it.id === cutSourceItemId);
            const bal = cand ? checkCutFillBalance(Number(cand.currentQty ?? 0), unallocatedQty) : null;
            return bal && !bal.sufficient ? (
              <p className="text-amber-700 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                Cut available is short by {bal.shortfall.toLocaleString()} CUM — balance may need borrow earth.
              </p>
            ) : null;
          })()}
          <div className="flex items-center gap-2">
            <button
              onClick={() => cutToFillMutation.mutate()}
              disabled={cutToFillMutation.isPending}
              className="font-semibold text-emerald-700 hover:underline disabled:opacity-50"
            >
              {cutToFillMutation.isPending ? "Saving..." : "Confirm Cut-to-Fill"}
            </button>
            <button onClick={() => setShowCutToFill(false)} className="text-slate-500 hover:underline">Cancel</button>
          </div>
        </div>
      )}

      {/* Cancelled arrangements (collapsed) */}
      {arrangements.some(a => a.status === "cancelled") && (
        <p className="text-[10px] text-slate-400">
          {arrangements.filter(a => a.status === "cancelled").length} cancelled arrangement(s) hidden
        </p>
      )}

      {/* Cancel confirmation */}
      {cancelTarget != null && (
        <div className="flex items-center gap-2 p-2 rounded border border-red-200 bg-red-50 text-[11px]">
          <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
          <span className="text-red-700 flex-1">Cancel this arrangement? This cannot be undone.</span>
          <button
            onClick={() => cancelMutation.mutate(cancelTarget)}
            disabled={cancelMutation.isPending}
            className="font-semibold text-red-700 hover:underline"
          >
            {cancelMutation.isPending ? "Cancelling..." : "Confirm"}
          </button>
          <button onClick={() => setCancelTarget(null)} className="text-slate-500 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <EarthworkArrangementDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSaved={onSaved}
          projectId={projectId}
          boqItemId={hasMultipleSources ? null : (row.earthworkBoqItemId ?? null)}
          materialLabel={row.materialName}
          boqQty={row.totalDemand}
          sourceBoqItems={hasMultipleSources ? sourceBoqItemDetails : undefined}
          sourceItemCount={row.earthworkSourceBoqItemIds?.length}
        />
      )}

      {/* Edit dialog */}
      {editTarget != null && (
        <EarthworkArrangementDialog
          open={editTarget != null}
          onClose={() => setEditTarget(null)}
          onSaved={onSaved}
          projectId={projectId}
          boqItemId={hasMultipleSources ? null : (row.earthworkBoqItemId ?? null)}
          materialLabel={row.materialName}
          boqQty={row.totalDemand}
          sourceBoqItems={hasMultipleSources ? sourceBoqItemDetails : undefined}
          sourceItemCount={row.earthworkSourceBoqItemIds?.length}
          editArrangement={editTarget}
        />
      )}
    </div>
  );
}
