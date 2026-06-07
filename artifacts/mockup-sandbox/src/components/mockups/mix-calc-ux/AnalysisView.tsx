import { CalcShell } from "./_shared";

const AMBER = "#ffb703";
const NAV_BG = "#0f1c35";

export function AnalysisView() {
  return (
    <CalcShell activeId="rec-quote" rightPanel={<AnalysisRightPanel />}>
      <div style={{ maxWidth: 700 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 4, height: 28, background: AMBER, borderRadius: 2 }} />
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>⑪ Recommended Quote</h1>
            <p style={{ fontSize: 11.5, color: "#6b7280", margin: "2px 0 0" }}>What to quote the client — min / target / premium per mix type</p>
          </div>
        </div>

        {/* Cost chain explanation */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 20, fontSize: 11.5, flexWrap: "wrap" }}>
          {[
            { label: "Raw material costs", color: "#dbeafe" },
            { label: "↓" },
            { label: "Plant + fuel costs", color: "#fef3c7" },
            { label: "↓" },
            { label: "Transport + laying", color: "#dcfce7" },
            { label: "↓" },
            { label: "+ 12% overhead", color: "#f3e8ff" },
            { label: "↓" },
            { label: "Full-laid base rate", color: "#ffedd5", bold: true },
            { label: "↓" },
            { label: "+ profit → Quote", color: AMBER, bold: true, dark: true },
          ].map((item, i) => (
            item.label === "↓"
              ? <span key={i} style={{ color: "#9ca3af", fontSize: 13 }}>→</span>
              : <span key={i} style={{
                  background: item.color, borderRadius: 5, padding: "3px 8px",
                  fontWeight: item.bold ? 700 : 400, color: item.dark ? "#000" : "#374151",
                  fontSize: 11,
                }}>{item.label}</span>
          ))}
        </div>

        {/* Overhead strip */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Overhead %", value: "12%", note: "entered in Overhead & Margin section" },
            { label: "Base rate (full-laid)", value: "₹ 5,840/MT", note: "DBM Gr II incl. overhead" },
          ].map(({ label, value, note }) => (
            <div key={label} style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginTop: 2 }}>{value}</div>
              <div style={{ fontSize: 10.5, color: "#9ca3af", marginTop: 2 }}>{note}</div>
            </div>
          ))}
        </div>

        {/* Recommended Quote table — DBM */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: NAV_BG, color: "#fff", fontWeight: 700, fontSize: 13 }}>
            DBM Grade II — ₹/MT
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["", "Minimum", "Target", "Premium"].map(h => (
                  <th key={h} style={{ padding: "7px 14px", fontWeight: 600, color: "#374151", textAlign: h === "" ? "left" : "right", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { row: "Profit %", vals: ["5%", "8%", "12%"], input: true },
                { row: "Ex-plant rate", vals: ["₹ 4,900", "₹ 4,900", "₹ 4,900"] },
                { row: "+ Transport (18 km)", vals: ["₹ 480", "₹ 480", "₹ 480"] },
                { row: "+ Laying & compaction", vals: ["₹ 460", "₹ 460", "₹ 460"] },
                { row: "Full-laid base", vals: ["₹ 5,840", "₹ 5,840", "₹ 5,840"], bold: true },
                { row: "+ Profit margin", vals: ["₹ 292", "₹ 467", "₹ 701"], color: "#16a34a" },
                { row: "Quote Rate (₹/MT)", vals: ["₹ 6,132", "₹ 6,307", "₹ 6,541"], bold: true, highlight: true },
              ].map(({ row, vals, bold, highlight, color, input }) => (
                <tr key={row} style={{ background: highlight ? "#fefce8" : "transparent", borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "7px 14px", color: "#374151", fontWeight: bold ? 700 : 400 }}>{row}</td>
                  {vals.map((v, i) => (
                    <td key={i} style={{ padding: "7px 14px", textAlign: "right", fontWeight: bold ? 700 : 400, color: color ?? (highlight ? "#92400e" : "#111827") }}>
                      {input
                        ? <input readOnly value={v} style={{ width: 50, border: `1px solid ${i === 1 ? AMBER : "#d1d5db"}`, borderRadius: 4, padding: "2px 6px", fontSize: 12, textAlign: "right", background: i === 1 ? "#fefce8" : "#fff" }} />
                        : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* BC Grade II */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 13 }}>
            BC Grade II — ₹/MT
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["", "Minimum", "Target", "Premium"].map(h => (
                  <th key={h} style={{ padding: "7px 14px", fontWeight: 600, color: "#374151", textAlign: h === "" ? "left" : "right", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { row: "Full-laid base", vals: ["₹ 6,210", "₹ 6,210", "₹ 6,210"], bold: true },
                { row: "Quote Rate (₹/MT)", vals: ["₹ 6,521", "₹ 6,707", "₹ 6,955"], bold: true, highlight: true },
              ].map(({ row, vals, bold, highlight }) => (
                <tr key={row} style={{ background: highlight ? "#fefce8" : "transparent", borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "7px 14px", color: "#374151", fontWeight: bold ? 700 : 400 }}>{row}</td>
                  {vals.map((v, i) => (
                    <td key={i} style={{ padding: "7px 14px", textAlign: "right", fontWeight: bold ? 700 : 400, color: highlight ? "#92400e" : "#111827" }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total contract value */}
        <div style={{ background: NAV_BG, borderRadius: 8, padding: "14px 18px", display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { label: "DBM 1,620 MT × ₹6,307", value: "₹ 1.02 Cr", sub: "at target" },
            { label: "BC 864 MT × ₹6,707", value: "₹ 57.9 L", sub: "at target" },
            { label: "Total Contract Value", value: "₹ 1.60 Cr", sub: "target quote", large: true },
          ].map(({ label, value, sub, large }) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: large ? 22 : 17, fontWeight: 700, color: large ? AMBER : "#fff" }}>{value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </CalcShell>
  );
}

function AnalysisRightPanel() {
  return (
    <>
      <div style={{ background: NAV_BG, borderRadius: 8, padding: 12 }}>
        <div style={{ color: AMBER, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>Rate Summary</div>
        {[
          { label: "DBM Gr II", exPlant: "₹4,900", delivered: "₹5,380", fullLaid: "₹5,840" },
          { label: "BC Gr II", exPlant: "₹5,240", delivered: "₹5,720", fullLaid: "₹6,210" },
        ].map(({ label, exPlant, delivered, fullLaid }) => (
          <div key={label} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 12, marginBottom: 5 }}>{label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
              {[{ t: "Ex-plant", v: exPlant }, { t: "Delivered", v: delivered }, { t: "Full laid", v: fullLaid }].map(({ t, v }) => (
                <div key={t} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,.4)" }}>{t}</div>
                  <div style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 9.5, color: "rgba(255,255,255,.35)", marginTop: 4 }}>All rates incl. 12% overhead</div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
        <div style={{ color: "#374151", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>🛒 Procurement Budget</div>
        {[
          { label: "Aggregates (all fractions)", qty: "1,985 MT", amt: "₹ 18.4 L" },
          { label: "Bitumen VG30", qty: "130 MT / 1,30,000 kg", amt: "₹ 12.1 L" },
          { label: "LDO (dryer + boiler)", qty: "4,200 L", amt: "₹ 2.1 L" },
          { label: "Diesel / HSD (equip)", qty: "2,800 L", amt: "₹ 1.1 L" },
        ].map(({ label, qty, amt }) => (
          <div key={label} style={{ marginBottom: 8, paddingBottom: 7, borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11.5, color: "#111827" }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{amt}</span>
            </div>
            <div style={{ fontSize: 10.5, color: "#9ca3af" }}>{qty}</div>
          </div>
        ))}
        <div style={{ height: 1, background: "#e5e7eb", margin: "6px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#111827" }}>
          <span>Grand Total</span><span>₹ 33.7 L</span>
        </div>
      </div>
    </>
  );
}
