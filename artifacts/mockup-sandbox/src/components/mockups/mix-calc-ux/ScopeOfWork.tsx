import { CalcShell, DefaultRightPanel } from "./_shared";

const AMBER = "#ffb703";
const NAV_BG = "#0f1c35";

type ScopeItem = { id: string; label: string; checked: boolean; note?: string };
type ScopeGroup = { id: string; label: string; icon: string; hlcScope: boolean; items: ScopeItem[]; desc: string };

const scopeGroups: ScopeGroup[] = [
  {
    id: "mixing",
    label: "Hot Mix Production",
    icon: "🏭",
    hlcScope: true,
    desc: "HLC plant produces the bituminous mix",
    items: [
      { id: "mix-production", label: "Mix production at HLC plant", checked: true },
      { id: "quality-control", label: "Quality control & testing", checked: true },
      { id: "aggregate-supply", label: "Aggregate supply & stockpiling", checked: true },
      { id: "bitumen-supply", label: "Bitumen (VG30) procurement", checked: true },
    ],
  },
  {
    id: "transport",
    label: "Transportation to Site",
    icon: "🚛",
    hlcScope: true,
    desc: "HLC arranges transport from plant to site",
    items: [
      { id: "tipper-hire", label: "Tipper hire & logistics", checked: true },
      { id: "lead-distance", label: "Lead distance: 18 km", checked: true, note: "from Job Estimator" },
    ],
  },
  {
    id: "spraying",
    label: "Prime & Tack Coat",
    icon: "💦",
    hlcScope: false,
    desc: "Contractor's scope — HLC rate excludes",
    items: [
      { id: "prime-supply", label: "Prime coat emulsion supply", checked: false },
      { id: "prime-spray", label: "Prime coat spraying", checked: false },
      { id: "tack-supply", label: "Tack coat emulsion supply", checked: false },
      { id: "tack-spray", label: "Tack coat spraying", checked: false },
    ],
  },
  {
    id: "paving",
    label: "Laying & Compaction",
    icon: "🛣",
    hlcScope: true,
    desc: "HLC paving crew lays and compacts",
    items: [
      { id: "paver-hire", label: "Paver hire & operation", checked: true },
      { id: "roller-hire", label: "Roller hire & operation", checked: true },
      { id: "finishing-crew", label: "Finishing crew", checked: true },
    ],
  },
  {
    id: "ancillary",
    label: "Ancillary / Other",
    icon: "🔧",
    hlcScope: false,
    desc: "Not in HLC scope",
    items: [
      { id: "traffic-mgmt", label: "Traffic management", checked: false },
      { id: "survey", label: "Survey & setting out", checked: false },
      { id: "clearance", label: "Site clearance & preparation", checked: false },
    ],
  },
];

export function ScopeOfWork() {
  return (
    <CalcShell activeId="scope-of-work" rightPanel={<ScopeRightPanel />}>
      <div style={{ maxWidth: 680 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 4, height: 28, background: AMBER, borderRadius: 2 }} />
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>⑩ Detailed Scope of Work</h1>
            <p style={{ fontSize: 11.5, color: "#6b7280", margin: "2px 0 0" }}>Tick what HLC is responsible for. Rates in the right panel filter accordingly.</p>
          </div>
        </div>

        {/* Mode banner */}
        <div style={{ padding: "9px 14px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 7, fontSize: 12, color: "#78350f", marginBottom: 16, display: "flex", gap: 8 }}>
          <span>📋</span>
          <span>
            <strong>Quote Mode: Full Scope.</strong> All items default to HLC scope. Untick items the contractor supplies — those costs will be removed from your quoted rate.
          </span>
        </div>

        {scopeGroups.map(group => (
          <div key={group.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: group.hlcScope ? NAV_BG : "#f9fafb", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>{group.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: group.hlcScope ? "#fff" : "#374151" }}>{group.label}</div>
                <div style={{ fontSize: 11, color: group.hlcScope ? "rgba(255,255,255,.55)" : "#9ca3af" }}>{group.desc}</div>
              </div>
              <div style={{
                fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                background: group.hlcScope ? "rgba(255,183,3,.2)" : "#f3f4f6",
                color: group.hlcScope ? AMBER : "#6b7280",
                border: `1px solid ${group.hlcScope ? "rgba(255,183,3,.4)" : "#e5e7eb"}`,
              }}>
                {group.hlcScope ? "HLC Scope" : "Contractor Scope"}
              </div>
            </div>
            <div style={{ padding: "8px 16px" }}>
              {group.items.map(item => (
                <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0", cursor: "pointer", borderBottom: "1px solid #f9fafb" }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 3, border: `2px solid ${item.checked ? AMBER : "#d1d5db"}`,
                    background: item.checked ? AMBER : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {item.checked && <span style={{ fontSize: 10, color: "#000", fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 12.5, color: item.checked ? "#111827" : "#6b7280", flex: 1 }}>{item.label}</span>
                  {item.note && <span style={{ fontSize: 10.5, color: "#9ca3af", fontStyle: "italic" }}>({item.note})</span>}
                </label>
              ))}
            </div>
          </div>
        ))}

        <div style={{ padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12, color: "#166534" }}>
          <strong>4 of 5 scope groups</strong> are in HLC's scope. Rate in right panel shows full-laid cost for HLC items only. Contractor-supplied items (Prime & Tack, Ancillary) are shown as quantity-only rows in the Procurement table.
        </div>
      </div>
    </CalcShell>
  );
}

function ScopeRightPanel() {
  return (
    <>
      <div style={{ background: "#0f1c35", borderRadius: 8, padding: 12 }}>
        <div style={{ color: AMBER, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>Rate Summary</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", marginBottom: 8 }}>Based on current scope selection</div>
        {[
          { label: "DBM Gr II — Full Laid", rate: "₹ 5,840 /MT", sub: "incl. transport + laying" },
          { label: "BC Gr II — Full Laid", rate: "₹ 6,210 /MT", sub: "incl. transport + laying" },
        ].map(({ label, rate, sub }) => (
          <div key={label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#fff" }}>
              <span>{label}</span><span style={{ fontWeight: 600 }}>{rate}</span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>{sub}</div>
          </div>
        ))}
        <div style={{ marginTop: 6, padding: "7px 10px", background: "rgba(255,183,3,.12)", borderRadius: 6 }}>
          <div style={{ fontSize: 10.5, color: AMBER }}>Prime & Tack excluded — contractor scope</div>
        </div>
      </div>

      <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: 12 }}>
        <div style={{ color: "#92400e", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>Recommended Quote</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 6 }}>
          {["Min", "Target", "Premium"].map(t => <div key={t} style={{ textAlign: "center", fontSize: 9, color: "#78350f", fontWeight: 600 }}>{t}</div>)}
          {["₹6,100", "₹6,500", "₹6,950"].map((v, i) => <div key={i} style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "#92400e" }}>{v}</div>)}
        </div>
        <div style={{ fontSize: 9.5, color: "#a16207" }}>12% overhead + 8% profit</div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
        <div style={{ color: "#374151", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>🛒 Procurement Budget</div>
        {[
          { label: "Aggregates (HLC)", value: "₹ 18.4 L", hlc: true },
          { label: "Bitumen VG30 (HLC)", value: "₹ 12.1 L", hlc: true },
          { label: "LDO / HSD (HLC)", value: "₹ 3.2 L", hlc: true },
          { label: "Prime coat (Contractor)", value: "—  qty only", hlc: false },
          { label: "Tack coat (Contractor)", value: "—  qty only", hlc: false },
        ].map(({ label, value, hlc }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4, color: hlc ? "#374151" : "#9ca3af" }}>
            <span>{label}</span><span style={{ fontWeight: hlc ? 600 : 400 }}>{value}</span>
          </div>
        ))}
        <div style={{ height: 1, background: "#e5e7eb", margin: "7px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#111827" }}>
          <span>HLC Total</span><span>₹ 33.7 L</span>
        </div>
      </div>
    </>
  );
}
