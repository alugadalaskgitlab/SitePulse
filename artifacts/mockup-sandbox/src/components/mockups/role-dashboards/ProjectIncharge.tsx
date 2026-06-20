import React from "react";
import { 
  AlertTriangle, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  HardHat, 
  TrendingUp, 
  Truck, 
  Users,
  Activity,
  ArrowUpRight,
  ShieldAlert,
  MapPin,
  TrendingDown,
  BarChart3
} from "lucide-react";
import "./_projectincharge.css";

// MOCK DATA
const PROJECT_STATS = {
  name: "NH-44 Expansion Project",
  location: "Bangalore - Hyderabad Sector",
  completionOverall: 68.4,
  completionFinancial: 72.1,
  totalLength: 84.5, // km
  completedLength: 57.8, // km
  activeStretches: 4,
  daysBehind: 14,
  contractualDate: "2026-08-15",
  projectedDate: "2026-08-29",
  budget: "₹ 1,240 Cr",
  spent: "₹ 894 Cr",
  variance: "+2.4%", // Over budget
};

const CATEGORY_PROGRESS = [
  { name: "Earthwork", planned: 100, actual: 98, color: "bg-emerald-500" },
  { name: "Subbase (GSB)", planned: 85, actual: 82, color: "bg-blue-500" },
  { name: "Base (WMM)", planned: 70, actual: 65, color: "bg-indigo-500" },
  { name: "Bituminous (DBM+BC)", planned: 45, actual: 38, color: "bg-[hsl(var(--pi-accent))]" },
  { name: "Structures & Bridges", planned: 60, actual: 64, color: "bg-emerald-500" }, // Ahead
];

const RISKS = [
  { id: 1, type: "critical", text: "ROW clearance pending at Ch 42.500 (Village limits)", source: "DPR Remarks", date: "Today" },
  { id: 2, type: "high", text: "Crusher output down 40% due to jaw failure at Plant B", source: "Plant Ops", date: "Yesterday" },
  { id: 3, type: "medium", text: "Bitumen VG-40 stock critical (2 days remaining)", source: "Materials", date: "Today" },
];

export function ProjectIncharge() {
  return (
    <div className="pi-dashboard w-full min-h-screen p-4 md:p-6 lg:p-8 flex flex-col gap-6">
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-[hsl(var(--pi-border))]">
        <div>
          <div className="flex items-center gap-2 text-[hsl(var(--pi-accent))] mb-1">
            <Activity size={16} />
            <span className="text-xs font-bold tracking-widest uppercase tracking-widest">KPI Command Centre</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white tracking-tight">
            {PROJECT_STATS.name}
          </h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-[hsl(var(--pi-muted))]">
            <span className="flex items-center gap-1"><MapPin size={14} /> {PROJECT_STATS.location}</span>
            <span className="flex items-center gap-1"><HardHat size={14} /> Project Incharge View</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <div className="text-xs text-[hsl(var(--pi-muted))]">Last Sync</div>
            <div className="text-sm font-medium text-white flex items-center gap-1">
              <CheckCircle2 size={14} className="text-emerald-500" /> Just now
            </div>
          </div>
          <button className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors border border-white/10">
            Export Report
          </button>
        </div>
      </header>

      {/* TOP ROW: MAJOR KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        
        {/* OVERALL PROGRESS */}
        <div className="card-glass rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={64} />
          </div>
          <h3 className="text-sm font-medium text-[hsl(var(--pi-muted))] w-full text-left mb-4 uppercase tracking-wider">Overall Progress</h3>
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--pi-border))" strokeWidth="8" />
              <circle 
                cx="50" cy="50" r="45" fill="none" 
                stroke="hsl(var(--pi-accent))" 
                strokeWidth="8" 
                strokeLinecap="round"
                strokeDasharray={`${(PROJECT_STATS.completionOverall / 100) * 283} 283`}
                className="gauge-progress drop-shadow-[0_0_8px_hsl(var(--pi-accent))]"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-3xl font-bold text-white">{PROJECT_STATS.completionOverall}%</span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-[hsl(var(--pi-muted))]">
            <span className="text-white font-medium">{PROJECT_STATS.completedLength} km</span> / {PROJECT_STATS.totalLength} km
          </div>
        </div>

        {/* SCHEDULE HEALTH */}
        <div className="card-glass rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-medium text-[hsl(var(--pi-muted))] uppercase tracking-wider">Schedule Health</h3>
              <div className="bg-red-500/20 text-red-400 p-2 rounded-lg">
                <Clock size={20} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold text-white">{PROJECT_STATS.daysBehind}</span>
              <span className="text-red-400 font-medium text-lg">Days Behind</span>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
              <span className="text-[hsl(var(--pi-muted))]">Contractual</span>
              <span className="text-white font-medium">{PROJECT_STATS.contractualDate}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[hsl(var(--pi-muted))]">Projected</span>
              <span className="text-red-400 font-medium flex items-center gap-1">
                {PROJECT_STATS.projectedDate} <TrendingDown size={14} />
              </span>
            </div>
          </div>
        </div>

        {/* COST HEALTH */}
        <div className="card-glass rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-medium text-[hsl(var(--pi-muted))] uppercase tracking-wider">Cost Health</h3>
              <div className="bg-[hsl(var(--pi-accent))]/20 text-[hsl(var(--pi-accent))] p-2 rounded-lg">
                <DollarSign size={20} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold text-white">{PROJECT_STATS.spent}</span>
            </div>
            <div className="text-sm text-[hsl(var(--pi-muted))] mt-1">Spent of {PROJECT_STATS.budget} budget</div>
          </div>
          
          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-white font-medium">Financial Progress</span>
              <span className="text-white font-bold">{PROJECT_STATS.completionFinancial}%</span>
            </div>
            <div className="w-full bg-[hsl(var(--pi-border))] h-2 rounded-full overflow-hidden">
              <div className="bg-[hsl(var(--pi-accent))] h-full" style={{ width: `${PROJECT_STATS.completionFinancial}%` }} />
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle size={14} /> Variance {PROJECT_STATS.variance} vs Plan
            </div>
          </div>
        </div>

        {/* KEY STATS */}
        <div className="grid grid-rows-2 gap-4">
          <div className="card-glass rounded-xl p-5 flex items-center gap-4">
            <div className="bg-blue-500/20 p-3 rounded-lg text-blue-400">
              <Truck size={24} />
            </div>
            <div>
              <div className="text-sm text-[hsl(var(--pi-muted))] mb-1">Fleet Availability</div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-white">82%</span>
                <span className="text-xs text-red-400">-4%</span>
              </div>
            </div>
          </div>
          <div className="card-glass rounded-xl p-5 flex items-center gap-4">
            <div className="bg-emerald-500/20 p-3 rounded-lg text-emerald-400">
              <Users size={24} />
            </div>
            <div>
              <div className="text-sm text-[hsl(var(--pi-muted))] mb-1">Labour Deployed</div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-white">412</span>
                <span className="text-xs text-emerald-400">Optimal</span>
              </div>
            </div>
          </div>
        </div>
        
      </div>

      {/* BOTTOM ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
        
        {/* PLAN VS ACTUAL CHART */}
        <div className="lg:col-span-2 card-glass rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 size={20} className="text-[hsl(var(--pi-accent))]" /> 
              Plan vs Actual by Category
            </h3>
            <div className="flex gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-white/20 rounded-sm"></div> Planned</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-[hsl(var(--pi-accent))] rounded-sm"></div> Actual</div>
            </div>
          </div>
          
          <div className="space-y-5">
            {CATEGORY_PROGRESS.map((cat, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-200 font-medium">{cat.name}</span>
                  <div className="flex gap-3">
                    <span className="text-[hsl(var(--pi-muted))]">Plan: {cat.planned}%</span>
                    <span className={cat.actual >= cat.planned ? "text-emerald-400 font-bold" : "text-[hsl(var(--pi-accent))] font-bold"}>
                      Act: {cat.actual}%
                    </span>
                  </div>
                </div>
                <div className="relative h-4 bg-[hsl(var(--pi-border))] rounded-full overflow-hidden">
                  <div 
                    className="absolute top-0 left-0 h-full bg-white/10" 
                    style={{ width: `${cat.planned}%` }}
                  />
                  <div 
                    className={`absolute top-0 left-0 h-full ${cat.color} ${cat.actual < cat.planned ? "opacity-90" : "opacity-100 shadow-[0_0_10px_rgba(0,0,0,0.5)]"}`}
                    style={{ width: `${cat.actual}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TOP RISKS */}
        <div className="card-glass rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert size={20} className="text-red-500" /> 
              Top Blockers
            </h3>
          </div>
          
          <div className="space-y-4">
            {RISKS.map(risk => (
              <div key={risk.id} className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-colors cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {risk.type === 'critical' ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse" />
                    ) : risk.type === 'high' ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white leading-snug group-hover:text-[hsl(var(--pi-accent))] transition-colors">
                      {risk.text}
                    </p>
                    <div className="flex items-center justify-between mt-2 text-xs text-[hsl(var(--pi-muted))]">
                      <span className="bg-black/40 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">{risk.source}</span>
                      <span>{risk.date}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <button className="w-full mt-4 flex items-center justify-center gap-2 text-sm font-medium text-[hsl(var(--pi-accent))] hover:text-white transition-colors p-2 rounded-lg bg-[hsl(var(--pi-accent))]/10 hover:bg-[hsl(var(--pi-accent))]/20">
            View All Issues <ArrowUpRight size={16} />
          </button>
        </div>

      </div>
    </div>
  );
}
