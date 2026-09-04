import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { roadDprHref } from "@/lib/dprEntryMode";
import {
  FileText, Package, ShoppingCart, Fuel,
  Plus, ChevronRight, Clock, CheckCircle,
  AlertCircle, Calendar, TrendingUp,
  Route, Building2, CalendarPlus, AlertTriangle,
} from "lucide-react";

const TODAY = format(new Date(), "yyyy-MM-dd");
const DATE_FROM = format(subDays(new Date(), 30), "yyyy-MM-dd");

type ActivityItem = {
  key: string;
  type: "DPR" | "IND" | "DSL";
  label: string;
  sub: string;
  date: string;
  status: string;
  href: string;
};

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle; label: string }> = {
  submitted: { color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950", icon: CheckCircle, label: "Submitted" },
  approved:  { color: "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950", icon: CheckCircle, label: "Approved" },
  pending:   { color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950", icon: AlertCircle, label: "Pending" },
  rejected:  { color: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950", icon: AlertCircle, label: "Rejected" },
  purchased: { color: "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950", icon: CheckCircle, label: "Purchased" },
  completed: { color: "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950", icon: CheckCircle, label: "Completed" },
};

function getStatus(s: string) {
  return STATUS_CONFIG[s] ?? STATUS_CONFIG["pending"];
}

export default function SiteHome() {
  const { sectionVisible } = useAuth();
  const canDprs       = sectionVisible("site_dprs");
  const canMaterials  = sectionVisible("site_materials");
  const canProcure    = sectionVisible("site_procurement") || sectionVisible("purchase_indents_view") || sectionVisible("purchase_indents_raise") || sectionVisible("purchase_indents_approve");
  const canDiesel     = sectionVisible("site_diesel") || sectionVisible("diesel_req_view") || sectionVisible("diesel_req_raise") || sectionVisible("diesel_req_approve");

  // Recent DPRs
  const { data: dprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details", DATE_FROM],
    queryFn: async () => {
      const res = await fetch(`/api/dprs/with-details?dateFrom=${DATE_FROM}&dateTo=${TODAY}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: canDprs,
  });

  // Recent purchase indents
  const { data: indents = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-indents", DATE_FROM],
    queryFn: async () => {
      const res = await fetch(`/api/purchase-indents?dateFrom=${DATE_FROM}&dateTo=${TODAY}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: canProcure,
  });

  // Recent diesel requirements
  const { data: dieselReqs = [] } = useQuery<any[]>({
    queryKey: ["/api/diesel-requirements", DATE_FROM],
    queryFn: async () => {
      const res = await fetch(`/api/diesel-requirements?dateFrom=${DATE_FROM}&dateTo=${TODAY}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: canDiesel,
  });

  const todayDpr = useMemo(() => dprs.find((d: any) => d.date === TODAY), [dprs]);

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    dprs.slice(0, 5).forEach((d: any) => items.push({
      key: `dpr-${d.id}`,
      type: "DPR",
      label: "Daily Progress Report",
      sub: `${d.site ?? "Site"} · DPR #${d.id}`,
      date: d.date,
      status: "submitted",
      href: `/site/report/${d.id}`,
    }));
    indents.slice(0, 5).forEach((i: any) => items.push({
      key: `ind-${i.id}`,
      type: "IND",
      label: "Purchase Indent",
      sub: `${i.indentNo ?? `PI-${i.id}`}`,
      date: i.date,
      status: i.status ?? "pending",
      href: "/plant/purchase-indents",
    }));
    dieselReqs.slice(0, 5).forEach((r: any) => items.push({
      key: `dsl-${r.id}`,
      type: "DSL",
      label: "Diesel Requirement",
      sub: `DR-${r.id}`,
      date: r.date,
      status: r.status ?? "pending",
      href: "/plant/diesel-requirements",
    }));
    return items
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [dprs, indents, dieselReqs]);

  return (
    <div className="space-y-5">
      {/* Project banner */}
      <div className="rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 text-white px-4 md:px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-[12px] text-slate-400 uppercase tracking-wider mb-0.5">Site Management</p>
          <h1 className="text-base font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            Daily Operations Dashboard
          </h1>
          <p className="text-sm text-slate-300 mt-0.5 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            {format(new Date(), "EEEE, d MMMM yyyy")}
          </p>
        </div>
        {canDprs && (
          <div className="text-right">
            <p className="text-[12px] text-slate-400">Today's DPR</p>
            <div className="flex items-center gap-1.5 mt-1">
              {todayDpr ? (
                <>
                  <span className="w-2 h-2 bg-green-400 rounded-full" />
                  <span className="text-sm font-semibold text-green-300">Filed</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  <span className="text-sm font-semibold text-amber-300">Pending</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5 max-w-5xl mx-auto w-full">

        {/* Quick Actions */}
        <section>
          <h2 className="text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

            {canDprs && (
              <Link href={roadDprHref("/site")} data-testid="link-new-dpr-road">
                <button className="group w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-amber-400 hover:shadow-md transition-all cursor-pointer">
                  <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/40 rounded-lg flex items-center justify-center group-hover:bg-amber-200 dark:group-hover:bg-amber-900/70 transition-colors">
                    <Route className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Road DPR</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Guided or detailed entry</p>
                  </div>
                  <div className="w-full flex items-center justify-between mt-auto">
                    <span className="text-[12px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                      {todayDpr ? "Update" : "Today"}
                    </span>
                    <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-500 transition-colors" />
                  </div>
                </button>
              </Link>
            )}

            {canDprs && (
              <Link href="/site/new?type=structure&returnTo=/site" data-testid="link-new-dpr-structure">
                <button className="group w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-sky-400 hover:shadow-md transition-all cursor-pointer">
                  <div className="w-9 h-9 bg-sky-100 dark:bg-sky-900/40 rounded-lg flex items-center justify-center group-hover:bg-sky-200 dark:group-hover:bg-sky-900/70 transition-colors">
                    <Building2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Structure DPR</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Bridges, culverts &amp; more</p>
                  </div>
                  <div className="w-full flex items-center justify-between mt-auto">
                    <span className="text-[12px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 px-2 py-0.5 rounded-full">Today</span>
                    <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-500 transition-colors" />
                  </div>
                </button>
              </Link>
            )}

            {canMaterials && (
              <Link href="/site/material-trips?returnTo=/site" data-testid="link-material-receipt">
                <button className="group w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer">
                  <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/70 transition-colors">
                    <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Material Entry</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Log incoming materials</p>
                  </div>
                  <div className="w-full flex items-center justify-between mt-auto">
                    <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">Quick entry</span>
                    <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  </div>
                </button>
              </Link>
            )}

            {canProcure && (
              <Link href="/plant/purchase-indents?returnTo=/site&from=site" data-testid="link-purchase-indent">
                <button className="group w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-violet-400 hover:shadow-md transition-all cursor-pointer">
                  <div className="w-9 h-9 bg-violet-100 dark:bg-violet-900/40 rounded-lg flex items-center justify-center group-hover:bg-violet-200 dark:group-hover:bg-violet-900/70 transition-colors">
                    <ShoppingCart className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Purchase Indent</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Raise a new indent</p>
                  </div>
                  <div className="w-full flex items-center justify-between mt-auto">
                    <span className="text-[12px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 rounded-full">
                      {indents.filter((i: any) => i.status === "pending" || i.status === "stores_check").length > 0
                        ? `${indents.filter((i: any) => i.status === "pending" || i.status === "stores_check").length} pending`
                        : "Open"}
                    </span>
                    <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-500 transition-colors" />
                  </div>
                </button>
              </Link>
            )}

            {canDiesel && (
              <Link href="/plant/diesel-requirements?returnTo=/site" data-testid="link-diesel-requirement">
                <button className="group w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer">
                  <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-900/70 transition-colors">
                    <Fuel className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Diesel Req.</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Daily diesel order</p>
                  </div>
                  <div className="w-full flex items-center justify-between mt-auto">
                    <span className="text-[12px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                      {dieselReqs.find((r: any) => r.date === TODAY && r.status === "approved") ? "Filed ✓" : "Open"}
                    </span>
                    <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                </button>
              </Link>
            )}

            {canDprs && (
              <Link href="/site/requirements/new?returnTo=/site" data-testid="link-tomorrow-requirement">
                <button className="group w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-teal-400 hover:shadow-md transition-all cursor-pointer">
                  <div className="w-9 h-9 bg-teal-100 dark:bg-teal-900/40 rounded-lg flex items-center justify-center group-hover:bg-teal-200 dark:group-hover:bg-teal-900/70 transition-colors">
                    <CalendarPlus className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Tomorrow's Plan</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Materials, equipment & labour</p>
                  </div>
                  <div className="w-full flex items-center justify-between mt-auto">
                    <span className="text-[12px] font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">Raise</span>
                    <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-500 transition-colors" />
                  </div>
                </button>
              </Link>
            )}

            {canDprs && (
              <Link href="/site/requirements/new?mode=immediate&returnTo=/site" data-testid="link-immediate-requirement">
                <button className="group w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-red-400 hover:shadow-md transition-all cursor-pointer">
                  <div className="w-9 h-9 bg-red-100 dark:bg-red-900/40 rounded-lg flex items-center justify-center group-hover:bg-red-200 dark:group-hover:bg-red-900/70 transition-colors">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Immediate Requirement</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Urgent site need right now</p>
                  </div>
                  <div className="w-full flex items-center justify-between mt-auto">
                    <span className="text-[12px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">Raise</span>
                    <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-500 transition-colors" />
                  </div>
                </button>
              </Link>
            )}

            {!canDprs && !canMaterials && !canProcure && !canDiesel && (
              <div className="col-span-4 text-center text-sm text-muted-foreground py-6" data-testid="text-no-site-access">
                You don't have access to site modules.
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Recent Activity */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Recent Activity</h2>
              {canDprs && (
                <Link href="/site/dashboard" data-testid="link-all-records">
                  <button className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 font-semibold hover:underline">
                    All DPRs <ChevronRight className="w-3 h-3" />
                  </button>
                </Link>
              )}
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              {recentActivity.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400" data-testid="text-no-activity">
                  No recent activity in the last 30 days.
                </div>
              ) : (
                recentActivity.map((item, i) => {
                  const { color, icon: Icon, label } = getStatus(item.status);
                  return (
                    <Link href={item.href} key={item.key} data-testid={`link-activity-${item.key}`}>
                      <div className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors ${i < recentActivity.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}`}>
                        <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-[12px] font-black text-slate-600 dark:text-slate-300">{item.type}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.label}</p>
                          <p className="text-sm text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{format(new Date(item.date + "T00:00:00"), "dd MMM yyyy")} · {item.sub}</span>
                          </p>
                        </div>
                        <span className={`flex items-center gap-1 text-[12px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${color}`}>
                          <Icon className="w-3 h-3" /> {label}
                        </span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Reports Panel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Reports</h2>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              {[
                canDprs     && { label: "DPR History",        icon: FileText,     desc: "View & edit daily reports",  color: "text-amber-500",   href: "/site/dashboard" },
                canMaterials && { label: "Materials Received", icon: Package,      desc: "All material trips report",  color: "text-emerald-500", href: "/site/materials-received?returnTo=/site" },
                canDiesel   && { label: "Diesel Report",       icon: Fuel,         desc: "Usage vs planned",           color: "text-blue-500",    href: "/plant/diesel-requirements?returnTo=/site" },
                canProcure  && { label: "Purchase Indents",    icon: ShoppingCart, desc: "Indents & approvals",        color: "text-violet-500",  href: "/plant/purchase-indents?returnTo=/site" },
                canProcure  && { label: "Site Purchases",      icon: TrendingUp,   desc: "Purchases & expenses",       color: "text-rose-500",    href: "/site/purchases?returnTo=/site" },
              ].filter(Boolean).map((r: any, i, arr) => (
                <Link href={r.href} key={r.label} data-testid={`link-report-${r.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <button className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors text-left ${i < arr.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}`}>
                    <r.icon className={`w-4 h-4 ${r.color} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{r.label}</p>
                      <p className="text-sm text-slate-400">{r.desc}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                  </button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
