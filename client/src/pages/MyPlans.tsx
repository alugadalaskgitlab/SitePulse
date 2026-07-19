import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, isToday, isTomorrow, isPast, parseISO } from "date-fns";
import { ArrowLeft, ClipboardList, Package, Wrench, Users, AlertTriangle, PlusCircle, Pencil, CheckCircle2, Clock } from "lucide-react";
import { HubShell } from "@/components/HubShell";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  submitted:      { label: "Submitted",    color: "bg-blue-100 text-blue-700" },
  approved:       { label: "Approved",     color: "bg-green-100 text-green-700" },
  arranged:       { label: "Arranged",     color: "bg-emerald-100 text-emerald-700" },
  sent_store:     { label: "→ Store",      color: "bg-teal-100 text-teal-700" },
  sent_purchase:  { label: "→ Purchase",   color: "bg-violet-100 text-violet-700" },
  sent_plant:     { label: "→ Plant",      color: "bg-cyan-100 text-cyan-700" },
  rejected:       { label: "Rejected",     color: "bg-red-100 text-red-700" },
  clarification:  { label: "Clarification needed", color: "bg-amber-100 text-amber-700" },
};

const READINESS_CFG: Record<string, { label: string; color: string }> = {
  confirmed_ok:            { label: "✓ Readiness OK",  color: "bg-green-100 text-green-700" },
  confirmed_with_shortage: { label: "⚠ Shortage noted", color: "bg-red-100 text-red-700" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dateLabel(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d))    return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEE, d MMM yyyy");
  } catch {
    return dateStr;
  }
}

function isPlanEditable(plan: any): boolean {
  // Can edit if no PM action taken yet, or revision was approved (one-time)
  const actioned = ["approved", "arranged", "sent_store", "sent_purchase", "sent_plant"];
  const isActed = actioned.includes(plan.status) ||
    !!(plan.allocationStatus?.materials || plan.allocationStatus?.equipment || plan.allocationStatus?.labour);
  const hasOneTimeRevision = plan.revisionStatus === "revision_approved" && !plan.revisionOneTimeUsed;
  return !isActed || hasOneTimeRevision;
}

function AllocationDots({ alloc }: { alloc: any }) {
  if (!alloc) return <span className="text-[10px] text-gray-400">Pending PM review</span>;

  const hasMat   = !!(alloc.materials || alloc.materialItems?.length);
  const hasEq    = !!(alloc.equipment || alloc.equipmentItems?.length);
  const hasLab   = !!(alloc.labour   || alloc.labourItems?.length);

  if (!hasMat && !hasEq && !hasLab) {
    return <span className="text-[10px] text-gray-400">Pending PM review</span>;
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {hasMat && (
        <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
          <Package className="w-2.5 h-2.5" /> Material
        </span>
      )}
      {hasEq && (
        <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
          <Wrench className="w-2.5 h-2.5" /> Equipment
        </span>
      )}
      {hasLab && (
        <span className="flex items-center gap-0.5 text-[10px] font-medium text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-full">
          <Users className="w-2.5 h-2.5" /> Labour
        </span>
      )}
    </div>
  );
}

function PlanCard({ plan }: { plan: any }) {
  const statusCfg = STATUS_CFG[plan.status] ?? { label: plan.status, color: "bg-gray-100 text-gray-600" };
  const readinessCfg = plan.readinessStatus && plan.readinessStatus !== "not_confirmed"
    ? READINESS_CFG[plan.readinessStatus]
    : null;

  const editable = isPlanEditable(plan);
  const isPastDate = isPast(parseISO(plan.date + "T23:59:59"));

  const matCount = plan.materials?.length ?? 0;
  const eqCount  = plan.equipment?.length ?? 0;
  const labCount = plan.labour?.length ?? 0;
  const immCount = plan.immediateRequirements?.length ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gray-900">{dateLabel(plan.date)}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            {readinessCfg && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${readinessCfg.color}`}>
                {readinessCfg.label}
              </span>
            )}
          </div>
          {plan.createdAt && (
            <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              Submitted {format(new Date(plan.createdAt), "d MMM, h:mm a")}
            </p>
          )}
        </div>

        <Link href={`/site/requirements/new?editId=${plan.id}&returnTo=/my-plans`}>
          <a
            className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg flex-shrink-0 transition-colors ${
              editable
                ? "bg-orange-50 text-orange-600 hover:bg-orange-100"
                : "bg-gray-50 text-gray-400 pointer-events-none"
            }`}
            data-testid={`button-edit-plan-${plan.id}`}
          >
            <Pencil className="w-3 h-3" />
            {editable ? "Edit" : "View"}
          </a>
        </Link>
      </div>

      <div className="border-t border-gray-50 px-4 py-3 space-y-2">
        {/* Planned activity */}
        {plan.plannedWork?.activity ? (
          <div className="flex items-start gap-2">
            <ClipboardList className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-800 font-medium leading-snug">{plan.plannedWork.activity}</p>
          </div>
        ) : plan.immediateRequirements?.length > 0 ? (
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-800 font-medium leading-snug">Immediate requirement</p>
          </div>
        ) : null}

        {/* Resources requested */}
        {(matCount + eqCount + labCount + immCount) > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {matCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <Package className="w-3 h-3 text-emerald-400" /> {matCount} material{matCount > 1 ? "s" : ""}
              </span>
            )}
            {eqCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <Wrench className="w-3 h-3 text-amber-400" /> {eqCount} equipment
              </span>
            )}
            {labCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <Users className="w-3 h-3 text-teal-400" /> {labCount} labour
              </span>
            )}
            {immCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <AlertTriangle className="w-3 h-3 text-red-400" /> {immCount} immediate
              </span>
            )}
          </div>
        )}

        {/* Allocation status from PM */}
        <div className="pt-0.5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Arrangement Status</p>
          <AllocationDots alloc={plan.allocationStatus} />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyPlans() {
  const { data: plans = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/site-requirements"],
  });

  const sorted = [...plans].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const upcoming = sorted.filter(p => !isPast(parseISO(p.date + "T23:59:59")));
  const past     = sorted.filter(p =>  isPast(parseISO(p.date + "T23:59:59")));

  return (
    <HubShell title="My Plans">
      <div className="min-h-screen bg-gray-50">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/">
              <a
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
                data-testid="button-back-my-plans"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600" />
              </a>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-gray-900">My Plans</h1>
              <p className="text-xs text-gray-400">Your submitted tomorrow's plans</p>
            </div>
            <Link href="/site/requirements/new?returnTo=/my-plans">
              <a
                className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors"
                data-testid="button-new-plan"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                New Plan
              </a>
            </Link>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 pb-24 pt-4 space-y-4">

          {isLoading && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">Loading your plans…</p>
            </div>
          )}

          {!isLoading && sorted.length === 0 && (
            <div className="py-12 text-center">
              <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">No plans submitted yet</p>
              <p className="text-xs text-gray-400 mt-1">Submit a tomorrow's plan to get started</p>
              <Link href="/site/requirements/new?returnTo=/my-plans">
                <a
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 px-4 py-2 rounded-lg"
                  data-testid="button-first-plan"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Submit Your First Plan
                </a>
              </Link>
            </div>
          )}

          {!isLoading && upcoming.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-0.5">
                Upcoming
              </p>
              {upcoming.map(p => <PlanCard key={p.id} plan={p} />)}
            </div>
          )}

          {!isLoading && past.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-0.5 pt-1">
                Past
              </p>
              {past.map(p => <PlanCard key={p.id} plan={p} />)}
            </div>
          )}

        </div>
      </div>
    </HubShell>
  );
}
