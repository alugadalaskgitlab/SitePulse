import { useState } from "react";
import { Link, useLocation } from "wouter";
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
} from "lucide-react";

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
  return !!(a && (a.materials || a.equipment || a.labour || a.immediate));
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

function RequirementCard({ req, canReview }: { req: any; canReview: boolean }) {
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState(req.status);
  const [pmRemarks, setPmRemarks] = useState(req.pmRemarks ?? "");
  const [editing, setEditing] = useState(false);
  // Revision state
  const [revRequestOpen, setRevRequestOpen] = useState(false);
  const [revReason, setRevReason] = useState("");
  const [revActionOpen, setRevActionOpen] = useState<"approve"|"reject"|null>(null);
  const [revActionRemarks, setRevActionRemarks] = useState("");
  // Allocation state
  const [allocEditing, setAllocEditing] = useState(false);
  const [allocMat,     setAllocMat]     = useState(req.allocationStatus?.materials ?? "");
  const [allocMatR,    setAllocMatR]    = useState(req.allocationStatus?.materialsRemark ?? "");
  const [allocEq,      setAllocEq]      = useState(req.allocationStatus?.equipment ?? "");
  const [allocEqR,     setAllocEqR]     = useState(req.allocationStatus?.equipmentRemark ?? "");
  const [allocLab,     setAllocLab]     = useState(req.allocationStatus?.labour ?? "");
  const [allocLabR,    setAllocLabR]    = useState(req.allocationStatus?.labourRemark ?? "");
  const [allocImm,     setAllocImm]     = useState(req.allocationStatus?.immediate ?? "");
  const [allocImmR,    setAllocImmR]    = useState(req.allocationStatus?.immediateRemark ?? "");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/site-requirements/${req.id}/status`, {
        status: newStatus,
        pmRemarks,
        reviewedBy: (user as any)?.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-requirements"] });
      toast({ title: "Status updated" });
      setEditing(false);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const [, setLocation] = useLocation();
  const isOwner = req.submittedBy === (user as any)?.id;
  const acted = isActedUpon(req);
  const revStatus = req.revisionStatus ?? "original";

  const revRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/site-requirements/${req.id}/revision-request`, { reason: revReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-requirements"] });
      toast({ title: "Revision request sent", description: "PM/Admin will review and approve." });
      setRevRequestOpen(false);
      setRevReason("");
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const revApproveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/site-requirements/${req.id}/revision-approve`, { remarks: revActionRemarks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-requirements"] });
      toast({ title: "Revision approved", description: "Site user can now make one edit." });
      setRevActionOpen(null);
      setRevActionRemarks("");
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const revRejectMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/site-requirements/${req.id}/revision-reject`, { remarks: revActionRemarks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-requirements"] });
      toast({ title: "Revision rejected" });
      setRevActionOpen(null);
      setRevActionRemarks("");
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const allocMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/site-requirements/${req.id}/allocation`, {
        materials: allocMat || null,
        materialsRemark: allocMatR || null,
        equipment: allocEq || null,
        equipmentRemark: allocEqR || null,
        labour: allocLab || null,
        labourRemark: allocLabR || null,
        immediate: allocImm || null,
        immediateRemark: allocImmR || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-requirements"] });
      toast({ title: "Allocation updated" });
      setAllocEditing(false);
    },
    onError: () => toast({ title: "Failed to save allocation", variant: "destructive" }),
  });

  const sc = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.submitted;
  const hasShortage = req.readinessStatus === "confirmed_with_shortage";
  const sections: string[] = [];
  if (req.plannedWork?.activity) sections.push("planned");
  if (req.materials?.length)    sections.push("materials");
  if (req.equipment?.length)    sections.push("equipment");
  if (req.labour?.length)       sections.push("labour");
  if (req.immediateRequirements?.length) sections.push("immediate");

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
            {hasShortage && (
              <Badge className="text-[11px] px-1.5 py-0 bg-red-100 text-red-600">⚠ Shortage</Badge>
            )}
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
              {req.plannedWork.chainage && <p className="text-xs text-slate-400">Chainage: {req.plannedWork.chainage}</p>}
              {req.plannedWork.plannedQty && (
                <p className="text-xs text-slate-400">Qty: {req.plannedWork.plannedQty} {req.plannedWork.plannedUom}</p>
              )}
              {req.plannedWork.remarks && <p className="text-xs text-slate-400 italic">{req.plannedWork.remarks}</p>}
            </div>
          )}

          {/* Materials */}
          {req.materials?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Materials</p>
              <div className="space-y-1">
                {req.materials.map((m: any, i: number) => (
                  <div key={i} className="text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Package className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    <span className="font-medium">{m.materialName}</span>
                    <span className="text-slate-400 text-xs">{m.qty} {m.uom} · {m.sourcePreference} · <span className={m.urgency === "immediate" ? "text-red-500 font-bold" : ""}>{m.urgency}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Equipment */}
          {req.equipment?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">Equipment</p>
              <div className="space-y-1">
                {req.equipment.map((e: any, i: number) => (
                  <div key={i} className="text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Wrench className="w-3 h-3 text-amber-500 flex-shrink-0" />
                    <span className="font-medium">{e.numberRequired}× {e.equipmentType}</span>
                    <span className="text-slate-400 text-xs">from {e.requiredFromTime}{e.expectedDuration ? ` · ${e.expectedDuration}` : ""}{e.operatorRequired ? " · operator needed" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Labour */}
          {req.labour?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-teal-600 uppercase tracking-wider mb-1">Labour</p>
              <div className="space-y-1">
                {req.labour.map((l: any, i: number) => (
                  <div key={i} className="text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Users className="w-3 h-3 text-teal-500 flex-shrink-0" />
                    <span className="font-medium">{l.count} {l.labourType}</span>
                    <span className="text-slate-400 text-xs">{l.skilledType} · from {l.requiredFromTime}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Immediate */}
          {req.immediateRequirements?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">Immediate Requirements</p>
              <div className="space-y-1">
                {req.immediateRequirements.map((item: any, i: number) => (
                  <div key={i} className="text-sm text-slate-700 dark:text-slate-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium">{item.description}</span>
                        <span className="text-slate-400 text-xs ml-2">{item.category} · <span className={item.urgency === "immediate" ? "text-red-500 font-bold" : ""}>{item.urgency}</span></span>
                        {item.reason && <p className="text-xs text-slate-400 italic">{item.reason}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PM remarks (if any) */}
          {req.pmRemarks && !editing && (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
              <p className="text-xs font-bold text-slate-500 mb-0.5">PM Remarks</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">{req.pmRemarks}</p>
            </div>
          )}

          {/* Readiness confirmation summary (shown to PM/manager once engineer confirms) */}
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

          {/* Allocation status (existing, read view) */}
          {req.allocationStatus && !allocEditing && (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Allocation Status</p>
                {canReview && (
                  <button
                    type="button"
                    onClick={() => setAllocEditing(true)}
                    className="text-[10px] text-blue-600 hover:underline"
                    data-testid={`button-edit-alloc-${req.id}`}
                  >
                    Edit
                  </button>
                )}
              </div>
              {[
                { key: "materials",  remarkKey: "materialsRemark",  icon: Package,       label: "Materials" },
                { key: "equipment",  remarkKey: "equipmentRemark",  icon: Wrench,        label: "Equipment" },
                { key: "labour",     remarkKey: "labourRemark",     icon: Users,         label: "Labour" },
                { key: "immediate",  remarkKey: "immediateRemark",  icon: AlertTriangle, label: "Immediate" },
              ].filter(r => req.allocationStatus[r.key]).map(r => {
                const val = req.allocationStatus[r.key];
                const remark = req.allocationStatus[r.remarkKey];
                const badgeColor = val === "available" || val === "approved" || val === "arranged"
                  ? "bg-green-100 text-green-700"
                  : val === "expected" || val === "requested"
                  ? "bg-blue-100 text-blue-700"
                  : val === "partly"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700";
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

          {/* ── Revision request reason / remarks display ── */}
          {req.revisionRequestReason && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 space-y-0.5">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Revision Request Reason</p>
              <p className="text-xs text-slate-700 dark:text-slate-200">{req.revisionRequestReason}</p>
              {req.revisionRemarks && (
                <p className="text-xs text-slate-500 italic">PM remarks: {req.revisionRemarks}</p>
              )}
            </div>
          )}

          {/* ── Engineer (submitter) revision controls ── */}
          {isOwner && !canReview && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              {/* Case A/B: Not acted upon → direct revise */}
              {!acted && revStatus === "original" && (
                <Button
                  type="button" variant="outline" size="sm"
                  className="gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                  onClick={() => setLocation(`/site/requirements/new?editId=${req.id}&returnTo=/site/requirements`)}
                  data-testid={`button-revise-${req.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" /> Revise Requirement
                </Button>
              )}

              {/* Case C: Acted upon, no pending request → show Request Revision */}
              {(acted || revStatus === "revision_rejected") && revStatus !== "revision_requested" && revStatus !== "revision_approved" && !req.revisionOneTimeUsed && (
                <>
                  {!revRequestOpen ? (
                    <Button
                      type="button" variant="outline" size="sm"
                      className="gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                      onClick={() => setRevRequestOpen(true)}
                      data-testid={`button-request-revision-${req.id}`}
                    >
                      <Send className="w-3.5 h-3.5" /> Request Revision
                    </Button>
                  ) : (
                    <div className="space-y-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-3 border border-amber-100 dark:border-amber-800">
                      <p className="text-xs font-bold text-amber-700">Reason for revision request</p>
                      <Textarea
                        value={revReason}
                        onChange={e => setRevReason(e.target.value)}
                        placeholder="Briefly explain what you missed or need to correct..."
                        className="text-sm resize-none bg-white dark:bg-slate-900"
                        rows={3}
                        data-testid={`input-rev-reason-${req.id}`}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button" size="sm"
                          onClick={() => revRequestMutation.mutate()}
                          disabled={!revReason.trim() || revRequestMutation.isPending}
                          className="bg-amber-600 hover:bg-amber-700"
                          data-testid={`button-send-rev-request-${req.id}`}
                        >
                          {revRequestMutation.isPending ? "Sending..." : "Send Request"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setRevRequestOpen(false); setRevReason(""); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Case: revision_requested — awaiting PM */}
              {revStatus === "revision_requested" && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 border border-amber-200">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  Revision request sent — awaiting PM/Admin approval
                </div>
              )}

              {/* Case D: revision approved → one-time edit */}
              {revStatus === "revision_approved" && !req.revisionOneTimeUsed && (
                <Button
                  type="button" size="sm"
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                  onClick={() => setLocation(`/site/requirements/new?editId=${req.id}&returnTo=/site/requirements`)}
                  data-testid={`button-edit-now-${req.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit Now (one-time)
                </Button>
              )}

              {/* Case: revision_rejected */}
              {revStatus === "revision_rejected" && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 border border-red-200">
                  <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Revision request was rejected
                  {req.revisionRemarks && <span className="text-slate-500">— {req.revisionRemarks}</span>}
                </div>
              )}
            </div>
          )}

          {/* ── PM/Admin can always edit directly ── */}
          {canReview && revStatus !== "revision_requested" && (
            <div className="pt-1">
              <Button
                type="button" variant="ghost" size="sm"
                className="gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-7 text-xs px-2"
                onClick={() => setLocation(`/site/requirements/new?editId=${req.id}&returnTo=/site/requirements`)}
                data-testid={`button-pm-edit-${req.id}`}
              >
                <Pencil className="w-3 h-3" /> Edit Requirement
              </Button>
            </div>
          )}

          {/* ── PM Revision Approval panel ── */}
          {canReview && revStatus === "revision_requested" && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-3 border border-amber-200 dark:border-amber-800 space-y-2">
              <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Revision Requested by site user
              </p>
              {!revActionOpen ? (
                <div className="flex gap-2">
                  <Button
                    type="button" size="sm"
                    className="bg-green-600 hover:bg-green-700 gap-1.5"
                    onClick={() => setRevActionOpen("approve")}
                    data-testid={`button-approve-revision-${req.id}`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approve Revision
                  </Button>
                  <Button
                    type="button" size="sm" variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                    onClick={() => setRevActionOpen("reject")}
                    data-testid={`button-reject-revision-${req.id}`}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {revActionOpen === "approve"
                      ? "Approving will allow the site user to make one edit."
                      : "Provide a reason for rejection (optional)."}
                  </p>
                  <Textarea
                    value={revActionRemarks}
                    onChange={e => setRevActionRemarks(e.target.value)}
                    placeholder={revActionOpen === "approve" ? "PM remarks (optional)" : "Reason for rejection (optional)"}
                    className="text-sm resize-none bg-white dark:bg-slate-900"
                    rows={2}
                    data-testid={`input-rev-action-remarks-${req.id}`}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button" size="sm"
                      disabled={revApproveMutation.isPending || revRejectMutation.isPending}
                      className={revActionOpen === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                      onClick={() => revActionOpen === "approve" ? revApproveMutation.mutate() : revRejectMutation.mutate()}
                      data-testid={`button-confirm-rev-action-${req.id}`}
                    >
                      {revApproveMutation.isPending || revRejectMutation.isPending
                        ? "Saving..."
                        : revActionOpen === "approve" ? "Confirm Approval" : "Confirm Rejection"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setRevActionOpen(null); setRevActionRemarks(""); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PM review controls */}
          {canReview && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">

              {/* Allocation update form */}
              {allocEditing ? (
                <div className="space-y-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-3 border border-blue-100 dark:border-blue-800">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-300">Update Allocation Status</p>
                  {[
                    { label: "Materials",  state: allocMat,  setState: setAllocMat,  remarkState: allocMatR,  setRemarkState: setAllocMatR,  icon: Package,       show: (req.materials?.length > 0) },
                    { label: "Equipment",  state: allocEq,   setState: setAllocEq,   remarkState: allocEqR,   setRemarkState: setAllocEqR,   icon: Wrench,        show: (req.equipment?.length > 0) },
                    { label: "Labour",     state: allocLab,  setState: setAllocLab,  remarkState: allocLabR,  setRemarkState: setAllocLabR,  icon: Users,         show: (req.labour?.length > 0) },
                    { label: "Immediate",  state: allocImm,  setState: setAllocImm,  remarkState: allocImmR,  setRemarkState: setAllocImmR,  icon: AlertTriangle, show: (req.immediateRequirements?.length > 0) },
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
                      <input
                        type="text"
                        value={r.remarkState}
                        onChange={e => r.setRemarkState(e.target.value)}
                        placeholder="Remark (optional)"
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white dark:bg-slate-900 dark:border-slate-700"
                        data-testid={`input-alloc-remark-${r.label.toLowerCase()}-${req.id}`}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      type="button" size="sm"
                      onClick={() => allocMutation.mutate()}
                      disabled={allocMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                      data-testid={`button-save-alloc-${req.id}`}
                    >
                      {allocMutation.isPending ? "Saving..." : "Save Allocation"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAllocEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                !req.allocationStatus && (
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => setAllocEditing(true)}
                    data-testid={`button-set-alloc-${req.id}`}
                  >
                    Set Allocation Status
                  </Button>
                )
              )}

              {/* Status review */}
              {!editing ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} data-testid={`button-review-${req.id}`}>
                  Update Status
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
                  <Textarea
                    value={pmRemarks}
                    onChange={e => setPmRemarks(e.target.value)}
                    placeholder="PM remarks (optional)"
                    className="text-sm resize-none"
                    rows={2}
                    data-testid={`input-pm-remarks-${req.id}`}
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-green-600 hover:bg-green-700" data-testid={`button-save-status-${req.id}`}>
                      {updateMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} data-testid={`button-cancel-review-${req.id}`}>
                      Cancel
                    </Button>
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

export default function SiteRequirementsList() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isManager = (user as any)?.role === "admin" || (user as any)?.role === "manager";

  const { data: requirements = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/site-requirements"],
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          type="button"
          onClick={() => setLocation("/site")}
          className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">Site Requirements Queue</h1>
          <p className="text-xs text-slate-400">
            {isManager ? "Review and action requirements from site engineers" : "Your submitted requirements"}
          </p>
        </div>
        <Link href="/site/requirements/new?returnTo=/site/requirements">
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600 gap-1 text-xs" data-testid="button-new-requirement">
            + New
          </Button>
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-12 text-sm text-slate-400">Loading...</div>
        ) : requirements.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 text-center" data-testid="text-no-requirements">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No requirements yet</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Site engineers can raise tomorrow's requirements from their home page.</p>
            <Link href="/site/requirements/new?returnTo=/site/requirements">
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600" data-testid="button-raise-first">
                Raise a Requirement
              </Button>
            </Link>
          </div>
        ) : (
          requirements.map((req: any) => (
            <RequirementCard key={req.id} req={req} canReview={isManager} />
          ))
        )}
      </div>
    </div>
  );
}
