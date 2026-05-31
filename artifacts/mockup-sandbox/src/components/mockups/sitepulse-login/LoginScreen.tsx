import { useState } from "react";

const COMPANY_NAME = "High Lane Constructions Pvt Ltd";
const APP_NAME = "SitePulse";
const TAGLINE = "Live Ops. Not Just Logs.";

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(160deg, #f8fafc 0%, #f0f9ff 100%)" }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Brand header */}
        <div className="text-center mb-8">
          <img
            src="/sitepulse-logo.png"
            alt="SitePulse"
            style={{ height: 80, width: 80, objectFit: "contain", margin: "0 auto 16px" }}
          />
          <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 0, marginBottom: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.5px", fontFamily: "system-ui, sans-serif" }}>Site</span>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#f97316", letterSpacing: "-0.5px", fontFamily: "system-ui, sans-serif" }}>Pulse</span>
          </div>
          <p style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.15em", fontFamily: "system-ui, sans-serif", fontWeight: 500, marginBottom: 16 }}>
            {TAGLINE.toUpperCase()}
          </p>
          <div style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 auto 16px" }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", fontFamily: "system-ui, sans-serif" }}>
            {COMPANY_NAME}
          </p>
        </div>

        {/* Login card */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 16,
            padding: "28px 32px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)",
            border: "1px solid #f1f5f9",
          }}
        >
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20, fontFamily: "system-ui, sans-serif" }}>
            Sign in to your account
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6, fontFamily: "system-ui, sans-serif" }}>
              Email or Username
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@company.com"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
                color: "#0f172a",
                outline: "none",
                fontFamily: "system-ui, sans-serif",
                boxSizing: "border-box",
                background: "#f8fafc",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6, fontFamily: "system-ui, sans-serif" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
                color: "#0f172a",
                outline: "none",
                fontFamily: "system-ui, sans-serif",
                boxSizing: "border-box",
                background: "#f8fafc",
              }}
            />
          </div>

          <button
            style={{
              width: "100%",
              padding: "12px",
              background: "linear-gradient(135deg, #0f5b6e, #0d6b82)",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "system-ui, sans-serif",
              letterSpacing: "0.01em",
            }}
          >
            Sign In
          </button>
        </div>

        {/* Powered by footer */}
        <p style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "#94a3b8", fontFamily: "system-ui, sans-serif" }}>
          Powered by <span style={{ color: "#f97316", fontWeight: 700 }}>SitePulse</span>
        </p>
      </div>
    </div>
  );
}
