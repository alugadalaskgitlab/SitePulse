import { useState } from "react";
import {
  LayoutDashboard, HardHat, Factory, Building2, Wrench, Package,
  Receipt, BarChart2, Settings, Calculator, TrendingUp, LogOut,
  CheckCircle2, Clock, AlertTriangle, ChevronRight, RefreshCw,
  Bell, Truck, FileText, Fuel, ShoppingCart, ClipboardList,
  ArrowUpRight, Activity, Users,
} from "lucide-react";

const DOMAIN = ""; // mockup — no real data

const TODAY = "Sunday, 31 May 2026";
const USER = { name: "Sunil Kumar", initials: "SK", role: "Admin" };

const STATS = [
  {
    label: "DPRs Filed Today",
    value: "2 / 3",
    sub: "1 site pending",
    icon: FileText,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    alert: true,
  },
  {
    label: "HMP Production",
    value: "487 MT",
    sub: "shift in progress",
    icon: Factory,
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
    alert: false,
  },
  {
    label: "Pending Approvals",
    value: "3",
    sub: "diesel + indent",
    icon: ClipboardList,
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-200",
    alert: true,
  },
  {
    label: "Dispatches Today",
    value: "12",
    sub: "2,180 MT total",
    icon: Truck,
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-200",
    alert: false,
  },
];

const SITE_STATUS = [
  { site: "NH-48 Pkg 3 — Ch 14+200", dprFiled: true, filedBy: "Ramesh P.", time: "08:42 AM", materials: 4, equipment: 6 },
  { site: "NH-48 Pkg 3 — Ch 18+500", dprFiled: true, filedBy: "Arjun S.", time: "09:15 AM", materials: 2, equipment: 4 },
  { site: "SH-12 Bypass — Sec A",    dprFiled: false, filedBy: null, time: null, materials: 0, equipment: 0 },
];

const PENDING_ACTIONS = [
  { type: "approval", label: "Daily Diesel Requirement", sub: "NH-48 Pkg 3 · 1,200 L · Ramesh P.", icon: Fuel, color: "text-amber-600", bg: "bg-amber-50", urgent: true },
  { type: "approval", label: "Purchase Indent #PI-2026-041", sub: "Bitumen 60/70 · 5 MT · ₹2.8L", icon: ShoppingCart, color: "text-rose-600", bg: "bg-rose-50", urgent: true },
  { type: "approval", label: "Daily Diesel Requirement", sub: "SH-12 Bypass · 800 L · Arjun S.", icon: Fuel, color: "text-amber-600", bg: "bg-amber-50", urgent: false },
];

const RECENT = [
  { time: "09:41 AM", who: "Arjun S.", action: "Filed DPR", detail: "NH-48 Ch 18+500", icon: FileText, color: "text-teal-600" },
  { time: "09:15 AM", who: "Plant Ops", action: "HMP Shift started", detail: "Day shift · Rajesh K.", icon: Factory, color: "text-orange-600" },
  { time: "08:42 AM", who: "Ramesh P.", action: "Filed DPR", detail: "NH-48 Ch 14+200", icon: FileText, color: "text-teal-600" },
  { time: "08:30 AM", who: "Store", action: "GRN created", detail: "Aggregate 20mm · 42 MT", icon: Package, color: "text-blue-600" },
  { time: "Yesterday", who: "Finance", action: "Vendor bill added", detail: "M/s Prakash Transport", icon: Receipt, color: "text-purple-600" },
];

const NAV = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard", active: true },
  { href: "/site/hub", icon: HardHat, label: "Site Operations" },
  { href: "/plant/hub", icon: Factory, label: "HMP Plant" },
  { href: "/rmc/hub", icon: Building2, label: "RMC" },
  { href: "/equipment/hub", icon: Wrench, label: "Equipment" },
  { href: "/stores/hub", icon: Package, label: "Stores" },
  { href: "/finance/hub", icon: Receipt, label: "Finance" },
  { href: "/reports/hub", icon: BarChart2, label: "Reports" },
];

const BOTTOM_NAV = [
  { href: "/estimator-login", icon: Calculator, label: "Estimator" },
  { href: "/admin/hub", icon: Settings, label: "Settings" },
];

export function HomeDashboard() {
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900">

      {/* ── Sidebar ── */}
      <aside className="w-56 bg-slate-900 flex-shrink-0 flex flex-col border-r border-slate-800">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-base tracking-tight">SiteLog</span>
              <p className="text-[10px] text-slate-500 leading-none mt-0.5">High Lane Constructions</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 flex flex-col overflow-y-auto">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-3 py-2">Navigation</p>
          {NAV.map((item) => (
            <a key={item.href} href="#" onClick={e => e.preventDefault()}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                item.active
                  ? "bg-orange-500/15 text-orange-300 border border-orange-500/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </a>
          ))}

          <div className="flex-1" />

          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-3 py-2 mt-2">Tools</p>
          {BOTTOM_NAV.map((item) => (
            <a key={item.href} href="#" onClick={e => e.preventDefault()}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </a>
          ))}
        </nav>

        {/* User chip */}
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center font-bold text-xs text-white">
              {USER.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-snug">{USER.name}</p>
              <p className="text-[11px] text-slate-400">{USER.role}</p>
            </div>
            <button className="p-1.5 hover:bg-slate-800 rounded-md text-slate-500 hover:text-red-400">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">

        {/* Top header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-3 sticky top-0 z-20 shadow-sm">
          <div className="flex-1">
            <h1 className="text-base font-semibold text-slate-800">Home Dashboard</h1>
          </div>
          <button onClick={handleRefresh} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 space-y-6 overflow-auto">

          {/* Welcome */}
          <div>
            <h2 className="text-xl font-bold text-slate-900">Welcome back, Sunil</h2>
            <p className="text-sm text-slate-600 mt-0.5">High Lane Constructions Pvt Ltd · {TODAY}</p>
          </div>

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-4 gap-4">
            {STATS.map((s) => (
              <div key={s.label} className={`bg-white rounded-xl border ${s.border} p-4 flex flex-col gap-3 relative overflow-hidden`}>
                {s.alert && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-rose-500" />
                )}
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 leading-none">{s.value}</p>
                  <p className="text-xs text-slate-700 mt-1 font-medium">{s.label}</p>
                  <p className={`text-[11px] mt-0.5 font-medium ${s.alert ? "text-rose-500" : "text-slate-600"}`}>{s.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Two-column ── */}
          <div className="grid grid-cols-3 gap-4">

            {/* Left: Today's Site Status */}
            <div className="col-span-2 space-y-4">

              {/* Site DPR status */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-800">Today's Site DPR Status</h3>
                  </div>
                  <span className="text-xs text-slate-600">3 active sites</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {SITE_STATUS.map((s) => (
                    <div key={s.site} className="flex items-center gap-4 px-5 py-3.5">
                      {s.dprFiled
                        ? <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0" />
                        : <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{s.site}</p>
                        {s.dprFiled
                          ? <p className="text-xs text-slate-600 mt-0.5">Filed by {s.filedBy} at {s.time} · {s.materials} materials · {s.equipment} equipment</p>
                          : <p className="text-xs text-amber-500 font-medium mt-0.5">DPR not yet filed</p>
                        }
                      </div>
                      {s.dprFiled
                        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-medium flex-shrink-0">Filed</span>
                        : <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium flex-shrink-0">Pending</span>
                      }
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-800">Recent Activity</h3>
                  </div>
                  <a href="#" onClick={e => e.preventDefault()} className="text-xs text-orange-500 hover:text-orange-600 font-medium flex items-center gap-0.5">
                    View all <ChevronRight className="w-3 h-3" />
                  </a>
                </div>
                <div className="divide-y divide-slate-50">
                  {RECENT.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 px-5 py-3">
                      <div className={`w-7 h-7 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <r.icon className={`w-3.5 h-3.5 ${r.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">{r.who}</span>
                          {" "}<span className="text-slate-700">{r.action}</span>
                          {" — "}<span className="text-slate-700">{r.detail}</span>
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-600 flex-shrink-0 mt-0.5">{r.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Pending Actions */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <h3 className="text-sm font-semibold text-slate-800">Pending Actions</h3>
                  </div>
                  <span className="text-xs bg-rose-100 text-rose-600 font-semibold px-1.5 py-0.5 rounded-full">{PENDING_ACTIONS.length}</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {PENDING_ACTIONS.map((p, i) => (
                    <div key={i} className="px-4 py-3.5 flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-lg ${p.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <p.icon className={`w-3.5 h-3.5 ${p.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-slate-800 leading-snug truncate">{p.label}</p>
                          {p.urgent && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{p.sub}</p>
                        <button className="mt-2 text-[11px] font-medium text-orange-500 hover:text-orange-600 flex items-center gap-0.5">
                          Review <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick stats */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-800">Today's Team</h3>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    { label: "Engineers on site", value: "4", color: "text-teal-600" },
                    { label: "Plant operators", value: "6", color: "text-orange-600" },
                    { label: "Labour (HMP)", value: "18", color: "text-slate-700" },
                    { label: "Vehicles active", value: "12", color: "text-blue-600" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-700">{item.label}</span>
                      <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
