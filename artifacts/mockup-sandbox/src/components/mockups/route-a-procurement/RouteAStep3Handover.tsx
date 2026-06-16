import { useState } from "react";

const PURCHASED_ITEMS = [
  { id: 1, name: "Grinding Wheel 4\" (Bosch)", unit: "Nos", purchasedQty: 8, vendor: "Bosch Tools Depot", rate: 145, paymentMode: "cash" },
  { id: 2, name: "Hydraulic Oil 46 Grade (20L)", unit: "Can", purchasedQty: 4, vendor: "Lubricants India Ltd", rate: 2200, paymentMode: "credit" },
  { id: 3, name: "Safety Gloves (Cotton)", unit: "Pair", purchasedQty: 15, vendor: "Safety First Stores", rate: 35, paymentMode: "cash" },
  { id: 4, name: "Drill Bit 12mm HSS", unit: "Nos", purchasedQty: 6, vendor: "Tool Hub Pvt Ltd", rate: 280, paymentMode: "upi" },
];

type HandoverEntry = {
  handoverQty: string;
  acceptedQty: string;
  rejectedQty: string;
  rejectionReason: string;
};

type Step = "form" | "review" | "grn";

export default function RouteAStep3Handover() {
  const [step, setStep] = useState<Step>("form");
  const [handoverDate, setHandoverDate] = useState("2026-06-15");
  const [receivedBy, setReceivedBy] = useState("");
  const [entries, setEntries] = useState<Record<number, HandoverEntry>>(
    Object.fromEntries(PURCHASED_ITEMS.map(i => [i.id, {
      handoverQty: String(i.purchasedQty),
      acceptedQty: String(i.purchasedQty),
      rejectedQty: "0",
      rejectionReason: "",
    }]))
  );
  const [grnNo] = useState("GRN-2026-" + Math.floor(1000 + Math.random() * 8999));

  const updateEntry = (id: number, field: keyof HandoverEntry, value: string) => {
    setEntries(prev => {
      const cur = prev[id];
      const next: HandoverEntry = { ...cur, [field]: value };
      const item = PURCHASED_ITEMS.find(i => i.id === id)!;

      if (field === "handoverQty") {
        const hqty = parseFloat(value) || 0;
        next.acceptedQty = String(Math.min(hqty, item.purchasedQty));
        next.rejectedQty = String(Math.max(0, hqty - parseFloat(next.acceptedQty)));
      }
      if (field === "acceptedQty") {
        const hqty = parseFloat(cur.handoverQty) || 0;
        const aqty = Math.min(parseFloat(value) || 0, hqty);
        next.acceptedQty = String(aqty);
        next.rejectedQty = String(Math.max(0, hqty - aqty));
      }
      return { ...prev, [id]: next };
    });
  };

  const totalValue = PURCHASED_ITEMS.reduce((sum, item) => {
    const e = entries[item.id];
    return sum + (parseFloat(e.acceptedQty) || 0) * item.rate;
  }, 0);

  if (step === "grn") {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Purchase Indents</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <span>PI-2026-041</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <span className="text-green-700 font-semibold">GRN Generated</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-green-700 bg-green-100 border border-green-200 px-3 py-1.5 rounded-full">✓ GRN Created &amp; Stock Updated</span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Handover Recorded — GRN Preview</h2>
              <p className="text-xs text-gray-500">Scroll to Step 4 frame to see the full GRN. Stock has been updated in Stores.</p>
            </div>
          </div>

          <div className="bg-white border border-green-200 rounded-lg overflow-hidden mb-4">
            <div className="px-5 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
              <div className="text-sm font-bold text-green-800">{grnNo}</div>
              <div className="text-xs text-green-600">Generated from PI-2026-041 · {handoverDate}</div>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Item</th>
                  <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Accepted Qty</th>
                  <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Unit</th>
                  <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Rate (₹)</th>
                  <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Amount (₹)</th>
                  <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {PURCHASED_ITEMS.map(item => {
                  const e = entries[item.id];
                  const aqty = parseFloat(e.acceptedQty) || 0;
                  return (
                    <tr key={item.id} className={parseFloat(e.rejectedQty) > 0 ? "bg-amber-50" : ""}>
                      <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                      <td className="px-4 py-3 text-center font-semibold text-green-700">{e.acceptedQty}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{item.unit}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{item.rate.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-800">{(aqty * item.rate).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded">+{e.acceptedQty} {item.unit}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={4} className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Total Value</td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900">₹{totalValue.toLocaleString("en-IN")}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-400 mb-1">GRN Number</div>
              <div className="text-sm font-bold text-gray-900">{grnNo}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-400 mb-1">Received By (Stores)</div>
              <div className="text-sm font-bold text-gray-900">{receivedBy || "Store Keeper"}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-400 mb-1">Date of Receipt</div>
              <div className="text-sm font-bold text-gray-900">{handoverDate}</div>
            </div>
          </div>

          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-700">
            <strong>Stock Updated:</strong> All accepted quantities have been added to the Stores inventory. The PI is now closed for the accepted items.
          </div>

          <button onClick={() => setStep("form")} className="mt-4 text-xs text-gray-400 underline hover:text-gray-600">← Back to Handover form</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Purchase Indents</span>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span>PI-2026-041</span>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-indigo-700 font-semibold">Handover to Stores</span>
        </div>
        <div className="text-xs text-gray-400">Purchaser → Stores · Route A</div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 mb-5 flex items-start gap-3">
          <svg className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
          <div className="text-xs text-indigo-700">
            <strong>Handover to Stores</strong> — The purchaser has physically brought the goods to the site. Record the quantity handed over, quantity accepted by stores (after inspection), and any rejected items with the reason. This will pre-fill the GRN.
          </div>
        </div>

        {/* Handover header */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Handover Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={handoverDate}
                onChange={e => setHandoverDate(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Received by (Stores) <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={receivedBy}
                onChange={e => setReceivedBy(e.target.value)}
                placeholder="e.g. Mohan Das (Store Keeper)"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">PI Reference</label>
              <div className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-600">PI-2026-041</div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Handover Details — Per Item</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium min-w-48">Item</th>
                  <th className="text-center px-3 py-2.5 text-gray-500 font-medium">Purchased<br/>(by purchaser)</th>
                  <th className="text-center px-3 py-2.5 text-gray-500 font-medium">Qty<br/>Handed Over</th>
                  <th className="text-center px-3 py-2.5 text-gray-500 font-medium">Qty<br/>Accepted ✓</th>
                  <th className="text-center px-3 py-2.5 text-gray-500 font-medium">Qty<br/>Rejected ✗</th>
                  <th className="text-left px-3 py-2.5 text-gray-500 font-medium">Rejection Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {PURCHASED_ITEMS.map(item => {
                  const e = entries[item.id];
                  const hasRejection = parseFloat(e.rejectedQty) > 0;
                  return (
                    <tr key={item.id} className={hasRejection ? "bg-amber-50" : ""}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{item.name}</div>
                        <div className="text-gray-400 mt-0.5">{item.vendor} · ₹{item.rate}/{item.unit}</div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-semibold text-gray-700">{item.purchasedQty}</span>
                        <span className="text-gray-400 ml-1">{item.unit}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max={item.purchasedQty}
                          value={e.handoverQty}
                          onChange={ev => updateEntry(item.id, "handoverQty", ev.target.value)}
                          className="w-20 border border-gray-200 rounded px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max={parseFloat(e.handoverQty) || 0}
                          value={e.acceptedQty}
                          onChange={ev => updateEntry(item.id, "acceptedQty", ev.target.value)}
                          className="w-20 border border-green-300 rounded px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-green-300 bg-green-50 text-green-800 font-semibold"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className={`w-20 border rounded px-2 py-1.5 text-center font-semibold mx-auto ${hasRejection ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                          {e.rejectedQty}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {hasRejection ? (
                          <input
                            type="text"
                            placeholder="e.g. Damaged packaging"
                            value={e.rejectionReason}
                            onChange={ev => updateEntry(item.id, "rejectionReason", ev.target.value)}
                            className="w-full border border-amber-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 bg-amber-50"
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">GRN Summary (what will be recorded)</div>
          <div className="grid grid-cols-4 gap-4">
            {PURCHASED_ITEMS.map(item => {
              const e = entries[item.id];
              const aqty = parseFloat(e.acceptedQty) || 0;
              const rqty = parseFloat(e.rejectedQty) || 0;
              return (
                <div key={item.id} className="text-xs">
                  <div className="text-gray-500 truncate mb-1">{item.name.split(" ").slice(0, 3).join(" ")}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-700 font-bold">+{aqty}</span>
                    <span className="text-gray-400">{item.unit}</span>
                    {rqty > 0 && <span className="text-red-500 text-[10px]">({rqty} rejected)</span>}
                  </div>
                  <div className="text-gray-400">₹{(aqty * item.rate).toLocaleString("en-IN")}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs text-gray-500">Total GRN Value</div>
            <div className="text-sm font-bold text-gray-900">₹{totalValue.toLocaleString("en-IN")}</div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">Confirming handover will generate GRN and update stores stock.</div>
          <button
            onClick={() => setStep("grn")}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            Confirm Handover &amp; Generate GRN
          </button>
        </div>
      </div>

      {/* Footer step indicator */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 flex items-center gap-2">
        {["PI Created", "Stores Verified", "Approved", "Purchaser Action", "Handover", "GRN"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-6 h-px bg-gray-300" />}
            <div className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full ${
              i < 4 ? "bg-green-100 text-green-700" :
              i === 4 ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-400" :
              "bg-gray-100 text-gray-400"
            }`}>
              {i < 4 && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
              {s}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
