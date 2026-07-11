import { useState } from "react";
import {
  ClipboardList, Camera, Package, ShoppingCart, ChevronRight,
  CheckCircle2, Clock, AlertCircle, HardHat, Droplets, Truck,
  Wrench, Plus, Bell, User, Home, FileText, BarChart2, Menu,
  MapPin, Wifi, Battery, Signal, ArrowRight, Image, Thermometer
} from "lucide-react";

const SITE = "THAKADPALLY - SIRUR";
const ENGINEER = "Raju";
const TODAY = "Fri, 11 Jul 2026";

const recentDPRs = [
  { date: "Jul 10, Thu", site: "THAKADPALLY - SIRUR", status: "Submitted", activities: 3, equipment: 4 },
  { date: "Jul 9, Wed",  site: "THAKADPALLY - SIRUR", status: "Submitted", activities: 2, equipment: 3 },
  { date: "Jul 8, Tue",  site: "THAKADPALLY - SIRUR", status: "Submitted", activities: 4, equipment: 5 },
];

const todayStats = [
  { label: "Activities", value: "3",  icon: ClipboardList, color: "text-orange-400", bg: "bg-orange-400/10" },
  { label: "Equipment",  value: "4",  icon: Wrench,        color: "text-blue-400",   bg: "bg-blue-400/10" },
  { label: "Mat. Trips", value: "2",  icon: Truck,         color: "text-green-400",  bg: "bg-green-400/10" },
  { label: "Photos",     value: "5",  icon: Image,         color: "text-purple-400", bg: "bg-purple-400/10" },
];

const quickActions = [
  { label: "Add Photo",      icon: Camera,      color: "bg-orange-500" },
  { label: "Material Trip",  icon: Truck,       color: "bg-blue-600"   },
  { label: "Purchase",       icon: ShoppingCart, color: "bg-green-600" },
  { label: "Water Tanker",   icon: Droplets,    color: "bg-cyan-600"   },
];

const activities = [
  { name: "WMM Laying", chainage: "1+200 to 1+450", qty: "250 m", unit: "RM" },
  { name: "GSB Compaction", chainage: "0+800 to 1+000", qty: "200 m", unit: "RM" },
  { name: "Drain Excavation", chainage: "1+450 to 1+600", qty: "150 m", unit: "RM" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "Submitted")
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/20">✓ Submitted</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">◐ Draft</span>;
}

export function SiteTeam() {
  const [activeTab, setActiveTab] = useState("home");
  const [dprStarted, setDprStarted] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-['Inter'] flex flex-col max-w-[430px] mx-auto relative overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950 text-xs text-slate-400">
        <span className="font-semibold">9:41</span>
        <div className="flex items-center gap-1.5">
          <Signal className="w-3 h-3" /><Wifi className="w-3 h-3" /><Battery className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Top header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-b border-slate-700/50 px-4 pt-2 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center font-bold text-sm">R</div>
            <div>
              <p className="text-xs text-slate-400">Good morning,</p>
              <p className="text-sm font-bold text-white leading-tight">{ENGINEER} <span className="text-orange-400">· Supervisor</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">
              <Bell className="w-4 h-4 text-slate-300" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange-500 rounded-full text-[10px] font-bold flex items-center justify-center">2</span>
            </button>
            <button className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">
              <Menu className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Site chip */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-4">
          <MapPin className="w-3 h-3 text-orange-400" />
          <span className="font-medium text-slate-300">{SITE}</span>
          <span className="mx-1 text-slate-600">·</span>
          <span>{TODAY}</span>
        </div>

        {/* Primary DPR CTA */}
        {!dprStarted ? (
          <button
            onClick={() => setDprStarted(true)}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-lg flex items-center justify-center gap-3 shadow-lg shadow-orange-500/30 active:scale-95 transition-transform"
          >
            <ClipboardList className="w-6 h-6" />
            Start Today's DPR
            <ArrowRight className="w-5 h-5" />
          </button>
        ) : (
          <div className="space-y-2">
            <button className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-lg flex items-center justify-center gap-3 shadow-lg shadow-orange-500/30">
              <ClipboardList className="w-6 h-6" />
              Continue DPR — 40% done
            </button>
            <button className="w-full py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium flex items-center justify-center gap-2">
              Preview &amp; Submit
            </button>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-20 space-y-4 px-4 pt-4">

        {/* Today's stats */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Today's Progress</p>
          <div className="grid grid-cols-4 gap-2">
            {todayStats.map((s) => (
              <div key={s.label} className={`rounded-xl p-2.5 flex flex-col items-center gap-1.5 ${s.bg} border border-white/5`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <span className={`text-xl font-black ${s.color}`}>{s.value}</span>
                <span className="text-[10px] text-slate-400 text-center leading-tight">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Quick Add</p>
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((a) => (
              <button key={a.label} className="flex flex-col items-center gap-2 p-2">
                <div className={`w-12 h-12 rounded-2xl ${a.color} flex items-center justify-center shadow-lg`}>
                  <a.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-[10px] text-slate-400 text-center leading-tight">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Today's activities */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today's Activities</p>
            <button className="text-orange-400 text-xs font-semibold flex items-center gap-1">Add <Plus className="w-3 h-3" /></button>
          </div>
          <div className="space-y-2">
            {activities.map((a, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <HardHat className="w-4 h-4 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{a.name}</p>
                  <p className="text-xs text-slate-400 truncate">Ch. {a.chainage} · {a.qty} {a.unit}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
              </div>
            ))}
            <button className="w-full py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 text-sm flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Add Activity
            </button>
          </div>
        </div>

        {/* Recent DPRs */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Reports</p>
            <button className="text-orange-400 text-xs font-semibold">View All</button>
          </div>
          <div className="space-y-2">
            {recentDPRs.map((d, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{d.date}</p>
                  <p className="text-xs text-slate-400">{d.activities} activities · {d.equipment} equip.</p>
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-slate-900 border-t border-slate-700/50 flex items-center justify-around px-2 py-2 z-50">
        {[
          { label: "Home",    icon: Home,        tab: "home"    },
          { label: "Reports", icon: FileText,     tab: "reports" },
          { label: "New DPR", icon: Plus,         tab: "new",    primary: true },
          { label: "Stats",   icon: BarChart2,    tab: "stats"   },
          { label: "Profile", icon: User,         tab: "profile" },
        ].map((n) => (
          <button
            key={n.tab}
            onClick={() => setActiveTab(n.tab)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 ${n.primary ? "" : ""}`}
          >
            {n.primary ? (
              <div className="w-12 h-12 -mt-5 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/40">
                <n.icon className="w-6 h-6 text-white" />
              </div>
            ) : (
              <n.icon className={`w-5 h-5 ${activeTab === n.tab ? "text-orange-400" : "text-slate-500"}`} />
            )}
            {!n.primary && <span className={`text-[10px] ${activeTab === n.tab ? "text-orange-400 font-semibold" : "text-slate-500"}`}>{n.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
