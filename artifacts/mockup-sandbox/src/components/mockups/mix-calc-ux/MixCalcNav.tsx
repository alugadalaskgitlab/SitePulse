import { CalcShell, navItems, DefaultRightPanel } from "./_shared";

export function MixCalcNav() {
  return (
    <CalcShell activeId="project-detail" rightPanel={<DefaultRightPanel />}>
      <div style={{ maxWidth: 680 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>Proposed Sidebar — Nav Structure</h1>
          <p style={{ fontSize: 12.5, color: "#6b7280", margin: 0 }}>Overview of all renamed, split, and new items. Badges show what changed vs today.</p>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { color: "#16a34a", label: "NEW — added section" },
            { color: "#2563eb", label: "RESTORED — was lost, now back" },
            { color: "#ffb703", label: "SPLIT — separated from another section" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 10px" }}>
              <span style={{ background: color, color: "#fff", fontSize: 8.5, padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>{label.split(" — ")[0]}</span>
              <span style={{ fontSize: 11.5, color: "#374151" }}>{label.split(" — ")[1]}</span>
            </div>
          ))}
        </div>

        {/* Current vs Proposed table */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "2px solid #e5e7eb" }}>
            <div style={{ padding: "10px 16px", fontWeight: 700, fontSize: 12, color: "#374151", background: "#f9fafb", borderRight: "1px solid #e5e7eb" }}>CURRENT (today)</div>
            <div style={{ padding: "10px 16px", fontWeight: 700, fontSize: 12, color: "#374151", background: "#f0fdf4" }}>PROPOSED (new)</div>
          </div>
          {[
            { cur: "① Quote Setup", prop: "① Project / Work Detail  + Job Estimator merged", badge: "renamed" },
            { cur: "② Mix Types", prop: "② Mix Types", badge: null },
            { cur: "③ Raw Materials", prop: "③ Raw Materials", badge: null },
            { cur: "④ Plant Equipment", prop: "④ Plant Equipment", badge: null },
            { cur: "⑤ Fuel / LDO / HSD", prop: "⑤ Fuel / LDO / HSD", badge: null },
            { cur: "⑥ Labour & Overhead  (laying + overhead mixed)", prop: "⑥ Transportation  (transport to site only)", badge: "split" },
            { cur: "⑦ Transport & Coat  (transport + prime + tack mixed)", prop: "⑦ Prime & Tack Coats  (prime/tack form only)", badge: "new" },
            { cur: "— (no separate section)", prop: "⑧ Laying & Compaction  (laying form only)", badge: "new" },
            { cur: "— (part of ⑥)", prop: "⑨ Overhead & Margin  (overhead % + margin %)", badge: "split" },
            { cur: "⑧ Job Estimator  (separate group)", prop: "merged into ① Project/Work Detail", badge: "merged" },
            { cur: "— (no scope section in nav)", prop: "⑩ Detailed Scope of Work  (scope groups + checkboxes)", badge: "new" },
            { cur: "⑨ Recommended Quote", prop: "⑪ Recommended Quote", badge: null },
            { cur: "— (buried in ⑩ Price Impact)", prop: "⑫ Procurement Costs  (own section, always reachable)", badge: "restored" },
            { cur: "⑩ Price Impact", prop: "⑬ Price Impact", badge: null },
            { cur: "⑪ Profitability", prop: "⑭ Profitability", badge: null },
            { cur: "⑫ Summary & Print", prop: "⑮ Summary & Print", badge: null },
          ].map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
              <div style={{ padding: "8px 16px", fontSize: 12, color: "#6b7280", borderRight: "1px solid #f3f4f6" }}>{row.cur}</div>
              <div style={{ padding: "8px 16px", fontSize: 12, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1 }}>{row.prop}</span>
                {row.badge === "new" && <span style={{ background: "#16a34a", color: "#fff", fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap" }}>NEW</span>}
                {row.badge === "restored" && <span style={{ background: "#2563eb", color: "#fff", fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap" }}>RESTORED</span>}
                {row.badge === "split" && <span style={{ background: "#ffb703", color: "#000", fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap" }}>SPLIT</span>}
                {row.badge === "renamed" && <span style={{ background: "#7c3aed", color: "#fff", fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap" }}>RENAMED</span>}
                {row.badge === "merged" && <span style={{ background: "#0891b2", color: "#fff", fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap" }}>MERGED</span>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, padding: "12px 16px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#78350f" }}>
          <strong>Key principle:</strong> No calculation logic changes. All forms/inputs remain identical — only display/navigation is reorganised. Each section now shows one expanded form (no collapsed cards needed since each section has just one purpose).
        </div>
      </div>
    </CalcShell>
  );
}
