import React, { useState } from "react";

/* ─── Helpers ─────────────────────────────────────────────── */
const fmt  = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtN = (n: number, d = 3) => n.toFixed(d);

/* ─── Filter pill UI ─────────────────────────────────────── */
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all whitespace-nowrap ${
        active ? "bg-amber-600 text-white border-amber-600 shadow-sm"
               : "bg-white text-slate-500 border-slate-300 hover:border-amber-400 hover:text-amber-700"}`}>
      {label}
    </button>
  );
}

function FilterRow({ filters }: { filters: { label: string; options: string[]; value: string; onChange: (v: string) => void }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
      {filters.map(f => (
        <div key={f.label} className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{f.label}</span>
          {["All", ...f.options].map(opt => (
            <Pill key={opt} label={opt} active={f.value === opt} onClick={() => f.onChange(opt)} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Card wrapper ───────────────────────────────────────── */
function Card({ title, subtitle, hdr, children }: { title: string; subtitle?: string; hdr: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      <div className={`px-5 py-3 ${hdr}`}>
        <p className="text-sm font-bold tracking-wide uppercase">{title}</p>
        {subtitle && <p className="text-[11px] opacity-75 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/* ─── Static data ────────────────────────────────────────── */
const ZONES = ["Zone 1 (H=1.20m, 0–450m)", "Zone 2 (H=1.80m, 450–770m)"];
const LOCS  = ["NH65 Ch.0–450m", "NH65 Ch.450–770m"];
const DIAS  = ["8mm", "10mm", "12mm", "16mm", "20mm"];
const ELEMS = ["PCC Bed", "Invert Slab", "Walls", "Top Slab"];
const GRADES= ["M15", "M30"];

// Bar unit weight kg/m (d²/162)
const WT_PER_M: Record<string, number> = { "8mm": 0.395, "10mm": 0.617, "12mm": 0.888, "16mm": 1.580, "20mm": 2.470 };
const STEEL_RATE: Record<string, number> = { "8mm": 58000, "10mm": 57500, "12mm": 57000, "16mm": 56500, "20mm": 55500 };
const FAB_RATE:   Record<string, number> = { "8mm": 2200,  "10mm": 2000,  "12mm": 1800,  "16mm": 1600,  "20mm": 1400  };

// kg/RM per zone per dia
const KG_RM: Record<string, Record<string, number>> = {
  "Zone 1 (H=1.20m, 0–450m)":   { "8mm": 0.124, "10mm": 0.218, "12mm": 0.633, "16mm": 0.489, "20mm": 0.391 },
  "Zone 2 (H=1.80m, 450–770m)": { "8mm": 0.141, "10mm": 0.281, "12mm": 0.656, "16mm": 0.516, "20mm": 0.406 },
};
// m³/RM per zone per element
const VOL_RM: Record<string, Record<string, number>> = {
  "Zone 1 (H=1.20m, 0–450m)":   { "PCC Bed": 0.015, "Invert Slab": 0.078, "Walls": 0.180, "Top Slab": 0.090 },
  "Zone 2 (H=1.80m, 450–770m)": { "PCC Bed": 0.017, "Invert Slab": 0.078, "Walls": 0.270, "Top Slab": 0.090 },
};
// Rate ₹/m³ per grade
const CONC_RATE: Record<string, number> = { "M15": 5223, "M30": 8315 };
// Element → grade
const ELEM_GRADE: Record<string, string> = { "PCC Bed": "M15", "Invert Slab": "M30", "Walls": "M30", "Top Slab": "M30" };
// Element → location of each zone
const ZONE_LEN: Record<string, number> = {
  "Zone 1 (H=1.20m, 0–450m)": 450,
  "Zone 2 (H=1.80m, 450–770m)": 320,
};
// Cross-section per zone
const CROSS_M2: Record<string, number> = {
  "Zone 1 (H=1.20m, 0–450m)": 0.285,
  "Zone 2 (H=1.80m, 450–770m)": 0.405,
};

// Excavation data
const EXC_DATA: Record<string, { cavity: number; ws: number }> = {
  "Zone 1 (H=1.20m, 0–450m)":   { cavity: 0.480, ws: 0.245 },
  "Zone 2 (H=1.80m, 450–770m)": { cavity: 0.630, ws: 0.312 },
};

// Fixture data
type Fixture = { item: string; spec: string; spacing: number; rateNos: number };
const FIXTURES: Fixture[] = [
  { item: "MS Gratings",    spec: "ISMB 75, 200×100mm opening",         spacing: 3.0,  rateNos: 850 },
  { item: "Weepholes",      spec: "100mm dia uPVC, 300mm L + GI mesh",  spacing: 1.5,  rateNos: 65  },
  { item: "Lifting Hooks",  spec: "12mm HYSD welded loop in top slab",  spacing: 2.0,  rateNos: 150 },
];

/* ─── BOQ data ───────────────────────────────────────────── */
type BqRow = { sno: number; desc: string; cat: string; qty: number; unit: string; rate: number; zone: string };
const BOQ_ROWS: BqRow[] = [
  { sno:1, desc:"M15 PCC Blinding, 100mm thick",             cat:"Concrete", qty:6.75,  unit:"Cum", rate:5223,  zone:"Zone 1" },
  { sno:2, desc:"M30 RCC Invert Slab, 300mm",                cat:"Concrete", qty:35.10, unit:"Cum", rate:8315,  zone:"Zone 1" },
  { sno:3, desc:"M30 RCC Walls, 250mm (2 nos, H=1.20m)",     cat:"Concrete", qty:81.00, unit:"Cum", rate:8315,  zone:"Zone 1" },
  { sno:4, desc:"M30 RCC Top Slab (CIS), 250mm",             cat:"Concrete", qty:40.50, unit:"Cum", rate:8315,  zone:"Zone 1" },
  { sno:5, desc:"HYSD Fe500D Rebar, all dias, fab & fix",    cat:"Steel",    qty:0.835, unit:"MT",  rate:59020, zone:"Zone 1" },
  { sno:6, desc:"Excavation incl. disposal",                 cat:"Earthwork",qty:326.3, unit:"Cum", rate:213,   zone:"Zone 1" },
  { sno:7, desc:"Backfilling, selected, compacted",           cat:"Earthwork",qty:195.8, unit:"Cum", rate:115,   zone:"Zone 1" },
  { sno:8, desc:"MS Gratings (ISMB 75), fix",                cat:"Fixtures", qty:150,   unit:"Nos", rate:850,   zone:"Zone 1" },
  { sno:9, desc:"Weepholes 100mm uPVC",                       cat:"Fixtures", qty:300,   unit:"Nos", rate:65,    zone:"Zone 1" },
  { sno:10,desc:"Lifting Hooks 12mm HYSD",                   cat:"Fixtures", qty:225,   unit:"Nos", rate:150,   zone:"Zone 1" },
  { sno:1, desc:"M15 PCC Blinding, 100mm thick",             cat:"Concrete", qty:5.44,  unit:"Cum", rate:5223,  zone:"Zone 2" },
  { sno:2, desc:"M30 RCC Invert Slab, 300mm",                cat:"Concrete", qty:24.96, unit:"Cum", rate:8315,  zone:"Zone 2" },
  { sno:3, desc:"M30 RCC Walls, 250mm (2 nos, H=1.80m)",     cat:"Concrete", qty:86.40, unit:"Cum", rate:8315,  zone:"Zone 2" },
  { sno:4, desc:"M30 RCC Top Slab (CIS), 250mm",             cat:"Concrete", qty:28.80, unit:"Cum", rate:8315,  zone:"Zone 2" },
  { sno:5, desc:"HYSD Fe500D Rebar, all dias, fab & fix",    cat:"Steel",    qty:0.640, unit:"MT",  rate:59020, zone:"Zone 2" },
  { sno:6, desc:"Excavation incl. disposal",                 cat:"Earthwork",qty:301.4, unit:"Cum", rate:213,   zone:"Zone 2" },
  { sno:7, desc:"Backfilling, selected, compacted",           cat:"Earthwork",qty:184.9, unit:"Cum", rate:115,   zone:"Zone 2" },
  { sno:8, desc:"MS Gratings (ISMB 75), fix",                cat:"Fixtures", qty:107,   unit:"Nos", rate:850,   zone:"Zone 2" },
  { sno:9, desc:"Weepholes 100mm uPVC",                       cat:"Fixtures", qty:213,   unit:"Nos", rate:65,    zone:"Zone 2" },
  { sno:10,desc:"Lifting Hooks 12mm HYSD",                   cat:"Fixtures", qty:160,   unit:"Nos", rate:150,   zone:"Zone 2" },
];

/* ─── Main component ─────────────────────────────────────── */
export function ReportsTab() {
  /* Steel filters */
  const [stZone, setStZone] = useState("All");
  const [stDia,  setStDia]  = useState("All");

  /* Concrete filters */
  const [cnZone,  setCnZone]  = useState("All");
  const [cnGrade, setCnGrade] = useState("All");
  const [cnElem,  setCnElem]  = useState("All");

  /* Earthwork filters */
  const [exZone, setExZone] = useState("All");

  /* Fixtures filters */
  const [fxZone, setFxZone] = useState("All");
  const [fxItem, setFxItem] = useState("All");

  /* Per-RM filters */
  const [rmZone, setRmZone] = useState("All");
  const [rmElem, setRmElem] = useState("All");

  /* BOQ filters */
  const [bqZone, setBqZone] = useState("All");
  const [bqCat,  setBqCat]  = useState("All");

  /* ── Derived: active zones list ── */
  const activeZones = stZone === "All" ? ZONES : [stZone];
  const activeCnZones = cnZone === "All" ? ZONES : [cnZone];
  const activeExZones = exZone === "All" ? ZONES : [exZone];
  const activeRmZones = rmZone === "All" ? ZONES : [rmZone];

  /* ── Steel rows ── */
  const activeDias = stDia === "All" ? DIAS : [stDia];
  type SteelRow = { dia: string; wtM: number; kgRM: number; kgCum: number; kgTotal: number; steelR: number; fabR: number; totalR: number; perM: number; perCum: number; pct: number };
  const steelRows: SteelRow[] = activeDias.map(dia => {
    const totalKgRM = activeZones.reduce((s, z) => {
      const len = ZONE_LEN[z];
      return s + (KG_RM[z]?.[dia] ?? 0) * len;
    }, 0);
    const totalLen = activeZones.reduce((s, z) => s + ZONE_LEN[z], 0);
    const kgRM = totalLen > 0 ? totalKgRM / totalLen : 0;
    const totalM3 = activeZones.reduce((s, z) => s + CROSS_M2[z] * ZONE_LEN[z], 0);
    const kgCum = totalM3 > 0 ? totalKgRM / totalM3 : 0;
    const steelR = STEEL_RATE[dia], fabR = FAB_RATE[dia], totalR = steelR + fabR;
    const perM   = kgRM * totalR / 1000;
    const perCum = kgCum * totalR / 1000;
    return { dia, wtM: WT_PER_M[dia], kgRM, kgCum, kgTotal: totalKgRM, steelR, fabR, totalR, perM, perCum, pct: 0 };
  });
  const totKg = steelRows.reduce((s, r) => s + r.kgTotal, 0);
  steelRows.forEach(r => { r.pct = totKg > 0 ? (r.kgTotal / totKg) * 100 : 0; });
  const wtdAvg = steelRows.length ? steelRows.reduce((s, r) => s + r.steelR * r.kgTotal, 0) / (totKg || 1) : 0;
  const wtdTot = steelRows.length ? steelRows.reduce((s, r) => s + r.totalR * r.kgTotal, 0) / (totKg || 1) : 0;
  const totPerM   = steelRows.reduce((s, r) => s + r.perM, 0);
  const totPerCum = steelRows.reduce((s, r) => s + r.perCum, 0);

  /* ── Concrete rows ── */
  const activeElems  = cnElem  === "All" ? ELEMS  : [cnElem];
  const activeGrades = cnGrade === "All" ? GRADES : [cnGrade];
  type ConcRow = { elem: string; grade: string; volRM: number; rateM3: number; costRM: number; qty: number };
  const concRows: ConcRow[] = [];
  activeCnZones.forEach(zone => {
    activeElems.forEach(elem => {
      const grade = ELEM_GRADE[elem];
      if (cnGrade !== "All" && grade !== cnGrade) return;
      const volRM  = VOL_RM[zone]?.[elem] ?? 0;
      const rateM3 = CONC_RATE[grade] ?? 0;
      const len    = ZONE_LEN[zone];
      const qty    = volRM * len;
      concRows.push({ elem: `${elem} [${zone.split("(")[0].trim()}]`, grade, volRM, rateM3, costRM: volRM * rateM3, qty });
    });
  });

  /* ── Earthwork rows ── */
  type ExcRow = { zone: string; cavity: number; ws: number; total: number; bkfTotal: number; len: number };
  const excRows: ExcRow[] = activeExZones.map(z => {
    const d = EXC_DATA[z] ?? { cavity: 0, ws: 0 };
    return { zone: z, cavity: d.cavity, ws: d.ws, total: d.cavity + d.ws, bkfTotal: (d.cavity + d.ws) * 0.6, len: ZONE_LEN[z] };
  });

  /* ── Fixture rows ── */
  const activeFx = fxItem === "All" ? FIXTURES : FIXTURES.filter(f => f.item === fxItem);
  const activeFxZones = fxZone === "All" ? ZONES : [fxZone];

  /* ── Per-RM rows ── */
  const activeRmElems = rmElem === "All" ? ELEMS : [rmElem];

  /* ── BOQ rows ── */
  const bqFiltered = BOQ_ROWS.filter(r => {
    if (bqZone !== "All" && !r.zone.startsWith(bqZone.replace("Zone ", "Zone "))) return false;
    if (bqCat !== "All" && r.cat !== bqCat) return false;
    return true;
  });
  const bqGrouped: Record<string, BqRow[]> = {};
  bqFiltered.forEach(r => { (bqGrouped[r.zone] ??= []).push(r); });
  const bqGrandTotal = bqFiltered.reduce((s, r) => s + r.qty * r.rate, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 text-sm">

      {/* ── Header ── */}
      <div className="bg-slate-800 text-white px-5 py-3.5 flex items-start justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-wide uppercase">Rate Analysis Report</h1>
          <p className="text-[11px] text-slate-300 mt-0.5">NH 65 · RCC Box Drain · High Lane Constructions · 13 Apr 2026</p>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {["Structural: M30","PCC: M15","Drain (Covered)","770 RM total"].map(t => (
              <span key={t} className="text-[10px] bg-slate-600 px-2 py-0.5 rounded font-medium">{t}</span>
            ))}
          </div>
        </div>
        <button className="text-[11px] border border-slate-500 hover:bg-slate-700 px-3 py-1.5 rounded mt-1">🖨 Print</button>
      </div>

      <div className="p-4 space-y-0">

        {/* ══ A. REINFORCEMENT BARS ══ */}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 mt-1">A. Reinforcement Bars — Rate Analysis</p>
        <Card title="Reinforcement Bars — All Dimensions" subtitle="HYSD Fe 500D · BBS-based quantities" hdr="bg-indigo-700 text-white">
          <FilterRow filters={[
            { label: "Zone",     options: ZONES, value: stZone, onChange: setStZone },
            { label: "Diameter", options: DIAS,  value: stDia,  onChange: setStDia  },
          ]} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  {["Diameter","Wt/m (kg/m)","kg/RM","kg/m³ RCC","Total (kg)","%","Steel ₹/MT","Fab ₹/MT","Total ₹/MT","₹/RM","₹/m³"].map(h => (
                    <th key={h} className="px-3 py-2 text-right first:text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {steelRows.map((r, i) => (
                  <tr key={r.dia} className={i % 2 === 0 ? "" : "bg-slate-50/60"}>
                    <td className="px-3 py-1.5 border-b border-slate-100 font-semibold text-indigo-700">{r.dia}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-slate-500">{fmtN(r.wtM, 3)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{fmtN(r.kgRM, 3)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{fmtN(r.kgCum, 2)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{fmtN(r.kgTotal, 1)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-slate-500">{r.pct.toFixed(1)}%</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{fmt(r.steelR)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-slate-500">{fmt(r.fabR)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums font-semibold">{fmt(r.totalR)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-indigo-700 font-medium">{fmt(Math.round(r.perM))}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-indigo-700 font-medium">{fmt(Math.round(r.perCum))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50">
                  <td className="px-3 py-2 font-bold text-indigo-900 text-[11px]">Total / Wtd Avg</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-indigo-900">{fmtN(steelRows.reduce((s,r)=>s+r.kgRM,0),3)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-indigo-900">{fmtN(steelRows.reduce((s,r)=>s+r.kgCum,0),2)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-indigo-900">{fmtN(totKg,1)}</td>
                  <td className="px-3 py-2 text-right text-indigo-700">100%</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums" colSpan={2}>{fmt(Math.round(wtdAvg))} wtd</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-indigo-900">{fmt(Math.round(wtdTot))}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-indigo-900">{fmt(Math.round(totPerM))}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-indigo-900">{fmt(Math.round(totPerCum))}</td>
                </tr>
                <tr className="bg-indigo-700">
                  <td className="px-3 py-2 text-white font-bold text-[11px]" colSpan={9}>
                    Total Steel Cost — {fmtN(totKg,1)} kg × {fmt(Math.round(wtdTot))}/MT
                  </td>
                  <td className="px-3 py-2 text-white font-bold text-sm text-right tabular-nums" colSpan={2}>
                    {fmt(Math.round(totKg * wtdTot / 1000))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* ══ B. CONCRETE RATE ANALYSIS ══ */}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">B. Concrete Rate Analysis</p>
        <Card title="Concrete — Grade-wise Rate Analysis" subtitle="Per element · per running metre · per cubic metre" hdr="bg-slate-700 text-white">
          <FilterRow filters={[
            { label: "Zone",    options: ZONES,  value: cnZone,  onChange: setCnZone  },
            { label: "Grade",   options: GRADES, value: cnGrade, onChange: setCnGrade },
            { label: "Element", options: ELEMS,  value: cnElem,  onChange: setCnElem  },
          ]} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  {["Element / Location","Grade","Qty/RM (m³)","Rate ₹/m³","Cost ₹/RM","Total Qty (m³)","Total Cost (₹)"].map(h => (
                    <th key={h} className="px-3 py-2 text-right first:text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {concRows.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? "" : "bg-slate-50/60"}>
                    <td className="px-3 py-1.5 border-b border-slate-100 font-medium text-slate-700 max-w-[220px]">{r.elem}</td>
                    <td className={`px-3 py-1.5 border-b border-slate-100 text-right font-semibold ${r.grade === "M15" ? "text-teal-700" : "text-slate-800"}`}>{r.grade}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{fmtN(r.volRM, 3)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{fmt(r.rateM3)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums font-medium text-slate-800">{fmt(Math.round(r.costRM))}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-slate-500">{fmtN(r.qty, 2)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums font-semibold text-slate-800">{fmt(Math.round(r.qty * r.rateM3))}</td>
                  </tr>
                ))}
                {concRows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-xs">No data for selected filters</td></tr>
                )}
              </tbody>
              {concRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-700">
                    <td className="px-3 py-2 text-white font-bold text-[11px]" colSpan={4}>Concrete Sub-total</td>
                    <td className="px-3 py-2 text-white font-bold text-right tabular-nums">{fmt(Math.round(concRows.reduce((s,r)=>s+r.costRM,0)))}/RM</td>
                    <td className="px-3 py-2 text-white font-semibold text-right tabular-nums">{fmtN(concRows.reduce((s,r)=>s+r.qty,0),2)} m³</td>
                    <td className="px-3 py-2 text-white font-bold text-right tabular-nums">{fmt(Math.round(concRows.reduce((s,r)=>s+r.qty*r.rateM3,0)))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {/* Grade cards */}
          <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200">
            {(cnGrade === "All" ? ["M30","M15"] : [cnGrade]).map(grade => {
              const rateData: { label: string; val: number }[] =
                grade === "M30"
                  ? [
                      { label: "Cement (380 kg/m³)", val: 3079 }, { label: "CA 20mm (60%)", val: 978 },
                      { label: "CA 10mm (30%)", val: 412 }, { label: "Fine Aggregate", val: 338 },
                      { label: "Admixture", val: 129 }, { label: "Batching Plant", val: 620 },
                      { label: "Pump Placement", val: 480 }, { label: "Curing (7d)", val: 82 },
                      { label: "Formwork & Staging", val: 645 }, { label: "Wastage (2%)", val: 99 },
                      { label: "Overhead (8%)", val: 549 }, { label: "Margin (10%)", val: 741 }, { label: "Escalation (2%)", val: 163 },
                    ]
                  : [
                      { label: "Cement (250 kg/m³)", val: 2025 }, { label: "CA 20mm (100%)", val: 960 },
                      { label: "Fine Aggregate", val: 375 }, { label: "Batching Plant", val: 580 },
                      { label: "PCC Laying Rate", val: 150 }, { label: "Curing (5d)", val: 58 },
                      { label: "Edge Formwork", val: 95 }, { label: "Wastage (2%)", val: 67 },
                      { label: "Overhead (8%)", val: 345 }, { label: "Margin (10%)", val: 466 }, { label: "Escalation (2%)", val: 102 },
                    ];
              return (
                <div key={grade} className="p-4">
                  <p className={`text-[11px] font-bold mb-2 ${grade==="M15"?"text-teal-700":"text-slate-700"}`}>
                    {grade} Breakdown — {CONC_RATE[grade] ? fmt(CONC_RATE[grade]) : "—"}/m³
                  </p>
                  <div className="space-y-0.5">
                    {rateData.map((d, i) => (
                      <div key={i} className="flex justify-between text-[11px]">
                        <span className="text-slate-500">{d.label}</span>
                        <span className="tabular-nums font-medium">{fmt(d.val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ══ C. EARTHWORK ══ */}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">C. Earthwork Rate Analysis</p>
        <Card title="Earthwork — Excavation & Backfilling" subtitle="Cavity + working space breakdown by zone" hdr="bg-rose-700 text-white">
          <FilterRow filters={[
            { label: "Zone", options: ZONES, value: exZone, onChange: setExZone },
          ]} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  {["Zone","Drain H (m)","Cavity qty/RM (m³)","Working Space /RM (m³)","Total Exc /RM (m³)","Rate ₹/m³","Exc ₹/RM","Bkf Qty /RM (m³)","Bkf Rate","Bkf ₹/RM","Net ₹/RM"].map(h => (
                    <th key={h} className="px-2.5 py-2 text-right first:text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {excRows.map((r, i) => {
                  const h = r.zone.includes("1.20") ? 1.20 : 1.80;
                  const bkfVol = r.total * 0.58;
                  const excAmt = r.total * 213;
                  const bkfAmt = bkfVol * 115;
                  return (
                    <tr key={i} className={i%2===0?"":"bg-slate-50/60"}>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 font-medium text-slate-700 max-w-[160px] truncate">{r.zone.split("(")[0].trim()}</td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 text-right tabular-nums">{h.toFixed(2)}</td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 text-right tabular-nums">{fmtN(r.cavity,3)}</td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 text-right tabular-nums text-amber-700">{fmtN(r.ws,3)}</td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 text-right tabular-nums font-semibold">{fmtN(r.total,3)}</td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 text-right tabular-nums">₹213</td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 text-right tabular-nums font-medium text-rose-700">{fmt(Math.round(excAmt))}</td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 text-right tabular-nums">{fmtN(bkfVol,3)}</td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 text-right tabular-nums">₹115</td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 text-right tabular-nums font-medium text-rose-700">{fmt(Math.round(bkfAmt))}</td>
                      <td className="px-2.5 py-1.5 border-b border-slate-100 text-right tabular-nums font-bold text-slate-900">{fmt(Math.round(excAmt+bkfAmt))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-rose-700">
                  <td className="px-3 py-2 text-white font-bold text-[11px]" colSpan={6}>Total Earthwork ₹/RM (length-wtd)</td>
                  <td className="px-3 py-2 text-white font-bold text-right" colSpan={5}>
                    {fmt(Math.round(excRows.reduce((s,r) => {
                      const excAmt = r.total * 213;
                      const bkfAmt = r.total * 0.58 * 115;
                      return s + (excAmt + bkfAmt);
                    }, 0) / (excRows.length || 1)))} /RM avg
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* ══ D. FIXTURES ══ */}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">D. Fixtures — Individual Rate Analysis</p>
        <Card title="Fixtures — Each Item Individually" subtitle="Rate per item · spacing · cost per RM" hdr="bg-sky-700 text-white">
          <FilterRow filters={[
            { label: "Zone", options: ZONES, value: fxZone, onChange: setFxZone },
            { label: "Item", options: FIXTURES.map(f=>f.item), value: fxItem, onChange: setFxItem },
          ]} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  {["Item","Specification","Spacing (m c/c)","nos/RM","Rate ₹/nos","₹/RM (Zone 1)","₹/RM (Zone 2)"].map(h => (
                    <th key={h} className="px-3 py-2 text-right first:text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeFx.map((f, i) => (
                  <tr key={i} className={i%2===0?"":"bg-slate-50/60"}>
                    <td className="px-3 py-1.5 border-b border-slate-100 font-semibold text-sky-700">{f.item}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-slate-500 max-w-[180px]">{f.spec}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{f.spacing.toFixed(1)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{(1/f.spacing).toFixed(3)}</td>
                    <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{fmt(f.rateNos)}</td>
                    {activeFxZones.includes("Zone 1 (H=1.20m, 0–450m)") || fxZone==="All"
                      ? <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums font-medium text-sky-800">{fmt(Math.round(f.rateNos / f.spacing))}</td>
                      : <td className="px-3 py-1.5 border-b border-slate-100 text-right text-slate-300">—</td>}
                    {activeFxZones.includes("Zone 2 (H=1.80m, 450–770m)") || fxZone==="All"
                      ? <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums font-medium text-sky-800">{fmt(Math.round(f.rateNos / f.spacing))}</td>
                      : <td className="px-3 py-1.5 border-b border-slate-100 text-right text-slate-300">—</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-sky-700">
                  <td className="px-3 py-2 text-white font-bold text-[11px]" colSpan={5}>Total Fixtures ₹/RM</td>
                  <td className="px-3 py-2 text-white font-bold text-right tabular-nums">{fmt(activeFx.reduce((s,f)=>s+Math.round(f.rateNos/f.spacing),0))}</td>
                  <td className="px-3 py-2 text-white font-bold text-right tabular-nums">{fmt(activeFx.reduce((s,f)=>s+Math.round(f.rateNos/f.spacing),0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* ══ E. PER-RM RATE CARD ══ */}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">E. Per Running Metre Rate Card</p>
        <Card title="Per-RM Rate Card — Zone-wise" subtitle="All costs per running metre of drain" hdr="bg-amber-700 text-white">
          <FilterRow filters={[
            { label: "Zone",    options: ZONES, value: rmZone, onChange: setRmZone },
            { label: "Element", options: ELEMS, value: rmElem, onChange: setRmElem },
          ]} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  {["Item","Zone","Qty/RM","Unit","Rate","₹/RM"].map(h=>(
                    <th key={h} className="px-3 py-2 text-right first:text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRmZones.flatMap(zone => {
                  type RowData = {label:string;zoneLbl:string;qty:string;unit:string;rate:string;cost:number;bold?:boolean;sub?:boolean};
                  const rows: RowData[] = [];
                  activeRmElems.forEach(elem => {
                    const vol = VOL_RM[zone]?.[elem] ?? 0;
                    const grade = ELEM_GRADE[elem];
                    const rate = CONC_RATE[grade];
                    rows.push({ label:`${elem} (${grade})`, zoneLbl:zone.split("(")[0].trim(), qty:fmtN(vol,3), unit:"m³/RM", rate:`${fmt(rate)}/m³`, cost:vol*rate });
                  });
                  const concSub = activeRmElems.reduce((s,e)=>s+(VOL_RM[zone]?.[e]??0)*CONC_RATE[ELEM_GRADE[e]],0);
                  if (rmElem==="All") rows.push({ label:"— Concrete Sub-total", zoneLbl:"", qty:"", unit:"", rate:"", cost:concSub, bold:true, sub:true });
                  const excD = EXC_DATA[zone];
                  const excTotal = excD?(excD.cavity+excD.ws)*213:0;
                  const bkfTotal = excD?(excD.cavity+excD.ws)*0.58*115:0;
                  rows.push({ label:"Excavation (incl. WS)", zoneLbl:zone.split("(")[0].trim(), qty:fmtN(excD?excD.cavity+excD.ws:0,3), unit:"m³/RM", rate:"₹213/m³", cost:excTotal });
                  rows.push({ label:"Backfilling (compacted)", zoneLbl:zone.split("(")[0].trim(), qty:fmtN(excD?(excD.cavity+excD.ws)*0.58:0,3), unit:"m³/RM", rate:"₹115/m³", cost:bkfTotal });
                  const stTotal = steelRows.reduce((s,r)=>s+r.perM,0);
                  rows.push({ label:"Steel — all dias", zoneLbl:zone.split("(")[0].trim(), qty:fmtN(steelRows.reduce((s,r)=>s+r.kgRM,0),3), unit:"kg/RM", rate:`₹${fmt(Math.round(wtdTot))}/MT`, cost:stTotal });
                  const fxTotal = FIXTURES.reduce((s,f)=>s+f.rateNos/f.spacing,0);
                  rows.push({ label:"Fixtures — all items", zoneLbl:zone.split("(")[0].trim(), qty:"", unit:"nos/RM", rate:"lump", cost:fxTotal });
                  return rows.map((r, i) => (
                    <tr key={`${zone}-${i}`} className={r.sub ? "bg-amber-50" : i%2===0 ? "" : "bg-slate-50/60"}>
                      <td className={`px-3 py-1.5 border-b border-slate-100 ${r.bold?"font-bold text-amber-800":"font-medium text-slate-700"}`}>{r.label}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-right text-slate-400 text-[11px]">{r.zoneLbl}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{r.qty}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-right text-slate-400">{r.unit}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-slate-500">{r.rate}</td>
                      <td className={`px-3 py-1.5 border-b border-slate-100 text-right tabular-nums ${r.bold?"font-bold text-amber-900":"font-medium text-amber-700"}`}>{fmt(Math.round(r.cost))}</td>
                    </tr>
                  ));
                })}
              </tbody>
              <tfoot>
                <tr className="bg-amber-700">
                  <td className="px-3 py-2 text-white font-bold text-[11px]" colSpan={5}>Grand Total ₹/RM</td>
                  <td className="px-3 py-2 text-white font-bold text-sm text-right tabular-nums">
                    {fmt(Math.round(activeRmZones.reduce((s,zone) => {
                      const concSub = activeRmElems.reduce((cs,e)=>cs+(VOL_RM[zone]?.[e]??0)*CONC_RATE[ELEM_GRADE[e]],0);
                      const excD = EXC_DATA[zone];
                      const earth = excD ? (excD.cavity+excD.ws)*213 + (excD.cavity+excD.ws)*0.58*115 : 0;
                      const steel = steelRows.reduce((ss,r)=>ss+r.perM,0);
                      const fx = FIXTURES.reduce((fs,f)=>fs+f.rateNos/f.spacing,0);
                      return s + concSub + earth + steel + fx;
                    }, 0) / (activeRmZones.length||1)))}/RM
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* ══ F. BOQ ══ */}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">F. Bill of Quantities & Quote</p>
        <Card title="Bill of Quantities — NH 65 Drain" subtitle="Location-wise · all items" hdr="bg-amber-700 text-white">
          {/* BOQ pills — kept separate from rate analysis above */}
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Location</span>
                {["All","Zone 1","Zone 2"].map(opt => (
                  <Pill key={opt} label={opt} active={bqZone===opt} onClick={()=>setBqZone(opt)} />
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Category</span>
                {["All","Concrete","Steel","Earthwork","Fixtures"].map(opt => (
                  <Pill key={opt} label={opt} active={bqCat===opt} onClick={()=>setBqCat(opt)} />
                ))}
              </div>
            </div>
          </div>
          {Object.entries(bqGrouped).map(([zone, rows]) => (
            <div key={zone}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 pt-3 pb-1 bg-slate-50 border-b border-slate-200">{zone}</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="px-3 py-1.5 text-center font-semibold w-8">S.No</th>
                    <th className="px-4 py-1.5 text-left font-semibold">Description</th>
                    <th className="px-3 py-1.5 text-center font-semibold">Cat</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Qty</th>
                    <th className="px-3 py-1.5 text-center font-semibold">Unit</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Rate (₹)</th>
                    <th className="px-4 py-1.5 text-right font-semibold">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={i%2===0?"":"bg-slate-50/50"}>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-center text-slate-400">{r.sno}</td>
                      <td className="px-4 py-1.5 border-b border-slate-100 text-slate-700 leading-tight">{r.desc}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-center">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                          r.cat==="Concrete"?"bg-slate-100 text-slate-600":r.cat==="Steel"?"bg-indigo-100 text-indigo-700":
                          r.cat==="Earthwork"?"bg-rose-100 text-rose-700":"bg-sky-100 text-sky-700"}`}>{r.cat}</span>
                      </td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{r.qty.toFixed(2)}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-center text-slate-500">{r.unit}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums">{fmt(r.rate)}</td>
                      <td className="px-4 py-1.5 border-b border-slate-100 text-right tabular-nums font-medium">{fmt(Math.round(r.qty*r.rate))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-50">
                    <td colSpan={6} className="px-4 py-2 text-amber-800 font-semibold text-right text-[11px]">{zone} Sub-total</td>
                    <td className="px-4 py-2 text-amber-900 font-bold text-right tabular-nums">{fmt(Math.round(rows.reduce((s,r)=>s+r.qty*r.rate,0)))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
          {bqFiltered.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-400 text-xs">No items match selected filters</div>
          )}
          <div className="bg-slate-800 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-sm uppercase tracking-wide">Project Grand Total</p>
              <p className="text-slate-400 text-[11px] mt-0.5">NH 65 Drain · 770 RM · {bqCat !== "All" ? bqCat : "All categories"}</p>
            </div>
            <div className="text-right">
              <p className="text-amber-400 font-bold text-xl tabular-nums">{fmt(Math.round(bqGrandTotal))}</p>
              <p className="text-slate-400 text-[11px]">{fmt(Math.round(bqGrandTotal/770))} /RM avg</p>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
