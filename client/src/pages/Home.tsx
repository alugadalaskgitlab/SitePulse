import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  HardHat, FileText, Fuel, ShoppingCart, CheckCircle2, Clock,
  AlertTriangle, Activity, Truck, ChevronRight, ArrowUpRight, MapPin, Smartphone, CalendarCheck,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import FieldHome from "@/pages/FieldHome";
import { getWorkspaceMode, setWorkspaceMode, type WorkspaceMode } from "@/lib/workspaceMode";
import { format, parseISO, subDays } from "date-fns";
import { roadDprDraftHref } from "@/lib/dprEntryMode";
import { normalizeSiteName } from "@shared/siteName";
import { oldestPendingFirst, pendingAge, pendingDieselHref, pendingIndentHref, pendingIrnHref } from "@/lib/homePendingActions";

export default function Home() {
  const { isFieldEngineer, user } = useAuth();
  const userId = user?.id ?? null;

  // ── Universal default landing page ──────────────────────────────────────
  // Field Home is the default for EVERY user — role never decides the
  // landing page (the old `!isAdmin && isFieldEngineer` rule was the same
  // class of bug already fixed for DPR entry mode: a PM covering for an
  // absent Site Engineer must see the identical workflow). Only the user's
  // own deliberate switch to the Classic Dashboard is remembered, per user,
  // via lib/workspaceMode.ts — exactly like the Guided/Classic DPR choice.
  //
  // IMPORTANT: the decision of which component to render lives in this
  // top-level wrapper, which itself calls no data-fetching hooks. This
  // avoids "Rendered fewer hooks than expected" errors that would occur if
  // a component with an early return also called useQuery hooks after that
  // return — the hook count/order must stay identical across renders of a
  // single component instance.
  // The user id is passed explicitly (not relied on via the auth-context
  // binding, which only happens in a post-render effect — too late for the
  // first render). Re-read whenever the authenticated user changes so a
  // second user on the same browser never inherits the first user's choice.
  const [mode, setMode] = useState<WorkspaceMode>(() => getWorkspaceMode(userId));
  useEffect(() => {
    setMode(getWorkspaceMode(userId));
  }, [userId]);
  const choose = (m: WorkspaceMode) => {
    setWorkspaceMode(m, userId); // remembered per user for future logins
    setMode(m);
  };

  if (mode === "field") {
    return <FieldHome onViewFullDashboard={() => choose("classic")} />;
  }

  return (
    <HomeDashboard
      isFieldEngineer={isFieldEngineer}
      onSwitchToFieldView={() => choose("field")}
    />
  );
}

function HomeDashboard({
  isFieldEngineer,
  onSwitchToFieldView,
}: {
  isFieldEngineer: boolean;
  onSwitchToFieldView: () => void;
}) {
  const { user, sectionVisible, isAdmin } = useAuth();
  // Keep the dashboard's resume path identical to Field Home: structures use
  // the detailed editor, while road drafts honour the user's DPR entry mode.
  const continueDraftHref = (d: any): string =>
    d?.workType === "structure" ? `/site/edit/${d.id}?draft` : roadDprDraftHref(d.id, "/", { complete: true });

  const [localNow, setLocalNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setLocalNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const todayStr = format(localNow, "yyyy-MM-dd");
  const todayDisplay = format(localNow, "EEEE, d MMMM yyyy");
  const afterDprCutoff = localNow.getHours() >= 18;
  const firstName = user?.fullName?.split(" ")[0] ?? "";

  // ── Real data queries ──
  const { data: sites = [] } = useQuery<any[]>({ queryKey: ["/api/sites"] });

  const { data: todayDprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs", { dateFrom: todayStr, dateTo: todayStr }],
    queryFn: () =>
      fetch(`/api/dprs?dateFrom=${todayStr}&dateTo=${todayStr}`)
        .then((r) => r.json()),
  });

  // Pending drafts — ANY unsubmitted DPR (regardless of engineer) from the
  // last 7 days across the user's permitted sites. The server already
  // excludes superseded / cancelled / deleted rows and applies site
  // permissions, so client-side we only need the draft-status filter.
  const draftLookbackFromStr = format(subDays(new Date(), 7), "yyyy-MM-dd");
  const canViewDprs = sectionVisible("site_dprs");
  const { data: recentWindowDprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs", { dateFrom: draftLookbackFromStr, dateTo: todayStr }],
    queryFn: () =>
      fetch(`/api/dprs?dateFrom=${draftLookbackFromStr}&dateTo=${todayStr}`)
        .then((r) => r.json()),
    enabled: canViewDprs,
  });
  const pendingDraftDprs = (Array.isArray(recentWindowDprs) ? recentWindowDprs : [])
    .filter((d: any) => d.dprStatus === "draft" && !d.isSuperseded)
    .sort((a: any, b: any) => (a.date < b.date ? 1 : -1));

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

  const canSeeIrn = sectionVisible("irn_view") || sectionVisible("irn_raise");

  const { data: internalRequisitions = [] } = useQuery<any[]>({
    queryKey: ["/api/irn", { status: "pending_stores" }],
    queryFn: () =>
      fetch("/api/irn?status=pending_stores", { credentials: "include" })
        .then((r) => r.json()),
    enabled: canSeeIrn,
  });

  // ── Derived values ──
  const activeSites = sites.filter((s: any) => s.isActive !== 0);
  // A saved draft is not a filing. Multiple DPRs on the same site count as
  // one reported site; a submitted DPR always wins over a draft.
  const siteDprStatus = new Map<string, { filed?: any; draft?: any }>();
  for (const dpr of todayDprs) {
    if (dpr.isSuperseded || dpr.isCancelled || dpr.isDeleted) continue;
    const name = normalizeSiteName(dpr.site ?? "");
    const status = siteDprStatus.get(name) ?? {};
    if (dpr.dprStatus === "draft") status.draft ??= dpr;
    else if (dpr.dprStatus === "submitted") status.filed ??= dpr;
    siteDprStatus.set(name, status);
  }
  const filedSiteCount = activeSites.filter((site: any) =>
    siteDprStatus.get(normalizeSiteName(site.name ?? ""))?.filed
  ).length;

  const pendingDiesel = oldestPendingFirst(dieselReqs.filter(
    (d: any) => d.status === "pending" || d.status === "submitted"
  ));
  const pendingIndents = oldestPendingFirst(purchaseIndents.filter(
    (p: any) => p.status === "pending" || p.status === "submitted" || p.status === "stores_check"
  ));
  const pendingIrns = canSeeIrn && Array.isArray(internalRequisitions)
    ? oldestPendingFirst(internalRequisitions) : [];
  const totalPending = pendingDiesel.length + pendingIndents.length + pendingIrns.length;

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
  const canProcure  = sectionVisible("site_procurement") || sectionVisible("purchase_indents_view") || sectionVisible("purchase_indents_raise") || sectionVisible("purchase_indents_approve");
  const canDiesel   = sectionVisible("site_diesel") || sectionVisible("diesel_req_view") || sectionVisible("diesel_req_raise") || sectionVisible("diesel_req_approve");
  const canSeeSite  = sectionVisible("site_dprs") || sectionVisible("site_materials") || canProcure || canDiesel;

  return (
    <HubShell title="Home Dashboard">
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* ── Welcome ── */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Welcome back{firstName ? `, ${firstName}` : ""}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{todayDisplay}</p>
          </div>
          {/* Every user can switch back to Field Home — the choice is
              remembered per user, exactly like the DPR entry-mode switch. */}
          <button
              type="button"
              onClick={onSwitchToFieldView}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-full px-3 py-1.5 flex-shrink-0"
              data-testid="button-switch-field-view"
            >
              <Smartphone className="w-3.5 h-3.5" />
              Field view
            </button>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Dispatches — plant/HMP metric; hidden for field-engineer-only viewers */}
          {!isFieldEngineer && (
            <div className="bg-white rounded-xl border border-teal-200 p-4 flex flex-col gap-3" data-testid="stat-dispatches">
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
                <Truck className="w-4 h-4 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 leading-none">{todayDispatchCount}</p>
                <p className="text-sm text-slate-700 mt-1 font-medium">Dispatches Today</p>
                <p className="text-xs mt-0.5 font-medium text-slate-500">
                  {todayDispatchMT > 0 ? `${todayDispatchMT.toFixed(1)} MT total` : "No dispatches yet"}
                </p>
              </div>
            </div>
          )}

          {/* Total active records in the sites master (not today's reporting count). */}
          <div className="bg-white rounded-xl border border-blue-200 p-4 flex flex-col gap-3" data-testid="stat-sites">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <HardHat className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{activeSites.length}</p>
              <p className="text-sm text-slate-700 mt-1 font-medium">Total Active Sites</p>
              <p className="text-xs mt-0.5 font-medium text-slate-500">
                {afterDprCutoff
                  ? `${filedSiteCount} filed today · active records in sites master`
                  : "Active records in sites master · reporting in progress"}
              </p>
            </div>
          </div>
        </div>

        {/* ── Two-column panel row ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Left 2/3: Site DPR Status + Recent Activity */}
          <div className="col-span-1 md:col-span-2 space-y-4">

            {/* Site Requirements Queue shortcut — fast path for PM/Admin */}
            {canSeeSite && (
              <Link href="/site/requirements?context=dashboard&returnTo=/">
                <a className="block bg-white rounded-xl border border-teal-200 px-5 py-4 hover:bg-teal-50/40 transition-colors group" data-testid="shortcut-site-requirements">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                        <CalendarCheck className="w-4 h-4 text-teal-600" />
                      </div>
                      <div>
                         <p className="text-sm font-semibold text-slate-800">Site Requirements & Arrangements</p>
                         <p className="text-xs text-slate-400 mt-0.5">Review raised requirements for tomorrow & immediate needs — materials, equipment, labour</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-teal-500 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                  </div>
                </a>
              </Link>
            )}

            {/* Pending draft DPRs — visible to anyone with site access, not
                just the engineer named on the draft (that personal banner
                lives on Field Home and is unchanged). */}
            {canViewDprs && pendingDraftDprs.length > 0 && (
              <div className="bg-white rounded-xl border border-rose-200 overflow-hidden" data-testid="panel-pending-drafts">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-rose-100 bg-rose-50/50">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <h3 className="text-sm font-semibold text-slate-800">
                    Unfinished Draft DPR{pendingDraftDprs.length > 1 ? "s" : ""} ({pendingDraftDprs.length})
                  </h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {pendingDraftDprs.slice(0, 5).map((d: any) => (
                    <div key={d.id} className="flex items-center gap-3 px-5 py-3" data-testid={`pending-draft-${d.id}`}>
                      <Clock className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {d.site} — {format(parseISO(d.date), "d MMM yyyy")}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {d.engineer || "—"} · saved as draft, not submitted
                        </p>
                      </div>
                      <Link href={continueDraftHref(d)}>
                        <a className="text-xs px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium flex-shrink-0 hover:bg-rose-100" data-testid={`link-pending-draft-${d.id}`}>
                          Open
                        </a>
                      </Link>
                    </div>
                  ))}
                  {pendingDraftDprs.length > 5 && (
                    <p className="px-5 py-2.5 text-xs text-slate-400">
                      + {pendingDraftDprs.length - 5} more — see reports list
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* One per-site view of today's DPR reporting (not a second aggregate KPI). */}
            {canSeeSite && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="panel-today-dpr-status">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-semibold text-slate-800">Today's Site DPR Status</h3>
                  </div>
                  <Link href="/site/dashboard" className="text-sm text-orange-500 hover:text-orange-600 font-medium flex items-center gap-0.5" data-testid="link-today-dpr-history">
                    View all <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                {activeSites.length === 0 ? (
                  <div className="px-5 py-6 text-center text-sm text-slate-400">No active sites configured</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {activeSites.map((site: any) => {
                      const { filed, draft } = siteDprStatus.get(normalizeSiteName(site.name ?? "")) ?? {};
                      const needsAttention = afterDprCutoff && !filed;
                      return (
                        <div key={site.id} className="flex items-center gap-3 px-5 py-3.5" data-testid={`dpr-status-${site.id}`}>
                          {filed
                            ? <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0" />
                            : <Clock className={`w-4 h-4 flex-shrink-0 ${needsAttention ? "text-rose-500" : "text-slate-400"}`} />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{site.name}</p>
                            {filed
                              ? <p className="text-sm text-slate-500 mt-0.5">Filed by {filed.engineer || "—"}</p>
                              : <p className={`text-sm mt-0.5 ${needsAttention ? "text-rose-600 font-medium" : "text-slate-500"}`}>
                                  {draft ? "Saved as draft, not submitted" : "No DPR submitted yet"}
                                </p>
                            }
                          </div>
                          {filed
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-medium flex-shrink-0">Filed</span>
                            : <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${needsAttention ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                                {draft ? "In draft" : "Not yet filed"}
                              </span>
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
                <Link href="/site/dashboard" className="text-sm text-orange-500 hover:text-orange-600 font-medium flex items-center gap-0.5" data-testid="link-recent-dpr-history">
                  View all <ChevronRight className="w-3 h-3" />
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
                      <span className="text-xs text-slate-400 flex-shrink-0 mt-0.5">{r.time}</span>
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
                  <span className="text-sm bg-rose-100 text-rose-600 font-semibold px-1.5 py-0.5 rounded-full">{totalPending}</span>
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
                      <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-full border ${pendingIndents.length > 0 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                        {pendingIndents.length > 0 ? `${pendingIndents.length} pending` : "0"}
                      </span>
                    </div>
                    <p className={`text-xs mt-0.5 leading-snug ${pendingIndents.length > 0 ? "text-rose-500 font-medium" : "text-slate-400"}`}>
                      {pendingIndents.length > 0 ? `${pendingIndents.length} awaiting approval` : "All clear"}
                    </p>
                     {pendingIndents.map((indent: any) => (
                       <Link key={indent.id} href={pendingIndentHref(indent.id)} className="mt-2 flex items-center justify-between gap-2 text-xs hover:text-orange-600" data-testid={`link-review-indent-${indent.id}`}>
                         <span className="truncate text-slate-700">{indent.indentNo || `Indent #${indent.id}`}</span>
                         <span className="flex-shrink-0 text-orange-600">{pendingAge(indent, localNow)} <ArrowUpRight className="inline w-3 h-3" /></span>
                       </Link>
                     ))}
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
                      <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-full border ${pendingDiesel.length > 0 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                        {pendingDiesel.length > 0 ? `${pendingDiesel.length} pending` : "0"}
                      </span>
                    </div>
                    <p className={`text-xs mt-0.5 leading-snug ${pendingDiesel.length > 0 ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                      {pendingDiesel.length > 0 ? `${pendingDiesel.length} awaiting approval` : "All clear"}
                    </p>
                     {pendingDiesel.map((requirement: any) => (
                       <Link key={requirement.id} href={pendingDieselHref(requirement.id)} className="mt-2 flex items-center justify-between gap-2 text-xs hover:text-orange-600" data-testid={`link-review-diesel-${requirement.id}`}>
                         <span className="truncate text-slate-700">{requirement.date || `Diesel #${requirement.id}`} · #{requirement.id}</span>
                         <span className="flex-shrink-0 text-orange-600">{pendingAge(requirement, localNow)} <ArrowUpRight className="inline w-3 h-3" /></span>
                       </Link>
                     ))}
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
                        <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
                          {totalUnassigned} unassigned
                        </span>
                      </div>
                      <p className="text-xs mt-0.5 leading-snug text-rose-500 font-medium">
                        {unassignedDiesel > 0 && `${unassignedDiesel} diesel`}
                        {unassignedDiesel > 0 && unassignedIndents > 0 && " · "}
                        {unassignedIndents > 0 && `${unassignedIndents} indent`}
                        {" "}need site assigned
                      </p>
                      <Link href="/admin/site-backfill">
                        <a className="mt-1.5 text-xs font-medium text-orange-500 hover:text-orange-600 flex items-center gap-0.5" data-testid="link-review-backfill">
                          Assign sites <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </Link>
                    </div>
                  </div>
                )}

                {/* Tier 4: Site Requirements Queue */}
                {canSeeSite && (
                <div className="px-4 py-3.5 flex items-start gap-3" data-testid="pending-tier-site-req">
                  <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CalendarCheck className="w-3.5 h-3.5 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 leading-snug">Site Requirements</p>
                    </div>
                    <p className="text-xs mt-0.5 leading-snug text-slate-400">
                      Tomorrow's plans & immediate needs
                    </p>
                    <Link href="/site/requirements?returnTo=/">
                      <a className="mt-1.5 text-xs font-medium text-orange-500 hover:text-orange-600 flex items-center gap-0.5" data-testid="link-site-requirements">
                        Open queue <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </Link>
                  </div>
                </div>
                )}

                {/* Tier 5: Internal Requisitions (stores users only) */}
                {canSeeIrn && (
                <div className="px-4 py-3.5 flex items-start gap-3" data-testid="pending-tier-irn">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 leading-snug">Internal Requisitions</p>
                       <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-full border ${pendingIrns.length > 0 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                         {pendingIrns.length > 0 ? `${pendingIrns.length} pending` : "0"}
                      </span>
                    </div>
                     <p className={`text-xs mt-0.5 leading-snug ${pendingIrns.length > 0 ? "text-indigo-600 font-medium" : "text-slate-400"}`}>
                       {pendingIrns.length > 0 ? `${pendingIrns.length} awaiting approval` : "All clear"}
                    </p>
                     {pendingIrns.map((irn: any) => (
                       <Link key={irn.id} href={pendingIrnHref(irn.id)} className="mt-2 flex items-center justify-between gap-2 text-xs hover:text-orange-600" data-testid={`link-review-irn-${irn.id}`}>
                         <span className="truncate text-slate-700">{irn.irnNo || `IRN #${irn.id}`}</span>
                         <span className="flex-shrink-0 text-orange-600">{pendingAge(irn, localNow)} <ArrowUpRight className="inline w-3 h-3" /></span>
                      </Link>
                     ))}
                  </div>
                </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>
    </HubShell>
  );
}
