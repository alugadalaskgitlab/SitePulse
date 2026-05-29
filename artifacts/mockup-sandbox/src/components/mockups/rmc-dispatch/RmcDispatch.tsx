import { useState } from "react";
import { ChevronLeft, Plus, X, Truck, ChevronDown, Clock, FileText, CheckCircle, TrendingUp } from "lucide-react";

const PARTIES = ["NHAI Contractor - Zone 3", "Raj Infra Pvt Ltd", "Apex Builders", "Steel Frame Constructions"];
const SITES = ["NH-48 Bridge Abutment", "Underpass U-7", "Box Culvert BC-12", "Retaining Wall Sector 4"];
const MIX_DESIGNS = [
  { grade: "M25", wc: 0.45, admixture: "Plasticizer 0.8%" },
  { grade: "M30", wc: 0.42, admixture: "Superplasticizer 1.0%" },
  { grade: "M35", wc: 0.38, admixture: "Superplasticizer 1.2%" },
  { grade: "M40", wc: 0.35, admixture: "Retarder + SP 1.5%" },
];

const dispatches = [
  { dcNo: "RMC/25-26/0008", time: "14:32", party: "NHAI Contractor - Zone 3", site: "NH-48 Bridge Abutment", grade: "M30", truck: "KA-01-AB-1234", vol: "6.0", driver: "Ramesh K" },
  { dcNo: "RMC/25-26/0007", time: "13:15", party: "Apex Builders", site: "Box Culvert BC-12", grade: "M25", truck: "KA-14-CD-5678", vol: "7.5", driver: "Suresh M" },
  { dcNo: "RMC/25-26/0006", time: "11:48", party: "Raj Infra Pvt Ltd", site: "Underpass U-7", grade: "M35", truck: "KA-01-EF-9012", vol: "6.0", driver: "Mohan P" },
  { dcNo: "RMC/25-26/0005", time: "10:20", party: "NHAI Contractor - Zone 3", site: "NH-48 Bridge Abutment", grade: "M30", truck: "KA-01-GH-3456", vol: "7.5", driver: "Kumar R" },
  { dcNo: "RMC/25-26/0004", time: "09:05", party: "Steel Frame Constructions", site: "Retaining Wall Sector 4", grade: "M25", truck: "KA-14-IJ-7890", vol: "5.5", driver: "Raju S" },
];

function gradeColor(g: string) {
  if (g === "M40") return "bg-red-100 text-red-700";
  if (g === "M35") return "bg-orange-100 text-orange-700";
  if (g === "M30") return "bg-teal-100 text-teal-700";
  return "bg-blue-100 text-blue-700";
}

function DispatchForm({ onClose }: { onClose: () => void }) {
  const [party, setParty] = useState("");
  const [site, setSite] = useState("");
  const [mix, setMix] = useState<typeof MIX_DESIGNS[0] | null>(null);
  const [vol, setVol] = useState("");
  const [truck, setTruck] = useState("");
  const [driver, setDriver] = useState("");
  const [owner, setOwner] = useState("");
  const [wcOverride, setWcOverride] = useState("");
  const [admixOverride, setAdmixOverride] = useState("");
  const [saved, setSaved] = useState(false);

  function handleMixSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const m = MIX_DESIGNS.find(d => d.grade === e.target.value) ?? null;
    setMix(m);
    if (m) { setWcOverride(String(m.wc)); setAdmixOverride(m.admixture); }
  }

  function handleSave() { setSaved(true); setTimeout(onClose, 1200); }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Record RMC Dispatch</h2>
            <p className="text-xs text-teal-600 font-mono mt-0.5">RMC/25-26/0009 · auto-generated</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Date</label>
              <input type="date" defaultValue="2026-05-29" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Time</label>
              <input type="time" defaultValue="15:45" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Customer / Client <span className="text-red-500">*</span></label>
            <div className="relative">
              <select value={party} onChange={e => setParty(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
                <option value="">Select client...</option>
                {PARTIES.map(p => <option key={p}>{p}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Delivery Site <span className="text-red-500">*</span></label>
            <div className="relative">
              <select value={site} onChange={e => setSite(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
                <option value="">Select site...</option>
                {SITES.map(s => <option key={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Mix Design / Grade <span className="text-red-500">*</span></label>
            <div className="relative">
              <select onChange={handleMixSelect} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
                <option value="">Select grade...</option>
                {MIX_DESIGNS.map(d => <option key={d.grade} value={d.grade}>{d.grade} — w/c {d.wc}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {mix && (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-teal-700 mb-2">Mix Design Parameters — {mix.grade}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Cement w/c Ratio</label>
                  <input value={wcOverride} onChange={e => setWcOverride(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Admixture</label>
                  <input value={admixOverride} onChange={e => setAdmixOverride(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              </div>
              <p className="text-[10px] text-teal-600">Pre-filled from master · edit to override for this dispatch</p>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Truck / Vehicle <span className="text-red-500">*</span></label>
            <input value={truck} onChange={e => setTruck(e.target.value.toUpperCase())} placeholder="e.g., KA-01-AB-1234" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Load Volume (CuM) <span className="text-red-500">*</span></label>
            <input value={vol} onChange={e => setVol(e.target.value)} type="number" step="0.5" placeholder="e.g., 6.0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Owner Name <span className="text-slate-400 font-normal">(opt)</span></label>
              <input value={owner} onChange={e => setOwner(e.target.value.toUpperCase())} placeholder="Vehicle owner" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Driver Name <span className="text-slate-400 font-normal">(opt)</span></label>
              <input value={driver} onChange={e => setDriver(e.target.value.toUpperCase())} placeholder="Driver name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
          </div>

          {saved ? (
            <div className="w-full bg-green-500 text-white rounded-xl py-3 flex items-center justify-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4" /> Dispatch Saved!
            </div>
          ) : (
            <button onClick={handleSave} className="w-full bg-teal-600 hover:bg-teal-700 text-white rounded-xl py-3 font-medium text-sm transition-colors">
              Save Dispatch
            </button>
          )}
          <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" /> Draft auto-saved
          </p>
        </div>
      </div>
    </div>
  );
}

export function RmcDispatch() {
  const [showForm, setShowForm] = useState(false);
  const totalVol = dispatches.reduce((s, d) => s + parseFloat(d.vol), 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white px-5 py-3 flex items-center gap-3 shadow-lg">
        <button className="p-1.5 hover:bg-slate-700 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
        <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center">
          <TrendingUp className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1">
          <span className="font-bold text-sm">SiteLog</span>
          <span className="ml-2 text-slate-400 text-xs">· RMC Dispatch</span>
        </div>
        <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center font-bold text-xs">SK</div>
      </header>

      <div className="bg-gradient-to-r from-teal-700 to-teal-600 text-white px-5 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-teal-200">Thursday 29 May 2026</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm font-semibold">{dispatches.length} dispatches</span>
            <span className="text-teal-200">·</span>
            <span className="text-sm font-semibold">{totalVol} CuM total</span>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-white text-teal-700 rounded-xl px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-teal-50 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Record Dispatch
        </button>
      </div>

      <div className="flex-1 p-4 space-y-2 max-w-2xl mx-auto w-full">
        {dispatches.map((d) => (
          <div key={d.dcNo} className="bg-white rounded-xl border border-slate-200 p-3.5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-semibold text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">{d.dcNo}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gradeColor(d.grade)}`}>{d.grade}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <Clock className="w-3 h-3" />
                <span className="text-xs">{d.time}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate text-xs">{d.party}</p>
                <p className="text-slate-500 text-xs truncate">{d.site}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-teal-700 text-sm">{d.vol} CuM</p>
                <p className="text-slate-400 text-xs flex items-center gap-1 justify-end"><Truck className="w-3 h-3" />{d.truck}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && <DispatchForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
