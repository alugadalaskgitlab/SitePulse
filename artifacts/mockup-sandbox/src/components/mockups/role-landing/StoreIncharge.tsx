import { useState } from "react";
import {
  Package, ClipboardCheck, ArrowDownToLine, ArrowUpFromLine,
  AlertTriangle, CheckCircle2, Clock, ChevronRight, Plus, Bell,
  Search, FileText, BarChart2, Home, User, Filter, Layers,
  RefreshCw, Truck, TrendingDown, Battery, Wifi, Signal, ArrowRight,
  ShoppingBag, RotateCcw, BookOpen
} from "lucide-react";

const STORE = "HMP PLANT — STORES";
const INCHARGE = "Venkat";
const TODAY = "Fri, 11 Jul 2026";

const pendingActions = [
  { type: "GRN",  count: 3, label: "Pending GRNs",        color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   urgent: false },
  { type: "IRN",  count: 5, label: "IRNs to Verify",       color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  urgent: true  },
  { type: "STALE",count: 2, label: "Stale Draft GRNs",     color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    urgent: true  },
  { type: "LOW",  count: 4, label: "Low Stock Items",       color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", urgent: false },
];

const recentGRNs = [
  { grn: "GRN-2026-0318", vendor: "RAMESH TRADERS",       material: "6MM Aggregates",   qty: "25 MT",   status: "Verified",  date: "Jul 10" },
  { grn: "GRN-2026-0317", vendor: "KRISHNA SUPPLIERS",    material: "Cement (OPC 53)",  qty: "120 Bags", status: "Draft",     date: "Jul 10" },
  { grn: "GRN-2026-0316", vendor: "SRINIVAS ENTERPRISES", material: "Steel Rebar 16mm", qty: "5.2 MT",   status: "Verified",  date: "Jul 9"  },
];

const lowStockItems = [
  { item: "Cement (OPC 53)",  current: "45 Bags",  reorder: "100 Bags",  severity: "critical" },
  { item: "Steel Rebar 16mm", current: "1.2 MT",   reorder: "5 MT",      severity: "low"      },
  { item: "6MM Aggregates",   current: "8.5 MT",   reorder: "20 MT",     severity: "low"      },
];

const quickActions = [
  { label: "New GRN",     icon: ArrowDownToLine, color: "bg-blue-600"   },
  { label: "Issue Items", icon: ArrowUpFromLine, color: "bg-green-600"  },
  { label: "Returns",     icon: RotateCcw,       color: "bg-purple-600" },
  { label: "Stock View",  icon: Layers,          color: "bg-slate-600"  },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "Verified")
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/20">✓ Verified</span>;
  if (status === "Draft")
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">◐ Draft</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/20">{status}</span>;
}

export function StoreIncharge() {
  const [activeTab, setActiveTab] = useState("home");
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-['Inter'] flex flex-col max-w-[430px] mx-auto relative overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950 text-xs text-slate-400">
        <span className="font-semibold">8:30</span>
        <div className="flex items-center gap-1.5">
          <Signal className="w-3 h-3" /><Wifi className="w-3 h-3" /><Battery className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950/40 border-b border-slate-700/50 px-4 pt-2 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm">V</div>
            <div>
              <p className="text-xs text-slate-400">Store In-charge</p>
              <p className="text-sm font-bold text-white leading-tight">{INCHARGE} <span className="text-indigo-400">· Stores</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSearchOpen(!searchOpen)} className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center">
              <Search className="w-4 h-4 text-slate-300" />
            </button>
            <button className="relative w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center">
              <Bell className="w-4 h-4 text-slate-300" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center">5</span>
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-400 mb-4">
          <span className="text-indigo-400 font-medium">{STORE}</span>
          <span className="mx-1.5 text-slate-600">·</span>
          <span>{TODAY}</span>
        </div>

        {/* Search bar (expandable) */}
        {searchOpen && (
          <div className="mb-3 flex items-center gap-2 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input className="bg-transparent flex-1 text-sm text-white placeholder-slate-500 outline-none" placeholder="Search item, GRN, vendor…" autoFocus />
          </div>
        )}

        {/* Primary CTA */}
        <button className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-bold text-lg flex items-center justify-center gap-3 shadow-lg shadow-indigo-500/30 active:scale-95 transition-transform">
          <ArrowDownToLine className="w-6 h-6" />
          Create New GRN
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-20 space-y-4 px-4 pt-4">

        {/* Pending Actions Alert Strip */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Action Required</p>
          <div className="grid grid-cols-2 gap-2">
            {pendingActions.map((a) => (
              <button key={a.type} className={`rounded-xl p-3 ${a.bg} border ${a.border} flex items-center gap-2.5 relative overflow-hidden`}>
                {a.urgent && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                <span className={`text-2xl font-black ${a.color}`}>{a.count}</span>
                <span className={`text-xs font-semibold ${a.color} text-left leading-tight`}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Quick Actions</p>
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

        {/* Low Stock Alerts */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400" /> Low Stock
            </p>
            <button className="text-indigo-400 text-xs font-semibold">Full Stock</button>
          </div>
          <div className="space-y-2">
            {lowStockItems.map((item, i) => (
              <div key={i} className={`rounded-xl px-4 py-3 flex items-center gap-3 border ${item.severity === "critical" ? "bg-red-500/5 border-red-500/20" : "bg-slate-800/60 border-slate-700/50"}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.severity === "critical" ? "bg-red-500/10" : "bg-orange-500/10"}`}>
                  <Package className={`w-4 h-4 ${item.severity === "critical" ? "text-red-400" : "text-orange-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{item.item}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs font-bold ${item.severity === "critical" ? "text-red-400" : "text-orange-400"}`}>{item.current}</span>
                    <span className="text-xs text-slate-500">/ reorder at {item.reorder}</span>
                  </div>
                </div>
                {item.severity === "critical" && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">CRITICAL</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent GRNs */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent GRNs</p>
            <button className="text-indigo-400 text-xs font-semibold">All GRNs</button>
          </div>
          <div className="space-y-2">
            {recentGRNs.map((g, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono text-slate-400">{g.grn}</p>
                    <span className="text-slate-600">·</span>
                    <span className="text-xs text-slate-400">{g.date}</span>
                  </div>
                  <p className="text-sm font-semibold text-white truncate">{g.material}</p>
                  <p className="text-xs text-slate-400">{g.vendor} · {g.qty}</p>
                </div>
                <StatusBadge status={g.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-slate-900 border-t border-slate-700/50 flex items-center justify-around px-2 py-2 z-50">
        {[
          { label: "Home",   icon: Home,          tab: "home"   },
          { label: "GRNs",   icon: ArrowDownToLine, tab: "grn"  },
          { label: "New",    icon: Plus,           tab: "new",   primary: true },
          { label: "Stock",  icon: Layers,         tab: "stock"  },
          { label: "IRNs",   icon: BookOpen,       tab: "irn"    },
        ].map((n) => (
          <button key={n.tab} onClick={() => setActiveTab(n.tab)} className="flex flex-col items-center gap-0.5 px-3 py-1">
            {n.primary ? (
              <div className="w-12 h-12 -mt-5 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/40">
                <n.icon className="w-6 h-6 text-white" />
              </div>
            ) : (
              <>
                <n.icon className={`w-5 h-5 ${activeTab === n.tab ? "text-indigo-400" : "text-slate-500"}`} />
                <span className={`text-[10px] ${activeTab === n.tab ? "text-indigo-400 font-semibold" : "text-slate-500"}`}>{n.label}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
