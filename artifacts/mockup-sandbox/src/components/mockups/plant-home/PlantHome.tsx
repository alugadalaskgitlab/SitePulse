import { useState } from "react";
import { ChevronRight, ChevronLeft, Flame, TestTube, BarChart3, Settings, Layers, FileText, Users, Package, Truck, FlaskConical, ClipboardList, Gauge, Wrench, TrendingUp, Building2, Factory } from "lucide-react";

type Page = "home" | "hmp" | "rmc" | "management";

function Nav({ back, title, onBack }: { back?: boolean; title: string; onBack?: () => void }) {
  return (
    <header className="bg-slate-900 text-white px-5 py-3 flex items-center gap-3 shadow-lg shrink-0">
      {back && (
        <button onClick={onBack} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center">
        <TrendingUp className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1">
        <span className="font-bold text-sm tracking-tight">SiteLog</span>
        <span className="ml-2 text-slate-400 text-xs">· {title}</span>
      </div>
      <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center font-bold text-xs">SK</div>
    </header>
  );
}

function HomePage({ onNav }: { onNav: (p: Page) => void }) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Nav title="Plant Module" />
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-4">
        <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Active Project</p>
        <h1 className="text-base font-bold">NH-48 Road Widening — Pkg 3</h1>
        <p className="text-xs text-slate-400 mt-0.5">Thursday, 29 May 2026</p>
      </div>

      <div className="flex-1 p-5 space-y-4 max-w-3xl mx-auto w-full">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Plant</p>

        {/* HMP Card */}
        <button
          onClick={() => onNav("hmp")}
          className="w-full text-left group"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-300 transition-all p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-200 transition-colors">
              <Factory className="w-7 h-7 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-bold text-slate-900">HMP Operations</h2>
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Hot Mix Plant</span>
              </div>
              <p className="text-sm text-slate-500">Shift logs · Heating · Production dispatches · Equipment tracking</p>
              <div className="flex gap-3 mt-2">
                <span className="text-xs text-slate-400 flex items-center gap-1"><Truck className="w-3 h-3" /> 12 dispatches today</span>
                <span className="text-xs text-slate-400 flex items-center gap-1"><Flame className="w-3 h-3" /> Boiler: running</span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-amber-500 transition-colors shrink-0" />
          </div>
        </button>

        {/* RMC Card */}
        <button
          onClick={() => onNav("rmc")}
          className="w-full text-left group"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-300 transition-all p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-teal-100 flex items-center justify-center shrink-0 group-hover:bg-teal-200 transition-colors">
              <Building2 className="w-7 h-7 text-teal-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-bold text-slate-900">RMC Operations</h2>
                <span className="text-[10px] font-semibold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Ready Mix Concrete</span>
              </div>
              <p className="text-sm text-slate-500">RMC dispatches · Cube tests QC · DC generation</p>
              <div className="flex gap-3 mt-2">
                <span className="text-xs text-slate-400 flex items-center gap-1"><Truck className="w-3 h-3" /> 8 dispatches today</span>
                <span className="text-xs text-slate-400 flex items-center gap-1"><TestTube className="w-3 h-3" /> 3 cube tests pending</span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-teal-500 transition-colors shrink-0" />
          </div>
        </button>

        {/* Management Card */}
        <button
          onClick={() => onNav("management")}
          className="w-full text-left group"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-violet-300 transition-all p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-violet-100 flex items-center justify-center shrink-0 group-hover:bg-violet-200 transition-colors">
              <BarChart3 className="w-7 h-7 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-bold text-slate-900">Management</h2>
                <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Reports · Masters</span>
              </div>
              <p className="text-sm text-slate-500">Daily reports · Heating trends · RMC summary · Party & material masters</p>
              <div className="flex gap-3 mt-2">
                <span className="text-xs text-slate-400 flex items-center gap-1"><FileText className="w-3 h-3" /> Daily report ready</span>
                <span className="text-xs text-slate-400 flex items-center gap-1"><Settings className="w-3 h-3" /> Plant config</span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-violet-500 transition-colors shrink-0" />
          </div>
        </button>
      </div>
    </div>
  );
}

function HmpPage({ onBack }: { onBack: () => void }) {
  const tiles = [
    { icon: ClipboardList, label: "Shift Logs", desc: "Daily shift records & operator logs", color: "bg-amber-100 text-amber-600", border: "hover:border-amber-300" },
    { icon: Flame, label: "Heating Sessions", desc: "Boiler run logs & LDO consumption", color: "bg-orange-100 text-orange-600", border: "hover:border-orange-300" },
    { icon: Truck, label: "Production Dispatches", desc: "Dispatch records & delivery notes", color: "bg-blue-100 text-blue-600", border: "hover:border-blue-300" },
    { icon: Wrench, label: "Equipment", desc: "Maintenance & breakdown logs", color: "bg-slate-100 text-slate-600", border: "hover:border-slate-300" },
    { icon: Gauge, label: "LDO Tracker", desc: "Flow meter readings & stock", color: "bg-yellow-100 text-yellow-600", border: "hover:border-yellow-300" },
  ];
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Nav title="HMP Operations" back onBack={onBack} />
      <div className="bg-gradient-to-r from-amber-700 to-amber-600 text-white px-6 py-4">
        <p className="text-xs text-amber-200 uppercase tracking-wider mb-0.5">Hot Mix Plant</p>
        <h1 className="text-base font-bold">HMP Operations</h1>
        <p className="text-xs text-amber-200 mt-0.5">Main Plant · Today: 12 dispatches · 248 MT produced</p>
      </div>
      <div className="flex-1 p-5 max-w-3xl mx-auto w-full">
        <div className="grid grid-cols-2 gap-3">
          {tiles.map(({ icon: Icon, label, desc, color, border }) => (
            <button key={label} className={`bg-white rounded-xl border border-slate-200 ${border} hover:shadow-md transition-all p-4 text-left group`}>
              <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-sm text-slate-900">{label}</h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">{desc}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-4 text-center">Material receipts are managed in the Stores section</p>
      </div>
    </div>
  );
}

function RmcPage({ onBack }: { onBack: () => void }) {
  const tiles = [
    { icon: Truck, label: "RMC Dispatch", desc: "Record batches & generate DCs", color: "bg-teal-100 text-teal-600", border: "hover:border-teal-300", badge: "8 today" },
    { icon: TestTube, label: "Cube Tests QC", desc: "Compressive strength test results", color: "bg-blue-100 text-blue-600", border: "hover:border-blue-300", badge: "3 pending" },
  ];
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Nav title="RMC Operations" back onBack={onBack} />
      <div className="bg-gradient-to-r from-teal-700 to-teal-600 text-white px-6 py-4">
        <p className="text-xs text-teal-200 uppercase tracking-wider mb-0.5">Ready Mix Concrete Plant</p>
        <h1 className="text-base font-bold">RMC Operations</h1>
        <p className="text-xs text-teal-200 mt-0.5">RMC Unit · Today: 8 dispatches · 164 CuM produced</p>
      </div>
      <div className="flex-1 p-5 max-w-3xl mx-auto w-full space-y-3">
        {tiles.map(({ icon: Icon, label, desc, color, border, badge }) => (
          <button key={label} className={`w-full bg-white rounded-xl border border-slate-200 ${border} hover:shadow-md transition-all p-5 text-left flex items-center gap-4`}>
            <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center shrink-0`}>
              <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">{label}</h3>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{badge}</span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </button>
        ))}
        <div className="bg-slate-100 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-500">Mix Designs, Parties & Sites are configured in <span className="font-semibold text-violet-600">Management → Masters</span></p>
        </div>
        <p className="text-xs text-slate-400 text-center">Material receipts are managed in the Stores section</p>
      </div>
    </div>
  );
}

function ManagementPage({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"reports" | "masters">("reports");
  const reports = [
    { icon: FileText, label: "HMP Daily Report", desc: "Today's plant production & fuel summary", color: "bg-amber-100 text-amber-600" },
    { icon: Flame, label: "Heating Trends", desc: "Boiler L/MT, L/Hr trend analysis", color: "bg-orange-100 text-orange-600" },
    { icon: BarChart3, label: "RMC Daily Report", desc: "Day-wise batching, materials & cube test summary", color: "bg-teal-100 text-teal-600" },
    { icon: FileText, label: "Historical Reports", desc: "Browse all dates with bulk PDF export", color: "bg-slate-100 text-slate-600" },
  ];
  const masters = [
    { icon: Users, label: "Parties & Clients", desc: "Contractor, client & supplier master", color: "bg-blue-100 text-blue-600" },
    { icon: Package, label: "Materials", desc: "Aggregate, bitumen, cement & others", color: "bg-green-100 text-green-600" },
    { icon: FlaskConical, label: "Mix Designs (RMC)", desc: "Grade-wise designs per client & site", color: "bg-teal-100 text-teal-600" },
    { icon: Layers, label: "Mix Templates (HMP)", desc: "HMA layer templates & proportions", color: "bg-amber-100 text-amber-600" },
    { icon: Wrench, label: "Equipment", desc: "Equipment master & type config", color: "bg-slate-100 text-slate-600" },
    { icon: Settings, label: "Plant Configuration", desc: "Plant name, type & calibration", color: "bg-violet-100 text-violet-600" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Nav title="Management" back onBack={onBack} />
      <div className="bg-gradient-to-r from-violet-700 to-violet-600 text-white px-6 py-4">
        <p className="text-xs text-violet-200 uppercase tracking-wider mb-0.5">Plant Module</p>
        <h1 className="text-base font-bold">Management</h1>
        <p className="text-xs text-violet-200 mt-0.5">Reports · Masters · Plant Configuration</p>
      </div>
      <div className="flex border-b border-slate-200 bg-white shrink-0 px-5">
        {(["reports", "masters"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t === "reports" ? "📊 Reports" : "⚙️ Masters"}
          </button>
        ))}
      </div>
      <div className="flex-1 p-5 max-w-3xl mx-auto w-full">
        {tab === "reports" ? (
          <div className="grid grid-cols-2 gap-3">
            {reports.map(({ icon: Icon, label, desc, color }) => (
              <button key={label} className="bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-violet-200 transition-all p-4 text-left">
                <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-slate-900">{label}</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-tight">{desc}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {masters.map(({ icon: Icon, label, desc, color }) => (
              <button key={label} className="bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-violet-200 transition-all p-4 text-left">
                <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-slate-900">{label}</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-tight">{desc}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PlantHome() {
  const [page, setPage] = useState<Page>("home");
  return (
    <div className="min-h-screen">
      {page === "home" && <HomePage onNav={setPage} />}
      {page === "hmp" && <HmpPage onBack={() => setPage("home")} />}
      {page === "rmc" && <RmcPage onBack={() => setPage("home")} />}
      {page === "management" && <ManagementPage onBack={() => setPage("home")} />}
    </div>
  );
}
