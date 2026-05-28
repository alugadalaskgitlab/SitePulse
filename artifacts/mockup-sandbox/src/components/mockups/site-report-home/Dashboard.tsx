import { FileText, Package, ShoppingCart, Fuel, Plus, ChevronRight, Clock, CheckCircle, AlertCircle, Calendar, TrendingUp } from "lucide-react";

const recentActivity = [
  { type: "DPR", label: "Daily Progress Report", date: "Today, 8:30 AM", status: "submitted", id: "DPR-2026-148" },
  { type: "MAT", label: "Material Receipt", date: "Yesterday, 4:15 PM", status: "approved", id: "MR-2026-073" },
  { type: "IND", label: "Purchase Indent", date: "Yesterday, 2:00 PM", status: "pending", id: "PI-2026-041" },
  { type: "DSL", label: "Diesel Requirement", date: "28 May, 9:00 AM", status: "approved", id: "DR-2026-108" },
];

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle; label: string }> = {
  submitted: { color: "text-blue-600 bg-blue-50", icon: CheckCircle, label: "Submitted" },
  approved: { color: "text-green-600 bg-green-50", icon: CheckCircle, label: "Approved" },
  pending: { color: "text-amber-600 bg-amber-50", icon: AlertCircle, label: "Pending" },
};

export function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top nav */}
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-amber-500 rounded flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-base tracking-tight">SiteLog</span>
            <span className="ml-2 text-slate-400 text-xs">Construction Management</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-slate-400">Logged in as</p>
            <p className="text-sm font-semibold">Site Engineer</p>
          </div>
          <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center font-bold text-sm">SE</div>
        </div>
      </header>

      {/* Project banner */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Active Project</p>
          <h1 className="text-lg font-bold">NH-48 Road Widening — Pkg 3</h1>
          <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> Wednesday, 28 May 2026 &nbsp;·&nbsp; Day 148 of 365
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Today's DPR</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-green-300">Filed</span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-5 space-y-5 max-w-5xl mx-auto w-full">

        {/* Quick Actions */}
        <section>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* New DPR */}
            <button className="group bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-amber-400 hover:shadow-md transition-all cursor-pointer">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800">New DPR</p>
                <p className="text-xs text-slate-500 mt-0.5">Daily progress report</p>
              </div>
              <div className="w-full flex items-center justify-between mt-auto">
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Today</span>
                <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-500 transition-colors" />
              </div>
            </button>

            {/* Material Receipt */}
            <button className="group bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                <Package className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800">Material Receipt</p>
                <p className="text-xs text-slate-500 mt-0.5">Log incoming materials</p>
              </div>
              <div className="w-full flex items-center justify-between mt-auto">
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">+12 today</span>
                <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
              </div>
            </button>

            {/* Purchase Indent */}
            <button className="group bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-violet-400 hover:shadow-md transition-all cursor-pointer">
              <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                <ShoppingCart className="w-5 h-5 text-violet-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800">Purchase Indent</p>
                <p className="text-xs text-slate-500 mt-0.5">Raise a new indent</p>
              </div>
              <div className="w-full flex items-center justify-between mt-auto">
                <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">3 pending</span>
                <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-500 transition-colors" />
              </div>
            </button>

            {/* Diesel Requirement */}
            <button className="group bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-start gap-3 shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Fuel className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800">Diesel Req.</p>
                <p className="text-xs text-slate-500 mt-0.5">Daily diesel order</p>
              </div>
              <div className="w-full flex items-center justify-between mt-auto">
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Filed</span>
                <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </div>
            </button>
          </div>
        </section>

        <div className="grid grid-cols-3 gap-5">
          {/* Recent Activity — wider */}
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recent Activity</h2>
              <button className="flex items-center gap-1 text-xs text-amber-600 font-semibold hover:underline">
                All Records <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {recentActivity.map((item, i) => {
                const { color, icon: Icon, label } = statusConfig[item.status];
                return (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors ${i < recentActivity.length - 1 ? "border-b border-slate-100" : ""}`}>
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-black text-slate-600">{item.type}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.label}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {item.date} · {item.id}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${color}`}>
                      <Icon className="w-3 h-3" /> {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reports Panel — 4 real links only */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reports</h2>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {[
                { label: "DPR History", icon: FileText, desc: "View & edit daily reports", color: "text-amber-500" },
                { label: "Materials Received", icon: Package, desc: "Receipts & issues log", color: "text-emerald-500" },
                { label: "Diesel Report", icon: Fuel, desc: "Usage vs planned", color: "text-blue-500" },
                { label: "Purchase Indents", icon: ShoppingCart, desc: "Indents & approvals", color: "text-violet-500" },
              ].map((r, i, arr) => (
                <button key={i} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors text-left ${i < arr.length - 1 ? "border-b border-slate-100" : ""}`}>
                  <r.icon className={`w-4 h-4 ${r.color} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{r.label}</p>
                    <p className="text-xs text-slate-400">{r.desc}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
