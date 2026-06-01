import { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Package, ShoppingCart, Calendar, CreditCard, Banknote, Search, ClipboardList, CheckCircle, Ban, Building2, ArrowLeft } from "lucide-react";

export function ProcurementView() {
  const [vendor4, setVendor4] = useState("");
  const [rate4, setRate4] = useState("42000");
  const [date4, setDate4] = useState("2026-06-05");
  const [item4Status, setItem4Status] = useState<"pending" | "ordered" | "received">("pending");

  const totalAmount = Number(rate4 || 0) * 15;

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", justifyContent: "center", paddingBottom: "80px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "640px", background: "white", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ background: "#0F5F64", color: "white", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <ArrowLeft size={18} style={{ opacity: 0.7 }} />
            <span style={{ fontSize: "11px", letterSpacing: "1px", opacity: 0.7, textTransform: "uppercase" }}>Purchase Indent</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
            <div>
              <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>HLC/PI/2026/0013</h1>
              <p style={{ fontSize: "13px", color: "#99d4d7", margin: "4px 0 0" }}>Raised by: Site Team (Ramesh) · 30 May 2026</p>
            </div>
            <span style={{ background: "#10b981", color: "white", fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "20px", letterSpacing: "0.5px" }}>
              APPROVED
            </span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <CheckCircle size={16} color="#6ee7b7" />
            <span style={{ fontSize: "13px" }}>
              <strong>Approved</strong>
              <span style={{ color: "#99d4d7" }}> · Sunil Kumar · Manager · 01 Jun 15:10</span>
            </span>
          </div>
        </div>

        {/* Summary Bar */}
        <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: "10px 20px", display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "#0F5F64" }}>
            <ShoppingCart size={15} /> 3 items to procure
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#94a3b8" }}>
            <Ban size={14} /> 1 rejected
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "#334155" }}>
            <Banknote size={15} color="#0F5F64" /> Est: ₹6,43,250
          </div>
        </div>

        {/* Items */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Item 1: RECEIVED */}
          <div style={{ border: "1px solid #bbf7d0", borderRadius: "10px", background: "#f0fdf4", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#166534" }}>Hydraulic Jack 10T</h3>
                  <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#64748b" }}>2 NOS · Est: ₹4,500/unit</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                <span style={{ background: "#e0f2f1", color: "#0F5F64", border: "1px solid #b2dfdb", borderRadius: "20px", fontSize: "11px", padding: "2px 10px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={11} /> Stores ✓ Raju K
                </span>
                <span style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: "20px", fontSize: "11px", padding: "2px 10px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={11} /> Mgr Approved
                </span>
              </div>
              <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                <Package size={18} color="#059669" />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#166534" }}>Received · GRN #HLC/GRN/2026/041</div>
                  <div style={{ fontSize: "12px", color: "#059669", marginTop: "2px" }}>02 Jun · Ramesh Traders · ₹4,200/unit actual</div>
                </div>
              </div>
            </div>
          </div>

          {/* Item 2: REJECTED */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", background: "#f8fafc", opacity: 0.75, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#94a3b8", textDecoration: "line-through" }}>Compactor Belt</h3>
                  <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#94a3b8" }}>1 NOS · Est: ₹1,200/unit</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                <span style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: "20px", fontSize: "11px", padding: "2px 10px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <XCircle size={11} /> Stores ✗ No stock
                </span>
                <span style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: "20px", fontSize: "11px", padding: "2px 10px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <XCircle size={11} /> Mgr Rejected
                </span>
              </div>
              <div style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                <Ban size={16} color="#94a3b8" />
                <span style={{ fontSize: "13px", color: "#64748b" }}>Rejected · "Not in budget this month" — No action needed</span>
              </div>
            </div>
          </div>

          {/* Item 3: ORDER PLACED */}
          <div style={{ border: "1px solid #bfdbfe", borderRadius: "10px", background: "#eff6ff", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#1e40af" }}>Drill Bit 25mm</h3>
                  <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#64748b" }}>
                    <span style={{ fontWeight: 600, color: "#d97706", background: "#fef3c7", padding: "1px 6px", borderRadius: "4px" }}>2 NOS</span>
                    <span style={{ textDecoration: "line-through", color: "#94a3b8", marginLeft: "6px" }}>5 NOS</span>
                    <span style={{ marginLeft: "6px" }}>· Est: ₹850/unit</span>
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                <span style={{ background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a", borderRadius: "20px", fontSize: "11px", padding: "2px 10px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <AlertTriangle size={11} /> Stores ⚠️ Short 2/5
                </span>
                <span style={{ background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a", borderRadius: "20px", fontSize: "11px", padding: "2px 10px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <AlertTriangle size={11} /> Mgr Modified 2/5
                </span>
              </div>
              <div style={{ background: "white", border: "1px solid #bfdbfe", borderRadius: "8px", overflow: "hidden" }}>
                <div style={{ background: "#dbeafe", padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <ClipboardList size={15} color="#2563eb" />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e40af" }}>Order Placed</span>
                  </div>
                  <span style={{ fontSize: "11px", color: "#3b82f6" }}>01 Jun 16:20</span>
                </div>
                <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Vendor</span>
                    <span style={{ fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Building2 size={13} color="#94a3b8" /> Ramesh Traders
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Expected Delivery</span>
                    <span style={{ fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Calendar size={13} color="#94a3b8" /> 04 Jun 2026
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Actual Rate</span>
                    <span style={{ fontWeight: 600, color: "#334155" }}>₹820/unit</span>
                  </div>
                  <button style={{ marginTop: "6px", width: "100%", background: "#059669", color: "white", border: "none", borderRadius: "8px", padding: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                    <Package size={15} /> Mark Received → Create GRN
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Item 4: PENDING PROCUREMENT */}
          <div style={{ border: "2px solid #0F5F64", borderRadius: "10px", background: "white", overflow: "hidden", boxShadow: "0 4px 12px rgba(15,95,100,0.12)" }}>
            <div style={{ width: "4px", height: "100%", background: "#0F5F64", position: "absolute" }} />
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>Bitumen Emulsion RS-1</h3>
                  <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#64748b" }}>15 MT · Est: ₹42,000/MT</p>
                </div>
                <span style={{ background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: "20px", fontSize: "11px", fontWeight: 700, padding: "3px 10px" }}>
                  Pending Order
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                <span style={{ background: "#e0f2f1", color: "#0F5F64", border: "1px solid #b2dfdb", borderRadius: "20px", fontSize: "11px", padding: "2px 10px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={11} /> Stores ✓ Raju K · 8.5 MT
                </span>
                <span style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: "20px", fontSize: "11px", padding: "2px 10px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={11} /> Mgr Approved · 15 MT
                </span>
              </div>

              {item4Status === "pending" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Vendor</label>
                    <div style={{ position: "relative" }}>
                      <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
                      <input
                        placeholder="Select or type vendor name..."
                        style={{ width: "100%", paddingLeft: "36px", paddingRight: "12px", paddingTop: "9px", paddingBottom: "9px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", background: "#f8fafc", boxSizing: "border-box", outline: "none" }}
                        value={vendor4}
                        onChange={(e) => setVendor4(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Actual Rate (₹/MT)</label>
                      <input
                        type="number"
                        value={rate4}
                        onChange={(e) => setRate4(e.target.value)}
                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", fontWeight: 600, background: "#f8fafc", boxSizing: "border-box", outline: "none" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Total Amount</label>
                      <div style={{ padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", fontWeight: 700, background: "#f1f5f9", color: "#334155" }}>
                        ₹{totalAmount.toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Expected Delivery</label>
                      <div style={{ position: "relative" }}>
                        <Calendar size={15} color="#94a3b8" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
                        <input
                          type="date"
                          value={date4}
                          onChange={(e) => setDate4(e.target.value)}
                          style={{ width: "100%", paddingLeft: "32px", paddingRight: "8px", paddingTop: "9px", paddingBottom: "9px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", background: "#f8fafc", boxSizing: "border-box", outline: "none" }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Payment Mode</label>
                      <div style={{ padding: "9px 12px", border: "1px solid #ccfbf1", borderRadius: "8px", background: "#f0fdfa", color: "#0F5F64", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                        <CreditCard size={14} /> Credit
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                    <button
                      onClick={() => setItem4Status("ordered")}
                      style={{ flex: 1, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <ClipboardList size={15} /> Mark Ordered
                    </button>
                    <button
                      onClick={() => setItem4Status("received")}
                      style={{ flex: 1, background: "#059669", color: "white", border: "none", borderRadius: "8px", padding: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <Package size={15} /> Received → GRN
                    </button>
                  </div>
                </div>
              )}

              {item4Status === "ordered" && (
                <div style={{ background: "#dbeafe", border: "1px solid #93c5fd", borderRadius: "8px", padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <ClipboardList size={16} color="#2563eb" />
                    <span style={{ fontWeight: 700, color: "#1e40af", fontSize: "13px" }}>Order Placed · {vendor4 || "Vendor TBD"}</span>
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "#3b82f6" }}>Just now</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#3b82f6", marginBottom: "10px" }}>Expected: {date4} · ₹{Number(rate4).toLocaleString("en-IN")}/MT</div>
                  <button
                    onClick={() => setItem4Status("received")}
                    style={{ width: "100%", background: "#059669", color: "white", border: "none", borderRadius: "8px", padding: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <Package size={15} /> Mark Received → Create GRN
                  </button>
                </div>
              )}

              {item4Status === "received" && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <Package size={18} color="#059669" />
                  <div>
                    <div style={{ fontWeight: 700, color: "#166534", fontSize: "13px" }}>Received · GRN Created</div>
                    <div style={{ fontSize: "12px", color: "#059669", marginTop: "2px" }}>Just now · {vendor4 || "Vendor"}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div style={{ position: "sticky", bottom: 0, background: "white", borderTop: "1px solid #e2e8f0", padding: "12px 20px", display: "flex", gap: "10px", boxShadow: "0 -4px 12px rgba(0,0,0,0.05)" }}>
          <button style={{ flex: 1, background: "white", color: "#475569", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "11px", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
            Save Progress
          </button>
          <button style={{ flex: 1, background: "#0F5F64", color: "white", border: "none", borderRadius: "8px", padding: "11px", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            Review & Complete
          </button>
        </div>

      </div>
    </div>
  );
}
