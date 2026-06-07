import { useState, ReactNode } from "react";

const C = {
  navy: "#0f1c35",
  navyMid: "#1a2f52",
  amber: "#ffb703",
  amberBg: "rgba(255,183,3,0.12)",
  navText: "rgba(255,255,255,0.72)",
  navGroup: "rgba(255,255,255,0.32)",
  navActiveBorder: "#ffb703",
  bg: "#f3f4f6",
  white: "#ffffff",
  border: "#e5e7eb",
  muted: "#6b7280",
  text: "#111827",
  sub: "#374151",
  green: "#16a34a",
  blue: "#2563eb",
  red: "#dc2626",
};

type NavItem = { id: string; label: string; badge?: "new" | "restored" | "split" | "renamed" };
type Group = { group: string; items: NavItem[] };

const NAV: Group[] = [
  {
    group: "Project",
    items: [
      { id: "project-detail", label: "① Project / Work Detail", badge: "renamed" },
    ],
  },
  {
    group: "Rate Inputs",
    items: [
      { id: "mix-types",     label: "② Mix Types" },
      { id: "raw-materials", label: "③ Raw Materials" },
      { id: "plant-equip",   label: "④ Plant Equipment" },
      { id: "fuel-energy",   label: "⑤ Fuel / LDO / HSD" },
      { id: "transport",     label: "⑥ Transportation",       badge: "split" },
      { id: "prime-tack",    label: "⑦ Prime & Tack Coats",   badge: "new" },
      { id: "laying",        label: "⑧ Laying & Compaction",  badge: "new" },
      { id: "overhead",      label: "⑨ Overhead & Margin",    badge: "split" },
    ],
  },
  {
    group: "Analysis",
    items: [
      { id: "scope",      label: "⑩ Detailed Scope of Work",  badge: "new" },
      { id: "rec-quote",  label: "⑪ Recommended Quote" },
      { id: "procurement", label: "⑫ Procurement Costs",      badge: "restored" },
      { id: "price-impact", label: "⑬ Price Impact" },
      { id: "profitability", label: "⑭ Profitability" },
      { id: "summary",    label: "⑮ Summary & Print" },
    ],
  },
];

const ALL_IDS = NAV.flatMap(g => g.items.map(i => i.id));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, sub }: { icon?: string; title: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <div style={{ width: 4, height: 28, background: C.amber, borderRadius: 2, flexShrink: 0 }} />
      <div>
        <h1 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{icon ? `${icon} ` : ""}{title}</h1>
        <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>{sub}</p>
      </div>
    </div>
  );
}

function Card({ title, accent, children }: { title?: string; accent?: string; children: ReactNode }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${accent ?? C.border}`, borderRadius: 8, marginBottom: 14, overflow: "hidden" }}>
      {title && <div style={{ padding: "8px 14px", background: accent ? `${accent}14` : "#f9fafb", borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 12.5, color: C.text }}>{title}</div>}
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function FG({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 14px", marginBottom: 6 }}>{children}</div>;
}

function F({ label, value, placeholder, span }: { label: string; value?: string; placeholder?: string; span?: number }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: C.sub, marginBottom: 3 }}>{label}</label>
      <input readOnly value={value ?? ""} placeholder={placeholder} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", fontSize: 11.5, color: C.text, background: C.white, boxSizing: "border-box" }} />
    </div>
  );
}

function Tbl({ heads, rows, highlight }: { heads: string[]; rows: (string | ReactNode)[][]; highlight?: number }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
      <thead>
        <tr style={{ background: "#f9fafb" }}>
          {heads.map(h => <th key={h} style={{ padding: "6px 10px", fontWeight: 600, color: C.sub, textAlign: "left", borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: i === highlight ? "#fefce8" : i % 2 === 0 ? C.white : "#fafafa", borderBottom: `1px solid #f3f4f6` }}>
            {row.map((cell, j) => (
              <td key={j} style={{ padding: "6px 10px", color: C.text }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AmberBadge({ label }: { label: string }) {
  return <span style={{ background: C.amber, color: "#000", fontSize: 8.5, padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>{label}</span>;
}

function InfoBanner({ children }: { children: ReactNode }) {
  return <div style={{ padding: "9px 13px", background: "#fefce8", border: `1px solid #fde68a`, borderRadius: 7, fontSize: 11.5, color: "#78350f", marginBottom: 14 }}>{children}</div>;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid #f3f4f6`, fontSize: 11.5 }}>
      <span style={{ color: C.sub }}>{label}</span>
      <span style={{ color: C.text, fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  );
}

// ─── Section Content ──────────────────────────────────────────────────────────

function SProjectDetail() {
  return (
    <>
      <SectionHeader title="① Project / Work Detail" sub="Client info, project details, and job estimator — merged into one section" />
      <InfoBanner>🔄 <strong>Renamed + merged:</strong> Was "Quote Setup" + "Job Estimator" (two separate sections). Now one section with project info at the top, estimator below.</InfoBanner>
      <Card title="Project & Client Info">
        <FG>
          <F label="Project Name" value="NH-48 Bridge Approach Works" span={2} />
          <F label="Date" value="07-Jun-2026" />
          <F label="Contractor / Company" value="HLC Pvt Ltd" />
          <F label="Prepared By" value="Krishna R." />
          <F label="Contact Phone" placeholder="+91 XXXXX XXXXX" />
        </FG>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid #f3f4f6` }}>
          <label style={{ fontSize: 10.5, fontWeight: 600, color: C.sub, display: "block", marginBottom: 6 }}>Quote Mode</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[["Full Scope (HLC supplies all)", true], ["HLC supplies mix only", false], ["HLC lays only", false]].map(([label, active]) => (
              <button key={label as string} style={{ padding: "5px 12px", fontSize: 11.5, borderRadius: 5, border: `1px solid ${active ? C.amber : C.border}`, background: active ? C.amber : C.white, color: active ? "#000" : C.sub, fontWeight: active ? 700 : 400, cursor: "pointer" }}>{label as string}</button>
            ))}
          </div>
        </div>
      </Card>
      <Card title="Job Estimator — Sites & Jobs" accent={C.amber}>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 7, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ background: "#f9fafb", padding: "7px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 12.5, flex: 1 }}>📍 Site 1 — Km 12+400 to 14+600</span>
            <span style={{ fontSize: 11, color: C.muted }}>Lead: 18 km</span>
          </div>
          <div style={{ padding: "8px 12px" }}>
            <Tbl
              heads={["Mix Type", "Method", "Area (m²)", "Thickness (mm)", "MT"]}
              rows={[
                ["DBM Gr II", "Geometry", "12,000", "75", <b>1,620</b>],
                ["BC Gr II", "Geometry", "12,000", "40", <b>864</b>],
              ]}
            />
            <button style={{ marginTop: 8, width: "100%", border: `1px dashed ${C.border}`, background: "none", borderRadius: 5, padding: "5px", fontSize: 11, color: C.muted, cursor: "pointer" }}>+ Add Job</button>
          </div>
        </div>
        <button style={{ background: C.amber, border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Add Site</button>
        <div style={{ marginTop: 12, display: "flex", gap: 16, padding: "9px 12px", background: "#fefce8", border: `1px solid #fde68a`, borderRadius: 7 }}>
          {[["2,484 MT", "Total MT"], ["12,000 m²", "Total Area"], ["1 Site", "Sites"], ["2 Jobs", "Jobs"]].map(([v, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#92400e" }}>{v}</div>
              <div style={{ fontSize: 9.5, color: "#a16207" }}>{l}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function SMixTypes() {
  return (
    <>
      <SectionHeader title="② Mix Types" sub="Define each mix grade — compaction factor, density, and bitumen content" />
      <Card>
        <Tbl
          heads={["Mix Grade", "Type", "Density (t/m³)", "Comp. Factor", "Bitumen %", "Filler %", ""]}
          rows={[
            ["DBM Gr II", "Dense Bituminous Macadam", "2.35", "1.30", "4.5%", "—", <AmberBadge label="Active" />],
            ["BC Gr II", "Bituminous Concrete", "2.40", "1.28", "5.4%", "2%", <AmberBadge label="Active" />],
            ["WMM", "Wet Mix Macadam", "2.20", "1.25", "—", "—", ""],
          ]}
        />
        <button style={{ marginTop: 10, border: `1px dashed ${C.border}`, background: "none", borderRadius: 5, padding: "6px 14px", fontSize: 11.5, color: C.muted, cursor: "pointer" }}>+ Add Mix Type</button>
      </Card>
    </>
  );
}

function SRawMaterials() {
  return (
    <>
      <SectionHeader title="③ Raw Materials" sub="Material rates per MT used in ex-plant cost computation" />
      <Card title="Aggregate Fractions">
        <Tbl
          heads={["Material", "Size / Grade", "Source", "Rate (₹/MT)", "Wastage %"]}
          rows={[
            ["Stone Aggregate", "40 mm", "Crusher — Manpur", "₹ 820", "2%"],
            ["Stone Aggregate", "20 mm", "Crusher — Manpur", "₹ 860", "2%"],
            ["Stone Aggregate", "10 mm", "Crusher — Manpur", "₹ 920", "1.5%"],
            ["Stone Dust", "0–4 mm", "Crusher — Manpur", "₹ 680", "1%"],
            ["Lime / Filler", "—", "Local supplier", "₹ 4,200", "0.5%"],
          ]}
        />
      </Card>
      <Card title="Bitumen">
        <Tbl
          heads={["Grade", "Supplier", "Rate (₹/MT)", "Mode"]}
          rows={[
            ["VG30", "HPCL", "₹ 62,500", "Drum"],
            ["PMB 40", "CRMB Supplier", "₹ 78,000", "Drum"],
          ]}
        />
      </Card>
    </>
  );
}

function SPlantEquip() {
  return (
    <>
      <SectionHeader title="④ Plant Equipment" sub="Shift costs and hourly rates for HMP and paving equipment" />
      <Card>
        <Tbl
          heads={["Equipment", "Type", "Shift Cost (₹)", "Output/Shift", "Cost/MT"]}
          rows={[
            ["Drum Mix Plant 80T", "HMP", "₹ 18,500", "80 MT", "₹ 231"],
            ["Hot Storage Silo", "HMP", "₹ 2,200", "—", "₹ 28"],
            ["Payloader (Aggr.)", "HMP", "₹ 4,800", "—", "₹ 60"],
            ["Generator 125 KVA", "HMP", "₹ 3,600", "—", "₹ 45"],
          ]}
        />
      </Card>
    </>
  );
}

function SFuelEnergy() {
  return (
    <>
      <SectionHeader title="⑤ Fuel / LDO / HSD" sub="LDO for dryer burner, diesel for equipment and vehicles" />
      <Card title="LDO — Dryer Burner">
        <FG>
          <F label="LDO Rate (₹/L)" value="₹ 68.50" />
          <F label="Consumption (L/MT)" value="8.5" />
          <F label="LDO Cost / MT" value="₹ 582.25" />
        </FG>
      </Card>
      <Card title="HSD — Equipment / Boiler">
        <FG>
          <F label="HSD Rate (₹/L)" value="₹ 92.00" />
          <F label="Boiler Consumption (L/shift)" value="42" />
          <F label="Equipment Avg (L/shift)" value="28" />
        </FG>
      </Card>
    </>
  );
}

function STransport() {
  return (
    <>
      <SectionHeader title="⑥ Transportation" sub="Haulage from plant to site — tipper rate, lead distance, fleet size" />
      <InfoBanner>✂️ <strong>Split section:</strong> Previously combined with Prime & Tack Coats in "Transport & Coat". Now transport is its own section with focused inputs.</InfoBanner>
      <Card>
        <FG>
          <F label="Lead Distance (km)" value="18" />
          <F label="Tipper Rate (₹/trip)" value="₹ 1,850" />
          <F label="Tipper Capacity (MT)" value="10" />
          <F label="Fleet Size (tippers)" value="6" />
          <F label="Trips/Day per Tipper" value="4" />
          <F label="Haulage Cost / MT" value="₹ 185.00" />
        </FG>
      </Card>
      <Card title="Per Mix Type">
        <Tbl
          heads={["Mix", "Haulage ₹/MT", "MT", "Total Haulage"]}
          rows={[
            ["DBM Gr II", "₹ 185", "1,620", "₹ 2,99,700"],
            ["BC Gr II", "₹ 185", "864", "₹ 1,59,840"],
          ]}
        />
      </Card>
    </>
  );
}

function SPrimeTack() {
  return (
    <>
      <SectionHeader title="⑦ Prime & Tack Coats" sub="Emulsion application rates and costs — new dedicated section" />
      <InfoBanner>🆕 <strong>New section:</strong> Prime & Tack Coats were buried inside "Transport & Coat". Now a focused, standalone form.</InfoBanner>
      <Card title="Prime Coat">
        <FG>
          <F label="Emulsion Type" value="SS-1 Bitumen Emulsion" />
          <F label="Application Rate (kg/m²)" value="0.90" />
          <F label="Emulsion Rate (₹/kg)" value="₹ 42.00" />
          <F label="Area (m²)" value="12,000" />
          <F label="Total Quantity (kg)" value="10,800" />
          <F label="Prime Coat Cost" value="₹ 4,53,600" />
        </FG>
      </Card>
      <Card title="Tack Coat">
        <FG>
          <F label="Emulsion Type" value="RS-1 Rapid Set" />
          <F label="Application Rate (kg/m²)" value="0.30" />
          <F label="Emulsion Rate (₹/kg)" value="₹ 38.00" />
          <F label="Area (m²)" value="12,000" />
          <F label="Total Quantity (kg)" value="3,600" />
          <F label="Tack Coat Cost" value="₹ 1,36,800" />
        </FG>
      </Card>
    </>
  );
}

function SLaying() {
  return (
    <>
      <SectionHeader title="⑧ Laying & Compaction" sub="Paving crew, rollers, and finishing — new dedicated section" />
      <InfoBanner>🆕 <strong>New section:</strong> Laying costs were mixed inside "Labour & Overhead". Now a focused form showing exactly what laying contributes to the per-MT rate.</InfoBanner>
      <Card title="Paving Equipment">
        <Tbl
          heads={["Equipment", "Shift Cost (₹)", "Shifts Needed", "Total"]}
          rows={[
            ["Sensor Paver", "₹ 9,500", "32", "₹ 3,04,000"],
            ["Vibratory Roller 10T", "₹ 5,200", "32", "₹ 1,66,400"],
            ["Static Roller 8T", "₹ 3,800", "32", "₹ 1,21,600"],
            ["Tandem Roller", "₹ 4,200", "32", "₹ 1,34,400"],
          ]}
        />
      </Card>
      <Card title="Laying Labour">
        <FG>
          <F label="Crew Size" value="12 workers" />
          <F label="Labour Rate (₹/shift)" value="₹ 6,500" />
          <F label="Total Labour Cost" value="₹ 2,08,000" />
          <F label="Total Laying Cost" value="₹ 9,34,400" />
          <F label="Total MT" value="2,484" />
          <F label="Laying Cost / MT" value="₹ 376.16" />
        </FG>
      </Card>
    </>
  );
}

function SOverhead() {
  return (
    <>
      <SectionHeader title="⑨ Overhead & Margin" sub="Overhead percentage and profit margin — feeds into Recommended Quote" />
      <InfoBanner>✂️ <strong>Split section:</strong> Overhead was buried in "Labour & Overhead". Now it's a standalone input that clearly connects to the quote calculation.</InfoBanner>
      <Card title="Overhead Costs">
        <FG>
          <F label="Overhead %" value="12%" />
          <F label="Applied On" value="Ex-plant rate" />
          <F label="Overhead / MT (DBM)" value="₹ 588.00" />
        </FG>
        <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>Overhead includes: site supervision, insurance, bank guarantee, mobilisation, and head-office costs.</div>
      </Card>
      <Card title="Profit Margin">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[["Minimum Profit", "5%", "#dcfce7", "#166534"], ["Target Profit", "8%", "#fefce8", "#92400e"], ["Premium Profit", "12%", "#fdf4ff", "#7e22ce"]].map(([label, pct, bg, color]) => (
            <div key={label} style={{ background: bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{pct}</div>
              <div style={{ fontSize: 10.5, color, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function SScope() {
  const groups = [
    { id: "mixing", label: "Hot Mix Production", icon: "🏭", hlc: true, items: ["Mix production", "Quality control", "Aggregate supply", "Bitumen procurement"] },
    { id: "transport", label: "Transportation to Site", icon: "🚛", hlc: true, items: ["Tipper hire & logistics", "Lead: 18 km"] },
    { id: "spraying", label: "Prime & Tack Coat", icon: "💦", hlc: false, items: ["Prime coat supply", "Prime coat spraying", "Tack coat supply", "Tack coat spraying"] },
    { id: "paving", label: "Laying & Compaction", icon: "🛣", hlc: true, items: ["Paver hire", "Roller hire", "Finishing crew"] },
    { id: "ancillary", label: "Ancillary / Other", icon: "🔧", hlc: false, items: ["Traffic management", "Survey & setting out", "Site clearance"] },
  ];
  return (
    <>
      <SectionHeader title="⑩ Detailed Scope of Work" sub="Tick what HLC is responsible for — rates filter accordingly" />
      <InfoBanner>🆕 <strong>New section:</strong> Shows at a glance what's in HLC's scope vs. contractor's scope. Right panel updates automatically.</InfoBanner>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {groups.map(g => (
          <div key={g.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ background: g.hlc ? C.navy : "#f9fafb", padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 15 }}>{g.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: g.hlc ? "#fff" : C.text }}>{g.label}</div>
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: g.hlc ? C.amberBg : "#f3f4f6", color: g.hlc ? C.amber : C.muted, border: `1px solid ${g.hlc ? "rgba(255,183,3,.3)" : C.border}` }}>{g.hlc ? "HLC Scope" : "Contractor"}</span>
            </div>
            <div style={{ padding: "8px 12px" }}>
              {g.items.map(item => (
                <label key={item} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", fontSize: 11.5, color: g.hlc ? C.text : C.muted, cursor: "pointer" }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${g.hlc ? C.amber : C.border}`, background: g.hlc ? C.amber : C.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {g.hlc && <span style={{ fontSize: 9, fontWeight: 900, color: "#000", lineHeight: 1 }}>✓</span>}
                  </div>
                  {item}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SRecQuote() {
  return (
    <>
      <SectionHeader title="⑪ Recommended Quote" sub="What to quote the client — minimum / target / premium per mix" />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        {[["5%", "Minimum", "#dcfce7", "#166534"], ["8%", "Target ⭐", "#fefce8", "#92400e"], ["12%", "Premium", "#fdf4ff", "#7e22ce"]].map(([pct, label, bg, color]) => (
          <div key={label} style={{ flex: 1, background: bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color, fontWeight: 600 }}>Profit {pct}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      <Card title="DBM Grade II — Per MT">
        <Tbl
          heads={["Component", "Minimum", "Target ⭐", "Premium"]}
          rows={[
            ["Ex-plant base (raw + plant + fuel)", "₹ 4,900", "₹ 4,900", "₹ 4,900"],
            ["+ Transportation (18 km)", "₹ 185", "₹ 185", "₹ 185"],
            ["+ Laying & Compaction", "₹ 376", "₹ 376", "₹ 376"],
            ["+ Overhead (12%)", "₹ 588", "₹ 588", "₹ 588"],
            ["Full-laid Base Rate", "₹ 6,049", "₹ 6,049", "₹ 6,049"],
            ["+ Profit", "₹ 302", "₹ 484", "₹ 726"],
            ["Quote Rate (₹/MT)", "₹ 6,351", "₹ 6,533", "₹ 6,775"],
          ]}
          highlight={6}
        />
      </Card>
      <Card title="Total Contract Value">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[["DBM 1,620 MT", "₹ 1.06 Cr", "₹ 1.09 Cr", "₹ 1.13 Cr"], ["BC 864 MT", "₹ 58.2 L", "₹ 60.0 L", "₹ 62.3 L"]].map(([label, min, tgt, prem]) => (
            <div key={label} style={{ flex: 1, background: "#f9fafb", border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                {[["Min", min], ["Target", tgt], ["Premium", prem]].map(([t, v]) => (
                  <div key={t} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9.5, color: C.muted }}>{t}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ flex: 1, background: C.navy, borderRadius: 7, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginBottom: 4 }}>Grand Total — Target</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.amber }}>₹ 1.69 Cr</div>
          </div>
        </div>
      </Card>
    </>
  );
}

function SProcurement() {
  return (
    <>
      <SectionHeader title="⑫ Procurement Costs" sub="Material quantities and budget — restored to its own nav section" />
      <InfoBanner>🔵 <strong>Restored:</strong> Procurement was previously buried deep inside "Price Impact". Now a dedicated section always reachable from the nav.</InfoBanner>
      <Card title="Aggregate Procurement">
        <Tbl
          heads={["Material", "DBM qty", "BC qty", "Total (MT)", "Rate", "Amount"]}
          rows={[
            ["40 mm aggregate", "680 MT", "—", "680 MT", "₹ 820", "₹ 5,57,600"],
            ["20 mm aggregate", "470 MT", "290 MT", "760 MT", "₹ 860", "₹ 6,53,600"],
            ["10 mm aggregate", "320 MT", "240 MT", "560 MT", "₹ 920", "₹ 5,15,200"],
            ["Stone dust", "150 MT", "120 MT", "270 MT", "₹ 680", "₹ 1,83,600"],
            ["Lime filler", "—", "46 MT", "46 MT", "₹ 4,200", "₹ 1,93,200"],
          ]}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700, fontSize: 12, color: C.text, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>Aggregate Total: ₹ 21,03,200</div>
      </Card>
      <Card title="Bitumen & Fuels">
        <Tbl
          heads={["Material", "Quantity", "Rate", "Amount"]}
          rows={[
            ["Bitumen VG30", "133 MT (1,33,000 kg)", "₹ 62,500/MT", "₹ 83,12,500"],
            ["LDO (dryer burner)", "21,114 L", "₹ 68.50/L", "₹ 14,46,309"],
            ["HSD (equipment)", "3,840 L", "₹ 92.00/L", "₹ 3,53,280"],
            ["Prime coat emulsion", "10,800 kg", "₹ 42.00/kg", "₹ 4,53,600"],
            ["Tack coat emulsion", "3,600 kg", "₹ 38.00/kg", "₹ 1,36,800"],
          ]}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700, fontSize: 12, color: C.text, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>Bitumen & Fuels Total: ₹ 1,07,02,489</div>
      </Card>
      <div style={{ background: C.navy, borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>Grand Total Procurement Budget</span>
        <span style={{ color: C.amber, fontSize: 20, fontWeight: 700 }}>₹ 1,28,05,689</span>
      </div>
    </>
  );
}

function SPriceImpact() {
  const items = [
    { label: "Raw Materials (aggregates + bitumen)", pct: 62, amt: "₹ 3,827", color: C.navy },
    { label: "Fuel & Energy (LDO + HSD)", pct: 11, amt: "₹ 678", color: "#1e40af" },
    { label: "Plant & Equipment", pct: 7, amt: "₹ 431", color: "#7c3aed" },
    { label: "Transportation", pct: 4, amt: "₹ 247", color: "#0891b2" },
    { label: "Laying & Compaction", pct: 7, amt: "₹ 432", color: "#059669" },
    { label: "Prime & Tack Coats", pct: 3, amt: "₹ 185", color: "#d97706" },
    { label: "Overhead (12%)", pct: 4, amt: "₹ 247", color: "#6b7280" },
    { label: "Profit (8%)", pct: 2, amt: "₹ 125", color: C.amber },
  ];
  return (
    <>
      <SectionHeader title="⑬ Price Impact" sub="Cost breakdown and sensitivity — where does the rate come from?" />
      <Card title="Cost Breakdown — DBM Gr II">
        {items.map(item => (
          <div key={item.label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: C.sub }}>{item.label}</span>
              <span style={{ fontWeight: 600, color: C.text }}>{item.amt} / MT ({item.pct}%)</span>
            </div>
            <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${item.pct}%`, background: item.color, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </Card>
      <Card title="Sensitivity — What if input costs change?">
        <Tbl
          heads={["Input", "±5%", "±10%", "Rate impact / MT"]}
          rows={[
            ["Bitumen price", "± ₹ 148", "± ₹ 295", "High sensitivity"],
            ["LDO rate", "± ₹ 34", "± ₹ 68", "Medium"],
            ["Aggregate rate", "± ₹ 95", "± ₹ 191", "Medium-High"],
            ["Lead distance (km)", "± ₹ 9", "± ₹ 19", "Low"],
          ]}
        />
      </Card>
    </>
  );
}

function SProfitability() {
  const mixes = [
    { label: "DBM Gr II", base: 6049, min: 6351, target: 6533, premium: 6775, mt: 1620 },
    { label: "BC Gr II", base: 6458, min: 6781, target: 6975, premium: 7234, mt: 864 },
  ];
  return (
    <>
      <SectionHeader title="⑭ Profitability" sub="Margin analysis per mix type and overall project profitability" />
      {mixes.map(mix => {
        const profMin = mix.min - mix.base;
        const profTgt = mix.target - mix.base;
        const maxProfit = 800;
        return (
          <Card key={mix.label} title={`${mix.label} — ${mix.mt} MT`}>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {[["Minimum\n5% profit", mix.min, profMin * mix.mt, "#dcfce7", "#166534"],
                ["Target ⭐\n8% profit", mix.target, profTgt * mix.mt, "#fefce8", "#92400e"],
                ["Premium\n12% profit", mix.premium, (mix.premium - mix.base) * mix.mt, "#fdf4ff", "#7e22ce"]].map(([lbl, rate, totalProfit, bg, color]) => (
                <div key={lbl as string} style={{ flex: 1, background: bg as string, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: color as string, whiteSpace: "pre-line", lineHeight: 1.3 }}>{lbl as string}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: color as string, marginTop: 4 }}>₹ {(rate as number).toLocaleString()}/MT</div>
                  <div style={{ fontSize: 10.5, color: color as string, marginTop: 2 }}>₹ {((totalProfit as number) / 100000).toFixed(1)} L profit</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6 }}>
              {[["Min", profMin, mix.min], ["Target", profTgt, mix.target], ["Premium", mix.premium - mix.base, mix.premium]].map(([lbl, profit, rate]) => (
                <div key={lbl as string} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 52, fontSize: 10.5, color: C.muted }}>{lbl as string}</span>
                  <div style={{ flex: 1, height: 10, background: "#f3f4f6", borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(((profit as number) / maxProfit) * 100, 100)}%`, background: C.amber, borderRadius: 5 }} />
                  </div>
                  <span style={{ width: 60, fontSize: 10.5, color: C.text, textAlign: "right", fontWeight: 600 }}>₹ {(profit as number).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </>
  );
}

function SSummary() {
  return (
    <>
      <SectionHeader title="⑮ Summary & Print" sub="Full project quote ready to export or share" />
      <div style={{ background: C.navy, borderRadius: 8, padding: "14px 18px", marginBottom: 14 }}>
        <div style={{ color: "rgba(255,255,255,.6)", fontSize: 11, marginBottom: 4 }}>NH-48 Bridge Approach Works — Quote Summary</div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[["DBM Gr II", "1,620 MT", "₹ 6,533/MT", "₹ 1.06 Cr"], ["BC Gr II", "864 MT", "₹ 6,975/MT", "₹ 60.3 L"]].map(([mix, qty, rate, total]) => (
            <div key={mix}>
              <div style={{ color: C.amber, fontWeight: 700, fontSize: 13 }}>{mix}</div>
              <div style={{ color: "#fff", fontSize: 12 }}>{qty} @ {rate}</div>
              <div style={{ color: "rgba(255,255,255,.6)", fontSize: 11 }}>= {total}</div>
            </div>
          ))}
          <div>
            <div style={{ color: "rgba(255,255,255,.5)", fontSize: 11 }}>Grand Total</div>
            <div style={{ color: C.amber, fontSize: 22, fontWeight: 700 }}>₹ 1.69 Cr</div>
          </div>
        </div>
      </div>
      <Card title="Scope Included in Quote">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {["✅ Hot Mix Production", "✅ Transportation (18 km)", "✅ Laying & Compaction", "❌ Prime Coat (contractor)", "❌ Tack Coat (contractor)", "❌ Traffic Management"].map(item => (
            <span key={item} style={{ background: item.startsWith("✅") ? "#f0fdf4" : "#fef2f2", color: item.startsWith("✅") ? "#166534" : "#991b1b", border: `1px solid ${item.startsWith("✅") ? "#bbf7d0" : "#fecaca"}`, borderRadius: 6, padding: "4px 10px", fontSize: 11.5 }}>{item}</span>
          ))}
        </div>
      </Card>
      <Card title="Export / Print">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["📄 PDF Quote Letter", C.amber, "#000"], ["📊 Excel Rate Workbook", "#16a34a", "#fff"], ["🖨 Print Summary", C.blue, "#fff"], ["💾 Save as Scenario", C.navy, "#fff"]].map(([label, bg, color]) => (
            <button key={label as string} style={{ background: bg as string, color: color as string, border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label as string}</button>
          ))}
        </div>
      </Card>
    </>
  );
}

const SCREENS: Record<string, () => JSX.Element> = {
  "project-detail": SProjectDetail,
  "mix-types": SMixTypes,
  "raw-materials": SRawMaterials,
  "plant-equip": SPlantEquip,
  "fuel-energy": SFuelEnergy,
  "transport": STransport,
  "prime-tack": SPrimeTack,
  "laying": SLaying,
  "overhead": SOverhead,
  "scope": SScope,
  "rec-quote": SRecQuote,
  "procurement": SProcurement,
  "price-impact": SPriceImpact,
  "profitability": SProfitability,
  "summary": SSummary,
};

// ─── Right Panel ──────────────────────────────────────────────────────────────
function RightPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: C.navy, borderRadius: 8, padding: 12 }}>
        <div style={{ color: C.amber, fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 10 }}>Rate Summary</div>
        {[["DBM Gr II", "₹ 4,900", "₹ 5,085", "₹ 5,840"],
          ["BC Gr II", "₹ 5,240", "₹ 5,425", "₹ 6,210"]].map(([label, exPlant, del, fullLaid]) => (
          <div key={label} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,.07)" }}>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 11.5, marginBottom: 5 }}>{label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
              {[["Ex-plant", exPlant], ["Delivered", del], ["Full laid", fullLaid]].map(([t, v]) => (
                <div key={t} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 8.5, color: "rgba(255,255,255,.38)" }}>{t}</div>
                  <div style={{ fontSize: 10.5, color: "#fff", fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)" }}>incl. 12% overhead</div>
      </div>

      <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: 12 }}>
        <div style={{ color: "#92400e", fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 8 }}>Recommended Quote</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 8 }}>
          {["Min", "Target ⭐", "Premium"].map(t => <div key={t} style={{ textAlign: "center", fontSize: 9, color: "#78350f", fontWeight: 600 }}>{t}</div>)}
          {["₹6,351", "₹6,533", "₹6,775"].map((v, i) => <div key={i} style={{ textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#92400e" }}>{v}</div>)}
          <div style={{ textAlign: "center", fontSize: 8.5, color: "#a16207" }}>5% profit</div>
          <div style={{ textAlign: "center", fontSize: 8.5, color: "#a16207" }}>8% profit</div>
          <div style={{ textAlign: "center", fontSize: 8.5, color: "#a16207" }}>12% profit</div>
        </div>
        <div style={{ fontSize: 9.5, color: "#a16207" }}>DBM Gr II • 12% overhead</div>
      </div>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
        <div style={{ color: C.sub, fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 8 }}>🛒 Procurement Budget</div>
        <Row label="Aggregates" value="₹ 21.0 L" />
        <Row label="Bitumen VG30" value="₹ 83.1 L" />
        <Row label="LDO (dryer)" value="₹ 14.5 L" />
        <Row label="HSD (equip)" value="₹ 3.5 L" />
        <Row label="Prime + Tack coat" value="₹ 5.9 L" />
        <div style={{ height: 1, background: C.border, margin: "7px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12.5 }}>
          <span>Grand Total</span><span>₹ 1.28 Cr</span>
        </div>
      </div>

      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 12 }}>
        <div style={{ color: "#166534", fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 8 }}>📈 Contract Value</div>
        <Row label="DBM 1,620 MT" value="₹ 1.06 Cr" />
        <Row label="BC 864 MT" value="₹ 60.3 L" />
        <div style={{ height: 1, background: "#bbf7d0", margin: "7px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13, color: "#166534" }}>
          <span>Total Quote</span><span>₹ 1.69 Cr</span>
        </div>
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────
export function MixCalcPrototype() {
  const [active, setActive] = useState("project-detail");
  const Screen = SCREENS[active] ?? SProjectDetail;

  const prev = ALL_IDS[ALL_IDS.indexOf(active) - 1];
  const next = ALL_IDS[ALL_IDS.indexOf(active) + 1];

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui,sans-serif", fontSize: 13, background: C.bg, overflow: "hidden" }}>
      {/* Sidebar */}
      <nav style={{ width: 206, background: C.navy, display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 12.5 }}>HLC Mix Calculator</div>
          <div style={{ color: "rgba(255,255,255,.38)", fontSize: 9.5, marginTop: 1 }}>Interactive Prototype — Proposed UX</div>
          <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
            <button style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 4, color: "rgba(255,255,255,.7)", fontSize: 10.5, padding: "3px 7px", cursor: "pointer" }}>📂 Open</button>
            <button style={{ background: C.amber, border: "none", borderRadius: 4, color: "#000", fontSize: 10.5, padding: "3px 7px", cursor: "pointer", fontWeight: 700 }}>＋ New</button>
          </div>
        </div>
        <div style={{ flex: 1, paddingTop: 5, paddingBottom: 14 }}>
          {NAV.map((grp, gi) => (
            <div key={gi}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.navGroup, textTransform: "uppercase", letterSpacing: ".8px", padding: "11px 14px 3px" }}>{grp.group}</div>
              {grp.items.map(item => {
                const isActive = item.id === active;
                return (
                  <button key={item.id} onClick={() => setActive(item.id)} style={{
                    width: "100%", textAlign: "left", padding: "6px 14px", background: isActive ? C.amberBg : "transparent",
                    border: "none", borderLeft: `3px solid ${isActive ? C.amber : "transparent"}`,
                    color: isActive ? C.amber : C.navText, display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12,
                  }}>
                    <span style={{ flex: 1, lineHeight: 1.3 }}>{item.label}</span>
                    {item.badge === "new" && <span style={{ background: C.green, color: "#fff", fontSize: 7.5, padding: "1px 4px", borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>NEW</span>}
                    {item.badge === "restored" && <span style={{ background: C.blue, color: "#fff", fontSize: 7.5, padding: "1px 4px", borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>REST</span>}
                    {item.badge === "split" && <span style={{ background: C.amber, color: "#000", fontSize: 7.5, padding: "1px 4px", borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>SPL</span>}
                    {item.badge === "renamed" && <span style={{ background: "#7c3aed", color: "#fff", fontSize: 7.5, padding: "1px 4px", borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>REN</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {/* Bottom badge legend */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", flexDirection: "column", gap: 4 }}>
          {[["NEW", C.green, "Added section"], ["SPL", C.amber, "Split section"], ["REST", C.blue, "Restored"], ["REN", "#7c3aed", "Renamed"]].map(([badge, bg, desc]) => (
            <div key={badge as string} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "rgba(255,255,255,.45)" }}>
              <span style={{ background: bg as string, color: (bg as string) === C.amber ? "#000" : "#fff", fontSize: 7.5, padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>{badge as string}</span>
              {desc as string}
            </div>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", background: C.white, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button onClick={() => prev && setActive(prev)} disabled={!prev} style={{ padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: prev ? C.text : "#d1d5db", cursor: prev ? "pointer" : "default", fontSize: 12 }}>← Prev</button>
          <button onClick={() => next && setActive(next)} disabled={!next} style={{ padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: next ? C.text : "#d1d5db", cursor: next ? "pointer" : "default", fontSize: 12 }}>Next →</button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 11, color: C.muted }}>
            Section {ALL_IDS.indexOf(active) + 1} of {ALL_IDS.length}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["💾 Save Draft", "rgba(0,0,0,.05)", C.text], ["📄 Export PDF", C.amber, "#000"]].map(([label, bg, color]) => (
              <button key={label as string} style={{ background: bg as string, color: color as string, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{label as string}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
            <Screen />
          </div>
          <div style={{ width: 260, overflowY: "auto", background: C.white, borderLeft: `1px solid ${C.border}`, padding: 12, flexShrink: 0 }}>
            <RightPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
