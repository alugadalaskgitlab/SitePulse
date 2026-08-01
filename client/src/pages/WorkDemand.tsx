import { useMemo, useState, Fragment, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import {
  ChevronRight, FileSpreadsheet, BookOpen, Loader2,
  Package, Wrench, Users, CalendarDays, ChevronDown, ChevronUp, Zap, PencilLine,
  LayoutList, ShoppingCart, AlertTriangle, CheckCircle2, Info, Settings2, GitCompareArrows,
  MapPin, SplitSquareHorizontal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  calculateBomDemand,
  monthLabel,
  fmtQty,
  derivePlanningMode,
  type BomDemand,
  type BomInputItem,
  type BomInputBar,
  type EffectivePlanningMode,
} from "@shared/planningEngine";
import { shortItemName } from "@/lib/itemName";
import { PlanVsActualTable } from "@/components/PlanVsActualTable";
import type { BoqProject } from "@shared/schema";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-teal-600" />
      <h2 className="text-sm font-bold text-slate-700">{title}</h2>
      {badge != null && (
        <Badge variant="outline" className="text-[12px] text-teal-700 border-teal-200 bg-teal-50">
          {badge} items
        </Badge>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-10 text-center text-muted-foreground text-sm">
      {label}
    </div>
  );
}

// ─── Materials Demand Table ─────────────────────────────────────────────────────

function MaterialsTable({
  demand,
  project,
  structureItemDescriptions,
}: {
  demand: BomDemand;
  project: BoqProject;
  structureItemDescriptions: Set<string>;
}) {
  const mats = demand.materials;
  const [expandedMat, setExpandedMat] = useState<Set<string>>(() => new Set());

  if (!mats.length) return <EmptyState label="No material demand calculated. Configure material recipes on BOQ items first." />;

  const allMonths = useMemo(() => {
    const ms = new Set<number>();
    for (const row of mats) for (const m of Object.keys(row.monthlyQty)) ms.add(Number(m));
    return [...ms].sort((a, b) => a - b);
  }, [mats]);

  const colSpan = 2 + allMonths.length + 1;

  return (
    <div className="overflow-auto rounded-xl border max-h-[70vh] [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:bg-[#0F5F64]">
      <table className="text-sm border-collapse" style={{ minWidth: 260 + allMonths.length * 72 + 100 }}>
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 top-0 z-30 min-w-[220px]" style={{ background: "#0F5F64" }}>Material</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[70px]">Unit</th>
            {allMonths.map((m) => (
              <th key={m} className="px-2 py-2 font-semibold text-white text-right whitespace-nowrap min-w-[72px]">
                {monthLabel(m, project.startDate)}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-white text-right min-w-[90px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {mats.map((row) => {
            const isExpanded = expandedMat.has(row.materialName);
            return (
              <Fragment key={row.materialName}>
                <tr
                  className={`border-b border-slate-100 cursor-pointer transition-colors ${isExpanded ? "bg-teal-50/60" : "hover:bg-slate-50"}`}
                  onClick={() => setExpandedMat(prev => {
                    const next = new Set(prev);
                    if (next.has(row.materialName)) next.delete(row.materialName); else next.add(row.materialName);
                    return next;
                  })}
                  data-testid={`mat-row-${row.materialName}`}
                >
                  <td className={`px-3 py-2 sticky left-0 z-10 ${isExpanded ? "bg-teal-50" : "bg-white"}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isExpanded
                        ? <ChevronUp className="w-3 h-3 text-teal-500 flex-shrink-0" />
                        : <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      }
                      <span className="font-medium text-slate-700">{row.materialName}</span>
                      {structureItemDescriptions.size > 0 && row.breakdown.length > 0 && row.breakdown.every(b => structureItemDescriptions.has(b.itemDescription)) && (
                        <span className="inline-flex items-center rounded px-1 py-0.5 text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 flex-shrink-0" title="All demand from structure/point-location items — not linearly distributed along the road">
                          Structure
                        </span>
                      )}
                      {row.supplyType === "direct" && (
                        <span className="inline-flex items-center rounded px-1 py-0.5 text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 flex-shrink-0" title="Supplied directly from quarry/crusher to site">
                          Direct Supply
                        </span>
                      )}
                      {row.supplyType === "plant" && (
                        <span className="inline-flex items-center rounded px-1 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0" title="Produced at HMP / RMC plant">
                          Plant Mix
                        </span>
                      )}
                      {row.hasAutoSource ? (
                        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-semibold bg-teal-100 text-teal-700 border border-teal-200 flex-shrink-0">
                          <Zap className="w-2.5 h-2.5" />Auto
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200 flex-shrink-0">
                          <PencilLine className="w-2.5 h-2.5" />Manual
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground">{row.uom}</td>
                  {allMonths.map((m) => {
                    const val = row.monthlyQty[m] ?? 0;
                    return (
                      <td
                        key={m}
                        className={`px-2 py-2 text-right font-mono ${val > 0 ? "text-teal-700 font-semibold bg-teal-50/50" : "text-slate-300"}`}
                      >
                        {val > 0 ? fmtQty(val, 1) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold font-mono text-teal-800">
                    {fmtQty(row.totalQty, 1)}
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${row.materialName}__drill`} className="bg-teal-50/40">
                    <td colSpan={colSpan} className="px-4 py-2">
                      <div className="rounded-lg border border-teal-100 bg-white overflow-hidden divide-y divide-slate-50">
                        {row.breakdown.map((b, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-teal-50/30 text-xs">
                            <span className="flex-1 min-w-0 truncate text-slate-700" title={b.fullDescription ?? b.itemDescription}>
                              {b.itemCode && <span className="font-mono text-[11px] text-slate-400 mr-1">[{b.itemCode}]</span>}
                              {shortItemName(b.fullDescription ?? b.itemDescription)}
                              {b.compositeLabel && (
                                <span className="ml-1 inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200" title="Composite bituminous item — demand split across sub-layers">
                                  {b.compositeLabel}
                                </span>
                              )}
                            </span>
                            <span className="font-mono whitespace-nowrap text-[11px] flex-shrink-0">
                              <span className="text-slate-500">{fmtQty(b.qtyPerUnit, 4)}</span>
                              <span className="text-slate-400 mx-1">×</span>
                              <span className="text-slate-600">{fmtQty(b.workQty, 2)}</span>
                              <span className="text-slate-400 mx-1">=</span>
                              <span className="font-semibold text-teal-700">{fmtQty(b.lineQty, 1)} {row.uom}</span>
                            </span>
                            <span className="flex-shrink-0">
                              {b.isAuto ? (
                                <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold bg-teal-100 text-teal-700">
                                  <Zap className="w-2 h-2" />Auto
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500">
                                  <PencilLine className="w-2 h-2" />Manual
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Equipment Demand Table ─────────────────────────────────────────────────────

function EquipmentTable({
  demand,
  project,
}: {
  demand: BomDemand;
  project: BoqProject;
}) {
  const equip = demand.equipment;
  const [expandedEq, setExpandedEq] = useState<Set<string>>(() => new Set());

  if (!equip.length) return <EmptyState label="No equipment demand. Configure equipment recipes on BOQ items first." />;

  const allMonths = useMemo(() => {
    const ms = new Set<number>();
    for (const row of equip) for (const m of Object.keys(row.monthlyHours)) ms.add(Number(m));
    return [...ms].sort((a, b) => a - b);
  }, [equip]);

  const colSpan = 2 + allMonths.length + 1;

  return (
    <div className="overflow-auto rounded-xl border max-h-[70vh] [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:bg-[#0F5F64]">
      <table className="text-sm border-collapse" style={{ minWidth: 260 + allMonths.length * 72 + 110 }}>
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 top-0 z-30 min-w-[220px]" style={{ background: "#0F5F64" }}>Equipment</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[50px]">Unit</th>
            {allMonths.map((m) => (
              <th key={m} className="px-2 py-2 font-semibold text-white text-right whitespace-nowrap min-w-[72px]">
                {monthLabel(m, project.startDate)}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-white text-right min-w-[110px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {equip.map((row) => {
            const isExpanded = expandedEq.has(row.equipmentName);
            return (
              <Fragment key={row.equipmentName}>
                <tr
                  className={`border-b border-slate-100 cursor-pointer transition-colors ${isExpanded ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
                  onClick={() => setExpandedEq(prev => {
                    const next = new Set(prev);
                    if (next.has(row.equipmentName)) next.delete(row.equipmentName); else next.add(row.equipmentName);
                    return next;
                  })}
                  data-testid={`eq-row-${row.equipmentName}`}
                >
                  <td className={`px-3 py-2 sticky left-0 z-10 ${isExpanded ? "bg-blue-50" : "bg-white"}`}>
                    <div className="flex items-center gap-1.5">
                      {isExpanded
                        ? <ChevronUp className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        : <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      }
                      <span className="font-medium text-slate-700">{row.equipmentName}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground">hr</td>
                  {allMonths.map((m) => {
                    const val = row.monthlyHours[m] ?? 0;
                    return (
                      <td
                        key={m}
                        className={`px-2 py-2 text-right font-mono ${val > 0 ? "text-blue-700 font-semibold bg-blue-50/50" : "text-slate-300"}`}
                      >
                        {val > 0 ? fmtQty(val, 1) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold font-mono text-blue-800">
                    {fmtQty(row.totalHours, 1)} hr
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${row.equipmentName}__drill`} className="bg-blue-50/40">
                    <td colSpan={colSpan} className="px-4 py-2">
                      <div className="rounded-lg border border-blue-100 bg-white overflow-hidden">
                        <table className="text-xs w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="text-left px-3 py-1.5 font-semibold text-slate-500 w-[40%]">Source Item</th>
                              <th className="px-3 py-1.5 font-semibold text-slate-500 text-right">Formula (hr/unit × qty = total hrs)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.breakdown.map((b, i) => (
                              <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-blue-50/30">
                                <td className="px-3 py-1.5 text-slate-700 max-w-[320px]" title={b.fullDescription ?? b.itemDescription}>
                                  {b.itemCode && <span className="font-mono text-[11px] text-slate-400 mr-1.5">[{b.itemCode}]</span>}
                                  {shortItemName(b.fullDescription ?? b.itemDescription)}
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">
                                  <span className="text-slate-500">{fmtQty(b.hrsPerUnit, 4)}</span>
                                  <span className="text-slate-400 mx-1">×</span>
                                  <span className="text-slate-600">{fmtQty(b.workQty, 2)}</span>
                                  <span className="text-slate-400 mx-1">=</span>
                                  <span className="font-semibold text-blue-700">{fmtQty(b.lineHours, 1)} hr</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Labour Demand Table ────────────────────────────────────────────────────────

function LabourTable({
  demand,
  project,
}: {
  demand: BomDemand;
  project: BoqProject;
}) {
  const lab = demand.labour;
  const [expandedLab, setExpandedLab] = useState<Set<string>>(() => new Set());

  if (!lab.length) return <EmptyState label="No labour demand. Configure labour recipes on BOQ items first." />;

  const allMonths = useMemo(() => {
    const ms = new Set<number>();
    for (const row of lab) for (const m of Object.keys(row.monthlyDays)) ms.add(Number(m));
    return [...ms].sort((a, b) => a - b);
  }, [lab]);

  const colSpan = 2 + allMonths.length + 1;

  return (
    <div className="overflow-auto rounded-xl border max-h-[70vh] [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:bg-[#0F5F64]">
      <table className="text-sm border-collapse" style={{ minWidth: 260 + allMonths.length * 72 + 110 }}>
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 top-0 z-30 min-w-[220px]" style={{ background: "#0F5F64" }}>Labour Category</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[50px]">Unit</th>
            {allMonths.map((m) => (
              <th key={m} className="px-2 py-2 font-semibold text-white text-right whitespace-nowrap min-w-[72px]">
                {monthLabel(m, project.startDate)}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-white text-right min-w-[110px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {lab.map((row) => {
            const isExpanded = expandedLab.has(row.designation);
            return (
              <Fragment key={row.designation}>
                <tr
                  className={`border-b border-slate-100 cursor-pointer transition-colors ${isExpanded ? "bg-purple-50/60" : "hover:bg-slate-50"}`}
                  onClick={() => setExpandedLab(prev => {
                    const next = new Set(prev);
                    if (next.has(row.designation)) next.delete(row.designation); else next.add(row.designation);
                    return next;
                  })}
                  data-testid={`lab-row-${row.designation}`}
                >
                  <td className={`px-3 py-2 sticky left-0 z-10 ${isExpanded ? "bg-purple-50" : "bg-white"}`}>
                    <div className="flex items-center gap-1.5">
                      {isExpanded
                        ? <ChevronUp className="w-3 h-3 text-purple-500 flex-shrink-0" />
                        : <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      }
                      <span className="font-medium text-slate-700">{row.designation}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground">day</td>
                  {allMonths.map((m) => {
                    const val = row.monthlyDays[m] ?? 0;
                    return (
                      <td
                        key={m}
                        className={`px-2 py-2 text-right font-mono ${val > 0 ? "text-purple-700 font-semibold bg-purple-50/50" : "text-slate-300"}`}
                      >
                        {val > 0 ? fmtQty(val, 1) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold font-mono text-purple-800">
                    {fmtQty(row.totalDays, 1)} day
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${row.designation}__drill`} className="bg-purple-50/40">
                    <td colSpan={colSpan} className="px-4 py-2">
                      <div className="rounded-lg border border-purple-100 bg-white overflow-hidden divide-y divide-slate-50">
                        {row.breakdown.map((b, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-purple-50/30 text-xs">
                            <span className="flex-1 min-w-0 truncate text-slate-700" title={b.fullDescription ?? b.itemDescription}>
                              {b.itemCode && <span className="font-mono text-[11px] text-slate-400 mr-1">[{b.itemCode}]</span>}
                              {shortItemName(b.fullDescription ?? b.itemDescription)}
                            </span>
                            <span className="font-mono whitespace-nowrap text-[11px] flex-shrink-0">
                              <span className="text-slate-500">{fmtQty(b.daysPerUnit, 4)}</span>
                              <span className="text-slate-400 mx-1">×</span>
                              <span className="text-slate-600">{fmtQty(b.workQty, 2)}</span>
                              <span className="text-slate-400 mx-1">=</span>
                              <span className="font-semibold text-purple-700">{fmtQty(b.lineDays, 1)} day</span>
                            </span>
                            <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500 flex-shrink-0">
                              SDB
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Item-Wise Table ────────────────────────────────────────────────────────────

interface ItemDemandRow {
  description: string;
  itemCode?: string | null;
  unit: string;
  workQty: number;
  isProgrammed: boolean;
  compositeLabel?: string;
  materials: Array<{ name: string; uom: string; qty: number; qtyPerUnit: number }>;
  equipment: Array<{ name: string; hours: number; hrsPerUnit: number }>;
  labour: Array<{ name: string; days: number; daysPerUnit: number }>;
}

function computeItemDemand(demand: BomDemand, unprogrammedDescriptions: Set<string>): ItemDemandRow[] {
  const map = new Map<string, ItemDemandRow>();
  // Key by itemCode + description so items from different bills with the same short name
  // stay as separate rows (e.g. Bill-4 DBM "4.03" vs Bill-10 DBM "10.09").
  const rowKey = (bd: { itemCode?: string | null; itemDescription: string }) =>
    (bd.itemCode ?? "") + "|" + bd.itemDescription;
  const get = (bd: { itemCode?: string | null; itemDescription: string; unit?: string; compositeLabel?: string }): ItemDemandRow => {
    const key = rowKey(bd);
    if (!map.has(key)) {
      map.set(key, {
        description: bd.itemDescription,
        itemCode: bd.itemCode ?? null,
        unit: bd.unit ?? "",
        workQty: 0,
        isProgrammed: !unprogrammedDescriptions.has(bd.itemDescription),
        compositeLabel: bd.compositeLabel,
        materials: [],
        equipment: [],
        labour: [],
      });
    }
    return map.get(key)!;
  };
  for (const mat of demand.materials) {
    for (const bd of mat.breakdown) {
      const row = get(bd);
      row.workQty = Math.max(row.workQty, bd.workQty);
      if (bd.unit && !row.unit) row.unit = bd.unit;
      if (bd.compositeLabel && !row.compositeLabel) row.compositeLabel = bd.compositeLabel;
      const ex = row.materials.find(m => m.name === mat.materialName);
      if (ex) { ex.qty += bd.lineQty; }
      else row.materials.push({ name: mat.materialName, uom: mat.uom, qty: bd.lineQty, qtyPerUnit: bd.qtyPerUnit });
    }
  }
  for (const eq of demand.equipment) {
    for (const bd of eq.breakdown) {
      const row = get(bd);
      if (bd.unit && !row.unit) row.unit = bd.unit;
      const ex = row.equipment.find(e => e.name === eq.equipmentName);
      if (ex) { ex.hours += bd.lineHours; }
      else row.equipment.push({ name: eq.equipmentName, hours: bd.lineHours, hrsPerUnit: bd.hrsPerUnit });
    }
  }
  for (const lb of demand.labour) {
    for (const bd of lb.breakdown) {
      const row = get(bd);
      if (bd.unit && !row.unit) row.unit = bd.unit;
      const ex = row.labour.find(l => l.name === lb.designation);
      if (ex) { ex.days += bd.lineDays; }
      else row.labour.push({ name: lb.designation, days: bd.lineDays, daysPerUnit: bd.daysPerUnit });
    }
  }
  // Sort rows: programmed first, then by item code (numeric bill.item order)
  return [...map.values()].sort((a, b) => {
    const aCode = a.itemCode ?? "";
    const bCode = b.itemCode ?? "";
    if (!aCode && !bCode) return 0;
    if (!aCode) return 1;
    if (!bCode) return -1;
    const [aBill, aItem] = aCode.split(".").map(Number);
    const [bBill, bItem] = bCode.split(".").map(Number);
    if (aBill !== bBill) return aBill - bBill;
    return (aItem ?? 0) - (bItem ?? 0);
  });
}

// ─── Plan vs Actual Table ───────────────────────────────────────────────────

interface ProgrammeBarLite {
  id: number;
  boqItemId: number;
  planningMode: string | null;
  structureId: string | null;
  structureLocType: string | null;
  source?: string | null;
  reachLabel?: string | null;
}

interface DprLogsLite {
  boqProjectId: number | null;
  equipment: Array<{ boqItemId: number | null; structureId: string | null; machine: string; openingReading: number | null; closingReading: number | null; startTime: string | null; endTime: string | null; totalKm: number | null }>;
  labour: Array<{ boqItemId: number | null; structureId: string | null; category: string; count: number }>;
  materials: Array<{ boqItemId: number | null; structureId: string | null; material: string; quantity: number | null; uom: string | null }>;
}

interface PlanVsActualRowLite {
  boqItemId: number;
  totalActual: number;
}

function actualEquipmentHours(log: DprLogsLite["equipment"][number]): number {
  if (log.openingReading != null && log.closingReading != null) {
    const d = log.closingReading - log.openingReading;
    if (d > 0) return d;
  }
  if (log.startTime && log.endTime) {
    const [sh, sm] = log.startTime.split(":").map(Number);
    const [eh, em] = log.endTime.split(":").map(Number);
    if (![sh, sm, eh, em].some(Number.isNaN)) {
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff > 0) return diff / 60;
    }
  }
  return 0;
}

interface StructureBreakdownEntry {
  structureId: string;
  label: string;
  actualEquipHours: number;
  actualEquipKm: number;
  actualLabourDays: number;
  materials: Map<string, { actual: number; uom: string }>;
}

interface PlanVsActualItemRow {
  boqItemId: number;
  itemCode: string | null;
  description: string;
  unit: string;
  plannedEquipHours: number;
  actualEquipHours: number;
  actualEquipKm: number;
  equipBreakdown: Map<string, { planned: number; actual: number; actualKm: number }>;
  plannedLabourDays: number;
  actualLabourDays: number;
  labourBreakdown: Map<string, { planned: number; actual: number }>;
  materialBreakdown: Map<string, { planned: number; actual: number; uom: string }>;
  structureBreakdown: Map<string, StructureBreakdownEntry>;
  actualQtyCompleted: number;
  productivityPerEquipHour: number | null;
  productivityPerLabourDay: number | null;
}

function computePlanVsActual(
  items: BomInputItem[],
  bars: BomInputBar[],
  totalMonths: number,
  dprs: DprLogsLite[],
  projectId: number,
  programmeBars: ProgrammeBarLite[],
  actualQtyByItem: Map<number, number>
): PlanVsActualItemRow[] {
  const rows: PlanVsActualItemRow[] = [];
  const relevantDprs = dprs.filter((d) => d.boqProjectId === projectId);

  const structureLabel = (boqItemId: number, structureId: string | null): { key: string; label: string } => {
    if (!structureId) return { key: "__unlinked__", label: "Not linked to a structure/reach" };
    const bar = programmeBars.find((b) => b.boqItemId === boqItemId && b.structureId === structureId);
    return { key: structureId, label: bar?.structureLocType ? `${structureId} (${bar.structureLocType})` : structureId };
  };

  for (const item of items) {
    const itemBars = bars.filter((b) => b.boqItemId === item.id);
    const planned = calculateBomDemand([item], itemBars, totalMonths);
    const hasPlannedEquip = planned.equipment.length > 0;
    const hasPlannedLabour = planned.labour.length > 0;
    const hasPlannedMaterial = planned.materials.length > 0;

    const equipBreakdown = new Map<string, { planned: number; actual: number; actualKm: number }>();
    for (const e of planned.equipment) equipBreakdown.set(e.equipmentName, { planned: e.totalHours, actual: 0, actualKm: 0 });
    const labourBreakdown = new Map<string, { planned: number; actual: number }>();
    for (const l of planned.labour) labourBreakdown.set(l.designation, { planned: l.totalDays, actual: 0 });
    const materialBreakdown = new Map<string, { planned: number; actual: number; uom: string }>();
    for (const m of planned.materials) materialBreakdown.set(m.materialName.toUpperCase().trim(), { planned: m.totalQty, actual: 0, uom: m.uom });

    const structureBreakdown = new Map<string, StructureBreakdownEntry>();
    const getStructureEntry = (structureId: string | null) => {
      const { key, label } = structureLabel(item.id, structureId);
      let entry = structureBreakdown.get(key);
      if (!entry) {
        entry = { structureId: key, label, actualEquipHours: 0, actualEquipKm: 0, actualLabourDays: 0, materials: new Map() };
        structureBreakdown.set(key, entry);
      }
      return entry;
    };

    let actualEquipHours = 0;
    let actualEquipKm = 0;
    let actualLabourDays = 0;
    for (const dpr of relevantDprs) {
      for (const eq of dpr.equipment) {
        if (eq.boqItemId !== item.id) continue;
        const hrs = actualEquipmentHours(eq);
        const km = eq.totalKm ?? 0;
        actualEquipHours += hrs;
        actualEquipKm += km;
        const key = eq.machine?.toUpperCase().trim() || "UNKNOWN";
        const existing = [...equipBreakdown.entries()].find(([name]) => name.toUpperCase().trim() === key);
        if (existing) { existing[1].actual += hrs; existing[1].actualKm += km; }
        else equipBreakdown.set(eq.machine || "Unknown", { planned: 0, actual: hrs, actualKm: km });
        const se = getStructureEntry(eq.structureId);
        se.actualEquipHours += hrs;
        se.actualEquipKm += km;
      }
      for (const lb of dpr.labour) {
        if (lb.boqItemId !== item.id) continue;
        actualLabourDays += lb.count;
        const key = lb.category?.toUpperCase().trim() || "UNKNOWN";
        const existing = [...labourBreakdown.entries()].find(([name]) => name.toUpperCase().trim() === key);
        if (existing) existing[1].actual += lb.count;
        else labourBreakdown.set(lb.category || "Unknown", { planned: 0, actual: lb.count });
        const se = getStructureEntry(lb.structureId);
        se.actualLabourDays += lb.count;
      }
      for (const mat of dpr.materials) {
        if (mat.boqItemId !== item.id) continue;
        const qty = mat.quantity ?? 0;
        const key = mat.material?.toUpperCase().trim() || "UNKNOWN";
        const existing = materialBreakdown.get(key);
        if (existing) existing.actual += qty;
        else materialBreakdown.set(key, { planned: 0, actual: qty, uom: mat.uom || "" });
        const se = getStructureEntry(mat.structureId);
        const smExisting = se.materials.get(key);
        if (smExisting) smExisting.actual += qty;
        else se.materials.set(key, { actual: qty, uom: mat.uom || "" });
      }
    }

    if (!hasPlannedEquip && !hasPlannedLabour && !hasPlannedMaterial && actualEquipHours === 0 && actualLabourDays === 0 && materialBreakdown.size === 0) continue;

    const actualQtyCompleted = actualQtyByItem.get(item.id) ?? 0;

    rows.push({
      boqItemId: item.id,
      itemCode: item.itemCode ?? null,
      description: item.description,
      unit: (item as any).canonicalUnit ?? item.unit,
      plannedEquipHours: planned.equipment.reduce((s, e) => s + e.totalHours, 0),
      actualEquipHours,
      actualEquipKm,
      equipBreakdown,
      plannedLabourDays: planned.labour.reduce((s, l) => s + l.totalDays, 0),
      actualLabourDays,
      labourBreakdown,
      materialBreakdown,
      structureBreakdown,
      actualQtyCompleted,
      productivityPerEquipHour: actualEquipHours > 0 ? actualQtyCompleted / actualEquipHours : null,
      productivityPerLabourDay: actualLabourDays > 0 ? actualQtyCompleted / actualLabourDays : null,
    });
  }

  return rows.sort((a, b) => {
    const aCode = a.itemCode ?? "";
    const bCode = b.itemCode ?? "";
    if (!aCode && !bCode) return 0;
    if (!aCode) return 1;
    if (!bCode) return -1;
    return aCode.localeCompare(bCode, undefined, { numeric: true });
  });
}

function varianceBadge(planned: number, actual: number) {
  if (planned <= 0 && actual <= 0) return null;
  if (planned <= 0) return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
      Unplanned
    </span>
  );
  const pct = ((actual - planned) / planned) * 100;
  const over = pct > 5;
  const under = pct < -5;
  const color = over ? "bg-red-50 text-red-700 border-red-200" : under ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold border ${color}`}>
      {pct > 0 ? "+" : ""}{fmtQty(pct, 0)}%
    </span>
  );
}

// Task #1240: renamed from PlanVsActualTable to avoid colliding with the
// shared contractor-style PlanVsActualTable component (see
// client/src/components/PlanVsActualTable.tsx). This one is the
// deeper equipment/labour/material productivity breakdown, kept as a
// secondary section beneath the shared table on the Plan vs Actual tab.
function EquipLabourPlanVsActualTable({
  items,
  bars,
  totalMonths,
  dprs,
  projectId,
  programmeBars,
  actualQtyByItem,
}: {
  items: BomInputItem[];
  bars: BomInputBar[];
  totalMonths: number;
  dprs: DprLogsLite[];
  projectId: number;
  programmeBars: ProgrammeBarLite[];
  actualQtyByItem: Map<number, number>;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const rows = useMemo(
    () => computePlanVsActual(items, bars, totalMonths, dprs, projectId, programmeBars, actualQtyByItem),
    [items, bars, totalMonths, dprs, projectId, programmeBars, actualQtyByItem]
  );

  if (!rows.length) {
    return <EmptyState label="No planned or actual equipment/labour/material data found for this project yet." />;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-800 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          Actuals are aggregated from DPR equipment, labour and material rows explicitly linked to a work item (via the
          "Link to Work Item" selector on the DPR entry screen). Expand a row to see the structure/reach-level split and
          productivity achieved (progress qty completed per equipment hour / labour day).
        </span>
      </div>
      <div className="overflow-auto rounded-xl border max-h-[70vh] [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:bg-[#0F5F64]">
        <table className="text-sm border-collapse w-full min-w-[1080px]">
          <thead>
            <tr style={{ background: "#0F5F64" }}>
              <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 top-0 z-30 min-w-[240px]" style={{ background: "#0F5F64" }}>Item</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[100px]">Planned Equip Hrs</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[100px]">Actual Equip Hrs</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px]">Actual Km</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Variance</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[100px]">Planned Labour Days</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[100px]">Actual Labour Days</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Variance</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Materials</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[110px]">Productivity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = expanded.has(row.boqItemId);
              const materialCount = row.materialBreakdown.size;
              return (
                <Fragment key={row.boqItemId}>
                  <tr
                    className={`border-b border-slate-100 cursor-pointer transition-colors ${isExpanded ? "bg-teal-50/60" : "hover:bg-slate-50"}`}
                    onClick={() => setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.boqItemId)) next.delete(row.boqItemId); else next.add(row.boqItemId);
                      return next;
                    })}
                    data-testid={`pva-row-${row.boqItemId}`}
                  >
                    <td className={`px-3 py-2 sticky left-0 z-10 ${isExpanded ? "bg-teal-50" : "bg-white"}`}>
                      <div className="flex items-center gap-1.5">
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-teal-500 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                        {row.itemCode && <span className="font-mono text-[11px] text-slate-400">[{row.itemCode}]</span>}
                        <span className="font-medium text-slate-700 truncate">{shortItemName(row.description)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{fmtQty(row.plannedEquipHours, 1)}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold text-blue-700">{fmtQty(row.actualEquipHours, 1)}</td>
                    <td className="px-2 py-2 text-right font-mono text-slate-500">{row.actualEquipKm > 0 ? fmtQty(row.actualEquipKm, 1) : "—"}</td>
                    <td className="px-2 py-2 text-right">{varianceBadge(row.plannedEquipHours, row.actualEquipHours)}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtQty(row.plannedLabourDays, 1)}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold text-purple-700">{fmtQty(row.actualLabourDays, 1)}</td>
                    <td className="px-2 py-2 text-right">{varianceBadge(row.plannedLabourDays, row.actualLabourDays)}</td>
                    <td className="px-2 py-2 text-right">
                      {materialCount > 0 ? (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          {materialCount} tracked
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-600">
                      {row.productivityPerEquipHour != null && (
                        <div>{fmtQty(row.productivityPerEquipHour, 2)} {row.unit}/eq-hr</div>
                      )}
                      {row.productivityPerLabourDay != null && (
                        <div>{fmtQty(row.productivityPerLabourDay, 2)} {row.unit}/lab-day</div>
                      )}
                      {row.productivityPerEquipHour == null && row.productivityPerLabourDay == null && "—"}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-teal-50/30">
                      <td colSpan={10} className="px-4 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1"><Wrench className="w-3 h-3" /> Equipment (hrs / km)</p>
                            {row.equipBreakdown.size === 0 ? (
                              <p className="text-xs text-slate-400">No equipment planned or logged.</p>
                            ) : (
                              <div className="rounded-lg border border-blue-100 bg-white divide-y divide-slate-50">
                                {[...row.equipBreakdown.entries()].map(([name, v]) => (
                                  <div key={name} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                                    <span className="flex-1 min-w-0 truncate text-slate-700">{name}</span>
                                    <span className="font-mono text-slate-500">{fmtQty(v.planned, 1)} planned</span>
                                    <span className="font-mono font-semibold text-blue-700">{fmtQty(v.actual, 1)} actual</span>
                                    {v.actualKm > 0 && <span className="font-mono text-slate-400">{fmtQty(v.actualKm, 1)} km</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-purple-700 mb-1.5 flex items-center gap-1"><Users className="w-3 h-3" /> Labour (days)</p>
                            {row.labourBreakdown.size === 0 ? (
                              <p className="text-xs text-slate-400">No labour planned or logged.</p>
                            ) : (
                              <div className="rounded-lg border border-purple-100 bg-white divide-y divide-slate-50">
                                {[...row.labourBreakdown.entries()].map(([name, v]) => (
                                  <div key={name} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                                    <span className="flex-1 min-w-0 truncate text-slate-700">{name}</span>
                                    <span className="font-mono text-slate-500">{fmtQty(v.planned, 1)} planned</span>
                                    <span className="font-mono font-semibold text-purple-700">{fmtQty(v.actual, 1)} actual</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1"><Package className="w-3 h-3" /> Materials</p>
                            {row.materialBreakdown.size === 0 ? (
                              <p className="text-xs text-slate-400">No material planned or logged.</p>
                            ) : (
                              <div className="rounded-lg border border-amber-100 bg-white divide-y divide-slate-50">
                                {[...row.materialBreakdown.entries()].map(([name, v]) => (
                                  <div key={name} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                                    <span className="flex-1 min-w-0 truncate text-slate-700">{name}</span>
                                    {v.planned > 0 && <span className="font-mono text-slate-500">{fmtQty(v.planned, 1)} planned</span>}
                                    <span className="font-mono font-semibold text-amber-700">{fmtQty(v.actual, 1)} {v.uom} actual</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-teal-700 mb-1.5 flex items-center gap-1"><GitCompareArrows className="w-3 h-3" /> By Structure / Reach</p>
                          {row.structureBreakdown.size === 0 ? (
                            <p className="text-xs text-slate-400">No structure/reach-linked actuals logged.</p>
                          ) : (
                            <div className="overflow-auto rounded-lg border border-teal-100 bg-white">
                              <table className="text-xs w-full">
                                <thead>
                                  <tr className="bg-teal-50 text-teal-800">
                                    <th className="text-left px-3 py-1.5 font-semibold">Structure / Reach</th>
                                    <th className="text-right px-3 py-1.5 font-semibold">Equip Hrs</th>
                                    <th className="text-right px-3 py-1.5 font-semibold">Equip Km</th>
                                    <th className="text-right px-3 py-1.5 font-semibold">Labour Days</th>
                                    <th className="text-left px-3 py-1.5 font-semibold">Materials</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...row.structureBreakdown.values()].map((s) => (
                                    <tr key={s.structureId} className="border-t border-slate-50">
                                      <td className="px-3 py-1.5 text-slate-700">{s.label}</td>
                                      <td className="px-3 py-1.5 text-right font-mono">{s.actualEquipHours > 0 ? fmtQty(s.actualEquipHours, 1) : "—"}</td>
                                      <td className="px-3 py-1.5 text-right font-mono">{s.actualEquipKm > 0 ? fmtQty(s.actualEquipKm, 1) : "—"}</td>
                                      <td className="px-3 py-1.5 text-right font-mono">{s.actualLabourDays > 0 ? fmtQty(s.actualLabourDays, 1) : "—"}</td>
                                      <td className="px-3 py-1.5 text-slate-600">
                                        {s.materials.size === 0 ? "—" : [...s.materials.entries()].map(([name, v]) => `${name}: ${fmtQty(v.actual, 1)} ${v.uom}`).join(", ")}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Task #1240 — read-only display labels for EffectivePlanningMode. Never used
// to gate any workflow logic, purely a badge in the By Item tab.
const PLANNING_MODE_LABEL: Record<EffectivePlanningMode, string> = {
  road_reach: "Road Reach",
  structure_location: "Structure",
  imported_schedule: "Imported",
  manual_planning: "Manual",
  not_plannable_without_input: "No Bars",
};
const PLANNING_MODE_STYLE: Record<EffectivePlanningMode, string> = {
  road_reach: "bg-sky-50 text-sky-700 border-sky-200",
  structure_location: "bg-indigo-50 text-indigo-700 border-indigo-200",
  imported_schedule: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manual_planning: "bg-amber-50 text-amber-700 border-amber-200",
  not_plannable_without_input: "bg-slate-100 text-slate-500 border-slate-200",
};

function ItemWiseTable({
  demand,
  unprogrammedDescriptions,
  items = [],
  programmeBars = [],
}: {
  demand: BomDemand;
  unprogrammedDescriptions: Set<string>;
  items?: BomInputItem[];
  programmeBars?: ProgrammeBarLite[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = useMemo(() => computeItemDemand(demand, unprogrammedDescriptions), [demand, unprogrammedDescriptions]);

  // Task #1240 — surface the effective planning mode per BOQ item (how it
  // entered the work programme: road reach / structure / imported / manual).
  // Purely a display badge; does not change bar data or demand math.
  const planningModeByKey = useMemo(() => {
    const map = new Map<string, EffectivePlanningMode>();
    for (const it of items) {
      const key = (it.itemCode ?? "") + "|" + it.description;
      const itemBars = programmeBars.filter((b) => b.boqItemId === it.id);
      map.set(key, derivePlanningMode(itemBars));
    }
    return map;
  }, [items, programmeBars]);

  if (!rows.length) return <EmptyState label="No item demand. Add recipes and work programme bars first." />;

  const rowId = (row: ItemDemandRow) => (row.itemCode ?? "") + "|" + row.description;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const programmed = rows.filter(r => r.isProgrammed);
  const unprogrammed = rows.filter(r => !r.isProgrammed);

  const renderRows = (rowList: ItemDemandRow[]) => rowList.map(row => {
    const id = rowId(row);
    const open = expanded.has(id);
    const totalRes = row.materials.length + row.equipment.length + row.labour.length;
    return (
      <div key={id} className="rounded-xl border overflow-hidden">
        <div
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors ${open ? "bg-slate-100" : "bg-white hover:bg-slate-50"}`}
          onClick={() => toggle(id)}
        >
          {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-slate-700 truncate">
              {row.itemCode ? <span className="font-mono text-[12px] text-muted-foreground mr-1">[{row.itemCode}]</span> : null}
              {shortItemName(row.description)}
            </span>
            {row.compositeLabel && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0" title="Composite bituminous item — BOM split across sub-layers">
                {row.compositeLabel}
              </span>
            )}
            {(() => {
              const mode = planningModeByKey.get(id);
              if (!mode) return null;
              return (
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold border flex-shrink-0 ${PLANNING_MODE_STYLE[mode]}`}
                  title="How this item entered the work programme"
                  data-testid={`badge-planning-mode-${id}`}
                >
                  {PLANNING_MODE_LABEL[mode]}
                </span>
              );
            })()}
          </div>
          <span className="text-xs font-mono text-teal-700 bg-teal-50 border border-teal-100 rounded px-1.5 py-0.5 flex-shrink-0">
            {fmtQty(row.workQty, 1)} {row.unit || "unit"}
          </span>
          <div className="flex gap-1 flex-shrink-0">
            {row.materials.length > 0 && (
              <span className="text-[12px] font-semibold text-teal-600 bg-teal-50 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                <Package className="w-2.5 h-2.5" />{row.materials.length}
              </span>
            )}
            {row.equipment.length > 0 && (
              <span className="text-[12px] font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                <Wrench className="w-2.5 h-2.5" />{row.equipment.length}
              </span>
            )}
            {row.labour.length > 0 && (
              <span className="text-[12px] font-semibold text-purple-600 bg-purple-50 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                <Users className="w-2.5 h-2.5" />{row.labour.length}
              </span>
            )}
            {totalRes === 0 && <span className="text-[12px] text-muted-foreground">no recipes</span>}
          </div>
        </div>
        {open && (
          <div className="border-t px-3 py-2 space-y-3 bg-white">
            {row.materials.length > 0 && (
              <div>
                <p className="text-[12px] font-semibold text-teal-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <Package className="w-3 h-3" /> Materials
                </p>
                <table className="w-full text-xs">
                  <thead><tr className="text-[12px] text-muted-foreground border-b">
                    <th className="text-left py-0.5 font-medium">Material</th>
                    <th className="text-right py-0.5 font-medium">Rate/Unit</th>
                    <th className="text-right py-0.5 font-medium">Work Qty</th>
                    <th className="text-right py-0.5 font-medium">Total</th>
                    <th className="text-right py-0.5 font-medium">UOM</th>
                  </tr></thead>
                  <tbody>{row.materials.map(m => (
                    <tr key={m.name} className="border-b border-slate-50">
                      <td className="py-1 text-slate-700">{m.name}</td>
                      <td className="py-1 text-right font-mono text-slate-500 text-[12px]">{fmtQty(m.qtyPerUnit, 4)}</td>
                      <td className="py-1 text-right font-mono text-slate-500 text-[12px]">{fmtQty(row.workQty, 2)}</td>
                      <td className="py-1 text-right font-mono font-semibold text-teal-700">{fmtQty(m.qty, 2)}</td>
                      <td className="py-1 text-right text-muted-foreground">{m.uom}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {row.equipment.length > 0 && (
              <div>
                <p className="text-[12px] font-semibold text-blue-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <Wrench className="w-3 h-3" /> Equipment
                </p>
                <table className="w-full text-xs">
                  <thead><tr className="text-[12px] text-muted-foreground border-b">
                    <th className="text-left py-0.5 font-medium">Equipment</th>
                    <th className="text-right py-0.5 font-medium">hr/Unit</th>
                    <th className="text-right py-0.5 font-medium">Work Qty</th>
                    <th className="text-right py-0.5 font-medium">Total hrs</th>
                  </tr></thead>
                  <tbody>{row.equipment.map(e => (
                    <tr key={e.name} className="border-b border-slate-50">
                      <td className="py-1 text-slate-700">{e.name}</td>
                      <td className="py-1 text-right font-mono text-slate-500 text-[12px]">{fmtQty(e.hrsPerUnit, 4)}</td>
                      <td className="py-1 text-right font-mono text-slate-500 text-[12px]">{fmtQty(row.workQty, 2)}</td>
                      <td className="py-1 text-right font-mono font-semibold text-blue-700">{fmtQty(e.hours, 1)} hr</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {row.labour.length > 0 && (
              <div>
                <p className="text-[12px] font-semibold text-purple-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Labour
                </p>
                <table className="w-full text-xs">
                  <thead><tr className="text-[12px] text-muted-foreground border-b">
                    <th className="text-left py-0.5 font-medium">Category</th>
                    <th className="text-right py-0.5 font-medium">day/Unit</th>
                    <th className="text-right py-0.5 font-medium">Work Qty</th>
                    <th className="text-right py-0.5 font-medium">Total days</th>
                  </tr></thead>
                  <tbody>{row.labour.map(l => (
                    <tr key={l.name} className="border-b border-slate-50">
                      <td className="py-1 text-slate-700">{l.name}</td>
                      <td className="py-1 text-right font-mono text-slate-500 text-[12px]">{fmtQty(l.daysPerUnit, 4)}</td>
                      <td className="py-1 text-right font-mono text-slate-500 text-[12px]">{fmtQty(row.workQty, 2)}</td>
                      <td className="py-1 text-right font-mono font-semibold text-purple-700">{fmtQty(l.days, 1)} day</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="space-y-3">
      {programmed.length > 0 && (
        <div className="space-y-2">
          {renderRows(programmed)}
        </div>
      )}
      {unprogrammed.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Not programmed ({unprogrammed.length} item{unprogrammed.length > 1 ? "s" : ""}):</span>{" "}
              demand calculated from full BOQ quantity. Add work programme bars to distribute across months.
            </p>
          </div>
          {renderRows(unprogrammed)}
        </div>
      )}
    </div>
  );
}

// ─── Procurement / Shortage Table ───────────────────────────────────────────────

interface ShortageRow {
  materialName: string;
  uom: string;
  totalDemand: number;
  demandUpToSelectedDate: number;
  futureRequirement: number;
  currentStock: number;
  hlcRecordedStock: number;
  stockWithOtherParties: number;
  stockMatched: boolean;
  pendingProcurement?: number;
  confirmedIncomingPurchase: number;
  confirmedInternalIncoming: number;
  usableCommittedCoverage: number;
  actionableShortfall: number;
  shortfall: number;
  nearTermShortfall?: number;
  monthlyBreakdown?: { month: number; demand: number; shortfall: number; isCurrentOrPast: boolean }[];
  suggestion: "adequate" | "adequate_selected_horizon" | "monitor" | "raise_irn" | "raise_pi" | "raise_both" | "review_hlc_stock" | "review_internal_issue" | "resolve_mapping";
  /** Resolved canonical plant_materials.id; null = unresolved in master */
  materialId: number | null;
  sourceBoqItemId: number | null;
  sourceBoqItemIds: number[];
  stockElsewhere: number;
  isProgrammed: boolean;
  materialMappingUnresolved: boolean;
  /** ISO date (YYYY-MM-DD) from the Work Programme — first month this material is short */
  requiredByDate?: string | null;
  programmingStatus: "fully_programmed" | "partly_programmed" | "not_programmed";
  programmedTotalDemand: number;
  unprogrammedDemand: number;
  futureProgrammedRequirement: number;
}

interface ShortageData {
  rows: ShortageRow[];
  hasBars: boolean;
  hasRecipes: boolean;
  currentMonth?: number;
  projectStartDate?: string | null;
  horizonMonthIndex?: number;
  maxProgrammeMonth?: number;
  selectedHorizonMode?: string;
  resolvedHorizonDate?: string | null;
  resolvedProgrammeMonthIndex?: number;
}

// ── Fresh client-request-ID ─────────────────────────────────────────────────
// Generated per deliberate action (not at mount). Retained through retries;
// cleared when the dialog closes so a later action gets a new key.
function newClientRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface PlantSetting { id?: number; plantName: string; plantType?: string | null }

// Build IRN/PI form URL with all context (requirementId, allocationId, material, qty, uom, boqProjectId)
function buildProcureLink(
  row: ShortageRow,
  projectId: number,
  requirementId?: number | null,
  allocationId?: number | null,
): string {
  // v2: use actionableShortfall for the horizon-bounded demand
  const qty = Math.max(0, row.actionableShortfall > 0 ? row.actionableShortfall : row.demandUpToSelectedDate);
  const params = new URLSearchParams({
    material: row.materialName,
    qty: String(Math.round(qty * 1000) / 1000),
    uom: row.uom ?? "",
    boqProjectId: String(projectId),
  });
  if (requirementId) params.set("requirementId", String(requirementId));
  if (allocationId) params.set("allocationId", String(allocationId));
  return params.toString();
}

// ── Resolve Mapping Dialog ──────────────────────────────────────────────────────
interface PlantMaterialResult {
  id: number;
  name: string;
  defaultUom: string | null;
  category: string | null;
  allowedUoms: string | null;          // JSON array stored as text
  bulkDensity: number | null;
  conversionFactor: number | null;
  conversionFromUom: string | null;
  conversionToUom: string | null;
}

/** Check BOM source UOM against a plant material's allowed units.
 *  Client-side mirror of server checkMappingUomCompatibility — used for
 *  real-time feedback only; server revalidates on save. */
function clientCheckUomCompat(sourceUom: string, mat: PlantMaterialResult): {
  compatible: boolean; mode: "direct" | "bulk_density" | "incompatible"; basis: string | null;
} {
  if (!sourceUom) return { compatible: true, mode: "direct", basis: null };
  const norm = (u: string) => u.trim().toUpperCase()
    .replace(/\s+/g, "").replace(/METRIC\s*TONNE?S?/gi, "MT")
    .replace(/^LITR?E?S?$/, "LTR").replace(/^TONS?$/, "MT").replace(/^TONNES?$/, "MT");
  const srcN = norm(sourceUom);
  const allowed: string[] = (() => { try { return JSON.parse(mat.allowedUoms ?? "[]"); } catch { return []; } })();
  const allowedN = allowed.map(norm);
  const defaultN = mat.defaultUom ? norm(mat.defaultUom) : null;

  if (allowedN.includes(srcN) || srcN === defaultN) return { compatible: true, mode: "direct", basis: null };

  const MASS = ["MT", "KG", "TON", "TONNE"];
  const VOL = ["CUM", "CFT", "M3"];
  const srcIsMass = MASS.includes(srcN);
  const srcIsVol = VOL.includes(srcN);
  if ((srcIsMass || srcIsVol) && mat.bulkDensity && mat.bulkDensity > 0) {
    const tgtHasMass = allowedN.some(u => MASS.includes(u));
    const tgtHasVol = allowedN.some(u => VOL.includes(u));
    if ((srcIsMass && tgtHasVol) || (srcIsVol && tgtHasMass)) {
      return { compatible: true, mode: "bulk_density", basis: `Bulk density ${mat.bulkDensity} T/m³` };
    }
  }
  return { compatible: false, mode: "incompatible", basis: null };
}

/** Format an ISO date string into a short human-readable form: "2026-09-29" → "29 Sep 2026" */
function fmtHorizonDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function ResolveMappingDialog({
  row,
  projectId,
  open,
  onClose,
  onMapped,
}: {
  row: ShortageRow;
  projectId: number;
  open: boolean;
  onClose: () => void;
  onMapped: () => void;
}) {
  const { toast } = useToast();
  const [searchQ, setSearchQ] = useState("");
  const [selected, setSelected] = useState<PlantMaterialResult | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: results = [], isFetching } = useQuery<PlantMaterialResult[]>({
    queryKey: ["/api/plant-materials/search", searchQ],
    queryFn: async () => {
      if (searchQ.trim().length < 2) return [];
      const r = await fetch(`/api/plant-materials/search?q=${encodeURIComponent(searchQ)}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: searchQ.trim().length >= 2,
    staleTime: 30_000,
  });

  // Real-time UOM compatibility check (mirrors server logic; server revalidates on save)
  const uomCheck = selected ? clientCheckUomCompat(row.uom, selected) : null;
  const canSave = !!selected && (!uomCheck || uomCheck.compatible);

  const handleSave = async () => {
    if (!selected || !canSave) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/boq/projects/${projectId}/material-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          materialLabel: row.materialName,
          materialId: selected.id,
          sourceUom: row.uom,          // passed for server-side UOM validation + audit
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        // Surface structured error codes from Instruction 019 server validation
        const msg = d.message ?? d.error ?? `Server error ${r.status}`;
        throw new Error(msg);
      }
      toast({ title: "Mapping saved", description: `"${row.materialName}" → "${selected.name}"` });
      onMapped();
      onClose();
    } catch (e: any) {
      toast({ title: "Failed to save mapping", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve Material Mapping</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm">
          <div className="bg-amber-50 border border-amber-200 rounded p-3">
            <p className="font-semibold text-amber-900">BOM Label</p>
            <p className="text-amber-800 font-mono text-[13px]">{row.materialName} · {row.uom}</p>
            <p className="text-amber-700 text-[12px] mt-1">This BOM material has no canonical match in the Plant Material Master. Search below to link it.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mat-search">Search Plant Materials</Label>
            <Input
              id="mat-search"
              placeholder="Type at least 2 characters…"
              value={searchQ}
              onChange={e => { setSearchQ(e.target.value); setSelected(null); }}
            />
          </div>
          {isFetching && <p className="text-[12px] text-muted-foreground">Searching…</p>}
          {!isFetching && searchQ.length >= 2 && results.length === 0 && (
            <p className="text-[12px] text-amber-700">No plant materials found matching "{searchQ}". Add the material in the Plant module first.</p>
          )}
          {results.length > 0 && (
            <div className="max-h-48 overflow-auto rounded border divide-y">
              {results.map(m => {
                const check = clientCheckUomCompat(row.uom, m);
                return (
                  <button
                    key={m.id}
                    className={`w-full text-left px-3 py-2 text-[13px] hover:bg-teal-50 transition-colors ${selected?.id === m.id ? "bg-teal-100 font-semibold" : ""} ${!check.compatible ? "opacity-60" : ""}`}
                    onClick={() => setSelected(m)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-medium text-slate-800">{m.name}</span>
                        {m.category && <span className="ml-1.5 text-[11px] text-slate-500">{m.category}</span>}
                        {m.defaultUom && <span className="ml-1.5 text-[11px] text-muted-foreground">({m.defaultUom})</span>}
                      </span>
                      {check.mode === "bulk_density" && (
                        <span className="text-[10px] text-blue-600 shrink-0">density conv.</span>
                      )}
                      {!check.compatible && (
                        <span className="text-[10px] text-red-500 shrink-0">UOM mismatch</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {selected && uomCheck && (
            uomCheck.compatible ? (
              <div className={`rounded p-2 text-[12px] border ${uomCheck.mode === "bulk_density" ? "bg-blue-50 border-blue-200" : "bg-teal-50 border-teal-200"}`}>
                <span className={`font-semibold ${uomCheck.mode === "bulk_density" ? "text-blue-800" : "text-teal-800"}`}>Will map to: </span>
                <span className={uomCheck.mode === "bulk_density" ? "text-blue-700" : "text-teal-700"}>{selected.name}</span>
                {selected.defaultUom && <span className="text-teal-600"> ({selected.defaultUom})</span>}
                {uomCheck.mode === "bulk_density" && uomCheck.basis && (
                  <p className="mt-1 text-blue-600">{uomCheck.basis}</p>
                )}
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-[12px]">
                <p className="font-semibold text-red-800">UOM mismatch — cannot save</p>
                <p className="text-red-700 mt-0.5">
                  BOM source is <strong>{row.uom}</strong>; this material requires one of:{" "}
                  {(() => { try { return (JSON.parse(selected.allowedUoms ?? "[]") as string[]).join(", "); } catch { return selected.defaultUom ?? "?"; } })()}.
                  Configure an approved conversion on this material or choose a compatible one.
                </p>
              </div>
            )
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Saving…</> : "Save Mapping"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DialogStep = "closed" | "confirm_dest" | "awaiting_review" | "authorize_alloc";

function SuggestionBadge({
  row,
  projectId,
  projectLinkedSiteId,
  onMappingResolved,
}: {
  row: ShortageRow;
  projectId: number;
  projectLinkedSiteId?: number | null;
  onMappingResolved?: () => void;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { permissions, isAdmin } = useAuth();
  const suggestion = row.suggestion;

  // Permission flags — server enforces authoritatively; UI is a convenience
  const canApprovePi = isAdmin || (permissions as any)?.purchase_indents_approve?.approve === true;
  const canApproveIrn = isAdmin || (permissions as any)?.irn_approve?.approve === true;

  // ── Resolve mapping dialog ──────────────────────────────────────────────────
  const [showResolveMap, setShowResolveMap] = useState(false);

  // ── Step machine ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<DialogStep>("closed");
  const [pendingAction, setPendingAction] = useState<"irn" | "pi" | "both" | null>(null);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);

  // Step 1: destination
  const [destType, setDestType] = useState<string>("");
  const [destPlantId, setDestPlantId] = useState<string>("");
  const [destSiteId, setDestSiteId] = useState<string>("");

  // After requirement created
  const [createdReqId, setCreatedReqId] = useState<number | null>(null);

  // v2: use actionableShortfall for all qty calculations
  const totalQty = Math.max(0, row.actionableShortfall > 0 ? row.actionableShortfall : row.demandUpToSelectedDate);
  const [internalQtyStr, setInternalQtyStr] = useState<string>("");
  const [procQtyStr, setProcQtyStr] = useState<string>("");
  const [splitAllocInternal, setSplitAllocInternal] = useState<number | null>(null);
  const [splitAllocProc, setSplitAllocProc] = useState<number | null>(null);

  // ── Lazy data fetches ───────────────────────────────────────────────────────
  const { data: plantsList = [] } = useQuery<PlantSetting[]>({
    queryKey: ["/api/plant-module/plant-settings"],
    queryFn: async () => {
      const r = await fetch("/api/plant-module/plant-settings", { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: step !== "closed",
    staleTime: 5 * 60 * 1000,
  });
  const { data: sitesList = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/sites"],
    queryFn: async () => {
      const r = await fetch("/api/sites", { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: step !== "closed",
    staleTime: 5 * 60 * 1000,
  });

  // Filter plants by type where possible, fall back to all
  const plantsForDest = useMemo(() => {
    if (!destType || destType === "site" || destType === "store") return [];
    const kws = destType === "hmp" ? ["hmp", "hot", "asphalt"] : ["rmc", "concrete", "batch"];
    const filtered = plantsList.filter((p: any) => kws.some(k => (p.plantType ?? "").toLowerCase().includes(k)));
    return (filtered.length > 0 ? filtered : plantsList) as PlantSetting[];
  }, [plantsList, destType]);

  // Destination validity
  const destValid = destType === "store" ? true
    : destType === "site" ? Boolean(destSiteId)
    : (destType === "hmp" || destType === "rmc") ? Boolean(destPlantId)
    : false;

  // ── Open / close ────────────────────────────────────────────────────────────
  const openFor = (action: "irn" | "pi" | "both") => {
    setPendingAction(action);
    setClientRequestId(newClientRequestId()); // fresh per action
    setDestType(""); setDestPlantId("");
    setDestSiteId(projectLinkedSiteId ? String(projectLinkedSiteId) : "");
    setCreatedReqId(null); setSplitAllocInternal(null); setSplitAllocProc(null);
    if (action === "both") {
      // How much of the demand is not yet covered by confirmed incoming (PI or IRN)?
      // Use that as the ceiling for what internal transfer (IRN) can cover.
      // Only HLC-recorded stock (partyId = NULL) feeds an IRN — other-parties stock is informational.
      const remainingAfterConfirmed = Math.max(
        0,
        (row.demandUpToSelectedDate) - (row.confirmedIncomingPurchase) - (row.confirmedInternalIncoming),
      );
      const irnSugg = Math.round(Math.min(remainingAfterConfirmed, row.hlcRecordedStock) * 1000) / 1000;
      setInternalQtyStr(String(irnSugg));
      setProcQtyStr(String(Math.round(Math.max(0, remainingAfterConfirmed - irnSugg) * 1000) / 1000));
    }
    setStep("confirm_dest");
  };
  const handleClose = () => { setStep("closed"); setClientRequestId(null); };

  // ── Requirement creation ────────────────────────────────────────────────────
  const createReqMutation = useMutation({
    mutationFn: async () => {
      if (!destType) throw new Error("Select a destination type first");
      if (!destValid) throw new Error("Complete the destination selection");
      if (row.materialId == null) throw new Error(`"${row.materialName}" is not in the Plant Material Master — add it before raising a requirement`);
      const body: Record<string, any> = {
        materialType: "plant_material",
        materialId: row.materialId,
        // v2: use actionableShortfall (horizon-bounded demand minus usable coverage)
        requiredQty: Math.round(totalQty * 1000) / 1000,
        uom: row.uom ?? "",
        boqProjectId: projectId,
        sourceType: "bom",
        sourceBoqItemId: row.sourceBoqItemId ?? undefined,
        destinationType: destType,
        clientRequestId: clientRequestId!,
      };
      // Use Work Programme required-by date — never substitute today's date
      if (row.requiredByDate) body.requiredByDate = row.requiredByDate;
      if (destType === "site") body.destinationSiteId = Number(destSiteId);
      else if (destType === "hmp" || destType === "rmc") body.destinationPlantId = Number(destPlantId);

      const res = await fetch("/api/material-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `Server error ${res.status}`);
      return data.id as number;
    },
    onSuccess: (reqId) => {
      setCreatedReqId(reqId);
      const hasAnyApprove =
        pendingAction === "irn" ? canApproveIrn
        : pendingAction === "pi" ? canApprovePi
        : (canApproveIrn || canApprovePi);
      setStep(hasAnyApprove ? "authorize_alloc" : "awaiting_review");
    },
    onError: (err: any) => {
      // FAIL FAST — no fallback navigation, stay on Work Demand
      toast({ title: "Could not create requirement", description: err.message ?? "Unknown error", variant: "destructive" });
    },
  });

  // ── Allocation creation (dedicated endpoint only) ───────────────────────────
  const createAllocMutation = useMutation({
    mutationFn: async ({ allocType, qty, reason }: { allocType: "internal" | "procurement"; qty: number; reason?: string }) => {
      const res = await fetch(`/api/material-requirements/${createdReqId}/allocations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ allocationType: allocType, authorizedQty: qty, reason: reason ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `Allocation failed: ${res.status}`);
      return { allocId: data.id as number, allocType };
    },
    onSuccess: ({ allocId, allocType }) => {
      if (pendingAction === "both") {
        if (allocType === "internal") setSplitAllocInternal(allocId);
        else setSplitAllocProc(allocId);
        // Navigation links shown inside dialog — user clicks when ready
      } else {
        const qs = buildProcureLink(row, projectId, createdReqId, allocId);
        if (allocType === "internal") navigate(`/irn/new?${qs}`);
        else navigate(`/plant/purchase-indents?${qs}`);
      }
    },
    onError: (err: any) => {
      toast({ title: "Could not authorise allocation", description: err.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const fmtN = (n: number) => Math.round(n * 1000) / 1000;
  const isPending = createReqMutation.isPending || createAllocMutation.isPending;
  const internalQty = parseFloat(internalQtyStr) || 0;
  const procQty = parseFloat(procQtyStr) || 0;
  const splitTotal = internalQty + procQty;
  // Ceiling = remaining after confirmed incoming (not post-HLC-stock totalQty) to prevent double-subtraction
  const splitCeiling = Math.max(0, row.demandUpToSelectedDate - row.confirmedIncomingPurchase - row.confirmedInternalIncoming);
  const splitBalance = Math.max(0, splitCeiling - splitTotal);
  const splitValid = (internalQty >= 0 && procQty >= 0) && (internalQty > 0 || procQty > 0) && splitTotal <= splitCeiling + 0.001;

  if (suggestion === "adequate") return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Adequate
    </span>
  );
  if (suggestion === "adequate_selected_horizon") return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Adequate for Horizon
    </span>
  );
  if (suggestion === "monitor") return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      <Info className="w-3 h-3" /> Monitor stock
    </span>
  );
  if (suggestion === "review_hlc_stock") return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      <Info className="w-3 h-3" /> Review HLC Stock + Purchase Balance
    </span>
  );
  if (suggestion === "review_internal_issue") return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
      <Info className="w-3 h-3" /> Review — Issue from HLC Stock
    </span>
  );
  if (suggestion === "resolve_mapping") return (
    <>
      <button
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 hover:bg-amber-100 transition-colors"
        onClick={() => setShowResolveMap(true)}
      >
        <Settings2 className="w-3 h-3" /> Resolve Material Mapping
      </button>
      <ResolveMappingDialog
        row={row}
        projectId={projectId}
        open={showResolveMap}
        onClose={() => setShowResolveMap(false)}
        onMapped={() => { onMappingResolved?.(); }}
      />
    </>
  );

  return (
    <>
      {/* ── Action buttons ── */}
      <div className="flex flex-wrap gap-1">
        {suggestion === "raise_irn" && (
          <button onClick={() => openFor("irn")} disabled={isPending}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 hover:bg-orange-100 transition-colors disabled:opacity-60">
            <ShoppingCart className="w-3 h-3" /> Raise IRN
          </button>
        )}
        {suggestion === "raise_pi" && (
          <button onClick={() => openFor("pi")} disabled={isPending}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-100 transition-colors disabled:opacity-60">
            <ShoppingCart className="w-3 h-3" /> Raise PI
          </button>
        )}
        {suggestion === "raise_both" && (
          <>
            <button onClick={() => openFor("both")} disabled={isPending}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5 hover:bg-violet-100 transition-colors disabled:opacity-60">
              <SplitSquareHorizontal className="w-3 h-3" /> Review Internal + Purchase Split
            </button>
            <span className="inline-flex items-center text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 gap-1">
              <Info className="w-3 h-3" /> Potential stock available elsewhere — confirm for transfer
            </span>
          </>
        )}
      </div>

      {/* ── Multi-step dialog ── */}
      <Dialog open={step !== "closed"} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-sm">

          {/* Step 1: destination + material summary */}
          {step === "confirm_dest" && (<>
            <DialogHeader>
              <DialogTitle>
                {pendingAction === "irn" ? "Raise Internal Requisition"
                  : pendingAction === "pi" ? "Raise Purchase Indent"
                  : "Review Internal + Purchase Split"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 text-sm">
              <div className="bg-gray-50 rounded p-3 space-y-1">
                <p className="font-semibold text-gray-800 truncate">{row.materialName}</p>
                {/* v2 breakdown */}
                <p className="text-gray-600">Demand to horizon: <span className="font-mono font-semibold">{fmtN(row.demandUpToSelectedDate)} {row.uom}</span></p>
                <p className="text-gray-600">HLC Stock: <span className="font-mono font-semibold">{fmtN(row.hlcRecordedStock)}</span> · Confirmed Incoming: <span className="font-mono font-semibold">{fmtN(row.confirmedIncomingPurchase)}</span></p>
                <p className="text-gray-700 font-medium">Actionable Shortfall: <span className="font-mono text-red-700">{fmtN(row.actionableShortfall)} {row.uom}</span></p>
                {row.futureRequirement > 0 && <p className="text-gray-500 text-[12px]">Future requirement (after horizon): {fmtN(row.futureRequirement)} {row.uom}</p>}
                {row.requiredByDate && <p className="text-gray-500 text-[12px]">Required by: <span className="font-medium">{row.requiredByDate}</span></p>}
                {row.materialId == null && (
                  <p className="text-red-600 text-[12px] font-medium mt-1">⚠ Not in Plant Material Master — add it before raising a requirement.</p>
                )}
              </div>
              {/* Destination type */}
              <div className="space-y-1.5">
                <Label htmlFor="dest-type" className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Receiving Destination</Label>
                <Select value={destType} onValueChange={(v) => { setDestType(v); setDestPlantId(""); }}>
                  <SelectTrigger id="dest-type" className="w-full"><SelectValue placeholder="Select destination type…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hmp">HMP Plant</SelectItem>
                    <SelectItem value="rmc">RMC Plant</SelectItem>
                    <SelectItem value="site">Site</SelectItem>
                    <SelectItem value="store">Central Store</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Plant sub-picker */}
              {(destType === "hmp" || destType === "rmc") && (
                <div className="space-y-1.5">
                  <Label htmlFor="dest-plant">Plant</Label>
                  <Select value={destPlantId} onValueChange={setDestPlantId}>
                    <SelectTrigger id="dest-plant" className="w-full"><SelectValue placeholder="Select plant…" /></SelectTrigger>
                    <SelectContent>
                      {plantsForDest.map((p: any) => (
                        <SelectItem key={p.plantName ?? p.id} value={String(p.id ?? p.plantName)}>{p.plantName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {plantsForDest.length === 0 && <p className="text-[11px] text-amber-600">No plant records found — check Plant module settings.</p>}
                </div>
              )}
              {/* Site sub-picker */}
              {destType === "site" && (
                <div className="space-y-1.5">
                  <Label htmlFor="dest-site">Site</Label>
                  <Select value={destSiteId} onValueChange={setDestSiteId}>
                    <SelectTrigger id="dest-site" className="w-full"><SelectValue placeholder="Select site…" /></SelectTrigger>
                    <SelectContent>
                      {sitesList.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {destType === "store" && <p className="text-[12px] text-muted-foreground">Will be received at Central Store — no specific location required.</p>}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isPending}>Cancel</Button>
              <Button onClick={() => createReqMutation.mutate()} disabled={isPending || !destValid || row.materialId == null}>
                {isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Creating…</> : "Create Requirement"}
              </Button>
            </DialogFooter>
          </>)}

          {/* Step 2a: awaiting review */}
          {step === "awaiting_review" && (<>
            <DialogHeader><DialogTitle>Requirement Created</DialogTitle></DialogHeader>
            <div className="py-4 space-y-3 text-sm">
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded p-3">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-800">Requirement created and sent for review.</p>
                  <p className="text-blue-700 mt-0.5">REQ-{createdReqId} is awaiting allocation approval from your PM or manager.</p>
                </div>
              </div>
              <p className="text-muted-foreground text-[12px]">
                {row.materialName} · {fmtN(totalQty)} {row.uom}{row.requiredByDate ? ` · Required by ${row.requiredByDate}` : ""}
              </p>
            </div>
            <DialogFooter><Button onClick={handleClose}>Okay</Button></DialogFooter>
          </>)}

          {/* Step 2b: authorise (single action — irn or pi) */}
          {step === "authorize_alloc" && pendingAction !== "both" && (<>
            <DialogHeader>
              <DialogTitle>{pendingAction === "irn" ? "Authorise Internal Allocation" : "Authorise Procurement Allocation"}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3 text-sm">
              <div className="bg-gray-50 rounded p-3 space-y-1">
                <p className="text-[12px] text-muted-foreground">Requirement REQ-{createdReqId} created ✓</p>
                <p className="font-semibold">{row.materialName}</p>
                <p className="text-gray-600">Authorised qty: <span className="font-mono font-semibold">{fmtN(totalQty)} {row.uom}</span></p>
                {row.requiredByDate && <p className="text-gray-500 text-[12px]">Required by: {row.requiredByDate}</p>}
              </div>
              {(pendingAction === "irn" && !canApproveIrn) && <p className="text-amber-600 text-[12px]">You do not have IRN approval permission. The requirement has been raised for review.</p>}
              {(pendingAction === "pi" && !canApprovePi) && <p className="text-amber-600 text-[12px]">You do not have PI approval permission. The requirement has been raised for review.</p>}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isPending}>
                {((pendingAction === "irn" && !canApproveIrn) || (pendingAction === "pi" && !canApprovePi)) ? "Close" : "Cancel"}
              </Button>
              {((pendingAction === "irn" && canApproveIrn) || (pendingAction === "pi" && canApprovePi)) && (
                <Button
                  onClick={() => createAllocMutation.mutate({ allocType: pendingAction === "irn" ? "internal" : "procurement", qty: totalQty })}
                  disabled={isPending}
                >
                  {isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Authorising…</> : `Authorise & Open ${pendingAction === "irn" ? "IRN" : "PI"} Form`}
                </Button>
              )}
            </DialogFooter>
          </>)}

          {/* Step 2b: split (raise_both) */}
          {step === "authorize_alloc" && pendingAction === "both" && (<>
            <DialogHeader><DialogTitle>Review Internal + Purchase Split</DialogTitle></DialogHeader>
            <div className="py-3 space-y-3 text-sm">
              <div className="bg-gray-50 rounded p-3 space-y-1">
                <p className="text-[12px] text-muted-foreground">Requirement REQ-{createdReqId} created ✓</p>
                <p className="font-semibold">{row.materialName}</p>
                <p className="text-gray-600">Total required: <span className="font-mono font-semibold">{fmtN(totalQty)} {row.uom}</span></p>
                {row.hlcRecordedStock > 0 && (
                  <p className="text-blue-700 text-[12px]">Suggested internal allocation (from HLC stock): {fmtN(Math.min(row.hlcRecordedStock, Math.max(0, row.demandUpToSelectedDate - row.confirmedIncomingPurchase - row.confirmedInternalIncoming)))} {row.uom}</p>
                )}
                {row.stockWithOtherParties > 0 && (
                  <p className="text-indigo-600 text-[12px]">ℹ Other parties hold {fmtN(row.stockWithOtherParties)} {row.uom} — confirm availability before requesting transfer.</p>
                )}
              </div>
              {/* Internal qty */}
              <div className="space-y-1">
                <Label className="text-[12px]">Internal Transfer Qty (IRN){!canApproveIrn ? " — no IRN approve permission" : ""}</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min="0" step="0.001" value={internalQtyStr} onChange={(e) => setInternalQtyStr(e.target.value)}
                    disabled={!canApproveIrn || splitAllocInternal != null} className="font-mono" />
                  <span className="text-[12px] text-muted-foreground shrink-0">{row.uom}</span>
                </div>
                {splitAllocInternal != null && <p className="text-emerald-600 text-[12px]">✓ Internal allocation authorised (ALLOC-{splitAllocInternal})</p>}
              </div>
              {/* Procurement qty */}
              <div className="space-y-1">
                <Label className="text-[12px]">Procurement Qty (PI){!canApprovePi ? " — no PI approve permission" : ""}</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min="0" step="0.001" value={procQtyStr} onChange={(e) => setProcQtyStr(e.target.value)}
                    disabled={!canApprovePi || splitAllocProc != null} className="font-mono" />
                  <span className="text-[12px] text-muted-foreground shrink-0">{row.uom}</span>
                </div>
                {splitAllocProc != null && <p className="text-emerald-600 text-[12px]">✓ Procurement allocation authorised (ALLOC-{splitAllocProc})</p>}
              </div>
              {/* Balance */}
              <p className={`text-[12px] font-semibold ${splitBalance > 0.001 ? "text-amber-600" : "text-emerald-600"}`}>
                Unallocated balance: {fmtN(splitBalance)} {row.uom}
              </p>
              {splitTotal > totalQty + 0.001 && <p className="text-red-600 text-[12px]">Combined qty exceeds required qty.</p>}
              {/* Navigation links */}
              {(splitAllocInternal != null || splitAllocProc != null) && (
                <div className="bg-blue-50 border border-blue-200 rounded p-2 space-y-1.5">
                  <p className="text-[12px] font-semibold text-blue-800">Open linked forms:</p>
                  {splitAllocInternal != null && (
                    <button className="text-[12px] text-orange-700 underline block" onClick={() => { handleClose(); navigate(`/irn/new?${buildProcureLink(row, projectId, createdReqId, splitAllocInternal)}`); }}>
                      → Open IRN form (ALLOC-{splitAllocInternal})
                    </button>
                  )}
                  {splitAllocProc != null && (
                    <button className="text-[12px] text-red-700 underline block" onClick={() => { handleClose(); navigate(`/plant/purchase-indents?${buildProcureLink(row, projectId, createdReqId, splitAllocProc)}`); }}>
                      → Open PI form (ALLOC-{splitAllocProc})
                    </button>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 flex-wrap">
              <Button variant="outline" onClick={handleClose} disabled={isPending}>
                {(splitAllocInternal != null || splitAllocProc != null) ? "Done" : "Cancel"}
              </Button>
              {canApproveIrn && splitAllocInternal == null && internalQty > 0 && (
                <Button size="sm" variant="outline" className="text-orange-700 border-orange-300"
                  onClick={() => createAllocMutation.mutate({ allocType: "internal", qty: internalQty, reason: "Internal transfer portion of IRN+PI split" })}
                  disabled={isPending || !splitValid}>
                  {isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Authorise IRN ({fmtN(internalQty)} {row.uom})
                </Button>
              )}
              {canApprovePi && splitAllocProc == null && procQty > 0 && (
                <Button size="sm" className="text-white bg-red-600 hover:bg-red-700"
                  onClick={() => createAllocMutation.mutate({ allocType: "procurement", qty: procQty, reason: "Procurement portion of IRN+PI split" })}
                  disabled={isPending || !splitValid}>
                  {isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Authorise PI ({fmtN(procQty)} {row.uom})
                </Button>
              )}
            </DialogFooter>
          </>)}

        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Horizon selector ──────────────────────────────────────────────────────────
type HorizonMode = "current_month" | "next_30_days" | "next_programme_month" | "custom" | "entire_programme";

function HorizonSelector({
  mode, customDate, projectStartDate,
  resolvedHorizonDate,
  onChange,
}: {
  mode: HorizonMode;
  customDate: string;
  projectStartDate?: string | null;
  /** ISO date string resolved server-side — shown alongside the mode picker for clarity. */
  resolvedHorizonDate?: string | null;
  onChange: (mode: HorizonMode, customDate: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm">
      <CalendarDays className="w-4 h-4 text-slate-500 flex-shrink-0" />
      <span className="font-semibold text-slate-700 shrink-0">Procurement Horizon:</span>
      <Select value={mode} onValueChange={(v) => onChange(v as HorizonMode, customDate)}>
        <SelectTrigger className="h-7 text-[12px] w-[210px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="current_month">Up to Current Programme Month</SelectItem>
          <SelectItem value="next_30_days">Next 30 Days</SelectItem>
          <SelectItem value="next_programme_month">Next Programme Month</SelectItem>
          <SelectItem value="custom">Custom Date</SelectItem>
          <SelectItem value="entire_programme">Entire Programme</SelectItem>
        </SelectContent>
      </Select>
      {mode === "custom" && (
        <Input
          type="date"
          value={customDate}
          onChange={e => onChange(mode, e.target.value)}
          className="h-7 text-[12px] w-36"
          min={projectStartDate ?? undefined}
        />
      )}
      {resolvedHorizonDate && mode !== "entire_programme" && (
        <span className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5">
          Through: <span className="font-semibold">{resolvedHorizonDate}</span>
        </span>
      )}
      {mode === "entire_programme" && (
        <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          ⚠ Shows full programme totals — may overstate near-term risk
        </span>
      )}
    </div>
  );
}

function ProcurementTable({
  data, projectId, projectLinkedSiteId,
  horizonMode, horizonCustomDate,
  onHorizonChange, onMappingResolved,
}: {
  data: ShortageData;
  projectId: number;
  projectLinkedSiteId?: number | null;
  horizonMode: HorizonMode;
  horizonCustomDate: string;
  onHorizonChange: (mode: HorizonMode, custom: string) => void;
  onMappingResolved: () => void;
}) {
  if (!data.hasBars) return (
    <EmptyState label="Add stretches to the Work Programme first to generate demand." />
  );
  if (!data.hasRecipes) return (
    <EmptyState label="Configure material recipes on BOQ items to enable shortage analysis." />
  );
  if (!data.rows.length) return (
    <EmptyState label="No material demand found. Check recipes on BOQ items." />
  );

  const actionableCount = data.rows.filter(r =>
    r.actionableShortfall > 0 &&
    !r.materialMappingUnresolved &&
    r.programmingStatus !== "not_programmed"
  ).length;
  const unresolvedCount = data.rows.filter(r => r.materialMappingUnresolved).length;
  const notProgrammedCount = data.rows.filter(r =>
    !r.materialMappingUnresolved && r.programmingStatus === "not_programmed"
  ).length;

  return (
    <div className="space-y-3">
      {/* Horizon selector */}
      <HorizonSelector
        mode={horizonMode}
        customDate={horizonCustomDate}
        projectStartDate={data.projectStartDate}
        resolvedHorizonDate={data.resolvedHorizonDate}
        onChange={onHorizonChange}
      />

      {/* Info note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Planning intelligence only.</span>{" "}
          Stock shown is HLC/company custody only. Existing manual IRN and PI creation is unchanged.
          {unresolvedCount > 0 && (
            <span className="block mt-1 text-amber-700">
              ⚠ {unresolvedCount} material{unresolvedCount > 1 ? "s" : ""} without a canonical material mapping — resolve to enable requirement creation.
            </span>
          )}
        </div>
      </div>

      {actionableCount > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-800 font-semibold">
            {actionableCount} material{actionableCount > 1 ? "s" : ""} with actionable shortfall in selected horizon.
          </span>
        </div>
      )}
      {notProgrammedCount > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <Info className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-600">
            {notProgrammedCount} material{notProgrammedCount > 1 ? "s" : ""} not yet in the work programme — demand shown but excluded from actionable count.
          </span>
        </div>
      )}

      <div className="overflow-auto rounded-xl border max-h-[70vh]">
        <table className="text-sm border-collapse" style={{ minWidth: 960 }}>
          <thead>
            <tr style={{ background: "#0F5F64" }}>
              <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 top-0 z-30 min-w-[180px]" style={{ background: "#0F5F64" }}>Material</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[50px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>Unit</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>Total Demand</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>
                {(() => {
                  const mode = data.selectedHorizonMode;
                  const hDate = data.resolvedHorizonDate;
                  if (mode === "entire_programme") return "Programme Demand";
                  if (mode === "current_month") return hDate ? `To ${fmtHorizonDate(hDate)}` : "Current Month";
                  if (mode === "next_30_days") return hDate ? `Next 30 Days → ${fmtHorizonDate(hDate)}` : "Next 30 Days";
                  if (mode === "next_programme_month") return hDate ? `To ${fmtHorizonDate(hDate)}` : "Next Prog. Month";
                  if (hDate) return `To ${fmtHorizonDate(hDate)}`;
                  return "Demand to Horizon";
                })()}
              </th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>HLC Stock</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>Other Parties</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>Confirmed Incoming</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>Actionable Shortfall</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>Future Req.</th>
              <th className="px-3 py-2 font-semibold text-white text-left min-w-[150px] sticky top-0 z-20" style={{ background: "#0F5F64" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => {
              const hasShortfall = row.actionableShortfall > 0;
              const isUnresolved = row.materialMappingUnresolved;
              return (
                <tr
                  key={row.materialName}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${hasShortfall ? "bg-red-50/30" : isUnresolved ? "bg-amber-50/30" : ""}`}
                  data-testid={`shortage-row-${row.materialName}`}
                >
                  <td className={`px-3 py-2 font-medium sticky left-0 z-10 ${hasShortfall ? "bg-red-50/50" : isUnresolved ? "bg-amber-50/50" : "bg-white"}`}>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-slate-700">{row.materialName}</span>
                      {isUnresolved && (
                        <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 border border-amber-300 rounded px-1 py-0.5">Mapping Required</span>
                      )}
                      {row.programmingStatus === "not_programmed" && (
                        <span className="text-[10px] text-slate-400 italic">(not programmed)</span>
                      )}
                      {row.programmingStatus === "partly_programmed" && (
                        <span
                          className="text-[10px] text-amber-500 italic"
                          title={`Programmed: ${fmtQty(row.programmedTotalDemand, 1)} · Unprogrammed: ${fmtQty(row.unprogrammedDemand, 1)} ${row.uom}`}
                        >(partly programmed)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground">{row.uom}</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold text-teal-700">
                    {fmtQty(row.totalDemand, 1)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-semibold text-slate-700">
                    {fmtQty(row.demandUpToSelectedDate, 1)}
                  </td>
                  <td className={`px-2 py-2 text-right font-mono ${row.hlcRecordedStock > 0 ? "text-slate-700 font-semibold" : "text-slate-300"}`}>
                    {isUnresolved ? "—" : fmtQty(row.hlcRecordedStock, 1)}
                  </td>
                  <td className={`px-2 py-2 text-right font-mono text-[12px] ${row.stockWithOtherParties > 0 ? "text-indigo-600" : "text-slate-300"}`}>
                    {isUnresolved ? "—" : row.stockWithOtherParties > 0 ? fmtQty(row.stockWithOtherParties, 1) : "—"}
                  </td>
                  <td className={`px-2 py-2 text-right font-mono ${row.confirmedIncomingPurchase > 0 ? "text-blue-700" : "text-slate-300"}`}>
                    {isUnresolved ? "—" : row.confirmedIncomingPurchase > 0 ? fmtQty(row.confirmedIncomingPurchase, 1) : "—"}
                  </td>
                  <td className={`px-2 py-2 text-right font-mono font-semibold ${hasShortfall ? "text-red-700" : "text-emerald-600"}`}>
                    {isUnresolved ? "—" : hasShortfall ? fmtQty(row.actionableShortfall, 1) : "✓"}
                  </td>
                  <td className={`px-2 py-2 text-right font-mono text-[12px] ${row.futureRequirement > 0 ? "text-amber-600" : "text-slate-300"}`}>
                    {row.futureRequirement > 0 ? fmtQty(row.futureRequirement, 1) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <SuggestionBadge
                      row={row}
                      projectId={projectId}
                      projectLinkedSiteId={projectLinkedSiteId}
                      onMappingResolved={onMappingResolved}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkDemand() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const [, navigate] = useLocation();
  // Task #1240: honour ?tab= so the proactive shortage badge on the Work
  // Programme page can deep-link straight into the procurement sub-tab.
  const initialTab = (() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "procurement" || t === "plan-vs-actual" ? t : "materials";
  })();
  const [activeTab, setActiveTab] = useState(initialTab);

  const { data: project } = useQuery<BoqProject>({
    queryKey: ["/api/boq/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const { data: bomData, isLoading, isError: bomError } = useQuery<{
    items: (BomInputItem & { materialSetupWarning?: string | null })[];
    bars: BomInputBar[];
    roadLengthKm: number;
    unprogrammedItemIds?: number[];
    hasBars: boolean;
    hasItems: boolean;
    hasRecipes: boolean;
  }>({
    queryKey: ["/api/boq/projects", projectId, "bom"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/bom`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch BOM data");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  // ── Procurement Horizon state ──────────────────────────────────────────────
  // Default to current_month — server resolves the exact cutoff date programme-relatively.
  const [horizonMode, setHorizonMode] = useState<HorizonMode>("current_month");
  const [horizonCustomDate, setHorizonCustomDate] = useState<string>("");

  const {
    data: shortageData,
    isLoading: shortageLoading,
    isError: shortageIsError,
    error: shortageError,
    refetch: refetchShortage,
  } = useQuery<ShortageData>({
    queryKey: ["/api/boq/projects", projectId, "shortage-check", horizonMode, horizonCustomDate],
    queryFn: async () => {
      // The server is authoritative for horizon resolution — send mode + optional customDate.
      const params = new URLSearchParams({ horizonMode });
      if (horizonMode === "custom" && horizonCustomDate) params.set("customDate", horizonCustomDate);
      const res = await fetch(`/api/boq/projects/${projectId}/shortage-check?${params}`, { credentials: "include" });
      if (!res.ok) {
        // Surface the server's structured error detail when available
        let detail = `Server error ${res.status}`;
        try {
          const body = await res.json();
          detail = body.detail ?? body.message ?? body.error ?? detail;
        } catch { /* ignore parse errors */ }
        throw new Error(detail);
      }
      return res.json();
    },
    enabled: !isNaN(projectId) && activeTab === "procurement",
    retry: 1,
  });

  // Actuals for Plan vs Actual: reuse the existing (read-only) DPR listing
  // endpoint, filtered client-side to this project's equipment/labour rows
  // that were explicitly linked to a work item.
  const { data: dprsWithDetails = [], isLoading: dprsLoading } = useQuery<DprLogsLite[]>({
    queryKey: ["/api/dprs/with-details"],
    queryFn: async () => {
      const res = await fetch(`/api/dprs/with-details`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch DPRs");
      return res.json();
    },
    enabled: !isNaN(projectId) && activeTab === "plan-vs-actual",
  });

  // Structure/reach labels for the Plan vs Actual structure-level breakdown
  // (same programme-bar data used on the DPR entry screen's structure selector).
  const { data: programmeBars = [] } = useQuery<ProgrammeBarLite[]>({
    queryKey: ["/api/boq/projects", projectId, "programme"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/programme`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    // Also needed on "by-item" to derive the per-item planning-mode badge (Task #1240).
    enabled: !isNaN(projectId) && (activeTab === "plan-vs-actual" || activeTab === "by-item"),
  });

  // Actual progress qty completed per item — used for the productivity metric
  // (qty completed per equipment hour / labour day).
  const { data: planVsActualRows = [] } = useQuery<PlanVsActualRowLite[]>({
    queryKey: ["/api/boq/projects", projectId, "plan-vs-actual"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/plan-vs-actual`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !isNaN(projectId) && activeTab === "plan-vs-actual",
  });

  const actualQtyByItem = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of planVsActualRows) m.set(r.boqItemId, r.totalActual);
    return m;
  }, [planVsActualRows]);

  const demand = useMemo((): BomDemand | null => {
    if (!bomData || !project) return null;
    const { items, bars } = bomData;
    if (!items.length) return null;
    // Allow demand even with no bars — items without bars use their currentQty
    return calculateBomDemand(items, bars ?? [], project.totalMonths ?? 12);
  }, [bomData, project]);

  // Build set of short descriptions for structure-type BOQ items (point-location, non-linear)
  const structureItemDescriptions = useMemo((): Set<string> => {
    if (!bomData?.items?.length) return new Set();
    const descs = new Set<string>();
    for (const item of bomData.items) {
      if ((item as any).planningWorkType === "structure") descs.add(item.description);
    }
    return descs;
  }, [bomData]);

  // Build set of descriptions for items that have no programme bars
  const unprogrammedDescriptions = useMemo((): Set<string> => {
    if (!bomData?.unprogrammedItemIds?.length || !bomData.items.length) return new Set();
    const unprogrammedIds = new Set(bomData.unprogrammedItemIds);
    const descs = new Set<string>();
    for (const item of bomData.items) {
      if (unprogrammedIds.has(item.id)) descs.add(item.description);
    }
    return descs;
  }, [bomData]);

  const materialReadiness = useMemo(() => {
    const items = bomData?.items ?? [];
    const driving = items.filter(it => (it.materials?.length ?? 0) > 0 || !!it.materialSetupWarning);
    const readyCount = driving.filter(it => (it.materials?.length ?? 0) > 0 && !it.materialSetupWarning).length;
    const blocked = driving.filter(it => !!it.materialSetupWarning);
    const groups = new Map<string, { reason: string; items: { id: number; itemCode?: string | null; description: string }[] }>();
    for (const it of blocked) {
      const reason = it.materialSetupWarning as string;
      if (!groups.has(reason)) groups.set(reason, { reason, items: [] });
      groups.get(reason)!.items.push({ id: it.id, itemCode: it.itemCode, description: it.description });
    }
    return {
      total: driving.length,
      readyCount,
      blockedCount: blocked.length,
      groups: [...groups.values()],
    };
  }, [bomData]);

  const shortageAlertCount = shortageData?.rows.filter(r => r.actionableShortfall > 0 || r.materialMappingUnresolved).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="breadcrumb">
        <Link href="/work-program">
          <a className="hover:text-slate-700 transition-colors flex items-center gap-1">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Work Program &amp; BOQ
          </a>
        </Link>
        <ChevronRight className="w-3 h-3 flex-shrink-0" />
        <Link href={`/work-program/${projectId}`}>
          <a className="hover:text-slate-700 transition-colors truncate max-w-[160px]">
            {project?.name ?? "…"}
          </a>
        </Link>
        <ChevronRight className="w-3 h-3 flex-shrink-0" />
        <Link href={`/work-program/${projectId}/programme`}>
          <a className="hover:text-slate-700 transition-colors flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            Work Programme
          </a>
        </Link>
        <ChevronRight className="w-3 h-3 flex-shrink-0" />
        <span className="text-slate-700 font-medium flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5" />
          BOM &amp; Demand
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">BOM &amp; Resource Demand</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {project?.name}
            {project?.roadLengthKm ? ` · ${project.roadLengthKm} km` : ""}
            {project?.totalMonths ? ` · ${project.totalMonths} months` : ""}
          </p>
          {(() => {
            const included = bomData?.items?.length ?? 0;
            const excludedCount = (bomData as any)?._excludedCount as number | undefined;
            if (included > 0 && typeof excludedCount === "number" && excludedCount > 0) {
              return (
                <span className="inline-flex items-center gap-1 mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full" data-testid="badge-planning-inclusion">
                  Planning: {included} / {included + excludedCount} items included — {excludedCount} excluded
                </span>
              );
            }
            return null;
          })()}
        </div>
        <Link href={`/work-program/${projectId}/programme`}>
          <a>
            <Button variant="outline" size="sm" data-testid="button-back-programme">
              ← Work Programme
            </Button>
          </a>
        </Link>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Computing demand…
        </div>
      )}

      {!isLoading && !demand && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground space-y-2">
            <BookOpen className="w-10 h-10 text-slate-200 mx-auto" />
            <p className="text-sm font-medium">No data to compute BOM</p>
            <p className="text-sm">
              {bomError
                ? "BOM data could not be loaded — please refresh the page or check server logs."
                : !bomData?.hasItems
                ? "No BOQ items found for this project. Add items in the BOQ setup first."
                : !bomData?.hasRecipes
                ? "Configure material, equipment, and labour recipes on BOQ items to see demand."
                : !bomData?.hasBars
                ? "Add stretches to the Work Programme to see month-wise demand. Totals will appear once recipes are confirmed."
                : "Work Programme bars exist but BOM could not compute demand — check that BOQ items have recipes configured."}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && demand && project && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-teal-100 bg-teal-50/30">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Package className="w-5 h-5 text-teal-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Materials</p>
                  <p className="text-lg font-bold text-teal-800">{demand.materials.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-100 bg-blue-50/30">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Wrench className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Equipment</p>
                  <p className="text-lg font-bold text-blue-800">{demand.equipment.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-purple-100 bg-purple-50/30">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Users className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Labour</p>
                  <p className="text-lg font-bold text-purple-800">{demand.labour.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className={`border-orange-100 bg-orange-50/30 cursor-pointer hover:bg-orange-50/60 transition-colors`} onClick={() => setActiveTab("procurement")}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Shortages</p>
                  <p className={`text-lg font-bold ${shortageAlertCount > 0 ? "text-red-700" : "text-orange-800"}`}>
                    {shortageAlertCount > 0 ? shortageAlertCount : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="materials" className="flex items-center gap-1.5" data-testid="tab-materials">
                <Package className="w-3.5 h-3.5" /> Materials
                {demand.materials.length > 0 && (
                  <span className="ml-1 rounded-full bg-teal-100 text-teal-700 text-[12px] font-bold px-1.5 py-0.5">
                    {demand.materials.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="equipment" className="flex items-center gap-1.5" data-testid="tab-equipment">
                <Wrench className="w-3.5 h-3.5" /> Equipment
                {demand.equipment.length > 0 && (
                  <span className="ml-1 rounded-full bg-blue-100 text-blue-700 text-[12px] font-bold px-1.5 py-0.5">
                    {demand.equipment.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="labour" className="flex items-center gap-1.5" data-testid="tab-labour">
                <Users className="w-3.5 h-3.5" /> Labour
                {demand.labour.length > 0 && (
                  <span className="ml-1 rounded-full bg-purple-100 text-purple-700 text-[12px] font-bold px-1.5 py-0.5">
                    {demand.labour.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="by-item" className="flex items-center gap-1.5" data-testid="tab-by-item">
                <LayoutList className="w-3.5 h-3.5" /> By Item
              </TabsTrigger>
              <TabsTrigger value="plan-vs-actual" className="flex items-center gap-1.5" data-testid="tab-plan-vs-actual">
                <GitCompareArrows className="w-3.5 h-3.5" /> Plan vs Actual
              </TabsTrigger>
              <TabsTrigger value="procurement" className="flex items-center gap-1.5" data-testid="tab-procurement">
                <ShoppingCart className="w-3.5 h-3.5" /> Procurement
                {shortageAlertCount > 0 && (
                  <span className="ml-1 rounded-full bg-red-100 text-red-700 text-[12px] font-bold px-1.5 py-0.5">
                    {shortageAlertCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="materials" className="mt-3">
              <SectionHeader icon={Package} title="Material Demand by Month" badge={demand.materials.length} />
              {materialReadiness.total > 0 && (
                <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3" data-testid="material-readiness-panel">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      {materialReadiness.blockedCount === 0 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                      Material Readiness
                    </div>
                    <span className="text-xs text-slate-500" data-testid="material-readiness-count">
                      {materialReadiness.readyCount}/{materialReadiness.total} items ready
                      {materialReadiness.blockedCount > 0 && ` · ${materialReadiness.blockedCount} need setup`}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${materialReadiness.blockedCount === 0 ? "bg-emerald-500" : "bg-amber-400"}`}
                      style={{ width: `${materialReadiness.total ? Math.round((materialReadiness.readyCount / materialReadiness.total) * 100) : 0}%` }}
                    />
                  </div>
                  {materialReadiness.groups.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {materialReadiness.groups.map((g, i) => (
                        <div key={i} className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2" data-testid={`readiness-group-${i}`}>
                          <div className="flex items-start gap-2 text-xs font-medium text-amber-800">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <span>{g.reason} <span className="font-normal text-amber-700">({g.items.length} item{g.items.length > 1 ? "s" : ""})</span></span>
                          </div>
                          <ul className="mt-1 ml-5 space-y-0.5">
                            {g.items.slice(0, 6).map((it, j) => (
                              <li key={j} className="flex items-center gap-2 text-[11px] text-slate-600">
                                <span className="truncate flex-1 min-w-0">
                                  {it.itemCode ? <span className="font-mono text-slate-500">{it.itemCode} </span> : null}{it.description}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/work-program/${projectId}?recipeItem=${it.id}`)}
                                  className="flex-shrink-0 inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                                  data-testid={`button-configure-item-${it.id}`}
                                >
                                  <Settings2 className="w-3 h-3" /> Configure
                                </button>
                              </li>
                            ))}
                            {g.items.length > 6 && (
                              <li className="text-[11px] text-slate-400">+{g.items.length - 6} more…</li>
                            )}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <MaterialsTable demand={demand} project={project} structureItemDescriptions={structureItemDescriptions} />
            </TabsContent>

            <TabsContent value="equipment" className="mt-3">
              <SectionHeader icon={Wrench} title="Equipment Hours by Month" badge={demand.equipment.length} />
              <EquipmentTable demand={demand} project={project} />
            </TabsContent>

            <TabsContent value="labour" className="mt-3">
              <SectionHeader icon={Users} title="Labour Days by Month" badge={demand.labour.length} />
              <LabourTable demand={demand} project={project} />
            </TabsContent>

            <TabsContent value="by-item" className="mt-3">
              <SectionHeader icon={LayoutList} title="Demand by BOQ Item" />
              <ItemWiseTable demand={demand} unprogrammedDescriptions={unprogrammedDescriptions} items={bomData?.items ?? []} programmeBars={programmeBars} />
            </TabsContent>

            <TabsContent value="plan-vs-actual" className="mt-3">
              <SectionHeader icon={GitCompareArrows} title="Plan vs Actual" />
              <PlanVsActualTable projectId={projectId} />
              {dprsLoading && (
                <div className="flex justify-center py-10 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading actuals…
                </div>
              )}
              <div className="mt-6">
                <SectionHeader icon={GitCompareArrows} title="Equipment &amp; Labour Productivity" />
                {!dprsLoading && bomData && (
                  <EquipLabourPlanVsActualTable
                    items={bomData.items}
                    bars={bomData.bars ?? []}
                    totalMonths={project.totalMonths ?? 12}
                    dprs={dprsWithDetails}
                    projectId={projectId}
                    programmeBars={programmeBars}
                    actualQtyByItem={actualQtyByItem}
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="procurement" className="mt-3">
              <SectionHeader icon={ShoppingCart} title="Material Procurement Intelligence" />
              {shortageLoading && (
                <div className="flex justify-center py-10 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Checking stock…
                </div>
              )}
              {shortageIsError && !shortageLoading && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-5 space-y-3">
                  <p className="font-semibold text-red-800">Procurement analysis could not be loaded.</p>
                  {shortageError instanceof Error && shortageError.message && (
                    <p className="text-sm text-red-700 font-mono break-all">{shortageError.message}</p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refetchShortage()}
                    className="border-red-300 text-red-700 hover:bg-red-100"
                  >
                    Retry
                  </Button>
                </div>
              )}
              {!shortageLoading && !shortageIsError && shortageData && (
                <ProcurementTable
                  data={shortageData}
                  projectId={projectId}
                  projectLinkedSiteId={project?.siteId}
                  horizonMode={horizonMode}
                  horizonCustomDate={horizonCustomDate}
                  onHorizonChange={(mode, custom) => { setHorizonMode(mode); setHorizonCustomDate(custom); }}
                  onMappingResolved={() => refetchShortage()}
                />
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Procurement tab when demand not yet loaded — still show shortage panel */}
      {!isLoading && !demand && activeTab === "procurement" && (
        <div className="space-y-3">
          <SectionHeader icon={ShoppingCart} title="Material Procurement Intelligence" />
          <EmptyState label="Add Work Programme bars and material recipes to enable shortage analysis." />
        </div>
      )}
    </div>
  );
}
