import { useState } from "react";
import { MapPin, Building2, Truck, Users, FileText, ChevronRight, ArrowLeft, Package, Fuel, BarChart3 } from "lucide-react";

const roads = [
  { id: 1, name: "Km 0–12 — Uppala to Nileshwar", length: "12 km", dprToday: true, material: "BC + DBM", dispatches: 8, labour: 34 },
  { id: 2, name: "Km 12–24 — Nileshwar to Kanhangad", length: "12 km", dprToday: true, material: "DBM", dispatches: 6, labour: 29 },
  { id: 3, name: "Km 24–31 — Kanhangad to Cheruvathur", length: "7 km", dprToday: false, material: "Sub-base", dispatches: 0, labour: 20 },
];

const plantStats = [
  { label: "Total dispatches today", value: "14 loads", sub: "across all roads", icon: Truck, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { label: "Material received", value: "187 T", sub: "Bitumen 18T · Agg 169T", icon: Package, color: "text-violet-600 bg-violet-50 border-violet-200" },
  { label: "LDO consumed", value: "1,240 L", sub: "HMP Burner + DG", icon: Fuel, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { label: "Total labour", value: "83", sub: "across project", icon: Users, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
];

export function ProjectDetail() {
  const [activeRoad, setActiveRoad] = useState<number | null>(1);
  const road = roads.find(r => r.id === activeRoad);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-800 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-4 py-3 flex items-center gap-3">
        <button className="text-zinc-400 hover:text-zinc-700">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-mono">NH66-P3</span>
            <span className="font-semibold text-sm">NH-66 Package 3</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-300 px-1.5 py-0.5 rounded">ACTIVE</span>
          </div>
          <div className="text-[11px] text-zinc-400">NHAI · 31 km · Jan 2024 → Dec 2026</div>
        </div>
        <button className="text-xs bg-zinc-100 text-zinc-600 px-2.5 py-1.5 rounded font-medium">Management Report</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Roads sidebar */}
        <div className="w-64 bg-white border-r border-zinc-200 flex flex-col">
          <div className="px-3 py-2.5 border-b border-zinc-100">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Roads / Sections
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
            {roads.map(r => (
              <button
                key={r.id}
                onClick={() => setActiveRoad(r.id)}
                className={`w-full text-left px-3 py-3 hover:bg-zinc-50 transition-colors ${activeRoad === r.id ? "bg-violet-50 border-l-2 border-violet-500" : ""}`}
              >
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${r.dprToday ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className="text-xs font-medium text-zinc-700 leading-snug">{r.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 pl-3.5 text-[10px] text-zinc-400">
                  <span>{r.length}</span>
                  <span>·</span>
                  <span>{r.dispatches} disp.</span>
                  <span>·</span>
                  <span>{r.labour} labour</span>
                </div>
              </button>
            ))}
          </div>

          {/* Plant box */}
          <div className="border-t border-zinc-200 px-3 py-3">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-1 mb-2">
              <Building2 className="w-3 h-3" /> Serving Plant
            </div>
            <div className="text-xs font-medium text-zinc-700">HLC Main Plant</div>
            <div className="text-[10px] text-zinc-400">HMP + RMC · Shared</div>
            <button className="mt-1.5 text-[10px] text-violet-600 font-medium hover:underline flex items-center gap-0.5">
              Go to Plant <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Plant stats row */}
          <div>
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Plant Output — Today</div>
            <div className="grid grid-cols-4 gap-2">
              {plantStats.map(s => (
                <div key={s.label} className={`rounded-lg border p-2.5 ${s.color} bg-opacity-40`}>
                  <s.icon className="w-4 h-4 mb-1" />
                  <div className="text-base font-bold">{s.value}</div>
                  <div className="text-[10px] leading-tight mt-0.5 opacity-80">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Road detail */}
          {road && (
            <div className="bg-white rounded-lg border border-zinc-200">
              <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm text-zinc-800">{road.name}</div>
                  <div className="text-[11px] text-zinc-400">{road.length} · Active material: {road.material}</div>
                </div>
                <div className="flex gap-2">
                  {road.dprToday
                    ? <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded">DPR submitted</span>
                    : <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-600 px-2 py-0.5 rounded">No DPR today</span>
                  }
                  <button className="text-[11px] text-violet-600 font-medium hover:underline flex items-center gap-0.5">
                    Open site <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-zinc-100">
                {[
                  { label: "Dispatches", value: road.dispatches, icon: Truck },
                  { label: "Labour today", value: road.labour, icon: Users },
                  { label: "DPR status", value: road.dprToday ? "Filed" : "Pending", icon: FileText },
                ].map(s => (
                  <div key={s.label} className="px-4 py-3 flex items-center gap-2">
                    <s.icon className="w-4 h-4 text-zinc-300" />
                    <div>
                      <div className="text-lg font-bold text-zinc-800">{s.value}</div>
                      <div className="text-[10px] text-zinc-400">{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Project-level note */}
          <div className="rounded-lg bg-violet-50 border border-violet-200 px-4 py-3 text-xs text-violet-700">
            <div className="font-semibold mb-1 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> How the plant serves this project
            </div>
            The HLC Main Plant produces material for all roads in this project. Stock consumed at each road is tagged to this project (NH66-P3), so the Management Report can show per-project fuel use, material consumption, and cost — while still sharing equipment and manpower with Ring Road Phase 2 running from the same plant.
          </div>
        </div>
      </div>
    </div>
  );
}
