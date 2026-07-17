import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { useMutation } from "@tanstack/react-query";
import {
  FileSpreadsheet, Upload, ArrowRight, Check, Loader2,
  AlertCircle, X, Tags, Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BOQ_WORK_CATEGORIES, suggestWorkCategory, getWorkCategoryLabel } from "@shared/boqWorkCategories";
import { canonicalizeUnit } from "@shared/boqNormalise";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColumnMap {
  description: number | null;
  unit: number | null;
  boqQty: number | null;
  itemCode: number | null;
  snlCode: number | null;
  clientRate: number | null;
}

const EMPTY_COL_MAP: ColumnMap = {
  description: null, unit: null, boqQty: null,
  itemCode: null, snlCode: null, clientRate: null,
};

interface ParsedItem {
  description: string;
  unit: string;
  boqQty: number;
  itemCode?: string;
  snlCode?: string;
  clientRate?: number;
  categoryName?: string;
  sortOrder: number;
}

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

// ─── MoRTH / EPC BoQ structure helpers ──────────────────────────────────────
function toNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
// BoQ codes: numeric 201 → "201"; float-mangled 2.0199999 → "2.02"; "2.03A" → "2.03A"
function normCode(v: string | number | null): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.00$/, "");
  }
  return String(v).trim();
}
// "BILL No. 1", "Bill No 2", "BILL No.1" → section/category header
function isBillRow(itemCol: string): boolean {
  return /^bill\s*no\.?/i.test(itemCol.trim());
}
// "Total Carried to Summary", "Sub Total", "Grand Total"
function isTotalRow(desc: string): boolean {
  return /total\s+carried|carried to summary|^sub\s*total$|^total$|grand total/i.test(desc.trim());
}
// Find the real header row (contains Description + Unit + Quantity) within the first ~15 rows
function findHeaderRowIdx(rows: (string | number | null)[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => (c == null ? "" : String(c).toLowerCase()));
    const hasDesc = cells.some((c) => c.includes("desc") || c === "item name" || c.includes("particular"));
    const hasUnit = cells.some((c) => c === "unit" || c === "uom" || c.includes("unit"));
    const hasQty = cells.some((c) => c.includes("quantity") || c.includes("qty"));
    if (hasDesc && hasUnit && hasQty) return i;
  }
  return 0;
}

function cellStr(v: string | number | null): string {
  if (v == null) return "";
  return String(v).trim();
}

// ─── Step indicator labels ─────────────────────────────────────────────────────

const STEPS = ["Upload File", "Map Columns", "Work Categories", "Confirm & Import"];

// ─── Wizard ───────────────────────────────────────────────────────────────────

interface BoqImportWizardProps {
  projectId: number;
  projectName: string;
  existingItemCount?: number;
  onClose: () => void;
  onSuccess: (result: { created: number; categories: string[]; deleted?: number }) => void;
}

export function BoqImportWizard({ projectId, projectName, existingItemCount = 0, onClose, onSuccess }: BoqImportWizardProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<(string | number | null)[][]>([]);
  const [colMap, setColMap] = useState<ColumnMap>(EMPTY_COL_MAP);
  const [parseError, setParseError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Step 2 state: work category per item index
  const [itemWorkCats, setItemWorkCats] = useState<string[]>([]);
  // Bulk assign
  const [bulkCat, setBulkCat] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  // Import mode when project already has items
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [skipZeroQty, setSkipZeroQty] = useState(true);

  const importMutation = useMutation({
    mutationFn: ({ items, mode }: { items: any[]; mode: "append" | "replace" }) =>
      apiRequest("POST", `/api/boq/projects/${projectId}/import`, { items, mode }),
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
      // Skip any title/banner rows above the real header (e.g. "BILL OF QUANTITY")
      const headerIdx = findHeaderRowIdx(nonEmpty);
      const trimmed = nonEmpty.slice(headerIdx);
      setRawRows(trimmed);
      setFileName(file.name);
      const header = trimmed[0].map(cellStr);
      const autoMap: ColumnMap = { ...EMPTY_COL_MAP };
      header.forEach((h, i) => {
        const lh = h.toLowerCase().trim();
        if (autoMap.description == null && (lh.includes("desc") || lh === "item name" || lh.includes("particular"))) autoMap.description = i;
        else if (autoMap.unit == null && (lh === "unit" || lh === "uom" || lh.includes("unit of"))) autoMap.unit = i;
        else if (autoMap.boqQty == null && (lh.includes("qty") || lh.includes("quantity") || lh === "nos" || lh.includes("boq"))) autoMap.boqQty = i;
        else if (autoMap.snlCode == null && (lh.includes("snl") || lh.includes("sdb") || lh.includes("norm") || lh.includes("data book") || lh.includes("spec ref") || lh.includes("mort") || lh.includes("clause"))) autoMap.snlCode = i;
        else if (autoMap.itemCode == null && (lh === "item" || lh === "item no" || lh.includes("item no") || lh.includes("code") || lh === "sl" || lh === "sl no" || lh === "no." || lh === "sno" || lh === "s.no")) autoMap.itemCode = i;
        else if (autoMap.clientRate == null && (lh.includes("rate") || lh.includes("price"))) autoMap.clientRate = i;
      });
      setColMap(autoMap);
      setStep(1);
    } catch {
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

  const headerRow = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);
  const previewRows = dataRows.slice(0, 10);

  const colOptions = headerRow.map((h, i) => ({ label: `Col ${i + 1}: ${cellStr(h) || "(empty)"}`, value: i }));

  function setMapField(field: keyof ColumnMap, val: string) {
    setColMap(p => ({ ...p, [field]: val === "__unmapped__" ? null : parseInt(val) }));
  }

  const parsedItems: ParsedItem[] = useMemo(() => {
    if (colMap.description == null || colMap.unit == null) return [];
    const dCol = colMap.description, uCol = colMap.unit;
    const iCol = colMap.itemCode, sCol = colMap.snlCode, qCol = colMap.boqQty, rCol = colMap.clientRate;

    const get = (row: (string | number | null)[]) => ({
      item: iCol != null ? normCode(row[iCol]) : "",
      desc: cellStr(row[dCol]),
      unit: canonicalizeUnit(cellStr(row[uCol])) || cellStr(row[uCol]),
      spec: sCol != null ? normCode(row[sCol]) : "",
      qc: qCol != null ? row[qCol] : null,
      rc: rCol != null ? row[rCol] : null,
    });
    type Row = ReturnType<typeof get>;
    const isSkippable = (r: Row) =>
      !r.desc || isTotalRow(r.desc) || r.desc.toLowerCase() === "description" || r.item.toLowerCase() === "item";

    // The next meaningful row (null if a BILL boundary or end-of-sheet is hit first).
    // Used to decide whether a coded row is a PARENT heading (i.e. its next line is a
    // blank-coded sub-item) vs a self-contained priced leaf.
    const nextMeaningful = (start: number): Row | null => {
      for (let j = start + 1; j < dataRows.length; j++) {
        const rr = get(dataRows[j]);
        if (isBillRow(rr.item)) return null;
        if (isSkippable(rr)) continue;
        return rr;
      }
      return null;
    };

    const out: ParsedItem[] = [];
    let currentCategory = "";
    let parent: { code?: string; spec?: string; desc: string; unit: string } | null = null;
    let parentHadChild = false;
    let order = 0;

    const flushParent = () => {
      // A coded heading that turned out to have NO sub-items → keep it as its own line
      if (parent && !parentHadChild) {
        out.push({
          description: parent.desc, unit: parent.unit || "-", boqQty: 0,
          itemCode: parent.code, snlCode: parent.spec,
          categoryName: currentCategory || undefined, sortOrder: order++,
        });
      }
      parent = null; parentHadChild = false;
    };

    for (let i = 0; i < dataRows.length; i++) {
      const r = get(dataRows[i]);

      // 1) "BILL No. X" → start a new category
      if (isBillRow(r.item)) { flushParent(); if (r.desc) currentCategory = r.desc; continue; }
      // 2) Skip empty / total / echoed-header rows
      if (isSkippable(r)) continue;

      const hasCode = r.item.length > 0;
      const hasUnit = r.unit.length > 0;
      const nxt = nextMeaningful(i);
      const isParentHeading = hasCode && nxt != null && nxt.item === ""; // next line is a sub-item

      // 3) Parent heading → store context, do not import the heading itself yet
      if (isParentHeading) {
        flushParent();
        parent = { code: r.item, spec: r.spec || undefined, desc: r.desc, unit: r.unit };
        parentHadChild = false;
        continue;
      }

      // 4) Self-contained priced leaf (own code, no sub-items follow)
      if (hasCode) {
        flushParent();
        out.push({
          description: r.desc, unit: r.unit || "-", boqQty: toNum(r.qc),
          itemCode: r.item, snlCode: r.spec || undefined,
          clientRate: cellStr(r.rc) !== "" ? toNum(r.rc) || undefined : undefined,
          categoryName: currentCategory || undefined, sortOrder: order++,
        });
        continue;
      }

      // 5) Blank code → sub-item of the current parent (skip strays with no unit & no parent)
      if (!hasUnit && !parent) continue;
      out.push({
        description: parent?.desc ? `${parent.desc} — ${r.desc}` : r.desc,
        unit: r.unit || "-", boqQty: toNum(r.qc),
        itemCode: parent?.code, snlCode: r.spec || parent?.spec || undefined,
        clientRate: cellStr(r.rc) !== "" ? toNum(r.rc) || undefined : undefined,
        categoryName: currentCategory || undefined, sortOrder: order++,
      });
      parentHadChild = true;
    }
    flushParent();
    return out;
  }, [dataRows, colMap]);

  function enterStep2() {
    const cats = parsedItems.map(item => suggestWorkCategory(item.itemCode) ?? "");
    setItemWorkCats(cats);
    setBulkCat("");
    setSelectedRows(new Set());
    setStep(2);
  }

  function applyBulkCat() {
    if (!bulkCat) return;
    setItemWorkCats(prev => prev.map(c => c === "" ? bulkCat : c));
  }

  function applyBulkCatAll() {
    if (!bulkCat) return;
    setItemWorkCats(prev => prev.map(() => bulkCat));
  }

  function applyBulkCatSelected() {
    if (!bulkCat || selectedRows.size === 0) return;
    setItemWorkCats(prev => prev.map((c, i) => selectedRows.has(i) ? bulkCat : c));
    setSelectedRows(new Set());
  }

  function toggleRow(idx: number) {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function toggleAllRows() {
    setSelectedRows(prev =>
      prev.size === parsedItems.length ? new Set() : new Set(parsedItems.map((_, i) => i))
    );
  }

  const canProceedStep1 = colMap.description != null && colMap.unit != null && colMap.boqQty != null;
  const zeroQtyCount = parsedItems.filter(it => (it.boqQty ?? 0) <= 0).length;
  const importCount = skipZeroQty ? parsedItems.length - zeroQtyCount : parsedItems.length;
  // Rows that will be skipped don't need a category, so they don't block the gate.
  const unassignedCount = itemWorkCats.filter((c, i) => c === "" && !(skipZeroQty && (parsedItems[i]?.boqQty ?? 0) <= 0)).length;
  const canProceedStep2 = unassignedCount === 0;

  const mappedColIndices = Object.values(colMap).filter((v): v is number => typeof v === "number");

  function buildFinalItems() {
    return parsedItems
      .map((item, idx) => ({
        ...item,
        workCategory: itemWorkCats[idx] || undefined,
      }))
      .filter(item => !(skipZeroQty && (item.boqQty ?? 0) <= 0));
  }

  const finalItems = step >= 3 ? buildFinalItems() : [];
  const workCatSet = new Set(itemWorkCats.filter(Boolean));

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
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-colors flex-shrink-0 ${
                step > i ? "bg-emerald-500 text-white" :
                step === i ? "bg-blue-600 text-white" :
                "bg-slate-200 text-slate-500"
              }`}>
                {step > i ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-sm font-medium ${step === i ? "text-blue-700" : "text-muted-foreground"}`}>{label}</span>
              {i < STEPS.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
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
              <p className="text-sm text-muted-foreground mt-1">or click to browse — .xlsx or .xls</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={handleFileChange} data-testid="input-file-excel" />
            </div>
            {parseError && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {parseError}
              </div>
            )}
            {rawRows.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-1.5">
                  PREVIEW — {fileName} ({dataRows.length} data rows)
                </p>
                <div className="overflow-x-auto rounded-lg border text-sm">
                  <table className="min-w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        {headerRow.map((h, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-medium text-slate-500 whitespace-nowrap border-b">
                            {cellStr(h) || `Col ${i + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri} className="border-b last:border-0">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-2 py-1 whitespace-nowrap max-w-[160px] truncate text-slate-600">
                              {cellStr(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Expected columns: Item Code, Description, Unit, BOQ Qty, Client Rate. The wizard will help you map them.
            </p>
          </div>
        )}

        {/* ── Step 1: Map Columns ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground bg-slate-50 rounded-lg p-3 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span>Loaded <strong>{dataRows.length} data rows</strong> from <strong>{fileName}</strong>. Map each field to its Excel column below.</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {([
                { field: "description", label: "Description", required: true },
                { field: "unit", label: "Unit", required: true },
                { field: "boqQty", label: "BOQ Quantity", required: true },
                { field: "snlCode", label: "SNL / SDB Code", required: false },
                { field: "itemCode", label: "Item Code", required: false },
                { field: "clientRate", label: "Client Rate (₹)", required: false },
              ] as { field: keyof ColumnMap; label: string; required: boolean }[]).map(({ field, label, required }) => (
                <div key={field}>
                  <Label className="text-sm">{label.toUpperCase()} {required && <span className="text-red-500">*</span>}</Label>
                  <Select
                    value={colMap[field] != null ? String(colMap[field]) : "__unmapped__"}
                    onValueChange={v => setMapField(field, v)}
                  >
                    <SelectTrigger data-testid={`select-col-${field}`}>
                      <SelectValue placeholder="— Not mapped —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unmapped__">— Not mapped —</SelectItem>
                      {colOptions.map(o => (
                        <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-1.5">DATA PREVIEW (first 10 rows)</p>
              <div className="overflow-x-auto rounded-lg border text-sm">
                <table className="min-w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      {headerRow.map((h, i) => (
                        <th key={i} className={`px-2 py-1.5 text-left font-medium whitespace-nowrap border-b ${
                          mappedColIndices.includes(i)
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
                            mappedColIndices.includes(ci) ? "bg-blue-50/50 text-blue-800 font-medium" : "text-slate-600"
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
              <p className="text-sm text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Map Description, Unit, and BOQ Qty to proceed.
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: Work Category Assignment ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground bg-slate-50 rounded-lg p-3 flex items-start gap-2">
              <Tags className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <span>
                Assign each item to a standard MoRTH/NHAI work category. Items with standard item codes (like 3.xx, 5.xx) are auto-suggested.
                All items must have a category before you can proceed.
              </span>
            </div>

            {/* Bulk assign */}
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <span className="text-sm font-medium text-amber-800 flex-shrink-0">
                Bulk assign:
              </span>
              <Select value={bulkCat} onValueChange={setBulkCat}>
                <SelectTrigger className="h-7 text-sm flex-1" data-testid="select-bulk-category">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  {BOQ_WORK_CATEGORIES.map(cat => (
                    <SelectItem key={cat.code} value={cat.code} className="text-sm">{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-sm border-amber-300 text-amber-800 hover:bg-amber-100 flex-shrink-0"
                onClick={applyBulkCat}
                disabled={!bulkCat}
                data-testid="button-bulk-assign-unassigned"
              >
                Set unassigned ({unassignedCount})
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-sm border-amber-300 text-amber-800 hover:bg-amber-100 flex-shrink-0"
                onClick={applyBulkCatAll}
                disabled={!bulkCat}
                data-testid="button-bulk-assign-all"
              >
                Set all
              </Button>
              <Button
                size="sm"
                className="h-7 text-sm bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
                onClick={applyBulkCatSelected}
                disabled={!bulkCat || selectedRows.size === 0}
                data-testid="button-bulk-assign-selected"
              >
                Assign to selected ({selectedRows.size})
              </Button>
            </div>

            {/* Per-item table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-center w-9">
                        <input
                          type="checkbox"
                          className="accent-amber-500 cursor-pointer"
                          checked={parsedItems.length > 0 && selectedRows.size === parsedItems.length}
                          ref={el => { if (el) el.indeterminate = selectedRows.size > 0 && selectedRows.size < parsedItems.length; }}
                          onChange={toggleAllRows}
                          data-testid="checkbox-select-all-rows"
                          title="Select all"
                        />
                      </th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-300 w-14">Code</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-300">Description</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-300 w-12">Unit</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-300 w-16">Qty</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-300 w-48">Work Category <span className="text-red-400">*</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, idx) => {
                      const cat = itemWorkCats[idx] ?? "";
                      const isUnassigned = cat === "";
                      return (
                        <tr
                          key={idx}
                          className={`border-b border-slate-100 last:border-0 ${selectedRows.has(idx) ? "bg-amber-50" : isUnassigned ? "bg-red-50/40" : idx % 2 === 1 ? "bg-slate-50/40" : ""}`}
                          data-testid={`row-cat-assign-${idx}`}
                        >
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              className="accent-amber-500 cursor-pointer"
                              checked={selectedRows.has(idx)}
                              onChange={() => toggleRow(idx)}
                              data-testid={`checkbox-row-${idx}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 font-mono text-slate-500 whitespace-nowrap">
                            {item.itemCode ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-slate-700 max-w-[200px]">
                            <span className="line-clamp-2">{item.description}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-500">{item.unit}</td>
                          <td className="px-2 py-1.5 text-right text-slate-600 font-medium">
                            {item.boqQty.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-1.5 py-1">
                            <Select
                              value={cat || "__none__"}
                              onValueChange={v => {
                                const next = [...itemWorkCats];
                                next[idx] = v === "__none__" ? "" : v;
                                setItemWorkCats(next);
                              }}
                            >
                              <SelectTrigger
                                className={`h-7 text-sm ${isUnassigned ? "border-red-300 text-red-600" : "border-slate-200"}`}
                                data-testid={`select-item-cat-${idx}`}
                              >
                                <SelectValue placeholder="— Select —" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__" className="text-sm text-muted-foreground">— Select category —</SelectItem>
                                {BOQ_WORK_CATEGORIES.map(cat => (
                                  <SelectItem key={cat.code} value={cat.code} className="text-sm">{cat.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {unassignedCount > 0 && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {unassignedCount} item{unassignedCount !== 1 ? "s" : ""} still need a work category assigned before you can continue.
              </p>
            )}
          </div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Existing items warning + mode selector */}
            {existingItemCount > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  This project already has {existingItemCount} BOQ item{existingItemCount !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-amber-700">Choose how to handle the existing items:</p>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="append"
                      checked={importMode === "append"}
                      onChange={() => setImportMode("append")}
                      className="accent-amber-600"
                      data-testid="radio-import-append"
                    />
                    <span className="text-sm font-medium text-amber-900">
                      Add to existing — keeps current {existingItemCount} items and appends new ones
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === "replace"}
                      onChange={() => setImportMode("replace")}
                      className="accent-red-600"
                      data-testid="radio-import-replace"
                    />
                    <span className="text-sm font-medium text-red-800">
                      Replace all — deletes all {existingItemCount} existing items and their Gantt bars, then imports fresh
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-emerald-800">Ready to import</p>
              <label className="flex items-center gap-2 cursor-pointer bg-white border border-emerald-100 rounded-lg px-3 py-2">
                <input
                  type="checkbox"
                  className="accent-emerald-600"
                  checked={skipZeroQty}
                  onChange={e => setSkipZeroQty(e.target.checked)}
                  data-testid="checkbox-skip-zero-qty"
                />
                <span className="text-sm text-emerald-900">
                  Skip rows with zero quantity
                  {zeroQtyCount > 0 && (
                    <span className="ml-1 font-semibold text-amber-700">
                      ({zeroQtyCount} row{zeroQtyCount !== 1 ? "s" : ""} {skipZeroQty ? "will be skipped" : "found"})
                    </span>
                  )}
                </span>
              </label>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-3 border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-700">{importCount}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">BOQ Items</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-700">{workCatSet.size}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Work Categories</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-700">
                    {parsedItems.filter(i => i.clientRate).length}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">Items with Rate</p>
                </div>
              </div>
              {workCatSet.size > 0 && (
                <div>
                  <p className="text-sm text-emerald-700 font-medium mb-1">Work categories in this import:</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(workCatSet).map(code => (
                      <Badge key={code} variant="outline" className="text-sm bg-white border-emerald-200 text-emerald-700">
                        {getWorkCategoryLabel(code)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-1.5">FIRST 5 ITEMS TO IMPORT</p>
              <div className="space-y-1.5">
                {parsedItems.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm bg-slate-50 rounded-lg px-3 py-2">
                    {item.itemCode && <span className="font-mono text-slate-500 w-16 flex-shrink-0 truncate">{item.itemCode}</span>}
                    <span className="flex-1 truncate font-medium">{item.description}</span>
                    <span className="text-slate-500 flex-shrink-0">{item.boqQty} {item.unit}</span>
                    {item.clientRate && <span className="text-slate-500 flex-shrink-0">₹{item.clientRate}</span>}
                    {itemWorkCats[i] && (
                      <Badge variant="outline" className="text-[12px] flex-shrink-0 border-blue-200 text-blue-700">
                        {getWorkCategoryLabel(itemWorkCats[i])}
                      </Badge>
                    )}
                  </div>
                ))}
                {parsedItems.length > 5 && (
                  <p className="text-sm text-center text-muted-foreground">…and {parsedItems.length - 5} more items</p>
                )}
              </div>
            </div>

            {parsedItems.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                No valid rows found. Go back and verify the column mapping.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center gap-2 pt-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-import">
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>

          {/* Back buttons */}
          {step === 1 && (
            <Button variant="outline" onClick={() => setStep(0)} data-testid="button-import-back-1">
              ← Back
            </Button>
          )}
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)} data-testid="button-import-back-2">
              ← Back
            </Button>
          )}
          {step === 3 && (
            <Button variant="outline" onClick={() => setStep(2)} data-testid="button-import-back-3">
              ← Back
            </Button>
          )}

          {/* Next / Confirm buttons */}
          {step === 0 && rawRows.length > 0 && (
            <Button onClick={() => setStep(1)} className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-import-next-1">
              Next: Map Columns <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === 1 && (
            <Button onClick={enterStep2} disabled={!canProceedStep1}
              className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-import-next-2">
              Next: Work Categories <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)} disabled={!canProceedStep2}
              className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-import-next-3">
              Next: Review <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === 3 && (
            <Button
              onClick={() => importMutation.mutate({ items: buildFinalItems(), mode: importMode })}
              disabled={importMutation.isPending || importCount === 0}
              className={importMode === "replace" && existingItemCount > 0
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"}
              data-testid="button-import-confirm"
            >
              {importMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Importing…</>
                : importMode === "replace" && existingItemCount > 0
                  ? <><Trash2 className="w-4 h-4 mr-1" /> Replace &amp; Import {importCount} Items</>
                  : <><Check className="w-4 h-4 mr-1" /> Import {importCount} Items</>
              }
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
