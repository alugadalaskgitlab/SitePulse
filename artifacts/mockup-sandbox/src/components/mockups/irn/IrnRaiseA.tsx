import React, { useState } from "react";
import { 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  PackageSearch,
  Building2,
  Settings,
  AlertTriangle,
  Clock,
  ClipboardList
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Card, CardContent } from "../../../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";

// Mock Data
const CONTEXT_OPTIONS = [
  { value: "site", label: "Construction Site", icon: Building2 },
  { value: "hmp", label: "Hot Mix Plant", icon: Settings },
  { value: "equipment", label: "Equipment Maintenance", icon: Settings }
];

const UOM_OPTIONS = ["Kgs", "Tons", "Ltrs", "Nos", "Bags", "Mtrs"];
const URGENCY_OPTIONS = [
  { value: "low", label: "Low (7-14 Days)", color: "text-green-600 bg-green-50" },
  { value: "medium", label: "Medium (3-7 Days)", color: "text-blue-600 bg-blue-50" },
  { value: "high", label: "High (1-2 Days)", color: "text-amber-600 bg-amber-50" },
  { value: "critical", label: "Critical (Immediate)", color: "text-red-600 bg-red-50" }
];

interface IrnItem {
  id: string;
  material: string;
  qty: string;
  uom: string;
  purpose: string;
  urgency: string;
}

export function IrnRaiseA() {
  const [step, setStep] = useState(2);
  
  const [context, setContext] = useState({
    raisedFrom: "site",
    activity: "Foundation Concreting - Block A"
  });

  const [items, setItems] = useState<IrnItem[]>([
    {
      id: "1",
      material: "Cement - OPC 53 Grade",
      qty: "500",
      uom: "Bags",
      purpose: "Raft Foundation Casting",
      urgency: "high"
    },
    {
      id: "2",
      material: "Binding Wire - 18G",
      qty: "50",
      uom: "Kgs",
      purpose: "Rebar tying for column starters",
      urgency: "medium"
    }
  ]);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: Math.random().toString(36).substring(7),
        material: "",
        qty: "",
        uom: "Nos",
        purpose: "",
        urgency: "medium"
      }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof IrnItem, value: string) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // Stepper UI
  const renderStepper = () => {
    const steps = ["Context", "Materials", "Review"];
    return (
      <div className="flex items-center justify-between mb-8 px-4">
        {steps.map((s, i) => {
          const stepNum = i + 1;
          const isActive = step === stepNum;
          const isPast = step > stepNum;
          
          return (
            <div key={s} className="flex flex-col items-center relative z-10 flex-1">
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm transition-colors
                  ${isActive ? 'bg-amber-600 text-white shadow-md ring-4 ring-amber-100' : 
                    isPast ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-400'}`}
              >
                {isPast ? <Check className="w-5 h-5" /> : stepNum}
              </div>
              <span className={`mt-2 text-xs font-medium ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                {s}
              </span>
              
              {/* Connecting Line */}
              {i < steps.length - 1 && (
                <div className={`absolute top-5 left-1/2 w-full h-[2px] -z-10
                  ${step > stepNum ? 'bg-amber-600' : 'bg-gray-200'}`} 
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderStep1 = () => (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Where is this requirement from?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CONTEXT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = context.raisedFrom === opt.value;
            return (
              <div 
                key={opt.value}
                onClick={() => setContext({...context, raisedFrom: opt.value})}
                className={`cursor-pointer border rounded-xl p-4 flex flex-col items-center text-center transition-all ${
                  isSelected ? 'border-amber-600 bg-amber-50 ring-1 ring-amber-600' : 'border-gray-200 hover:border-amber-300 hover:bg-gray-50'
                }`}
              >
                <div className={`p-3 rounded-full mb-3 ${isSelected ? 'bg-amber-200 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="font-medium text-sm text-gray-900">{opt.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t border-gray-100">
        <Label htmlFor="activity" className="text-base font-medium">Activity / Cost Center</Label>
        <p className="text-sm text-gray-500 mb-2">What is the specific task these materials are for?</p>
        <Input 
          id="activity"
          value={context.activity}
          onChange={(e) => setContext({...context, activity: e.target.value})}
          placeholder="e.g. Slab casting 3rd floor, Piling works..."
          className="h-12 text-base"
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
          <PackageSearch className="w-5 h-5 text-amber-600" />
          Required Materials
        </h3>
        <Button onClick={handleAddItem} variant="outline" size="sm" className="text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100">
          <Plus className="w-4 h-4 mr-1" /> Add Item
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
          <PackageSearch className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <h4 className="text-gray-900 font-medium mb-1">No items added</h4>
          <p className="text-gray-500 text-sm mb-4">Add materials you need to requisition.</p>
          <Button onClick={handleAddItem} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Plus className="w-4 h-4 mr-2" /> Add First Item
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => (
            <Card key={item.id} className="border border-gray-200 shadow-sm relative overflow-visible">
              {/* Item Number Badge */}
              <div className="absolute -left-3 -top-3 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm shadow-sm z-10">
                {index + 1}
              </div>
              
              <CardContent className="p-4 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  
                  {/* Material Name */}
                  <div className="md:col-span-5 space-y-1.5">
                    <Label className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Material</Label>
                    <Input 
                      value={item.material} 
                      onChange={(e) => handleItemChange(item.id, 'material', e.target.value)}
                      placeholder="Search or enter material name..."
                      className="font-medium"
                    />
                  </div>
                  
                  {/* Quantity & UOM */}
                  <div className="md:col-span-3 space-y-1.5">
                    <Label className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Quantity</Label>
                    <div className="flex gap-2">
                      <Input 
                        type="number"
                        value={item.qty}
                        onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                        placeholder="0.00"
                        className="w-full font-medium"
                      />
                      <Select value={item.uom} onValueChange={(val) => handleItemChange(item.id, 'uom', val)}>
                        <SelectTrigger className="w-[100px] shrink-0 font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UOM_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Urgency */}
                  <div className="md:col-span-3 space-y-1.5">
                    <Label className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Urgency</Label>
                    <Select value={item.urgency} onValueChange={(val) => handleItemChange(item.id, 'urgency', val)}>
                      <SelectTrigger className={`font-medium ${URGENCY_OPTIONS.find(u => u.value === item.urgency)?.color || ''}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {URGENCY_OPTIONS.map(u => (
                          <SelectItem key={u.value} value={u.value}>
                            <span className="flex items-center gap-2">
                              {u.value === 'critical' && <AlertTriangle className="w-3 h-3 text-red-600" />}
                              {u.value === 'high' && <Clock className="w-3 h-3 text-amber-600" />}
                              {u.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Delete Action */}
                  <div className="md:col-span-1 flex items-end justify-end">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50 h-10 w-10 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Purpose */}
                  <div className="md:col-span-12 space-y-1.5 mt-1">
                    <Label className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Specific Purpose / Remarks</Label>
                    <Input 
                      value={item.purpose}
                      onChange={(e) => handleItemChange(item.id, 'purpose', e.target.value)}
                      placeholder="Why is this needed?"
                      className="text-sm bg-gray-50"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderStep3 = () => {
    // Group by urgency for review
    const grouped = items.reduce((acc, item) => {
      acc[item.urgency] = acc[item.urgency] || [];
      acc[item.urgency].push(item);
      return acc;
    }, {} as Record<string, IrnItem[]>);

    return (
      <div className="space-y-6">
        <div className="bg-amber-50 rounded-xl p-5 border border-amber-100 flex items-start gap-4">
          <div className="bg-amber-100 p-2 rounded-full text-amber-700 shrink-0 mt-1">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-amber-900 text-lg mb-1">Confirm Requisition</h3>
            <p className="text-amber-800/80 text-sm">
              Please review the details below. Once submitted, this IRN will be routed to the storekeeper for fulfillment.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900 border-b pb-2">Context</h4>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold block mb-1">Raised From</span>
                <span className="font-medium text-gray-900">{CONTEXT_OPTIONS.find(o => o.value === context.raisedFrom)?.label}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold block mb-1">Activity / Cost Center</span>
                <span className="font-medium text-gray-900">{context.activity || "—"}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900 border-b pb-2">Summary ({items.length} Items)</h4>
            <div className="space-y-4">
              {['critical', 'high', 'medium', 'low'].map(urgencyLevel => {
                const urgencyGroup = grouped[urgencyLevel];
                if (!urgencyGroup || urgencyGroup.length === 0) return null;
                
                const urgencyInfo = URGENCY_OPTIONS.find(u => u.value === urgencyLevel);
                
                return (
                  <div key={urgencyLevel} className="space-y-2">
                    <span className={`text-xs font-bold uppercase px-2 py-1 rounded ${urgencyInfo?.color}`}>
                      {urgencyInfo?.label.split(' ')[0]} Priority
                    </span>
                    <ul className="space-y-2 mt-2">
                      {urgencyGroup.map((item, idx) => (
                        <li key={idx} className="flex justify-between text-sm bg-gray-50 p-2 rounded border border-gray-100">
                          <span className="font-medium truncate mr-4">{item.material}</span>
                          <span className="shrink-0 font-semibold text-gray-700">{item.qty} {item.uom}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-white">
      {/* Header */}
      <header className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Raise Material Requisition (IRN)</h1>
          <p className="text-sm text-gray-500">Request materials from stores or procurement</p>
        </div>
        <div className="text-sm font-medium text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
          Draft Mode
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-50/50 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 min-h-[400px]">
          {renderStepper()}
          
          <div className="mt-8">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </div>
        </div>
      </main>

      {/* Footer / Navigation */}
      <footer className="px-6 py-4 border-t border-gray-200 bg-white shrink-0 flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => step > 1 ? setStep(step - 1) : null}
          disabled={step === 1}
          className="text-gray-600"
        >
          <ChevronLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <div className="flex gap-3">
          <Button variant="ghost" className="text-gray-500 hover:text-gray-700">
            Cancel
          </Button>
          
          {step < 3 ? (
            <Button 
              onClick={() => setStep(step + 1)}
              className="bg-amber-600 hover:bg-amber-700 text-white min-w-[120px]"
            >
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button 
              className="bg-amber-600 hover:bg-amber-700 text-white min-w-[140px] font-semibold"
              onClick={() => alert("IRN Submitted Successfully!")}
            >
              <Check className="w-4 h-4 mr-2" /> Submit IRN
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
