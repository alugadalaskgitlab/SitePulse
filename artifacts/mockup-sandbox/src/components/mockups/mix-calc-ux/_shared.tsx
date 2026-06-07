import { ReactNode } from "react";

const NAV_BG = "#0f1c35";
const NAV_ACTIVE_BG = "rgba(255,183,3,0.15)";
const NAV_ACTIVE_COLOR = "#ffb703";
const NAV_COLOR = "rgba(255,255,255,0.72)";
const NAV_GROUP = "rgba(255,255,255,0.35)";
const AMBER = "#ffb703";

export const navItems = [
  { group: "Project" },
  { id: "project-detail", label: "① Project / Work Detail", isNew: false, renamed: true },
  { group: "Rate Inputs" },
  { id: "mix-types",       label: "② Mix Types" },
  { id: "raw-materials",   label: "③ Raw Materials" },
  { id: "plant-equip",     label: "④ Plant Equipment" },
  { id: "fuel-energy",     label: "⑤ Fuel / LDO / HSD" },
  { id: "transport",       label: "⑥ Transportation", isNew: false, renamed: true, note: "split" },
  { id: "prime-tack",      label: "⑦ Prime & Tack Coats", isNew: true },
  { id: "laying",          label: "⑧ Laying & Compaction", isNew: true },
  { id: "overhead",        label: "⑨ Overhead & Margin", isNew: false, renamed: true, note: "split" },
  { group: "Analysis" },
  { id: "scope-of-work",   label: "⑩ Detailed Scope of Work", isNew: true },
  { id: "rec-quote",       label: "⑪ Recommended Quote" },
  { id: "procurement",     label: "⑫ Procurement Costs", restored: true },
  { id: "price-impact",    label: "⑬ Price Impact" },
  { id: "profitability",   label: "⑭ Profitability" },
  { id: "summary",         label: "⑮ Summary & Print" },
];

export function CalcShell({ activeId, children, rightPanel }: { activeId: string; children: ReactNode; rightPanel?: ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", fontSize: 13, background: "#f5f6f8", overflow: "hidden" }}>
      {/* Left Nav */}
      <nav style={{ width: 210, background: NAV_BG, display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>HLC Mix Calculator</div>
          <div style={{ color: "rgba(255,255,255,.4)", fontSize: 10, marginTop: 2 }}>Draft — New Layout</div>
          <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
            <button style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 4, color: "rgba(255,255,255,.7)", fontSize: 11, padding: "4px 8px", cursor: "pointer" }}>📂 Open</button>
            <button style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 4, color: "rgba(255,255,255,.7)", fontSize: 11, padding: "4px 8px", cursor: "pointer" }}>＋ New</button>
          </div>
        </div>
        <div style={{ flex: 1, paddingTop: 6, paddingBottom: 12 }}>
          {navItems.map((item, i) => {
            if ("group" in item) {
              return <div key={i} style={{ fontSize: 9.5, fontWeight: 700, color: NAV_GROUP, textTransform: "uppercase", letterSpacing: ".8px", padding: "12px 14px 4px" }}>{item.group}</div>;
            }
            const active = item.id === activeId;
            return (
              <div key={item.id} style={{
                padding: "7px 14px",
                color: active ? NAV_ACTIVE_COLOR : NAV_COLOR,
                background: active ? NAV_ACTIVE_BG : "transparent",
                borderLeft: active ? `3px solid ${AMBER}` : "3px solid transparent",
                display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                fontSize: 12.5,
              }}>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.isNew && <span style={{ background: "#16a34a", color: "#fff", fontSize: 8.5, padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>NEW</span>}
                {item.restored && <span style={{ background: "#2563eb", color: "#fff", fontSize: 8.5, padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>RESTORED</span>}
                {item.renamed && <span style={{ background: AMBER, color: "#000", fontSize: 8.5, padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>SPLIT</span>}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Centre Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", minWidth: 0 }}>
        {children}
      </div>

      {/* Right Panel */}
      <div style={{ width: 270, background: "#fff", borderLeft: "1px solid #e5e7eb", overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
        {rightPanel ?? <DefaultRightPanel />}
      </div>
    </div>
  );
}

export function DefaultRightPanel() {
  return (
    <>
      <div style={{ background: NAV_BG, borderRadius: 8, padding: 12 }}>
        <div style={{ color: AMBER, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>Rate Summary</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#fff", marginBottom: 6 }}>
          <span>DBM Gr II</span><span style={{ fontWeight: 600 }}>₹ 5,840 /MT</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#fff", marginBottom: 6 }}>
          <span>BC Gr II</span><span style={{ fontWeight: 600 }}>₹ 6,210 /MT</span>
        </div>
        <div style={{ height: 1, background: "rgba(255,255,255,.12)", margin: "8px 0" }} />
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>Ex-plant + transport + laying</div>
      </div>

      <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: 12 }}>
        <div style={{ color: "#92400e", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>Recommended Quote</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 6 }}>
          {["Min", "Target", "Premium"].map(t => <div key={t} style={{ textAlign: "center", fontSize: 9, color: "#78350f", fontWeight: 600 }}>{t}</div>)}
          {["₹6,100", "₹6,500", "₹6,950"].map((v, i) => <div key={i} style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "#92400e" }}>{v}</div>)}
        </div>
        <div style={{ fontSize: 9.5, color: "#a16207" }}>incl. 12% overhead + 8% profit</div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
        <div style={{ color: "#374151", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>🛒 Procurement Budget</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#374151", marginBottom: 4 }}>
          <span>Aggregates</span><span>₹ 18.4 L</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#374151", marginBottom: 4 }}>
          <span>Bitumen (VG30)</span><span>₹ 12.1 L</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#374151", marginBottom: 4 }}>
          <span>LDO / HSD</span><span>₹ 3.2 L</span>
        </div>
        <div style={{ height: 1, background: "#e5e7eb", margin: "6px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#111827" }}>
          <span>Total</span><span>₹ 33.7 L</span>
        </div>
      </div>
    </>
  );
}

export function Card({ title, children, accent }: { title: string; children: ReactNode; accent?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${accent ?? "#e5e7eb"}`, borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", background: accent ? `${accent}11` : "#f9fafb", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 13, color: "#111827" }}>{title}</div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 16px" }}>{children}</div>;
}

export function Field({ label, placeholder, value }: { label: string; placeholder?: string; value?: string }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{label}</label>
      <input readOnly value={value ?? ""} placeholder={placeholder} style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 5, padding: "6px 9px", fontSize: 12, color: "#111827", background: "#fff", boxSizing: "border-box" }} />
    </div>
  );
}
