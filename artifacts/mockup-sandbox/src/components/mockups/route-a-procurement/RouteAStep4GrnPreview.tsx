import { useState } from "react";

const GRN_DATA = {
  grnNo: "GRN-2026-4823",
  piRef: "PI-2026-041",
  handoverDate: "15 Jun 2026",
  receivedBy: "Mohan Das (Store Keeper)",
  verifiedBy: "Rajesh P. (Purchaser)",
  site: "NH-44 Km 24–28",
  items: [
    { id: 1, name: "Grinding Wheel 4\" (Bosch)", unit: "Nos", acceptedQty: 8, rejectedQty: 0, rate: 145, vendor: "Bosch Tools Depot", paymentMode: "Cash" },
    { id: 2, name: "Hydraulic Oil 46 Grade (20L)", unit: "Can", acceptedQty: 4, rejectedQty: 0, rate: 2200, vendor: "Lubricants India Ltd", paymentMode: "Credit" },
    { id: 3, name: "Safety Gloves (Cotton)", unit: "Pair", acceptedQty: 13, rejectedQty: 2, rate: 35, vendor: "Safety First Stores", paymentMode: "Cash", rejReason: "Damaged packaging" },
    { id: 4, name: "Drill Bit 12mm HSS", unit: "Nos", acceptedQty: 6, rejectedQty: 0, rate: 280, vendor: "Tool Hub Pvt Ltd", paymentMode: "UPI" },
  ],
};

export default function RouteAStep4GrnPreview() {
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("2026-06-14");
  const [remarks, setRemarks] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const totalValue = GRN_DATA.items.reduce((s, i) => s + i.acceptedQty * i.rate, 0);
  const totalRejected = GRN_DATA.items.reduce((s, i) => s + i.rejectedQty, 0);

  const handleSubmit = () => {
    if (!invoiceNo.trim()) { setError("Invoice/Bill number is required to confirm GRN"); return; }
    setError("");
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">{GRN_DATA.grnNo} Confirmed</h2>
          <p className="text-sm text-gray-500 mb-6">Goods Receipt Note accepted. Stores inventory updated.</p>

          <div className="grid grid-cols-2 gap-3 mb-6 text-left">
            {[
              ["GRN No.", GRN_DATA.grnNo],
              ["Invoice No.", invoiceNo],
              ["Invoice Date", invoiceDate],
              ["Total Value", `₹${totalValue.toLocaleString("en-IN")}`],
              ["Items Received", `${GRN_DATA.items.length} line items`],
              ["Rejected Items", `${totalRejected} unit(s)`],
            ].map(([label, value]) => (
              <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-400">{label}</div>
                <div className="text-xs font-semibold text-gray-800">{value}</div>
              </div>
            ))}
          </div>

          <div className="space-y-2 mb-6">
            {GRN_DATA.items.map(item => (
              <div key={item.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-gray-600 font-medium truncate mr-2">{item.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-green-700 font-bold">+{item.acceptedQty} {item.unit}</span>
                  {item.rejectedQty > 0 && <span className="text-red-500 text-[10px]">({item.rejectedQty} rejected)</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 text-left mb-4">
            <strong>PI-2026-041 is now CLOSED.</strong> All accepted items have been added to the Stores inventory ledger. Vendor bills can be raised against this GRN.
          </div>

          <button onClick={() => setSubmitted(false)} className="text-xs text-gray-400 underline hover:text-gray-600">← Edit GRN</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Purchase Indents</span>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span>PI-2026-041</span>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-green-700 font-semibold">Goods Receipt Note (GRN)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full font-medium">⚠ Pre-filled from Handover — Review &amp; Confirm</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Pre-fill notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 flex items-start gap-3">
          <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div className="text-xs text-amber-700">
            <strong>Pre-filled from Handover</strong> — Item quantities, rates, and vendor details have been filled automatically from the Purchaser Action and Handover records. The stores person only needs to add the <strong>invoice/bill number</strong>, verify the details, and confirm.
          </div>
        </div>

        {/* GRN Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-gray-900">{GRN_DATA.grnNo}</h2>
                <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">DRAFT — Pending Store Confirm</span>
              </div>
              <div className="text-xs text-gray-500">PI Ref: {GRN_DATA.piRef} · Site: {GRN_DATA.site}</div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>Received: <strong className="text-gray-700">{GRN_DATA.handoverDate}</strong></div>
              <div>By: <strong className="text-gray-700">{GRN_DATA.receivedBy}</strong></div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Invoice / Bill No. <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal ml-1">(add manually)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. INV-BOSCH-00841"
                value={invoiceNo}
                onChange={e => { setInvoiceNo(e.target.value); setError(""); }}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 ${error ? "border-red-300 ring-1 ring-red-200" : "border-gray-200"}`}
              />
              {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Invoice Date <span className="text-gray-400 font-normal">(pre-filled)</span></label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Verified by (Purchaser)</label>
              <div className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-600">{GRN_DATA.verifiedBy}</div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Receipt Items</div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Pre-filled from handover</span>
              {totalRejected > 0 && <span className="flex items-center gap-1 text-amber-500"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> {totalRejected} unit(s) rejected</span>}
            </div>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Item / Material</th>
                <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Accepted Qty</th>
                <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Rejected</th>
                <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Unit</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Rate (₹)</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Amount (₹)</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Vendor</th>
                <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {GRN_DATA.items.map(item => (
                <tr key={item.id} className={item.rejectedQty > 0 ? "bg-amber-50" : ""}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{item.name}</div>
                    {item.rejectedQty > 0 && <div className="text-[10px] text-red-500 mt-0.5">Rejected: {item.rejectedQty} {item.unit} — {item.rejReason}</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded">{item.acceptedQty}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.rejectedQty > 0 ? (
                      <span className="font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded">{item.rejectedQty}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{item.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{item.rate.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">{(item.acceptedQty * item.rate).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-gray-600">{item.vendor}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.paymentMode}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Total GRN Value</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">₹{totalValue.toLocaleString("en-IN")}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Remarks */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-5">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Remarks (optional)</label>
          <textarea
            rows={2}
            placeholder="Any additional notes about this GRN…"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
          />
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">Confirming will post stock to Stores inventory and close PI-2026-041.</div>
          <div className="flex items-center gap-3">
            <button className="text-xs text-gray-500 px-4 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">Print Draft GRN</button>
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Confirm GRN &amp; Update Stock
            </button>
          </div>
        </div>
      </div>

      {/* Footer step indicator */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 flex items-center gap-2">
        {["PI Created", "Stores Verified", "Approved", "Purchaser Action", "Handover", "GRN"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-6 h-px bg-gray-300" />}
            <div className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full ${
              i < 5 ? "bg-green-100 text-green-700" :
              i === 5 ? "bg-green-600 text-white ring-1 ring-green-700" :
              "bg-gray-100 text-gray-400"
            }`}>
              {i < 5 && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
              {s}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
