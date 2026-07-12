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
  Wrench, Users, AlertTriangle, CheckCircle, Clock, XCircle,
} from "lucide-react";

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

  const sc = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.submitted;
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

          {/* PM review controls */}
          {canReview && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
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
