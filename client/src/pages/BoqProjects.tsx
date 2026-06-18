import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  FileSpreadsheet, Plus, Upload, ArrowRight, Check, Loader2,
  Building2, Calendar, Ruler, Tag, FolderOpen, ChevronDown, ChevronUp,
  AlertCircle, X,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BoqProjectWithCounts } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColumnMap {
  description: number | null;
  unit: number | null;
  boqQty: number | null;
  itemCode: number | null;
  clientRate: number | null;
  category: number | null;
  fixedCategory: string;
}

const EMPTY_COL_MAP: ColumnMap = {
  description: null, unit: null, boqQty: null,
  itemCode: null, clientRate: null, category: null,
  fixedCategory: "",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-red-50 text-red-600 border-red-200",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseExcelFile(file: File): Promise<(string | number | null)[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null });
        resolve(rows as (string | number | null)[][]);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

function cellStr(v: string | number | null): string {
  if (v == null) return "";
  return String(v).trim();
}

// ─── New Project Dialog ────────────────────────────────────────────────────────

function NewProjectDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: sites = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/sites"],
    enabled: open,
  });

  const [form, setForm] = useState({
    name: "", contractNo: "", client: "", contractor: "",
    siteId: "", roadLengthKm: "", startDate: "", totalMonths: "", status: "draft",
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/boq/projects", data),
    onSuccess: async (res) => {
      const project = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects"] });
      toast({ title: "Project created" });
      onClose();
      navigate(`/work-program/${project.id}`);
    },
    onError: () => toast({ title: "Failed to create project", variant: "destructive" }),
  });

  function handleSubmit() {
    if (!form.name.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      contractNo: form.contractNo.trim() || null,
      client: form.client.trim() || null,
      contractor: form.contractor.trim() || null,
      siteId: form.siteId ? parseInt(form.siteId) : null,
      roadLengthKm: form.roadLengthKm ? parseFloat(form.roadLengthKm) : null,
      startDate: form.startDate || null,
      totalMonths: form.totalMonths ? parseInt(form.totalMonths) : null,
      status: form.status,
      createdBy: user?.fullName || user?.email || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            New BOQ Project
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">PROJECT NAME <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)}
              placeholder="e.g. NH-44 Widening — Package 3" data-testid="input-project-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">CONTRACT NO.</Label>
              <Input value={form.contractNo} onChange={e => set("contractNo", e.target.value)}
                placeholder="e.g. NHAI/2024/001" data-testid="input-contract-no" />
            </div>
            <div>
              <Label className="text-xs">CLIENT / AUTHORITY</Label>
              <Input value={form.client} onChange={e => set("client", e.target.value)}
                placeholder="e.g. NHAI" data-testid="input-client" />
            </div>
            <div>
              <Label className="text-xs">CONTRACTOR</Label>
              <Input value={form.contractor} onChange={e => set("contractor", e.target.value)}
                placeholder="e.g. HLC" data-testid="input-contractor" />
            </div>
            <div>
              <Label className="text-xs">LINKED SITE</Label>
              <Select value={form.siteId} onValueChange={v => set("siteId", v)}>
                <SelectTrigger data-testid="select-site">
                  <SelectValue placeholder="— None —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {sites.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">ROAD LENGTH (km)</Label>
              <Input type="number" value={form.roadLengthKm} onChange={e => set("roadLengthKm", e.target.value)}
                placeholder="0.00" data-testid="input-road-length" />
            </div>
            <div>
              <Label className="text-xs">TOTAL MONTHS</Label>
              <Input type="number" value={form.totalMonths} onChange={e => set("totalMonths", e.target.value)}
                placeholder="12" data-testid="input-total-months" />
            </div>
            <div>
              <Label className="text-xs">START DATE</Label>
              <Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)}
                data-testid="input-start-date" />
            </div>
            <div>
              <Label className="text-xs">STATUS</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-project">Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-create-project">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Excel Import Wizard ───────────────────────────────────────────────────────

function ExcelImportWizard({
  projectId,
  projectName,
  onClose,
  onSuccess,
}: {
  projectId: number;
  projectName: string;
  onClose: () => void;
  onSuccess: (result: { created: number; categories: string[] }) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<(string | number | null)[][]>([]);
  const [colMap, setColMap] = useState<ColumnMap>(EMPTY_COL_MAP);
  const [parseError, setParseError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const importMutation = useMutation({
    mutationFn: (items: any[]) =>
      apiRequest("POST", `/api/boq/projects/${projectId}/import`, { items }),
    onSuccess: async (res) => {
      const result = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "items"] });
      onSuccess(result);
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  async function processFile(file: File) {
    setParseError("");
    try {
      const rows = await parseExcelFile(file);
      const nonEmpty = rows.filter(r => r.some(c => c != null && String(c).trim() !== ""));
      if (nonEmpty.length === 0) {
        setParseError("The file appears to be empty.");
        return;
      }
      setRawRows(nonEmpty);
      setFileName(file.name);
      // Auto-detect headers from first row
      const header = nonEmpty[0].map(cellStr);
      const autoMap: ColumnMap = { ...EMPTY_COL_MAP };
      header.forEach((h, i) => {
        const lh = h.toLowerCase();
        if (!autoMap.description && (lh.includes("desc") || lh.includes("item name") || lh.includes("work"))) autoMap.description = i;
        else if (!autoMap.unit && (lh === "unit" || lh === "uom" || lh.includes("unit of"))) autoMap.unit = i;
        else if (!autoMap.boqQty && (lh.includes("qty") || lh.includes("quantity") || lh === "nos" || lh.includes("boq"))) autoMap.boqQty = i;
        else if (!autoMap.itemCode && (lh.includes("code") || lh.includes("sl") || lh === "no." || lh === "sno" || lh === "s.no" || lh === "item no")) autoMap.itemCode = i;
        else if (!autoMap.clientRate && (lh.includes("rate") || lh.includes("price") || lh.includes("amount"))) autoMap.clientRate = i;
        else if (!autoMap.category && (lh.includes("category") || lh.includes("chapter") || lh.includes("head") || lh.includes("section"))) autoMap.category = i;
      });
      setColMap(autoMap);
      setStep(1);
    } catch (err) {
      setParseError("Could not read the file. Please ensure it is a valid Excel file (.xlsx or .xls).");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  // Derived: header row + data rows
  const headerRow = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);
  const previewRows = dataRows.slice(0, 8);

  // Column select options
  const colOptions = headerRow.map((h, i) => ({ label: `Col ${i + 1}: ${cellStr(h) || "(empty)"}`, value: i }));

  function setMapField(field: keyof ColumnMap, val: string) {
    setColMap(p => ({ ...p, [field]: val === "" ? null : parseInt(val) }));
  }

  // Build items for import
  function buildItems() {
    return dataRows
      .filter(row => {
        const desc = colMap.description != null ? cellStr(row[colMap.description]) : "";
        const unit = colMap.unit != null ? cellStr(row[colMap.unit]) : "";
        return desc.length > 0 && unit.length > 0;
      })
      .map((row, i) => {
        const desc = colMap.description != null ? cellStr(row[colMap.description]) : "";
        const unit = colMap.unit != null ? cellStr(row[colMap.unit]) : "";
        const qtyRaw = colMap.boqQty != null ? row[colMap.boqQty] : null;
        const rateRaw = colMap.clientRate != null ? row[colMap.clientRate] : null;
        const catCell = colMap.category != null ? cellStr(row[colMap.category]) : null;
        return {
          description: desc,
          unit,
          boqQty: typeof qtyRaw === "number" ? qtyRaw : parseFloat(String(qtyRaw ?? "0")) || 0,
          itemCode: colMap.itemCode != null ? (cellStr(row[colMap.itemCode]) || undefined) : undefined,
          clientRate: rateRaw != null ? (typeof rateRaw === "number" ? rateRaw : parseFloat(String(rateRaw))) || undefined : undefined,
          categoryName: catCell?.trim() || colMap.fixedCategory.trim() || undefined,
          sortOrder: i,
        };
      });
  }

  const mappedItems = step >= 1 ? buildItems() : [];
  const categorySet = new Set(mappedItems.map(i => i.categoryName).filter(Boolean));

  const canProceedStep1 = colMap.description != null && colMap.unit != null && colMap.boqQty != null;

  function handleImport() {
    importMutation.mutate(mappedItems);
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            Import BOQ from Excel
            {projectName && <span className="font-normal text-muted-foreground text-sm">— {projectName}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {["Upload File", "Map Columns", "Confirm & Import"].map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step > i ? "bg-emerald-500 text-white" :
                step === i ? "bg-blue-600 text-white" :
                "bg-slate-200 text-slate-500"
              }`}>
                {step > i ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-xs font-medium ${step === i ? "text-blue-700" : "text-muted-foreground"}`}>{label}</span>
              {i < 2 && <ArrowRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
            </div>
          ))}
        </div>

        {/* ── Step 0: Upload ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragging ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/40"
              }`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              data-testid="dropzone-excel"
            >
              <FileSpreadsheet className="w-12 h-12 text-blue-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">Drop your Excel file here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse — .xlsx or .xls</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={handleFileChange} data-testid="input-file-excel" />
            </div>
            {parseError && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {parseError}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Expected columns (in any order): Item Code, Description, Unit, BOQ Qty, Client Rate, Category.
              The wizard will help you map them in the next step.
            </p>
          </div>
        )}

        {/* ── Step 1: Map Columns ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground bg-slate-50 rounded-lg p-3 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span>Loaded <strong>{dataRows.length} data rows</strong> from <strong>{fileName}</strong>. Map each target field to its Excel column below.</span>
            </div>

            {/* Column mapper */}
            <div className="grid grid-cols-2 gap-3">
              {([
                { field: "description", label: "Description", required: true },
                { field: "unit", label: "Unit", required: true },
                { field: "boqQty", label: "BOQ Quantity", required: true },
                { field: "itemCode", label: "Item Code", required: false },
                { field: "clientRate", label: "Client Rate (₹)", required: false },
                { field: "category", label: "Category Column", required: false },
              ] as { field: keyof ColumnMap; label: string; required: boolean }[]).map(({ field, label, required }) => (
                <div key={field}>
                  <Label className="text-xs">{label.toUpperCase()} {required && <span className="text-red-500">*</span>}</Label>
                  <Select
                    value={colMap[field] != null ? String(colMap[field]) : ""}
                    onValueChange={v => setMapField(field, v)}
                  >
                    <SelectTrigger data-testid={`select-col-${field}`}>
                      <SelectValue placeholder="— Not mapped —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— Not mapped —</SelectItem>
                      {colOptions.map(o => (
                        <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Fixed category fallback */}
            <div>
              <Label className="text-xs">FIXED CATEGORY (if no category column)</Label>
              <Input
                value={colMap.fixedCategory}
                onChange={e => setColMap(p => ({ ...p, fixedCategory: e.target.value }))}
                placeholder="e.g. Earthwork — applied to all rows if no category column mapped"
                data-testid="input-fixed-category"
              />
            </div>

            {/* Preview table */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">DATA PREVIEW (first 8 rows)</p>
              <div className="overflow-x-auto rounded-lg border text-xs">
                <table className="min-w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      {headerRow.map((h, i) => (
                        <th key={i} className={`px-2 py-1.5 text-left font-medium whitespace-nowrap border-b ${
                          Object.values(colMap).includes(i)
                            ? "bg-blue-50 text-blue-700" : "text-slate-500"
                        }`}>
                          {cellStr(h) || `Col ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="border-b last:border-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className={`px-2 py-1 whitespace-nowrap max-w-[160px] truncate ${
                            Object.values(colMap).includes(ci) ? "bg-blue-50/50 text-blue-800 font-medium" : "text-slate-600"
                          }`}>
                            {cellStr(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!canProceedStep1 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Map Description, Unit, and BOQ Qty to proceed.
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: Confirm ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-emerald-800">Ready to import</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-3 border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-700">{mappedItems.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">BOQ Items</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-700">{categorySet.size}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Categories</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-700">
                    {mappedItems.filter(i => i.clientRate).length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Items with Rate</p>
                </div>
              </div>
              {categorySet.size > 0 && (
                <div>
                  <p className="text-xs text-emerald-700 font-medium mb-1">Categories detected:</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(categorySet).map(cat => (
                      <Badge key={cat} variant="outline" className="text-xs bg-white border-emerald-200 text-emerald-700">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Preview of first 5 items */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">FIRST 5 ITEMS TO IMPORT</p>
              <div className="space-y-1.5">
                {mappedItems.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs bg-slate-50 rounded-lg px-3 py-2">
                    {item.itemCode && <span className="font-mono text-slate-500 w-16 flex-shrink-0 truncate">{item.itemCode}</span>}
                    <span className="flex-1 truncate font-medium">{item.description}</span>
                    <span className="text-slate-500 flex-shrink-0">{item.boqQty} {item.unit}</span>
                    {item.clientRate && <span className="text-slate-500 flex-shrink-0">₹{item.clientRate}</span>}
                    {item.categoryName && (
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">{item.categoryName}</Badge>
                    )}
                  </div>
                ))}
                {mappedItems.length > 5 && (
                  <p className="text-xs text-center text-muted-foreground">…and {mappedItems.length - 5} more items</p>
                )}
              </div>
            </div>

            {mappedItems.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                No valid rows found. Go back and verify the column mapping — every row needs a Description and Unit.
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        <DialogFooter className="flex items-center gap-2 pt-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-import">
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          {step === 1 && (
            <Button variant="outline" onClick={() => setStep(0)} data-testid="button-import-back">
              ← Back
            </Button>
          )}
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)} data-testid="button-import-back-2">
              ← Back
            </Button>
          )}
          {step === 0 && rawRows.length > 0 && (
            <Button onClick={() => setStep(1)} className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-import-next-1">
              Next: Map Columns <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === 1 && (
            <Button onClick={() => setStep(2)} disabled={!canProceedStep1}
              className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-import-next-2">
              Next: Review <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === 2 && (
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending || mappedItems.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-import-confirm"
            >
              {importMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Importing…</>
                : <><Check className="w-4 h-4 mr-1" /> Import {mappedItems.length} Items</>
              }
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onImport,
}: {
  project: BoqProjectWithCounts;
  onImport: (id: number) => void;
}) {
  const [, navigate] = useLocation();

  return (
    <Card className="hover:shadow-md transition-shadow border-slate-200" data-testid={`card-project-${project.id}`}>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800 truncate">{project.name}</h3>
            {project.contractNo && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">Contract: {project.contractNo}</p>
            )}
          </div>
          <Badge variant="outline" className={`text-xs flex-shrink-0 ${STATUS_COLORS[project.status] ?? STATUS_COLORS.draft}`}>
            {project.status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {project.client && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{project.client}</span>
            </div>
          )}
          {project.siteName && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Tag className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{project.siteName}</span>
            </div>
          )}
          {project.startDate && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <span>{project.startDate}{project.totalMonths ? ` · ${project.totalMonths} mo` : ""}</span>
            </div>
          )}
          {project.roadLengthKm != null && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Ruler className="w-3 h-3 flex-shrink-0" />
              <span>{project.roadLengthKm} km</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
          <div className="flex-1 text-xs text-muted-foreground">
            <span className="font-semibold text-slate-700">{project.itemCount}</span> BOQ items
            {project.activeRevision && (
              <span className="ml-2 text-emerald-600">· Rev: {project.activeRevision}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
            onClick={() => navigate(`/work-program/${project.id}`)}
            data-testid={`button-open-project-${project.id}`}
          >
            <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
            Open
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={() => onImport(project.id)}
            data-testid={`button-import-project-${project.id}`}
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Import BOQ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BoqProjects() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showNew, setShowNew] = useState(false);
  const [importProjectId, setImportProjectId] = useState<number | null>(null);
  const [importSuccess, setImportSuccess] = useState<{ created: number; categories: string[] } | null>(null);

  const { data: projects = [], isLoading } = useQuery<BoqProjectWithCounts[]>({
    queryKey: ["/api/boq/projects"],
  });

  const importProject = importProjectId != null
    ? projects.find(p => p.id === importProjectId)
    : null;

  function handleImportSuccess(result: { created: number; categories: string[] }) {
    setImportSuccess(result);
    setImportProjectId(null);
    toast({
      title: `BOQ Imported — ${result.created} items`,
      description: result.categories.length > 0
        ? `Categories: ${result.categories.join(", ")}`
        : "No categories detected.",
    });
    if (importProject) {
      navigate(`/work-program/${importProject.id}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            Work Program & BOQ
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create BOQ projects, import Excel schedules, and manage quantity revisions
          </p>
        </div>
        <Button
          onClick={() => setShowNew(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          data-testid="button-new-project"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Project
        </Button>
      </div>

      {/* Projects grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading projects…
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <FileSpreadsheet className="w-16 h-16 text-slate-200 mx-auto" />
          <div>
            <p className="font-semibold text-slate-600">No BOQ projects yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create a project then import your Excel BOQ to get started</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="button-new-project-empty">
            <Plus className="w-4 h-4 mr-1.5" /> Create First Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onImport={id => setImportProjectId(id)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <NewProjectDialog open={showNew} onClose={() => setShowNew(false)} />

      {importProjectId != null && importProject && (
        <ExcelImportWizard
          projectId={importProjectId}
          projectName={importProject.name}
          onClose={() => setImportProjectId(null)}
          onSuccess={handleImportSuccess}
        />
      )}
    </div>
  );
}
