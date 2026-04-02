import { useState } from "react";
import { Lock, Calculator, BarChart3, TrendingUp, Eye, EyeOff, HardHat } from "lucide-react";

export function LoginPage() {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === "0808") {
      setRole("admin");
      setError("");
    } else if (pin === "1234") {
      setRole("manager");
      setError("");
    } else {
      setError("Invalid PIN. Please try again.");
      setPin("");
    }
  };

  if (role) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-amber-100 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4"
            style={{ background: role === "admin" ? "#dcfce7" : "#dbeafe" }}>
            <Lock className="w-8 h-8" style={{ color: role === "admin" ? "#16a34a" : "#2563eb" }} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            {role === "admin" ? "Admin Access Granted" : "Manager Access Granted"}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {role === "admin"
              ? "Full access — edit, create, and delete estimates & scenarios"
              : "View-only access — browse estimates, scenarios & comparisons"}
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
            style={{
              background: role === "admin" ? "#dcfce7" : "#dbeafe",
              color: role === "admin" ? "#15803d" : "#1d4ed8"
            }}>
            {role === "admin" ? "🔓 Full Control" : "👁️ View Only"}
          </div>
          <button
            onClick={() => { setRole(null); setPin(""); }}
            className="block mx-auto mt-6 text-sm text-amber-600 hover:text-amber-800 font-medium">
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-200 mb-5">
              <HardHat className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              HLC Mix Rate Portal
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              High Lane Constructions — Estimate & Scenario Manager
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-amber-100 overflow-hidden">
            <div className="p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 border-2 border-amber-200 mb-3">
                  <Lock className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">Enter Your PIN</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Admin PIN for full access · Manager PIN for view-only
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="relative">
                  <input
                    type={showPin ? "text" : "password"}
                    value={pin}
                    onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
                    maxLength={4}
                    placeholder="● ● ● ●"
                    className="w-full text-center text-3xl tracking-[0.5em] font-mono py-4 px-6 rounded-xl border-2 border-gray-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none transition-all bg-gray-50 focus:bg-white"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm font-medium bg-red-50 rounded-lg px-4 py-2.5">
                    <span className="text-red-500">⚠</span> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={pin.length !== 4}
                  className="w-full py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: pin.length === 4
                      ? "linear-gradient(135deg, #f59e0b, #ea580c)"
                      : "#d1d5db"
                  }}>
                  Unlock Portal
                </button>
              </form>
            </div>

            <div className="border-t border-gray-100 bg-gray-50 px-8 py-5">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Calculator className="w-4 h-4 text-amber-700" />
                  </div>
                  <span className="text-[11px] text-gray-500 font-medium">Rate Calculator</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-blue-700" />
                  </div>
                  <span className="text-[11px] text-gray-500 font-medium">Scenarios</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-green-700" />
                  </div>
                  <span className="text-[11px] text-gray-500 font-medium">Compare</span>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Contact administrator if you forgot your PIN
          </p>
        </div>
      </div>
    </div>
  );
}
