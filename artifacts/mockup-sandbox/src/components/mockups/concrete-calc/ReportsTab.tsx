import React from "react";

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (n: number, d = 2) => n.toFixed(d);

const AMBER = "bg-amber-50 border-amber-200";
const AMBER_HDR = "bg-amber-700 text-white";
const SLATE_HDR = "bg-slate-700 text-white";
const GREEN_HDR = "bg-teal-700 text-white";
const BLUE_HDR = "bg-sky-700 text-white";
const INDIGO_HDR = "bg-indigo-700 text-white";
const RED_HDR = "bg-rose-700 text-white";

function SectionCard({
  title, subtitle, headerClass, children,
}: { title: string; subtitle?: string; headerClass: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      <div className={`px-5 py-3 ${headerClass}`}>
        <p className="text-sm font-bold tracking-wide uppercase">{title}</p>
        {subtitle && <p className="text-xs opacity-75 mt-0.5">{subtitle}</p>}
      </div>
      <div className="bg-white p-0">{children}</div>
    </div>
  );
}

function RateTable({ rows, footer }: {
  rows: { label: string; val: string; unit?: string; bold?: boolean; sub?: boolean; indent?: boolean }[];
  footer?: { label: string; val: string };
}) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.sub ? "bg-slate-50" : r.bold ? "bg-amber-50" : ""}>
            <td className={`px-4 py-1.5 border-b border-slate-100 ${r.indent ? "pl-8" : ""} ${r.bold ? "font-semibold" : r.sub ? "font-medium italic" : "text-slate-700"}`}>
              {r.label}
            </td>
            <td className={`px-4 py-1.5 border-b border-slate-100 text-right tabular-nums ${r.bold ? "font-bold text-slate-900" : "text-slate-600"}`}>
              {r.val}
            </td>
            <td className="px-3 py-1.5 border-b border-slate-100 text-right text-slate-400 w-16">{r.unit ?? ""}</td>
          </tr>
        ))}
      </tbody>
      {footer && (
        <tfoot>
          <tr className="bg-amber-700">
            <td className="px-4 py-2 text-white font-bold text-xs">{footer.label}</td>
            <td className="px-4 py-2 text-white font-bold text-sm text-right tabular-nums" colSpan={2}>{footer.val}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function PerMTable({ title, rows, total }: {
  title: string;
  rows: { label: string; qty?: string; unit?: string; rate?: string; cost: number; bold?: boolean; sub?: boolean }[];
  total: number;
}) {
  return (
    <div className="mb-5">
      {title && <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 pt-3 pb-1">{title}</p>}
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className="px-4 py-2 text-left font-semibold">Item</th>
            <th className="px-3 py-2 text-right font-semibold">Qty</th>
            <th className="px-3 py-2 text-left font-semibold">Unit</th>
            <th className="px-3 py-2 text-right font-semibold">Rate</th>
            <th className="px-4 py-2 text-right font-semibold">₹/RM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.sub ? "bg-slate-50" : r.bold ? "bg-amber-50" : i % 2 === 0 ? "" : "bg-slate-50/40"}>
              <td className={`px-4 py-1.5 border-b border-slate-100 ${r.bold ? "font-semibold" : r.sub ? "font-medium text-slate-500 italic pl-8" : "text-slate-700"}`}>{r.label}</td>
              <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-slate-500">{r.qty ?? ""}</td>
              <td className="px-3 py-1.5 border-b border-slate-100 text-slate-400">{r.unit ?? ""}</td>
              <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-slate-500">{r.rate ?? ""}</td>
              <td className={`px-4 py-1.5 border-b border-slate-100 text-right tabular-nums font-medium ${r.bold ? "text-slate-900 font-bold" : "text-slate-700"}`}>{fmt(r.cost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-700">
            <td colSpan={4} className="px-4 py-2 text-white font-bold text-xs">Grand Total</td>
            <td className="px-4 py-2 text-white font-bold text-sm text-right tabular-nums">{fmt(total)}<span className="text-xs font-normal ml-1 opacity-75">/RM</span></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function BoqTable({ title, rows, subtotal }: {
  title: string;
  rows: { sno: number; desc: string; qty: number; unit: string; rate: number; amount: number }[];
  subtotal: number;
}) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 pt-3 pb-1 border-b border-slate-100">{title}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className="px-3 py-2 text-center font-semibold w-8">S.No</th>
            <th className="px-4 py-2 text-left font-semibold">Description</th>
            <th className="px-3 py-2 text-right font-semibold">Qty</th>
            <th className="px-3 py-2 text-center font-semibold">Unit</th>
            <th className="px-3 py-2 text-right font-semibold">Rate (₹)</th>
            <th className="px-4 py-2 text-right font-semibold">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? "" : "bg-slate-50/50"}>
              <td className="px-3 py-1.5 border-b border-slate-100 text-center text-slate-400">{r.sno}</td>
              <td className="px-4 py-1.5 border-b border-slate-100 text-slate-700 leading-tight">{r.desc}</td>
              <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-slate-600">{fmtD(r.qty, 2)}</td>
              <td className="px-3 py-1.5 border-b border-slate-100 text-center text-slate-500">{r.unit}</td>
              <td className="px-3 py-1.5 border-b border-slate-100 text-right tabular-nums text-slate-600">{fmt(r.rate)}</td>
              <td className="px-4 py-1.5 border-b border-slate-100 text-right tabular-nums font-medium text-slate-800">{fmt(r.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-amber-50">
            <td colSpan={5} className="px-4 py-2 text-amber-800 font-semibold text-xs text-right">Sub-Total</td>
            <td className="px-4 py-2 text-amber-900 font-bold text-sm text-right tabular-nums">{fmt(subtotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ReportsTab() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* Header */}
      <div className="bg-slate-800 text-white px-6 py-4 flex items-start justify-between print:bg-white print:text-black">
        <div>
          <h1 className="text-base font-bold tracking-wide">RATE ANALYSIS REPORT</h1>
          <p className="text-xs text-slate-300 mt-0.5">NH 65 — RCC Box Drain · Contractor: High Lane Constructions · Date: 13 Apr 2026</p>
          <div className="flex gap-3 mt-2 flex-wrap">
            <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded font-medium">Structural: M30</span>
            <span className="text-xs bg-teal-600 text-white px-2 py-0.5 rounded font-medium">PCC Blinding: M15</span>
            <span className="text-xs bg-slate-600 text-white px-2 py-0.5 rounded font-medium">Type: Drain (Covered)</span>
            <span className="text-xs bg-slate-600 text-white px-2 py-0.5 rounded font-medium">Total Length: 770 RM</span>
          </div>
        </div>
        <button className="text-xs border border-slate-500 hover:bg-slate-700 px-3 py-1.5 rounded flex items-center gap-1.5 mt-1 print:hidden">
          🖨 Print
        </button>
      </div>

      <div className="p-5 space-y-0">

        {/* ══ Section A: Concrete Rate Analysis ══ */}
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 mt-1">A. Concrete Rate Analysis</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* M30 Card */}
          <SectionCard title="M30 — Structural Concrete" subtitle="Invert Slab · Walls · Top Slab" headerClass={SLATE_HDR}>
            <RateTable
              rows={[
                { label: "Cement (380 kg/m³ × ₹405/50kg)", val: "3,079", unit: "₹/m³", indent: true },
                { label: "Coarse Aggregate 20mm (60%)", val: "978", unit: "₹/m³", indent: true },
                { label: "Coarse Aggregate 10mm (30%)", val: "412", unit: "₹/m³", indent: true },
                { label: "Fine Aggregate", val: "338", unit: "₹/m³", indent: true },
                { label: "Admixture (0.4%, ₹85/kg)", val: "129", unit: "₹/m³", indent: true },
                { label: "Raw Materials Sub-total", val: "4,936", unit: "₹/m³", sub: true },
                { label: "Batching Plant (transit hire)", val: "620", unit: "₹/m³", indent: true },
                { label: "Pump Placement", val: "480", unit: "₹/m³", indent: true },
                { label: "Curing (tanker, 7 days)", val: "82", unit: "₹/m³", indent: true },
                { label: "Formwork & Staging", val: "645", unit: "₹/m³", indent: true },
                { label: "Plant & Labour Sub-total", val: "1,827", unit: "₹/m³", sub: true },
                { label: "Material Wastage (2%)", val: "99", unit: "₹/m³", indent: true },
                { label: "Direct Cost", val: "6,862", unit: "₹/m³", sub: true },
                { label: "Overhead (8%)", val: "549", unit: "₹/m³", indent: true },
                { label: "Contractor Margin (10%)", val: "741", unit: "₹/m³", indent: true },
                { label: "Sub-total", val: "8,152", unit: "₹/m³", sub: true },
                { label: "Escalation (2%)", val: "163", unit: "₹/m³", indent: true },
              ]}
              footer={{ label: "M30 Rate", val: "₹8,315 /m³" }}
            />
          </SectionCard>

          {/* M15 PCC Card */}
          <SectionCard title="M15 — PCC Blinding Layer" subtitle="Foundation bed (100 mm thick)" headerClass={GREEN_HDR}>
            <RateTable
              rows={[
                { label: "Cement (250 kg/m³ × ₹405/50kg)", val: "2,025", unit: "₹/m³", indent: true },
                { label: "Coarse Aggregate 20mm (100%)", val: "960", unit: "₹/m³", indent: true },
                { label: "Fine Aggregate", val: "375", unit: "₹/m³", indent: true },
                { label: "Admixture", val: "—", unit: "", indent: true },
                { label: "Raw Materials Sub-total", val: "3,360", unit: "₹/m³", sub: true },
                { label: "Batching Plant", val: "580", unit: "₹/m³", indent: true },
                { label: "PCC Laying Rate (manual entry)", val: "150", unit: "₹/m³", indent: true },
                { label: "Curing (5 days)", val: "58", unit: "₹/m³", indent: true },
                { label: "Formwork (edges only)", val: "95", unit: "₹/m³", indent: true },
                { label: "Plant & Placement Sub-total", val: "883", unit: "₹/m³", sub: true },
                { label: "Material Wastage (2%)", val: "67", unit: "₹/m³", indent: true },
                { label: "Direct Cost", val: "4,310", unit: "₹/m³", sub: true },
                { label: "Overhead (8%)", val: "345", unit: "₹/m³", indent: true },
                { label: "Contractor Margin (10%)", val: "466", unit: "₹/m³", indent: true },
                { label: "Sub-total", val: "5,121", unit: "₹/m³", sub: true },
                { label: "Escalation (2%)", val: "102", unit: "₹/m³", indent: true },
              ]}
              footer={{ label: "M15 PCC Rate", val: "₹5,223 /m³" }}
            />
          </SectionCard>
        </div>

        {/* ══ Section B: Steel Rate Analysis ══ */}
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">B. Steel Rate Analysis — Dia-wise (HYSD Fe 500D)</p>
        <SectionCard title="Bar Reinforcement — All Diameters" subtitle="Based on BBS input · Fabrication & fixing included" headerClass={INDIGO_HDR}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="px-4 py-2 text-left font-semibold">Diameter</th>
                <th className="px-3 py-2 text-right font-semibold">Weight (kg)</th>
                <th className="px-3 py-2 text-right font-semibold">% of Total</th>
                <th className="px-3 py-2 text-right font-semibold">Steel ₹/MT</th>
                <th className="px-3 py-2 text-right font-semibold">Fab ₹/MT</th>
                <th className="px-3 py-2 text-right font-semibold">Total ₹/MT</th>
                <th className="px-4 py-2 text-right font-semibold">Steel ₹/m³ RCC</th>
              </tr>
            </thead>
            <tbody>
              {[
                { dia: "8 mm (stirrups)", kg: 165, pct: 10.2, steel: 58000, fab: 2200 },
                { dia: "10 mm", kg: 310, pct: 19.2, steel: 57500, fab: 2000 },
                { dia: "12 mm", kg: 580, pct: 35.9, steel: 57000, fab: 1800 },
                { dia: "16 mm", kg: 340, pct: 21.0, steel: 56500, fab: 1600 },
                { dia: "20 mm", kg: 220, pct: 13.6, steel: 55500, fab: 1400 },
              ].map((r, i) => {
                const total = r.steel + r.fab;
                const perM3 = (r.kg / 293.1) * (total / 1000);
                return (
                  <tr key={i} className={i % 2 === 0 ? "" : "bg-slate-50/50"}>
                    <td className="px-4 py-2 border-b border-slate-100 font-medium text-slate-700">{r.dia}</td>
                    <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums text-slate-600">{r.kg.toLocaleString()}</td>
                    <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums text-slate-500">{r.pct}%</td>
                    <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums text-slate-600">{fmt(r.steel)}</td>
                    <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums text-slate-500">{fmt(r.fab)}</td>
                    <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums font-semibold text-slate-800">{fmt(total)}</td>
                    <td className="px-4 py-2 border-b border-slate-100 text-right tabular-nums text-indigo-700 font-medium">{fmt(Math.round(perM3))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50">
                <td className="px-4 py-2 font-bold text-indigo-900 text-xs">Total / Weighted Avg</td>
                <td className="px-3 py-2 font-bold text-right tabular-nums text-indigo-900">1,615 kg</td>
                <td className="px-3 py-2 text-right text-indigo-700">100%</td>
                <td className="px-3 py-2 text-right font-semibold text-indigo-800" colSpan={2}>Wtd Avg ₹57,220/MT</td>
                <td className="px-3 py-2 text-right font-bold text-indigo-900">₹59,020/MT</td>
                <td className="px-4 py-2 text-right font-bold text-indigo-900">₹325/m³</td>
              </tr>
              <tr className="bg-indigo-700">
                <td className="px-4 py-2 text-white font-bold text-xs" colSpan={5}>Total Steel Cost (1,615 kg @ ₹59,020/MT incl. Binding Wire)</td>
                <td className="px-4 py-2 text-white font-bold text-sm text-right tabular-nums" colSpan={2}>₹97,319</td>
              </tr>
            </tfoot>
          </table>
        </SectionCard>

        {/* ══ Section C: Earthwork Rate Analysis ══ */}
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">C. Earthwork Rate Analysis</p>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <SectionCard title="Excavation in Hard Murrum / Rock" subtitle="Including disposal up to 50m lead" headerClass={RED_HDR}>
            <RateTable
              rows={[
                { label: "Machine excavation (JCB / Poclain)", val: "130", unit: "₹/m³", indent: true },
                { label: "Lead & disposal (< 50m)", val: "35", unit: "₹/m³", indent: true },
                { label: "Trimming & levelling (manual)", val: "15", unit: "₹/m³", indent: true },
                { label: "Direct Cost", val: "180", unit: "₹/m³", sub: true },
                { label: "Overhead (8%)", val: "14", unit: "₹/m³", indent: true },
                { label: "Margin (10%)", val: "19", unit: "₹/m³", indent: true },
              ]}
              footer={{ label: "Excavation Rate", val: "₹213 /m³" }}
            />
          </SectionCard>
          <SectionCard title="Backfilling with Approved Material" subtitle="Compacted in 200mm layers" headerClass={RED_HDR}>
            <RateTable
              rows={[
                { label: "Material (selected excavated soil)", val: "0", unit: "₹/m³", indent: true },
                { label: "Filling & spreading (manual)", val: "55", unit: "₹/m³", indent: true },
                { label: "Compaction (plate compactor)", val: "30", unit: "₹/m³", indent: true },
                { label: "Watering for compaction", val: "12", unit: "₹/m³", indent: true },
                { label: "Direct Cost", val: "97", unit: "₹/m³", sub: true },
                { label: "Overhead (8%)", val: "8", unit: "₹/m³", indent: true },
                { label: "Margin (10%)", val: "10", unit: "₹/m³", indent: true },
              ]}
              footer={{ label: "Backfill Rate", val: "₹115 /m³" }}
            />
          </SectionCard>
        </div>

        {/* ══ Section D: Fixtures ══ */}
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">D. Fixtures — Individual Rate Analysis</p>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <SectionCard title="Gratings" subtitle="ISMB 75, 200×100mm opening" headerClass={BLUE_HDR}>
            <RateTable
              rows={[
                { label: "Steel frame fabrication", val: "480", unit: "₹/nos", indent: true },
                { label: "Surface treatment (paint)", val: "85", unit: "₹/nos", indent: true },
                { label: "Installation (fixing, bedding)", val: "120", unit: "₹/nos", indent: true },
                { label: "Supply rate (market)", val: "850", unit: "₹/nos", sub: true },
                { label: "Spacing (3.0 m c/c)", val: "3.0 m", unit: "", indent: true },
              ]}
              footer={{ label: "Cost/RM", val: "₹283 /RM" }}
            />
          </SectionCard>
          <SectionCard title="Weepholes" subtitle="100mm dia uPVC pipe, 300mm L" headerClass={BLUE_HDR}>
            <RateTable
              rows={[
                { label: "uPVC pipe (100mm, 300mm L)", val: "42", unit: "₹/nos", indent: true },
                { label: "GI mesh filter behind", val: "10", unit: "₹/nos", indent: true },
                { label: "Installation in formwork", val: "13", unit: "₹/nos", indent: true },
                { label: "Supply + fix rate", val: "65", unit: "₹/nos", sub: true },
                { label: "Spacing (1.5 m c/c)", val: "1.5 m", unit: "", indent: true },
              ]}
              footer={{ label: "Cost/RM", val: "₹43 /RM" }}
            />
          </SectionCard>
          <SectionCard title="Lifting Hooks" subtitle="12mm HYSD bar, welded loop" headerClass={BLUE_HDR}>
            <RateTable
              rows={[
                { label: "12mm bar (0.8 kg × ₹57/kg)", val: "46", unit: "₹/nos", indent: true },
                { label: "Fabrication & welding", val: "65", unit: "₹/nos", indent: true },
                { label: "Fixing in top slab pour", val: "39", unit: "₹/nos", indent: true },
                { label: "Rate per hook", val: "150", unit: "₹/nos", sub: true },
                { label: "Spacing (2.0 m c/c)", val: "2.0 m", unit: "", indent: true },
              ]}
              footer={{ label: "Cost/RM", val: "₹75 /RM" }}
            />
          </SectionCard>
        </div>

        {/* ══ Section E: Per-RM Rate Card ══ */}
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">E. Per Running Metre Rate Card — Zone-wise</p>
        <SectionCard title="Per-RM Rate Card" subtitle="All costs in ₹ per Running Metre of drain" headerClass={AMBER_HDR}>
          <div className="grid grid-cols-2 gap-0 divide-x divide-slate-200">
            <div>
              <PerMTable
                title="Zone 1 — H = 1.20 m (Chainage 0–450 m)"
                rows={[
                  { label: "PCC M15 Bed (100mm)", qty: "0.015", unit: "m³/RM", rate: "₹5,223/m³", cost: 78 },
                  { label: "Invert Slab M30", qty: "0.078", unit: "m³/RM", rate: "₹8,315/m³", cost: 649 },
                  { label: "Walls M30 (2 walls)", qty: "0.180", unit: "m³/RM", rate: "₹8,315/m³", cost: 1497 },
                  { label: "Top Slab M30", qty: "0.090", unit: "m³/RM", rate: "₹8,315/m³", cost: 748 },
                  { label: "Concrete Sub-total", cost: 2972, bold: true },
                  { label: "Excavation", qty: "0.725", unit: "m³/RM", rate: "₹213/m³", cost: 154 },
                  { label: "Backfill (compacted)", qty: "0.435", unit: "m³/RM", rate: "₹115/m³", cost: 50 },
                  { label: "Earthwork Sub-total", cost: 204, bold: true },
                  { label: "Steel (HYSD, 1.85 kg/RM)", qty: "1.850", unit: "kg/RM", rate: "₹59.02/kg", cost: 109 },
                  { label: "Binding Wire (10kg/MT)", qty: "0.019", unit: "kg/RM", rate: "₹85/kg", cost: 2 },
                  { label: "Gratings (ISMB 75)", qty: "0.33", unit: "nos/RM", rate: "₹850/nos", cost: 283 },
                  { label: "Weepholes (100mm dia)", qty: "0.67", unit: "nos/RM", rate: "₹65/nos", cost: 43 },
                  { label: "Lifting Hooks (12mm)", qty: "0.50", unit: "nos/RM", rate: "₹150/nos", cost: 75 },
                ]}
                total={3688}
              />
            </div>
            <div>
              <PerMTable
                title="Zone 2 — H = 1.80 m (Chainage 450–770 m)"
                rows={[
                  { label: "PCC M15 Bed (100mm)", qty: "0.017", unit: "m³/RM", rate: "₹5,223/m³", cost: 89 },
                  { label: "Invert Slab M30", qty: "0.078", unit: "m³/RM", rate: "₹8,315/m³", cost: 649 },
                  { label: "Walls M30 (2 walls)", qty: "0.270", unit: "m³/RM", rate: "₹8,315/m³", cost: 2245 },
                  { label: "Top Slab M30", qty: "0.090", unit: "m³/RM", rate: "₹8,315/m³", cost: 748 },
                  { label: "Concrete Sub-total", cost: 3731, bold: true },
                  { label: "Excavation", qty: "0.942", unit: "m³/RM", rate: "₹213/m³", cost: 201 },
                  { label: "Backfill (compacted)", qty: "0.578", unit: "m³/RM", rate: "₹115/m³", cost: 66 },
                  { label: "Earthwork Sub-total", cost: 267, bold: true },
                  { label: "Steel (HYSD, 2.45 kg/RM)", qty: "2.450", unit: "kg/RM", rate: "₹59.02/kg", cost: 145 },
                  { label: "Binding Wire (10kg/MT)", qty: "0.025", unit: "kg/RM", rate: "₹85/kg", cost: 2 },
                  { label: "Gratings (ISMB 75)", qty: "0.33", unit: "nos/RM", rate: "₹850/nos", cost: 283 },
                  { label: "Weepholes (100mm dia)", qty: "0.67", unit: "nos/RM", rate: "₹65/nos", cost: 43 },
                  { label: "Lifting Hooks (12mm)", qty: "0.50", unit: "nos/RM", rate: "₹150/nos", cost: 75 },
                ]}
                total={4546}
              />
            </div>
          </div>
          {/* Length-weighted combined */}
          <div className="border-t border-amber-200 bg-amber-50 px-5 py-3">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">Combined — Length-Weighted Average (770 RM)</p>
            <div className="flex gap-6 text-sm">
              <div><span className="text-slate-500 text-xs">Zone 1 contribution</span><br /><span className="font-bold text-slate-800">₹3,688 × 450m</span></div>
              <div className="text-slate-300 text-xl flex items-end pb-1">+</div>
              <div><span className="text-slate-500 text-xs">Zone 2 contribution</span><br /><span className="font-bold text-slate-800">₹4,546 × 320m</span></div>
              <div className="text-slate-300 text-xl flex items-end pb-1">÷</div>
              <div><span className="text-slate-500 text-xs">Total length</span><br /><span className="font-bold text-slate-800">770 m</span></div>
              <div className="text-slate-300 text-xl flex items-end pb-1">=</div>
              <div className="bg-amber-700 text-white rounded-lg px-4 py-1.5 text-center">
                <span className="text-xs opacity-80 block">Weighted avg</span>
                <span className="font-bold text-lg">₹4,049 /RM</span>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ══ Section F: BOQ ══ */}
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">F. Bill of Quantities (Location-wise)</p>
        <SectionCard title="Bill of Quantities — NH 65 Drain" subtitle="All rates include overhead and margin" headerClass={AMBER_HDR}>
          <BoqTable
            title="Zone 1 — Chainage 0 to 450 m (H = 1.20 m)"
            rows={[
              { sno: 1, desc: "M15 PCC Blinding, 100mm thick, 1.5% extra width each side", qty: 6.75, unit: "Cum", rate: 5223, amount: 35255 },
              { sno: 2, desc: "M30 RCC Invert Slab, 300mm thick, as per drawing", qty: 35.10, unit: "Cum", rate: 8315, amount: 291857 },
              { sno: 3, desc: "M30 RCC Walls, 250mm thick (2 walls), H = 1.20m", qty: 81.00, unit: "Cum", rate: 8315, amount: 673515 },
              { sno: 4, desc: "M30 RCC Top Slab (CIS), 250mm thick", qty: 40.50, unit: "Cum", rate: 8315, amount: 336758 },
              { sno: 5, desc: "HYSD Fe 500D Rebar, fab & fix (all diameters)", qty: 0.833, unit: "MT", rate: 59020, amount: 49164 },
              { sno: 6, desc: "Excavation in all strata incl. disposal", qty: 326.25, unit: "Cum", rate: 213, amount: 69491 },
              { sno: 7, desc: "Backfilling with selected material, compacted", qty: 195.75, unit: "Cum", rate: 115, amount: 22511 },
              { sno: 8, desc: "MS Gratings (ISMB 75), 200×100 opening, fixed in position", qty: 150, unit: "Nos", rate: 850, amount: 127500 },
              { sno: 9, desc: "Weepholes — 100mm dia uPVC pipe, 300mm L, with GI mesh", qty: 300, unit: "Nos", rate: 65, amount: 19500 },
              { sno: 10, desc: "Lifting Hooks — 12mm HYSD, welded to top slab rebar", qty: 225, unit: "Nos", rate: 150, amount: 33750 },
            ]}
            subtotal={1659301}
          />
          <BoqTable
            title="Zone 2 — Chainage 450 to 770 m (H = 1.80 m)"
            rows={[
              { sno: 1, desc: "M15 PCC Blinding, 100mm thick, 1.5% extra width each side", qty: 5.44, unit: "Cum", rate: 5223, amount: 28413 },
              { sno: 2, desc: "M30 RCC Invert Slab, 300mm thick, as per drawing", qty: 24.96, unit: "Cum", rate: 8315, amount: 207542 },
              { sno: 3, desc: "M30 RCC Walls, 250mm thick (2 walls), H = 1.80m", qty: 86.40, unit: "Cum", rate: 8315, amount: 718416 },
              { sno: 4, desc: "M30 RCC Top Slab (CIS), 250mm thick", qty: 28.80, unit: "Cum", rate: 8315, amount: 239472 },
              { sno: 5, desc: "HYSD Fe 500D Rebar, fab & fix (all diameters)", qty: 0.784, unit: "MT", rate: 59020, amount: 46272 },
              { sno: 6, desc: "Excavation in all strata incl. disposal", qty: 301.44, unit: "Cum", rate: 213, amount: 64207 },
              { sno: 7, desc: "Backfilling with selected material, compacted", qty: 184.96, unit: "Cum", rate: 115, amount: 21270 },
              { sno: 8, desc: "MS Gratings (ISMB 75), 200×100 opening, fixed in position", qty: 107, unit: "Nos", rate: 850, amount: 90950 },
              { sno: 9, desc: "Weepholes — 100mm dia uPVC pipe, 300mm L, with GI mesh", qty: 213, unit: "Nos", rate: 65, amount: 13845 },
              { sno: 10, desc: "Lifting Hooks — 12mm HYSD, welded to top slab rebar", qty: 160, unit: "Nos", rate: 150, amount: 24000 },
            ]}
            subtotal={1454387}
          />
          {/* Grand Total */}
          <div className="bg-slate-800 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-sm uppercase tracking-wide">Project Grand Total — NH 65 Drain (770 RM)</p>
              <p className="text-slate-400 text-xs mt-0.5">Zone 1 (₹16,59,301) + Zone 2 (₹14,54,387)</p>
            </div>
            <div className="text-right">
              <p className="text-amber-400 font-bold text-xl tabular-nums">₹31,13,688</p>
              <p className="text-slate-400 text-xs">≈ ₹4,049 /RM weighted avg</p>
            </div>
          </div>
        </SectionCard>

      </div>
    </div>
  );
}
