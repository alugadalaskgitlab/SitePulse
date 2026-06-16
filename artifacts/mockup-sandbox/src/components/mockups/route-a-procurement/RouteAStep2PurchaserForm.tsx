import { useState } from "react";

const ITEMS = [
  { id: 1, name: "Grinding Wheel 4\" (Bosch)", unit: "Nos", piQty: 10, approvedQty: 8 },
  { id: 2, name: "Hydraulic Oil 46 Grade (20L)", unit: "Can", piQty: 4, approvedQty: 4 },
  { id: 3, name: "Safety Gloves (Cotton)", unit: "Pair", piQty: 20, approvedQty: 15 },
  { id: 4, name: "Drill Bit 12mm HSS", unit: "Nos", piQty: 6, approvedQty: 6 },
];

type ItemAction = {
  purchaseQty: string;
  status: "full" | "not_available" | "ordered" | "partial";
  expectedDate: string;
  vendor: string;
  rate: string;
  paymentMode: string;
};

const DEFAULT_ACTION = (approvedQty: number): ItemAction => ({
  purchaseQty: String(approvedQty),
  status: "full",
  expectedDate: "",
  vendor: "",
  rate: "",
  paymentMode: "cash",
});

export default function RouteAStep2PurchaserForm() {
  const [actions, setActions] = useState<Record<number, ItemAction>>(
    Object.fromEntries(ITEMS.map(i => [i.id, DEFAULT_ACTION(i.approvedQty)]))
  );
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const update = (id: number, field: keyof ItemAction, value: string) => {
    setActions(prev => {
      const cur = prev[id];
      let next: ItemAction = { ...cur, [field]: value };

      if (field === "purchaseQty") {
        const qty = parseFloat(value);
        const approved = ITEMS.find(i => i.id === id)!.approvedQty;
        if (!isNaN(qty) && qty >= approved) next.status = "full";
        else if (!isNaN(qty) && qty > 0 && qty < approved) next.status = "partial";
        else if (!isNaN(qty) && qty === 0) next.status = "not_available";
      }

      if (field === "status") {
        if (value === "not_available") next.purchaseQty = "0";
        if (value === "full") next.purchaseQty = String(ITEMS.find(i => i.id === id)!.approvedQty);
      }

      return { ...prev, [id]: next };
    });
    setErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const validate = () => {
    const errs: Record<number, string> = {};
    ITEMS.forEach(item => {
      const a = actions[item.id];
      if (!a.vendor.trim()) errs[item.id] = "Vendor is required";
      if (!a.rate || parseFloat(a.rate) <= 0) errs[item.id] = "Rate is required";
      if (a.status === "ordered" && !a.expectedDate) errs[item.id] = "Expected delivery date required for Ordered status";
    });
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitted(true);
  };

  const statusLabel: Record<string, { label: string; color: string }> = {
    full: { label: "Purchasing in Full", color: "bg-green-100 text-green-700" },
    partial: { label: "Partial Purchase", color: "bg-amber-100 text-amber-700" },
    not_available: { label: "Not Available", color: "bg-red-100 text-red-700" },
    ordered: { label: "Ordered", color: "bg-blue-100 text-blue-700" },
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-2">Purchaser Action Submitted</h3>
          <p className="text-sm text-gray-500 mb-6">Purchase details recorded for PI-2026-041. Proceed to physically acquire the items and hand them over to stores.</p>
          <div className="space-y-2 text-left mb-6">
            {ITEMS.map(item => {
              const a = actions[item.id];
              return (
                <div key={item.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-600 font-medium truncate flex-1 mr-2">{item.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusLabel[a.status].color}`}>{statusLabel[a.status].label}</span>
                    {parseFloat(a.purchaseQty) > 0 && <span className="text-gray-500">{a.purchaseQty} {item.unit}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-left">
            <div className="text-xs font-semibold text-violet-700 mb-1">Next Step</div>
            <div className="text-xs text-violet-600">Once goods are physically collected, go to <strong>Handover to Stores</strong> (Step 3) to record the handover and trigger the GRN.</div>
          </div>
          <button onClick={() => setSubmitted(false)} className="mt-4 text-xs text-gray-400 underline hover:text-gray-600">Edit submission</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs">
            <span>Purchase Indents</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <span className="text-gray-700 font-semibold">PI-2026-041</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <span className="text-violet-700 font-semibold">Purchaser Action</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Approved · 14 Jun 2026</span>
          <div className="w-1 h-1 rounded-full bg-gray-300" />
          <span>4 items · Route A</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Info banner */}
        <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 mb-5 flex items-start gap-3">
          <svg className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div className="text-xs text-violet-700">
            <strong>Purchaser Action Form</strong> — Fill in the details for each item: how much you are purchasing, from which vendor, and at what rate. If you are purchasing less than the approved quantity, select the reason.
          </div>
        </div>

        {/* Items */}
        <div className="space-y-4">
          {ITEMS.map((item, idx) => {
            const a = actions[item.id];
            const purchaseQtyNum = parseFloat(a.purchaseQty) || 0;
            const isShort = purchaseQtyNum < item.approvedQty;
            const err = errors[item.id];

            return (
              <div key={item.id} className={`bg-white rounded-lg border ${err ? "border-red-300 ring-1 ring-red-200" : "border-gray-200"} overflow-hidden`}>
                {/* Item header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">{idx + 1}</div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{item.name}</div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                        <span>PI Qty: <strong className="text-gray-600">{item.piQty} {item.unit}</strong></span>
                        <span>Approved Qty: <strong className="text-green-700">{item.approvedQty} {item.unit}</strong></span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${statusLabel[a.status].color}`}>{statusLabel[a.status].label}</span>
                </div>

                {/* Form fields */}
                <div className="px-5 py-4">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {/* Qty Purchasing */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Qty Purchasing <span className="text-red-500">*</span>
                        <span className="text-gray-400 font-normal ml-1">(max {item.approvedQty} {item.unit})</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={item.approvedQty}
                        value={a.purchaseQty}
                        onChange={e => update(item.id, "purchaseQty", e.target.value)}
                        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                      {isShort && purchaseQtyNum >= 0 && (
                        <div className="text-xs text-amber-600 mt-1">
                          {purchaseQtyNum === 0 ? "Entering 0 means item cannot be purchased now" : `Shortfall: ${item.approvedQty - purchaseQtyNum} ${item.unit} below approved`}
                        </div>
                      )}
                    </div>

                    {/* Shortfall reason */}
                    {isShort && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Shortfall Reason <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={a.status === "full" ? "" : a.status}
                          onChange={e => update(item.id, "status", e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        >
                          <option value="partial">Partially Available — buying what I can</option>
                          <option value="not_available">Not Available in Market</option>
                          <option value="ordered">Ordered — awaiting delivery</option>
                        </select>
                      </div>
                    )}

                    {/* Expected Delivery Date (when ordered) */}
                    {a.status === "ordered" && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Expected Delivery Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={a.expectedDate}
                          min="2026-06-15"
                          onChange={e => update(item.id, "expectedDate", e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                      </div>
                    )}
                  </div>

                  {/* Vendor / Rate / Payment */}
                  {(a.status !== "not_available") && (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Vendor / Supplier <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          placeholder="e.g. Bosch Tools Supplier"
                          value={a.vendor}
                          onChange={e => update(item.id, "vendor", e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Rate (₹ per {item.unit}) <span className="text-red-500">*</span></label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={a.rate}
                          onChange={e => update(item.id, "rate", e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        {a.rate && purchaseQtyNum > 0 && (
                          <div className="text-xs text-gray-400 mt-1">Total: ₹{(parseFloat(a.rate) * purchaseQtyNum).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Mode</label>
                        <select
                          value={a.paymentMode}
                          onChange={e => update(item.id, "paymentMode", e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        >
                          <option value="cash">Cash</option>
                          <option value="credit">Credit (30 days)</option>
                          <option value="advance">Advance</option>
                          <option value="upi">UPI</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {a.status === "not_available" && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                      This item is not available in the market. It will be marked as <strong>Not Available</strong> — no further action needed for this item.
                    </div>
                  )}

                  {err && <div className="text-xs text-red-600 mt-2 flex items-center gap-1"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>{err}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit */}
        <div className="mt-6 flex items-center justify-between">
          <div className="text-xs text-gray-400">PI-2026-041 · 4 items · Purchaser: Rajesh P.</div>
          <div className="flex items-center gap-3">
            <button className="text-xs text-gray-500 hover:text-gray-700 px-4 py-2 border border-gray-200 rounded-lg bg-white">Save Draft</button>
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Submit Purchaser Action
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
