import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, FileText, Search, Plus, MapPin, Calendar, Clock, ChevronDown, ChevronUp, Package, IndianRupee } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';

export function StoresVerifyView() {
  const [items, setItems] = useState([
    {
      id: 1,
      name: "Hydraulic Jack 10T",
      requestedQty: 2,
      uom: "NOS",
      rate: 4500,
      verified: true,
      stockStatus: "in-stock",
      verifiedQty: 2,
      note: "",
      verifiedBy: "Raju K",
      verifiedAt: "01 Jun 2026 14:30"
    },
    {
      id: 2,
      name: "Drill Bit 25mm",
      requestedQty: 5,
      uom: "NOS",
      rate: 850,
      verified: true,
      stockStatus: "short-stock",
      verifiedQty: 2,
      note: "Only 2 available, rest on order",
      verifiedBy: "Raju K",
      verifiedAt: "01 Jun 2026 14:32"
    },
    {
      id: 3,
      name: "Compactor Belt",
      requestedQty: 1,
      uom: "NOS",
      rate: 3200,
      verified: false,
      stockStatus: "",
      verifiedQty: "",
      note: "",
      showNote: false
    },
    {
      id: 4,
      name: "Bitumen Emulsion RS-1",
      requestedQty: 15,
      uom: "MT",
      rate: 28000,
      verified: false,
      stockStatus: "short-stock",
      verifiedQty: 8.5,
      note: "",
      showNote: false
    }
  ]);

  const toggleNote = (id: number) => {
    setItems(items.map(item => item.id === id ? { ...item, showNote: !item.showNote } : item));
  };

  const updateItem = (id: number, field: string, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const markVerified = (id: number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        return {
          ...item,
          verified: true,
          verifiedBy: "Raju K",
          verifiedAt: "01 Jun 2026 14:45"
        };
      }
      return item;
    }));
  };

  const verifyAll = () => {
    setItems(items.map(item => {
      if (!item.verified) {
        return {
          ...item,
          verified: true,
          stockStatus: "in-stock",
          verifiedQty: item.requestedQty,
          verifiedBy: "Raju K",
          verifiedAt: "01 Jun 2026 14:45"
        };
      }
      return item;
    }));
  };

  const verifiedCount = items.filter(i => i.verified).length;
  const allVerified = verifiedCount === items.length;

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center pb-24 font-sans text-slate-900">
      <div className="w-full max-w-[480px] bg-slate-50 flex flex-col relative shadow-sm">
        
        {/* Sticky Header */}
        <header className="sticky top-0 z-20 bg-[#0F5F64] text-white shadow-md">
          <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-teal-100" />
              </div>
              <div>
                <h1 className="font-semibold text-[15px] leading-tight tracking-wide">HLC/PI/2026/0013</h1>
                <p className="text-xs text-teal-100 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> NH-44 Highway Project
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-teal-100 font-medium bg-white/10 px-2 py-0.5 rounded-sm">4 Items</div>
            </div>
          </div>
          
          <div className="px-4 py-2 bg-[#0a464a] flex items-center justify-between text-xs text-teal-50">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Raised: 31 May 2026</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="opacity-70">By:</span>
              <span className="font-medium">Amit P. (Site Eng)</span>
            </div>
          </div>
          
          <div className="bg-amber-100 text-amber-900 px-4 py-2 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider border-b border-amber-200">
            <AlertTriangle className="w-4 h-4" />
            Awaiting Store Verification
          </div>
        </header>

        <main className="flex-1 p-3 flex flex-col gap-3">
          
          <div className="flex justify-between items-center px-1 pt-1">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4" /> Material Line Items
            </h2>
            {!allVerified && (
              <button 
                onClick={verifyAll}
                className="text-xs font-medium text-[#0F5F64] hover:text-[#0a464a] bg-teal-50 px-2 py-1 rounded border border-teal-100 transition-colors"
              >
                Verify All In-Stock
              </button>
            )}
          </div>

          {items.map((item, index) => (
            <Card key={item.id} className={`overflow-hidden border transition-all ${item.verified ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-300 shadow-sm'}`}>
              
              {/* Verified State - Compact */}
              {item.verified ? (
                <div className="p-3 flex flex-col gap-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 leading-tight">{item.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">Req: <span className="font-medium text-slate-700">{item.requestedQty} {item.uom}</span></span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-medium text-slate-500 line-through">₹{(item.rate * item.requestedQty).toLocaleString()}</div>
                    </div>
                  </div>
                  
                  <div className={`mt-1 p-2 rounded-md border text-xs flex items-center justify-between ${
                    item.stockStatus === 'in-stock' ? 'bg-teal-50 border-teal-100 text-teal-800' :
                    item.stockStatus === 'short-stock' ? 'bg-amber-50 border-amber-100 text-amber-800' :
                    'bg-red-50 border-red-100 text-red-800'
                  }`}>
                    <div className="flex items-center gap-1.5 font-medium">
                      {item.stockStatus === 'in-stock' && <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />}
                      {item.stockStatus === 'short-stock' && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                      {item.stockStatus === 'no-stock' && <XCircle className="w-3.5 h-3.5 text-red-600" />}
                      
                      {item.stockStatus === 'in-stock' && `Stock: ${item.verifiedQty} ${item.uom}`}
                      {item.stockStatus === 'short-stock' && `Stock: ${item.verifiedQty} ${item.uom} available, ${item.requestedQty - Number(item.verifiedQty)} short`}
                      {item.stockStatus === 'no-stock' && `No stock available`}
                    </div>
                  </div>
                  
                  {item.note && (
                    <div className="text-[11px] text-slate-500 italic px-1 flex gap-1">
                      <span className="font-semibold not-italic">Note:</span> {item.note}
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                      Verified • {item.verifiedBy} • Stores
                    </div>
                    <div>{item.verifiedAt}</div>
                  </div>
                </div>
              ) : (
                /* Active State - Expanded */
                <div className="flex flex-col">
                  {/* Item Header */}
                  <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-500 px-1.5 py-0 h-4 rounded-sm border-slate-200 bg-white">Item {index + 1}</Badge>
                      </div>
                      <h3 className="text-[15px] font-bold text-[#0F5F64] leading-tight">{item.name}</h3>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <span className="uppercase font-medium tracking-wide">Req Qty:</span> 
                          <span className="font-bold text-slate-800 text-sm bg-slate-200/50 px-1.5 py-0.5 rounded">{item.requestedQty} <span className="text-[10px]">{item.uom}</span></span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 bg-white border border-slate-100 rounded-md p-1.5 shadow-sm">
                      <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Est. Amount</div>
                      <div className="text-sm font-bold text-slate-700 flex items-center justify-end">
                        <IndianRupee className="w-3 h-3 text-slate-400" />
                        {(item.rate * item.requestedQty).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">@ ₹{item.rate.toLocaleString()}/{item.uom}</div>
                    </div>
                  </div>

                  {/* Verification Form */}
                  <div className="p-3 flex flex-col gap-4">
                    
                    {/* Stock Input */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex justify-between">
                        Actual Stock in Stores
                        <span className="text-slate-400 font-normal lowercase normal-case">({item.uom})</span>
                      </label>
                      <div className="relative">
                        <Input 
                          type="number" 
                          placeholder="Enter quantity"
                          value={item.verifiedQty}
                          onChange={(e) => updateItem(item.id, 'verifiedQty', e.target.value)}
                          className="h-10 text-base font-medium pl-3 pr-12 focus-visible:ring-[#0F5F64] border-slate-300"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          {item.uom}
                        </div>
                      </div>
                    </div>

                    {/* Status Toggle */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Stock Status</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button 
                          onClick={() => updateItem(item.id, 'stockStatus', 'in-stock')}
                          className={`flex flex-col items-center justify-center p-2 rounded-md border-2 transition-all ${
                            item.stockStatus === 'in-stock' 
                              ? 'border-teal-500 bg-teal-50 text-teal-800 shadow-sm' 
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <CheckCircle2 className={`w-5 h-5 mb-1 ${item.stockStatus === 'in-stock' ? 'text-teal-600' : 'text-slate-400'}`} />
                          <span className="text-[11px] font-bold">In Stock</span>
                        </button>
                        
                        <button 
                          onClick={() => updateItem(item.id, 'stockStatus', 'short-stock')}
                          className={`flex flex-col items-center justify-center p-2 rounded-md border-2 transition-all ${
                            item.stockStatus === 'short-stock' 
                              ? 'border-amber-500 bg-amber-50 text-amber-800 shadow-sm' 
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <AlertTriangle className={`w-5 h-5 mb-1 ${item.stockStatus === 'short-stock' ? 'text-amber-600' : 'text-slate-400'}`} />
                          <span className="text-[11px] font-bold">Short</span>
                        </button>

                        <button 
                          onClick={() => updateItem(item.id, 'stockStatus', 'no-stock')}
                          className={`flex flex-col items-center justify-center p-2 rounded-md border-2 transition-all ${
                            item.stockStatus === 'no-stock' 
                              ? 'border-red-500 bg-red-50 text-red-800 shadow-sm' 
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <XCircle className={`w-5 h-5 mb-1 ${item.stockStatus === 'no-stock' ? 'text-red-600' : 'text-slate-400'}`} />
                          <span className="text-[11px] font-bold">No Stock</span>
                        </button>
                      </div>
                    </div>

                    {/* Note Field */}
                    <div className="space-y-2">
                      {!item.showNote && !item.note ? (
                        <button 
                          onClick={() => toggleNote(item.id)}
                          className="text-xs font-medium text-[#0F5F64] flex items-center gap-1 hover:underline"
                        >
                          <Plus className="w-3 h-3" /> Add note / remarks
                        </button>
                      ) : (
                        <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Remarks</label>
                            <button onClick={() => toggleNote(item.id)} className="text-slate-400 hover:text-slate-600">
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <Textarea 
                            placeholder="Add reason for short/no stock, PO references, etc."
                            value={item.note}
                            onChange={(e) => updateItem(item.id, 'note', e.target.value)}
                            className="min-h-[60px] text-sm resize-none focus-visible:ring-[#0F5F64] border-slate-300"
                          />
                        </div>
                      )}
                    </div>
                    
                    {/* Mark Done Button */}
                    <div className="pt-2 border-t border-slate-100">
                      <Button 
                        onClick={() => markVerified(item.id)}
                        disabled={!item.stockStatus}
                        className="w-full h-10 bg-slate-800 hover:bg-slate-900 text-white font-medium"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Mark Verified
                      </Button>
                    </div>

                  </div>
                </div>
              )}
            </Card>
          ))}
          
          <div className="h-6" /> {/* Bottom spacer */}
        </main>

        {/* Sticky Bottom Bar */}
        <div className="fixed bottom-0 w-full max-w-[480px] bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-20 pb-safe">
          <div className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="text-slate-600">Verification Progress</span>
              <span className={allVerified ? 'text-teal-600 font-bold' : 'text-slate-800'}>
                {verifiedCount} of {items.length} verified
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ease-out rounded-full ${allVerified ? 'bg-teal-500' : 'bg-amber-500'}`}
                style={{ width: `${(verifiedCount / items.length) * 100}%` }}
              />
            </div>
            
            <Button 
              disabled={!allVerified}
              className={`w-full h-12 text-[15px] font-bold tracking-wide uppercase transition-all mt-1 ${
                allVerified 
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md' 
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              Submit Verification
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
