import { useMemo, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import {
  ChevronRight, FileSpreadsheet, BookOpen, Loader2,
  Package, Wrench, Users, CalendarDays, ChevronDown, ChevronUp, Zap, PencilLine,
  LayoutList, ShoppingCart, AlertTriangle, CheckCircle2, Info, Settings2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  calculateBomDemand,
  monthLabel,
  fmtQty,
  type BomDemand,
  type BomInputItem,
  type BomInputBar,
} from "@shared/planningEngine";
import { shortItemName } from "@/lib/itemName";
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
}: {
  demand: BomDemand;
  project: BoqProject;
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
                    <div className="flex items-center gap-1.5">
                      {isExpanded
                        ? <ChevronUp className="w-3 h-3 text-teal-500 flex-shrink-0" />
                        : <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      }
                      <span className="font-medium text-slate-700">{row.materialName}</span>
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
  materials: Array<{ name: string; uom: string; qty: number; qtyPerUnit: number }>;
  equipment: Array<{ name: string; hours: number; hrsPerUnit: number }>;
  labour: Array<{ name: string; days: number; daysPerUnit: number }>;
}

function computeItemDemand(demand: BomDemand, unprogrammedDescriptions: Set<string>): ItemDemandRow[] {
  const map = new Map<string, ItemDemandRow>();
  const get = (desc: string): ItemDemandRow => {
    if (!map.has(desc)) {
      map.set(desc, {
        description: desc,
        unit: "",
        workQty: 0,
        isProgrammed: !unprogrammedDescriptions.has(desc),
        materials: [],
        equipment: [],
        labour: [],
      });
    }
    return map.get(desc)!;
  };
  for (const mat of demand.materials) {
    for (const bd of mat.breakdown) {
      const row = get(bd.itemDescription);
      row.workQty = Math.max(row.workQty, bd.workQty);
      const ex = row.materials.find(m => m.name === mat.materialName);
      if (ex) { ex.qty += bd.lineQty; }
      else row.materials.push({ name: mat.materialName, uom: mat.uom, qty: bd.lineQty, qtyPerUnit: bd.qtyPerUnit });
    }
  }
  for (const eq of demand.equipment) {
    for (const bd of eq.breakdown) {
      const row = get(bd.itemDescription);
      const ex = row.equipment.find(e => e.name === eq.equipmentName);
      if (ex) { ex.hours += bd.lineHours; }
      else row.equipment.push({ name: eq.equipmentName, hours: bd.lineHours, hrsPerUnit: bd.hrsPerUnit });
    }
  }
  for (const lb of demand.labour) {
    for (const bd of lb.breakdown) {
      const row = get(bd.itemDescription);
      const ex = row.labour.find(l => l.name === lb.designation);
      if (ex) { ex.days += bd.lineDays; }
      else row.labour.push({ name: lb.designation, days: bd.lineDays, daysPerUnit: bd.daysPerUnit });
    }
  }
  return [...map.values()];
}

function ItemWiseTable({ demand, unprogrammedDescriptions }: { demand: BomDemand; unprogrammedDescriptions: Set<string> }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = useMemo(() => computeItemDemand(demand, unprogrammedDescriptions), [demand, unprogrammedDescriptions]);

  if (!rows.length) return <EmptyState label="No item demand. Add recipes and work programme bars first." />;

  const toggle = (desc: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(desc)) next.delete(desc); else next.add(desc);
      return next;
    });
  };

  const programmed = rows.filter(r => r.isProgrammed);
  const unprogrammed = rows.filter(r => !r.isProgrammed);

  const renderRows = (rowList: ItemDemandRow[]) => rowList.map(row => {
    const open = expanded.has(row.description);
    const totalRes = row.materials.length + row.equipment.length + row.labour.length;
    return (
      <div key={row.description} className="rounded-xl border overflow-hidden">
        <div
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors ${open ? "bg-slate-100" : "bg-white hover:bg-slate-50"}`}
          onClick={() => toggle(row.description)}
        >
          {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-700 truncate">
              {row.itemCode ? <span className="font-mono text-[12px] text-muted-foreground mr-1">[{row.itemCode}]</span> : null}
              {shortItemName(row.description)}
            </span>
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
  currentStock: number;
  stockMatched: boolean;
  shortfall: number;
  suggestion: "adequate" | "monitor" | "raise_irn" | "raise_pi";
}

interface ShortageData {
  rows: ShortageRow[];
  hasBars: boolean;
  hasRecipes: boolean;
}

function SuggestionBadge({ suggestion }: { suggestion: ShortageRow["suggestion"] }) {
  if (suggestion === "adequate") return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Adequate
    </span>
  );
  if (suggestion === "monitor") return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      <Info className="w-3 h-3" /> Monitor stock
    </span>
  );
  return (
    <div className="flex flex-wrap gap-1">
      {suggestion === "raise_irn" && (
        <Link href="/irn/new">
          <a className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 hover:bg-orange-100 transition-colors">
            <ShoppingCart className="w-3 h-3" /> Raise IRN
          </a>
        </Link>
      )}
      {suggestion === "raise_pi" && (
        <Link href="/plant/purchase-indents">
          <a className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-100 transition-colors">
            <ShoppingCart className="w-3 h-3" /> Raise PI
          </a>
        </Link>
      )}
    </div>
  );
}

function ProcurementTable({ data, projectId }: { data: ShortageData; projectId: number }) {
  if (!data.hasBars) return (
    <EmptyState label="Add stretches to the Work Programme first to generate demand." />
  );
  if (!data.hasRecipes) return (
    <EmptyState label="Configure material recipes on BOQ items to enable shortage analysis." />
  );
  if (!data.rows.length) return (
    <EmptyState label="No material demand found. Check recipes on BOQ items." />
  );

  const shortageCount = data.rows.filter(r => r.shortfall > 0).length;

  return (
    <div className="space-y-3">
      {/* Info note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Planning intelligence only.</span>{" "}
          Existing manual IRN and PI creation is unchanged — you can raise them at any time from their respective pages.
          This table shows shortfalls compared to current plant stock.
          {!data.rows.some(r => r.stockMatched) && (
            <span className="block mt-1 text-amber-700">
              ⚠ No stock records matched by name. Ensure plant materials are configured in the Plant module.
            </span>
          )}
        </div>
      </div>

      {shortageCount > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-800 font-semibold">
            {shortageCount} material{shortageCount > 1 ? "s" : ""} below demand. Action recommended.
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="text-sm border-collapse w-full" style={{ minWidth: 600 }}>
          <thead>
            <tr style={{ background: "#0F5F64" }}>
              <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 z-10 min-w-[200px]" style={{ background: "#0F5F64" }}>Material</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[50px]">Unit</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Total Demand</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Current Stock</th>
              <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px]">Shortfall</th>
              <th className="px-3 py-2 font-semibold text-white text-left min-w-[130px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => (
              <tr
                key={row.materialName}
                className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${row.shortfall > 0 ? "bg-red-50/30" : ""}`}
                data-testid={`shortage-row-${row.materialName}`}
              >
                <td className={`px-3 py-2 font-medium sticky left-0 z-10 ${row.shortfall > 0 ? "bg-red-50/50" : "bg-white"}`}>
                  <span className="text-slate-700">{row.materialName}</span>
                  {!row.stockMatched && (
                    <span className="ml-1 text-xs text-amber-500 italic">(no stock match)</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground">{row.uom}</td>
                <td className="px-2 py-2 text-right font-mono font-semibold text-teal-700">
                  {fmtQty(row.totalDemand, 1)}
                </td>
                <td className={`px-2 py-2 text-right font-mono font-semibold ${row.currentStock > 0 ? "text-slate-700" : "text-slate-300"}`}>
                  {row.stockMatched ? fmtQty(row.currentStock, 1) : "—"}
                </td>
                <td className={`px-2 py-2 text-right font-mono font-semibold ${row.shortfall > 0 ? "text-red-700" : "text-emerald-600"}`}>
                  {row.shortfall > 0 ? fmtQty(row.shortfall, 1) : "—"}
                </td>
                <td className="px-3 py-2">
                  <SuggestionBadge suggestion={row.suggestion} />
                </td>
              </tr>
            ))}
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
  const [activeTab, setActiveTab] = useState("materials");

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

  const { data: shortageData, isLoading: shortageLoading } = useQuery<ShortageData>({
    queryKey: ["/api/boq/projects", projectId, "shortage-check"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/shortage-check`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch shortage data");
      return res.json();
    },
    enabled: !isNaN(projectId) && activeTab === "procurement",
  });

  const demand = useMemo((): BomDemand | null => {
    if (!bomData || !project) return null;
    const { items, bars } = bomData;
    if (!items.length) return null;
    // Allow demand even with no bars — items without bars use their currentQty
    return calculateBomDemand(items, bars ?? [], project.totalMonths ?? 12);
  }, [bomData, project]);

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

  const shortageAlertCount = shortageData?.rows.filter(r => r.shortfall > 0).length ?? 0;

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
              <MaterialsTable demand={demand} project={project} />
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
              <ItemWiseTable demand={demand} unprogrammedDescriptions={unprogrammedDescriptions} />
            </TabsContent>

            <TabsContent value="procurement" className="mt-3">
              <SectionHeader icon={ShoppingCart} title="Material Procurement Intelligence" />
              {shortageLoading && (
                <div className="flex justify-center py-10 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Checking stock…
                </div>
              )}
              {!shortageLoading && shortageData && (
                <ProcurementTable data={shortageData} projectId={projectId} />
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
