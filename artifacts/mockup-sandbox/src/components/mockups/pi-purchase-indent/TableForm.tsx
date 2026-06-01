import React, { useState } from "react";
import { Plus, Trash2, Calendar, FileText, CheckCircle2, Factory } from "lucide-react";

interface IndentItem {
  id: string;
  description: string;
  uom: string;
  qty: number | "";
  estRate: number | "";
  stockAvailable: string | null;
  purpose: "Plant" | "Site" | "Admin" | "";
  paymentType: "Credit" | "Cash";
  remarks: string;
}

export function TableForm() {
  const [items, setItems] = useState<IndentItem[]>([
    {
      id: "1",
      description: "Bitumen Emulsion RS-1",
      uom: "MT",
      qty: 15,
      estRate: 42000,
      stockAvailable: "Stores: 2.5 MT",
      purpose: "Plant",
      paymentType: "Credit",
      remarks: "For upcoming NH-44 patch work",
    },
    {
      id: "2",
      description: "Hydraulic Oil 68",
      uom: "Ltr",
      qty: 210,
      estRate: 180,
      stockAvailable: null,
      purpose: "Plant",
      paymentType: "Cash",
      remarks: "Routine maintenance",
    },
    {
      id: "3",
      description: "Compactor Roller Tire 23.1-26",
      uom: "Nos",
      qty: 4,
      estRate: 15000,
      stockAvailable: "Stores: 1 NOS",
      purpose: "Site",
      paymentType: "Credit",
      remarks: "Replacement for broken tires",
    },
  ]);

  const totalEstimate = items.reduce((sum, item) => {
    const q = Number(item.qty) || 0;
    const r = Number(item.estRate) || 0;
    return sum + q * r;
  }, 0);

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Math.random().toString(36).substring(7),
        description: "",
        uom: "",
        qty: "",
        estRate: "",
        stockAvailable: null,
        purpose: "",
        paymentType: "Credit",
        remarks: "",
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: keyof IndentItem, value: any) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-sm" style={{ color: "#333" }}>
      <div className="max-w-[1200px] mx-auto bg-white shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
        {/* Header Bar */}
        <div className="bg-[#0F6E72] text-white p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#148b90] rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 opacity-50 pointer-events-none"></div>
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 bg-white rounded flex items-center justify-center text-[#E65C00] font-bold text-xl shadow-inner">
              <Factory size={28} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight m-0 text-white">HIGH LANE CONSTRUCTIONS PVT. LTD.</h1>
              <p className="text-[#8cd0d3] text-sm mt-0.5">Material & Spares Purchase Indent</p>
            </div>
          </div>
          <div className="text-right relative z-10 flex flex-col items-start md:items-end">
            <div className="bg-[#E65C00] text-white px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-sm shadow-sm mb-2">
              Indent Document
            </div>
            <div className="font-mono text-xl text-white font-medium">HLC/PI/2026/0012</div>
          </div>
        </div>

        <div className="p-6 md:p-8">
          {/* Meta Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="date" 
                  defaultValue="2026-04-12" 
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-[#0F6E72] focus:border-[#0F6E72] outline-none transition-all bg-slate-50"
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Site / Project</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-[#0F6E72] focus:border-[#0F6E72] outline-none transition-all bg-slate-50">
                <option>NH-44 Highway Project</option>
                <option>City Ring Road Extension</option>
                <option>HMP Base Plant</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Proposed By</label>
              <input 
                type="text" 
                defaultValue="Rajesh Kumar"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-[#0F6E72] focus:border-[#0F6E72] outline-none transition-all bg-slate-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Raised By</label>
              <input 
                type="text" 
                defaultValue="Site Engineer (Civil)"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-[#0F6E72] focus:border-[#0F6E72] outline-none transition-all bg-slate-50"
              />
            </div>

            <div className="col-span-1 md:col-span-2 lg:col-span-4 space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overall Remarks</label>
              <textarea 
                rows={2}
                defaultValue="Urgent requirement for the upcoming weekend shift. Please process ASAP."
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-[#0F6E72] focus:border-[#0F6E72] outline-none transition-all bg-slate-50 resize-none"
              ></textarea>
            </div>
          </div>

          {/* Table Section */}
          <div className="border border-slate-300 rounded-md overflow-hidden mb-8 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-300">
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-10 text-center">SL</th>
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-64">Item Description</th>
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-20 text-center">UOM</th>
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-24 text-right">Qty</th>
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-28 text-right">Est. Rate (₹)</th>
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-32 text-right">Amount (₹)</th>
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-36">Stock Available</th>
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-28">Purpose</th>
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-32">Credit/Cash</th>
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-48">Remarks</th>
                    <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wider w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, index) => {
                    const amount = (Number(item.qty) || 0) * (Number(item.estRate) || 0);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-2 px-3 text-center text-slate-500 font-medium bg-slate-50">{index + 1}</td>
                        <td className="py-2 px-3">
                          <input 
                            type="text" 
                            value={item.description}
                            onChange={(e) => updateItem(item.id, "description", e.target.value)}
                            placeholder="Enter item description..."
                            className="w-full bg-transparent border-0 border-b border-transparent focus:border-[#0F6E72] px-1 py-1.5 focus:ring-0 outline-none text-sm font-medium"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input 
                            type="text" 
                            value={item.uom}
                            onChange={(e) => updateItem(item.id, "uom", e.target.value)}
                            placeholder="Unit"
                            className="w-full bg-transparent border-0 border-b border-transparent focus:border-[#0F6E72] px-1 py-1.5 focus:ring-0 outline-none text-sm text-center"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input 
                            type="number" 
                            value={item.qty}
                            onChange={(e) => updateItem(item.id, "qty", e.target.value ? Number(e.target.value) : "")}
                            placeholder="0"
                            className="w-full bg-transparent border-0 border-b border-transparent focus:border-[#0F6E72] px-1 py-1.5 focus:ring-0 outline-none text-sm text-right font-mono"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input 
                            type="number" 
                            value={item.estRate}
                            onChange={(e) => updateItem(item.id, "estRate", e.target.value ? Number(e.target.value) : "")}
                            placeholder="0.00"
                            className="w-full bg-transparent border-0 border-b border-transparent focus:border-[#0F6E72] px-1 py-1.5 focus:ring-0 outline-none text-sm text-right font-mono text-slate-600"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800 bg-slate-50">
                          {amount > 0 ? amount.toLocaleString('en-IN') : "—"}
                        </td>
                        <td className="py-2 px-3">
                          {item.stockAvailable ? (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">
                              {item.stockAvailable}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic pl-2">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <select 
                            value={item.purpose}
                            onChange={(e) => updateItem(item.id, "purpose", e.target.value)}
                            className="w-full bg-transparent border-0 border-b border-transparent focus:border-[#0F6E72] px-1 py-1.5 focus:ring-0 outline-none text-sm text-slate-700"
                          >
                            <option value="">Select...</option>
                            <option value="Plant">Plant</option>
                            <option value="Site">Site</option>
                            <option value="Admin">Admin</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200">
                            <button 
                              onClick={() => updateItem(item.id, "paymentType", "Credit")}
                              className={`flex-1 text-xs py-1 px-2 rounded-sm transition-colors ${item.paymentType === 'Credit' ? 'bg-white shadow-sm font-medium text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                              Credit
                            </button>
                            <button 
                              onClick={() => updateItem(item.id, "paymentType", "Cash")}
                              className={`flex-1 text-xs py-1 px-2 rounded-sm transition-colors ${item.paymentType === 'Cash' ? 'bg-white shadow-sm font-medium text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                              Cash
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <input 
                            type="text" 
                            value={item.remarks}
                            onChange={(e) => updateItem(item.id, "remarks", e.target.value)}
                            placeholder="Optional remark"
                            className="w-full bg-transparent border-0 border-b border-transparent focus:border-[#0F6E72] px-1 py-1.5 focus:ring-0 outline-none text-sm text-slate-600"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button 
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Remove row"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={11} className="p-0 border-t border-slate-300">
                      <button 
                        onClick={addItem}
                        className="w-full py-3 flex items-center justify-center gap-2 text-[#0F6E72] hover:bg-[#0F6E72]/5 font-medium transition-colors text-sm"
                      >
                        <Plus size={16} />
                        Add Line Item
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Summary & Actions */}
          <div className="bg-slate-50 p-6 border border-slate-300 rounded-md flex flex-col md:flex-row justify-between items-center gap-6 mb-12 shadow-inner">
            <div className="flex gap-8 text-slate-700">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Items</div>
                <div className="text-2xl font-semibold font-mono">{items.length}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Est. Total Value</div>
                <div className="text-2xl font-bold font-mono text-[#0F6E72]">
                  ₹ {totalEstimate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            <button className="w-full md:w-auto bg-[#E65C00] hover:bg-[#cc5200] text-white px-8 py-3 rounded-md font-semibold tracking-wide shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2">
              <CheckCircle2 size={18} />
              Submit Indent for Approval
            </button>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 border-t border-dashed border-slate-300">
            <div className="border border-slate-200 p-4 rounded bg-white relative">
              <div className="absolute -top-3 left-4 bg-white px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Raised By
              </div>
              <div className="h-16 flex items-end justify-center mb-2">
                <div className="w-3/4 border-b border-slate-300"></div>
              </div>
              <div className="text-center text-xs text-slate-400">Signature / Date</div>
              <div className="mt-4">
                <input type="text" placeholder="Name" className="w-full text-center text-sm border-0 border-b border-slate-200 focus:ring-0 focus:border-[#0F6E72] px-2 py-1 outline-none" />
              </div>
            </div>

            <div className="border border-slate-200 p-4 rounded bg-white relative">
              <div className="absolute -top-3 left-4 bg-white px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Stores Checked
              </div>
              <div className="h-16 flex items-end justify-center mb-2">
                <div className="w-3/4 border-b border-slate-300"></div>
              </div>
              <div className="text-center text-xs text-slate-400">Signature / Date</div>
              <div className="mt-4">
                <input type="text" placeholder="Name" className="w-full text-center text-sm border-0 border-b border-slate-200 focus:ring-0 focus:border-[#0F6E72] px-2 py-1 outline-none" />
              </div>
            </div>

            <div className="border border-slate-200 p-4 rounded bg-white relative">
              <div className="absolute -top-3 left-4 bg-white px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Recommended By
              </div>
              <div className="h-16 flex items-end justify-center mb-2">
                <div className="w-3/4 border-b border-slate-300"></div>
              </div>
              <div className="text-center text-xs text-slate-400">Signature / Date</div>
              <div className="mt-4">
                <input type="text" placeholder="Name" className="w-full text-center text-sm border-0 border-b border-slate-200 focus:ring-0 focus:border-[#0F6E72] px-2 py-1 outline-none" />
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}