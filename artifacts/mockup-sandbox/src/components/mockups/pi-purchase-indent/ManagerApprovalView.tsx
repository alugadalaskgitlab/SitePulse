import React, { useState } from "react";
import { 
  Check, 
  X, 
  Edit2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  PackageCheck, 
  AlertTriangle, 
  FileText, 
  ArrowLeft,
  Info
} from "lucide-react";

export function ManagerApprovalView() {
  const [item4State, setItem4State] = useState<'pending' | 'modifying' | 'rejecting' | 'approved' | 'rejected' | 'modified'>('pending');
  const [item4ModQty, setItem4ModQty] = useState('15');
  const [item4RejectReason, setItem4RejectReason] = useState('');
  const [overallRemarks, setOverallRemarks] = useState('');

  const isAllActioned = item4State === 'approved' || item4State === 'rejected' || item4State === 'modified';

  return (
    <div className="mx-auto max-w-[480px] bg-gray-50 min-h-[100dvh] flex flex-col relative font-sans shadow-xl sm:border-x border-gray-200">
      
      {/* HEADER */}
      <header className="bg-[#0F5F64] text-white px-4 py-4 sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-3 mb-3">
          <button className="p-1 -ml-1 hover:bg-white/10 rounded-full transition-colors text-white/90">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold text-lg leading-tight">PI-2026-0042</h1>
            <p className="text-white/70 text-xs">Raised by Amit Patel · 01 Jun 2026</p>
          </div>
          <div className="ml-auto bg-amber-500/20 text-amber-200 border border-amber-500/30 text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider">
            Pending Mgr
          </div>
        </div>
        
        <div className="bg-white/10 rounded-lg p-2.5 flex items-start gap-2 border border-white/5">
          <PackageCheck className="w-4 h-4 text-green-300 mt-0.5 shrink-0" />
          <div className="text-xs">
            <span className="font-medium text-white">Stores Verified</span>
            <span className="text-white/70 ml-1">· Raju K · 01 Jun 14:45</span>
          </div>
        </div>
      </header>

      {/* SUMMARY BAR */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center sticky top-[108px] z-10 shadow-sm">
        <div className="flex gap-4 text-sm">
          <div className="flex flex-col">
            <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Actioned</span>
            <span className="font-semibold text-gray-900">{isAllActioned ? '4' : '3'} / 4</span>
          </div>
          <div className="w-px bg-gray-200 my-1"></div>
          <div className="flex flex-col">
            <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Est. Total</span>
            <span className="font-semibold text-gray-900">₹6,45,450</span>
          </div>
        </div>
        {!isAllActioned && (
          <button className="text-xs font-medium text-[#0F5F64] bg-[#0F5F64]/10 px-3 py-1.5 rounded-md hover:bg-[#0F5F64]/20 transition-colors">
            Approve All Available
          </button>
        )}
      </div>

      <main className="flex-1 p-4 flex flex-col gap-3 pb-36">
        
        {/* ITEM 1 - APPROVED */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <h3 className="font-semibold text-green-900 text-sm">1. Hydraulic Jack 10T</h3>
            <span className="text-green-800 font-medium text-sm">2 NOS</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <PackageCheck className="w-3.5 h-3.5 text-green-600" />
            <span className="text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full">Stores: 2 NOS available</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-100/50 py-1.5 px-2 rounded-md">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="font-medium">Approved as requested</span>
            <span className="text-green-600/70 ml-auto">Sunil K · 15:02</span>
          </div>
        </div>

        {/* ITEM 2 - REJECTED */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <h3 className="font-semibold text-red-900 text-sm line-through decoration-red-300">2. Compactor Belt</h3>
            <span className="text-red-800 font-medium text-sm">1 NOS</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-gray-600 font-medium bg-gray-100 px-2 py-0.5 rounded-full">Stores: No stock</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-100/50 py-1.5 px-2 rounded-md">
            <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="font-medium">Rejected</span>
              <span className="text-red-600">"Not in budget this month"</span>
            </div>
            <span className="text-red-600/70 ml-auto mt-0.5">Sunil K · 15:03</span>
          </div>
        </div>

        {/* ITEM 3 - MODIFIED */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <h3 className="font-semibold text-amber-900 text-sm">3. Drill Bit 25mm</h3>
            <div className="flex flex-col items-end">
              <span className="text-amber-800 font-bold text-sm">2 NOS</span>
              <span className="text-amber-600/80 text-[10px] line-through">req: 5 NOS</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-amber-700 font-medium bg-amber-100 px-2 py-0.5 rounded-full">Stores: 2 of 5 — short supply</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-100/50 py-1.5 px-2 rounded-md">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="font-medium">Partial Approval (2 of 5)</span>
              <span className="text-amber-700">"Only 2 needed urgently"</span>
            </div>
            <span className="text-amber-600/70 ml-auto mt-0.5">Sunil K · 15:04</span>
          </div>
        </div>

        {/* ITEM 4 - PENDING OR ACTIONED */}
        {item4State === 'pending' || item4State === 'modifying' || item4State === 'rejecting' ? (
          <div className="bg-white border-2 border-[#0F5F64]/20 shadow-md rounded-xl overflow-hidden mt-2">
            <div className="p-4 border-b border-gray-100">
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-bold text-gray-900 text-base">4. Bitumen Emulsion RS-1</h3>
                <span className="font-bold text-gray-900 text-base bg-gray-100 px-2 py-0.5 rounded">15 MT</span>
              </div>
              <div className="flex justify-between items-center text-sm text-gray-500 mb-3">
                <span>Rate: ₹42,000/MT</span>
                <span className="font-medium text-gray-700">Est: ₹6,30,000</span>
              </div>
              
              <div className="bg-green-50 border border-green-200 text-green-800 text-xs px-3 py-2 rounded-md flex items-center gap-2 mb-4 font-medium">
                <PackageCheck className="w-4 h-4 text-green-600" />
                Stores: 8.5 MT available in stock
              </div>

              {/* ACTION STATES */}
              {item4State === 'pending' && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button 
                    onClick={() => setItem4State('approved')}
                    className="flex flex-col items-center justify-center gap-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 py-2.5 rounded-lg transition-colors"
                  >
                    <Check className="w-5 h-5" />
                    <span className="text-xs font-semibold">Approve</span>
                  </button>
                  <button 
                    onClick={() => setItem4State('modifying')}
                    className="flex flex-col items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 py-2.5 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span className="text-xs font-semibold">Modify Qty</span>
                  </button>
                  <button 
                    onClick={() => setItem4State('rejecting')}
                    className="flex flex-col items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 py-2.5 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                    <span className="text-xs font-semibold">Reject</span>
                  </button>
                </div>
              )}

              {item4State === 'modifying' && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 animate-in fade-in zoom-in-95 duration-200">
                  <label className="block text-xs font-medium text-amber-900 mb-1.5">Approved Quantity (MT)</label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      value={item4ModQty}
                      onChange={(e) => setItem4ModQty(e.target.value)}
                      className="flex-1 border border-amber-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 bg-white"
                    />
                    <button 
                      onClick={() => setItem4State('modified')}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Save
                    </button>
                  </div>
                  <div className="flex justify-end mt-2">
                    <button onClick={() => setItem4State('pending')} className="text-xs text-amber-700 hover:underline">Cancel</button>
                  </div>
                </div>
              )}

              {item4State === 'rejecting' && (
                <div className="bg-red-50 p-3 rounded-lg border border-red-200 animate-in fade-in zoom-in-95 duration-200">
                  <label className="block text-xs font-medium text-red-900 mb-1.5">Reason for Rejection</label>
                  <textarea 
                    value={item4RejectReason}
                    onChange={(e) => setItem4RejectReason(e.target.value)}
                    placeholder="e.g. Budget exceeded..."
                    className="w-full border border-red-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 bg-white resize-none"
                    rows={2}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <button onClick={() => setItem4State('pending')} className="text-xs text-red-700 hover:underline">Cancel</button>
                    <button 
                      onClick={() => setItem4State('rejected')}
                      disabled={!item4RejectReason.trim()}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
                    >
                      Confirm Reject
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        ) : (
          /* ACTIONED STATE FOR ITEM 4 */
          <div className={`border rounded-lg p-3 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 ${
            item4State === 'approved' ? 'bg-green-50 border-green-200' :
            item4State === 'rejected' ? 'bg-red-50 border-red-200' :
            'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex justify-between items-start">
              <h3 className={`font-semibold text-sm ${item4State === 'rejected' ? 'text-red-900 line-through decoration-red-300' : item4State === 'approved' ? 'text-green-900' : 'text-amber-900'}`}>
                4. Bitumen Emulsion RS-1
              </h3>
              <div className="flex flex-col items-end">
                <span className={`font-bold text-sm ${item4State === 'rejected' ? 'text-red-800' : item4State === 'approved' ? 'text-green-800' : 'text-amber-800'}`}>
                  {item4State === 'rejected' ? '15 MT' : item4State === 'approved' ? '15 MT' : `${item4ModQty} MT`}
                </span>
                {item4State === 'modified' && <span className="text-amber-600/80 text-[10px] line-through">req: 15 MT</span>}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              <PackageCheck className="w-3.5 h-3.5 text-green-600" />
              <span className="text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full">Stores: 8.5 MT available</span>
            </div>
            
            <div className={`flex items-start gap-2 text-xs py-1.5 px-2 rounded-md ${
              item4State === 'approved' ? 'text-green-700 bg-green-100/50' :
              item4State === 'rejected' ? 'text-red-700 bg-red-100/50' :
              'text-amber-800 bg-amber-100/50'
            }`}>
              {item4State === 'approved' && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />}
              {item4State === 'rejected' && <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
              {item4State === 'modified' && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
              
              <div className="flex flex-col">
                <span className="font-medium">
                  {item4State === 'approved' ? 'Approved as requested' : 
                   item4State === 'rejected' ? 'Rejected' : 
                   `Partial Approval (${item4ModQty} of 15)`}
                </span>
                {item4State === 'rejected' && <span className="text-red-600">"{item4RejectReason}"</span>}
              </div>
              
              <div className="ml-auto flex items-center gap-2 mt-0.5">
                <span className="opacity-70">Just now</span>
                <button 
                  onClick={() => setItem4State('pending')}
                  className="text-[10px] underline opacity-80 hover:opacity-100"
                >
                  Undo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* OVERALL REMARKS */}
        <div className="mt-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
            <FileText className="w-4 h-4 text-gray-500" />
            Overall Manager Remarks
          </label>
          <textarea 
            value={overallRemarks}
            onChange={(e) => setOverallRemarks(e.target.value)}
            placeholder="Add any final comments for stores or procurement..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0F5F64] focus:ring-1 focus:ring-[#0F5F64] bg-gray-50/50 min-h-[80px]"
          />
        </div>

      </main>

      {/* BOTTOM STICKY ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-[480px] bg-white border-t border-gray-200 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
        <button 
          disabled={!isAllActioned}
          className={`w-full py-3.5 rounded-lg font-bold text-base transition-all flex justify-center items-center gap-2 ${
            isAllActioned 
              ? 'bg-[#F97316] hover:bg-[#EA580C] text-white shadow-lg shadow-orange-500/25 translate-y-0' 
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isAllActioned ? <CheckCircle2 className="w-5 h-5" /> : null}
          Finalise Approval
        </button>
        
        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-gray-400 uppercase tracking-widest font-medium">
          <Info className="w-3 h-3" />
          <span>Approved by SUNIL KUMAR · Manager · 01 Jun 2026</span>
        </div>
      </div>

    </div>
  );
}
