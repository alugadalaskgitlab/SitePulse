import React, { useState } from "react";
import { 
  Wrench, 
  Settings, 
  Construction, 
  Truck, 
  Flame, 
  Plus, 
  CheckCircle2, 
  ArrowRight,
  ThermometerSun,
  Hammer
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIVITIES = [
  { id: "road", label: "Road Repair", icon: Hammer },
  { id: "shift", label: "Shift Production", icon: Settings },
  { id: "gen", label: "Generator Maintenance", icon: Wrench },
  { id: "concrete", label: "Concrete Pour", icon: Construction },
  { id: "culvert", label: "Culvert Work", icon: Construction },
  { id: "equip", label: "Equipment Service", icon: Truck },
  { id: "heat", label: "Heating Session", icon: Flame },
  { id: "other", label: "Other", icon: Plus },
];

const RAISED_FROM = [
  { id: "site", label: "Site" },
  { id: "plant", label: "HMP Plant" },
  { id: "equip", label: "Equipment" },
];

const SUGGESTIONS = [
  { id: "item1", name: "Bitumen VG-30", qty: "10", uom: "MT", purpose: "Tack coat & patching", checked: true, urgency: "High" },
  { id: "item2", name: "Aggregate 20mm", qty: "25", uom: "MT", purpose: "Base layer filling", checked: true, urgency: "Medium" },
  { id: "item3", name: "Stone Dust", qty: "15", uom: "MT", purpose: "Void filling", checked: false, urgency: "Low" },
  { id: "item4", name: "Bitumen Emulsion", qty: "5", uom: "Drum", purpose: "Surface sealing", checked: true, urgency: "High" },
];

export default function IrnRaiseC() {
  const [selectedActivity, setSelectedActivity] = useState<string>("road");
  const [selectedSource, setSelectedSource] = useState<string>("site");
  const [items, setItems] = useState(SUGGESTIONS);

  const toggleItem = (id: string) => {
    setItems(items.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  };

  const selectedCount = items.filter(i => i.checked).length;

  return (
    <div className="flex flex-col min-h-[100dvh] bg-slate-50 font-sans text-slate-900 pb-20">
      <header className="bg-white px-4 py-3 border-b border-slate-200 sticky top-0 z-10 flex items-center shadow-sm">
        <h1 className="font-semibold text-lg text-slate-800">Raise IRN</h1>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-6">
        
        {/* Source Chips */}
        <section className="animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Raising From</p>
          <div className="flex flex-wrap gap-2">
            {RAISED_FROM.map(source => (
              <button
                key={source.id}
                onClick={() => setSelectedSource(source.id)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                  selectedSource === source.id 
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                )}
              >
                {source.label}
              </button>
            ))}
          </div>
        </section>

        {/* Activity Selection */}
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">What are you working on?</p>
          <div className="grid grid-cols-4 gap-3">
            {ACTIVITIES.map(activity => {
              const Icon = activity.icon;
              const isSelected = selectedActivity === activity.id;
              return (
                <button
                  key={activity.id}
                  onClick={() => setSelectedActivity(activity.id)}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 aspect-square",
                    isSelected 
                      ? "bg-amber-50 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] ring-1 ring-amber-400 scale-[1.02]"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <Icon className={cn(
                    "w-6 h-6 mb-2",
                    isSelected ? "text-amber-600" : "text-slate-400"
                  )} />
                  <span className={cn(
                    "text-[10px] leading-tight",
                    isSelected ? "text-amber-800 font-semibold" : "text-slate-600 font-medium"
                  )}>{activity.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Suggested Materials (Appears when activity selected) */}
        {selectedActivity && (
          <section className="animate-in slide-in-from-bottom-8 fade-in duration-500 delay-200">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Suggested Materials</p>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Auto-filled
              </span>
            </div>
            
            <div className="flex flex-col gap-2">
              {items.map(item => (
                <div 
                  key={item.id} 
                  className={cn(
                    "bg-white border rounded-xl p-3 flex gap-3 transition-colors",
                    item.checked ? "border-amber-200 shadow-sm" : "border-slate-200 opacity-60"
                  )}
                >
                  <button 
                    onClick={() => toggleItem(item.id)}
                    className="mt-1 flex-shrink-0"
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                      item.checked ? "bg-amber-500 border-amber-500" : "border-slate-300 bg-slate-50"
                    )}>
                      {item.checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                  
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-1">
                      <p className={cn("font-medium text-sm", item.checked ? "text-slate-800" : "text-slate-500")}>
                        {item.name}
                      </p>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        item.urgency === "High" ? "bg-red-100 text-red-700" : 
                        item.urgency === "Medium" ? "bg-amber-100 text-amber-700" : 
                        "bg-slate-100 text-slate-600"
                      )}>
                        {item.urgency}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center rounded border border-slate-200 bg-slate-50 overflow-hidden max-w-[120px]">
                        <input 
                          type="number" 
                          defaultValue={item.qty}
                          disabled={!item.checked}
                          className="w-full bg-transparent px-2 py-1 text-sm font-medium outline-none disabled:opacity-50"
                        />
                        <span className="bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600 border-l border-slate-200">
                          {item.uom}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" /> {item.purpose}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            <button className="mt-4 flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 mx-auto">
              <Plus className="w-4 h-4" /> Add unlisted item
            </button>
          </section>
        )}
      </main>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">
        <button 
          className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-3.5 px-4 flex items-center justify-between font-semibold transition-colors shadow-sm disabled:opacity-50"
          disabled={selectedCount === 0}
        >
          <span>{selectedCount} items selected</span>
          <div className="flex items-center gap-2">
            Submit to Stores <ArrowRight className="w-4 h-4" />
          </div>
        </button>
      </div>
    </div>
  );
}
