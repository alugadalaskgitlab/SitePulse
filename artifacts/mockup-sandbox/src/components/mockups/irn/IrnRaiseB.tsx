import React, { useState } from "react";
import { format } from "date-fns";
import { Plus, X, Calendar as CalendarIcon, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type Urgency = "Normal" | "High" | "Urgent";

interface RowData {
  id: string;
  material: string;
  qty: string;
  uom: string;
  purpose: string;
  urgency: Urgency;
}

const initialData: RowData[] = [
  { id: "1", material: "VG30 Bitumen", qty: "20", uom: "MT", purpose: "DBM Production Mix", urgency: "High" },
  { id: "2", material: "20mm Aggregate", qty: "400", uom: "MT", purpose: "Base course", urgency: "Normal" },
  { id: "3", material: "Stone Dust", qty: "150", uom: "MT", purpose: "Mix design #4", urgency: "Normal" },
  { id: "4", material: "TMT Steel 12mm", qty: "5", uom: "MT", purpose: "Slab reinforcement", urgency: "Urgent" },
];

const UOM_OPTIONS = ["MT", "KG", "L", "Nos", "Bags", "M3", "Rft"];

export function IrnRaiseB() {
  const [rows, setRows] = useState<RowData[]>(initialData);
  const [date, setDate] = useState<Date>(new Date());
  const [section, setSection] = useState("HMP");

  const addRow = () => {
    setRows([...rows, { id: Math.random().toString(36).substr(2, 9), material: "", qty: "", uom: "MT", purpose: "", urgency: "Normal" }]);
  };

  const updateRow = (id: string, field: keyof RowData, value: string) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const deleteRow = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
  };

  const cycleUrgency = (id: string, current: Urgency) => {
    const next: Record<Urgency, Urgency> = {
      Normal: "High",
      High: "Urgent",
      Urgent: "Normal"
    };
    updateRow(id, "urgency", next[current]);
  };

  const getUrgencyColor = (urgency: Urgency) => {
    switch (urgency) {
      case "Urgent": return "bg-red-100 text-red-700 border-red-200 hover:bg-red-200";
      case "High": return "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200";
      default: return "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200";
    }
  };

  const urgentCount = rows.filter(r => r.urgency === "Urgent").length;

  return (
    <div className="flex flex-col h-screen bg-white font-sans text-sm">
      {/* Slim Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 bg-slate-50">
        <div className="flex items-center gap-3">
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger className="w-[140px] h-7 text-xs bg-white border-slate-300">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Site">Site Operations</SelectItem>
              <SelectItem value="HMP">HMP Plant</SelectItem>
              <SelectItem value="Equipment">Equipment Fleet</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-7 text-xs px-2 border-slate-300 bg-white font-normal justify-start">
                <CalendarIcon className="mr-1.5 h-3 w-3 text-slate-500" />
                {date ? format(date, "dd MMM yyyy") : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} />
            </PopoverContent>
          </Popover>
        </div>

        <Button size="sm" className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white font-medium">
          Submit to Stores
        </Button>
      </div>

      {/* Spreadsheet Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0 z-10">
              <th className="w-10 px-2 py-1.5 font-medium border-r border-slate-200 text-center">#</th>
              <th className="px-2 py-1.5 font-medium border-r border-slate-200">Material</th>
              <th className="w-24 px-2 py-1.5 font-medium border-r border-slate-200">Qty</th>
              <th className="w-20 px-2 py-1.5 font-medium border-r border-slate-200">UOM</th>
              <th className="px-2 py-1.5 font-medium border-r border-slate-200">Purpose / Remarks</th>
              <th className="w-24 px-2 py-1.5 font-medium border-r border-slate-200 text-center">Urgency</th>
              <th className="w-10 px-2 py-1.5 font-medium text-center"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50 group focus-within:bg-blue-50/30">
                <td className="px-2 py-1 text-slate-400 text-center text-xs border-r border-slate-100">{i + 1}</td>
                <td className="px-0 py-0 border-r border-slate-100">
                  <input 
                    className="w-full h-8 px-2 text-sm bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-inset focus:ring-blue-400"
                    value={row.material}
                    onChange={e => updateRow(row.id, "material", e.target.value)}
                    placeholder="Enter material name..."
                  />
                </td>
                <td className="px-0 py-0 border-r border-slate-100">
                  <input 
                    className="w-full h-8 px-2 text-sm bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-inset focus:ring-blue-400 font-mono text-right"
                    value={row.qty}
                    onChange={e => updateRow(row.id, "qty", e.target.value)}
                    placeholder="0"
                  />
                </td>
                <td className="px-0 py-0 border-r border-slate-100">
                  <select 
                    className="w-full h-8 px-2 text-sm bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-inset focus:ring-blue-400 cursor-pointer text-slate-700"
                    value={row.uom}
                    onChange={e => updateRow(row.id, "uom", e.target.value)}
                  >
                    {UOM_OPTIONS.map(uom => <option key={uom} value={uom}>{uom}</option>)}
                  </select>
                </td>
                <td className="px-0 py-0 border-r border-slate-100">
                  <input 
                    className="w-full h-8 px-2 text-sm bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-inset focus:ring-blue-400"
                    value={row.purpose}
                    onChange={e => updateRow(row.id, "purpose", e.target.value)}
                    placeholder="E.g. Daily production"
                  />
                </td>
                <td className="px-2 py-1 text-center border-r border-slate-100">
                  <button 
                    onClick={() => cycleUrgency(row.id, row.urgency)}
                    className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border transition-colors ${getUrgencyColor(row.urgency)}`}
                  >
                    {row.urgency}
                  </button>
                </td>
                <td className="px-2 py-1 text-center">
                  <button 
                    onClick={() => deleteRow(row.id)}
                    className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 outline-none"
                    tabIndex={-1}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            
            {/* Add Row */}
            <tr className="border-b border-slate-100">
              <td className="px-2 py-1 text-slate-300 text-center text-xs border-r border-slate-100">{rows.length + 1}</td>
              <td colSpan={6} className="px-0 py-0">
                <button 
                  onClick={addRow}
                  className="w-full h-8 px-2 text-xs text-left text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors outline-none focus:bg-blue-50/50 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 bg-slate-50 text-xs">
        <div className="flex items-center gap-4">
          <span className="text-slate-600 font-medium">{rows.length} items total</span>
          {urgentCount > 0 && (
            <span className="text-red-600 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {urgentCount} Urgent
            </span>
          )}
        </div>
        
        <button className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors font-medium">
          <Save className="w-3.5 h-3.5" />
          Save Draft
        </button>
      </div>
    </div>
  );
}
