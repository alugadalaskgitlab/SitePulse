import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ClipboardList, ChevronLeft, Plus, Trash2, AlertTriangle,
  Info, Package, Search, Check, MapPin,
} from "lucide-react";
import { PersonnelCombobox } from "@/components/PersonnelCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InternalRequisitionWithItems } from "@shared/schema";

// ── ?from= param → Raised From label map ────────────────────────────────────

const FROM_MAP: Record<string, string> = {
  site: "Site Operations",
  hmp: "HMP Plant",
  equipment: "Equipment & Fleet",
  rmc: "RMC Operations",
};

function parseQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const editIdRaw = params.get("editId");
  const qtyRaw = params.get("qty");
  return {
    fromParam: params.get("from") ?? "",
    returnTo: params.get("returnTo") ?? "",
    editId: editIdRaw ? Number(editIdRaw) : null,
    // Task #1240 — pass-through only: prefills the first line item from a
    // shortage/demand link. Does not change the IRN schema or workflow.
    prefillMaterial: params.get("material") ?? "",
    prefillQty: qtyRaw ? Number(qtyRaw) : null,
    prefillUom: params.get("uom") ?? "",
    prefillBoqProjectId: params.get("boqProjectId") ?? "",
  };
}

// ── Plant-aware material combobox ─────────────────────────────────────────

type PlantMat = { id: number; name: string; category: string; defaultUom: string | null };

function PlantMaterialCombobox({
  value, materialId, onChange, plantMaterials,
}: {
  value: string;
  materialId: number | null | undefined;
  onChange: (name: string, id: number | null) => void;
  plantMaterials: PlantMat[];
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const q = query.trim().toLowerCase();
  const filteredPlant = q
    ? plantMaterials.filter(m => m.name.toLowerCase().includes(q))
    : plantMaterials;

  const linkedName = materialId ? plantMaterials.find(m => m.id === materialId)?.name : null;

  function selectPlant(m: PlantMat) {
    onChange(m.name, m.id);
    setQuery(m.name);
    setOpen(false);
  }

  function selectFreeText(name: string) {
    onChange(name, null);
    setQuery(name);
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (listRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    if (query.trim() && query.trim() !== value) { onChange(query.trim(), null); }
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
          placeholder="Search plant materials or type freely…"
          className={`h-9 w-full rounded-md border bg-background pl-6 pr-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-muted-foreground ${linkedName ? "border-green-400" : "border-input"}`}
          autoComplete="off"
        />
        {linkedName && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-green-700 bg-green-50 border border-green-200 px-1 rounded font-medium whitespace-nowrap">
            linked
          </span>
        )}
      </div>
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-52 overflow-auto text-sm"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filteredPlant.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-[12px] font-semibold text-green-700 uppercase tracking-wide bg-green-50 border-b">
                Plant Stock Materials
              </div>
              {filteredPlant.map(m => (
                <div
                  key={m.id}
                  className="px-3 py-2 cursor-pointer hover:bg-green-50 flex items-center justify-between text-sm"
                  onClick={() => selectPlant(m)}
                >
                  <span className="font-medium">{m.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-gray-400 text-[12px]">{m.category}</span>
                    {m.id === materialId && <Check className="h-3 w-3 text-green-600" />}
                  </span>
                </div>
              ))}
            </>
          )}
          {q && (
            <div
              className="px-3 py-2 cursor-pointer hover:bg-amber-50 text-amber-700 font-medium flex items-center gap-1.5 text-sm border-t"
              onClick={() => selectFreeText(query.trim())}
            >
              <Plus className="h-3 w-3" /> Use "{query.trim()}" (free text)
            </div>
          )}
          {!q && filteredPlant.length === 0 && (
            <div className="px-3 py-2 text-gray-400 italic text-sm">Type to search…</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Form schema ────────────────────────────────────────────────────────────

const itemSchema = z.object({
  material: z.string().min(1, "Material is required"),
  materialId: z.number().int().nullish(),
  qty: z.coerce.number().positive("Must be > 0"),
  uom: z.string().min(1),
  urgency: z.enum(["normal", "high", "urgent"]),
  purpose: z.string().min(1, "Purpose is required"),
  needByDate: z.string().min(1, "Need by date is required"),
});

const formSchema = z.object({
  raisedFrom: z.string().min(1, "Section is required"),
  raisedBy: z.string().min(1, "Raised By is required"),
  siteId: z.number().int().nullish(),
  remarks: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

type FormValues = z.infer<typeof formSchema>;

const UOM_OPTIONS = ["MT", "KL", "NOS", "KG", "Ltrs", "Bags", "RMT", "SQM", "SETS", "LITERS", "BARRELS", "DRUMS", "PAIRS", "BOX", "ROLLS", "PACKETS", "CFT", "CUM"];

// ── Page ──────────────────────────────────────────────────────────────────

export default function IrnRaisePage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");

  const { fromParam, returnTo, editId, prefillMaterial, prefillQty, prefillUom } = parseQueryParams();
  const prefillLabel = FROM_MAP[fromParam] ?? "";
  const isLocked = !!prefillLabel && !editId;
  const backHref = returnTo || "/finance/hub";

  const { data: editIrn } = useQuery<InternalRequisitionWithItems>({
    queryKey: ["/api/irn", editId],
    queryFn: async () => {
      const res = await fetch(`/api/irn/${editId}`, { credentials: "include" });
      if (!res.ok) throw new Error("IRN not found");
      return res.json();
    },
    enabled: !!editId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      raisedFrom: prefillLabel || "Site Operations",
      raisedBy: user?.fullName?.toUpperCase() ?? user?.email ?? "",
      siteId: null,
      remarks: "",
      items: [{
        material: prefillMaterial || "",
        materialId: null,
        qty: prefillQty ?? 0,
        uom: prefillUom || "MT",
        urgency: "normal",
        purpose: prefillMaterial ? "Work programme shortage — procurement" : "",
        needByDate: "",
      }],
    },
  });

  const [editFillApplied, setEditFillApplied] = useState(false);
  useEffect(() => {
    if (!editIrn || editFillApplied) return;
    form.reset({
      raisedFrom: editIrn.raisedFrom,
      raisedBy: editIrn.raisedBy,
      siteId: editIrn.siteId ?? null,
      remarks: editIrn.remarks ?? "",
      items: editIrn.items.map((item) => ({
        material: item.material,
        materialId: item.materialId ?? null,
        qty: item.qty,
        uom: item.uom,
        urgency: (item.urgency ?? "normal") as "normal" | "high" | "urgent",
        purpose: item.purpose,
        needByDate: item.needByDate ?? "",
      })),
    });
    setEditFillApplied(true);
  }, [editIrn, editFillApplied, form]);

  const { data: sites = [] } = useQuery<{ id: number; name: string; isActive?: boolean }[]>({
    queryKey: ["/api/sites"],
    queryFn: async () => {
      const res = await fetch("/api/sites");
      if (!res.ok) return [];
      return res.json();
    },
  });
  const activeSites = sites.filter((s) => s.isActive !== false);

  const { data: plantMats = [] } = useQuery<PlantMat[]>({
    queryKey: ["/api/plant-module/materials"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/materials", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const items = form.watch("items");
  const hasUrgent = items.some((i) => i.urgency === "urgent");

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const body = {
        date: editIrn?.date ?? today,
        raisedFrom: data.raisedFrom,
        siteId: data.siteId ?? null,
        raisedBy: data.raisedBy || user?.fullName || user?.email || "Unknown",
        raisedByUserId: editIrn?.raisedByUserId ?? user?.id,
        remarks: data.remarks,
        items: data.items.map((item) => ({
          ...item,
          qty: Number(item.qty),
        })),
      };
      if (editId) {
        const res = await apiRequest("PATCH", `/api/irn/${editId}`, body);
        return res.json() as Promise<InternalRequisitionWithItems>;
      }
      const res = await apiRequest("POST", "/api/irn", body);
      return res.json() as Promise<InternalRequisitionWithItems>;
    },
    onSuccess: (irn) => {
      queryClient.invalidateQueries({ queryKey: ["/api/irn"] });
      queryClient.invalidateQueries({ queryKey: ["/api/irn", editId ?? irn.id] });
      if (editId) {
        toast({ title: "IRN updated", description: `${irn.irnNo} has been updated` });
        navigate(returnTo || `/irn/${editId}`);
      } else {
        toast({ title: "IRN raised", description: `${irn.irnNo} submitted to stores` });
        navigate(`/irn/${irn.id}`);
      }
    },
    onError: (err: any) => {
      toast({ title: editId ? "Failed to update IRN" : "Failed to raise IRN", description: err.message, variant: "destructive" });
    },
  });

  const sectionColor: Record<string, string> = {
    "Site Operations": "bg-amber-100 text-amber-800 border-amber-200",
    "HMP Plant": "bg-orange-100 text-orange-800 border-orange-200",
    "Equipment & Fleet": "bg-blue-100 text-blue-800 border-blue-200",
    "RMC Operations": "bg-teal-100 text-teal-800 border-teal-200",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-3 mb-0.5">
          <button
            onClick={() => navigate(backHref)}
            className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm"
            data-testid="btn-back-irn"
          >
            <ChevronLeft className="h-4 w-4" />
            {returnTo ? "Back" : "Procurement & Billing"}
          </button>
          <span className="text-gray-300">/</span>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-100 rounded">
              <ClipboardList className="h-4 w-4 text-amber-700" />
            </div>
            <span className="font-semibold text-gray-900">{editId ? "Edit Internal Requisition" : "Raise Internal Requisition"}</span>
          </div>
          {isLocked && (
            <Badge
              variant="outline"
              className={`text-sm font-medium ml-1 ${sectionColor[prefillLabel] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}
            >
              {prefillLabel}
            </Badge>
          )}
        </div>
        <p className="text-sm text-gray-500 ml-[88px]">Materials will be checked against store stock before procurement</p>
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

              {/* Raised From — locked badge or select */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Raised From <span className="text-red-500">*</span>
                </Label>
                {isLocked ? (
                  <div
                    className={`h-9 flex items-center gap-2 px-3 rounded-md border text-sm font-medium ${sectionColor[prefillLabel] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}
                    data-testid="display-raised-from"
                  >
                    <ClipboardList className="h-3.5 w-3.5 opacity-60" />
                    {prefillLabel}
                  </div>
                ) : (
                  <>
                    <Select
                      value={form.watch("raisedFrom")}
                      onValueChange={(v) => form.setValue("raisedFrom", v)}
                      data-testid="select-raised-from"
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Site Operations">Site Operations</SelectItem>
                        <SelectItem value="HMP Plant">HMP Plant</SelectItem>
                        <SelectItem value="Equipment & Fleet">Equipment & Fleet</SelectItem>
                        <SelectItem value="RMC Operations">RMC Operations</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.formState.errors.raisedFrom && (
                      <p className="text-sm text-red-500">{form.formState.errors.raisedFrom.message}</p>
                    )}
                  </>
                )}
              </div>

              {/* Raised By */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Raised By <span className="text-red-500">*</span></Label>
                <PersonnelCombobox
                  value={form.watch("raisedBy")}
                  onChange={(v) => form.setValue("raisedBy", v, { shouldValidate: true })}
                  placeholder="Search personnel…"
                  data-testid="input-raised-by"
                />
                {form.formState.errors.raisedBy && (
                  <p className="text-sm text-red-500">{form.formState.errors.raisedBy.message}</p>
                )}
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Date</Label>
                <Input
                  value={format(new Date(), "dd MMM yyyy")}
                  readOnly
                  className="h-9 text-sm bg-gray-50 text-gray-500"
                  data-testid="input-irn-date"
                />
              </div>

              {/* Site / Location — always visible for tracking material flow */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-gray-400" />
                  Site / Location
                </Label>
                <Select
                  value={form.watch("siteId") != null ? String(form.watch("siteId")) : "__none__"}
                  onValueChange={(v) => form.setValue("siteId", v === "__none__" ? null : Number(v))}
                  data-testid="select-site-id"
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select site / location (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None / General —</SelectItem>
                    {activeSites.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">General Remarks (optional)</Label>
              <Textarea
                {...form.register("remarks")}
                placeholder="Special instructions for the storekeeper…"
                className="text-sm resize-none h-16"
                data-testid="textarea-irn-remarks"
              />
            </div>
          </div>

          {/* Items */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" />
                Material Items
                <span className="bg-amber-100 text-amber-700 text-sm font-semibold px-1.5 py-0.5 rounded">
                  {fields.length}
                </span>
              </h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => append({ material: "", materialId: null, qty: 0, uom: "MT", urgency: "normal", purpose: "", needByDate: "" })}
                className="h-7 text-sm gap-1"
                data-testid="btn-add-item"
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </Button>
            </div>
            <Separator className="mb-4" />

            {hasUrgent && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2.5 mb-4 text-sm text-red-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>One or more items marked <strong>Urgent</strong> — stores will fast-track these.</span>
              </div>
            )}

            <div className="space-y-4">
              {fields.map((field, idx) => (
                <div key={field.id} className="border rounded-md p-3 space-y-3 bg-gray-50/60" data-testid={`item-row-${idx}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-500">Item {idx + 1}</span>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                        data-testid={`btn-remove-item-${idx}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Row 1: Material + Need By Date */}
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-7 space-y-1">
                      <Label className="text-sm">Material <span className="text-red-500">*</span></Label>
                      <PlantMaterialCombobox
                        value={form.watch(`items.${idx}.material`)}
                        materialId={form.watch(`items.${idx}.materialId`)}
                        plantMaterials={plantMats}
                        onChange={(name, id) => {
                          form.setValue(`items.${idx}.material`, name, { shouldValidate: true });
                          form.setValue(`items.${idx}.materialId`, id ?? null);
                          // Auto-fill UOM from plant material
                          if (id) {
                            const mat = plantMats.find(m => m.id === id);
                            if (mat?.defaultUom) form.setValue(`items.${idx}.uom`, mat.defaultUom.toUpperCase());
                          }
                        }}
                      />
                      {form.watch(`items.${idx}.materialId`) && (
                        <p className="text-[12px] text-green-700 flex items-center gap-0.5">
                          <Check className="h-3 w-3" /> Linked to plant stock — stock will update on issue
                        </p>
                      )}
                      {form.formState.errors.items?.[idx]?.material && (
                        <p className="text-sm text-red-500">{form.formState.errors.items[idx]?.material?.message}</p>
                      )}
                    </div>
                    <div className="col-span-5 space-y-1">
                      <Label className="text-sm">Need By Date <span className="text-red-500">*</span></Label>
                      <Input
                        type="date"
                        min={today}
                        {...form.register(`items.${idx}.needByDate`)}
                        className="h-9 text-sm bg-white"
                        data-testid={`input-need-by-${idx}`}
                      />
                      {form.formState.errors.items?.[idx]?.needByDate && (
                        <p className="text-sm text-red-500">{form.formState.errors.items[idx]?.needByDate?.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Qty + UOM + Urgency */}
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-sm">Qty <span className="text-red-500">*</span></Label>
                      <Input
                        type="number"
                        step="0.001"
                        {...form.register(`items.${idx}.qty`)}
                        placeholder="0.00"
                        className="h-9 text-sm bg-white"
                        data-testid={`input-qty-${idx}`}
                      />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-sm">UOM</Label>
                      <Input
                        list="irn-uom-options"
                        value={form.watch(`items.${idx}.uom`)}
                        onChange={(e) => form.setValue(`items.${idx}.uom`, e.target.value.toUpperCase())}
                        className="h-9 text-sm bg-white uppercase"
                        placeholder="UOM"
                      />
                      <datalist id="irn-uom-options">
                        {UOM_OPTIONS.map((u) => <option key={u} value={u} />)}
                      </datalist>
                    </div>
                    <div className="col-span-6 space-y-1">
                      <Label className="text-sm">Urgency</Label>
                      <Select
                        value={form.watch(`items.${idx}.urgency`)}
                        onValueChange={(v) => form.setValue(`items.${idx}.urgency`, v as any)}
                      >
                        <SelectTrigger className={`h-9 text-sm bg-white ${
                          form.watch(`items.${idx}.urgency`) === "urgent" ? "border-red-300 text-red-700" :
                          form.watch(`items.${idx}.urgency`) === "high" ? "border-orange-300 text-orange-700" : ""
                        }`}>
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
                    <Label className="text-sm">Purpose / Usage <span className="text-red-500">*</span></Label>
                    <Input
                      {...form.register(`items.${idx}.purpose`)}
                      placeholder="Where / why this material is needed…"
                      className="h-9 text-sm bg-white"
                      data-testid={`input-purpose-${idx}`}
                    />
                    {form.formState.errors.items?.[idx]?.purpose && (
                      <p className="text-sm text-red-500">{form.formState.errors.items[idx]?.purpose?.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Flow hint */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              After submission, the <strong>Storekeeper</strong> will verify stock for each item
              and either issue from store or add to the Procurement Queue.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pb-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(backHref)}
              className="text-sm h-9"
              data-testid="btn-cancel-irn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm h-9 px-6"
              data-testid="btn-submit-irn"
            >
              {mutation.isPending ? "Submitting…" : "Submit to Stores"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
