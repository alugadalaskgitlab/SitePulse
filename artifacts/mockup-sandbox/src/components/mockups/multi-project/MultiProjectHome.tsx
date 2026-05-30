import { useState } from "react";
import { Building2, MapPin, Truck, ChevronRight, Plus, BarChart3, Users, Package, AlertTriangle } from "lucide-react";

const projects = [
  {
    id: 1,
    name: "NH-66 Package 3",
    client: "NHAI",
    code: "NH66-P3",
    status: "active",
    roads: [
      { name: "Km 0–12 (Uppala–Nileshwar)", dpr: true },
      { name: "Km 12–24 (Nileshwar–Kanhangad)", dpr: true },
      { name: "Km 24–31 (Kanhangad–Cheruvathur)", dpr: false },
    ],
    plant: "HLC Main Plant (HMP + RMC)",
    progress: 62,
    totalLength: "31 km",
    startDate: "Jan 2024",
    endDate: "Dec 2026",
    stats: { daysActive: 487, dispatchesToday: 14, labourToday: 83 },
  },
  {
    id: 2,
    name: "Ring Road Phase 2",
    client: "PWD Karnataka",
    code: "RR-P2",
    status: "active",
    roads: [
      { name: "Section A — North Loop (4.2 km)", dpr: true },
      { name: "Section B — East Connector (2.8 km)", dpr: false },
    ],
    plant: "HLC Main Plant (HMP)",
    progress: 28,
    totalLength: "7 km",
    startDate: "Mar 2025",
    endDate: "Feb 2027",
    stats: { daysActive: 89, dispatchesToday: 6, labourToday: 41 },
  },
  {
    id: 3,
    name: "Bridge Reconstruction — Shapur",
    client: "KRDCL",
    code: "BR-SHP",
    status: "planning",
    roads: [{ name: "Approach Road + Deck (1.1 km)", dpr: false }],
    plant: "Not assigned yet",
    progress: 5,
    totalLength: "1.1 km",
    startDate: "Jul 2025",
    endDate: "Jun 2026",
    stats: { daysActive: 0, dispatchesToday: 0, labourToday: 0 },
  },
];

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-300",
  planning: "bg-amber-100 text-amber-700 border-amber-300",
  completed: "bg-blue-100 text-blue-700 border-blue-300",
};

export function MultiProjectHome() {
  const [selected, setSelected] = useState<number | null>(null);
  const sel = projects.find(p => p.id === selected);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans">
      {/* Top bar */}
      <div className="bg-zinc-900 text-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-amber-500 rounded flex items-center justify-center text-xs font-bold text-black">HLC</div>
          <div>
            <div className="text-sm font-semibold leading-none">High Lane Constructions</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">SiteLog — Company Dashboard</div>
          </div>
        </div>
        <button className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold px-3 py-1.5 rounded">
          <Plus className="w-3.5 h-3.5" /> New Project
        </button>
      </div>
      <div className="flex h-[calc(100vh-52px)]">
        {/* Project list */}
        <div className="w-80 bg-white border-r border-zinc-200 flex flex-col">
          <div className="px-4 py-3 border-b border-zinc-100">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Projects</div>
            <div className="text-xs text-zinc-400 mt-0.5">3 active · 1 planning</div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id === selected ? null : p.id)}
                className={`w-full text-left px-4 py-3.5 hover:bg-zinc-50 transition-colors ${selected === p.id ? "bg-violet-50 border-l-2 border-violet-500" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-zinc-800 truncate">{p.name}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">{p.client} · {p.totalLength}</div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border ${statusColors[p.status]}`}>{p.status.toUpperCase()}</span>
                </div>
                {/* Progress bar */}
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                    <span>{p.roads.length} road{p.roads.length !== 1 ? "s" : ""}</span>
                    <span>{p.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {sel ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-zinc-800">{sel.name}</h2>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${statusColors[sel.status]}`}>{sel.status.toUpperCase()}</span>
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">{sel.client} · {sel.code} · {sel.startDate} → {sel.endDate}</div>
              </div>
              <button className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded font-medium hover:bg-violet-700">Open Project</button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Days active", value: sel.stats.daysActive, icon: BarChart3, color: "text-violet-600 bg-violet-50" },
                { label: "Dispatches today", value: sel.stats.dispatchesToday, icon: Truck, color: "text-amber-600 bg-amber-50" },
                { label: "Labour today", value: sel.stats.labourToday, icon: Users, color: "text-emerald-600 bg-emerald-50" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg border border-zinc-200 px-3 py-3 flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center ${s.color}`}>
                    <s.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-zinc-800">{s.value}</div>
                    <div className="text-[10px] text-zinc-400 font-semibold">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Roads */}
            <div className="bg-white rounded-lg border border-zinc-200">
              <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
                <div className="text-sm font-semibold text-zinc-700 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-zinc-400" /> Roads / Sections
                </div>
                <button className="text-[11px] text-violet-600 font-medium hover:underline flex items-center gap-0.5">
                  <Plus className="w-3 h-3" /> Add road
                </button>
              </div>
              <div className="divide-y divide-zinc-100">
                {sel.roads.map((r, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${r.dpr ? "bg-emerald-400" : "bg-zinc-300"}`} />
                      <span className="text-sm text-zinc-700">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.dpr
                        ? <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">DPR today</span>
                        : <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1"><AlertTriangle className="w-3 h-3" />No DPR</span>
                      }
                      <ChevronRight className="w-4 h-4 text-zinc-300" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Plant linkage */}
            <div className="bg-white rounded-lg border border-zinc-200">
              <div className="px-4 py-3 border-b border-zinc-100">
                <div className="text-sm font-semibold text-zinc-700 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-zinc-400" /> Serving Plant
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-zinc-800">{sel.plant}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">Shared establishment — dispatches routed per project tag</div>
                </div>
                {sel.plant !== "Not assigned yet" && (
                  <button className="text-xs text-violet-600 font-medium hover:underline">View plant</button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
            <Package className="w-10 h-10 mb-2 text-zinc-200" />
            <div className="text-sm">Select a project to view details</div>
          </div>
        )}
      </div>
    </div>
  );
}
