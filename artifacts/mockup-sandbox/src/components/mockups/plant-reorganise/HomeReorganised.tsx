import React, { useState } from "react";
import {
  Factory,
  Wrench,
  Building2,
  BarChart2,
  HardHat,
  Settings,
  ArrowLeft,
  FileText,
  Flame,
  Truck,
  ShoppingCart,
  Fuel,
  Activity,
  AlertTriangle,
  History,
  TrendingUp,
  Scale,
  Receipt,
  Droplets,
  Gauge,
  FileSpreadsheet,
  Users,
  Box,
  ClipboardList
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";

// --- Data Models ---

const SECTIONS = [
  {
    id: "hmp",
    title: "HMP Operations",
    description: "Shift logs, heating sessions & production dispatches",
    icon: Factory,
    theme: "orange",
    colorClass: "bg-orange-500",
    lightBg: "bg-orange-50",
    textClass: "text-orange-700",
    borderClass: "border-orange-200",
    kpis: [
      { label: "Active Shifts", value: "2", trend: "+1 today" },
      { label: "Production (MT)", value: "1,420", trend: "On track" },
      { label: "Dispatches", value: "45", trend: "12 pending" },
    ],
    tiles: [
      { id: "shift-log", title: "Shift Log", icon: FileText },
      { id: "heating-sessions", title: "Heating Sessions", icon: Flame },
      { id: "dispatches", title: "Dispatches & Production", icon: Truck },
      { id: "purchase-indents", title: "Purchase Indents", icon: ShoppingCart },
      { id: "diesel-req-hmp", title: "Daily Diesel Req", icon: Fuel },
    ],
  },
  {
    id: "equipment",
    title: "Equipment & Fleet",
    description: "Usage logs, breakdowns & diesel tracking",
    icon: Wrench,
    theme: "blue",
    colorClass: "bg-blue-500",
    lightBg: "bg-blue-50",
    textClass: "text-blue-700",
    borderClass: "border-blue-200",
    kpis: [
      { label: "Active Equip", value: "42/48", trend: "88% util" },
      { label: "Breakdowns", value: "3", trend: "2 critical" },
      { label: "Diesel Issued (L)", value: "2,150", trend: "Avg" },
    ],
    tiles: [
      { id: "equip-usage", title: "Equipment Usage", icon: Activity },
      { id: "maintenance", title: "Maintenance & Breakdowns", icon: AlertTriangle },
      { id: "diesel-req-eq", title: "Daily Diesel Req", icon: Fuel },
      { id: "equip-master", title: "Equipment Master", icon: Truck },
    ],
  },
  {
    id: "rmc",
    title: "RMC Operations",
    description: "Ready-mix batching, delivery challans & cube tests",
    icon: Building2,
    theme: "green",
    colorClass: "bg-emerald-500",
    lightBg: "bg-emerald-50",
    textClass: "text-emerald-700",
    borderClass: "border-emerald-200",
    kpis: [
      { label: "Batches Today", value: "18", trend: "On track" },
      { label: "Volume (m³)", value: "320", trend: "+15% vs yest" },
      { label: "Pending Tests", value: "4", trend: "7/28 days" },
    ],
    tiles: [
      { id: "batching", title: "Batching Records", icon: ClipboardList },
      { id: "challans", title: "Delivery Challans", icon: Truck },
      { id: "cube-tests", title: "Cube Tests", icon: Box },
      { id: "mix-designs", title: "Mix Designs", icon: FileSpreadsheet },
    ],
  },
  {
    id: "reports",
    title: "Reports & Analysis",
    description: "Production reports, stock ledgers & finance",
    icon: BarChart2,
    theme: "purple",
    colorClass: "bg-purple-500",
    lightBg: "bg-purple-50",
    textClass: "text-purple-700",
    borderClass: "border-purple-200",
    kpis: [
      { label: "Reports Generated", value: "12", trend: "Today" },
      { label: "Stock Variances", value: "2", trend: "Requires review" },
      { label: "Pending Bills", value: "8", trend: "Action needed" },
    ],
    tiles: [
      { id: "today-report", title: "Today's Plant Report", icon: FileText },
      { id: "historical", title: "Historical Reports", icon: History },
      { id: "heating-trends", title: "Heating Trends", icon: TrendingUp },
      { id: "stock-ledger", title: "Stock Balances & Ledger", icon: Scale },
      { id: "variance", title: "Variance Report", icon: AlertTriangle },
      { id: "diesel-proc", title: "Diesel Procurement", icon: Fuel },
      { id: "bitumen", title: "Bitumen Stock", icon: Droplets },
      { id: "ldo", title: "LDO Flow Meter", icon: Gauge },
      { id: "vendor-bills", title: "Vendor Bills & GRN", icon: Receipt },
    ],
  },
  {
    id: "site",
    title: "Site Operations",
    description: "Daily progress reports & site activities",
    icon: HardHat,
    theme: "teal",
    colorClass: "bg-teal-500",
    lightBg: "bg-teal-50",
    textClass: "text-teal-700",
    borderClass: "border-teal-200",
    kpis: [
      { label: "Active Sites", value: "4", trend: "Normal" },
      { label: "DPRs Submitted", value: "3/4", trend: "1 pending" },
      { label: "Workforce", value: "185", trend: "+12 today" },
    ],
    tiles: [
      { id: "dpr", title: "Daily Progress Reports", icon: ClipboardList },
      { id: "site-activities", title: "Site Activities", icon: Activity },
      { id: "manpower", title: "Manpower Tracking", icon: Users },
      { id: "site-materials", title: "Material Receipts", icon: Box },
    ],
  },
  {
    id: "masters",
    title: "Masters & Config",
    description: "Parties, materials, equipment & personnel",
    icon: Settings,
    theme: "slate",
    isAdmin: true,
    colorClass: "bg-slate-600",
    lightBg: "bg-slate-100",
    textClass: "text-slate-700",
    borderClass: "border-slate-300",
    kpis: [
      { label: "Active Parties", value: "142", trend: "" },
      { label: "Materials", value: "86", trend: "" },
      { label: "Users", value: "34", trend: "" },
    ],
    tiles: [
      { id: "party-master", title: "Party Master", icon: Users },
      { id: "item-master", title: "Item/Material Master", icon: Box },
      { id: "rate-cards", title: "Rate Cards", icon: Receipt },
      { id: "user-mgmt", title: "User Management", icon: Settings },
    ],
  },
];

export default function HomeReorganised() {
  const [view, setView] = useState<"home" | "section" | "detail">("home");
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);

  const activeSection = SECTIONS.find((s) => s.id === activeSectionId);
  const activeTile = activeSection?.tiles.find((t) => t.id === activeTileId);

  const handleSectionClick = (id: string) => {
    setActiveSectionId(id);
    setView("section");
  };

  const handleTileClick = (id: string) => {
    setActiveTileId(id);
    setView("detail");
  };

  const handleBack = () => {
    if (view === "detail") {
      setView("section");
      setActiveTileId(null);
    } else if (view === "section") {
      setView("home");
      setActiveSectionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      {/* Sidebar - Industrial Dark Theme */}
      <aside className="w-64 bg-slate-900 flex-shrink-0 hidden md:flex flex-col border-r border-slate-800">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">SiteLog</span>
          </div>
        </div>
        <div className="p-4 flex-1">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">Navigation</div>
          <nav className="space-y-1">
            <button 
              onClick={() => { setView("home"); setActiveSectionId(null); setActiveTileId(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${view === 'home' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <Activity className="w-4 h-4" />
              Dashboard
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              <FileText className="w-4 h-4" />
              Tasks
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </nav>
        </div>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-medium">
              JD
            </div>
            <div>
              <div className="text-sm font-medium text-white">John Doe</div>
              <div className="text-xs text-slate-400">Site Manager</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 justify-between flex-shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-4">
            {view !== "home" && (
              <Button variant="ghost" size="icon" onClick={handleBack} className="text-slate-500 hover:text-slate-900 -ml-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <h1 className="text-lg font-semibold text-slate-800">
              {view === "home" ? "Home Dashboard" : view === "section" ? activeSection?.title : activeTile?.title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-500 hidden sm:block">High Lane Constructions</div>
            <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center md:hidden">
              <Building2 className="w-4 h-4 text-slate-600" />
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Level 1: Home Dashboard */}
            {view === "home" && (
              <>
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back, John</h2>
                  <p className="text-slate-500 mt-1">Here's an overview of your operations today.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {SECTIONS.map((section) => (
                    <Card 
                      key={section.id} 
                      className={`group cursor-pointer border hover:border-slate-300 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${section.id === 'site' ? 'ring-1 ring-slate-200 ring-offset-2' : ''}`}
                      onClick={() => handleSectionClick(section.id)}
                    >
                      <CardHeader className="p-5 pb-4">
                        <div className="flex items-start justify-between">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${section.lightBg} ${section.textClass} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                            <section.icon className="w-6 h-6" />
                          </div>
                          {section.isAdmin && (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200">Admin</Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg font-semibold text-slate-900">{section.title}</CardTitle>
                        <CardDescription className="text-sm text-slate-500 mt-1 line-clamp-2 h-10">
                          {section.description}
                        </CardDescription>
                      </CardHeader>
                      <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                        View Operations <ArrowLeft className="w-4 h-4 ml-1 rotate-180 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {/* Level 2: Section Dashboard */}
            {view === "section" && activeSection && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activeSection.lightBg} ${activeSection.textClass}`}>
                    <activeSection.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{activeSection.title}</h2>
                    <p className="text-sm text-slate-500">{activeSection.description}</p>
                  </div>
                </div>

                {/* KPI Ribbon */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  {activeSection.kpis.map((kpi, i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                      <div className="text-sm font-medium text-slate-500 mb-1">{kpi.label}</div>
                      <div className="flex items-baseline gap-2">
                        <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
                        {kpi.trend && <div className={`text-xs font-medium ${kpi.trend.includes('review') || kpi.trend.includes('critical') || kpi.trend.includes('pending') ? 'text-amber-600' : 'text-emerald-600'}`}>{kpi.trend}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Operations & Actions</h3>
                </div>

                {/* Action Tiles Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {activeSection.tiles.map((tile) => (
                    <button
                      key={tile.id}
                      onClick={() => handleTileClick(tile.id)}
                      className={`text-left bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md hover:border-${activeSection.theme}-300 transition-all group flex flex-col`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 mb-4 group-hover:${activeSection.colorClass} group-hover:text-white transition-colors`}>
                        <tile.icon className="w-5 h-5" />
                      </div>
                      <span className="font-medium text-slate-900 text-sm">{tile.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Level 3: Detail Stub */}
            {view === "detail" && activeTile && activeSection && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activeSection.lightBg} ${activeSection.textClass}`}>
                      <activeTile.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">{activeTile.title}</h2>
                      <p className="text-sm text-slate-500">Manage your {activeTile.title.toLowerCase()} records</p>
                    </div>
                  </div>
                  <Button className={`${activeSection.colorClass} hover:opacity-90 text-white`}>
                    + New Entry
                  </Button>
                </div>

                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
                    <CardTitle className="text-base">Recent Records</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                          <tr>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Reference ID</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {[1, 2, 3, 4].map((row) => (
                            <tr key={row} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap">May 24, 2026</td>
                              <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                                {activeTile.id.substring(0, 3).toUpperCase()}-2026-{200 + row}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Badge variant="outline" className={row === 1 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}>
                                  {row === 1 ? "Pending" : "Completed"}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900">View</Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
