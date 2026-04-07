import { useState } from "react";
import { Lock, Calculator, BarChart3, TrendingUp, Eye, EyeOff, Building2, ChevronRight, FlaskConical, Printer, ExternalLink, LogOut, Plus, Shield, Power } from "lucide-react";

export function LoginPage() {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | null>(null);

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
    const isManager = role === "manager";
    const projects = [
      {
        name: "DECCAN TOLLWAYS PVT LTD",
        sites: [
          { name: "BASAVAKALYAN", mt: 520, amt: 2156000, date: "07 Apr 2026" },
          { name: "RAJESHWAR", mt: 280, amt: 1162000, date: "07 Apr 2026" },
        ],
      },
      {
        name: "NATIONAL HIGHWAYS",
        sites: [
          { name: "VENKAT REDDY", mt: 1053, amt: 4370000, date: "05 Apr 2026" },
        ],
      },
    ];

    const fmtAmt = (v: number) => {
      if (v >= 100000) return "\u20B9" + (v / 100000).toFixed(1) + " L";
      return "\u20B9" + Math.round(v).toLocaleString("en-IN");
    };

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b border-amber-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white shadow border border-amber-100 overflow-hidden flex-shrink-0">
                <img src="/__mockup/images/hlc-logo.jpg" alt="HLC" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900 leading-tight">Mix Rate Estimate & Scenario Manager</h1>
                <p className="text-[11px] text-gray-400">High Lane Constructions</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isManager && (
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Shield className="w-3 h-3" /> View Only
                </span>
              )}
              {!isManager && (
                <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                  Admin
                </span>
              )}
              <button
                onClick={() => { setRole(null); setPin(""); }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => { window.close(); }}
                className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                title="Exit App"
              >
                <Power className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto w-full px-4 py-5 flex-1">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <a href="#" className="text-[11px] text-amber-600 hover:text-amber-800 font-medium bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-amber-100 transition-colors">
                <ExternalLink className="w-3 h-3" /> Open Calculator
              </a>
            </div>
            {!isManager && (
              <a href="#" className="text-[11px] text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ background: "linear-gradient(135deg, #f59e0b, #ea580c)" }}>
                <Plus className="w-3 h-3" /> New Contractor
              </a>
            )}
          </div>

          <div className="space-y-4">
            {projects.map((proj) => {
              const totalMt = proj.sites.reduce((s, site) => s + site.mt, 0);
              const totalAmt = proj.sites.reduce((s, site) => s + site.amt, 0);
              return (
                <div key={proj.name} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-100">
                    <div className="flex items-center gap-2.5">
                      <Building2 className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span className="font-bold text-[13px] text-gray-900">{proj.name}</span>
                      <span className="text-[11px] text-gray-400">{proj.sites.length} site{proj.sites.length !== 1 ? "s" : ""}</span>
                      <span className="text-[11px] font-medium text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">{totalMt} MT</span>
                      <span className="text-[11px] font-semibold text-white bg-green-600 px-2 py-0.5 rounded-full">{fmtAmt(totalAmt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-[11px] text-blue-600 font-medium border border-blue-200 bg-white px-2.5 py-1 rounded-lg flex items-center gap-1 hover:bg-blue-50 transition-colors">
                        <FlaskConical className="w-3 h-3" /> Price Impact
                      </button>
                      {!isManager && (
                        <button className="text-[11px] text-white font-medium px-2.5 py-1 rounded-lg flex items-center gap-1" style={{ background: "linear-gradient(135deg, #f59e0b, #ea580c)" }}>
                          <Plus className="w-3 h-3" /> New Site
                        </button>
                      )}
                    </div>
                  </div>
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
                        <th className="text-left px-4 py-2 font-semibold">Site Name</th>
                        <th className="text-right px-3 py-2 font-semibold">MT</th>
                        <th className="text-right px-3 py-2 font-semibold">Amount</th>
                        <th className="text-right px-3 py-2 font-semibold">Saved</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {proj.sites.map((site) => (
                        <tr key={site.name} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{site.name}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500">{site.mt} MT</td>
                          <td className="px-3 py-2.5 text-right font-medium text-gray-800">{fmtAmt(site.amt)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400 text-[11px]">{site.date}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <button className="text-[11px] text-gray-600 font-medium bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded transition-colors">Load</button>
                              {!isManager && (
                                <button className="text-[11px] text-red-500 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors">
                                  <span className="text-sm">🗑</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <button className="bg-white border border-gray-200 rounded-xl p-3.5 hover:border-amber-300 hover:shadow-md transition-all text-left group">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                  <Calculator className="w-4 h-4 text-amber-700" />
                </div>
                <span className="font-semibold text-[12px] text-gray-800">Calculator</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">Open mix rate calculator</p>
            </button>
            <button className="bg-white border border-gray-200 rounded-xl p-3.5 hover:border-blue-300 hover:shadow-md transition-all text-left group">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <BarChart3 className="w-4 h-4 text-blue-700" />
                </div>
                <span className="font-semibold text-[12px] text-gray-800">Scenarios</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">Price impact analysis</p>
            </button>
            <button className="bg-white border border-gray-200 rounded-xl p-3.5 hover:border-green-300 hover:shadow-md transition-all text-left group">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <TrendingUp className="w-4 h-4 text-green-700" />
                </div>
                <span className="font-semibold text-[12px] text-gray-800">Compare</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">Comparative report</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white shadow-lg shadow-amber-100 border border-amber-100 mb-5 overflow-hidden">
              <img src="/__mockup/images/hlc-logo.jpg" alt="HLC" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Mix Rate Estimate &<br />Scenario Manager
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              High Lane Constructions
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
                  Enter your PIN to access the portal
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
