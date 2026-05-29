import { useState } from "react";
import {
  HardHat, Factory, Package, BarChart3, Settings, Users, ShieldCheck,
  LogOut, ChevronRight, Clock, CheckCircle, AlertCircle, TrendingUp,
  Truck, Fuel, ClipboardList, Bell, Calendar, ArrowUpRight,
  Building2, FlaskConical, FileText, Layers, Sun, Activity,
  Wrench, TestTube
} from "lucide-react";

const PROJECT = {
  name: "NH-48 Road Widening — Package 3",
  client: "NHAI",
  day: 148,
  totalDays: 365,
  date: "Thursday, 29 May 2026",
};

const STATS = [
  { label: "Today's DPR", value: "Filed", sub: "8:14 AM", icon: CheckCircle, color: "text-green-400", bg: "bg-green-900/30 border-green-700/40" },
  { label: "HMP Production", value: "248 MT", sub: "12 dispatches", icon: Factory, color: "text-amber-400", bg: "bg-amber-900/30 border-amber-700/40" },
  { label: "RMC Dispatches", value: "164 CuM", sub: "8 trips", icon: Building2, color: "text-teal-400", bg: "bg-teal-900/30 border-teal-700/40" },
  { label: "Active Workforce", value: "34", sub: "3 contractors on site", icon: Users, color: "text-blue-400", bg: "bg-blue-900/30 border-blue-700/40" },
  { label: "Pending GRNs", value: "2", sub: "Awaiting approval", icon: Package, color: "text-orange-400", bg: "bg-orange-900/30 border-orange-700/40" },
  { label: "Open Indents", value: "5", sub: "₹2.4L pending", icon: ClipboardList, color: "text-violet-400", bg: "bg-violet-900/30 border-violet-700/40" },
];

const MODULES = [
  {
    id: "site",
    label: "Site Operations",
    icon: HardHat,
    href: "/site",
    accent: "from-amber-600 to-amber-500",
    borderHover: "hover:border-amber-400/60",
    iconBg: "bg-amber-500/20",
    iconColor: "text-amber-400",
    description: "Daily progress reports, labour, equipment & material tracking",
    tiles: [
      { icon: FileText, label: "New DPR", badge: "Today unfiled" },
      { icon: Truck, label: "Dispatches", badge: "48 this month" },
      { icon: Fuel, label: "Diesel", badge: "2 pending" },
    ],
    status: { ok: true, text: "DPR filed at 8:14 AM" },
  },
  {
    id: "plant",
    label: "Plant Module",
    icon: Factory,
    href: "/plant",
    accent: "from-violet-600 to-violet-500",
    borderHover: "hover:border-violet-400/60",
    iconBg: "bg-violet-500/20",
    iconColor: "text-violet-400",
    description: "HMP & RMC operations, heating, dispatches and plant management",
    tiles: [
      { icon: Factory, label: "HMP Ops", badge: "Shift active" },
      { icon: Building2, label: "RMC Ops", badge: "8 dispatches" },
      { icon: BarChart3, label: "Management", badge: "Reports" },
    ],
    status: { ok: true, text: "Boiler running · 248 MT produced" },
  },
  {
    id: "stores",
    label: "Stores & Inventory",
    icon: Package,
    href: "/stores",
    accent: "from-orange-600 to-orange-500",
    borderHover: "hover:border-orange-400/60",
    iconBg: "bg-orange-500/20",
    iconColor: "text-orange-400",
    description: "GRN receipts, stock levels, issue tracking and item master",
    tiles: [
      { icon: Package, label: "GRN Entry", badge: "2 pending" },
      { icon: Layers, label: "Stock Ledger", badge: "46 items" },
      { icon: Wrench, label: "Item Master", badge: "" },
    ],
    status: { ok: false, text: "2 GRNs awaiting approval" },
  },
];

const ACTIVITY = [
  { icon: CheckCircle, color: "text-green-400", time: "08:14", label: "DPR submitted", sub: "Day 148 · Road work" },
  { icon: Truck, color: "text-amber-400", time: "07:55", label: "HMP dispatch #12", sub: "BC-40 · 20 MT · Truck KA-01-AB-1234" },
  { icon: Building2, color: "text-teal-400", time: "07:32", label: "RMC dispatch #8", sub: "M30 · 7.5 CuM · NH-48 Bridge" },
  { icon: Package, color: "text-orange-400", time: "Yesterday", label: "GRN raised", sub: "Cement 40T · Raj Agencies" },
  { icon: AlertCircle, color: "text-red-400", time: "Yesterday", label: "Low stock alert", sub: "Bitumen VG-30 — 2.1 MT remaining" },
  { icon: FlaskConical, color: "text-blue-400", time: "27 May", label: "Cube test result", sub: "M30 sample — 32.4 MPa · Pass" },
  { icon: TestTube, color: "text-violet-400", time: "27 May", label: "Indent approved", sub: "PI-2026-041 · ₹84,000" },
];

export function AppHome() {
  const [hovered, setHovered] = useState<string | null>(null);
  const pct = Math.round((PROJECT.day / PROJECT.totalDays) * 100);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-white">

      {/* ── Top Nav ── */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center shadow">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-base tracking-tight">SiteLog</span>
          <span className="text-slate-600 text-sm">|</span>
          <span className="text-slate-400 text-xs">High Lane Constructions Pvt Ltd</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button className="relative p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <Bell className="w-4 h-4 text-slate-400" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
          </button>
          <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors">
            <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center font-bold text-xs">SK</div>
            <div className="text-left">
              <p className="text-xs font-semibold leading-none">Site Engineer</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Admin</p>
            </div>
          </button>
          <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-slate-300">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── Project Banner ── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">Active Project</span>
              <span className="text-[10px] text-slate-500">{PROJECT.client}</span>
            </div>
            <h1 className="text-lg font-bold text-white">{PROJECT.name}</h1>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
              <Calendar className="w-3 h-3" /> {PROJECT.date}
              <span className="text-slate-600">·</span>
              <Activity className="w-3 h-3" /> Day {PROJECT.day} of {PROJECT.totalDays}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-slate-400 mb-1">Project Progress</p>
            <div className="flex items-center gap-2">
              <div className="w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-bold text-amber-400">{pct}%</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{PROJECT.totalDays - PROJECT.day} days remaining</p>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-5 flex gap-5">

        {/* ── Left: Stats + Modules ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Stat Strip */}
          <div className="grid grid-cols-6 gap-2">
            {STATS.map(({ label, value, sub, icon: Icon, color, bg }) => (
              <div key={label} className={`rounded-xl border ${bg} p-3 text-center`}>
                <Icon className={`w-4 h-4 ${color} mx-auto mb-1.5`} />
                <p className={`text-sm font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{label}</p>
                <p className="text-[10px] text-slate-500">{sub}</p>
              </div>
            ))}
          </div>

          {/* Module Cards */}
          <div className="grid grid-cols-3 gap-4">
            {MODULES.map((mod) => (
              <button
                key={mod.id}
                className={`text-left bg-slate-900 border border-slate-800 ${mod.borderHover} rounded-2xl overflow-hidden transition-all hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5`}
                onMouseEnter={() => setHovered(mod.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Card header */}
                <div className={`bg-gradient-to-br ${mod.accent} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-9 h-9 ${mod.iconBg} rounded-xl flex items-center justify-center border border-white/20`}>
                      <mod.icon className="w-5 h-5 text-white" />
                    </div>
                    <ArrowUpRight className={`w-4 h-4 text-white/60 transition-transform ${hovered === mod.id ? "translate-x-0.5 -translate-y-0.5" : ""}`} />
                  </div>
                  <h2 className="font-bold text-base text-white">{mod.label}</h2>
                  <p className="text-xs text-white/70 mt-0.5 leading-tight">{mod.description}</p>
                </div>

                {/* Quick tiles */}
                <div className="p-3 grid grid-cols-3 gap-1.5">
                  {mod.tiles.map(({ icon: TIcon, label, badge }) => (
                    <div key={label} className="bg-slate-800 hover:bg-slate-700 rounded-lg p-2 transition-colors text-center">
                      <TIcon className={`w-4 h-4 ${mod.iconColor} mx-auto mb-1`} />
                      <p className="text-[10px] font-medium text-slate-300 leading-tight">{label}</p>
                      {badge && <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">{badge}</p>}
                    </div>
                  ))}
                </div>

                {/* Status footer */}
                <div className={`px-3 pb-3`}>
                  <div className={`flex items-center gap-1.5 text-[10px] ${mod.status.ok ? "text-green-400" : "text-amber-400"}`}>
                    {mod.status.ok
                      ? <CheckCircle className="w-3 h-3 shrink-0" />
                      : <AlertCircle className="w-3 h-3 shrink-0" />}
                    {mod.status.text}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Admin Tools Row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mr-1">Admin</span>
            {[
              { icon: BarChart3, label: "Estimate Manager", accent: "hover:border-blue-700/50 hover:text-blue-400" },
              { icon: Settings, label: "Settings", accent: "hover:border-slate-600 hover:text-slate-300" },
              { icon: Users, label: "User Management", accent: "hover:border-slate-600 hover:text-slate-300" },
              { icon: ShieldCheck, label: "Device Approval", accent: "hover:border-slate-600 hover:text-slate-300" },
            ].map(({ icon: Icon, label, accent }) => (
              <button key={label} className={`flex items-center gap-1.5 text-xs text-slate-500 border border-slate-800 ${accent} rounded-lg px-3 py-1.5 transition-colors`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: Activity Feed ── */}
        <div className="w-64 shrink-0 flex flex-col gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl flex-1 overflow-hidden flex flex-col">
            <div className="px-4 pt-4 pb-3 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" /> Recent Activity
                </h3>
                <button className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-0.5">
                  All <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
              {ACTIVITY.map((item, i) => (
                <div key={i} className="flex gap-2.5 px-3 py-2.5 hover:bg-slate-800/40 transition-colors">
                  <item.icon className={`w-3.5 h-3.5 ${item.color} mt-0.5 shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-300 leading-snug">{item.label}</p>
                    <p className="text-[10px] text-slate-500 leading-snug mt-0.5">{item.sub}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />{item.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick date */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
            <Sun className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-xs font-semibold text-slate-300">Day {PROJECT.day} / {PROJECT.totalDays}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{PROJECT.totalDays - PROJECT.day} days to completion</p>
            <div className="mt-2.5 w-full h-1 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
