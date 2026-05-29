import { useState } from "react";
import { ChevronLeft, Plus, X, FlaskConical, CheckCircle, TrendingUp, ChevronDown } from "lucide-react";

const PARTIES = ["NHAI Contractor - Zone 3", "Raj Infra Pvt Ltd", "Apex Builders", "Steel Frame Constructions"];
const SITES = ["NH-48 Bridge Abutment", "Underpass U-7", "Box Culvert BC-12", "Retaining Wall Sector 4"];
const GRADES = ["M15", "M20", "M25", "M30", "M35", "M40"];

const designs = [
  { grade: "M30", party: "NHAI Contractor - Zone 3", site: "NH-48 Bridge Abutment", wc: 0.42, cement: 380, admixture: "Superplasticizer 1.0%", fa: 720, ca: 1050 },
  { grade: "M25", party: "Raj Infra Pvt Ltd", site: "Underpass U-7", wc: 0.45, cement: 350, admixture: "Plasticizer 0.8%", fa: 740, ca: 1080 },
  { grade: "M35", party: "NHAI Contractor - Zone 3", site: "NH-48 Bridge Abutment", wc: 0.38, cement: 420, admixture: "Superplasticizer 1.2%", fa: 690, ca: 1020 },
  { grade: "M25", party: "Apex Builders", site: "Box Culvert BC-12", wc: 0.45, cement: 340, admixture: "Plasticizer 0.8%", fa: 750, ca: 1090 },
  { grade: "M40", party: "Steel Frame Constructions", site: "Retaining Wall Sector 4", wc: 0.35, cement: 460, admixture: "Retarder + SP 1.5%", fa: 660, ca: 990 },
];

function gradeColor(g: string) {
  if (g === "M40" || g === "M35") return "bg-orange-100 text-orange-700";
  if (g === "M30") return "bg-teal-100 text-teal-700";
  return "bg-blue-100 text-blue-700";
}

function DesignForm({ onClose }: { onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">New Mix Design</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Grade <span className="text-red-500">*</span></label>
            <div className="relative">
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
                <option value="">Select grade...</option>
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Client / Party <span className="text-red-500">*</span></label>
            <div className="relative">
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
                <option value="">Select client...</option>
                {PARTIES.map(p => <option key={p}>{p}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Delivery Site <span className="text-red-500">*</span></label>
            <div className="relative">
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
                <option value="">Select site...</option>
                {SITES.map(s => <option key={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-600 mb-2">Mix Proportions (per CuM)</p>
            <div className="grid grid-cols-2 gap-2">
              {[["Cement (kg)", "380"], ["w/c Ratio", "0.42"], ["Fine Agg. (kg)", "720"], ["Coarse Agg. (kg)", "1050"]].map(([label, ph]) => (
                <div key={label}>
                  <label className="text-xs text-slate-500 block mb-1">{label}</label>
                  <input placeholder={ph} className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              ))}
            </div>
            <div className="mt-2">
              <label className="text-xs text-slate-500 block mb-1">Admixture</label>
              <input placeholder="e.g., Superplasticizer 1.0%" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
          </div>
          {saved ? (
            <div className="w-full bg-green-500 text-white rounded-xl py-3 flex items-center justify-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4" /> Mix Design Saved!
            </div>
          ) : (
            <button onClick={() => { setSaved(true); setTimeout(onClose, 1000); }} className="w-full bg-teal-600 hover:bg-teal-700 text-white rounded-xl py-3 font-medium text-sm transition-colors">
              Save Mix Design
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function RmcMixDesigns() {
  const [showForm, setShowForm] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white px-5 py-3 flex items-center gap-3 shadow-lg">
        <button className="p-1.5 hover:bg-slate-700 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
        <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center">
          <TrendingUp className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1">
          <span className="font-bold text-sm">SiteLog</span>
          <span className="ml-2 text-slate-400 text-xs">· Mix Designs (RMC)</span>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-teal-500 hover:bg-teal-400 rounded-lg p-1.5 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </header>

      <div className="bg-gradient-to-r from-teal-700 to-teal-600 text-white px-5 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-teal-200 uppercase tracking-wider mb-0.5">Masters</p>
          <h1 className="text-sm font-bold">Mix Designs — RMC</h1>
          <p className="text-xs text-teal-200 mt-0.5">By grade · client · site</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-white text-teal-700 rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5">
          <Plus className="w-3 h-3" /> Add Design
        </button>
      </div>

      <div className="flex-1 p-4 space-y-2 max-w-2xl mx-auto w-full">
        {designs.map((d, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                <FlaskConical className="w-4 h-4 text-teal-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gradeColor(d.grade)}`}>{d.grade}</span>
                  <span className="text-xs text-slate-500 truncate">{d.party}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{d.site}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 rounded-lg p-2">
              {[["Cement", `${d.cement} kg`], ["w/c", d.wc], ["Fine Agg.", `${d.fa} kg`], ["Coarse Agg.", `${d.ca} kg`]].map(([label, val]) => (
                <div key={String(label)}>
                  <p className="text-[10px] text-slate-400">{label}</p>
                  <p className="text-xs font-bold text-slate-700">{val}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 pl-1">Admixture: {d.admixture}</p>
          </div>
        ))}
      </div>
      {showForm && <DesignForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
