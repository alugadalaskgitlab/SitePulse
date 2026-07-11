import { useState } from "react";
import {
  LayoutDashboard, MapPin, ClipboardList, CheckCircle2, AlertTriangle,
  Clock, TrendingUp, TrendingDown, ChevronRight, Bell, Users,
  Fuel, Package, FileText, DollarSign, Activity, BarChart2,
  Truck, Wrench, Home, Settings, User, Filter, Download,
  ShieldCheck, HardHat, Factory, Building2, ArrowUpRight,
  Battery, Wifi, Signal, RefreshCw, Eye, Zap
} from "lucide-react";

const MANAGER = "Sunil Kumar";
const TODAY = "Fri, 11 Jul 2026";

const sites = [
  { name: "THAKADPALLY - SIRUR", dpr: "Submitted",  engineer: "Raju",    activities: 3, lastUpdate: "2h ago",  color: "border-green-500/30",  dot: "bg-green-400"  },
  { name: "NH-167 BYPASS",       dpr: "In Progress", engineer: "Naveen",  activities: 2, lastUpdate: "45m ago", color: "border-amber-500/30",  dot: "bg-amber-400 animate-pulse"  },
  { name: "DTPL-BASAVAKALYAN",   dpr: "Not Started", engineer: "Krishna", activities: 0, lastUpdate: "—",       color: "border-red-500/30",    dot: "bg-red-400 animate-pulse"    },
  { name: "FDR KK ROAD",         dpr: "Submitted",   engineer: "Ramesh",  activities: 4, lastUpdate: "3h ago",  color: "border-green-500/30",  dot: "bg-green-400"  },
];

const approvalQueue = [
  { type: "Purchase Indent",  ref: "PI-2026-0124", site: "NH-167 BYPASS",       amount: "₹42,500", urgent: true,  action: "Approve" },
  { type: "Diesel Requisition", ref: "DR-2026-0089", site: "THAKADPALLY - SIRUR", amount: "₹8,200",  urgent: false, action: "Approve" },
  { type: "Edit Request",     ref: "DPR #219",     site: "THAKADPALLY - SIRUR", amount: "—",        urgent: false, action: "Review"  },
  { type: "Vendor Bill",      ref: "VB-2026-0041", site: "FDR KK ROAD",         amount: "₹1,28,000",urgent: true,  action: "Approve" },
];

const kpiCards = [
  { label: "Active Sites",    value: "4",    sub: "2 DPRs pending",    icon: MapPin,      color: "text-blue-400",   bg: "bg-blue-400/10",   trend: null       },
  { label: "Today's Prod.",   value: "847 MT", sub: "+12% vs yesterday", icon: TrendingUp,  color: "text-green-400",  bg: "bg-green-400/10",  trend: "up"       },
  { label: "Fleet Running",   value: "11/16", sub: "5 idle, 0 fault",   icon: Wrench,      color: "text-orange-400", bg: "bg-orange-400/10", trend: null       },
  { label: "Pending Bills",   value: "₹2.8L", sub: "3 bills awaiting",  icon: DollarSign,  color: "text-purple-400", bg: "bg-purple-400/10", trend: null       },
];

function DprDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    "Submitted":   "bg-green-400",
    "In Progress": "bg-amber-400 animate-pulse",
    "Not Started": "bg-red-400 animate-pulse",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] ?? "bg-slate-500"}`} />;
}

function ApprovalTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    "Purchase Indent":   "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "Diesel Requisition": "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "Edit Request":      "bg-slate-500/10 text-slate-400 border-slate-500/20",
    "Vendor Bill":       "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${map[type] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
      {type === "Purchase Indent" ? "PI" : type === "Diesel Requisition" ? "DR" : type === "Edit Request" ? "Edit" : "Bill"}
    </span>
  );
}

export function Manager() {
  const [activeTab, setActiveTab] = useState("home");
  const [filterSite, setFilterSite] = useState("all");

  return (
    <div className="min-h-screen bg-gray-950 text-white font-['Inter'] flex flex-col max-w-[430px] mx-auto relative overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-950 text-xs text-gray-400">
        <span className="font-semibold">10:15</span>
        <div className="flex items-center gap-1.5">
          <Signal className="w-3 h-3" /><Wifi className="w-3 h-3" /><Battery className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-br from-gray-900 to-slate-900 border-b border-gray-700/50 px-4 pt-2 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center font-bold text-sm">SK</div>
            <div>
              <p className="text-xs text-gray-400">Site Manager</p>
              <p className="text-sm font-bold text-white leading-tight">{MANAGER} <span className="text-violet-400">· Admin</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-300">
              <RefreshCw className="w-3 h-3" /> Sync
            </button>
            <button className="relative w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
              <Bell className="w-4 h-4 text-gray-300" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center">4</span>
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-400 mb-4">
          <span className="text-gray-200 font-medium">All Sites Overview</span>
          <span className="mx-1.5 text-gray-600">·</span>
          <span>{TODAY}</span>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-2">
          {kpiCards.map((k) => (
            <div key={k.label} className={`rounded-xl p-3 ${k.bg} border border-white/5 flex items-start gap-2.5`}>
              <div className={`w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center flex-shrink-0`}>
                <k.icon className={`w-4 h-4 ${k.color}`} />
              </div>
              <div className="min-w-0">
                <p className={`text-base font-black ${k.color} leading-tight`}>{k.value}</p>
                <p className="text-[10px] text-gray-400 leading-tight">{k.label}</p>
                <p className={`text-[9px] leading-tight mt-0.5 ${k.trend === "up" ? "text-green-400" : "text-gray-500"}`}>{k.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-20 space-y-4 px-4 pt-4">

        {/* Approval Queue */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-violet-400" /> Approval Queue
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">{approvalQueue.length}</span>
            </p>
            <button className="text-violet-400 text-xs font-semibold">See All</button>
          </div>
          <div className="space-y-2">
            {approvalQueue.map((item, i) => (
              <div key={i} className={`rounded-xl px-4 py-3 border flex items-center gap-3 ${item.urgent ? "bg-red-500/5 border-red-500/20" : "bg-gray-800/60 border-gray-700/50"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <ApprovalTypeBadge type={item.type} />
                    <span className="text-xs font-mono text-gray-400">{item.ref}</span>
                    {item.urgent && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
                  </div>
                  <p className="text-sm font-semibold text-white truncate">{item.site}</p>
                  {item.amount !== "—" && <p className="text-xs text-gray-400 font-semibold">{item.amount}</p>}
                </div>
                <button className={`px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 ${item.urgent ? "bg-red-500 text-white" : "bg-violet-500/20 text-violet-400 border border-violet-500/30"}`}>
                  {item.action}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* All Sites DPR Status */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Site DPR Status</p>
            <button className="text-violet-400 text-xs font-semibold flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filter
            </button>
          </div>
          <div className="space-y-2">
            {sites.map((s, i) => (
              <div key={i} className={`bg-gray-800/60 border ${s.color} rounded-xl px-4 py-3 flex items-center gap-3`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <DprDot status={s.dpr} />
                    <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{s.engineer}</span>
                    {s.activities > 0 && <><span className="text-gray-600">·</span><span>{s.activities} activities</span></>}
                    {s.lastUpdate !== "—" && <><span className="text-gray-600">·</span><span className="text-gray-500">{s.lastUpdate}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    s.dpr === "Submitted" ? "text-green-400 bg-green-500/10" :
                    s.dpr === "In Progress" ? "text-amber-400 bg-amber-500/10" :
                    "text-red-400 bg-red-500/10"
                  }`}>{s.dpr}</span>
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Module shortcuts */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Quick Navigate</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Site Reports",   icon: HardHat,    color: "bg-orange-500/10 border-orange-500/20 text-orange-400" },
              { label: "HMP Plant",      icon: Factory,    color: "bg-amber-500/10 border-amber-500/20 text-amber-400"   },
              { label: "Procurement",    icon: DollarSign, color: "bg-green-500/10 border-green-500/20 text-green-400"   },
              { label: "Equipment",      icon: Wrench,     color: "bg-blue-500/10 border-blue-500/20 text-blue-400"      },
              { label: "Stores",         icon: Package,    color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"},
              { label: "Reports",        icon: BarChart2,  color: "bg-violet-500/10 border-violet-500/20 text-violet-400"},
            ].map((m) => (
              <button key={m.label} className={`rounded-xl p-3 border ${m.color} flex flex-col items-center gap-2`}>
                <m.icon className="w-5 h-5" />
                <span className="text-[11px] font-semibold text-center leading-tight">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent activity feed */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Activity Feed</p>
            <button className="text-violet-400 text-xs font-semibold">View All</button>
          </div>
          <div className="space-y-2">
            {[
              { time: "9:45", msg: "DPR submitted for THAKADPALLY - SIRUR", user: "Raju", type: "success" },
              { time: "9:12", msg: "Purchase Indent PI-0124 raised — ₹42,500", user: "Naveen", type: "info" },
              { time: "8:50", msg: "GRN GRN-0318 created — 6MM Aggregates 25 MT", user: "Venkat", type: "info" },
              { time: "8:20", msg: "Low diesel alert — LDO Tank 2 at 38%", user: "System", type: "warn" },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-3 px-1">
                <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${a.type === "success" ? "bg-green-400" : a.type === "warn" ? "bg-amber-400" : "bg-blue-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-200 leading-relaxed">{a.msg}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{a.user} · {a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-gray-900 border-t border-gray-700/50 flex items-center justify-around px-2 py-2 z-50">
        {[
          { label: "Overview", icon: LayoutDashboard, tab: "home"     },
          { label: "Sites",    icon: MapPin,           tab: "sites"    },
          { label: "Approve",  icon: ShieldCheck,      tab: "approve", primary: true },
          { label: "Reports",  icon: BarChart2,        tab: "reports"  },
          { label: "Settings", icon: Settings,         tab: "settings" },
        ].map((n) => (
          <button key={n.tab} onClick={() => setActiveTab(n.tab)} className="flex flex-col items-center gap-0.5 px-3 py-1">
            {n.primary ? (
              <div className="w-12 h-12 -mt-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/40">
                <n.icon className="w-6 h-6 text-white" />
              </div>
            ) : (
              <>
                <n.icon className={`w-5 h-5 ${activeTab === n.tab ? "text-violet-400" : "text-gray-500"}`} />
                <span className={`text-[10px] ${activeTab === n.tab ? "text-violet-400 font-semibold" : "text-gray-500"}`}>{n.label}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
