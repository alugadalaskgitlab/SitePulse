import { AlertTriangle, Check, Clock3, Fuel, Gauge, Plus, Trash2 } from "lucide-react";
import "./_group.css";

const fieldClass = "mt-1 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base text-slate-800 outline-none";
const labelClass = "text-xs font-semibold text-slate-600";

function WorkAssignment({ second = false }: { second?: boolean }) {
  return <section className="border-t border-slate-200 p-4">
    <div className="mb-4">
      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
        <Clock3 className="h-4 w-4 text-amber-700" /> Work Assignment
      </div>
      <div className="mt-1 text-sm text-slate-600">Assign one or more BOQ items to each physical work segment.</div>
    </div>
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className={labelClass}>BOQ Item</span>
            <select className={fieldClass} defaultValue={second ? "gsb" : "excavation"}>
              <option value="excavation">Excavation for roadway in ordinary soil</option>
              <option value="gsb">Granular Sub-Base — Grading II</option>
            </select>
          </label>
          <button className="grid h-11 w-11 place-items-center rounded-md text-slate-600" aria-label="Remove BOQ item"><Trash2 className="h-4 w-4" /></button>
        </div>
        <button className="mt-2 flex min-h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-amber-800"><Plus className="h-4 w-4" /> Add BOQ Item</button>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label><span className={labelClass}>Start Time</span><input className={`${fieldClass} h-12`} type="time" defaultValue={second ? "08:45" : "08:10"} /></label>
          <label><span className={labelClass}>End Time</span><input className={`${fieldClass} h-12`} type="time" defaultValue={second ? "13:15" : "12:30"} /></label>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div><div className={labelClass}>Segment Duration</div><div className="mt-1 text-base font-bold">{second ? "4h 30m" : "4h 20m"}</div></div>
          <button className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-slate-600"><Trash2 className="h-4 w-4" /> Remove Segment</button>
        </div>
      </div>
    </div>
    <button className="mt-3 flex min-h-10 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900"><Plus className="h-4 w-4" /> Add Item</button>
  </section>;
}

function EquipmentCard({ second = false }: { second?: boolean }) {
  return <article className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/90 shadow-[0_8px_20px_rgba(15,23,42,.055)]">
    <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-100/80 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded bg-amber-500/15 text-amber-700"><Gauge className="h-4 w-4" /></span>
        <div><div className="text-base font-bold">{second ? "VIBRATORY ROLLER" : "HYDRAULIC EXCAVATOR"}</div><div className="text-xs font-medium text-slate-600">{second ? "HR-55-AV-9047" : "HR-55-AB-2194"} · Machine day {second ? 2 : 1}</div></div>
      </div>
      <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Operating</span>
    </header>
    <section className="border-t border-slate-200 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700"><Fuel className="h-4 w-4 text-amber-700" /> Fuel</div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div><div className={labelClass}>Diesel Issued / Added</div><div className="text-[15px] font-bold">{second ? "42.00" : "58.00"} L</div></div>
        <div><div className={labelClass}>Diesel Source</div><div className="text-[15px] font-medium">Plant stock</div></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label><span className={labelClass}>Opening Tank (L)</span><input className={fieldClass} type="number" defaultValue={second ? "66" : "82"} /></label>
        <label><span className={labelClass}>Closing Tank / Physical Dip (L)</span><input className={fieldClass} type="number" defaultValue={second ? "49" : "55"} /></label>
        <label className="col-span-2 flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
          <span className="grid h-4 w-4 place-items-center rounded border border-amber-600 bg-amber-600 text-white"><Check className="h-3 w-3" /></span> Physical Tank Balance Confirmed
        </label>
      </div>
    </section>
    <WorkAssignment second={second} />
    <section className="border-t border-slate-200 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700"><AlertTriangle className="h-4 w-4 text-amber-700" /> Breakdown / Stoppage</div>
      <button className="flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium"><Plus className="h-4 w-4" /> Add stoppage</button>
    </section>
  </article>;
}

export function Current() {
  return <main className="equipment-entry-preview min-h-screen bg-slate-100 p-6">
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-end justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-amber-700">Current form baseline</p><h1 className="mt-1 text-2xl font-bold">Equipment &amp; Fleet</h1><p className="mt-1 text-sm text-slate-600">Daily equipment usage, fuel and work allocation</p></div>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">2 equipment rows</span>
      </div>
      <div className="space-y-5"><EquipmentCard /><EquipmentCard second /></div>
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold">Labour Strength</h2>
        <p className="mt-1 text-sm text-slate-600">This next section begins only after both long equipment cards.</p>
      </section>
    </div>
  </main>;
}