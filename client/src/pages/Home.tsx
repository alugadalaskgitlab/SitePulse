import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  HardHat, FileText, Fuel, ShoppingCart, CheckCircle2, Clock,
  AlertTriangle, Activity, Truck, ChevronRight, ArrowUpRight, MapPin,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";


export default function Home() {
  const { user, sectionVisible, isAdmin } = useAuth();

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = format(new Date(), "EEEE, d MMMM yyyy");
  const firstName = user?.fullName?.split(" ")[0] ?? "";

  // ── Real data queries ──
  const { data: sites = [] } = useQuery<any[]>({ queryKey: ["/api/sites"] });

  const { data: todayDprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs", { dateFrom: todayStr, dateTo: todayStr }],
    queryFn: () =>
      fetch(`/api/dprs?dateFrom=${todayStr}&dateTo=${todayStr}`)
        .then((r) => r.json()),
  });

  const { data: allDprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details"],
    queryFn: () => fetch("/api/dprs/with-details").then((r) => r.json()),
    select: (data) => data.slice(0, 6),
  });

  const { data: dieselReqs = [] } = useQuery<any[]>({
    queryKey: ["/api/diesel-requirements"],
  });

  const { data: purchaseIndents = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-indents"],
  });

  const { data: dispatches = [] } = useQuery<any[]>({
    queryKey: ["/api/plant-module/dispatches"],
    queryFn: () =>
      fetch(`/api/plant-module/dispatches?dateFrom=${todayStr}&dateTo=${todayStr}`)
        .then((r) => r.json()),
  });

  const { data: unassigned } = useQuery<{
    dieselRequirements: unknown[];
    purchaseIndents: unknown[];
  }>({
    queryKey: ["/api/admin/site-backfill/unassigned"],
    enabled: isAdmin,
  });

  const { data: internalRequisitions = [] } = useQuery<any[]>({
    queryKey: ["/api/internal-requisitions", { status: "pending" }],
    queryFn: () =>
      fetch("/api/internal-requisitions?status=pending")
        .then((r) => r.json()),
  });

  // ── Derived values ──
  const activeSites = sites.filter((s: any) => s.isActive !== 0);
  const dprSiteNames = new Set(todayDprs.map((d: any) => d.site));

  const pendingDiesel = dieselReqs.filter(
    (d: any) => d.status === "pending" || d.status === "submitted"
  );
  const pendingIndents = purchaseIndents.filter(
    (p: any) => p.status === "pending" || p.status === "submitted" || p.status === "stores_check"
  );
  const pendingIRN = Array.isArray(internalRequisitions) ? internalRequisitions.length : 0;
  const totalPending = pendingDiesel.length + pendingIndents.length + pendingIRN;

  const todayDispatchCount = Array.isArray(dispatches) ? dispatches.length : 0;
  const todayDispatchMT = Array.isArray(dispatches)
    ? dispatches.reduce((sum: number, d: any) => sum + (Number(d.quantity) || 0), 0)
    : 0;

  const unassignedDiesel = unassigned?.dieselRequirements?.length ?? 0;
  const unassignedIndents = unassigned?.purchaseIndents?.length ?? 0;
  const totalUnassigned = unassignedDiesel + unassignedIndents;

  // Recent DPRs as activity feed
  const recentActivity = allDprs.slice(0, 5).map((d: any) => ({
    time: d.date === todayStr ? "Today" : d.date,
    who: d.engineerName || d.engineer || "Engineer",
    action: "Filed DPR",
    detail: d.site,
    icon: FileText,
    color: "text-teal-600",
  }));


  // Permission visibility
  const canSeeSite = sectionVisible("site_dprs") || sectionVisible("site_materials") || sectionVisible("site_procurement") || sectionVisible("site_diesel");

  return (
    <HubShell title="Home Dashboard">
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* ── Welcome ── */}
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">{todayDisplay}</p>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* DPRs Today */}
          <div className="bg-white rounded-xl border border-amber-200 p-4 flex flex-col gap-3 relative overflow-hidden" data-testid="stat-dprs">
            {todayDprs.length < activeSites.length && activeSites.length > 0 && (
              <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-rose-500" />
            )}
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">
                {todayDprs.length}
                {activeSites.length > 0 && (
                  <span className="text-sm font-normal text-slate-400"> / {activeSites.length}</span>
                )}
              </p>
              <p className="text-xs text-slate-700 mt-1 font-medium">DPRs Filed Today</p>
              <p className={`text-[11px] mt-0.5 font-medium ${activeSites.length > todayDprs.length ? "text-rose-500" : "text-teal-600"}`}>
                {activeSites.length > todayDprs.length
                  ? `${activeSites.length - todayDprs.length} site${activeSites.length - todayDprs.length > 1 ? "s" : ""} pending`
                  : "All sites filed"}
              </p>
            </div>
          </div>

          {/* Dispatches */}
          <div className="bg-white rounded-xl border border-teal-200 p-4 flex flex-col gap-3" data-testid="stat-dispatches">
            <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
              <Truck className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{todayDispatchCount}</p>
              <p className="text-xs text-slate-700 mt-1 font-medium">Dispatches Today</p>
              <p className="text-[11px] mt-0.5 font-medium text-slate-500">
                {todayDispatchMT > 0 ? `${todayDispatchMT.toFixed(1)} MT total` : "No dispatches yet"}
              </p>
            </div>
          </div>

          {/* Pending Approvals */}
          <div className="bg-white rounded-xl border border-rose-200 p-4 flex flex-col gap-3 relative overflow-hidden" data-testid="stat-pending">
            {totalPending > 0 && (
              <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-rose-500" />
            )}
            <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{totalPending}</p>
              <p className="text-xs text-slate-700 mt-1 font-medium">Pending Approvals</p>
              <p className={`text-[11px] mt-0.5 font-medium ${totalPending > 0 ? "text-rose-500" : "text-slate-500"}`}>
                {pendingDiesel.length > 0 && `${pendingDiesel.length} diesel`}
                {pendingDiesel.length > 0 && pendingIndents.length > 0 && " · "}
                {pendingIndents.length > 0 && `${pendingIndents.length} indent`}
                {totalPending === 0 && "All clear"}
              </p>
            </div>
          </div>

          {/* Active Sites */}
          <div className="bg-white rounded-xl border border-blue-200 p-4 flex flex-col gap-3" data-testid="stat-sites">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <HardHat className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{activeSites.length}</p>
              <p className="text-xs text-slate-700 mt-1 font-medium">Active Sites</p>
              <p className="text-[11px] mt-0.5 font-medium text-slate-500">
                {dprSiteNames.size} reported today
              </p>
            </div>
          </div>
        </div>

        {/* ── Two-column panel row ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Left 2/3: Site DPR Status + Recent Activity */}
          <div className="col-span-1 md:col-span-2 space-y-4">

            {/* Site DPR Status */}
            {canSeeSite && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-semibold text-slate-800">Today's Site DPR Status</h3>
                  </div>
                  <Link href="/site/hub">
                    <a className="text-xs text-orange-500 hover:text-orange-600 font-medium flex items-center gap-0.5">
                      View all <ChevronRight className="w-3 h-3" />
                    </a>
                  </Link>
                </div>
                {activeSites.length === 0 ? (
                  <div className="px-5 py-6 text-center text-sm text-slate-400">No active sites configured</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {activeSites.slice(0, 6).map((site: any) => {
                      const dpr = todayDprs.find((d: any) => d.site === site.name);
                      return (
                        <div key={site.id} className="flex items-center gap-3 px-5 py-3.5" data-testid={`dpr-status-${site.id}`}>
                          {dpr
                            ? <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0" />
                            : <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{site.name}</p>
                            {dpr
                              ? <p className="text-xs text-slate-500 mt-0.5">Filed by {dpr.engineer || "—"}</p>
                              : <p className="text-xs text-amber-500 font-medium mt-0.5">DPR not yet filed</p>
                            }
                          </div>
                          {dpr
                            ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-medium flex-shrink-0">Filed</span>
                            : <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium flex-shrink-0">Pending</span>
                          }
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-800">Recent DPRs</h3>
                </div>
                <Link href="/site/hub">
                  <a className="text-xs text-orange-500 hover:text-orange-600 font-medium flex items-center gap-0.5">
                    View all <ChevronRight className="w-3 h-3" />
                  </a>
                </Link>
              </div>
              {recentActivity.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-slate-400">No DPRs filed yet</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {recentActivity.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 px-5 py-3">
                      <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <r.icon className={`w-3.5 h-3.5 ${r.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">{r.who}</span>
                          {" filed DPR — "}
                          <span className="text-slate-600">{r.detail}</span>
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-400 flex-shrink-0 mt-0.5">{r.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right 1/3: Pending Actions — 3-tier */}
          <div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Pending Actions</h3>
                </div>
                {totalPending > 0 && (
                  <span className="text-xs bg-rose-100 text-rose-600 font-semibold px-1.5 py-0.5 rounded-full">{totalPending}</span>
                )}
              </div>
              <div className="divide-y divide-slate-50">

                {/* Tier 1: Purchase Indents */}
                <div className="px-4 py-3.5 flex items-start gap-3" data-testid="pending-tier-indents">
                  <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 leading-snug">Purchase Indents</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${pendingIndents.length > 0 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                        {pendingIndents.length > 0 ? `${pendingIndents.length} pending` : "0"}
                      </span>
                    </div>
                    <p className={`text-[11px] mt-0.5 leading-snug ${pendingIndents.length > 0 ? "text-rose-500 font-medium" : "text-slate-400"}`}>
                      {pendingIndents.length > 0 ? `${pendingIndents.length} awaiting approval` : "All clear"}
                    </p>
                    {pendingIndents.length > 0 && (
                      <Link href="/plant/purchase-indents?returnTo=/">
                        <a className="mt-1.5 text-[11px] font-medium text-orange-500 hover:text-orange-600 flex items-center gap-0.5" data-testid="link-review-indents">
                          Review <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Tier 2: Diesel Requirements */}
                <div className="px-4 py-3.5 flex items-start gap-3" data-testid="pending-tier-diesel">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Fuel className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 leading-snug">Diesel Requirements</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${pendingDiesel.length > 0 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                        {pendingDiesel.length > 0 ? `${pendingDiesel.length} pending` : "0"}
                      </span>
                    </div>
                    <p className={`text-[11px] mt-0.5 leading-snug ${pendingDiesel.length > 0 ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                      {pendingDiesel.length > 0 ? `${pendingDiesel.length} awaiting approval` : "All clear"}
                    </p>
                    {pendingDiesel.length > 0 && (
                      <Link href="/plant/diesel-requirements?returnTo=/">
                        <a className="mt-1.5 text-[11px] font-medium text-orange-500 hover:text-orange-600 flex items-center gap-0.5" data-testid="link-review-diesel">
                          Review <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Tier 3: Site Backfill (admin only) */}
                {isAdmin && totalUnassigned > 0 && (
                  <div className="px-4 py-3.5 flex items-start gap-3" data-testid="pending-tier-backfill">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800 leading-snug">Unassigned Sites</p>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
                          {totalUnassigned} unassigned
                        </span>
                      </div>
                      <p className="text-[11px] mt-0.5 leading-snug text-rose-500 font-medium">
                        {unassignedDiesel > 0 && `${unassignedDiesel} diesel`}
                        {unassignedDiesel > 0 && unassignedIndents > 0 && " · "}
                        {unassignedIndents > 0 && `${unassignedIndents} indent`}
                        {" "}need site assigned
                      </p>
                      <Link href="/admin/site-backfill">
                        <a className="mt-1.5 text-[11px] font-medium text-orange-500 hover:text-orange-600 flex items-center gap-0.5" data-testid="link-review-backfill">
                          Assign sites <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </Link>
                    </div>
                  </div>
                )}

                {/* Tier 4: Internal Requisitions */}
                <div className="px-4 py-3.5 flex items-start gap-3" data-testid="pending-tier-irn">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 leading-snug">Internal Requisitions</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${pendingIRN > 0 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                        {pendingIRN > 0 ? `${pendingIRN} pending` : "0"}
                      </span>
                    </div>
                    <p className={`text-[11px] mt-0.5 leading-snug ${pendingIRN > 0 ? "text-indigo-600 font-medium" : "text-slate-400"}`}>
                      {pendingIRN > 0 ? `${pendingIRN} awaiting approval` : "All clear"}
                    </p>
                    {pendingIRN > 0 && (
                      <Link href="/internal-requisitions?returnTo=/">
                        <a className="mt-1.5 text-[11px] font-medium text-orange-500 hover:text-orange-600 flex items-center gap-0.5" data-testid="link-review-irn">
                          Review <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </Link>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </HubShell>
  );
}
