import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ClipboardList, ChevronLeft, Plus, Trash2, AlertTriangle, Info, Package, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InternalRequisitionWithItems } from "@shared/schema";

// ── Material combobox with localStorage memory ──────────────────────────────

const SEED_MATERIALS = [
  "Bitumen (VG-30)", "Aggregate 20mm", "Aggregate 10mm", "Stone Dust",
  "Cement (OPC 53)", "TMT Steel 10mm", "TMT Steel 12mm", "Diesel (HSD)",
  "Engine Oil 15W40", "Hydraulic Oil", "Binding Wire", "Shuttering Plates",
  "MS Pipe 50mm", "Bitumen Emulsion", "Anti-stripping Agent",
];
const STORAGE_KEY = "irn_material_history";

function loadMaterials(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const custom: string[] = stored ? JSON.parse(stored) : [];
    const merged = [...SEED_MATERIALS];
    custom.forEach((m) => { if (!merged.includes(m)) merged.push(m); });
    return merged;
  } catch { return SEED_MATERIALS; }
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

function MaterialCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [materials, setMaterials] = useState<string[]>(loadMaterials);
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
    saveMaterial(m);
    setMaterials(loadMaterials());
  }

  function handleBlur(e: React.FocusEvent) {
    if (listRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    if (query.trim() && query !== value) { onChange(query.trim()); saveMaterial(query.trim()); }
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
          onBlur={handleBlur}
          placeholder="Search or type material…"
          className="h-9 w-full rounded-md border border-input bg-background pl-6 pr-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-muted-foreground"
          autoComplete="off"
        />
      </div>
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-52 overflow-auto text-sm"
          onMouseDown={(e) => e.preventDefault()}
        >
          {showCreate && (
            <div className="px-3 py-2 cursor-pointer hover:bg-amber-50 text-amber-700 font-medium border-b flex items-center gap-1.5 text-xs" onClick={() => select(query.trim())}>
              <Plus className="h-3 w-3" /> Add "{query.trim()}"
            </div>
          )}
          {filtered.length === 0 && !showCreate && (
            <div className="px-3 py-2 text-gray-400 italic text-xs">No matches</div>
          )}
          {filtered.map((m) => (
            <div key={m} className="px-3 py-2 cursor-pointer hover:bg-amber-50 flex items-center justify-between text-xs" onClick={() => select(m)}>
              <span>{m}</span>
              {m === value && <Check className="h-3 w-3 text-amber-600" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Form schema ────────────────────────────────────────────────────────────

const itemSchema = z.object({
  material: z.string().min(1, "Material is required"),
  qty: z.coerce.number().positive("Must be > 0"),
  uom: z.string().min(1),
  urgency: z.enum(["normal", "high", "urgent"]),
  purpose: z.string().min(1, "Purpose is required"),
  needByDate: z.string().min(1, "Need by date is required"),
});

const formSchema = z.object({
  raisedFrom: z.string().min(1, "Section is required"),
  remarks: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

type FormValues = z.infer<typeof formSchema>;

const UOM_OPTIONS = ["MT", "KL", "Nos", "KG", "Ltrs", "Bags", "Rmt", "Sqm", "Sets"];

// ── Page ──────────────────────────────────────────────────────────────────

export default function IrnRaisePage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      raisedFrom: "Site Operations",
      remarks: "",
      items: [{ material: "", qty: 0, uom: "MT", urgency: "normal", purpose: "", needByDate: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const items = form.watch("items");
  const hasUrgent = items.some((i) => i.urgency === "urgent");

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const body = {
        date: today,
        raisedFrom: data.raisedFrom,
        raisedBy: user?.fullName ?? user?.email ?? "Unknown",
        raisedByUserId: user?.id,
        remarks: data.remarks,
        items: data.items.map((item) => ({
          ...item,
          qty: Number(item.qty),
        })),
      };
      const res = await apiRequest("POST", "/api/irn", body);
      return res.json() as Promise<InternalRequisitionWithItems>;
    },
    onSuccess: (irn) => {
      queryClient.invalidateQueries({ queryKey: ["/api/irn"] });
      toast({ title: "IRN raised", description: `${irn.irnNo} submitted to stores` });
      navigate(`/irn/${irn.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Failed to raise IRN", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-3 mb-0.5">
          <button onClick={() => navigate("/irn")} className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm">
            <ChevronLeft className="h-4 w-4" /> Requisitions
          </button>
          <span className="text-gray-300">/</span>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-100 rounded">
              <ClipboardList className="h-4 w-4 text-amber-700" />
            </div>
            <span className="font-semibold text-gray-900">Raise Internal Requisition</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 ml-[88px]">Materials will be checked against store stock before procurement</p>
      </div>

      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))}>
        <div className="max-w-3xl mx-auto px-6 py-5 space-y-5">
          {/* Requisition Details */}
          <div className="bg-white border rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Info className="h-4 w-4 text-gray-400" /> Requisition Details
            </h2>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Raised From <span className="text-red-500">*</span></Label>
                <Select value={form.watch("raisedFrom")} onValueChange={(v) => form.setValue("raisedFrom", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Site Operations">Site Operations</SelectItem>
                    <SelectItem value="HMP Plant">HMP Plant</SelectItem>
                    <SelectItem value="Equipment & Fleet">Equipment & Fleet</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.raisedFrom && (
                  <p className="text-xs text-red-500">{form.formState.errors.raisedFrom.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Raised By</Label>
                <Input value={user?.fullName ?? user?.email ?? ""} readOnly className="h-9 text-sm bg-gray-50 text-gray-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Date</Label>
                <Input value={format(new Date(), "dd MMM yyyy")} readOnly className="h-9 text-sm bg-gray-50 text-gray-500" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">General Remarks (optional)</Label>
              <Textarea {...form.register("remarks")} placeholder="Special instructions for the storekeeper…" className="text-sm resize-none h-16" />
            </div>
          </div>

          {/* Items */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" />
                Material Items
                <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded">{fields.length}</span>
              </h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => append({ material: "", qty: 0, uom: "MT", urgency: "normal", purpose: "", needByDate: "" })}
                className="h-7 text-xs gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </Button>
            </div>
            <Separator className="mb-4" />

            {hasUrgent && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2.5 mb-4 text-xs text-red-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>One or more items marked <strong>Urgent</strong> — stores will fast-track these.</span>
              </div>
            )}

            <div className="space-y-4">
              {fields.map((field, idx) => (
                <div key={field.id} className="border rounded-md p-3 space-y-3 bg-gray-50/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Item {idx + 1}</span>
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(idx)} className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Row 1: Material + Need By Date */}
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-7 space-y-1">
                      <Label className="text-xs">Material <span className="text-red-500">*</span></Label>
                      <MaterialCombobox
                        value={form.watch(`items.${idx}.material`)}
                        onChange={(v) => form.setValue(`items.${idx}.material`, v, { shouldValidate: true })}
                      />
                      {form.formState.errors.items?.[idx]?.material && (
                        <p className="text-xs text-red-500">{form.formState.errors.items[idx]?.material?.message}</p>
                      )}
                    </div>
                    <div className="col-span-5 space-y-1">
                      <Label className="text-xs">Need By Date <span className="text-red-500">*</span></Label>
                      <Input
                        type="date"
                        min={today}
                        {...form.register(`items.${idx}.needByDate`)}
                        className="h-9 text-sm bg-white"
                      />
                      {form.formState.errors.items?.[idx]?.needByDate && (
                        <p className="text-xs text-red-500">{form.formState.errors.items[idx]?.needByDate?.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Qty + UOM + Urgency */}
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Qty <span className="text-red-500">*</span></Label>
                      <Input
                        type="number"
                        step="0.001"
                        {...form.register(`items.${idx}.qty`)}
                        placeholder="0.00"
                        className="h-9 text-sm bg-white"
                      />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">UOM</Label>
                      <Select value={form.watch(`items.${idx}.uom`)} onValueChange={(v) => form.setValue(`items.${idx}.uom`, v)}>
                        <SelectTrigger className="h-9 text-sm bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UOM_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6 space-y-1">
                      <Label className="text-xs">Urgency</Label>
                      <Select value={form.watch(`items.${idx}.urgency`)} onValueChange={(v) => form.setValue(`items.${idx}.urgency`, v as any)}>
                        <SelectTrigger className={`h-9 text-sm bg-white ${form.watch(`items.${idx}.urgency`) === "urgent" ? "border-red-300 text-red-700" : form.watch(`items.${idx}.urgency`) === "high" ? "border-orange-300 text-orange-700" : ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high" className="text-orange-700">🟠 High</SelectItem>
                          <SelectItem value="urgent" className="text-red-700">🔴 Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Row 3: Purpose */}
                  <div className="space-y-1">
                    <Label className="text-xs">Purpose / Usage <span className="text-red-500">*</span></Label>
                    <Input
                      {...form.register(`items.${idx}.purpose`)}
                      placeholder="Where / why this material is needed…"
                      className="h-9 text-sm bg-white"
                    />
                    {form.formState.errors.items?.[idx]?.purpose && (
                      <p className="text-xs text-red-500">{form.formState.errors.items[idx]?.purpose?.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Flow hint */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>After submission, the <strong>Storekeeper</strong> will verify stock for each item and either issue from store or add to the Procurement Queue.</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pb-4">
            <Button type="button" variant="outline" onClick={() => navigate("/irn")} className="text-sm h-9">Cancel</Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm h-9 px-6"
            >
              {mutation.isPending ? "Submitting…" : "Submit to Stores"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
