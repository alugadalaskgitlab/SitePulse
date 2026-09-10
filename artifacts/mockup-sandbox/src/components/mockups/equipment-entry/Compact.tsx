import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Fuel,
  Gauge,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import "./_group.css";

const field =
  "mt-1 h-11 w-full rounded border border-[#cbd5d0] bg-[#fffdf7] px-2.5 text-sm font-semibold tabular-nums text-[#1e342d] outline-none transition focus:border-[#bd791a] focus:ring-2 focus:ring-[#f2c56e]/40 sm:h-9";
const label = "block text-[10px] font-bold uppercase tracking-[.1em] text-[#587068]";

function Tag({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "amber" | "slate" }) {
  const tones = {
    green: "border-[#a9d0bf] bg-[#e7f3eb] text-[#286149]",
    amber: "border-[#e5c27a] bg-[#fff2d7] text-[#865d1c]",
    slate: "border-[#cbd5d0] bg-[#edf1ed] text-[#50645d]",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

function FuelBlock() {
  const [confirmed, setConfirmed] = useState(true);
  return (
    <section className="border-t border-[#d7dfd9] px-3 py-3 sm:px-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.12em] text-[#314940]"><Fuel className="h-3.5 w-3.5 text-[#b96f17]" /> Fuel</div>
        <div className="text-[11px] text-[#667a72]">Plant stock · <strong className="text-[#263c34]">58.00 L issued</strong></div>
      </div>
      <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[140px_160px_auto] sm:items-end">
        <label><span className={label}>Opening tank (L)</span><input className={field} defaultValue="82.0" type="number" /></label>
        <label><span className={label}>Closing / physical dip (L)</span><input className={field} defaultValue="55.0" type="number" /></label>
        <button type="button" onClick={() => setConfirmed(!confirmed)} className={`col-span-2 mt-1 flex h-11 items-center gap-2 rounded border px-2.5 text-left text-xs font-semibold transition sm:col-span-1 sm:mt-0 sm:h-9 ${confirmed ? "border-[#afd1bd] bg-[#eff8f1] text-[#296247]" : "border-[#e4c276] bg-[#fff5df] text-[#805d1d]"}`}>
          <span className={`grid h-4 w-4 place-items-center rounded-sm border ${confirmed ? "border-[#4d9870] bg-[#4d9870] text-[#fffdf7]" : "border-[#c08a28] bg-[#fffdf7]"}`}>{confirmed && <Check className="h-3 w-3" />}</span>
          Physical tank balance {confirmed ? "confirmed" : "pending"}
        </button>
      </div>
    </section>
  );
}

function Segment({ second = false, onRemove }: { second?: boolean; onRemove?: () => void }) {
  const [extra, setExtra] = useState(false);
  return (
    <div className="rounded-md border border-[#d1dcd4] bg-[#f7f8f2] p-2.5">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1"><span className={label}>BOQ item</span>
          <select className={field} defaultValue={second ? "gsb" : "excavation"}>
            <option value="excavation">01.02 Excavation in ordinary soil</option>
            <option value="gsb">04.01 Granular Sub-Base — Grading II</option>
            <option>05.03 Wet Mix Macadam</option>
          </select>
        </label>
        <button type="button" onClick={onRemove} className="mt-[18px] grid h-11 w-11 shrink-0 place-items-center rounded text-[#667a72] transition hover:bg-[#f5e5dd] hover:text-[#9b3c25] sm:h-9 sm:w-9" aria-label="Remove BOQ item"><Trash2 className="h-4 w-4" /></button>
      </div>
      {extra && <label className="mt-2 block"><span className={label}>Additional BOQ item</span><select className={field} defaultValue="gsb"><option>04.01 Granular Sub-Base — Grading II</option><option>05.03 Wet Mix Macadam</option></select></label>}
      <button type="button" onClick={() => setExtra(!extra)} className="mt-1.5 inline-flex min-h-11 items-center gap-1 rounded px-1 py-1 text-[11px] font-bold text-[#936019] hover:bg-[#fff0d4] sm:min-h-0"><Plus className="h-3.5 w-3.5" /> {extra ? "Hide additional BOQ" : "Add BOQ item"}</button>
      <div className="mt-1 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label><span className={label}>Start</span><input className={field} type="time" defaultValue={second ? "12:50" : "08:10"} /></label>
        <label><span className={label}>End</span><input className={field} type="time" defaultValue={second ? "17:10" : "12:30"} /></label>
        <div className="pb-1"><span className={label}>Duration</span><strong className="block pt-1 text-sm tabular-nums text-[#1f3d33]">{second ? "4h 20m" : "4h 20m"}</strong></div>
      </div>
    </div>
  );
}

function WorkAssignment() {
  const [segments, setSegments] = useState([0, 1]);
  return (
    <section className="border-t border-[#d7dfd9] px-3 py-3 sm:px-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <div><div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.12em] text-[#314940]"><Clock3 className="h-3.5 w-3.5 text-[#b96f17]" /> Work assignment</div><p className="mt-0.5 text-[11px] text-[#667a72]">Physical work segments · BOQ only</p></div>
        <div className="rounded bg-[#e7eee8] px-2 py-1 text-[11px] font-bold tabular-nums text-[#365448]">8h 40m <span className="font-medium text-[#6c7d74]">assigned / 8h 50m</span></div>
      </div>
      <div className="space-y-2">{segments.map((item, index) => <Segment key={item} second={index === 1} onRemove={() => setSegments(segments.filter((_, i) => i !== index))} />)}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setSegments([...segments, Date.now()])} className="inline-flex h-11 items-center gap-1.5 rounded border border-[#dab65c] bg-[#fff5dc] px-2.5 text-xs font-bold text-[#7d5519] transition hover:bg-[#fbeac4] sm:h-8"><Plus className="h-3.5 w-3.5" /> Add segment</button>
        <span className="text-[11px] font-medium text-[#a06a20]">10m unassigned</span>
      </div>
      <div className="mt-2 flex items-start gap-1.5 rounded border border-[#edcf91] bg-[#fff6df] px-2 py-1.5 text-[11px] leading-4 text-[#805c23]"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Clock duration is 8h 50m. Allocation gaps are allowed; review before submission.</div>
    </section>
  );
}

function Breakdown() {
  const [open, setOpen] = useState(false);
  return <section className="border-t border-[#d7dfd9] px-3 py-2.5 sm:px-4">
    <button type="button" onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between text-left sm:min-h-0">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.12em] text-[#314940]"><AlertTriangle className="h-3.5 w-3.5 text-[#b96f17]" /> Breakdown / stoppage <span className="normal-case tracking-normal text-[#77877f]">None recorded</span></span>
      {open ? <ChevronUp className="h-4 w-4 text-[#698078]" /> : <ChevronDown className="h-4 w-4 text-[#698078]" />}
    </button>
    {open && <div className="mt-2 flex items-center justify-between rounded border border-dashed border-[#c9d4cc] bg-[#fbfcf8] p-2"><span className="text-xs text-[#667a72]">No stoppage entries for this machine day.</span><button className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-[#8b5a19] sm:min-h-0"><Plus className="h-3.5 w-3.5" /> Add stoppage</button></div>}
  </section>;
}

function ActiveMachine() {
  return <article className="overflow-hidden rounded-lg border border-[#bdcdc2] bg-[#fffdf7] shadow-[0_8px_22px_rgba(38,61,51,.09)]">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d7dfd9] bg-[#edf2eb] px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#e7c36b] text-[#644714]"><Gauge className="h-4 w-4" /></span><div className="min-w-0"><h2 className="truncate text-sm font-bold tracking-[.03em] text-[#1e352c]">HYDRAULIC EXCAVATOR</h2><p className="text-[11px] font-semibold text-[#64776e]">HR-55-AB-2194 <span className="mx-1 text-[#a4b0a9]">|</span> Operator: R. Mehta</p></div></div>
      <div className="flex items-center gap-1.5"><Tag>Operating</Tag><Tag tone="amber">1 review</Tag></div>
    </header>
    <div className="grid grid-cols-2 border-b border-[#d7dfd9] bg-[#f9faf6] text-xs sm:grid-cols-4">
      {[["Opening meter", "4,182.6 h"], ["Start", "08:00"], ["End", "16:50"], ["Clock duration", "8h 50m"]].map(([a, b]) => <div key={a} className="border-b border-[#e1e7e1] px-3 py-2 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className={label}>{a}</span><strong className="mt-0.5 block tabular-nums text-[#263c34]">{b}</strong></div>)}
    </div>
    <FuelBlock /><WorkAssignment /><Breakdown />
  </article>;
}

function CompletedMachine() {
  const [open, setOpen] = useState(false);
  return <article className="overflow-hidden rounded-lg border border-[#d1dbd3] bg-[#f7f9f4]">
    <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#dce6de] text-[#426454]"><Gauge className="h-4 w-4" /></span><div className="min-w-0"><h2 className="truncate text-sm font-bold tracking-[.03em] text-[#30483e]">VIBRATORY ROLLER</h2><p className="text-[11px] font-semibold text-[#73847b]">HR-55-AV-9047 · 08:00–16:30 · <span className="tabular-nums">8h 30m</span> · 42.00 L</p></div></div>
      <div className="flex shrink-0 items-center gap-2"><Tag tone="slate">Completed</Tag>{open ? <ChevronUp className="h-4 w-4 text-[#698078]" /> : <ChevronDown className="h-4 w-4 text-[#698078]" />}</div>
    </button>
    {open && <div className="border-t border-[#d7dfd9] bg-[#fffdf7] px-4 py-3 text-xs text-[#60746b]"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div><span className={label}>Fuel dip</span><strong className="block text-[#294139]">49.0 L confirmed</strong></div><div><span className={label}>Work assignment</span><strong className="block text-[#294139]">GSB — Grading II</strong></div><div><span className={label}>Segments</span><strong className="block text-[#294139]">1 segment</strong></div><div><span className={label}>Stoppage</span><strong className="block text-[#294139]">None</strong></div></div></div>}
  </article>;
}

export function Compact() {
  return <main className="equipment-entry-preview min-h-[100dvh] bg-[#e8eee8] px-3 py-4 sm:px-6 sm:py-7">
    <div className="mx-auto max-w-4xl">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#9b671c]">HLC Site Reporter · DPR / 14 Jun 2024</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[#20382e] sm:text-3xl">Equipment &amp; Fleet</h1><p className="mt-1 text-sm text-[#61756c]">Machine-day evidence · compact entry register</p></div>
        <div className="rounded-md border border-[#cbd8ce] bg-[#f7faf5] px-3 py-2 text-right"><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#72837a]">Today</div><div className="text-sm font-bold tabular-nums text-[#274238]">2 machine days</div></div>
      </header>
      <div className="space-y-3"><ActiveMachine /><CompletedMachine /></div>
      <div className="mt-4 border-t border-[#cbd8ce] pt-3 text-xs text-[#6d7e75]"><strong className="text-[#425b50]">Next:</strong> Labour strength <span className="mx-2 text-[#b1bdb4]">/</span> 2 equipment rows ready for review</div>
    </div>
  </main>;
}