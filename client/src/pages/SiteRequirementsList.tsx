import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, ChevronDown, ChevronRight, ClipboardList, Package,
  Wrench, Users, AlertTriangle, CheckCircle, Clock, XCircle, Pencil, Send,
  Pen,
} from "lucide-react";

// ── Item-level status options per category ────────────────────────────────────

const ITEM_STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  materials: [
    { value: "available_in_store",     label: "✓ Available in store" },
    { value: "issued",                 label: "↑ Issued to site" },
    { value: "expected_at_site",       label: "⏰ Expected at site" },
    { value: "not_available",          label: "✗ Not available" },
    { value: "purchase_required",      label: "₹ Purchase required" },
    { value: "sent_to_purchase",       label: "→ Sent to Purchase" },
    { value: "direct_supply_arranged", label: "✓ Direct supply arranged" },
    { value: "need_clarification",     label: "? Need clarification" },
  ],
  equipment: [
    { value: "allocated",             label: "✓ Allocated" },
    { value: "available_at_site",     label: "✓ Available at site" },
    { value: "expected_at_site",      label: "⏰ Expected at site" },
    { value: "not_available",         label: "✗ Not available" },
    { value: "alternative_arranged",  label: "↔ Alternative arranged" },
    { value: "need_clarification",    label: "? Need clarification" },
  ],
  labour: [
    { value: "arranged",           label: "✓ Arranged" },
    { value: "partly_arranged",    label: "◑ Partly arranged" },
    { value: "expected_by_time",   label: "⏰ Expected by time" },
    { value: "not_available",      label: "✗ Not available" },
    { value: "need_clarification", label: "? Need clarification" },
  ],
  immediate: [
    { value: "available_in_store",  label: "✓ Available in store" },
    { value: "sent_to_purchase",    label: "→ Sent to Purchase" },
    { value: "sent_to_plant",       label: "→ Sent to Plant" },
    { value: "arranged",            label: "✓ Arranged" },
    { value: "not_available",       label: "✗ Not available" },
    { value: "need_clarification",  label: "? Need clarification" },
  ],
};

const ITEM_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  available_in_store:       { label: "In Store",          color: "bg-green-100 text-green-700" },
  issued:                   { label: "Issued",             color: "bg-emerald-100 text-emerald-700" },
  expected_at_site:         { label: "Expected at site",   color: "bg-blue-100 text-blue-700" },
  not_available:            { label: "Not available",      color: "bg-red-100 text-red-600" },
  purchase_required:        { label: "Purchase needed",    color: "bg-violet-100 text-violet-700" },
  sent_to_purchase:         { label: "→ Purchase",         color: "bg-violet-100 text-violet-700" },
  direct_supply_arranged:   { label: "Direct supply",      color: "bg-teal-100 text-teal-700" },
  need_clarification:       { label: "? Clarification",    color: "bg-amber-100 text-amber-700" },
  allocated:                { label: "Allocated",           color: "bg-green-100 text-green-700" },
  available_at_site:        { label: "Available",          color: "bg-green-100 text-green-700" },
  alternative_arranged:     { label: "Alternative",        color: "bg-teal-100 text-teal-700" },
  arranged:                 { label: "Arranged",           color: "bg-green-100 text-green-700" },
  partly_arranged:          { label: "Partly arranged",    color: "bg-amber-100 text-amber-700" },
  expected_by_time:         { label: "Expected",           color: "bg-blue-100 text-blue-700" },
  sent_to_plant:            { label: "→ Plant",            color: "bg-cyan-100 text-cyan-700" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getItemAlloc(allocationStatus: any, category: string, index: number): any {
  const arrayKey = category === "materials" ? "materialItems"
    : category === "equipment" ? "equipmentItems"
    : category === "labour" ? "labourItems"
    : "immediateItems";
  const items = allocationStatus?.[arrayKey];
  if (!Array.isArray(items)) return null;
  return items.find((item: any) => item.index === index) ?? null;
}

function hasItemLevelData(allocationStatus: any): boolean {
  if (!allocationStatus) return false;
  return !!(allocationStatus.materialItems?.length || allocationStatus.equipmentItems?.length ||
    allocationStatus.labourItems?.length || allocationStatus.immediateItems?.length);
}

const REVISION_CONFIG: Record<string, { label: string; color: string }> = {
  original:           { label: "Original Submitted",  color: "bg-slate-100 text-slate-600" },
  revised:            { label: "Revised",              color: "bg-indigo-100 text-indigo-700" },
  revision_requested: { label: "Revision Requested",   color: "bg-amber-100 text-amber-700" },
  revision_approved:  { label: "Revision Approved",    color: "bg-blue-100 text-blue-700" },
  revision_rejected:  { label: "Revision Rejected",    color: "bg-red-100 text-red-700" },
};

function isActedUpon(req: any): boolean {
  const actioned = ["approved", "arranged", "sent_store", "sent_purchase", "sent_plant"];
  if (actioned.includes(req.status)) return true;
  const a = req.allocationStatus;
  if (!a) return false;
  return !!(a.materials || a.equipment || a.labour || a.immediate ||
    a.materialItems?.length || a.equipmentItems?.length || a.labourItems?.length || a.immediateItems?.length);
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  submitted:      { label: "Submitted",         color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  approved:       { label: "Approved",           color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  arranged:       { label: "Arranged",           color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  sent_store:     { label: "Sent to Store",      color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  sent_purchase:  { label: "Sent to Purchase",   color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  sent_plant:     { label: "Sent to Plant",      color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
  rejected:       { label: "Rejected",           color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  clarification:  { label: "Need Clarification", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

const PM_STATUS_OPTIONS = [
  "approved", "arranged", "sent_store", "sent_purchase", "sent_plant", "rejected", "clarification",
];

const ALLOC_STATUS_OPTIONS = [
  { value: "",             label: "— Not set" },
  { value: "requested",    label: "Requested" },
  { value: "approved",     label: "Approved" },
  { value: "arranged",     label: "Arranged" },
  { value: "available",    label: "Available at site" },
  { value: "expected",     label: "Expected at site" },
  { value: "partly",       label: "Partly available" },
  { value: "not_available",label: "Not available" },
  { value: "rejected",     label: "Cannot arrange" },
  { value: "clarification",label: "Need clarification" },
];

const READINESS_LABEL: Record<string, string> = {
  available:        "Available at site",
  expected_today:   "Expected today",
  partly_available: "Partly available",
  not_available:    "Not available",
  not_required:     "Not required",
};

function SectionIcon({ type }: { type: string }) {
  if (type === "materials")    return <Package className="w-3.5 h-3.5 text-emerald-600" />;
  if (type === "equipment")    return <Wrench className="w-3.5 h-3.5 text-amber-600" />;
  if (type === "labour")       return <Users className="w-3.5 h-3.5 text-teal-600" />;
  if (type === "immediate")    return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
  return <ClipboardList className="w-3.5 h-3.5 text-orange-500" />;
}

// ── ItemEditPanel — inline form for per-item status update ────────────────────

function ItemEditPanel({
  category, onSave, onCancel, isPending, initial,
}: {
  category: string;
  onSave: (status: string, expectedBy: string, remarks: string) => void;
  onCancel: () => void;
  isPending: boolean;
  initial?: { status?: string; expectedBy?: string; remarks?: string };
}) {
  const [status, setStatus] = useState(initial?.status ?? "");
  const [expectedBy, setExpectedBy] = useState(initial?.expectedBy ?? "");
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const options = ITEM_STATUS_OPTIONS[category] ?? [];
  const showExpectedBy = status === "expected_at_site" || status === "expected_by_time";

  return (
    <div className="mt-1.5 mb-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2.5 space-y-2">
      <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Update status</p>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="text-xs h-8 bg-white dark:bg-slate-900" data-testid="select-item-status">
          <SelectValue placeholder="— Select status" />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showExpectedBy && (
        <div>
          <p className="text-[10px] font-medium text-slate-500 mb-0.5">Expected by (date / time)</p>
          <input
            type="text"
            value={expectedBy}
            onChange={e => setExpectedBy(e.target.value)}
            placeholder="e.g. 10:30 AM or Tomorrow 8:00 AM"
            className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-900"
            data-testid="input-item-expected-by"
          />
        </div>
      )}
      <input
        type="text"
        value={remarks}
        onChange={e => setRemarks(e.target.value)}
        placeholder="Remarks (optional)"
        className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-900"
        data-testid="input-item-remarks"
      />
      <div className="flex gap-2">
        <Button
          type="button" size="sm"
          onClick={() => onSave(status, expectedBy, remarks)}
          disabled={!status || isPending}
          className="bg-blue-600 hover:bg-blue-700 h-7 text-xs px-3"
          data-testid="button-save-item-status"
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} className="h-7 text-xs px-2">Cancel</Button>
      </div>
    </div>
  );
}

// ── RequirementCard ───────────────────────────────────────────────────────────

function RequirementCard({
  req, canReview, canUpdateMaterials, canUpdateEquipment, canUpdateLabour, canUpdateImmediate, filterContext,
}: {
  req: any;
  canReview: boolean;
  canUpdateMaterials: boolean;
  canUpdateEquipment: boolean;
  canUpdateLabour: boolean;
  canUpdateImmediate: boolean;
  filterContext: string;
}) {
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState(req.status);
  const [pmRemarks, setPmRemarks] = useState(req.pmRemarks ?? "");
  const [editing, setEditing] = useState(false);

  // Revision state
  const [revRequestOpen, setRevRequestOpen] = useState(false);
  const [revReason, setRevReason] = useState("");
  const [revActionOpen, setRevActionOpen] = useState<"approve"|"reject"|null>(null);
  const [revActionRemarks, setRevActionRemarks] = useState("");

  // Section-level allocation state (kept for backward compat / overall summary)
  const [allocEditing, setAllocEditing] = useState(false);
  const [allocMat,  setAllocMat]  = useState(req.allocationStatus?.materials ?? "");
  const [allocMatR, setAllocMatR] = useState(req.allocationStatus?.materialsRemark ?? "");
  const [allocEq,   setAllocEq]   = useState(req.allocationStatus?.equipment ?? "");
  const [allocEqR,  setAllocEqR]  = useState(req.allocationStatus?.equipmentRemark ?? "");
  const [allocLab,  setAllocLab]  = useState(req.allocationStatus?.labour ?? "");
  const [allocLabR, setAllocLabR] = useState(req.allocationStatus?.labourRemark ?? "");
  const [allocImm,  setAllocImm]  = useState(req.allocationStatus?.immediate ?? "");
  const [allocImmR, setAllocImmR] = useState(req.allocationStatus?.immediateRemark ?? "");

  // Item-level edit state
  const [editingItem, setEditingItem] = useState<{category: string; index: number} | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/site-requirements"] });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/site-requirements/${req.id}/status`, {
        status: newStatus,
        pmRemarks,
        reviewedBy: (user as any)?.id,
      }),
    onSuccess: () => { invalidate(); toast({ title: "Status updated" }); setEditing(false); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const [, setLocation] = useLocation();
  const isOwner = req.submittedBy === (user as any)?.id;
  const acted = isActedUpon(req);
  const revStatus = req.revisionStatus ?? "original";

  const revRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/site-requirements/${req.id}/revision-request`, { reason: revReason }),
    onSuccess: () => { invalidate(); toast({ title: "Revision request sent" }); setRevRequestOpen(false); setRevReason(""); },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const revApproveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/site-requirements/${req.id}/revision-approve`, { remarks: revActionRemarks }),
    onSuccess: () => { invalidate(); toast({ title: "Revision approved" }); setRevActionOpen(null); setRevActionRemarks(""); },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const revRejectMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/site-requirements/${req.id}/revision-reject`, { remarks: revActionRemarks }),
    onSuccess: () => { invalidate(); toast({ title: "Revision rejected" }); setRevActionOpen(null); setRevActionRemarks(""); },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const allocMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/site-requirements/${req.id}/allocation`, {
        materials: allocMat || null, materialsRemark: allocMatR || null,
        equipment: allocEq || null,  equipmentRemark: allocEqR || null,
        labour:    allocLab || null, labourRemark:    allocLabR || null,
        immediate: allocImm || null, immediateRemark: allocImmR || null,
      }),
    onSuccess: () => { invalidate(); toast({ title: "Allocation updated" }); setAllocEditing(false); },
    onError: () => toast({ title: "Failed to save allocation", variant: "destructive" }),
  });

  const itemStatusMutation = useMutation({
    mutationFn: (payload: { category: string; index: number; status: string; expectedBy: string; remarks: string }) =>
      apiRequest("PATCH", `/api/site-requirements/${req.id}/item-status`, {
        category:   payload.category,
        itemIndex:  payload.index,
        status:     payload.status || null,
        expectedBy: payload.expectedBy || null,
        remarks:    payload.remarks || null,
      }),
    onSuccess: () => { invalidate(); toast({ title: "Item status updated" }); setEditingItem(null); },
    onError: (err: any) => {
      const msg = err?.message ?? err?.error ?? "Server error";
      console.error("[item-status] update failed:", err);
      toast({ title: "Failed to update item status", description: msg, variant: "destructive" });
    },
  });

  // ── Context-based section visibility ──────────────────────────────────────
  const showMaterials  = filterContext !== "equipment";
  const showEquipment  = filterContext !== "stores";
  const showLabour     = filterContext !== "equipment" && filterContext !== "stores";
  const visibleImmediate: any[] = (() => {
    const all: any[] = req.immediateRequirements ?? [];
    if (filterContext === "stores") {
      return all.filter((it: any) => {
        const c = (it.category ?? "").toLowerCase();
        return !c || c.includes("material") || c.includes("store") || c === "other";
      });
    }
    if (filterContext === "equipment") {
      return all.filter((it: any) => {
        const c = (it.category ?? "").toLowerCase();
        return !c || c.includes("equipment") || c.includes("plant") || c.includes("vehicle") || c === "other";
      });
    }
    return all;
  })();

  function openItemEdit(category: string, index: number) {
    setEditingItem({ category, index });
  }

  const sc = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.submitted;
  const hasShortage = req.readinessStatus === "confirmed_with_shortage";
  const sections: string[] = [];
  if (req.plannedWork?.activity) sections.push("planned");
  if (req.materials?.length)    sections.push("materials");
  if (req.equipment?.length)    sections.push("equipment");
  if (req.labour?.length)       sections.push("labour");
  if (req.immediateRequirements?.length) sections.push("immediate");

  function renderItemAlloc(alloc: any | null) {
    if (!alloc?.status) return null;
    const cfg = ITEM_STATUS_BADGE[alloc.status];
    return (
      <div className="mt-0.5 space-y-0.5">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg?.color ?? "bg-slate-100 text-slate-600"}`}>
          {cfg?.label ?? alloc.status}
        </span>
        {alloc.expectedBy && (
          <span className="text-[10px] text-blue-600 ml-1.5">⏰ {alloc.expectedBy}</span>
        )}
        {alloc.remarks && (
          <p className="text-[11px] text-slate-400 italic">{alloc.remarks}</p>
        )}
        {alloc.updatedBy && (
          <p className="text-[10px] text-slate-300">↳ {alloc.updatedBy}</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" data-testid={`card-requirement-${req.id}`}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
        data-testid={`toggle-requirement-${req.id}`}
      >
        <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-4 h-4 text-orange-600 dark:text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {req.date ? format(new Date(req.date + "T00:00:00"), "EEE, d MMM yyyy") : "—"}
            </span>
            {req.submittedByName && (
              <span className="text-xs text-slate-400">by {req.submittedByName}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <Badge className={`text-[11px] px-1.5 py-0 ${sc.color}`}>{sc.label}</Badge>
            {revStatus && revStatus !== "original" && REVISION_CONFIG[revStatus] && (
              <Badge className={`text-[11px] px-1.5 py-0 ${REVISION_CONFIG[revStatus].color}`}>
                {REVISION_CONFIG[revStatus].label}
              </Badge>
            )}
            {hasShortage && <Badge className="text-[11px] px-1.5 py-0 bg-red-100 text-red-600">⚠ Shortage</Badge>}
            {req.readinessStatus === "confirmed_ok" && (
              <Badge className="text-[11px] px-1.5 py-0 bg-green-100 text-green-700">✓ Readiness OK</Badge>
            )}
            {sections.map(s => (
              <span key={s} className="flex items-center gap-0.5 text-[11px] text-slate-400">
                <SectionIcon type={s} /> {s}
              </span>
            ))}
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 space-y-3">

          {/* Planned work */}
          {req.plannedWork?.activity && (
            <div>
              <p className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-1">Planned Work</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{req.plannedWork.activity}</p>
              {req.plannedWork.chainageFrom != null || req.plannedWork.chainageTo != null ? (
                <p className="text-xs text-slate-400">Ch. {req.plannedWork.chainageFrom ?? "?"} – {req.plannedWork.chainageTo ?? "?"} km</p>
              ) : req.plannedWork.chainage ? (
                <p className="text-xs text-slate-400">Chainage: {req.plannedWork.chainage}</p>
              ) : null}
              {req.plannedWork.plannedQty && (
                <p className="text-xs text-slate-400">Qty: {req.plannedWork.plannedQty} {req.plannedWork.plannedUom}</p>
              )}
              {req.plannedWork.remarks && <p className="text-xs text-slate-400 italic">{req.plannedWork.remarks}</p>}
            </div>
          )}

          {/* ── Materials (with item-level status) ── */}
          {showMaterials && req.materials?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Materials</p>
              <div className="space-y-0.5">
                {req.materials.map((m: any, i: number) => {
                  const alloc = getItemAlloc(req.allocationStatus, "materials", i);
                  const isEditingThis = editingItem?.category === "materials" && editingItem.index === i;
                  return (
                    <div key={i} className="border-b border-slate-50 dark:border-slate-800 pb-1.5 last:border-0">
                      <div className="flex items-start gap-2">
                        <Package className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{m.materialName}</span>
                            <span className="text-xs text-slate-400">{m.qty} {m.uom}</span>
                            {m.sourcePreference && <span className="text-xs text-slate-400">· {m.sourcePreference}</span>}
                            {m.urgency === "immediate" && (
                              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">URGENT</span>
                            )}
                          </div>
                          {renderItemAlloc(alloc)}
                        </div>
                        {canUpdateMaterials && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => openItemEdit("materials", i)}
                            className="flex-shrink-0 text-[10px] text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-1.5 py-0.5 flex items-center gap-0.5 hover:bg-blue-50 transition-colors"
                            data-testid={`button-update-mat-${req.id}-${i}`}
                          >
                            <Pen className="w-2.5 h-2.5" /> Update
                          </button>
                        )}
                      </div>
                      {isEditingThis && (
                        <ItemEditPanel
                          category="materials"
                          initial={{ status: alloc?.status, expectedBy: alloc?.expectedBy, remarks: alloc?.remarks }}
                          isPending={itemStatusMutation.isPending}
                          onCancel={() => setEditingItem(null)}
                          onSave={(status, expectedBy, remarks) =>
                            itemStatusMutation.mutate({ category: "materials", index: i, status, expectedBy, remarks })
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Equipment (with item-level status) ── */}
          {showEquipment && req.equipment?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Equipment</p>
              <div className="space-y-0.5">
                {req.equipment.map((e: any, i: number) => {
                  const alloc = getItemAlloc(req.allocationStatus, "equipment", i);
                  const isEditingThis = editingItem?.category === "equipment" && editingItem.index === i;
                  return (
                    <div key={i} className="border-b border-slate-50 dark:border-slate-800 pb-1.5 last:border-0">
                      <div className="flex items-start gap-2">
                        <Wrench className="w-3 h-3 text-amber-500 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{e.numberRequired}× {e.equipmentType}</span>
                            {e.requiredFromTime && <span className="text-xs text-slate-400">from {e.requiredFromTime}</span>}
                            {e.expectedDuration && <span className="text-xs text-slate-400">· {e.expectedDuration}</span>}
                            {e.operatorRequired && <span className="text-xs text-slate-400">· operator needed</span>}
                          </div>
                          {renderItemAlloc(alloc)}
                        </div>
                        {canUpdateEquipment && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => openItemEdit("equipment", i)}
                            className="flex-shrink-0 text-[10px] text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-1.5 py-0.5 flex items-center gap-0.5 hover:bg-blue-50 transition-colors"
                            data-testid={`button-update-eq-${req.id}-${i}`}
                          >
                            <Pen className="w-2.5 h-2.5" /> Update
                          </button>
                        )}
                      </div>
                      {isEditingThis && (
                        <ItemEditPanel
                          category="equipment"
                          initial={{ status: alloc?.status, expectedBy: alloc?.expectedBy, remarks: alloc?.remarks }}
                          isPending={itemStatusMutation.isPending}
                          onCancel={() => setEditingItem(null)}
                          onSave={(status, expectedBy, remarks) =>
                            itemStatusMutation.mutate({ category: "equipment", index: i, status, expectedBy, remarks })
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Labour (with item-level status) ── */}
          {showLabour && req.labour?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-teal-600 uppercase tracking-wider mb-2">Labour</p>
              <div className="space-y-0.5">
                {req.labour.map((l: any, i: number) => {
                  const alloc = getItemAlloc(req.allocationStatus, "labour", i);
                  const isEditingThis = editingItem?.category === "labour" && editingItem.index === i;
                  return (
                    <div key={i} className="border-b border-slate-50 dark:border-slate-800 pb-1.5 last:border-0">
                      <div className="flex items-start gap-2">
                        <Users className="w-3 h-3 text-teal-500 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{l.count} {l.labourType}</span>
                            {l.skilledType && <span className="text-xs text-slate-400">({l.skilledType})</span>}
                            {l.requiredFromTime && <span className="text-xs text-slate-400">from {l.requiredFromTime}</span>}
                          </div>
                          {renderItemAlloc(alloc)}
                        </div>
                        {canUpdateLabour && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => openItemEdit("labour", i)}
                            className="flex-shrink-0 text-[10px] text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-1.5 py-0.5 flex items-center gap-0.5 hover:bg-blue-50 transition-colors"
                            data-testid={`button-update-lab-${req.id}-${i}`}
                          >
                            <Pen className="w-2.5 h-2.5" /> Update
                          </button>
                        )}
                      </div>
                      {isEditingThis && (
                        <ItemEditPanel
                          category="labour"
                          initial={{ status: alloc?.status, expectedBy: alloc?.expectedBy, remarks: alloc?.remarks }}
                          isPending={itemStatusMutation.isPending}
                          onCancel={() => setEditingItem(null)}
                          onSave={(status, expectedBy, remarks) =>
                            itemStatusMutation.mutate({ category: "labour", index: i, status, expectedBy, remarks })
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Immediate requirements (with item-level status, context-filtered) ── */}
          {visibleImmediate.length > 0 && (
            <div>
              <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Immediate Requirements</p>
              <div className="space-y-0.5">
                {visibleImmediate.map((item: any, i: number) => {
                  const alloc = getItemAlloc(req.allocationStatus, "immediate", i);
                  const isEditingThis = editingItem?.category === "immediate" && editingItem.index === i;
                  return (
                    <div key={i} className="border-b border-slate-50 dark:border-slate-800 pb-1.5 last:border-0">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.description}</span>
                            <span className="text-xs text-slate-400">{item.category}</span>
                            {item.urgency === "immediate" && (
                              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">URGENT</span>
                            )}
                          </div>
                          {item.reason && <p className="text-xs text-slate-400 italic">{item.reason}</p>}
                          {renderItemAlloc(alloc)}
                        </div>
                        {canUpdateImmediate && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => openItemEdit("immediate", i)}
                            className="flex-shrink-0 text-[10px] text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-1.5 py-0.5 flex items-center gap-0.5 hover:bg-blue-50 transition-colors"
                            data-testid={`button-update-imm-${req.id}-${i}`}
                          >
                            <Pen className="w-2.5 h-2.5" /> Update
                          </button>
                        )}
                      </div>
                      {isEditingThis && (
                        <ItemEditPanel
                          category="immediate"
                          initial={{ status: alloc?.status, expectedBy: alloc?.expectedBy, remarks: alloc?.remarks }}
                          isPending={itemStatusMutation.isPending}
                          onCancel={() => setEditingItem(null)}
                          onSave={(status, expectedBy, remarks) =>
                            itemStatusMutation.mutate({ category: "immediate", index: i, status, expectedBy, remarks })
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PM remarks */}
          {req.pmRemarks && !editing && (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
              <p className="text-xs font-bold text-slate-500 mb-0.5">PM Remarks</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">{req.pmRemarks}</p>
            </div>
          )}

          {/* Readiness confirmation summary */}
          {req.readinessStatus && req.readinessStatus !== "not_confirmed" && req.readinessConfirmation && (
            <div className={`rounded-lg px-3 py-2.5 border ${hasShortage ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" : "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${hasShortage ? "text-red-500" : "text-green-600"}`}>
                {hasShortage ? "⚠ Engineer confirmed — shortage noted" : "✓ Engineer confirmed readiness"}
              </p>
              {[
                { label: "Materials",  val: req.readinessConfirmation.materialStatus,  icon: Package },
                { label: "Equipment",  val: req.readinessConfirmation.equipmentStatus, icon: Wrench },
                { label: "Labour",     val: req.readinessConfirmation.labourStatus,    icon: Users },
                { label: "Immediate",  val: req.readinessConfirmation.immediateStatus, icon: AlertTriangle },
              ].filter(r => r.val && r.val !== "not_required").map(r => (
                <div key={r.label} className="flex items-center gap-2 mb-1">
                  <r.icon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">{r.label}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    r.val === "available" ? "bg-green-100 text-green-700"
                    : r.val === "expected_today" ? "bg-blue-100 text-blue-700"
                    : r.val === "partly_available" ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
                  }`}>
                    {READINESS_LABEL[r.val] ?? r.val}
                  </span>
                </div>
              ))}
              {req.readinessConfirmation.remarks && (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic mt-1 pt-1 border-t border-slate-200 dark:border-slate-700">
                  {req.readinessConfirmation.remarks}
                </p>
              )}
              {req.readinessConfirmation.confirmedByName && (
                <p className="text-[10px] text-slate-400 mt-0.5">by {req.readinessConfirmation.confirmedByName}</p>
              )}
            </div>
          )}

          {/* Section-level allocation (shown when no item-level data yet, or as overall summary) */}
          {req.allocationStatus && !hasItemLevelData(req.allocationStatus) && !allocEditing && (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Overall Allocation Summary</p>
                {canReview && (
                  <button type="button" onClick={() => setAllocEditing(true)} className="text-[10px] text-blue-600 hover:underline" data-testid={`button-edit-alloc-${req.id}`}>Edit</button>
                )}
              </div>
              {[
                { key: "materials", remarkKey: "materialsRemark", icon: Package, label: "Materials" },
                { key: "equipment", remarkKey: "equipmentRemark", icon: Wrench, label: "Equipment" },
                { key: "labour",    remarkKey: "labourRemark",    icon: Users, label: "Labour" },
                { key: "immediate", remarkKey: "immediateRemark", icon: AlertTriangle, label: "Immediate" },
              ].filter(r => req.allocationStatus[r.key]).map(r => {
                const val = req.allocationStatus[r.key];
                const remark = req.allocationStatus[r.remarkKey];
                const badgeColor = val === "available" || val === "approved" || val === "arranged"
                  ? "bg-green-100 text-green-700" : val === "expected" || val === "requested"
                  ? "bg-blue-100 text-blue-700" : val === "partly"
                  ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
                const badgeLabel = ALLOC_STATUS_OPTIONS.find(o => o.value === val)?.label ?? val;
                return (
                  <div key={r.key}>
                    <div className="flex items-center gap-2">
                      <r.icon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">{r.label}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badgeLabel}</span>
                    </div>
                    {remark && <p className="text-[11px] text-slate-400 italic pl-5">{remark}</p>}
                  </div>
                );
              })}
              {req.allocationStatus.updatedByName && (
                <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-200">by {req.allocationStatus.updatedByName}</p>
              )}
            </div>
          )}

          {/* Revision reason / remarks display */}
          {req.revisionRequestReason && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 space-y-0.5">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Revision Request Reason</p>
              <p className="text-xs text-slate-700 dark:text-slate-200">{req.revisionRequestReason}</p>
              {req.revisionRemarks && <p className="text-xs text-slate-500 italic">PM remarks: {req.revisionRemarks}</p>}
            </div>
          )}

          {/* Engineer (submitter) revision controls */}
          {isOwner && !canReview && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              {!acted && revStatus === "original" && (
                <Button type="button" variant="outline" size="sm" className="gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                  onClick={() => setLocation(`/site/requirements/new?editId=${req.id}&returnTo=/site/requirements`)}
                  data-testid={`button-revise-${req.id}`}>
                  <Pencil className="w-3.5 h-3.5" /> Revise Requirement
                </Button>
              )}
              {(acted || revStatus === "revision_rejected") && revStatus !== "revision_requested" && revStatus !== "revision_approved" && !req.revisionOneTimeUsed && (
                <>
                  {!revRequestOpen ? (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                      onClick={() => setRevRequestOpen(true)} data-testid={`button-request-revision-${req.id}`}>
                      <Send className="w-3.5 h-3.5" /> Request Revision
                    </Button>
                  ) : (
                    <div className="space-y-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-3 border border-amber-100 dark:border-amber-800">
                      <p className="text-xs font-bold text-amber-700">Reason for revision request</p>
                      <Textarea value={revReason} onChange={e => setRevReason(e.target.value)}
                        placeholder="Briefly explain what you missed or need to correct..."
                        className="text-sm resize-none bg-white dark:bg-slate-900" rows={3}
                        data-testid={`input-rev-reason-${req.id}`} />
                      <div className="flex gap-2">
                        <Button type="button" size="sm"
                          onClick={() => revRequestMutation.mutate()}
                          disabled={!revReason.trim() || revRequestMutation.isPending}
                          className="bg-amber-600 hover:bg-amber-700" data-testid={`button-send-rev-request-${req.id}`}>
                          {revRequestMutation.isPending ? "Sending..." : "Send Request"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setRevRequestOpen(false); setRevReason(""); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {revStatus === "revision_requested" && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 border border-amber-200">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  Revision request sent — awaiting PM/Admin approval
                </div>
              )}
              {revStatus === "revision_approved" && !req.revisionOneTimeUsed && (
                <Button type="button" size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                  onClick={() => setLocation(`/site/requirements/new?editId=${req.id}&returnTo=/site/requirements`)}
                  data-testid={`button-edit-now-${req.id}`}>
                  <Pencil className="w-3.5 h-3.5" /> Edit Now (one-time)
                </Button>
              )}
              {revStatus === "revision_rejected" && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 border border-red-200">
                  <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Revision request was rejected
                  {req.revisionRemarks && <span className="text-slate-500">— {req.revisionRemarks}</span>}
                </div>
              )}
            </div>
          )}

          {/* PM/Admin can always edit directly */}
          {canReview && revStatus !== "revision_requested" && (
            <div className="pt-1">
              <Button type="button" variant="ghost" size="sm"
                className="gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-7 text-xs px-2"
                onClick={() => setLocation(`/site/requirements/new?editId=${req.id}&returnTo=/site/requirements`)}
                data-testid={`button-pm-edit-${req.id}`}>
                <Pencil className="w-3 h-3" /> Edit Requirement
              </Button>
            </div>
          )}

          {/* PM Revision Approval panel */}
          {canReview && revStatus === "revision_requested" && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-3 border border-amber-200 dark:border-amber-800 space-y-2">
              <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Revision Requested by site user
              </p>
              {!revActionOpen ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5"
                    onClick={() => setRevActionOpen("approve")} data-testid={`button-approve-revision-${req.id}`}>
                    <CheckCircle className="w-3.5 h-3.5" /> Approve Revision
                  </Button>
                  <Button type="button" size="sm" variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                    onClick={() => setRevActionOpen("reject")} data-testid={`button-reject-revision-${req.id}`}>
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {revActionOpen === "approve" ? "Approving will allow the site user to make one edit." : "Provide a reason for rejection (optional)."}
                  </p>
                  <Textarea value={revActionRemarks} onChange={e => setRevActionRemarks(e.target.value)}
                    placeholder={revActionOpen === "approve" ? "PM remarks (optional)" : "Reason for rejection (optional)"}
                    className="text-sm resize-none bg-white dark:bg-slate-900" rows={2}
                    data-testid={`input-rev-action-remarks-${req.id}`} />
                  <div className="flex gap-2">
                    <Button type="button" size="sm"
                      disabled={revApproveMutation.isPending || revRejectMutation.isPending}
                      className={revActionOpen === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                      onClick={() => revActionOpen === "approve" ? revApproveMutation.mutate() : revRejectMutation.mutate()}
                      data-testid={`button-confirm-rev-action-${req.id}`}>
                      {revApproveMutation.isPending || revRejectMutation.isPending ? "Saving..."
                        : revActionOpen === "approve" ? "Confirm Approval" : "Confirm Rejection"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setRevActionOpen(null); setRevActionRemarks(""); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PM review controls — overall status + section allocation */}
          {canReview && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">

              {/* Overall allocation form */}
              {allocEditing ? (
                <div className="space-y-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-3 border border-blue-100 dark:border-blue-800">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-300">Update Overall Allocation Status</p>
                  {[
                    { label: "Materials",  state: allocMat,  setState: setAllocMat,  remarkState: allocMatR,  setRemarkState: setAllocMatR,  icon: Package,       show: req.materials?.length > 0 },
                    { label: "Equipment",  state: allocEq,   setState: setAllocEq,   remarkState: allocEqR,   setRemarkState: setAllocEqR,   icon: Wrench,        show: req.equipment?.length > 0 },
                    { label: "Labour",     state: allocLab,  setState: setAllocLab,  remarkState: allocLabR,  setRemarkState: setAllocLabR,  icon: Users,         show: req.labour?.length > 0 },
                    { label: "Immediate",  state: allocImm,  setState: setAllocImm,  remarkState: allocImmR,  setRemarkState: setAllocImmR,  icon: AlertTriangle, show: req.immediateRequirements?.length > 0 },
                  ].filter(r => r.show).map(r => (
                    <div key={r.label} className="space-y-1">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                        <r.icon className="w-3 h-3" /> {r.label}
                      </p>
                      <Select value={r.state} onValueChange={r.setState}>
                        <SelectTrigger className="text-xs h-8" data-testid={`select-alloc-${r.label.toLowerCase()}-${req.id}`}>
                          <SelectValue placeholder="— Not set" />
                        </SelectTrigger>
                        <SelectContent>
                          {ALLOC_STATUS_OPTIONS.map(o => (
                            <SelectItem key={o.value || "__none__"} value={o.value || "__none__"}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <input type="text" value={r.remarkState} onChange={e => r.setRemarkState(e.target.value)}
                        placeholder="Remark (optional)"
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white dark:bg-slate-900 dark:border-slate-700"
                        data-testid={`input-alloc-remark-${r.label.toLowerCase()}-${req.id}`} />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => allocMutation.mutate()} disabled={allocMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700" data-testid={`button-save-alloc-${req.id}`}>
                      {allocMutation.isPending ? "Saving..." : "Save Allocation"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAllocEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                !req.allocationStatus && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setAllocEditing(true)}
                    data-testid={`button-set-alloc-${req.id}`}>
                    Set Overall Allocation Status
                  </Button>
                )
              )}

              {/* Status review */}
              {!editing ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} data-testid={`button-review-${req.id}`}>
                  Update Overall Status
                </Button>
              ) : (
                <div className="space-y-2">
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="text-sm" data-testid={`select-status-${req.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PM_STATUS_OPTIONS.map(s => (
                        <SelectItem key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea value={pmRemarks} onChange={e => setPmRemarks(e.target.value)}
                    placeholder="PM remarks (optional)" className="text-sm resize-none" rows={2}
                    data-testid={`input-pm-remarks-${req.id}`} />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}
                      className="bg-orange-600 hover:bg-orange-700" data-testid={`button-save-status-${req.id}`}>
                      {updateMutation.isPending ? "Saving..." : "Save Status"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Context config ────────────────────────────────────────────────────────────

const CONTEXT_CONFIG: Record<string, { title: string; subtitle: string; backLabel: string; defaultBack: string }> = {
  equipment: {
    title:       "Site Equipment Requirements",
    subtitle:    "Equipment requirements from upcoming site work",
    backLabel:   "Equipment & Fleet",
    defaultBack: "/equipment/hub",
  },
  stores: {
    title:       "Site Material Requirements",
    subtitle:    "Material requirements from upcoming site work",
    backLabel:   "Stores & Inventory",
    defaultBack: "/stores/hub",
  },
  admin: {
    title:       "Site Requirements Queue",
    subtitle:    "Pending site plans and immediate needs",
    backLabel:   "Admin",
    defaultBack: "/admin/hub",
  },
  dashboard: {
    title:       "Site Requirements Queue",
    subtitle:    "Pending site plans and immediate needs",
    backLabel:   "Dashboard",
    defaultBack: "/",
  },
  site: {
    title:       "Site Requirements Queue",
    subtitle:    "Review, arrange and respond to site requirements",
    backLabel:   "Site Operations",
    defaultBack: "/site/hub",
  },
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SiteRequirementsList() {
  const { sectionVisible, user, isFieldEngineer } = useAuth();
  const search = useSearch();
  const role = (user as any)?.role ?? "engineer";
  const isManager = role === "admin" || role === "manager";

  const searchParams = new URLSearchParams(search);
  const context = searchParams.get("context") ?? "site";
  const returnTo = searchParams.get("returnTo") ?? "";

  const cfg = CONTEXT_CONFIG[context] ?? CONTEXT_CONFIG.site;
  const backHref = returnTo || cfg.defaultBack;

  // For site engineers, always show "Your submitted requirements"
  const subtitle = isFieldEngineer
    ? "Your submitted requirements"
    : cfg.subtitle;

  const { data: reqs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/site-requirements"],
  });

  // Role-aware update flags — permission-based, not just role
  const canUpdateMaterials = isManager || sectionVisible("stores_inventory");
  const canUpdateEquipment = isManager || sectionVisible("plant_equipment");
  const canUpdateLabour    = isManager;
  const canUpdateImmediate = isManager || sectionVisible("stores_inventory") || sectionVisible("plant_equipment");

  // Site engineers cannot approve/arrange their own requirements
  const canReview = isManager;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 py-4 pb-20">
        <div className="flex items-center gap-3 mb-4">
          <Link href={backHref}>
            <a className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 text-slate-600" />
            </a>
          </Link>
          <div className="flex-1 min-w-0">
            {context !== "site" && (
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                {cfg.backLabel}
              </p>
            )}
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">{cfg.title}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          {/* Only show + New for engineers / managers in non-filtered contexts */}
          {context !== "equipment" && context !== "stores" && (
            <div className="ml-auto">
              <Link href="/site/requirements/new?returnTo=/site/requirements">
                <a data-testid="button-new-requirement">
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600 gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" /> + New
                  </Button>
                </a>
              </Link>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="text-sm text-slate-400 text-center py-12">Loading...</div>
        )}

        {!isLoading && reqs.length === 0 && (
          <div className="text-center py-16">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No requirements yet</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Tomorrow's plans and immediate requirements will appear here.</p>
            {context !== "equipment" && context !== "stores" && (
              <Link href="/site/requirements/new?returnTo=/site/requirements">
                <a data-testid="button-submit-first">
                  <Button size="sm" variant="outline">Submit Tomorrow's Plan</Button>
                </a>
              </Link>
            )}
          </div>
        )}

        <div className="space-y-3">
          {reqs.map((req: any) => (
            <RequirementCard
              key={req.id}
              req={req}
              canReview={canReview}
              canUpdateMaterials={canUpdateMaterials}
              canUpdateEquipment={canUpdateEquipment}
              canUpdateLabour={canUpdateLabour}
              canUpdateImmediate={canUpdateImmediate}
              filterContext={context}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
