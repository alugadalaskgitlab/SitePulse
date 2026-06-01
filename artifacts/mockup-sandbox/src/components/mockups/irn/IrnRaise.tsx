import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ClipboardList, Plus, Trash2, AlertTriangle, Info, ChevronLeft, Package, Search, Check } from "lucide-react";

type Item = {
  id: number;
  material: string;
  qty: string;
  uom: string;
  purpose: string;
  urgency: string;
  needByDate: string;
};

const SEED_MATERIALS = [
  "Bitumen (VG-30)",
  "Aggregate 20mm",
  "Aggregate 10mm",
  "Stone Dust",
  "Cement (OPC 53)",
  "TMT Steel 10mm",
  "TMT Steel 12mm",
  "Diesel (HSD)",
  "Engine Oil 15W40",
  "Hydraulic Oil",
  "Binding Wire",
  "Shuttering Plates",
  "MS Pipe 50mm",
  "Bitumen Emulsion",
  "Anti-stripping Agent",
];

const STORAGE_KEY = "irn_material_history";

function loadMaterials(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const custom: string[] = stored ? JSON.parse(stored) : [];
    const merged = [...SEED_MATERIALS];
    custom.forEach((m) => { if (!merged.includes(m)) merged.push(m); });
    return merged;
  } catch {
    return SEED_MATERIALS;
  }
}

function saveMaterial(name: string) {
  if (!name.trim()) return;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const custom: string[] = stored ? JSON.parse(stored) : [];
    if (!custom.includes(name) && !SEED_MATERIALS.includes(name)) {
      custom.unshift(name);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom.slice(0, 50)));
    }
  } catch {}
}

const UOM_OPTIONS = ["MT", "KL", "Nos", "KG", "Ltrs", "Bags", "Rmt", "Sqm", "Sets"];

const nextId = (() => { let n = 1; return () => n++; })();

function MaterialCombobox({
  value,
  onChange,
  materials,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  materials: string[];
  onBlur?: (v: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query.trim()
    ? materials.filter((m) => m.toLowerCase().includes(query.toLowerCase()))
    : materials;

  const showCreate = query.trim() && !materials.some((m) => m.toLowerCase() === query.toLowerCase());

  function select(m: string) {
    onChange(m);
    setQuery(m);
    setOpen(false);
    onBlur?.(m);
  }

  function handleInputBlur(e: React.FocusEvent) {
    if (listRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    if (query.trim() && query !== value) {
      onChange(query.trim());
      onBlur?.(query.trim());
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={handleInputBlur}
          placeholder="Search or type material…"
          className="h-8 w-full rounded-md border border-input bg-white pl-6 pr-2 text-xs outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-gray-400"
          autoComplete="off"
        />
      </div>
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-48 overflow-auto text-xs"
          onMouseDown={(e) => e.preventDefault()}
        >
          {showCreate && (
            <div
              className="px-3 py-2 cursor-pointer hover:bg-amber-50 text-amber-700 font-medium border-b flex items-center gap-1.5"
              onClick={() => select(query.trim())}
            >
              <Plus className="h-3 w-3" /> Add "{query.trim()}"
            </div>
          )}
          {filtered.length === 0 && !showCreate && (
            <div className="px-3 py-2 text-gray-400 italic">No matches</div>
          )}
          {filtered.map((m) => (
            <div
              key={m}
              className="px-3 py-2 cursor-pointer hover:bg-amber-50 flex items-center justify-between"
              onClick={() => select(m)}
            >
              <span>{m}</span>
              {m === value && <Check className="h-3 w-3 text-amber-600" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function IrnRaise() {
  const [section, setSection] = useState("Site");
  const [remarks, setRemarks] = useState("");
  const [materials, setMaterials] = useState<string[]>(loadMaterials);
  const [items, setItems] = useState<Item[]>([
    { id: nextId(), material: "", qty: "", uom: "MT", purpose: "", urgency: "normal", needByDate: "" },
  ]);

  function addItem() {
    setItems((prev) => [...prev, { id: nextId(), material: "", qty: "", uom: "MT", purpose: "", urgency: "normal", needByDate: "" }]);
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateItem(id: number, field: keyof Item, value: string) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i));
  }

  function handleMaterialBlur(id: number, value: string) {
    if (value && !materials.includes(value)) {
      saveMaterial(value);
      setMaterials(loadMaterials());
    }
    updateItem(id, "material", value);
  }

  const hasUrgent = items.some((i) => i.urgency === "urgent");

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-3 mb-0.5">
          <button className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <span className="text-gray-300">/</span>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-100 rounded">
              <ClipboardList className="h-4 w-4 text-amber-700" />
            </div>
            <span className="font-semibold text-gray-900">Raise Internal Requisition</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 ml-[88px]">New IRN — materials will be checked against store stock before procurement</p>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5 space-y-5">
        {/* Requisition Details */}
        <div className="bg-white border rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Info className="h-4 w-4 text-gray-400" />
            Requisition Details
          </h2>
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Raised From <span className="text-red-500">*</span></Label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Site">Site Operations</SelectItem>
                  <SelectItem value="HMP Plant">HMP Plant</SelectItem>
                  <SelectItem value="Equipment">Equipment & Fleet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date</Label>
              <Input value="01 Jun 2026" readOnly className="h-9 text-sm bg-gray-50 text-gray-500" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">General Remarks / Instructions</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any special instructions for the storekeeper (optional)…"
              className="text-sm resize-none h-16"
            />
          </div>
        </div>

        {/* Items */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-400" />
              Material Items
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded">{items.length}</span>
            </h2>
            <Button size="sm" variant="outline" onClick={addItem} className="h-7 text-xs gap-1">
              <Plus className="h-3.5 w-3.5" /> Add Item
            </Button>
          </div>
          <Separator className="mb-4" />

          {hasUrgent && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2.5 mb-4 text-xs text-red-700">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>One or more items marked <strong>Urgent</strong>. Stores will prioritise these — if stock isn't available, they will be fast-tracked to procurement.</span>
            </div>
          )}

          <div className="space-y-4">
            {items.map((item, idx) => (
              <div key={item.id} className="border rounded-md p-3 space-y-3 bg-gray-50/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Item {idx + 1}</span>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Row 1: Material (wide) + Need By Date */}
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-7 space-y-1">
                    <Label className="text-xs">Material <span className="text-red-500">*</span></Label>
                    <MaterialCombobox
                      value={item.material}
                      onChange={(v) => updateItem(item.id, "material", v)}
                      onBlur={(v) => handleMaterialBlur(item.id, v)}
                      materials={materials}
                    />
                  </div>
                  <div className="col-span-5 space-y-1">
                    <Label className="text-xs">
                      Need By Date <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={item.needByDate}
                      onChange={(e) => updateItem(item.id, "needByDate", e.target.value)}
                      className="h-8 text-xs bg-white"
                      min="2026-06-01"
                    />
                  </div>
                </div>

                {/* Row 2: Qty, UOM, Urgency */}
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">Qty <span className="text-red-500">*</span></Label>
                    <Input value={item.qty} onChange={(e) => updateItem(item.id, "qty", e.target.value)} placeholder="0.00" className="h-8 text-xs bg-white" />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">UOM</Label>
                    <Select value={item.uom} onValueChange={(v) => updateItem(item.id, "uom", v)}>
                      <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UOM_OPTIONS.map((u) => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-6 space-y-1">
                    <Label className="text-xs">Urgency</Label>
                    <Select value={item.urgency} onValueChange={(v) => updateItem(item.id, "urgency", v)}>
                      <SelectTrigger className={`h-8 text-xs bg-white ${item.urgency === "urgent" ? "border-red-300 text-red-700" : item.urgency === "high" ? "border-orange-300 text-orange-700" : ""}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                        <SelectItem value="high" className="text-xs text-orange-700">🟠 High</SelectItem>
                        <SelectItem value="urgent" className="text-xs text-red-700">🔴 Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 3: Purpose */}
                <div className="space-y-1">
                  <Label className="text-xs">Purpose / Usage <span className="text-red-500">*</span></Label>
                  <Input value={item.purpose} onChange={(e) => updateItem(item.id, "purpose", e.target.value)} placeholder="Where / why this material is needed…" className="h-8 text-xs bg-white" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Flow hint */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>After submission, the <strong>Storekeeper</strong> will verify stock for each item and either issue from store or mark the balance for procurement (Purchase Indent / Diesel Requirement).</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pb-4">
          <Button variant="outline" className="text-sm h-9">Save Draft</Button>
          <div className="flex gap-3">
            <Button variant="outline" className="text-sm h-9">Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white text-sm h-9 px-6">
              Submit to Stores
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
