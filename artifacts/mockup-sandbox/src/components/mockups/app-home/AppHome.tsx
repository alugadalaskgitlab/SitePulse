import { useState } from "react";
import {
  HardHat, Factory, Package, BarChart3, Settings, Users, ShieldCheck,
  LogOut, Bell, TrendingUp, Building2, ArrowUpRight, ChevronDown, Calendar
} from "lucide-react";

const PROJECT = {
  name: "NH-48 Road Widening — Package 3",
  date: "Thursday, 29 May 2026",
  day: 148,
  totalDays: 365,
};

// Role simulation for the mockup
type Role = "admin" | "manager" | "engineer";

const ROLES: Role[] = ["admin", "manager", "engineer"];

const MODULES = [
  {
    id: "site",
    label: "Site Operations",
    icon: HardHat,
    description: "Daily progress reports, labour, equipment & material entries",
    accent: "from-amber-600 to-amber-500",
    iconBg: "bg-amber-500/20",
    borderHover: "hover:border-amber-500/50",
    shadowHover: "hover:shadow-amber-900/30",
    roles: ["admin", "manager", "engineer"] as Role[],
  },
  {
    id: "hmp",
    label: "HMP Operations",
    icon: Factory,
    description: "Shift logs, heating sessions, production dispatches & LDO tracking",
    accent: "from-yellow-600 to-yellow-500",
    iconBg: "bg-yellow-500/20",
    borderHover: "hover:border-yellow-500/50",
    shadowHover: "hover:shadow-yellow-900/30",
    roles: ["admin", "manager", "engineer"] as Role[],
  },
  {
    id: "rmc",
    label: "RMC Operations",
    icon: Building2,
    description: "Ready-mix concrete dispatches, delivery challans & cube test QC",
    accent: "from-teal-600 to-teal-500",
    iconBg: "bg-teal-500/20",
    borderHover: "hover:border-teal-500/50",
    shadowHover: "hover:shadow-teal-900/30",
    roles: ["admin", "manager", "engineer"] as Role[],
  },
  {
    id: "stores",
    label: "Stores & Materials",
    icon: Package,
    description: "Inventory, GRN receipts, stock ledger & item master management",
    accent: "from-orange-600 to-orange-500",
    iconBg: "bg-orange-500/20",
    borderHover: "hover:border-orange-500/50",
    shadowHover: "hover:shadow-orange-900/30",
    roles: ["admin", "manager"] as Role[],
  },
  {
    id: "reports",
    label: "Reports & Analysis",
    icon: BarChart3,
    description: "Plant daily reports, heating trends, RMC summary & historical data",
    accent: "from-blue-600 to-blue-500",
    iconBg: "bg-blue-500/20",
    borderHover: "hover:border-blue-500/50",
    shadowHover: "hover:shadow-blue-900/30",
    roles: ["admin", "manager"] as Role[],
  },
  {
    id: "estimates",
    label: "Estimates Manager",
    icon: TrendingUp,
    description: "Bituminous mix rate calculator, concrete BOQ analysis & saved estimates",
    accent: "from-violet-600 to-violet-500",
    iconBg: "bg-violet-500/20",
    borderHover: "hover:border-violet-500/50",
    shadowHover: "hover:shadow-violet-900/30",
    roles: ["admin", "manager"] as Role[],
  },
  {
    id: "admin",
    label: "App Management",
    icon: Settings,
    description: "User accounts, device approvals, permissions, plant config & data sync",
    accent: "from-slate-600 to-slate-500",
    iconBg: "bg-slate-500/20",
    borderHover: "hover:border-slate-500/50",
    shadowHover: "hover:shadow-slate-900/30",
    roles: ["admin"] as Role[],
  },
];

const ROLE_LABELS: Record<Role, { label: string; badge: string; color: string }> = {
  admin:    { label: "Admin",    badge: "All modules",      color: "text-violet-400 bg-violet-900/40 border-violet-700/40" },
  manager:  { label: "Manager",  badge: "No App Mgmt",     color: "text-blue-400 bg-blue-900/40 border-blue-700/40" },
  engineer: { label: "Engineer", badge: "Site + Plant only", color: "text-amber-400 bg-amber-900/40 border-amber-700/40" },
};

export function AppHome() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("admin");
  const [roleOpen, setRoleOpen] = useState(false);
  const pct = Math.round((PROJECT.day / PROJECT.totalDays) * 100);

  const visible = MODULES.filter(m => m.roles.includes(role));

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-white">

      {/* ── Top Nav ── */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center shadow">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-base tracking-tight">SiteLog</span>
          <span className="hidden sm:block text-slate-600 text-sm mx-1">|</span>
          <span className="hidden sm:block text-slate-500 text-xs">High Lane Constructions Pvt Ltd</span>
        </div>
        <div className="flex-1" />

        {/* Role switcher (mockup-only) */}
        <div className="relative">
          <button
            onClick={() => setRoleOpen(o => !o)}
            className="flex items-center gap-2 text-xs border border-slate-700 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            <span className="text-slate-400">Preview as:</span>
            <span className={`font-semibold px-1.5 py-0.5 rounded border text-[10px] ${ROLE_LABELS[role].color}`}>
              {ROLE_LABELS[role].label}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </button>
          {roleOpen && (
            <div className="absolute right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden w-48">
              {ROLES.map(r => (
                <button
                  key={r}
                  onClick={() => { setRole(r); setRoleOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-slate-700 transition-colors ${r === role ? "bg-slate-700/60" : ""}`}
                >
                  <span className="font-medium text-slate-200 capitalize">{r}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ROLE_LABELS[r].color}`}>{ROLE_LABELS[r].badge}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-2">
          <button className="relative p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <Bell className="w-4 h-4 text-slate-400" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
          </button>
          <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-slate-800 rounded-lg">
            <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center font-bold text-xs">SK</div>
            <div className="text-left">
              <p className="text-xs font-semibold leading-none">Suresh Kumar</p>
              <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{role}</p>
            </div>
          </div>
          <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-red-400">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── Project Banner ── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800/80 to-slate-900 border-b border-slate-800 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-0.5">Active Project</p>
            <h1 className="text-sm font-bold text-white truncate">{PROJECT.name}</h1>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> {PROJECT.date} · Day {PROJECT.day} of {PROJECT.totalDays}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-slate-500">Progress</p>
              <p className="text-xs font-bold text-amber-400">{pct}% complete</p>
            </div>
            <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Module Grid ── */}
      <div className="flex-1 px-6 py-8">
        <div className="max-w-5xl mx-auto">

          {/* Role hint */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-semibold text-slate-200">Welcome back, Suresh</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {visible.length} module{visible.length !== 1 ? "s" : ""} available for your role
              </p>
            </div>
            <div className={`text-[10px] px-2.5 py-1 rounded-full border font-medium ${ROLE_LABELS[role].color}`}>
              {ROLE_LABELS[role].label} · {ROLE_LABELS[role].badge}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {visible.map((mod) => (
              <button
                key={mod.id}
                onMouseEnter={() => setHovered(mod.id)}
                onMouseLeave={() => setHovered(null)}
                className={`group relative text-left rounded-2xl overflow-hidden border border-slate-800 ${mod.borderHover} bg-slate-900 transition-all duration-200 hover:shadow-xl ${mod.shadowHover} hover:-translate-y-1`}
              >
                {/* Gradient header strip */}
                <div className={`bg-gradient-to-br ${mod.accent} px-4 pt-4 pb-5`}>
                  <div className="flex items-start justify-between">
                    <div className={`w-10 h-10 ${mod.iconBg} rounded-xl border border-white/20 flex items-center justify-center`}>
                      <mod.icon className="w-5 h-5 text-white" />
                    </div>
                    <ArrowUpRight className={`w-4 h-4 text-white/50 mt-0.5 transition-all duration-200 ${hovered === mod.id ? "text-white/90 translate-x-0.5 -translate-y-0.5" : ""}`} />
                  </div>
                </div>

                {/* Label + description */}
                <div className="px-4 py-3 -mt-2 relative">
                  {/* Small accent bubble overlapping header */}
                  <div className={`absolute -top-3 left-4 w-6 h-1 rounded-full bg-gradient-to-r ${mod.accent} opacity-60`} />
                  <h3 className="font-bold text-sm text-slate-100 leading-snug">{mod.label}</h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{mod.description}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Greyed-out unavailable modules for context */}
          {MODULES.filter(m => !m.roles.includes(role)).length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-3">Not available for your role</p>
              <div className="flex flex-wrap gap-2">
                {MODULES.filter(m => !m.roles.includes(role)).map(m => (
                  <div key={m.id} className="flex items-center gap-1.5 text-xs text-slate-700 border border-slate-800 rounded-lg px-3 py-1.5">
                    <m.icon className="w-3.5 h-3.5" /> {m.label}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-slate-800/60 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-[10px] text-slate-600">
          <span>SiteLog · High Lane Constructions Pvt Ltd</span>
          <span>Each card is only shown to users with permission for that module</span>
        </div>
      </div>
    </div>
  );
}
