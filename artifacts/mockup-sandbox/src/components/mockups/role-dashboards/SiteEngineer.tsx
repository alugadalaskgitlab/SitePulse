import React from "react";
import "./_siteengineer.css";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Droplet,
  FileText,
  Flame,
  HardHat,
  Menu,
  Plus,
  Settings,
  Truck,
  Wrench,
  Zap,
} from "lucide-react";

export function SiteEngineer() {
  return (
    <div className="site-engineer-dashboard min-h-screen w-full flex flex-col overflow-hidden text-sm">
      {/* Top Navbar */}
      <header className="h-14 border-b border-[#262626] se-glass flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-8 h-8 rounded bg-orange-500/10 text-orange-500">
            <HardHat size={20} />
          </div>
          <div>
            <h1 className="font-semibold text-white tracking-tight">SitePulse <span className="text-orange-500">FieldOps</span></h1>
            <p className="text-xs text-neutral-400 font-mono">PKG-4 (KM 142-180)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 mr-4">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-xs text-neutral-300 font-mono">LIVE SYNC</span>
          </div>
          <button className="p-2 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors">
            <Settings size={18} />
          </button>
          <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
            <span className="text-xs font-semibold text-white">AJ</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto se-scrollbar p-4 lg:p-6 pb-24 lg:pb-6">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Top Actions & DPR Banner */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 se-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-orange-500/30 glow-orange relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={16} className="text-orange-500" />
                  <h2 className="text-white font-semibold">Today's DPR: Draft</h2>
                </div>
                <p className="text-neutral-400 text-xs">Last auto-saved 14 mins ago. 2 sections pending.</p>
              </div>
              <button className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 text-xs w-full sm:w-auto justify-center shadow-lg shadow-orange-500/20">
                <FileText size={16} />
                Resume & Submit
              </button>
            </div>
            
            <div className="flex gap-2 shrink-0">
              <button className="flex-1 se-card p-4 flex flex-col items-center justify-center gap-2 hover:bg-neutral-800/50 transition-colors cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-neutral-800 group-hover:bg-orange-500/20 text-neutral-400 group-hover:text-orange-500 flex items-center justify-center transition-colors">
                  <Plus size={18} />
                </div>
                <span className="text-xs font-medium text-neutral-300">Material Receipt</span>
              </button>
              <button className="flex-1 se-card p-4 flex flex-col items-center justify-center gap-2 hover:bg-neutral-800/50 transition-colors cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-neutral-800 group-hover:bg-orange-500/20 text-neutral-400 group-hover:text-orange-500 flex items-center justify-center transition-colors">
                  <Wrench size={18} />
                </div>
                <span className="text-xs font-medium text-neutral-300">Log Breakdown</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Plant KPI */}
            <div className="se-card p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Flame size={16} className="text-neutral-400" />
                  <h3 className="font-medium text-neutral-300">Plant Output</h3>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20">Active</span>
              </div>
              <div className="mb-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white font-mono">1,240</span>
                  <span className="text-neutral-500 text-xs">/ 1800 MT</span>
                </div>
              </div>
              <div className="w-full h-1.5 se-progress-bar-bg rounded-full overflow-hidden mb-2">
                <div className="h-full se-progress-bar-fill w-[68%]"></div>
              </div>
              <p className="text-xs text-neutral-400 flex justify-between">
                <span>BC-II: 840 MT</span>
                <span>DBM: 400 MT</span>
              </p>
            </div>

            {/* Equipment KPI */}
            <div className="se-card p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Truck size={16} className="text-neutral-400" />
                  <h3 className="font-medium text-neutral-300">Equipment</h3>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-orange-500/10 text-orange-500 border border-orange-500/20">2 Down</span>
              </div>
              <div className="mb-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white font-mono">24</span>
                  <span className="text-neutral-500 text-xs">On Site</span>
                </div>
              </div>
              <div className="flex gap-1 h-1.5 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-green-500 w-[70%]"></div>
                <div className="h-full bg-neutral-600 w-[20%]"></div>
                <div className="h-full bg-red-500 w-[10%]"></div>
              </div>
              <div className="flex text-xs justify-between font-mono">
                <span className="text-green-500">18 Act</span>
                <span className="text-neutral-400">4 Idl</span>
                <span className="text-red-500">2 Brk</span>
              </div>
            </div>

            {/* Labour KPI */}
            <div className="se-card p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <HardHat size={16} className="text-neutral-400" />
                  <h3 className="font-medium text-neutral-300">Labour</h3>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">92%</span>
              </div>
              <div className="mb-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white font-mono">148</span>
                  <span className="text-neutral-500 text-xs">/ 160</span>
                </div>
              </div>
              <div className="w-full h-1.5 se-progress-bar-bg rounded-full overflow-hidden mb-2">
                <div className="h-full bg-blue-500 w-[92%]"></div>
              </div>
              <p className="text-xs text-neutral-400 flex justify-between">
                <span>Skilled: 42</span>
                <span>Unskilled: 106</span>
              </p>
            </div>

            {/* Water/Misc KPI */}
            <div className="se-card p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Droplet size={16} className="text-neutral-400" />
                  <h3 className="font-medium text-neutral-300">Water Tankers</h3>
                </div>
              </div>
              <div className="mb-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white font-mono">12</span>
                  <span className="text-neutral-500 text-xs">Trips Today</span>
                </div>
              </div>
              <div className="w-full h-1.5 se-progress-bar-bg rounded-full overflow-hidden mb-2">
                <div className="h-full bg-cyan-500 w-[60%]"></div>
              </div>
              <p className="text-xs text-neutral-400 flex justify-between">
                <span>Target: 20 trips</span>
                <span className="text-cyan-500">144 KL</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* Material Consumption Table */}
            <div className="lg:col-span-2 se-card flex flex-col">
              <div className="p-4 border-b border-[#262626] flex items-center justify-between">
                <h3 className="font-semibold text-white">Major Material Consumption (Live)</h3>
                <button className="text-xs text-orange-500 flex items-center gap-1 hover:text-orange-400">
                  View Ledger <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="overflow-x-auto se-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#262626] text-xs text-neutral-500 font-medium">
                      <th className="p-3 pl-4">Material</th>
                      <th className="p-3">Opening</th>
                      <th className="p-3">Received</th>
                      <th className="p-3">Consumed</th>
                      <th className="p-3 pr-4 text-right">Closing</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-mono divide-y divide-[#262626]/50">
                    <tr className="hover:bg-white/[0.02]">
                      <td className="p-3 pl-4 text-neutral-300 font-sans">Bitumen VG-30</td>
                      <td className="p-3 text-neutral-400">124.50 t</td>
                      <td className="p-3 text-green-500">+ 40.00 t</td>
                      <td className="p-3 text-orange-500">- 62.20 t</td>
                      <td className="p-3 pr-4 text-right text-white font-medium">102.30 t</td>
                    </tr>
                    <tr className="hover:bg-white/[0.02]">
                      <td className="p-3 pl-4 text-neutral-300 font-sans">Agg 20mm</td>
                      <td className="p-3 text-neutral-400">840.00 t</td>
                      <td className="p-3 text-green-500">+ 120.00 t</td>
                      <td className="p-3 text-orange-500">- 210.00 t</td>
                      <td className="p-3 pr-4 text-right text-white font-medium">750.00 t</td>
                    </tr>
                    <tr className="hover:bg-white/[0.02]">
                      <td className="p-3 pl-4 text-neutral-300 font-sans">Agg 10mm</td>
                      <td className="p-3 text-neutral-400">620.00 t</td>
                      <td className="p-3 text-neutral-500">-</td>
                      <td className="p-3 text-orange-500">- 185.00 t</td>
                      <td className="p-3 pr-4 text-right text-white font-medium">435.00 t</td>
                    </tr>
                    <tr className="hover:bg-white/[0.02]">
                      <td className="p-3 pl-4 text-neutral-300 font-sans">HSD (Diesel)</td>
                      <td className="p-3 text-neutral-400">12,450 L</td>
                      <td className="p-3 text-green-500">+ 5,000 L</td>
                      <td className="p-3 text-orange-500">- 1,240 L</td>
                      <td className="p-3 pr-4 text-right text-white font-medium">16,210 L</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active Breakdowns */}
            <div className="se-card flex flex-col">
              <div className="p-4 border-b border-[#262626] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <h3 className="font-semibold text-white">Active Breakdowns</h3>
              </div>
              <div className="p-4 space-y-4 flex-1">
                
                <div className="p-3 rounded border border-red-500/20 bg-red-500/5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-white text-sm">Paver (Apollo AP-800)</h4>
                    <span className="text-[10px] font-mono text-neutral-400">08:30 AM</span>
                  </div>
                  <p className="text-xs text-neutral-400 mb-3">Hydraulic pump failure. Mechanic assigned, waiting for spares.</p>
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-300">Impact: High</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-orange-500/10 text-orange-500">PO Raised</span>
                  </div>
                </div>

                <div className="p-3 rounded border border-[#262626] bg-[#1a1a1a]">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-white text-sm">Tipper (MH-12-AB-1234)</h4>
                    <span className="text-[10px] font-mono text-neutral-400">11:15 AM</span>
                  </div>
                  <p className="text-xs text-neutral-400 mb-3">Tyre puncture near Ch. 145.200. Mobile van dispatched.</p>
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-300">Impact: Low</span>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
