import { useState } from "react";

const INDENT = {
  id: "PI-2026-041",
  date: "12 Jun 2026",
  raisedBy: "Arjun Sharma",
  site: "NH-44 Km 24–28",
  status: "APPROVED",
  approvedBy: "Ravi Kumar (Manager)",
  approvedOn: "14 Jun 2026",
  items: [
    { id: 1, name: "Grinding Wheel 4\" (Bosch)", unit: "Nos", piQty: 10, approvedQty: 8, route: "STORES" },
    { id: 2, name: "Hydraulic Oil 46 Grade (20L)", unit: "Can", piQty: 4, approvedQty: 4, route: "STORES" },
    { id: 3, name: "Safety Gloves (Cotton)", unit: "Pair", piQty: 20, approvedQty: 15, route: "STORES" },
    { id: 4, name: "Drill Bit 12mm HSS", unit: "Nos", piQty: 6, approvedQty: 6, route: "STORES" },
  ],
};

const OTHER_INDENTS = [
  { id: "PI-2026-040", date: "11 Jun 2026", raisedBy: "Suresh Babu", status: "PENDING VERIFY", items: 3 },
  { id: "PI-2026-039", date: "10 Jun 2026", raisedBy: "Priya Nair", status: "STORES VERIFIED", items: 5 },
  { id: "PI-2026-038", date: "09 Jun 2026", raisedBy: "Kiran Reddy", status: "CLOSED", items: 2 },
];

const STATUS_COLORS: Record<string, string> = {
  "APPROVED": "bg-green-100 text-green-800 border border-green-200",
  "PENDING VERIFY": "bg-yellow-100 text-yellow-800 border border-yellow-200",
  "STORES VERIFIED": "bg-blue-100 text-blue-800 border border-blue-200",
  "CLOSED": "bg-gray-100 text-gray-600 border border-gray-200",
};

export default function RouteAStep1PiList() {
  const [selected, setSelected] = useState<string | null>(null);
  const [actionTaken, setActionTaken] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-600 rounded flex items-center justify-center text-white text-xs font-bold">PI</div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Purchase Indents</div>
            <div className="text-xs text-gray-500">Procurement · Route A (Stores)</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">Site: NH-44</div>
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">RK</div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Indent List */}
        <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Indents</div>
            <input className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-600 bg-gray-50" placeholder="Search by ID or item…" />
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {/* Highlighted approved indent */}
            <div
              className={`px-4 py-3 cursor-pointer transition-colors ${selected === INDENT.id ? "bg-orange-50 border-l-2 border-orange-500" : "hover:bg-gray-50 border-l-2 border-transparent"}`}
              onClick={() => setSelected(INDENT.id)}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="text-xs font-semibold text-gray-900">{INDENT.id}</div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[INDENT.status]}`}>{INDENT.status}</span>
              </div>
              <div className="text-xs text-gray-500">{INDENT.date} · {INDENT.raisedBy}</div>
              <div className="text-xs text-gray-400 mt-0.5">{INDENT.items.length} items · {INDENT.site}</div>
              {!actionTaken && (
                <div className="mt-2 flex items-center gap-1 text-violet-600">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <span className="text-[10px] font-semibold">Action Required</span>
                </div>
              )}
            </div>
            {OTHER_INDENTS.map(i => (
              <div
                key={i.id}
                className={`px-4 py-3 cursor-pointer transition-colors ${selected === i.id ? "bg-orange-50 border-l-2 border-orange-500" : "hover:bg-gray-50 border-l-2 border-transparent"}`}
                onClick={() => setSelected(i.id)}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="text-xs font-semibold text-gray-900">{i.id}</div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[i.status]}`}>{i.status}</span>
                </div>
                <div className="text-xs text-gray-500">{i.date} · {i.raisedBy}</div>
                <div className="text-xs text-gray-400 mt-0.5">{i.items} items</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {selected !== INDENT.id ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
              <div className="text-5xl mb-3">📋</div>
              <div className="text-sm font-medium">Select a Purchase Indent</div>
              <div className="text-xs mt-1">Click <strong>PI-2026-041</strong> on the left — it needs Purchaser Action</div>
            </div>
          ) : (
            <div>
              {/* PI Header */}
              <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-base font-bold text-gray-900">{INDENT.id}</h2>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[INDENT.status]}`}>{INDENT.status}</span>
                    </div>
                    <div className="text-xs text-gray-500">Raised by <strong>{INDENT.raisedBy}</strong> on {INDENT.date} · {INDENT.site}</div>
                  </div>
                  {!actionTaken && (
                    <button
                      onClick={() => setActionTaken(true)}
                      className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                      Take Purchaser Action
                    </button>
                  )}
                  {actionTaken && (
                    <div className="flex items-center gap-2 bg-violet-100 text-violet-700 text-xs font-semibold px-3 py-2 rounded-lg border border-violet-200">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Purchaser Action Submitted
                    </div>
                  )}
                </div>
                <div className="flex gap-6 text-xs">
                  <div><span className="text-gray-400">Approved by</span> <span className="font-medium text-gray-700">{INDENT.approvedBy}</span></div>
                  <div><span className="text-gray-400">Approved on</span> <span className="font-medium text-gray-700">{INDENT.approvedOn}</span></div>
                  <div><span className="text-gray-400">Route</span> <span className="font-medium text-indigo-600">STORES (Route A)</span></div>
                </div>
              </div>

              {/* Items Table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Indent Items</div>
                  <div className="text-xs text-gray-400">{INDENT.items.length} items · Route A</div>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-medium">#</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Item / Material</th>
                      <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Unit</th>
                      <th className="text-center px-4 py-2.5 text-gray-500 font-medium">PI Qty</th>
                      <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Approved Qty</th>
                      <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Route</th>
                      <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {INDENT.items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{item.unit}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{item.piQty}</td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-800">{item.approvedQty}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-indigo-50 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded">STORES</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {actionTaken ? (
                            <span className="bg-violet-100 text-violet-700 text-[10px] font-semibold px-2 py-0.5 rounded">ACTIONED</span>
                          ) : (
                            <span className="bg-yellow-100 text-yellow-700 text-[10px] font-semibold px-2 py-0.5 rounded">APPROVED</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!actionTaken && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-violet-800 mb-0.5">Purchaser Action Required</div>
                    <div className="text-xs text-violet-600">This indent is approved and ready for the purchaser to fill in purchase details — vendor, rate, qty purchasing, and any shortfall reasons. Click <strong>Take Purchaser Action</strong> to proceed.</div>
                  </div>
                </div>
              )}

              {actionTaken && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <div>
                    <div className="text-xs font-semibold text-green-800 mb-0.5">Purchaser Action Submitted</div>
                    <div className="text-xs text-green-700">Items now await physical purchase and handover to stores. See <strong>Step 3</strong> for Handover to Stores.</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Step Indicator */}
      <div className="bg-white border-t border-gray-200 px-6 py-2 flex items-center gap-2">
        {["PI Created", "Stores Verified", "Approved", "Purchaser Action", "Handover", "GRN"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-6 h-px bg-gray-300" />}
            <div className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full ${
              i < 3 ? "bg-green-100 text-green-700" :
              i === 3 ? "bg-violet-100 text-violet-700 ring-1 ring-violet-400" :
              "bg-gray-100 text-gray-400"
            }`}>
              {i < 3 && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
              {s}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
