import React, { useState } from "react";
import { 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  Search, 
  CalendarIcon, 
  Clock,
  Package,
  AlertTriangle,
  CheckCircle2,
  Trash2
} from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Badge } from "../../ui/badge";
import { Switch } from "../../ui/switch";
import { Label } from "../../ui/label";
import { Card, CardContent } from "../../ui/card";

export function SmartForm() {
  const [items, setItems] = useState([
    {
      id: 1,
      description: "Hydraulic Jack 10T",
      uom: "NOS",
      qty: 2,
      rate: 4500,
      purpose: "Plant",
      priority: "Urgent",
      requiredBy: "2026-03-25",
      stock: { status: "none", message: "Stores: 0 — no stock" },
      isCredit: true,
      expanded: true
    },
    {
      id: 2,
      description: "Drill Bit 25mm",
      uom: "NOS",
      qty: 5,
      rate: 850,
      purpose: "Site",
      priority: "Normal",
      requiredBy: "2026-03-28",
      stock: { status: "available", message: "Stores: 12 NOS available" },
      isCredit: true,
      expanded: true
    },
    {
      id: 3,
      description: "Compactor Belt",
      uom: "NOS",
      qty: 1,
      rate: 2200,
      purpose: "Plant",
      priority: "Normal",
      requiredBy: "2026-03-26",
      stock: { status: "unknown", message: "No stock data" },
      isCredit: false,
      expanded: false
    }
  ]);

  const toggleExpand = (id: number) => {
    setItems(items.map(item => item.id === id ? { ...item, expanded: !item.expanded } : item));
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.rate), 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24 md:max-w-md md:mx-auto md:border-x md:shadow-xl relative">
      {/* Sticky Header */}
      <div 
        className="sticky top-0 z-20 shadow-md text-white pt-10 pb-4 px-4 flex flex-col gap-4"
        style={{ background: "linear-gradient(135deg, #0F5F64 0%, #0a464a 100%)" }}
      >
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight">New Purchase Indent</h1>
            <p className="text-teal-100 text-sm opacity-90">HLC/PI/2026/0013</p>
          </div>
          <div className="bg-teal-800/50 px-2 py-1 rounded text-xs font-medium border border-teal-600/30 flex items-center gap-1.5">
            <CalendarIcon className="w-3 h-3" />
            Mar 24, 2026
          </div>
        </div>

        <div className="space-y-3 mt-1">
          <div className="space-y-1.5">
            <label className="text-xs text-teal-100/80 uppercase tracking-wider font-semibold">Site / Project</label>
            <div className="bg-white/10 border border-white/20 rounded-md p-0.5">
              <Select defaultValue="nh44">
                <SelectTrigger className="bg-transparent border-0 text-white h-9 focus:ring-0 focus:ring-offset-0">
                  <SelectValue placeholder="Select Site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nh44">NH-44 Highway Expansion</SelectItem>
                  <SelectItem value="hmp">HMP Plant - Base</SelectItem>
                  <SelectItem value="city">City Roads Project</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-teal-100/80 uppercase tracking-wider font-semibold">Proposed By</label>
              <Input 
                value="Rahul Sharma" 
                className="h-9 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-white/30" 
                readOnly
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-teal-100/80 uppercase tracking-wider font-semibold">Raised By</label>
              <Input 
                value="Admin Stores" 
                className="h-9 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-white/30" 
                readOnly
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Item Cards */}
      <div className="flex-1 p-3 space-y-3">
        <div className="flex items-center justify-between px-1 pt-2 pb-1">
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">Line Items</h2>
          <span className="text-xs font-medium bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{items.length} items</span>
        </div>

        {items.map((item, index) => (
          <Card key={item.id} className="overflow-hidden border-slate-200 shadow-sm transition-all duration-200">
            {/* Card Header Always Visible */}
            <div 
              className={`p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${item.expanded ? 'border-b border-slate-100 bg-slate-50/50' : ''}`}
              onClick={() => toggleExpand(item.id)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">{item.description}</h3>
                  {!item.expanded && (
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      <span>{item.qty} {item.uom}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                      <span className="font-medium text-slate-700">₹{(item.qty * item.rate).toLocaleString('en-IN')}</span>
                      {item.priority === "Urgent" && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span className="text-red-600 font-medium">Urgent</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="pl-3 shrink-0 flex items-center gap-2">
                {!item.expanded && item.stock.status === "available" && (
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                )}
                {!item.expanded && item.stock.status === "none" && (
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                  {item.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Expanded Content */}
            {item.expanded && (
              <div className="p-3.5 space-y-4 bg-white animate-in slide-in-from-top-2 duration-200">
                {/* Row 1: Searchable item & UOM */}
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input 
                      defaultValue={item.description} 
                      className="pl-9 h-9 border-slate-200 focus-visible:ring-teal-500" 
                    />
                  </div>
                  <Select defaultValue={item.uom}>
                    <SelectTrigger className="w24 h-9 border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NOS">NOS</SelectItem>
                      <SelectItem value="KG">KG</SelectItem>
                      <SelectItem value="LTR">LTR</SelectItem>
                      <SelectItem value="MTR">MTR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Row 2: Qty, Rate, Amount */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3 space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Qty</label>
                    <Input defaultValue={item.qty} type="number" className="h-9 font-medium text-center" />
                  </div>
                  <div className="col-span-1 flex justify-center pb-2 text-slate-400 text-sm">×</div>
                  <div className="col-span-4 space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Est Rate (₹)</label>
                    <Input defaultValue={item.rate} type="number" className="h-9" />
                  </div>
                  <div className="col-span-1 flex justify-center pb-2 text-slate-400 text-sm">=</div>
                  <div className="col-span-3 space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Amount</label>
                    <div className="h-9 bg-slate-50 rounded-md border border-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm">
                      ₹{(item.qty * item.rate).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                {/* Row 3: Purpose, Priority, Required By */}
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap gap-x-4 gap-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Purpose</label>
                      <div className="flex gap-1.5 bg-slate-100 p-0.5 rounded-full inline-flex">
                        {["Plant", "Site", "Admin"].map(p => (
                          <div 
                            key={p} 
                            className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                              item.purpose === p 
                                ? "bg-white shadow-sm text-teal-700" 
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            {p}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Priority</label>
                      <div className="flex gap-1.5 bg-slate-100 p-0.5 rounded-full inline-flex">
                        <div 
                          className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                            item.priority === "Normal" 
                              ? "bg-white shadow-sm text-slate-700" 
                              : "text-slate-500"
                          }`}
                        >
                          Normal
                        </div>
                        <div 
                          className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                            item.priority === "Urgent" 
                              ? "bg-red-50 text-red-600 shadow-sm border border-red-100" 
                              : "text-slate-500"
                          }`}
                        >
                          Urgent
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Required By</label>
                      <div className="relative">
                        <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input 
                          type="date" 
                          defaultValue={item.requiredBy} 
                          className="pl-9 h-9 text-sm" 
                        />
                      </div>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Payment Mode</label>
                      <div className="flex items-center gap-2 h-9 border border-slate-200 rounded-md px-3 bg-white">
                        <span className={`text-xs font-medium ${item.isCredit ? 'text-slate-400' : 'text-slate-700'}`}>Cash</span>
                        <Switch defaultChecked={item.isCredit} className="data-[state=checked]:bg-teal-600" />
                        <span className={`text-xs font-medium ${item.isCredit ? 'text-teal-700' : 'text-slate-400'}`}>Credit</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 4: Stock Status & Actions */}
                <div className="pt-3 mt-1 border-t border-slate-100 flex items-center justify-between">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${
                    item.stock.status === 'available' ? 'bg-green-50 text-green-700 border border-green-200/60' :
                    item.stock.status === 'none' ? 'bg-amber-50 text-amber-700 border border-amber-200/60' :
                    'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                    {item.stock.status === 'available' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                     item.stock.status === 'none' ? <AlertTriangle className="w-3.5 h-3.5" /> :
                     <Package className="w-3.5 h-3.5" />}
                    {item.stock.message}
                  </div>
                  
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2 gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="text-xs">Remove</span>
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}

        {/* Add Item Button */}
        <button className="w-full mt-2 py-4 rounded-lg border-2 border-dashed border-teal-200 bg-teal-50/50 hover:bg-teal-50 hover:border-teal-300 text-teal-700 flex items-center justify-center gap-2 transition-colors">
          <Plus className="w-5 h-5" />
          <span className="font-semibold">Add Item</span>
        </button>
        
        {/* Spacer for sticky footer */}
        <div className="h-6"></div>
      </div>

      {/* Sticky Bottom Summary & Actions */}
      <div className="fixed md:absolute bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] p-3 space-y-3">
        <div className="flex justify-between items-center px-1">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Est. Value</span>
            <span className="text-xl font-bold text-slate-900">₹{totalAmount.toLocaleString('en-IN')}</span>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center justify-center bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-md">
              {items.length} Items
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="w-full font-medium h-11 border-slate-300 text-slate-700 bg-white hover:bg-slate-50">
            Save Draft
          </Button>
          <Button className="w-full font-semibold h-11 bg-orange-600 hover:bg-orange-700 text-white shadow-sm">
            Submit for Approval
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SmartForm;
