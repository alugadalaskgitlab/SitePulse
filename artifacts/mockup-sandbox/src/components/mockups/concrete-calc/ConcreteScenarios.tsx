import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, TrendingUp, GitCompare,
  FlaskConical, Minus, Plus, Info, BookmarkPlus, AlertCircle,
  Check, X, PencilLine
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

// The contractor's offered BOQ rate for this drain item (₹/m³)
const CONTRACT_RATE = 12800;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceVariable {
  key: string;
  label: string;
  unit: string;
  baseValue: number;
  whatIfValue: number;
  category: "material" | "labour" | "plant" | "finance";
  sensitivity10pct: number;  // ₹/m³ impact when this variable changes 10%
  rankOrder: number;
}

interface ScenarioColumn {
  id: string;
  label: string;
  tag?: string;
  tagColor?: string;
  isBase?: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const INITIAL_VARS: PriceVariable[] = [
  { key: "cement",    label: "Cement (OPC 53)",             unit: "₹/bag (50 kg)",          baseValue: 420,   whatIfValue: 420,   category: "material", sensitivity10pct: 319, rankOrder: 1 },
  { key: "admixture", label: "Admixture (Plasticizer)",     unit: "₹/litre",                 baseValue: 120,   whatIfValue: 120,   category: "material", sensitivity10pct: 103, rankOrder: 2 },
  { key: "ca_20mm",   label: "Coarse Agg 20mm",            unit: "₹/MT",                    baseValue: 1350,  whatIfValue: 1350,  category: "material", sensitivity10pct: 82,  rankOrder: 3 },
  { key: "ca_10mm",   label: "Coarse Agg 10mm",            unit: "₹/MT",                    baseValue: 1450,  whatIfValue: 1450,  category: "material", sensitivity10pct: 44,  rankOrder: 4 },
  { key: "ca_6mm",    label: "Coarse Agg 6mm / Grit",      unit: "₹/MT",                    baseValue: 1550,  whatIfValue: 1550,  category: "material", sensitivity10pct: 18,  rankOrder: 5 },
  { key: "fine_agg",  label: "Fine Aggregate (Sand)",       unit: "₹/CFT (incl. bulkage)",  baseValue: 75,    whatIfValue: 75,    category: "material", sensitivity10pct: 78,  rankOrder: 6 },
  { key: "steel_8mm", label: "Steel — 8mm Bars",           unit: "₹/MT",                    baseValue: 65500, whatIfValue: 65500, category: "material", sensitivity10pct: 52,  rankOrder: 7 },
  { key: "steel_12",  label: "Steel — 12mm+ Bars",         unit: "₹/MT",                    baseValue: 63000, whatIfValue: 63000, category: "material", sensitivity10pct: 48,  rankOrder: 8 },
  { key: "batching",  label: "Batching Mode (Ajax/Drum)",  unit: "₹/m³",                    baseValue: 252,   whatIfValue: 252,   category: "plant",    sensitivity10pct: 25,  rankOrder: 9 },
  { key: "staging",   label: "Staging System",             unit: "₹/m²/month",              baseValue: 620,   whatIfValue: 620,   category: "plant",    sensitivity10pct: 18,  rankOrder: 10 },
  { key: "curing",    label: "Curing (Water + Compound)",  unit: "₹/m³",                    baseValue: 88,    whatIfValue: 88,    category: "labour",   sensitivity10pct: 9,   rankOrder: 11 },
  { key: "margin",    label: "Contractor Margin",          unit: "% of direct cost",         baseValue: 12,    whatIfValue: 12,    category: "finance",  sensitivity10pct: 218, rankOrder: 12 },
];

const BASE_COST = 11354; // ₹/m³

// Derived ₹/m³ values for comparison columns
type CostBreakdown = {
  cement: number; agg_coarse: number; agg_fine: number; steel: number;
  batching: number; formwork: number; curing: number; labour: number;
  admixture: number; wastage_risk: number; margin: number; total: number;
};

const DERIVED_PER_M3: Record<string, CostBreakdown> = {
  base:  { cement: 3192, agg_coarse: 1256, agg_fine: 778, steel: 2440, batching: 252, formwork: 580, curing: 88, labour: 340, admixture: 1026, wastage_risk: 239, margin: 1163, total: 11354 },
  sc_a:  { cement: 3192, agg_coarse: 1026, agg_fine: 690, steel: 2440, batching: 252, formwork: 580, curing: 88, labour: 340, admixture: 1026, wastage_risk: 202, margin: 1088, total: 10924 },
  sc_b:  { cement: 3420, agg_coarse: 1256, agg_fine: 778, steel: 2440, batching: 197, formwork: 580, curing: 88, labour: 340, admixture: 1026, wastage_risk: 239, margin: 1158, total: 11322 },
  sc_c:  { cement: 3496, agg_coarse: 1256, agg_fine: 778, steel: 2440, batching: 252, formwork: 580, curing: 88, labour: 340, admixture: 1026, wastage_risk: 239, margin: 1175, total: 11470 },
};

const INITIAL_COLUMNS: ScenarioColumn[] = [
  { id: "base", label: "Base Estimate",         isBase: true },
  { id: "sc_a", label: "Robosand + Cheaper CA", tag: "Scenario A", tagColor: "bg-violet-100 text-violet-700" },
  { id: "sc_b", label: "Own Ajax + Higher Cem", tag: "Scenario B", tagColor: "bg-amber-100 text-amber-700" },
];

const categoryColors: Record<string, string> = {
  material: "bg-blue-50 text-blue-700 border-blue-100",
  plant:    "bg-amber-50 text-amber-700 border-amber-100",
  labour:   "bg-green-50 text-green-700 border-green-100",
  finance:  "bg-purple-50 text-purple-700 border-purple-100",
};

function fmtCur(v: number) {
  return "₹" + Math.round(v).toLocaleString("en-IN");
}

function marginColor(pct: number) {
  if (pct >= 10) return "text-green-700";
  if (pct >= 5)  return "text-amber-600";
  return "text-red-600";
}

function marginBadge(pct: number) {
  if (pct >= 10) return "bg-green-100 text-green-700 border-green-200";
  if (pct >= 5)  return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
}

// ─── Price Impact Tab ─────────────────────────────────────────────────────────

function PriceImpactTab() {
  const [vars, setVars] = useState<PriceVariable[]>(INITIAL_VARS);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");

  const updateWhatIf = (key: string, val: number) => {
    setVars(prev => prev.map(v => v.key === key ? { ...v, whatIfValue: val } : v));
  };

  const resetVar = (key: string) => {
    setVars(prev => prev.map(v => v.key === key ? { ...v, whatIfValue: v.baseValue } : v));
  };

  const resetAll = () => {
    setVars(prev => prev.map(v => ({ ...v, whatIfValue: v.baseValue })));
    setActiveKey(null);
    setSaveModalOpen(false);
  };

  const hasChanges = vars.some(v => Math.abs(v.whatIfValue - v.baseValue) > 0.001);

  // Combined ∆ ₹/m³ from all what-if changes
  const totalImpact = vars.reduce((sum, v) => {
    const delta = v.whatIfValue - v.baseValue;
    if (Math.abs(delta) < 0.001) return sum;
    const pctChange = v.baseValue !== 0 ? delta / v.baseValue : 0;
    return sum + (pctChange * v.sensitivity10pct / 0.1);
  }, 0);

  const revisedCost = BASE_COST + Math.round(totalImpact);
  const baseBOQMargin = ((CONTRACT_RATE - BASE_COST) / CONTRACT_RATE) * 100;
  const revisedBOQMargin = ((CONTRACT_RATE - revisedCost) / CONTRACT_RATE) * 100;
  const boqMarginDelta = revisedBOQMargin - baseBOQMargin;

  const sortedVars = [...vars]
    .filter(v => categoryFilter === "all" || v.category === categoryFilter)
    .sort((a, b) => a.rankOrder - b.rankOrder);

  return (
    <div className="flex flex-col gap-4">

      {/* Impact Banner */}
      <div className={`rounded-xl border p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
        Math.abs(totalImpact) < 1
          ? "bg-slate-50 border-slate-200"
          : totalImpact > 0
            ? "bg-red-50 border-red-200"
            : "bg-green-50 border-green-200"
      }`}>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Combined What-If Impact on Final Rate</p>
          <p className={`text-2xl font-bold tabular-nums ${
            Math.abs(totalImpact) < 1 ? "text-slate-700" : totalImpact > 0 ? "text-red-700" : "text-green-700"
          }`}>
            {Math.abs(totalImpact) < 1
              ? "No changes — edit any row below"
              : `${totalImpact > 0 ? "+" : ""}${fmtCur(Math.round(totalImpact))} / m³`}
          </p>
          {hasChanges && (
            <p className="text-xs text-slate-500 mt-1">
              Base: {fmtCur(BASE_COST)}/m³ → Revised: {fmtCur(revisedCost)}/m³
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {hasChanges ? (
            <>
              <Button size="sm" variant="outline" onClick={resetAll} className="text-slate-600 border-slate-300">
                Reset All
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                onClick={() => { setScenarioName(""); setSaveModalOpen(true); }}>
                <BookmarkPlus className="h-4 w-4" />
                Save as Scenario
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Info className="h-3.5 w-3.5 text-slate-400" />
              Edit any value below to see cost impact
            </div>
          )}
        </div>
      </div>

      {/* BOQ Margin Impact (only shown when changes exist) */}
      {hasChanges && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-slate-200 shadow-none">
            <CardContent className="p-3">
              <p className="text-xs text-slate-500 font-medium mb-1">Contract Rate</p>
              <p className="text-base font-bold text-slate-800">{fmtCur(CONTRACT_RATE)}/m³</p>
              <p className="text-xs text-slate-400 mt-0.5">NH-48 Drain BOQ rate</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-none">
            <CardContent className="p-3">
              <p className="text-xs text-slate-500 font-medium mb-1">Base BOQ Margin</p>
              <p className={`text-base font-bold ${marginColor(baseBOQMargin)}`}>
                {baseBOQMargin.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-400 mt-0.5">at {fmtCur(BASE_COST)}/m³ cost</p>
            </CardContent>
          </Card>
          <Card className={`shadow-none ${
            revisedBOQMargin >= 10 ? "border-green-200 bg-green-50"
            : revisedBOQMargin >= 5 ? "border-amber-200 bg-amber-50"
            : "border-red-200 bg-red-50"
          }`}>
            <CardContent className="p-3">
              <p className="text-xs text-slate-500 font-medium mb-1">Revised BOQ Margin</p>
              <p className={`text-base font-bold ${marginColor(revisedBOQMargin)}`}>
                {revisedBOQMargin.toFixed(1)}%
              </p>
              <p className={`text-xs mt-0.5 font-semibold ${marginColor(revisedBOQMargin)}`}>
                {boqMarginDelta > 0 ? "+" : ""}{boqMarginDelta.toFixed(1)} pp vs base
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Save as Scenario inline panel */}
      {saveModalOpen && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <BookmarkPlus className="h-5 w-5 text-blue-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800 mb-2">Name this scenario</p>
            <div className="flex gap-2">
              <Input
                value={scenarioName}
                onChange={e => setScenarioName(e.target.value)}
                placeholder='e.g. "Higher cement price — April quote"'
                className="text-sm h-8 flex-1 bg-white border-blue-300 focus-visible:ring-blue-500"
                autoFocus
              />
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-8"
                disabled={!scenarioName.trim()}
                onClick={() => setSaveModalOpen(false)}>
                <Check className="h-3.5 w-3.5" /> Save
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-slate-500"
                onClick={() => setSaveModalOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Category Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all","material","plant","labour","finance"].map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              categoryFilter === cat
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            {cat === "all" ? "All Categories" : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Variables Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs">
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide">Variable</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide w-28">Base Value</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide w-36">What-If</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide w-32">10% Sensitivity</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide w-36">Impact (∆/m³)</th>
              </tr>
            </thead>
            <tbody>
              {sortedVars.map((v, idx) => {
                const changed = Math.abs(v.whatIfValue - v.baseValue) > 0.001;
                const delta = v.whatIfValue - v.baseValue;
                const pctChange = v.baseValue !== 0 ? delta / v.baseValue : 0;
                const impactPerM3 = pctChange * v.sensitivity10pct / 0.1;
                const isActive = activeKey === v.key;

                return (
                  <React.Fragment key={v.key}>
                    <tr
                      className={`border-b border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer ${
                        changed ? "bg-blue-50/30" : ""
                      } ${isActive ? "bg-blue-50" : ""}`}
                      onClick={() => setActiveKey(isActive ? null : v.key)}
                    >
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono">{String(idx + 1).padStart(2, "0")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{v.label}</span>
                          <Badge className={`text-xs border px-1.5 py-0 ${categoryColors[v.category]}`}>
                            {v.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{v.unit}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {v.baseValue.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="h-6 w-6 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 flex items-center justify-center"
                            onClick={() => updateWhatIf(v.key, parseFloat((v.whatIfValue * 0.95).toFixed(2)))}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <Input
                            type="number"
                            value={v.whatIfValue}
                            onChange={e => updateWhatIf(v.key, parseFloat(e.target.value) || v.baseValue)}
                            className={`h-7 w-24 text-right text-sm font-mono px-2 ${
                              changed ? "border-blue-400 ring-1 ring-blue-200 bg-white" : ""
                            }`}
                          />
                          <button
                            className="h-6 w-6 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 flex items-center justify-center"
                            onClick={() => updateWhatIf(v.key, parseFloat((v.whatIfValue * 1.05).toFixed(2)))}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        {changed && (
                          <button
                            className="text-xs text-slate-400 hover:text-slate-700 mt-1 ml-auto block"
                            onClick={() => resetVar(v.key)}
                          >
                            reset
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-medium text-slate-700 tabular-nums">
                            {fmtCur(v.sensitivity10pct)}/m³
                          </span>
                          <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                              style={{ width: `${Math.min(100, (v.sensitivity10pct / 320) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {changed ? (
                          <div>
                            <span className={`font-bold tabular-nums ${impactPerM3 > 0 ? "text-red-600" : "text-green-600"}`}>
                              {impactPerM3 > 0 ? "+" : ""}{fmtCur(Math.round(impactPerM3))}/m³
                            </span>
                            <span className={`block text-xs mt-0.5 ${delta > 0 ? "text-red-400" : "text-green-400"}`}>
                              {delta > 0 ? "+" : ""}{(pctChange * 100).toFixed(1)}% change
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                    {isActive && (
                      <tr className="bg-blue-50 border-b border-blue-100">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="bg-white border border-blue-200 rounded-lg p-3 text-sm text-slate-700">
                            <div className="flex items-start gap-2">
                              <FlaskConical className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-medium text-blue-800 mb-1">Sensitivity: {v.label}</p>
                                <p className="text-slate-600 text-xs leading-relaxed">
                                  A 10% change in this variable moves the final ₹/m³ rate by{" "}
                                  <strong>{fmtCur(v.sensitivity10pct)}</strong>.{" "}
                                  Ranked <strong>#{v.rankOrder}</strong> by cost sensitivity.{" "}
                                  {v.rankOrder <= 3 && <span className="text-amber-700 font-medium">High-impact — negotiate this rate to protect margins.</span>}
                                  {v.rankOrder > 3 && v.rankOrder <= 7 && <span className="text-blue-700">Moderate influence — track market changes.</span>}
                                  {v.rankOrder > 7 && <span className="text-slate-500">Lower sensitivity — minor adjustments won't significantly shift the rate.</span>}
                                </p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Compare Scenarios Tab ────────────────────────────────────────────────────

const MAX_EXTRA_SCENARIOS = 3;

function CompareScenariosTab() {
  const [columns, setColumns] = useState<ScenarioColumn[]>(INITIAL_COLUMNS);
  const [addingScenario, setAddingScenario] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState("");

  const extraScenarios = columns.filter(c => !c.isBase);
  const atMaxScenarios = extraScenarios.length >= MAX_EXTRA_SCENARIOS;

  const colIds = columns.map(c => c.id);

  function get(colId: string, field: keyof CostBreakdown) {
    return DERIVED_PER_M3[colId]?.[field] ?? 0;
  }

  function delta(colId: string, field: keyof CostBreakdown) {
    if (colId === "base") return null;
    return get(colId, field) - get("base", field);
  }

  // BOQ margin % = (contract rate - total cost) / contract rate × 100
  function boqMargin(colId: string) {
    const cost = get(colId, "total");
    return ((CONTRACT_RATE - cost) / CONTRACT_RATE) * 100;
  }

  const thBase = "px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap";
  const tdRight = "px-3 py-2.5 text-right tabular-nums text-sm";

  function DeltaBadge({ d }: { d: number | null }) {
    if (d === null) return null;
    if (Math.abs(d) < 1) return <span className="block text-xs text-slate-300 mt-0.5">—</span>;
    return (
      <span className={`block text-xs font-semibold mt-0.5 ${d > 0 ? "text-red-500" : "text-green-600"}`}>
        {d > 0 ? "+" : ""}{fmtCur(Math.round(d))}
      </span>
    );
  }

  function CellVal({ colId, field, bold }: { colId: string; field: keyof CostBreakdown; bold?: boolean }) {
    const v = get(colId, field);
    const d = delta(colId, field);
    const isBase = colId === "base";
    const isChanged = d !== null && Math.abs(d) > 1;
    return (
      <td className={`${tdRight} ${isChanged ? (d > 0 ? "bg-red-50" : "bg-green-50") : ""}`}>
        <span className={`${bold ? "font-bold" : "font-medium"} ${
          isBase ? "text-slate-800"
          : isChanged ? (d > 0 ? "text-red-700" : "text-green-700")
          : "text-slate-600"
        }`}>
          {fmtCur(v)}/m³
        </span>
        <DeltaBadge d={d} />
      </td>
    );
  }

  const scenarioLetters = ["A","B","C","D","E"];
  const saveNewScenario = () => {
    if (!newScenarioName.trim()) return;
    const idx = columns.filter(c => !c.isBase).length;
    const letter = scenarioLetters[idx] ?? String(idx + 1);
    const newId = `sc_user_${idx}`;
    setColumns(prev => [...prev, {
      id: newId, label: newScenarioName.trim(),
      tag: `Scenario ${letter}`, tagColor: "bg-teal-100 text-teal-700"
    }]);
    // Also add a derived row using base values (in real impl, capture current calc state)
    DERIVED_PER_M3[newId] = { ...DERIVED_PER_M3["base"] };
    setAddingScenario(false);
    setNewScenarioName("");
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Scenario chips + Add */}
      <div className="flex flex-wrap gap-3 items-center">
        {columns.map(col => (
          <div key={col.id} className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
            col.isBase ? "bg-slate-100 border-slate-300" : "bg-white border-slate-200 shadow-sm"
          }`}>
            {col.tag && <Badge className={`text-xs ${col.tagColor}`}>{col.tag}</Badge>}
            <span className="text-sm font-medium text-slate-800">{col.label}</span>
          </div>
        ))}

        {!addingScenario && !atMaxScenarios ? (
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
            onClick={() => { setAddingScenario(true); setNewScenarioName(""); }}
          >
            <Plus className="h-4 w-4" /> Save Current as Scenario
          </button>
        ) : !addingScenario && atMaxScenarios ? (
          <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-slate-200 text-sm text-slate-300 cursor-not-allowed" title="Maximum 3 scenarios reached">
            <Plus className="h-4 w-4" /> Max 3 Scenarios
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-blue-300 bg-blue-50">
            <PencilLine className="h-4 w-4 text-blue-500 shrink-0" />
            <Input
              value={newScenarioName}
              onChange={e => setNewScenarioName(e.target.value)}
              placeholder='Scenario name…'
              className="h-7 w-44 text-sm border-none shadow-none bg-transparent focus-visible:ring-0 px-1"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") saveNewScenario(); if (e.key === "Escape") setAddingScenario(false); }}
            />
            <button className="text-blue-600 hover:text-blue-800" onClick={saveNewScenario} disabled={!newScenarioName.trim()}>
              <Check className="h-4 w-4" />
            </button>
            <button className="text-slate-400 hover:text-slate-700" onClick={() => setAddingScenario(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Main comparison table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="pb-0 pt-4 px-4 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-blue-500" />
            Cost Breakdown Comparison — RCC M25, Drain (NH-48 Km 12–18)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[820px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-44">Cost Component</th>
                  {columns.map(col => (
                    <th key={col.id} className={thBase}>
                      <span className="block">{col.isBase ? "Base" : col.tag}</span>
                      <span className="block text-slate-400 font-normal normal-case text-[10px] mt-0.5 max-w-[110px] ml-auto truncate">{col.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Materials */}
                <tr className="bg-blue-50/60 border-t border-blue-100">
                  <td colSpan={columns.length + 1} className="px-4 py-2 text-xs font-bold text-blue-700 uppercase tracking-widest">Materials</td>
                </tr>
                {[
                  { label: "Cement (OPC 53)", field: "cement" as const },
                  { label: "Coarse Aggregate", field: "agg_coarse" as const },
                  { label: "Fine Aggregate", field: "agg_fine" as const },
                  { label: "Admixture", field: "admixture" as const },
                  { label: "Steel (HYSD)", field: "steel" as const },
                ].map(row => (
                  <tr key={row.field} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{row.label}</td>
                    {colIds.map(id => <CellVal key={id} colId={id} field={row.field} />)}
                  </tr>
                ))}

                {/* Plant & Formwork */}
                <tr className="bg-amber-50/60 border-t border-amber-100">
                  <td colSpan={columns.length + 1} className="px-4 py-2 text-xs font-bold text-amber-700 uppercase tracking-widest">Plant & Formwork</td>
                </tr>
                {[
                  { label: "Batching Equipment", field: "batching" as const },
                  { label: "Formwork & Staging", field: "formwork" as const },
                ].map(row => (
                  <tr key={row.field} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{row.label}</td>
                    {colIds.map(id => <CellVal key={id} colId={id} field={row.field} />)}
                  </tr>
                ))}

                {/* Labour & Overheads */}
                <tr className="bg-green-50/60 border-t border-green-100">
                  <td colSpan={columns.length + 1} className="px-4 py-2 text-xs font-bold text-green-700 uppercase tracking-widest">Labour & Overheads</td>
                </tr>
                {[
                  { label: "Labour (Placing)", field: "labour" as const },
                  { label: "Curing", field: "curing" as const },
                  { label: "Wastage & Risk", field: "wastage_risk" as const },
                ].map(row => (
                  <tr key={row.field} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{row.label}</td>
                    {colIds.map(id => <CellVal key={id} colId={id} field={row.field} />)}
                  </tr>
                ))}

                {/* Margin */}
                <tr className="bg-purple-50/60 border-t border-purple-100">
                  <td colSpan={columns.length + 1} className="px-4 py-2 text-xs font-bold text-purple-700 uppercase tracking-widest">Contractor Margin</td>
                </tr>
                <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 text-slate-700 font-medium">Margin (12%)</td>
                  {colIds.map(id => <CellVal key={id} colId={id} field="margin" />)}
                </tr>

                {/* Grand Total */}
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                  <td className="px-4 py-3 text-slate-900 font-bold text-base">Total ₹/m³</td>
                  {colIds.map(id => {
                    const v = get(id, "total");
                    const d = delta(id, "total");
                    const isBase = id === "base";
                    const isChanged = d !== null && Math.abs(d) > 1;
                    return (
                      <td key={id} className={`${tdRight} ${isChanged ? (d > 0 ? "bg-red-100" : "bg-green-100") : "bg-slate-100"}`}>
                        <span className={`text-base font-bold ${
                          isBase ? "text-slate-900" : isChanged ? (d > 0 ? "text-red-700" : "text-green-700") : "text-slate-800"
                        }`}>
                          {fmtCur(v)}/m³
                        </span>
                        {d !== null && Math.abs(d) >= 1 && (
                          <span className={`block text-xs font-bold mt-0.5 ${d > 0 ? "text-red-600" : "text-green-600"}`}>
                            {d > 0 ? "+" : ""}{fmtCur(Math.round(d))} vs base
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* BOQ Margin % — KEY ROW */}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="px-4 py-3 text-slate-700 font-bold">
                    BOQ Margin %
                    <span className="block text-xs text-slate-400 font-normal mt-0.5">
                      Contract ₹{CONTRACT_RATE.toLocaleString("en-IN")}/m³
                    </span>
                  </td>
                  {colIds.map(id => {
                    const margin = boqMargin(id);
                    const baseMargin = boqMargin("base");
                    const isBase = id === "base";
                    const d = isBase ? null : margin - baseMargin;
                    return (
                      <td key={id} className={`${tdRight} ${
                        !isBase && d !== null && Math.abs(d) > 0.1
                          ? (d > 0 ? "bg-green-100" : "bg-red-50")
                          : ""
                      }`}>
                        <Badge className={`text-sm font-bold px-2 py-0.5 border ${marginBadge(margin)}`}>
                          {margin.toFixed(1)}%
                        </Badge>
                        {!isBase && d !== null && Math.abs(d) > 0.1 && (
                          <span className={`block text-xs font-semibold mt-1 ${d > 0 ? "text-green-600" : "text-red-600"}`}>
                            {d > 0 ? "+" : ""}{d.toFixed(1)} pp
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Savings summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {columns.filter(c => !c.isBase).slice(0, 3).map(col => {
          const base = get("base", "total");
          const sc = get(col.id, "total");
          const saving = base - sc;
          const margin = boqMargin(col.id);
          return (
            <Card key={col.id} className={`shadow-sm ${
              saving > 0 ? "border-green-200 bg-green-50" : saving < 0 ? "border-red-200 bg-red-50" : "border-slate-200"
            }`}>
              <CardContent className="p-4">
                <Badge className={`text-xs mb-2 ${col.tagColor}`}>{col.tag}</Badge>
                <p className="text-sm font-medium text-slate-700 mb-1 truncate">{col.label}</p>
                <p className={`text-xl font-bold tabular-nums ${
                  saving > 0 ? "text-green-700" : saving < 0 ? "text-red-700" : "text-slate-600"
                }`}>
                  {Math.abs(saving) < 1 ? "No change" : `${saving > 0 ? "−" : "+"}${fmtCur(Math.abs(Math.round(saving)))}/m³`}
                </p>
                <p className={`text-sm font-semibold mt-1.5 ${marginColor(margin)}`}>
                  BOQ Margin: {margin.toFixed(1)}%
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {Math.abs(saving) >= 1 ? `vs base (${saving > 0 ? "saved" : "extra cost"})` : "Same as base"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recommendation */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
        <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-blue-800 mb-1">Recommendation</p>
          <p className="text-blue-700 leading-relaxed">
            <strong>Scenario A (Robosand + Cheaper CA)</strong> offers the largest savings at{" "}
            <strong className="text-green-700">−₹430/m³</strong>, raising BOQ margin from{" "}
            <strong>{boqMargin("base").toFixed(1)}%</strong> to{" "}
            <strong className="text-green-700">{boqMargin("sc_a").toFixed(1)}%</strong>.
            For a 1,072 m³ drain job this equals <strong className="text-green-700">≈ ₹4.6 Lakhs</strong> in additional margin.
            Verify Robosand quality against IRC:SP:49 before substituting river sand.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ConcreteScenarios() {
  const [activeTab, setActiveTab] = useState("price-impact");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900 gap-1.5 hidden sm:flex">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center">
            <div className="h-8 w-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-sm mr-3 shadow-sm">
              HLC
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-800 leading-tight">
                NH-48 Drain Works — Km 12 to 18
              </h1>
              <p className="text-xs text-slate-400 leading-tight">RCC M25 · 1,072 m³ · M/s Sharma Constructions</p>
            </div>
          </div>
        </div>
        <Badge className="hidden sm:inline-flex bg-blue-100 text-blue-700 border-none text-xs font-semibold">
          ₹11,354/m³ base · Contract ₹12,800/m³
        </Badge>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border border-slate-200 shadow-sm p-1 h-auto rounded-xl">
            <TabsTrigger
              value="price-impact"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <TrendingUp className="h-4 w-4" />
              Price Impact
            </TabsTrigger>
            <TabsTrigger
              value="compare"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <GitCompare className="h-4 w-4" />
              Compare Scenarios
              <Badge className="ml-1 bg-slate-200 text-slate-600 text-xs px-1.5 py-0 data-[state=active]:bg-white/20 data-[state=active]:text-white">
                3
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="price-impact" className="mt-0">
            <PriceImpactTab />
          </TabsContent>

          <TabsContent value="compare" className="mt-0">
            <CompareScenariosTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default ConcreteScenarios;
