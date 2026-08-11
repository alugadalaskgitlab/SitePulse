import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Truck, ShoppingBag,
  BookOpen, LayoutDashboard, MapPin,
  ArrowRight, AlertTriangle, CheckCircle2, Circle, AlertCircle,
  Target, Zap, ClipboardList, Home, FileText, User,
  ChevronRight, ChevronDown, CalendarPlus,
  Package, Wrench, Users, CheckCheck, XCircle, Clock, ChevronUp,
  Boxes, Info, Activity,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { AdminNotifications } from "@/components/AdminNotifications";
import { useAuth } from "@/lib/auth-context";
import { useDeviceType } from "@/hooks/use-device-type";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format, addDays } from "date-fns";
import { roadDprHref, roadDprDraftHref } from "@/lib/dprEntryMode";
import { findOlderPendingDprs } from "@/lib/dprLifecycle";
import { deriveDprChecklist } from "@shared/dprFieldChecklist";
import type { PlanVsActualRow, BoqProjectWithCounts } from "@shared/schema";

// ─── Short name extraction ────────────────────────────────────────────────────
// Category name takes priority if it is concise. Otherwise keyword-match the
// full BOQ description to a familiar construction short name.

function extractShortName(description: string, categoryName: string | null): string {
  // Always try the item's own description first — keyword shortcuts, then raw text.
  // The category name is a last resort only when description is blank/unusable.
  const d = description.toUpperCase();
  // SUBGRADE must be checked BEFORE the EMBANKMENT checks: many MoRTH subgrade
  // descriptions mention "embankment/subgrade" together and would otherwise be
  // mislabelled as Embankment (Instruction 030 Part B).
  if (d.includes("SUBGRADE"))                          return "Subgrade Preparation";
  if (d.includes("EMBANKMENT") && (d.includes("BORROW") || d.includes("IMPORT"))) return "Embankment — Borrow Earth";
  if (d.includes("EMBANKMENT") && d.includes("CUT"))  return "Embankment — Cut Material";
  if (d.includes("EMBANKMENT"))                        return "Embankment";
  if (d.includes("CLEARING") || d.includes("GRUBBING")) return "Clearing & Grubbing";
  if (d.includes("GSB") || d.includes("GRANULAR SUB-BASE") || d.includes("GRANULAR SUBBASE")) return "GSB — Granular Sub-base";
  if (d.includes("WMM") || d.includes("WET MIX MACADAM")) return "WMM — Wet Mix Macadam";
  if (d.includes("WBM"))                               return "WBM";
  if (d.includes("PRIME COAT"))                        return "Prime Coat";
  if (d.includes("TACK COAT"))                         return "Tack Coat";
  if (d.includes("DBM") || d.includes("DENSE BITUMINOUS MACADAM")) return "DBM";
  if (d.includes("BC ") || d.includes("BITUMINOUS CONCRETE") || d.includes("WEARING COURSE")) return "BC — Wearing Course";
  if (d.includes("DRAIN") && d.includes("EXCAV"))      return "Drain Excavation";
  if (d.includes("PIPE CULVERT") && d.includes("BEDDING")) return "Pipe Culvert — Bedding";
  if (d.includes("PIPE CULVERT") && (d.includes("LAY") || d.includes("LAYING"))) return "Pipe Culvert — Pipe Laying";
  if (d.includes("PIPE CULVERT"))                      return "Pipe Culvert";
  if (d.includes("BOX CULVERT"))                       return "Box Culvert";
  if (d.includes("RETAINING WALL"))                    return "Retaining Wall";
  if (d.includes("GABION"))                            return "Gabion Work";
  if (d.includes("PCC") || (d.includes("PLAIN") && d.includes("CEMENT CONCRETE"))) return "PCC";
  if (d.includes("RCC") || (d.includes("REINFORCED") && d.includes("CEMENT CONCRETE"))) return "RCC";
  if (d.includes("REINFORCEMENT") || d.includes("REBAR")) return "Reinforcement";
  if (d.includes("BRIDGE"))                            return "Bridge";
  if (d.includes("GUARD RAIL") || d.includes("GUARD STONE")) return "Guard Rail";
  if (d.includes("KERB"))                              return "Kerb";
  if (d.includes("FOOTPATH"))                          return "Footpath";
  if (d.includes("MEDIAN"))                            return "Median";
  if (d.includes("SIGN"))                              return "Signage";
  if (d.includes("EXCAVATION"))                        return "Excavation";
  // No keyword matched — use the raw description if it has content.
  if (description.trim()) return description.length > 35 ? description.slice(0, 33) + "…" : description;
  // Description is blank/unusable — fall back to category name as a last resort.
  if (categoryName?.trim()) return categoryName.length > 35 ? categoryName.slice(0, 33) + "…" : categoryName;
  return "—";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DprPhase =
  | "not-started"       // no DPR for this site+date
  | "draft-own"         // draft opened by current user
  | "submitted-own"     // submitted by current user
  | "submitted-other";  // submitted by a different user

type CheckState = "done" | "pending";

interface CheckItem {
  id: string;
  label: string;
  state: CheckState;
  sub: string;
  /** Batch 06D — per-row pending lines from the shared readiness validator */
  details?: string[];
}

interface FocusItem {
  level: "warn" | "alert" | "info" | "ok";
  text: string;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ToDoBadge({ type, text }: {
  type: "backlog" | "ahead" | "on-track" | "pending" | "not-started";
  text: string;
}) {
  const styles: Record<string, string> = {
    backlog:      "text-red-600 bg-red-50 border border-red-100",
    ahead:        "text-blue-600 bg-blue-50 border border-blue-100",
    "on-track":   "text-teal-600 bg-teal-50 border border-teal-100",
    pending:      "text-amber-700 bg-amber-50 border border-amber-100",
    "not-started":"text-gray-500 bg-gray-100 border border-gray-200",
  };
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${styles[type] ?? styles["not-started"]}`}>
      {text}
    </span>
  );
}

function FocusRow({ item }: { item: FocusItem }) {
  const s = {
    warn:  { dot: "bg-red-400",    bg: "bg-red-50",    text: "text-red-800"   },
    alert: { dot: "bg-amber-400",  bg: "bg-amber-50",  text: "text-amber-800" },
    info:  { dot: "bg-blue-400",   bg: "bg-blue-50",   text: "text-blue-800"  },
    ok:    { dot: "bg-green-400",  bg: "bg-green-50",  text: "text-green-800" },
  }[item.level];
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg ${s.bg}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-[5px] ${s.dot}`} />
      <p className={`text-sm leading-snug ${s.text}`}>{item.text}</p>
    </div>
  );
}

function PendingRow({ item }: { item: CheckItem }) {
  const icon = item.state === "done"
    ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
    : <Circle       className="w-5 h-5 text-gray-300 flex-shrink-0" />;
  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      {icon}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${item.state === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>
          {item.label}
        </p>
        {item.sub && (
          <p className={`text-xs mt-0.5 ${item.state === "done" ? "text-gray-300" : "text-gray-400"}`}>{item.sub}</p>
        )}
        {/* Batch 06D §8: itemised per-row pending lines straight from the
            shared readiness validator — no fabricated generic messages. */}
        {item.state === "pending" && (item.details?.length ?? 0) > 0 && (
          <ul className="mt-1 space-y-0.5" data-testid={`pending-details-${item.id}`}>
            {item.details!.map((line, i) => (
              <li key={i} className="text-xs text-amber-700 leading-snug">• {line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Readiness for Today's Work ──────────────────────────────────────────────

const TODAY_DATE = format(new Date(), "yyyy-MM-dd");

const ALLOC_CFG: Record<string, { label: string; color: string }> = {
  requested:     { label: "Requested",           color: "bg-blue-100 text-blue-700" },
  approved:      { label: "Approved",            color: "bg-green-100 text-green-700" },
  arranged:      { label: "Arranged",            color: "bg-emerald-100 text-emerald-700" },
  available:     { label: "Available",           color: "bg-green-100 text-green-700" },
  expected:      { label: "Expected at site",    color: "bg-blue-100 text-blue-700" },
  partly:        { label: "Partly available",    color: "bg-amber-100 text-amber-700" },
  not_available: { label: "Not available",       color: "bg-red-100 text-red-700" },
  rejected:      { label: "Cannot arrange",      color: "bg-red-100 text-red-700" },
  clarification: { label: "Clarification needed",color: "bg-amber-100 text-amber-700" },
};

function AllocBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cfg = ALLOC_CFG[status] ?? { label: status, color: "bg-gray-100 text-gray-600" };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
  );
}

const ITEM_ALLOC_CFG: Record<string, { label: string; color: string }> = {
  available_in_store:       { label: "In Store",         color: "bg-green-100 text-green-700" },
  issued:                   { label: "Issued",            color: "bg-emerald-100 text-emerald-700" },
  expected_at_site:         { label: "Expected at site",  color: "bg-blue-100 text-blue-700" },
  not_available:            { label: "Not available",     color: "bg-red-100 text-red-600" },
  purchase_required:        { label: "Purchase needed",   color: "bg-violet-100 text-violet-700" },
  sent_to_purchase:         { label: "→ Purchase",        color: "bg-violet-100 text-violet-700" },
  direct_supply_arranged:   { label: "Direct supply",     color: "bg-teal-100 text-teal-700" },
  need_clarification:       { label: "? Clarification",   color: "bg-amber-100 text-amber-700" },
  allocated:                { label: "Allocated",          color: "bg-green-100 text-green-700" },
  available_at_site:        { label: "Available",         color: "bg-green-100 text-green-700" },
  alternative_arranged:     { label: "Alternative",       color: "bg-teal-100 text-teal-700" },
  arranged:                 { label: "Arranged",          color: "bg-green-100 text-green-700" },
  partly_arranged:          { label: "Partly arranged",   color: "bg-amber-100 text-amber-700" },
  expected_by_time:         { label: "Expected",          color: "bg-blue-100 text-blue-700" },
  sent_to_plant:            { label: "→ Plant",           color: "bg-cyan-100 text-cyan-700" },
};

function ItemAllocBadgeFH({ status }: { status?: string }) {
  if (!status) return null;
  const cfg = ITEM_ALLOC_CFG[status] ?? { label: status, color: "bg-gray-100 text-gray-600" };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>;
}

function getItemAllocFH(allocationStatus: any, category: string, index: number): any {
  const arrayKey = category === "materials" ? "materialItems"
    : category === "equipment" ? "equipmentItems"
    : category === "labour" ? "labourItems"
    : "immediateItems";
  const items = allocationStatus?.[arrayKey];
  if (!Array.isArray(items)) return null;
  return items.find((item: any) => item.index === index) ?? null;
}

function hasItemLevelAllocFH(allocationStatus: any): boolean {
  if (!allocationStatus) return false;
  return !!(allocationStatus.materialItems?.length || allocationStatus.equipmentItems?.length ||
    allocationStatus.labourItems?.length || allocationStatus.immediateItems?.length);
}

const READINESS_BTNS = [
  { value: "available",        label: "✓ Available",       active: "bg-green-500 text-white border-green-500" },
  { value: "expected_today",   label: "⏰ Expected today",  active: "bg-blue-500 text-white border-blue-500" },
  { value: "partly_available", label: "◑ Partly available", active: "bg-amber-500 text-white border-amber-500" },
  { value: "not_available",    label: "✗ Not available",   active: "bg-red-500 text-white border-red-500" },
];

function ReadinessOptionRow({
  label, icon: Icon, iconColor, value, onChange, items,
}: {
  label: string; icon: any; iconColor: string;
  value: string; onChange: (v: string) => void; items?: any[];
}) {
  if (!items?.length) return null;
  return (
    <div>
      <p className={`text-[10px] font-bold ${iconColor} uppercase tracking-wider mb-1.5 flex items-center gap-1`}>
        <Icon className="w-3 h-3" /> {label}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {READINESS_BTNS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? "" : opt.value)}
            className={`text-xs py-1.5 px-2 rounded-lg border transition-colors font-medium text-left ${
              value === opt.value ? opt.active : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            data-testid={`readiness-${label.toLowerCase()}-${opt.value}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReadinessSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sectionVisible } = useAuth();
  const canRaiseIrn = sectionVisible("irn_raise");
  const [collapsed, setCollapsed] = useState(false);
  const [matStatus, setMatStatus] = useState("");
  const [eqStatus,  setEqStatus]  = useState("");
  const [labStatus, setLabStatus] = useState("");
  const [immStatus, setImmStatus] = useState("");
  const [remarks,   setRemarks]   = useState("");

  const { data: todayReqs = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/site-requirements?dateFrom=${TODAY_DATE}&dateTo=${TODAY_DATE}`],
  });

  const req = todayReqs[0];
  const alreadyConfirmed = req?.readinessStatus && req.readinessStatus !== "not_confirmed";

  const confirmMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/site-requirements/${req.id}/readiness`, {
        materialStatus:  matStatus  || "not_required",
        equipmentStatus: eqStatus   || "not_required",
        labourStatus:    labStatus  || "not_required",
        immediateStatus: immStatus  || "not_required",
        remarks,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/site-requirements?dateFrom=${TODAY_DATE}&dateTo=${TODAY_DATE}`],
      });
      toast({ title: "Readiness confirmed", description: "Your morning readiness has been saved." });
    },
    onError: (err: any) =>
      toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return null;

  const hasAnyRequest = req && (
    req.materials?.length > 0 || req.equipment?.length > 0 ||
    req.labour?.length > 0 || req.immediateRequirements?.length > 0
  );

  const shortage = req?.readinessStatus === "confirmed_with_shortage";
  const allClear  = req?.readinessStatus === "confirmed_ok";

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setCollapsed(p => !p)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50/60 transition-colors"
        data-testid="toggle-readiness-section"
      >
        <div className="flex items-center gap-2 min-w-0">
          <CheckCheck className="w-4 h-4 text-teal-600 flex-shrink-0" />
          <div className="text-left min-w-0">
            <h2 className="text-sm font-bold text-gray-900">Readiness for Today's Work</h2>
            <p className="text-xs text-gray-400 truncate">
              {!req ? "No plan submitted for today"
                : alreadyConfirmed ? shortage ? "⚠ Shortage noted — work started" : "✓ All clear"
                : "Confirm what's available before starting work"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {shortage && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Shortage</span>}
          {allClear  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">All Clear</span>}
          {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">

          {/* No plan submitted */}
          {!req && (
            <p className="text-sm text-gray-400 py-1 text-center">
              No tomorrow's plan was submitted for today. You can start site work normally.
            </p>
          )}

          {req && (
            <>
              {/* Submission timestamp */}
              {req.createdAt && (
                <p className="text-[11px] text-gray-400 -mt-1">
                  Submitted on {format(new Date(req.createdAt), "d MMM yyyy, h:mm a")}
                </p>
              )}

              {/* Planned work */}
              {req.plannedWork?.activity && (
                <div className="bg-orange-50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Planned Today</p>
                  <p className="text-sm font-semibold text-gray-800">{req.plannedWork.activity}</p>
                  {req.plannedWork.chainage && <p className="text-xs text-gray-500">Chainage: {req.plannedWork.chainage}</p>}
                  {req.plannedWork.plannedQty && (
                    <p className="text-xs text-gray-500">Qty: {req.plannedWork.plannedQty} {req.plannedWork.plannedUom}</p>
                  )}
                  {req.plannedWork.remarks && <p className="text-xs text-gray-400 italic">{req.plannedWork.remarks}</p>}
                </div>
              )}

              {/* Requested items */}
              {hasAnyRequest && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Requested for Today</p>
                  {req.materials?.map((m: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <Package className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                      <span className="text-xs text-gray-700 font-medium">{m.materialName}</span>
                      <span className="text-xs text-gray-400">{m.qty} {m.uom}</span>
                    </div>
                  ))}
                  {req.equipment?.map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <Wrench className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      <span className="text-xs text-gray-700 font-medium">{e.numberRequired}× {e.equipmentType}</span>
                      {e.requiredFromTime && <span className="text-xs text-gray-400">from {e.requiredFromTime}</span>}
                    </div>
                  ))}
                  {req.labour?.map((l: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <Users className="w-3 h-3 text-teal-500 flex-shrink-0" />
                      <span className="text-xs text-gray-700 font-medium">{l.count} {l.labourType}</span>
                      <span className="text-xs text-gray-400">{l.skilledType}</span>
                    </div>
                  ))}
                  {req.immediateRequirements?.map((im: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                      <span className="text-xs text-gray-700 font-medium">{im.description}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Arrangement status — per item (item-level) or section-level fallback */}
              {req.allocationStatus && (
                <div className="bg-slate-50 rounded-lg px-3 py-2.5 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Arrangement Status</p>

                  {/* Material items */}
                  {req.materials?.map((m: any, i: number) => {
                    const alloc = getItemAllocFH(req.allocationStatus, "materials", i);
                    if (!alloc?.status) return null;
                    return (
                      <div key={`mat-${i}`} className="flex items-start gap-2">
                        <Package className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-gray-700 font-medium">{m.materialName}</span>
                            <span className="text-xs text-gray-400">{m.qty} {m.uom}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <ItemAllocBadgeFH status={alloc.status} />
                            {alloc.expectedBy && <span className="text-[10px] text-blue-600">⏰ {alloc.expectedBy}</span>}
                          </div>
                          {alloc.remarks && <p className="text-[11px] text-gray-400 italic">{alloc.remarks}</p>}
                        </div>
                      </div>
                    );
                  })}
                  {/* Section-level fallback for materials when no item-level data */}
                  {req.allocationStatus.materials && !req.allocationStatus.materialItems?.length && (
                    <div className="flex items-center gap-2">
                      <Package className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600 flex-1">Materials</span>
                      <AllocBadge status={req.allocationStatus.materials} />
                    </div>
                  )}

                  {/* Equipment items */}
                  {req.equipment?.map((e: any, i: number) => {
                    const alloc = getItemAllocFH(req.allocationStatus, "equipment", i);
                    if (!alloc?.status) return null;
                    return (
                      <div key={`eq-${i}`} className="flex items-start gap-2">
                        <Wrench className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-gray-700 font-medium">{e.numberRequired}× {e.equipmentType}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <ItemAllocBadgeFH status={alloc.status} />
                            {alloc.expectedBy && <span className="text-[10px] text-blue-600">⏰ {alloc.expectedBy}</span>}
                          </div>
                          {alloc.remarks && <p className="text-[11px] text-gray-400 italic">{alloc.remarks}</p>}
                        </div>
                      </div>
                    );
                  })}
                  {/* Section-level fallback for equipment */}
                  {req.allocationStatus.equipment && !req.allocationStatus.equipmentItems?.length && (
                    <div className="flex items-center gap-2">
                      <Wrench className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600 flex-1">Equipment</span>
                      <AllocBadge status={req.allocationStatus.equipment} />
                    </div>
                  )}

                  {/* Labour items */}
                  {req.labour?.map((l: any, i: number) => {
                    const alloc = getItemAllocFH(req.allocationStatus, "labour", i);
                    if (!alloc?.status) return null;
                    return (
                      <div key={`lab-${i}`} className="flex items-start gap-2">
                        <Users className="w-3 h-3 text-teal-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-gray-700 font-medium">{l.count} {l.labourType}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <ItemAllocBadgeFH status={alloc.status} />
                            {alloc.expectedBy && <span className="text-[10px] text-blue-600">⏰ {alloc.expectedBy}</span>}
                          </div>
                          {alloc.remarks && <p className="text-[11px] text-gray-400 italic">{alloc.remarks}</p>}
                        </div>
                      </div>
                    );
                  })}
                  {/* Section-level fallback for labour */}
                  {req.allocationStatus.labour && !req.allocationStatus.labourItems?.length && (
                    <div className="flex items-center gap-2">
                      <Users className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600 flex-1">Labour</span>
                      <AllocBadge status={req.allocationStatus.labour} />
                    </div>
                  )}

                  {/* Immediate items */}
                  {req.immediateRequirements?.map((im: any, i: number) => {
                    const alloc = getItemAllocFH(req.allocationStatus, "immediate", i);
                    if (!alloc?.status) return null;
                    return (
                      <div key={`imm-${i}`} className="flex items-start gap-2">
                        <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-gray-700 font-medium">{im.description}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <ItemAllocBadgeFH status={alloc.status} />
                            {alloc.expectedBy && <span className="text-[10px] text-blue-600">⏰ {alloc.expectedBy}</span>}
                          </div>
                          {alloc.remarks && <p className="text-[11px] text-gray-400 italic">{alloc.remarks}</p>}
                        </div>
                      </div>
                    );
                  })}
                  {/* Section-level fallback for immediate */}
                  {req.allocationStatus.immediate && !req.allocationStatus.immediateItems?.length && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600 flex-1">Immediate</span>
                      <AllocBadge status={req.allocationStatus.immediate} />
                    </div>
                  )}

                  {req.allocationStatus.updatedByName && (
                    <p className="text-[10px] text-gray-400 pt-1 border-t border-slate-200">
                      Updated by {req.allocationStatus.updatedByName}
                    </p>
                  )}
                </div>
              )}

              {/* Already confirmed — summary */}
              {alreadyConfirmed && req.readinessConfirmation && (
                <div className={`rounded-lg px-3 py-2.5 border ${shortage ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${shortage ? "text-red-500" : "text-green-600"}`}>
                    {shortage ? "⚠ Confirmed with shortage" : "✓ Morning readiness confirmed"}
                  </p>
                  {[
                    { label: "Materials",  val: req.readinessConfirmation.materialStatus,  Icon: Package },
                    { label: "Equipment",  val: req.readinessConfirmation.equipmentStatus, Icon: Wrench },
                    { label: "Labour",     val: req.readinessConfirmation.labourStatus,    Icon: Users },
                    { label: "Immediate",  val: req.readinessConfirmation.immediateStatus, Icon: AlertTriangle },
                  ].filter(r => r.val && r.val !== "not_required").map(r => (
                    <div key={r.label} className="flex items-center gap-2 mb-1">
                      <r.Icon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600 flex-1">{r.label}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        r.val === "available" ? "bg-green-100 text-green-700"
                        : r.val === "expected_today" ? "bg-blue-100 text-blue-700"
                        : r.val === "partly_available" ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                      }`}>
                        {r.val === "available" ? "Available"
                          : r.val === "expected_today" ? "Expected today"
                          : r.val === "partly_available" ? "Partly available"
                          : "Not available"}
                      </span>
                    </div>
                  ))}
                  {req.readinessConfirmation.remarks && (
                    <p className="text-xs text-gray-500 italic mt-1 pt-1 border-t border-gray-200">
                      {req.readinessConfirmation.remarks}
                    </p>
                  )}
                  {req.readinessConfirmation.confirmedByName && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      by {req.readinessConfirmation.confirmedByName}
                    </p>
                  )}
                </div>
              )}

              {/* IRN CTA — appears when shortage is confirmed and user can raise IRNs */}
              {shortage && canRaiseIrn && (() => {
                const shortMats = (req.materials ?? []).filter((m: any) => m.materialName);
                const first = shortMats[0];
                const params = new URLSearchParams({ from: "readiness", returnTo: "/" });
                if (req.siteId) params.set("siteId", String(req.siteId));
                if (first?.materialName) params.set("material", first.materialName);
                if (first?.qty)         params.set("qty",      String(first.qty));
                if (first?.uom)         params.set("uom",      first.uom);
                const irnHref = `/irn/new?${params.toString()}`;
                const label = shortMats.length > 0
                  ? shortMats.length === 1
                    ? `You're short on ${shortMats[0].materialName}. Raise an IRN now?`
                    : `You have shortages on ${shortMats.length} materials. Raise an IRN now?`
                  : "A shortage was flagged. Raise an IRN to request from central store?";
                return (
                  <div className="bg-indigo-50 rounded-lg px-3 py-2.5 border border-indigo-200 space-y-2" data-testid="irn-shortage-cta">
                    <p className="text-xs text-indigo-800 font-medium">{label}</p>
                    <Link href={irnHref}>
                      <Button
                        size="sm"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 gap-2 text-xs"
                        data-testid="button-raise-irn-shortage"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        Raise an IRN
                      </Button>
                    </Link>
                  </div>
                );
              })()}

              {/* Not yet confirmed — readiness form */}
              {!alreadyConfirmed && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-600">Confirm what is actually available this morning:</p>
                  <ReadinessOptionRow
                    label="Required Material" icon={Package} iconColor="text-emerald-600"
                    value={matStatus} onChange={setMatStatus} items={req.materials}
                  />
                  <ReadinessOptionRow
                    label="Required Equipment" icon={Wrench} iconColor="text-amber-600"
                    value={eqStatus} onChange={setEqStatus} items={req.equipment}
                  />
                  <ReadinessOptionRow
                    label="Required Labour" icon={Users} iconColor="text-teal-600"
                    value={labStatus} onChange={setLabStatus} items={req.labour}
                  />
                  <ReadinessOptionRow
                    label="Immediate Requirement" icon={AlertTriangle} iconColor="text-red-600"
                    value={immStatus} onChange={setImmStatus} items={req.immediateRequirements}
                  />
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Shortage / issue remarks (optional)</p>
                    <Textarea
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="e.g. WMM delayed by 1 hr, tipper not arrived..."
                      className="text-xs resize-none"
                      rows={2}
                      data-testid="readiness-remarks"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => confirmMutation.mutate()}
                    disabled={confirmMutation.isPending}
                    className="w-full bg-teal-600 hover:bg-teal-700 gap-2"
                    data-testid="button-confirm-readiness"
                  >
                    <CheckCheck className="w-4 h-4" />
                    {confirmMutation.isPending ? "Saving..." : "Confirm Readiness & Start Site Work"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FieldHome({ onViewFullDashboard }: { onViewFullDashboard?: () => void }) {
  const { user, sectionVisible } = useAuth();
  const deviceType = useDeviceType();

  const todayStr    = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = format(new Date(), "EEE, d MMM yyyy");
  const hour        = new Date().getHours();
  const greeting    = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName   = user?.fullName?.split(" ")[0] ?? "";
  const initials    = user?.fullName
    ? user.fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";
  const myName = user?.fullName ?? "";   // used to match DPR engineer field

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: sites = [] } = useQuery<any[]>({ queryKey: ["/api/sites"] });

  // Batch 06D: bounded recent window (last 7 days + today) instead of
  // today-only, so an older unsubmitted own draft is detectable — still a
  // single dateFrom/dateTo-bounded query, never the full DPR history.
  const lookbackFromStr = format(addDays(new Date(), -7), "yyyy-MM-dd");
  const { data: allDprsWithDetails = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details", lookbackFromStr, todayStr],
    queryFn: () =>
      fetch(`/api/dprs/with-details?dateFrom=${lookbackFromStr}&dateTo=${todayStr}`)
        .then(r => r.json()),
  });

  const canProcure  = sectionVisible("site_procurement") || sectionVisible("purchase_indents_view") || sectionVisible("purchase_indents_raise") || sectionVisible("purchase_indents_approve");

  const { data: purchaseIndents = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-indents"],
    enabled: canProcure,
  });

  const canRaiseIrn = sectionVisible("irn_raise");

  // ── Shortcut data ─────────────────────────────────────────────────────────
  const tomorrowStr    = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const tomorrowDisplay = format(addDays(new Date(), 1), "EEE, d MMM");

  const { data: tomorrowReqs = [] } = useQuery<any[]>({
    queryKey: ["/api/site-requirements", tomorrowStr],
    queryFn: () =>
      fetch(`/api/site-requirements?dateFrom=${tomorrowStr}&dateTo=${tomorrowStr}`)
        .then(r => r.json()),
    enabled: sectionVisible("site_dprs"),
  });

  const { data: todayReqs = [] } = useQuery<any[]>({
    queryKey: ["/api/site-requirements", todayStr],
    queryFn: () =>
      fetch(`/api/site-requirements?dateFrom=${todayStr}&dateTo=${todayStr}`)
        .then(r => r.json()),
    enabled: sectionVisible("site_dprs"),
  });

  const { data: todayTrips = [] } = useQuery<any[]>({
    queryKey: ["/api/site-material-trips", todayStr],
    queryFn: () =>
      fetch(`/api/site-material-trips?dateFrom=${todayStr}&dateTo=${todayStr}`)
        .then(r => r.json()),
    enabled: sectionVisible("site_materials"),
  });

  const { data: stockRows = [] } = useQuery<any[]>({
    queryKey: ["/api/site-material-stock"],
    enabled: sectionVisible("site_materials"),
  });

  const { data: myIrns = [] } = useQuery<any[]>({
    queryKey: ["/api/irn"],
    enabled: canRaiseIrn,
  });

  // ── Active sites (assigned to this user via permission filter on server) ──
  const activeSites = (sites as any[]).filter(s => s.isActive !== 0);

  // ── Multi-site: let user pick which site to view ──────────────────────────
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);

  const currentSiteId: number | null =
    activeSites.length === 1
      ? activeSites[0].id
      : selectedSiteId ?? (activeSites[0]?.id ?? null);

  const currentSite = activeSites.find(s => s.id === currentSiteId) ?? activeSites[0] ?? null;
  const currentSiteName: string = currentSite?.name ?? "";

  // ── BOQ projects for selected site ───────────────────────────────────────
  const { data: boqProjects = [] } = useQuery<BoqProjectWithCounts[]>({
    queryKey: ["/api/boq/projects", { siteId: currentSiteId }],
    queryFn: () =>
      fetch(`/api/boq/projects?siteId=${currentSiteId}`)
        .then(r => r.json()),
    enabled: !!currentSiteId,
  });

  // Use the first project that has bars (work programme set up)
  const activeProject = (boqProjects as BoqProjectWithCounts[]).find(p => p.barCount > 0)
    ?? (boqProjects as BoqProjectWithCounts[])[0]
    ?? null;

  const hasProgramme = !!activeProject && activeProject.barCount > 0;

  const { data: planVsActual = [] } = useQuery<PlanVsActualRow[]>({
    queryKey: ["/api/boq/projects", activeProject?.id, "plan-vs-actual", todayStr],
    queryFn: () =>
      fetch(`/api/boq/projects/${activeProject!.id}/plan-vs-actual?asOf=${todayStr}`)
        .then(r => r.json()),
    enabled: !!activeProject && hasProgramme,
  });

  // ── DPR for this site + today ────────────────────────────────────────────
  // The with-details endpoint returns ALL permitted DPRs, so we filter by:
  //   1. date === today
  //   2. site name: stored name can have " – Edited by Manager – …" appended,
  //      so we match by "starts with currentSiteName" (not exact equals)
  //   3. not superseded
  const normSite = (s: string) => s.split(" –")[0].split(" -–")[0].trim();
  const siteDprs = (allDprsWithDetails as any[]).filter(
    d =>
      d.date === todayStr &&
      normSite(d.site ?? "") === currentSiteName &&
      !d.isSuperseded
  );

  // Engineer name match: DPR stores e.g. "RAMESH - SUPERVISOR" while user.fullName
  // is "Ramesh". Split on " - " and compare the first part case-insensitively.
  const engineerBase = (eng: string) => eng.split(" - ")[0].trim().toLowerCase();
  const myNameNorm   = myName.toLowerCase();

  // Current user's DPR:
  const myDpr    = siteDprs.find(d => engineerBase(d.engineer ?? "") === myNameNorm) ?? null;
  // Any other engineer's DPR for same site+date:
  const otherDpr = siteDprs.find(d => engineerBase(d.engineer ?? "") !== myNameNorm) ?? null;

  // Phase: what does the CTA look like?
  const dprPhase: DprPhase = (() => {
    if (myDpr) {
      const submitted = myDpr.status === "submitted" || !!myDpr.submittedAt;
      return submitted ? "submitted-own" : "draft-own";
    }
    if (otherDpr) return "submitted-other";
    return "not-started";
  })();

  const activeDpr = myDpr ?? otherDpr ?? null;
  const dprId: number | null = activeDpr?.id ?? null;

  // ── Batch 06D §13–15: own unsubmitted DPRs BEFORE today (7-day window) ────
  // Warn-only: an older pending DPR never blocks starting today's DPR.
  const olderPendingDprs = findOlderPendingDprs(allDprsWithDetails as any[], {
    todayStr, siteName: currentSiteName, myName,
  });
  const olderPendingDpr = olderPendingDprs[0] ?? null;
  const olderPendingChecklist = olderPendingDpr ? deriveDprChecklist(olderPendingDpr, false) : null;
  const olderPendingLines = olderPendingChecklist
    ? olderPendingChecklist.items.flatMap(i => i.details)
    : [];
  const yesterdayStr = format(addDays(new Date(), -1), "yyyy-MM-dd");

  // ── Today's Site Goal rows ────────────────────────────────────────────────
  interface GoalRow {
    id: string;
    item: string;
    stretch: string;
    planned: string;       // "—" or formatted number
    completed: string;
    toDo: string;
    toDoType: "backlog" | "ahead" | "on-track" | "pending" | "not-started";
    noProgramme?: boolean;
  }

  let goalRows: GoalRow[] = [];
  let programmeState: "live" | "no-bars" | "no-project" = "no-project";

  if (hasProgramme && (planVsActual as PlanVsActualRow[]).length > 0) {
    programmeState = "live";
    goalRows = (planVsActual as PlanVsActualRow[])
      .filter(r => r.totalPlanned > 0 || r.totalActual > 0)  // only items with data
      .slice(0, 8)                                           // cap at 8 on home screen
      .map((r, i) => {
        const planned   = r.totalPlanned;
        const actual    = r.totalActual;
        const diff      = actual - planned;
        const unit      = r.unit ?? "";
        const fmt = (n: number) =>
          n === 0 ? "—" : `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${unit}`.trim();

        let toDo: string;
        let toDoType: GoalRow["toDoType"];

        if (planned === 0) {
          toDo = "No target set";
          toDoType = "not-started";
        } else if (diff > 0.01) {
          toDo = `+${fmt(diff)} ahead`;
          toDoType = "ahead";
        } else if (diff < -0.01) {
          toDo = `${fmt(Math.abs(diff))} balance`;
          toDoType = "backlog";
        } else {
          toDo = "On track";
          toDoType = "on-track";
        }

        return {
          id: `r${r.boqItemId}`,
          item: extractShortName(r.description, r.categoryName),
          stretch: "",  // no per-row chainage in plan-vs-actual; BOQ is at project level
          planned:   fmt(planned),
          completed: fmt(actual),
          toDo,
          toDoType,
        };
      });
  } else if (activeProject && !hasProgramme) {
    programmeState = "no-bars";
  } else {
    programmeState = "no-project";
  }

  // Count items behind plan
  const behindCount = goalRows.filter(r => r.toDoType === "backlog").length;

  // ── Today's Focus (user + site + date aware) ──────────────────────────────
  const focusItems: FocusItem[] = [];

  if (dprPhase === "not-started") {
    focusItems.push({ level: "alert", text: "No DPR started yet — begin today's site work to log activities." });
  } else if (dprPhase === "submitted-other") {
    const filer = otherDpr?.engineer ?? "another user";
    focusItems.push({
      level: "info",
      text: `DPR filed by ${filer}. View today's site report below.`,
    });
  } else if (dprPhase === "submitted-own") {
    focusItems.push({ level: "ok", text: "DPR submitted. No pending submission items." });
  } else {
    // draft-own: show what's missing
    const eq  = (myDpr?.equipment ?? []).length;
    const lab = (myDpr?.labour    ?? []).length;
    const mat = (myDpr?.materials ?? []).length;
    const prg = (myDpr?.progress  ?? []).length;
    if (prg === 0) focusItems.push({ level: "warn",  text: "Activity quantities not yet entered — log work done today." });
    if (eq  === 0) focusItems.push({ level: "alert", text: "Equipment logs pending — record closing meters for all equipment." });
    if (lab === 0) focusItems.push({ level: "alert", text: "Labour count not yet entered — add today's workforce details." });
    if (mat === 0) focusItems.push({ level: "info",  text: "No material trips recorded — add material received today." });
    focusItems.push({ level: "info",  text: "Material challan photo — upload photos before submitting." });
  }

  // Append pending indents note if any
  if (canProcure) {
    const pendingPi = (purchaseIndents as any[]).filter(
      p => p.status === "pending" || p.status === "submitted" || p.status === "stores_check"
    ).length;
    if (pendingPi > 0)
      focusItems.push({ level: "warn", text: `${pendingPi} purchase indent${pendingPi > 1 ? "s" : ""} pending — follow up with manager.` });
  }

  // Cap at 5
  const visibleFocus = focusItems.slice(0, 5);

  // ── Pending Before Submit checklist ────────────────────────────────────────
  // Only shown for draft-own (makes no sense for others' DPRs or not started)
  const eq  = (myDpr?.equipment ?? []).length;
  const lab = (myDpr?.labour    ?? []).length;
  const mat = (myDpr?.materials ?? []).length;
  const prg = (myDpr?.progress  ?? []).length;

  // Batch 05: real completeness — derived from the SAME Batch 04 readiness
  // validator used by every Final Submit path (no row-existence shortcuts,
  // no third validator).
  const checklist = deriveDprChecklist(myDpr, dprPhase === "submitted-own");
  const pendingChecks: CheckItem[] = checklist.items;

  const doneCount    = pendingChecks.filter(c => c.state === "done").length;
  const pendingCount = pendingChecks.filter(c => c.state === "pending").length;
  const donePct      = Math.round((doneCount / pendingChecks.length) * 100);

  // ── CTA config (user + site + date aware) ─────────────────────────────────
  // Batch 05: continuing an own road draft reopens the SAME Guided server
  // draft (?draftId=) — never a Detailed edit route, never a second DPR.
  // Structure DPRs (no guided flow) keep the Detailed draft editor.
  // Batch 06D §10/§12: "Complete" is a deliberate intent — Guided may open at
  // the first incomplete step (complete=1) instead of the autosaved step.
  const continueDraftHref = (d: any): string =>
    (d?.workType === "structure") ? `/site/edit/${d.id}?draft` : roadDprDraftHref(d.id, "/", { complete: true });
  const dprHref = myDpr
    ? (dprPhase === "submitted-own" ? `/site/report/${myDpr.id}` : continueDraftHref(myDpr))
    : otherDpr
    ? `/site/report/${otherDpr.id}`
    : roadDprHref("/");

  interface CtaConfig {
    label: string;
    href: string;
    status: string;
    color: string;
    dotColor: string;
    badge: string | null;
    badgeColor: string;
  }

  const ctaConfig: CtaConfig = (() => {
    switch (dprPhase) {
      case "not-started":
        return {
          label: "Start Today's DPR",
          href: roadDprHref("/"),
          status: "DPR not started yet",
          color: "bg-orange-500 hover:bg-orange-600 shadow-orange-200",
          dotColor: "bg-orange-300",
          badge: null,
          badgeColor: "",
        };
      case "draft-own":
        return {
          label: "Complete Today's DPR",
          href: continueDraftHref(myDpr!),
          // Batch 06D §7: actionable status — the draft is safely saved, not
          // submitted, and X specific items still need completion.
          status: (() => {
            const n = pendingChecks.flatMap(c => c.details ?? []).length;
            return n > 0
              ? `Draft in progress · ${n} item${n !== 1 ? "s" : ""} need${n === 1 ? "s" : ""} completion`
              : "Draft in progress · ready to review & submit";
          })(),
          color: "bg-orange-500 hover:bg-orange-600 shadow-orange-200",
          dotColor: "bg-orange-400",
          badge: "In progress",
          badgeColor: "bg-orange-50 text-orange-600",
        };
      case "submitted-own":
        return {
          label: "View Today's Site Report",
          href: `/site/report/${myDpr!.id}`,
          status: "DPR submitted",
          color: "bg-slate-400 hover:bg-slate-500 shadow-slate-200",
          dotColor: "bg-green-400",
          badge: "Submitted",
          badgeColor: "bg-green-50 text-green-600",
        };
      case "submitted-other": {
        const filer = otherDpr?.engineer ?? "another user";
        return {
          label: "View Today's Site Report",
          href: dprId ? `/site/report/${dprId}` : "/site/hub",
          status: `Today's DPR filed by ${filer}`,
          color: "bg-slate-400 hover:bg-slate-500 shadow-slate-200",
          dotColor: "bg-green-400",
          badge: "Filed",
          badgeColor: "bg-green-50 text-green-600",
        };
      }
    }
  })();

  // ── Shortcut derived state ────────────────────────────────────────────────
  const tomorrowPlans = (tomorrowReqs as any[]).filter(
    r => normSite(r.site ?? "") === currentSiteName || r.siteId === currentSiteId
  );

  function isPlanLocked(plan: any): boolean {
    const actioned = ["approved", "arranged", "sent_store", "sent_purchase", "sent_plant"];
    if (actioned.includes(plan.status)) return true;
    const a = plan.allocationStatus;
    if (!a) return false;
    return !!(a.materials || a.equipment || a.labour || a.immediate ||
      a.materialItems?.length || a.equipmentItems?.length ||
      a.labourItems?.length || a.immediateItems?.length);
  }

  // ── Today's Activity derived state ───────────────────────────────────────
  // Equipment: count closed vs open from today's DPR
  const eqEntries = myDpr?.equipment ?? [];
  const eqTotal  = eqEntries.length;
  const eqClosed = eqEntries.filter((e: any) =>
    e.closingReading !== null || (e.endTime && e.endTime !== "")
  ).length;
  const eqOpen   = eqTotal - eqClosed;

  // Material trips: today's trips scoped to this site
  const siteTrips = (todayTrips as any[]).filter(
    t => normSite(t.site ?? "") === currentSiteName
  );
  const tripCount = siteTrips.length;
  const tripQty   = siteTrips.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);

  // Immediate requirements: live allocation status from today's site requirements
  const todaySiteReqs = (todayReqs as any[]).filter(
    r => normSite(r.site ?? "") === currentSiteName || r.siteId === currentSiteId
  );
  interface ImmediateRow { description: string; status: string | null }
  const immRows: ImmediateRow[] = todaySiteReqs.flatMap((req: any) => {
    const items: any[] = req.immediateRequirements ?? [];
    return items.map((item: any, i: number) => {
      const perItem = req.allocationStatus?.immediateItems?.[i]?.status ?? null;
      const legacy  = req.allocationStatus?.immediate ? "allocated" : null;
      return {
        description: item.description ?? item.item ?? "Immediate item",
        status: perItem ?? legacy,
      };
    });
  });

  // ── Quick actions ──────────────────────────────────────────────────────────
  const editHref = myDpr
    ? (dprPhase === "draft-own" ? continueDraftHref(myDpr) : `/site/edit/${myDpr.id}`)
    : roadDprHref("/");
  const firstEditablePlan = tomorrowPlans.find(p => !isPlanLocked(p));
  const tomorrowPlanHref = firstEditablePlan
    ? `/site/requirements/new?editId=${firstEditablePlan.id}&returnTo=/`
    : tomorrowPlans.length > 0
      ? "/site/requirements"
      : "/site/requirements/new?returnTo=/";

  interface QuickAction { label: string; icon: any; color: string; href: string; perm?: boolean }
  const allQuickActions: QuickAction[] = [
    { label: "Material Trip",        icon: Truck,          color: "bg-blue-600",   href: "/site/material-trips?returnTo=/",                              perm: sectionVisible("site_materials") },
    { label: "Raise IRN",            icon: BookOpen,       color: "bg-indigo-600", href: "/irn/new?from=site&returnTo=/",                                perm: canRaiseIrn },
    { label: "Tomorrow's Plan",      icon: CalendarPlus,   color: "bg-teal-600",   href: tomorrowPlanHref,                                               perm: sectionVisible("site_dprs") },
    { label: "Immediate Req.",       icon: AlertTriangle,  color: "bg-red-600",    href: "/site/requirements/new?mode=immediate&returnTo=/",             perm: sectionVisible("site_dprs") },
  ];
  const visibleActions = allQuickActions.filter(a => a.perm !== false);

  const siteStockItems = (stockRows as any[])
    .filter(r => r.site === currentSiteName)
    .sort((a, b) => b.delivered - a.delivered)
    .slice(0, 5);

  const myIrnList = (myIrns as any[])
    .filter(r =>
      r.raisedByUserId === (user as any)?.id ||
      r.raisedBy?.toLowerCase() === myName.toLowerCase()
    )
    .slice(0, 5);

  const myPiList = (purchaseIndents as any[])
    .filter(p =>
      p.raisedBy?.toLowerCase() === myName.toLowerCase() ||
      p.proposedBy?.toLowerCase() === myName.toLowerCase()
    )
    .slice(0, 4);

  const showMyItems = myIrnList.length > 0 || myPiList.length > 0;

  // ── Layout width ──────────────────────────────────────────────────────────
  const containerWidth = deviceType === "mobile" ? "max-w-lg" : "max-w-2xl";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <HubShell title="Field Home">
      <div className="min-h-screen bg-gray-50 text-gray-900">

        {/* ── Sticky header ── */}
        <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
          <div className={`${containerWidth} mx-auto px-4 pt-3 pb-3`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                  data-testid="avatar-field-home"
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 leading-tight">
                    {greeting}, <span className="font-semibold text-gray-800">{firstName || "Engineer"}</span>
                  </p>
                  <p className="text-xs font-medium text-gray-500 leading-tight">{user?.role ?? "Field Engineer"}</p>
                  {currentSiteName && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-orange-500 flex-shrink-0" />
                      <span className="text-xs font-bold text-gray-900 truncate" data-testid="text-primary-site">
                        {currentSiteName}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-400 hidden sm:block">{todayDisplay}</span>
                {onViewFullDashboard && (
                  <button
                    type="button"
                    onClick={onViewFullDashboard}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                    title="Full dashboard"
                    data-testid="button-full-dashboard-header"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                )}
                {/* Real notification bell — the exact same component (and
                    30s polling) used in HubShell's header, compact trigger. */}
                <AdminNotifications compact />
              </div>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className={`pb-24 ${containerWidth} mx-auto px-4 pt-4 space-y-4`}>

          {/* ── Multi-site tab picker (only shown when >1 site) ── */}
          {activeSites.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-xs text-gray-400 font-medium mb-2">Select site</p>
              <div className="flex flex-wrap gap-2">
                {activeSites.map((s: any) => {
                  const hasDpr = (allDprsWithDetails as any[]).some(
                    (d: any) => d.date === todayStr && normSite(d.site ?? "") === s.name && !d.isSuperseded
                  );
                  const isActive = s.id === currentSiteId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSiteId(s.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        isActive
                          ? "bg-orange-500 text-white border-orange-500"
                          : "bg-white text-gray-700 border-gray-200 hover:border-orange-300"
                      }`}
                      data-testid={`site-tab-${s.id}`}
                    >
                      {s.name}
                      {hasDpr && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              1. TODAY'S SITE GOAL
              ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-500" />
                  Today's Site Goal
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Planned vs completed vs to be done</p>
              </div>
              {programmeState === "live" && behindCount > 0 && (
                <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                  {behindCount} behind
                </span>
              )}
              {programmeState === "live" && (
                <Link href={`/work-program/${activeProject!.id}`}>
                  <a className="text-xs font-medium text-orange-500 flex items-center gap-0.5 ml-2">
                    View all <ChevronRight className="w-3 h-3" />
                  </a>
                </Link>
              )}
            </div>

            {/* No programme set up yet */}
            {programmeState !== "live" && (
              <div className="px-4 py-6 text-center" data-testid="text-goal-no-programme">
                <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-500">
                  {programmeState === "no-project"
                    ? "Programme link pending"
                    : "No work programme bars set up yet"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {programmeState === "no-project"
                    ? "Link a BOQ project to this site to see planned vs actual targets here."
                    : "Add bars in the Work Programme to see planned quantities here."}
                </p>
                <Link href="/work-program">
                  <a className="mt-2 inline-block text-xs font-medium text-orange-500" data-testid="link-setup-programme">
                    Set up Work Programme →
                  </a>
                </Link>
              </div>
            )}

            {/* Live programme data */}
            {programmeState === "live" && goalRows.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400" data-testid="text-goal-no-data">
                No items with plan or actual data for this site.
              </div>
            )}

            {programmeState === "live" && goalRows.length > 0 && (
              <>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  <span>Item</span>
                  <span className="text-right w-20">Planned</span>
                  <span className="text-right w-20">Completed</span>
                  <span className="text-right w-24">To be done</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {goalRows.map(row => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-3 items-center hover:bg-gray-50/60 transition-colors"
                      data-testid={`goal-row-${row.id}`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{row.item}</p>
                        {row.stretch && <p className="text-xs text-gray-400 mt-0.5">{row.stretch}</p>}
                      </div>
                      <div className="w-20 text-right">
                        <p className="text-xs text-gray-500 font-medium">{row.planned}</p>
                      </div>
                      <div className="w-20 text-right">
                        <p className="text-xs text-gray-800 font-semibold">{row.completed}</p>
                      </div>
                      <div className="w-24 text-right">
                        <ToDoBadge type={row.toDoType} text={row.toDo} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════
              2. TODAY'S FOCUS
              ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" />
                Today's Focus
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">What to prioritise today</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {visibleFocus.map((item, i) => (
                <FocusRow key={i} item={item} />
              ))}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              3. READINESS FOR TODAY'S WORK
              ══════════════════════════════════════════════════════ */}
          <ReadinessSection />

          {/* ══════════════════════════════════════════════════════
              Batch 06D §15 — OLDER PENDING DPR banner (warn, never block)
              ══════════════════════════════════════════════════════ */}
          {olderPendingDpr && (
            <div className="bg-red-50 rounded-xl border-2 border-red-200 px-4 py-4 space-y-2" data-testid="banner-older-pending-dpr">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <h2 className="text-sm font-bold text-red-800">
                  {olderPendingDpr.date === yesterdayStr ? "Yesterday's" : "Older"} DPR pending submission — {format(new Date(olderPendingDpr.date + "T00:00:00"), "d MMM")}
                </h2>
              </div>
              {olderPendingLines.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-red-700">
                    {olderPendingLines.length} item{olderPendingLines.length !== 1 ? "s" : ""} need{olderPendingLines.length === 1 ? "s" : ""} completion
                  </p>
                  <ul className="space-y-0.5">
                    {olderPendingLines.slice(0, 4).map((line, i) => (
                      <li key={i} className="text-xs text-red-700 leading-snug">• {line}</li>
                    ))}
                    {olderPendingLines.length > 4 && (
                      <li className="text-xs text-red-500">+{olderPendingLines.length - 4} more</li>
                    )}
                  </ul>
                </>
              )}
              {olderPendingDprs.length > 1 && (
                <p className="text-xs text-red-600 font-medium" data-testid="text-more-pending-dprs">
                  {olderPendingDprs.length - 1} more pending DPR{olderPendingDprs.length > 2 ? "s" : ""} from the last 7 days — complete this one first.
                </p>
              )}
              <Link href={continueDraftHref(olderPendingDpr)}>
                <a
                  className="block w-full py-3 rounded-xl font-bold text-sm text-center bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-200 transition-all active:scale-[0.98]"
                  data-testid="button-complete-pending-dpr"
                >
                  Complete Pending DPR
                </a>
              </Link>
              <p className="text-[11px] text-red-500">Today's DPR can still be started below.</p>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              4. TODAY'S SITE WORK — dynamic CTA
              ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-orange-500" />
                Today's Site Work
              </h2>
              {ctaConfig.badge && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ctaConfig.badgeColor}`}>
                  {ctaConfig.badge}
                </span>
              )}
            </div>

            {/* Flow steps */}
            <div className="flex items-center gap-1 flex-wrap">
              {["Start of Day", "Progress", "Labour", "Equipment", "Materials", "Photos", "Submit"].map((step, i, arr) => (
                <span key={step} className="flex items-center gap-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    dprPhase === "submitted-own" || dprPhase === "submitted-other"
                      ? "bg-green-100 text-green-700"
                      : dprPhase === "draft-own" && i <= 1
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-400"
                  }`}>{step}</span>
                  {i < arr.length - 1 && <ChevronRight className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />}
                </span>
              ))}
            </div>

            {/* CTA */}
            <Link href={ctaConfig.href}>
              <a
                className={`w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${ctaConfig.color}`}
                data-testid="button-site-work-cta"
              >
                <span>{ctaConfig.label}</span>
                <ArrowRight className="w-5 h-5 ml-auto" />
              </a>
            </Link>

            {/* Status + pending badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ctaConfig.dotColor}`} />
                <p className="text-xs text-gray-500">{ctaConfig.status}</p>
              </div>
              {dprPhase === "draft-own" && pendingCount > 0 && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">
                  {pendingCount} item{pendingCount !== 1 ? "s" : ""} pending
                </span>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              4. QUICK ACTIONS
              ══════════════════════════════════════════════════════ */}
          {visibleActions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Quick Actions</h2>
              <div className="grid grid-cols-4 gap-2">
                {visibleActions.map(a => (
                  <Link href={a.href} key={a.label}>
                    <a
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-gray-50 transition-colors"
                      data-testid={`quick-action-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div className={`w-11 h-11 rounded-2xl ${a.color} flex items-center justify-center shadow`}>
                        <a.icon className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-[10px] text-gray-500 text-center leading-tight font-medium">{a.label}</span>
                    </a>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              5. TODAY'S ACTIVITY
              ══════════════════════════════════════════════════════ */}
          {(sectionVisible("site_dprs") || sectionVisible("site_materials")) && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" data-testid="section-today-activity">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  Today's Activity
                </h2>
                <span className="text-xs text-gray-400">{todayDisplay}</span>
              </div>
              <div className="divide-y divide-gray-50">

                {/* Equipment row */}
                {sectionVisible("site_dprs") && (
                  <Link href={myDpr ? (dprPhase === "draft-own" ? continueDraftHref(myDpr) : `/site/edit/${myDpr.id}`) : roadDprHref("/")}>
                    <a className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors" data-testid="activity-row-equipment">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                        <Wrench className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">Equipment logs</p>
                        {eqTotal === 0 ? (
                          <p className="text-xs text-gray-400">None recorded yet</p>
                        ) : (
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                              {eqClosed} closed
                            </span>
                            {eqOpen > 0 && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                                {eqOpen} open — needs closing reading
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    </a>
                  </Link>
                )}

                {/* Materials received row */}
                {sectionVisible("site_materials") && (
                  <Link href="/site/material-trips?returnTo=/">
                    <a className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors" data-testid="activity-row-materials">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Truck className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">Materials received</p>
                        {tripCount === 0 ? (
                          <p className="text-xs text-gray-400">No deliveries recorded today</p>
                        ) : (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {tripCount} trip{tripCount !== 1 ? "s" : ""}
                            {tripQty > 0 && ` · ${tripQty.toLocaleString("en-IN", { maximumFractionDigits: 2 })} MT`}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    </a>
                  </Link>
                )}

                {/* Immediate requirements row — only when today's plan has immediate items */}
                {sectionVisible("site_dprs") && immRows.length > 0 && (
                  <Link href="/site/requirements">
                    <a className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors" data-testid="activity-row-immediate">
                      <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium text-gray-800">Immediate requirements</p>
                        {immRows.map((row, i) => {
                          const s = row.status;
                          const badge =
                            s === "allocated" || s === "arranged" || s === "sent_store" ||
                            s === "sent_purchase" || s === "sent_plant"
                              ? { label: s.replace(/_/g, " "), cls: "bg-green-50 text-green-700 border-green-100" }
                              : { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-100" };
                          return (
                            <div key={i} className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-gray-600 truncate max-w-[160px]">{row.description}</span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-1" />
                    </a>
                  </Link>
                )}

              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              6. TOMORROW'S PLAN STATUS
              ══════════════════════════════════════════════════════ */}
          {sectionVisible("site_dprs") && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" data-testid="section-tomorrow-plan">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <CalendarPlus className="w-4 h-4 text-teal-500" />
                    Tomorrow's Plans
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">{tomorrowDisplay}</p>
                </div>
                <Link href="/site/requirements/new?returnTo=/">
                  <a className="text-xs font-semibold text-teal-600 flex items-center gap-0.5 hover:text-teal-700 transition-colors"
                     data-testid="link-add-tomorrow-plan">
                    + Add plan <ChevronRight className="w-3 h-3" />
                  </a>
                </Link>
              </div>

              {tomorrowPlans.length === 0 ? (
                <div className="px-4 py-4 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                  <div>
                    <p className="text-sm text-gray-700 font-medium">No plan submitted yet for tomorrow</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Submit before end of day so the PM can arrange resources in advance
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {tomorrowPlans.map((plan: any) => {
                    const locked = isPlanLocked(plan);
                    const planHref = locked
                      ? "/site/requirements"
                      : `/site/requirements/new?editId=${plan.id}&returnTo=/`;
                    const s = plan.status ?? "submitted";
                    const statusCfg: Record<string, string> = {
                      submitted:          "bg-blue-50 text-blue-700 border-blue-100",
                      reviewed:           "bg-teal-50 text-teal-700 border-teal-100",
                      approved:           "bg-green-50 text-green-700 border-green-100",
                      rejected:           "bg-red-50 text-red-700 border-red-100",
                      revision_requested: "bg-amber-50 text-amber-700 border-amber-100",
                    };
                    const statusLabel: Record<string, string> = {
                      submitted: "Submitted", reviewed: "Reviewed", approved: "Approved",
                      rejected: "Rejected", revision_requested: "Revision requested",
                    };
                    const desc = plan.plannedWork?.workItems?.[0]?.description ?? plan.workDescription ?? "";
                    return (
                      <div key={plan.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 space-y-1.5">
                            {desc && <p className="text-xs font-medium text-gray-700 truncate">{desc}</p>}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg[s] ?? "bg-gray-50 text-gray-600 border-gray-100"}`}>
                                {statusLabel[s] ?? s}
                              </span>
                              {[
                                { key: "workItems",             label: "work item",  val: (plan.workItems ?? plan.plannedWork?.workItems)?.length },
                                { key: "materials",             label: "material",   val: plan.materials?.length },
                                { key: "equipment",             label: "equipment",  val: plan.equipment?.length },
                                { key: "immediateRequirements", label: "immediate",  val: plan.immediateRequirements?.length },
                              ]
                                .filter(x => (x.val ?? 0) > 0)
                                .map(x => (
                                  <span key={x.key} className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-full">
                                    {x.val} {x.label}{x.val !== 1 ? "s" : ""}
                                  </span>
                                ))
                              }
                            </div>
                            {plan.pmRemarks && (
                              <p className="text-xs text-gray-500 italic border-l-2 border-teal-200 pl-2">
                                PM: {plan.pmRemarks}
                              </p>
                            )}
                          </div>
                          <Link href={planHref}>
                            <a className="text-xs font-semibold text-teal-600 flex items-center gap-0.5 hover:text-teal-700 transition-colors flex-shrink-0"
                               data-testid={`link-plan-${plan.id}`}>
                              {locked ? "View" : "Edit"} <ChevronRight className="w-3 h-3" />
                            </a>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              7. SITE MATERIAL STOCK (compact)
              ══════════════════════════════════════════════════════ */}
          {sectionVisible("site_materials") && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" data-testid="section-stock-shortcut">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-emerald-500" />
                  Material Stock
                  {currentSiteName && (
                    <span className="text-xs font-normal text-gray-400">— {currentSiteName}</span>
                  )}
                </h2>
                <Link href="/site/material-stock?returnTo=/">
                  <a className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5 hover:text-emerald-700 transition-colors"
                     data-testid="link-stock-full">
                    Full view <ChevronRight className="w-3 h-3" />
                  </a>
                </Link>
              </div>

              {siteStockItems.length === 0 ? (
                <div className="px-4 py-4 text-sm text-gray-400">
                  No deliveries recorded for this site yet.
                </div>
              ) : (
                <>
                  <div className="divide-y divide-gray-50">
                    {siteStockItems.map((r: any, i: number) => (
                      <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3"
                           data-testid={`stock-row-${i}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{r.material}</p>
                          {r.lastDeliveryDate && (
                            <p className="text-[10px] text-gray-400">
                              Last: {format(new Date(r.lastDeliveryDate + "T00:00:00"), "d MMM")}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-bold font-mono ${r.lying < 0 ? "text-red-600" : "text-gray-800"}`}>
                            {r.lying.toLocaleString("en-IN", { maximumFractionDigits: 1 })} MT
                          </p>
                          <p className="text-[10px] text-gray-400">lying</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-mono text-green-700">
                            {r.delivered.toLocaleString("en-IN", { maximumFractionDigits: 1 })} MT
                          </p>
                          <p className="text-[10px] text-gray-400">delivered</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2 border-t border-gray-50">
                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Info className="w-3 h-3 flex-shrink-0" />
                      "Lying" = Delivered − Consumed (theoretical norm). Negative means deliveries not yet logged.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              8. MY RAISED IRNs / PIs
              ══════════════════════════════════════════════════════ */}
          {(canRaiseIrn || canProcure) && showMyItems && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" data-testid="section-my-raised">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-violet-500" />
                  My Indents &amp; Requisitions
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Status of IRNs and PIs you have raised</p>
              </div>

              <div className="divide-y divide-gray-50">
                {myIrnList.map((irn: any) => {
                  const irnStatusCfg: Record<string, { label: string; color: string }> = {
                    pending_stores: { label: "Pending stores", color: "bg-amber-50 text-amber-700 border-amber-100" },
                    stores_verified:{ label: "Verified",       color: "bg-blue-50 text-blue-700 border-blue-100" },
                    approved:       { label: "Approved",       color: "bg-green-50 text-green-700 border-green-100" },
                    rejected:       { label: "Rejected",       color: "bg-red-50 text-red-700 border-red-100" },
                    closed:         { label: "Closed",         color: "bg-gray-50 text-gray-500 border-gray-100" },
                  };
                  const sc = irnStatusCfg[irn.status] ?? { label: irn.status, color: "bg-gray-50 text-gray-600 border-gray-100" };
                  return (
                    <Link key={irn.id} href={`/irn/${irn.id}`}>
                      <a className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/60 transition-colors"
                         data-testid={`irn-row-${irn.id}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{irn.irnNo}</p>
                          <p className="text-xs text-gray-400">{irn.date}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${sc.color}`}>
                          {sc.label}
                        </span>
                      </a>
                    </Link>
                  );
                })}

                {myPiList.map((pi: any) => {
                  const piStatusCfg: Record<string, { label: string; color: string }> = {
                    pending:      { label: "Pending",      color: "bg-amber-50 text-amber-700 border-amber-100" },
                    submitted:    { label: "Submitted",    color: "bg-blue-50 text-blue-700 border-blue-100" },
                    stores_check: { label: "Stores check", color: "bg-blue-50 text-blue-700 border-blue-100" },
                    approved:     { label: "Approved",     color: "bg-green-50 text-green-700 border-green-100" },
                    rejected:     { label: "Rejected",     color: "bg-red-50 text-red-700 border-red-100" },
                    ordered:      { label: "Ordered",      color: "bg-teal-50 text-teal-700 border-teal-100" },
                  };
                  const pc = piStatusCfg[pi.status] ?? { label: pi.status, color: "bg-gray-50 text-gray-600 border-gray-100" };
                  return (
                    <Link key={pi.id} href={`/procurement/indents/${pi.id}`}>
                      <a className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/60 transition-colors"
                         data-testid={`pi-row-${pi.id}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{pi.indentNo}</p>
                          <p className="text-xs text-gray-400">{pi.date}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${pc.color}`}>
                          {pc.label}
                        </span>
                      </a>
                    </Link>
                  );
                })}
              </div>

              {/* Footer links */}
              <div className="px-4 py-2.5 border-t border-gray-50 flex items-center gap-4">
                {canRaiseIrn && (
                  <Link href="/irn">
                    <a className="text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors">
                      All IRNs →
                    </a>
                  </Link>
                )}
                {canProcure && (
                  <Link href="/procurement/indents">
                    <a className="text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors">
                      All PIs →
                    </a>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              9. PENDING BEFORE SUBMIT
              Only meaningful when current user has an open draft.
              ══════════════════════════════════════════════════════ */}
          {(dprPhase === "draft-own" || dprPhase === "submitted-own") && (
            <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${pendingCount > 0 ? "border-amber-200" : "border-green-100"}`}>
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <h2 className={`text-sm font-bold flex items-center gap-2 ${pendingCount > 0 ? "text-gray-900" : "text-green-700"}`}>
                  {pendingCount > 0
                    ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> Pending Before Submit</>
                    : <><CheckCircle2 className="w-4 h-4 text-green-500" /> Ready to Submit</>
                  }
                </h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  pendingCount > 0 ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"
                }`}>
                  {doneCount}/{pendingChecks.length} done
                </span>
              </div>

              {/* Progress strip */}
              <div className="h-1 w-full bg-gray-100">
                <div
                  className={`h-full transition-all duration-500 ${donePct === 100 ? "bg-green-400" : "bg-amber-400"}`}
                  style={{ width: `${donePct}%` }}
                />
              </div>

              <div className="px-4 py-1 divide-y divide-gray-50">
                {pendingChecks.map(c => <PendingRow key={c.id} item={c} />)}
              </div>

              <div className="px-4 pb-3 pt-2">
                {dprPhase !== "submitted-own" ? (
                  <Link href={myDpr ? continueDraftHref(myDpr) : roadDprHref("/")}>
                    <a
                      className={`block w-full py-3 rounded-xl font-bold text-sm text-center transition-all ${
                        pendingCount === 0
                          ? "bg-green-500 text-white shadow-md shadow-green-200"
                          : "bg-gray-100 text-gray-400"
                      }`}
                      data-testid="button-submit-dpr"
                    >
                      {pendingCount > 0
                        ? `${pendingCount} item${pendingCount !== 1 ? "s" : ""} pending before submit`
                        : "Submit DPR Now"
                      }
                    </a>
                  </Link>
                ) : (
                  <Link href={`/site/report/${myDpr!.id}`}>
                    <a
                      className="block w-full py-3 rounded-xl font-bold text-sm text-center bg-green-50 text-green-700 border border-green-200"
                      data-testid="link-view-report"
                    >
                      View Submitted Report
                    </a>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Full dashboard fallback */}
          {onViewFullDashboard && (
            <button
              type="button"
              onClick={onViewFullDashboard}
              className="flex items-center justify-center gap-2 text-sm font-medium text-slate-400 py-2 w-full hover:text-slate-600 transition-colors"
              data-testid="link-full-dashboard"
            >
              <LayoutDashboard className="w-4 h-4" />
              View full dashboard
            </button>
          )}

        </div>{/* /scrollable body */}

        {/* ── Bottom nav ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-50">
          <div className={`${containerWidth} mx-auto flex items-center justify-around px-4 py-2`}>
            {[
              { label: "Work",     icon: Home,      href: "/"              },
              { label: "Reports",  icon: FileText,  href: "/site/hub"      },
              { label: "My Plans", icon: ClipboardList, href: "/my-plans"     },
              { label: "Profile",  icon: User,        href: "/account"      },
            ].map(n => {
              const active = n.href === "/";
              return (
                <Link href={n.href} key={n.label}>
                  <a className="flex flex-col items-center gap-1 px-3 py-1" data-testid={`nav-tab-${n.label.toLowerCase()}`}>
                    <n.icon className={`w-5 h-5 ${active ? "text-orange-500" : "text-gray-400"}`} />
                    <span className={`text-[10px] font-medium ${active ? "text-orange-500" : "text-gray-400"}`}>
                      {n.label}
                    </span>
                  </a>
                </Link>
              );
            })}
          </div>
        </div>

      </div>
    </HubShell>
  );
}
