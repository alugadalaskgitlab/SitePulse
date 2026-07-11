import { useState } from "react";
import {
  Activity, Flame, Gauge, Droplets, Zap, Clock, ChevronRight,
  AlertTriangle, CheckCircle2, Plus, Bell, BarChart2, Settings,
  Thermometer, Fuel, Truck, Wrench, TrendingUp, Timer, Home,
  FileText, User, Battery, Wifi, Signal, ArrowRight, RefreshCw
} from "lucide-react";

const PLANT = "HIGH LANE — HMP PLANT";
const OPERATOR = "Mahesh";
const TODAY = "Fri, 11 Jul 2026";

const shiftStats = [
  { label: "Production",   value: "847",  unit: "MT",  icon: TrendingUp, color: "text-amber-400",  bg: "bg-amber-400/10"  },
  { label: "Dispatches",   value: "18",   unit: "Trips", icon: Truck,    color: "text-blue-400",   bg: "bg-blue-400/10"   },
  { label: "LDO Used",     value: "234",  unit: "L",   icon: Droplets,   color: "text-cyan-400",   bg: "bg-cyan-400/10"   },
  { label: "Heating Hrs",  value: "6.5",  unit: "hrs", icon: Flame,      color: "text-orange-400", bg: "bg-orange-400/10" },
];

const equipmentStatus = [
  { name: "Pug Mill",     tag: "HMP-01", status: "Running",  hours: "6.2", temp: "162°C" },
  { name: "Bitumen Tank", tag: "BTK-01", status: "Heating",  hours: "—",   temp: "148°C" },
  { name: "Aggregate Bin",tag: "AGB-01", status: "Running",  hours: "6.2", temp: "—"     },
  { name: "DG Set",       tag: "DG-01",  status: "Standby",  hours: "1.5", temp: "—"     },
];

const ldoLevels = [
  { tank: "LDO Tank 1",  level: 72, capacity: "5000 L", remaining: "3600 L" },
  { tank: "LDO Tank 2",  level: 38, capacity: "5000 L", remaining: "1900 L" },
];

const recentDispatches = [
  { time: "08:45", site: "THAKADPALLY - SIRUR", mix: "BC Mix", qty: "47.2 MT", vehicle: "AP 09 Y 1234" },
  { time: "08:12", site: "NH-167 SITE",          mix: "DBM Mix", qty: "52.8 MT", vehicle: "TS 09 AB 5678" },
  { time: "07:38", site: "THAKADPALLY - SIRUR", mix: "BC Mix",  qty: "49.1 MT", vehicle: "AP 09 Y 2345" },
];

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Running: "bg-green-400",
    Heating: "bg-amber-400 animate-pulse",
    Standby: "bg-slate-500",
    Fault:   "bg-red-500 animate-pulse",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? "bg-slate-500"}`} />;
}

function LevelBar({ level, color }: { level: number; color: string }) {
  const barColor = level < 30 ? "bg-red-500" : level < 50 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${level}%` }} />
    </div>
  );
}

export function PlantOperator() {
  const [activeTab, setActiveTab] = useState("home");
  const [shiftLogged, setShiftLogged] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-['Inter'] flex flex-col max-w-[430px] mx-auto relative overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-950 text-xs text-zinc-400">
        <span className="font-semibold">6:15 AM</span>
        <div className="flex items-center gap-1.5">
          <Signal className="w-3 h-3" /><Wifi className="w-3 h-3" /><Battery className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-amber-950/30 border-b border-zinc-700/50 px-4 pt-2 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center font-bold text-sm text-zinc-900">M</div>
            <div>
              <p className="text-xs text-zinc-400">Plant Operator</p>
              <p className="text-sm font-bold text-white leading-tight">{OPERATOR} <span className="text-amber-400">· Morning Shift</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-400 font-semibold">Plant Live</span>
            </div>
            <button className="relative w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center">
              <Bell className="w-4 h-4 text-zinc-300" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center">1</span>
            </button>
          </div>
        </div>

        <div className="text-xs text-zinc-400 mb-4">
          <span className="text-amber-400 font-medium">{PLANT}</span>
          <span className="mx-1.5 text-zinc-600">·</span>
          <span>{TODAY}</span>
          <span className="mx-1.5 text-zinc-600">·</span>
          <span className="text-zinc-300">Shift: 06:00–18:00</span>
        </div>

        {/* Primary CTA */}
        {!shiftLogged ? (
          <button
            onClick={() => setShiftLogged(true)}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-900 font-bold text-lg flex items-center justify-center gap-3 shadow-lg shadow-amber-500/30 active:scale-95 transition-transform"
          >
            <Timer className="w-6 h-6" />
            Open Shift Log
            <ArrowRight className="w-5 h-5" />
          </button>
        ) : (
          <div className="space-y-2">
            <div className="w-full py-3.5 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-green-300 font-semibold">Shift Log Open — 06:00</span>
            </div>
            <button className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-900 font-bold text-sm flex items-center justify-center gap-2">
              <Activity className="w-4 h-4" /> Record Production Batch
            </button>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-20 space-y-4 px-4 pt-4">

        {/* Shift stats */}
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">Today's Production</p>
          <div className="grid grid-cols-4 gap-2">
            {shiftStats.map((s) => (
              <div key={s.label} className={`rounded-xl p-2.5 flex flex-col items-center gap-1 ${s.bg} border border-white/5`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <div className="text-center">
                  <span className={`text-lg font-black ${s.color}`}>{s.value}</span>
                  <span className={`text-[9px] ${s.color} opacity-70 ml-0.5`}>{s.unit}</span>
                </div>
                <span className="text-[10px] text-zinc-400 text-center leading-tight">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* LDO Tank Levels */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">LDO / Diesel Tanks</p>
            <button className="text-amber-400 text-xs font-semibold flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Sync</button>
          </div>
          <div className="space-y-2">
            {ldoLevels.map((t, i) => (
              <div key={i} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Droplets className={`w-4 h-4 ${t.level < 30 ? "text-red-400" : "text-cyan-400"}`} />
                    <span className="text-sm font-semibold text-white">{t.tank}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${t.level < 30 ? "text-red-400" : "text-white"}`}>{t.level}%</span>
                    <p className="text-xs text-zinc-400">{t.remaining}</p>
                  </div>
                </div>
                <LevelBar level={t.level} color="" />
                {t.level < 40 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-amber-400">Low — request refill</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Equipment Status */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Equipment Status</p>
            <button className="text-amber-400 text-xs font-semibold">Log Usage</button>
          </div>
          <div className="space-y-2">
            {equipmentStatus.map((e, i) => (
              <div key={i} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-700 flex items-center justify-center flex-shrink-0">
                  <Wrench className="w-4 h-4 text-zinc-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{e.name}</p>
                    <span className="text-xs text-zinc-500">{e.tag}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <div className="flex items-center gap-1">
                      <StatusDot status={e.status} />
                      <span className="text-xs text-zinc-400">{e.status}</span>
                    </div>
                    {e.temp !== "—" && <div className="flex items-center gap-0.5 text-xs text-orange-300"><Thermometer className="w-3 h-3" />{e.temp}</div>}
                    {e.hours !== "—" && <span className="text-xs text-zinc-500">{e.hours}h today</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Dispatches */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Recent Dispatches</p>
            <button className="text-amber-400 text-xs font-semibold">New Dispatch</button>
          </div>
          <div className="space-y-2">
            {recentDispatches.map((d, i) => (
              <div key={i} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Truck className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{d.qty} · {d.mix}</p>
                  <p className="text-xs text-zinc-400 truncate">{d.site}</p>
                  <p className="text-[10px] text-zinc-500">{d.vehicle} · {d.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-zinc-900 border-t border-zinc-700/50 flex items-center justify-around px-2 py-2 z-50">
        {[
          { label: "Home",       icon: Home,      tab: "home"     },
          { label: "Dispatch",   icon: Truck,     tab: "dispatch" },
          { label: "Log",        icon: Plus,      tab: "log",     primary: true },
          { label: "Equipment",  icon: Wrench,    tab: "equip"    },
          { label: "Reports",    icon: BarChart2, tab: "reports"  },
        ].map((n) => (
          <button key={n.tab} onClick={() => setActiveTab(n.tab)} className="flex flex-col items-center gap-0.5 px-3 py-1">
            {n.primary ? (
              <div className="w-12 h-12 -mt-5 rounded-full bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/40">
                <n.icon className="w-6 h-6 text-zinc-900" />
              </div>
            ) : (
              <>
                <n.icon className={`w-5 h-5 ${activeTab === n.tab ? "text-amber-400" : "text-zinc-500"}`} />
                <span className={`text-[10px] ${activeTab === n.tab ? "text-amber-400 font-semibold" : "text-zinc-500"}`}>{n.label}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
