import { CalcShell, Card, FormGrid, Field, DefaultRightPanel } from "./_shared";

const AMBER = "#ffb703";

export function ProjectWorkDetail() {
  return (
    <CalcShell activeId="project-detail" rightPanel={<DefaultRightPanel />}>
      <div style={{ maxWidth: 700 }}>
        {/* Section heading */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 4, height: 28, background: AMBER, borderRadius: 2 }} />
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>① Project / Work Detail</h1>
            <p style={{ fontSize: 11.5, color: "#6b7280", margin: "2px 0 0" }}>Client info, project details, and job estimator — all in one place</p>
          </div>
        </div>

        {/* Project & Client Info */}
        <Card title="Project & Client Info">
          <FormGrid>
            <Field label="Project Name" value="NH-48 Bridge Approach Works" />
            <Field label="Prepared By" value="Krishna R." />
            <Field label="Date" value="07-Jun-2026" />
            <Field label="Contractor / Company" value="HLC Pvt Ltd" />
            <Field label="Address" placeholder="Site or office address" />
            <Field label="Contact Person" placeholder="Contact name" />
            <Field label="Contact Phone" placeholder="+91 XXXXX XXXXX" />
            <Field label="Quote Mode" value="" />
          </FormGrid>

          {/* Quote Mode Toggle */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f3f4f6" }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Quote Mode</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { id: "full", label: "Full Scope (HLC supplies all)", active: true },
                { id: "partial-mat", label: "HLC supplies mix only" },
                { id: "partial-lay", label: "HLC lays only" },
              ].map(m => (
                <button key={m.id} style={{
                  padding: "6px 14px", fontSize: 12, borderRadius: 5, cursor: "pointer", border: "1px solid",
                  background: m.active ? AMBER : "#fff",
                  color: m.active ? "#000" : "#374151",
                  borderColor: m.active ? AMBER : "#d1d5db",
                  fontWeight: m.active ? 700 : 400,
                }}>{m.label}</button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
              Determines which cost components appear in the rate and what the client is quoted for.
            </p>
          </div>
        </Card>

        {/* Job Estimator — Sites & Jobs */}
        <Card title="Job Estimator — Sites & Jobs" accent={AMBER}>
          <div style={{ marginBottom: 12, fontSize: 12, color: "#374151" }}>
            Add one or more sites. Under each site, add jobs with mix type, area/thickness or BOQ quantity. This determines total MT and area for all calculations.
          </div>

          {/* Site 1 */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 7, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ background: "#f9fafb", padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #e5e7eb" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#111827", flex: 1 }}>📍 Site 1 — Km 12+400 to 14+600</span>
              <span style={{ fontSize: 11, color: "#6b7280" }}>Lead: 18 km</span>
            </div>
            <div style={{ padding: "10px 14px" }}>
              {/* Job rows */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Mix Type", "Method", "Area (m²)", "Thick (mm)", "MT", ""].map(h => (
                      <th key={h} style={{ padding: "5px 8px", fontWeight: 600, color: "#374151", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { mix: "DBM Gr II", method: "Geometry", area: "12,000", thick: "75", mt: "1,620" },
                    { mix: "BC Gr II", method: "Geometry", area: "12,000", thick: "40", mt: "864" },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 8px", color: "#111827" }}>{row.mix}</td>
                      <td style={{ padding: "6px 8px", color: "#6b7280" }}>{row.method}</td>
                      <td style={{ padding: "6px 8px", color: "#374151", textAlign: "right" }}>{row.area}</td>
                      <td style={{ padding: "6px 8px", color: "#374151", textAlign: "right" }}>{row.thick}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 600, color: "#111827", textAlign: "right" }}>{row.mt}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <button style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 7px", fontSize: 11, cursor: "pointer", color: "#6b7280" }}>✏</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button style={{ marginTop: 8, background: "none", border: "1px dashed #d1d5db", borderRadius: 5, padding: "5px 12px", fontSize: 11.5, color: "#6b7280", cursor: "pointer", width: "100%" }}>
                + Add Job to this Site
              </button>
            </div>
          </div>

          {/* Site 2 stub */}
          <div style={{ border: "1px dashed #d1d5db", borderRadius: 7, padding: "10px 14px", color: "#9ca3af", fontSize: 12, marginBottom: 10, textAlign: "center" }}>
            📍 Site 2 — <em>(not yet added)</em>
          </div>

          <button style={{ background: AMBER, border: "none", borderRadius: 6, padding: "8px 18px", fontSize: 12.5, fontWeight: 700, color: "#000", cursor: "pointer" }}>
            + Add Site
          </button>

          {/* Summary strip */}
          <div style={{ marginTop: 14, display: "flex", gap: 16, padding: "10px 14px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 7 }}>
            {[
              { label: "Total MT", value: "2,484" },
              { label: "Total Area", value: "12,000 m²" },
              { label: "Sites", value: "1" },
              { label: "Jobs", value: "2" },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#92400e" }}>{value}</div>
                <div style={{ fontSize: 10, color: "#a16207" }}>{label}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </CalcShell>
  );
}
