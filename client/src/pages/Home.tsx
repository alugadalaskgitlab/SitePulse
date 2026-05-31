import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Factory, Wrench, Building2, BarChart2, HardHat,
  Settings, ArrowRight, Package, Receipt,
  FileText, Fuel, ShoppingCart, CheckCircle2, Clock,
  AlertTriangle, Activity, Truck, ChevronRight, ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { format } from "date-fns";

const MODULES = [
  { id: "site",      title: "Site Operations",       description: "Daily progress reports, material entries & site activities",       icon: HardHat,    href: "/site/hub",      lightBg: "bg-teal-50",    iconColor: "text-teal-600",    hoverBorder: "hover:border-teal-300",    isAdmin: false },
  { id: "hmp",       title: "HMP Operations",         description: "Shift logs, heating sessions & production dispatches",             icon: Factory,    href: "/plant/hub",     lightBg: "bg-orange-50",  iconColor: "text-orange-600",  hoverBorder: "hover:border-orange-300",  isAdmin: false },
  { id: "rmc",       title: "RMC Operations",         description: "Ready-mix batching, delivery challans & cube tests",               icon: Building2,  href: "/rmc/hub",       lightBg: "bg-emerald-50", iconColor: "text-emerald-600", hoverBorder: "hover:border-emerald-300", isAdmin: false },
  { id: "equipment", title: "Equipment & Fleet",      description: "Usage logs, breakdowns & diesel tracking",                         icon: Wrench,     href: "/equipment/hub", lightBg: "bg-blue-50",    iconColor: "text-blue-600",    hoverBorder: "hover:border-blue-300",    isAdmin: false },
  { id: "stores",    title: "Stores & Inventory",     description: "GRNs, issue vouchers, item master & stock tracking",               icon: Package,    href: "/stores/hub",    lightBg: "bg-amber-50",   iconColor: "text-amber-600",   hoverBorder: "hover:border-amber-300",   isAdmin: false },
  { id: "finance",   title: "Procurement & Billing",  description: "Purchase indents, diesel requirements, vendor bills & rate cards", icon: Receipt,    href: "/finance/hub",   lightBg: "bg-rose-50",    iconColor: "text-rose-600",    hoverBorder: "hover:border-rose-300",    isAdmin: false },
  { id: "reports",   title: "Reports & Analysis",     description: "Production reports, stock ledgers & management reports",           icon: BarChart2,  href: "/reports/hub",   lightBg: "bg-purple-50",  iconColor: "text-purple-600",  hoverBorder: "hover:border-purple-300",  isAdmin: false },
  { id: "masters",   title: "Masters & Config",       description: "Reference data, user management & app administration",             icon: Settings,   href: "/admin/hub",     lightBg: "bg-slate-100",  iconColor: "text-slate-600",   hoverBorder: "hover:border-slate-300",   isAdmin: true  },
];

export default function Home() {
  const { user, sectionVisible, isAdmin } = useAuth();
  const { rmcEnabled } = useFeatureFlags();

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

  // ── Derived values ──
  const activeSites = sites.filter((s: any) => s.isActive !== false);
  const dprSiteNames = new Set(todayDprs.map((d: any) => d.site));

  const pendingDiesel = dieselReqs.filter(
    (d: any) => d.status === "pending" || d.status === "submitted"
  );
  const pendingIndents = purchaseIndents.filter(
    (p: any) => p.status === "pending" || p.status === "submitted"
  );
  const totalPending = pendingDiesel.length + pendingIndents.length;

  const todayDispatchCount = Array.isArray(dispatches) ? dispatches.length : 0;
  const todayDispatchMT = Array.isArray(dispatches)
    ? dispatches.reduce((sum: number, d: any) => sum + (Number(d.quantity) || 0), 0)
    : 0;

  // Recent DPRs as activity feed
  const recentActivity = allDprs.slice(0, 5).map((d: any) => ({
    time: d.date === todayStr ? "Today" : d.date,
    who: d.engineerName || d.engineer || "Engineer",
    action: "Filed DPR",
    detail: d.site,
    icon: FileText,
    color: "text-teal-600",
  }));

  // Pending actions combined
  const pendingActions = [
    ...pendingDiesel.slice(0, 3).map((d: any) => ({
      label: "Daily Diesel Requirement",
      sub: `${d.site || "Site"} · ${d.totalQuantity ? d.totalQuantity + " L" : ""} · ${d.requestedBy || ""}`.replace(/\s·\s$/, ""),
      icon: Fuel,
      color: "text-amber-600",
      bg: "bg-amber-50",
      href: "/plant/diesel-requirements",
    })),
    ...pendingIndents.slice(0, 3).map((p: any) => ({
      label: `Purchase Indent #${p.indentNumber || p.id}`,
      sub: `${p.purpose || p.category || ""} · ${p.site || ""}`.replace(/^\s·\s|\s·\s$/, "").trim(),
      icon: ShoppingCart,
      color: "text-rose-600",
      bg: "bg-rose-50",
      href: "/plant/purchase-indents",
    })),
  ].slice(0, 5);

  // Permission visibility
  const canSeeHmp = sectionVisible("plant_shift_logs") || sectionVisible("plant_heating") || sectionVisible("plant_production");
  const canSeeEquipment = sectionVisible("plant_equipment");
  const canSeeRmc = rmcEnabled && sectionVisible("plant_production");
  const canSeeReports = sectionVisible("plant_daily_reports") || sectionVisible("reports") || sectionVisible("admin_settings");
  const canSeeSite = sectionVisible("site_dprs") || sectionVisible("site_materials") || sectionVisible("site_procurement") || sectionVisible("site_diesel");
  const canSeeStores = sectionVisible("stores_inventory");
  const canSeeFinance = sectionVisible("site_procurement") || sectionVisible("site_diesel") || sectionVisible("vendor_bills") || sectionVisible("admin_settings");

  function canSeeSection(id: string) {
    switch (id) {
      case "site":      return canSeeSite;
      case "hmp":       return canSeeHmp;
      case "rmc":       return canSeeRmc;
      case "equipment": return canSeeEquipment;
      case "stores":    return canSeeStores;
      case "finance":   return canSeeFinance;
      case "reports":   return canSeeReports;
      case "masters":   return isAdmin;
      default:          return false;
    }
  }

  const visibleModules = MODULES.filter((m) => canSeeSection(m.id));

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

          {/* Right 1/3: Pending Actions */}
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
              {pendingActions.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-teal-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">All clear — nothing pending</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {pendingActions.map((p, i) => (
                    <div key={i} className="px-4 py-3.5 flex items-start gap-3" data-testid={`pending-action-${i}`}>
                      <div className={`w-7 h-7 rounded-lg ${p.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <p.icon className={`w-3.5 h-3.5 ${p.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 leading-snug truncate">{p.label}</p>
                        {p.sub && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug truncate">{p.sub}</p>}
                        <Link href={p.href}>
                          <a className="mt-1.5 text-[11px] font-medium text-orange-500 hover:text-orange-600 flex items-center gap-0.5">
                            Review <ArrowUpRight className="w-3 h-3" />
                          </a>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Module grid ── */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Access</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="home-modules-grid">
            {visibleModules.map((mod) => (
              <Link key={mod.id} href={mod.href}>
                <a
                  className={`group block bg-white rounded-xl border border-slate-200 ${mod.hoverBorder} shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer`}
                  data-testid={`card-${mod.id}`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mod.lightBg} ${mod.iconColor} group-hover:scale-110 transition-transform duration-200`}>
                        <mod.icon className="w-5 h-5" />
                      </div>
                      {mod.isAdmin && (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-slate-200 text-[10px]">Admin</Badge>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">{mod.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{mod.description}</p>
                  </div>
                  <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-400 group-hover:text-slate-700 transition-colors">
                    <span>Open</span>
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                </a>
              </Link>
            ))}
          </div>

          {visibleModules.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">No modules available. Contact an administrator.</p>
            </div>
          )}
        </div>
      </div>
    </HubShell>
  );
}
