import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Save, Plus, Trash2, Info, TrendingUp, BarChart3, LogOut, MapPin, Building2, FileUp, ChevronDown, ChevronUp, HelpCircle, X, AlertTriangle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ConcreteEstimate } from "@shared/schema";
import { readEstimatorRole, signOutEstimator } from "@/lib/estimatorAuth";

const LS_KEY = "hlc_concrete_calc_v1";

// ─── Types ────────────────────────────────────────────────────────────────────

type AggUoM = "per_mt" | "per_cft" | "per_m3";

interface MixDesign { cementKg: number; caKg: number; faKg: number; wcRatio: number; admixPct: number; }
interface CATab { proportion: number; purchaseRate: number; uom: AggUoM; leadKm: number; freightRate: number; payload: number; }
interface CASourceOverride { purchaseRate: number; uom: AggUoM; leadKm: number; freightRate: number; payload: number; }
interface BatchingRow { id: string; type: string; model: string; mode: "own" | "hired"; depreciation: number; fuel: number; operator: number; output: number; outputPerMonth: number; hireRate: number; hireMode: "per_day" | "per_m3" | "per_month"; }
interface BOQItem { id: string; description: string; qty: number; unit: string; dimL: number; dimW: number; dimD: number; rate: number; contractorRate: number; }
interface BBSRow { id: string; mark: string; dia: number; shape: string; count: number; cutLength: number; overlapN: number; element: string; zoneId: string; countBasis: "spacing" | "manual"; spacingMm: number; }
interface SteelRates { r8: number; r10: number; r12: number; r16: number; r20: number; r25: number; }
interface WastageFlags { sandBulkage: boolean; cementWastage: boolean; cementWastagePct: number; steelCuttingWaste: boolean; steelCuttingPct: number; formworkDamage: boolean; formworkDamageReduction: number; curingWaterLoss: boolean; curingWaterLossPct: number; }
interface Scenario { id: string; name: string; changes: Record<string, number>; rates?: Record<string, number>; }
interface HeightZone { id: string; label: string; height: number; length: number; }
interface ElementGrades { pcc: string; invert: string; wall: string; topSlab: string; }
interface QtoState {
  clearSpan: number; wallThickness: number; invertSlabThick: number; topSlabThick: number;
  pccDepth: number; pccOffset: number; workingSpace: number;
  isCovered: boolean; topSlabType: "CIS" | "Precast"; precastRatePerM2: number;
  elementGrades: ElementGrades;
  weepholeDiaMm: number;
  gratingOpeningW: number; gratingOpeningD: number;
  bindingWireKgPerMT: number; bindingWireRatePerKg: number;
  liftingHookDia: number; liftingHookSpacingM: number; liftingHookRatePerNos: number;
  heightZones: HeightZone[];
  gratingsSpacing: number; weepholesSpacing: number;
  gratingRatePerNos: number; weepholeRatePerNos: number;
  pccRatePerM3: number; excavationRate: number; backfillRate: number;
  bwBaseWidth: number; bwStemThick: number; bwHeight: number; bwFootingDepth: number;
  bwOfferedRatePerM: number;
  zoneOfferedRates: Record<string, number>;
  showFormulaRef: boolean;
}

interface LocationVariant {
  id: string;
  name: string;
  lengthM: number;
  caSources: CASourceOverride[];
  faOverride: { purchaseRate: number; uom: AggUoM; leadKm: number; freightRate: number; payload: number; };
}

interface PettyLabourContract {
  enabled: boolean;
  rateValue: number;
  rateUnit: "per_m3" | "per_rm";
  contractorFormwork: boolean;
  contractorBBS: boolean;
}

interface CalcState {
  estimateName: string; preparedBy: string; date: string;
  structureType: string; grade: string; totalVolume: number; contractor: string;
  mix: MixDesign;
  cementBagPrice: number;
  caTabs: CATab[];
  faType: "natural" | "robosand";
  faPurchaseRate: number; faUom: AggUoM; faLeadKm: number; faFreightRate: number; faPayload: number; faBulkagePct: number;
  admixDosage: number; admixRate: number;
  batchingRows: BatchingRow[];
  placementMode: "own" | "hired" | "transit_mixer" | "labour"; placementRatePerDay: number; placementOutputPerDay: number;
  tmHirePerTrip: number; tmTripsPerDay: number;
  shutteringSystem: string; stagingSystem: string;
  shutteringAreaPerM3: number; shutteringCostPerM2: number; shutteringReuseCycles: number;
  stagingHeight: number; stagingHireRate: number; stagingMonths: number;
  waterCuringMode: "tanker" | "static";
  tankerCapKL: number; tankerTripsPerDay: number; tankerHireRate: number; curingDays: number;
  staticPumpKw: number; staticElecRate: number; staticWaterCostKL: number; staticDailyWaterKL: number;
  stagingAreaPerM3: number;
  curingCompoundEnabled: boolean; curingCompoundRate: number; curingCompoundCoverage: number; curingCompoundSurfaceArea: number;
  overheadPct: number; marginPct: number; escalationPct: number;
  labourRatePerM3: number;
  wastage: WastageFlags;
  boqItems: BOQItem[];
  bbsRows: BBSRow[];
  steelRates: SteelRates;
  contractRate: number;
  contractRateMode: "per_m3" | "per_rm";
  profitMode: "per_item" | "lumpsum";
  lumpsumContractAmt: number;
  scenarios: Scenario[];
  locationVariants: LocationVariant[];
  blendedMarkupPct: number;
  pettyLabour: PettyLabourContract;
  qto: QtoState;
}

// ─── Mix Design presets ────────────────────────────────────────────────────────

const MIX_PRESETS: Record<string, MixDesign> = {
  M10: { cementKg: 220, caKg: 1200, faKg: 800, wcRatio: 0.60, admixPct: 0.20 },
  M15: { cementKg: 280, caKg: 1180, faKg: 790, wcRatio: 0.58, admixPct: 0.25 },
  M20: { cementKg: 320, caKg: 1150, faKg: 750, wcRatio: 0.55, admixPct: 0.30 },
  M25: { cementKg: 380, caKg: 1100, faKg: 700, wcRatio: 0.50, admixPct: 0.35 },
  M30: { cementKg: 420, caKg: 1080, faKg: 680, wcRatio: 0.45, admixPct: 0.40 },
  M35: { cementKg: 450, caKg: 1050, faKg: 650, wcRatio: 0.42, admixPct: 0.45 },
  M40: { cementKg: 480, caKg: 1020, faKg: 620, wcRatio: 0.38, admixPct: 0.50 },
};

const STRUCTURE_TYPE_DEFAULTS: Record<string, { shutteringArea: number }> = {
  "Drain": { shutteringArea: 3.0 },
  "Box Culvert": { shutteringArea: 4.5 },
  "Bridge": { shutteringArea: 6.0 },
  "Retaining Wall": { shutteringArea: 2.5 },
};

const STRUCTURE_PRESETS: Record<string, string[]> = {
  "Drain": ["Invert Slab", "Side Walls", "Cover Slab"],
  "Box Culvert": ["Invert Slab", "Side Walls", "Roof Slab", "Wings"],
  "Bridge": ["Foundation", "Pier Cap", "Deck Slab", "Abutment"],
  "Retaining Wall": ["Foundation", "Stem Wall"],
};

const DIA_SIZES = [8, 10, 12, 16, 20, 25];
const HOOK_ALLOWANCE: Record<string, (dia: number) => number> = {
  "Straight": () => 0,
  "U-bar":    (d) => 2 * 9 * d / 1000,
  "L-bar":    (d) => 1 * 9 * d / 1000,
  "Ring":     (d) => 2 * 9 * d / 1000 + 10 * d / 1000,
  "Stirrup":  (d) => 2 * 9 * d / 1000 + 10 * d / 1000,
};

const MAX_SCENARIOS = 3;

// ─── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_STATE: CalcState = {
  estimateName: "", preparedBy: "", date: new Date().toISOString().split("T")[0],
  structureType: "Drain", grade: "M25", totalVolume: 100, contractor: "",
  mix: { ...MIX_PRESETS["M25"] },
  cementBagPrice: 380,
  caTabs: [
    { proportion: 60, purchaseRate: 1200, uom: "per_mt", leadKm: 20, freightRate: 3.5, payload: 9 },
    { proportion: 30, purchaseRate: 1300, uom: "per_mt", leadKm: 20, freightRate: 3.5, payload: 9 },
    { proportion: 10, purchaseRate: 1400, uom: "per_mt", leadKm: 25, freightRate: 3.5, payload: 9 },
  ],
  faType: "natural", faPurchaseRate: 55, faUom: "per_cft", faLeadKm: 15, faFreightRate: 3.5, faPayload: 9, faBulkagePct: 12,
  admixDosage: 0.35, admixRate: 90,
  batchingRows: [{ id: "b1", type: "Ajax Self-Loader", model: "Ajax 500L", mode: "hired", depreciation: 0, fuel: 0, operator: 0, output: 6, outputPerMonth: 0, hireRate: 2500, hireMode: "per_day" }],
  placementMode: "hired", placementRatePerDay: 3000, placementOutputPerDay: 20,
  tmHirePerTrip: 500, tmTripsPerDay: 10,
  shutteringSystem: "Steel Frame + Timber Ply", stagingSystem: "Prop & Beam",
  shutteringAreaPerM3: 3.0, shutteringCostPerM2: 180, shutteringReuseCycles: 20,
  stagingHeight: 3.5, stagingHireRate: 85, stagingMonths: 2,
  waterCuringMode: "tanker",
  tankerCapKL: 6, tankerTripsPerDay: 2, tankerHireRate: 800, curingDays: 7,
  staticPumpKw: 1.5, staticElecRate: 8, staticWaterCostKL: 30, staticDailyWaterKL: 2,
  stagingAreaPerM3: 1.5,
  curingCompoundEnabled: false, curingCompoundRate: 45, curingCompoundCoverage: 5, curingCompoundSurfaceArea: 2,
  overheadPct: 8, marginPct: 10, escalationPct: 2,
  labourRatePerM3: 350,
  wastage: {
    sandBulkage: true, cementWastage: true, cementWastagePct: 2,
    steelCuttingWaste: true, steelCuttingPct: 4,
    formworkDamage: false, formworkDamageReduction: 10,
    curingWaterLoss: false, curingWaterLossPct: 10,
  },
  boqItems: [],
  bbsRows: [],
  steelRates: { r8: 58000, r10: 57000, r12: 56500, r16: 56000, r20: 55500, r25: 55000 },
  contractRate: 15000,
  contractRateMode: "per_m3",
  profitMode: "per_item",
  lumpsumContractAmt: 0,
  scenarios: [],
  locationVariants: [],
  blendedMarkupPct: 0,
  pettyLabour: {
    enabled: false, rateValue: 3500, rateUnit: "per_m3",
    contractorFormwork: true, contractorBBS: true,
  },
  qto: {
    clearSpan: 800, wallThickness: 300, invertSlabThick: 300, topSlabThick: 300,
    pccDepth: 100, pccOffset: 150, workingSpace: 300,
    isCovered: false, topSlabType: "CIS", precastRatePerM2: 0,
    elementGrades: { pcc: "M15", invert: "M25", wall: "M25", topSlab: "M25" },
    weepholeDiaMm: 100,
    gratingOpeningW: 200, gratingOpeningD: 100,
    bindingWireKgPerMT: 10, bindingWireRatePerKg: 85,
    liftingHookDia: 12, liftingHookSpacingM: 2, liftingHookRatePerNos: 150,
    heightZones: [
      { id: "z1", label: "Zone 1", height: 900, length: 200 },
      { id: "z2", label: "Zone 2", height: 1200, length: 300 },
    ],
    gratingsSpacing: 3, weepholesSpacing: 1.5,
    gratingRatePerNos: 0, weepholeRatePerNos: 0,
    pccRatePerM3: 4500, excavationRate: 300, backfillRate: 200,
    bwBaseWidth: 2000, bwStemThick: 400, bwHeight: 3000, bwFootingDepth: 500,
    bwOfferedRatePerM: 0,
    zoneOfferedRates: {}, showFormulaRef: false,
  },
};

function loadState(): CalcState {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const loaded = JSON.parse(saved) as Partial<CalcState>;
      return {
        ...DEFAULT_STATE,
        ...loaded,
        contractRateMode: loaded.contractRateMode ?? "per_m3",
        pettyLabour: { ...DEFAULT_STATE.pettyLabour, ...(loaded.pettyLabour || {}) },
        qto: {
          ...DEFAULT_STATE.qto,
          ...(loaded.qto || {}),
          elementGrades: { ...DEFAULT_STATE.qto.elementGrades, ...(loaded.qto?.elementGrades || {}) },
        },
        bbsRows: (loaded.bbsRows || []).map((r: BBSRow) => ({ element: "Invert-Bottom", zoneId: "all", countBasis: "spacing", spacingMm: 200, ...r })),
      };
    }
  } catch {}
  return { ...DEFAULT_STATE };
}

// ─── Cost Calculations ─────────────────────────────────────────────────────────

interface CostBreakdown {
  cement: number; ca: number; fa: number; admix: number; steel: number;
  batching: number; placement: number; formwork: number; labour: number;
  curing: number; wastage: number; overhead: number; margin: number;
  total: number; totalWithEsc: number;
}

// Normalize aggregate purchase rate to ₹/MT
function aggRateToPerMT(rate: number, uom: AggUoM): number {
  if (uom === "per_cft") return rate * 35.315; // 1 m³ = 35.315 CFT, treating 1 m³ ≈ 1 MT
  return rate; // per_mt or per_m3 treated same as per_mt
}

function computeCosts(s: CalcState, steelCostPerM3 = 0, locCASources?: CASourceOverride[], faOverride?: { purchaseRate: number; uom: AggUoM; leadKm: number; freightRate: number; payload: number }, pettyLabourPerM3?: number): CostBreakdown {
  // NOTE: contractorBBS is informational only — steel material cost always applies
  // Merge location CA sourcing overrides with base mix proportions (proportions always come from base)
  const tabs: CATab[] = locCASources
    ? s.caTabs.map((t, i) => locCASources[i] ? { ...locCASources[i], proportion: t.proportion } : t)
    : s.caTabs;
  const faRate = faOverride?.purchaseRate ?? s.faPurchaseRate;
  const faUom = faOverride?.uom ?? s.faUom ?? "per_cft";
  const faLeadKm = faOverride?.leadKm ?? s.faLeadKm;
  const faFreightRate = faOverride?.freightRate ?? s.faFreightRate;
  const faPayload = faOverride?.payload ?? s.faPayload;

  // Cement
  const cement = (s.mix.cementKg / 50) * s.cementBagPrice;

  // Coarse Aggregate – normalize purchase rate to ₹/MT per UoM
  const totalProp = tabs.reduce((sum, t) => sum + t.proportion, 0) || 100;
  const ca = tabs.reduce((sum, t) => {
    const ratePerMT = aggRateToPerMT(t.purchaseRate, t.uom ?? "per_mt");
    const landed = ratePerMT + (t.leadKm * 2 * t.freightRate / (t.payload || 1));
    const weight = (t.proportion / totalProp) * (s.mix.caKg / 1000);
    return sum + weight * landed;
  }, 0);

  // Fine Aggregate – normalize purchase rate to ₹/MT
  const faRatePerMT = aggRateToPerMT(faRate, faUom);
  const faLanded = faRatePerMT + (faLeadKm * 2 * faFreightRate / (faPayload || 1));
  const faBulkageFactor = s.faType === "natural" ? (1 + s.faBulkagePct / 100) : 1;
  const fa = (s.mix.faKg / 1000) * faLanded * faBulkageFactor;

  // Admixture
  const admix = s.admixDosage * s.admixRate;

  // Batching
  const batching = s.batchingRows.reduce((sum, row) => {
    if (row.mode === "own") {
      const totalPerHr = row.depreciation + row.fuel + row.operator;
      return sum + (row.output > 0 ? totalPerHr / row.output : 0);
    } else {
      if (row.hireMode === "per_m3") return sum + row.hireRate;
      if (row.hireMode === "per_month") return sum + (row.outputPerMonth > 0 ? row.hireRate / row.outputPerMonth : 0);
      // per_day: output = m³/day
      return sum + (row.output > 0 ? row.hireRate / row.output : 0);
    }
  }, 0);

  // Placement
  let placement = 0;
  if (pettyLabourPerM3 !== undefined) {
    placement = pettyLabourPerM3;
  } else if (s.placementMode === "transit_mixer") {
    placement = s.placementOutputPerDay > 0 ? (s.tmHirePerTrip * s.tmTripsPerDay) / s.placementOutputPerDay : 0;
  } else if (s.placementMode === "labour") {
    placement = s.placementRatePerDay; // direct ₹/m³ for labour mode
  } else {
    placement = s.placementOutputPerDay > 0 ? s.placementRatePerDay / s.placementOutputPerDay : 0;
  }

  // Formwork & Staging
  // shuttering: area per m³ × cost per m² per use ÷ reuse cycles → ₹/m³
  const shutteringCost = (s.shutteringAreaPerM3 * s.shutteringCostPerM2) / (s.shutteringReuseCycles || 1);
  // staging: soffit/horizontal area per m³ × hire rate (₹/m²/month) × months → ₹/m³
  const stagingCost = s.stagingAreaPerM3 * s.stagingHireRate * s.stagingMonths;
  // bypass formwork if petty labour contractor covers it
  const formwork = (pettyLabourPerM3 !== undefined && s.pettyLabour.contractorFormwork)
    ? 0
    : shutteringCost + stagingCost;

  // Curing
  let waterCuring = 0;
  if (s.waterCuringMode === "tanker") {
    const totalWater = s.tankerCapKL * s.tankerTripsPerDay * s.curingDays;
    waterCuring = (totalWater > 0 && s.totalVolume > 0) ? (s.tankerTripsPerDay * s.tankerHireRate * s.curingDays) / s.totalVolume : 0;
  } else {
    // Static: pump electricity + water purchase (using static-specific daily water volume)
    const elecKwh = s.staticPumpKw * 8 * s.curingDays;
    const waterCostTotal = s.staticDailyWaterKL * s.curingDays * s.staticWaterCostKL;
    waterCuring = (s.totalVolume > 0) ? (elecKwh * s.staticElecRate + waterCostTotal) / s.totalVolume : 0;
  }
  const compoundCost = s.curingCompoundEnabled ? (s.curingCompoundSurfaceArea / (s.curingCompoundCoverage || 1)) * s.curingCompoundRate : 0;
  const curing = waterCuring + compoundCost;

  // Labour
  const labour = s.labourRatePerM3;

  // Wastage
  const faBulkageImpact = (s.wastage.sandBulkage && s.faType === "natural") ? fa * (s.faBulkagePct / 100 / (1 + s.faBulkagePct / 100)) : 0;
  const cementWastageAmt = s.wastage.cementWastage ? cement * (s.wastage.cementWastagePct / 100) : 0;
  const steelWasteAmt = s.wastage.steelCuttingWaste ? steelCostPerM3 * (s.wastage.steelCuttingPct / 100) : 0;
  const formworkDamageAmt = s.wastage.formworkDamage ? (shutteringCost * (s.wastage.formworkDamageReduction / 100)) : 0;
  const curingLossAmt = s.wastage.curingWaterLoss ? waterCuring * (s.wastage.curingWaterLossPct / 100) : 0;
  const wastage = faBulkageImpact + cementWastageAmt + steelWasteAmt + formworkDamageAmt + curingLossAmt;

  const direct = cement + ca + fa + admix + batching + placement + formwork + labour + steelCostPerM3 + curing + wastage;
  const overhead = direct * (s.overheadPct / 100);
  const margin = (direct + overhead) * (s.marginPct / 100);
  const total = direct + overhead + margin;
  const totalWithEsc = total * (1 + s.escalationPct / 100);

  return { cement, ca, fa, admix, steel: steelCostPerM3, batching, placement, formwork, labour, curing, wastage, overhead, margin, total, totalWithEsc };
}

// ─── BBS Calculations ──────────────────────────────────────────────────────────

// Element → dimension type mapping for spacing-based count calculation
const ELEMENT_DIM_TYPE: Record<string, "wall" | "span" | "manual"> = {
  "Invert-Bottom": "span", "Invert-Top": "span",
  "Wall-Earth": "wall", "Wall-Inner": "wall",
  "TopSlab-Bottom": "span", "TopSlab-Top": "span",
  "Dist/Tie": "manual", "Lifting Hook": "manual", "Manual": "manual",
};

interface BBSQtoCtx {
  clearSpanMm: number; wallThickMm: number;
  heightZones: HeightZone[]; totalDrainLength: number;
}

function computeBBSSummary(rows: BBSRow[], rates: SteelRates, qtoCtx?: BBSQtoCtx) {
  const diaRateMap: Record<number, number> = {
    8: rates.r8, 10: rates.r10, 12: rates.r12, 16: rates.r16, 20: rates.r20, 25: rates.r25,
  };
  let totalKg = 0;
  let totalCost = 0;
  let totalKgPerM = 0;
  const byDia: Record<number, { kg: number; cost: number }> = {};

  const totalLength = qtoCtx?.totalDrainLength ?? 0;
  const spanMm = qtoCtx ? qtoCtx.clearSpanMm + 2 * qtoCtx.wallThickMm : 0;
  const avgWallHMm = qtoCtx && qtoCtx.heightZones.length > 0
    ? qtoCtx.heightZones.reduce((s, z) => s + z.height * z.length, 0) / Math.max(1, qtoCtx.heightZones.reduce((s, z) => s + z.length, 0))
    : 0;

  rows.forEach((row) => {
    const hookAll = HOOK_ALLOWANCE[row.shape] ? HOOK_ALLOWANCE[row.shape](row.dia) : 0;
    const overlapLen = (row.overlapN * row.dia) / 1000;
    const unitLen = row.cutLength + hookAll + overlapLen; // m per bar
    const kgPerMBar = (row.dia * row.dia) / 162;
    const rate = diaRateMap[row.dia] || 56000;

    let rowKg = 0;
    let rowKgPerM = 0;

    const basis = row.countBasis ?? "manual";
    const dimType = ELEMENT_DIM_TYPE[row.element ?? "Manual"] ?? "manual";

    if (basis === "spacing" && (row.spacingMm ?? 200) > 0) {
      if (dimType === "span") {
        const countPerM = spanMm / (row.spacingMm ?? 200);
        rowKgPerM = unitLen * countPerM * kgPerMBar;
        rowKg = rowKgPerM * totalLength;
      } else if (dimType === "wall") {
        // Use zone-specific height when zoneId is set; otherwise weighted average
        const zoneH = row.zoneId && row.zoneId !== "all" && qtoCtx
          ? (qtoCtx.heightZones.find(z => z.id === row.zoneId)?.height ?? avgWallHMm)
          : avgWallHMm;
        const zoneLen = row.zoneId && row.zoneId !== "all" && qtoCtx
          ? (qtoCtx.heightZones.find(z => z.id === row.zoneId)?.length ?? totalLength)
          : totalLength;
        const countPerM = zoneH / (row.spacingMm ?? 200);
        rowKgPerM = unitLen * countPerM * kgPerMBar;
        // Zone-specific rows: kg = kgPerM × zoneLen; global kgPerM = kg / totalLength
        rowKg = rowKgPerM * (row.zoneId && row.zoneId !== "all" && qtoCtx ? zoneLen : totalLength);
        rowKgPerM = totalLength > 0 ? rowKg / totalLength : 0;
      } else {
        // Dist/Tie/Lifting Hook in spacing mode → 1 bar per metre run (longitudinal)
        const countPerM = 1;
        rowKgPerM = unitLen * countPerM * kgPerMBar;
        rowKg = rowKgPerM * totalLength;
      }
    } else {
      // manual mode
      const totalLen = unitLen * row.count;
      rowKg = totalLen * kgPerMBar;
      rowKgPerM = totalLength > 0 ? rowKg / totalLength : 0;
    }

    const cost = (rowKg / 1000) * rate;
    totalKg += rowKg;
    totalKgPerM += rowKgPerM;
    totalCost += cost;
    if (!byDia[row.dia]) byDia[row.dia] = { kg: 0, cost: 0 };
    byDia[row.dia].kg += rowKg;
    byDia[row.dia].cost += cost;
  });

  return { totalKg, totalCost, byDia, totalKgPerM };
}

// Material-only cost (cement+CA+FA+admix) for a given grade, using current rates from state
function computeMaterialCostOnly(grade: string, s: CalcState): number {
  const mix = MIX_PRESETS[grade];
  if (!mix) return 0;
  const cement = (mix.cementKg / 50) * s.cementBagPrice;
  const totalProp = s.caTabs.reduce((sum, t) => sum + t.proportion, 0) || 100;
  const ca = s.caTabs.reduce((sum, t) => {
    const ratePerMT = aggRateToPerMT(t.purchaseRate, t.uom ?? "per_mt");
    const landed = ratePerMT + (t.leadKm * 2 * t.freightRate / Math.max(1, t.payload));
    return sum + (t.proportion / totalProp) * (mix.caKg / 1000) * landed;
  }, 0);
  const faRatePerMT = aggRateToPerMT(s.faPurchaseRate, s.faUom ?? "per_cft");
  const faLanded = faRatePerMT + (s.faLeadKm * 2 * s.faFreightRate / Math.max(1, s.faPayload));
  const faBulkageFactor = s.faType === "natural" ? (1 + s.faBulkagePct / 100) : 1;
  const fa = (mix.faKg / 1000) * faLanded * faBulkageFactor;
  const admix = s.admixDosage * s.admixRate;
  return cement + ca + fa + admix;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function numInput(label: string, value: number, onChange: (v: number) => void, opts: { unit?: string; step?: number; min?: number; testId?: string } = {}) {
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step={opts.step ?? "any"}
          min={opts.min ?? 0}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-9 text-sm min-w-[80px]"
          data-testid={opts.testId}
        />
        {opts.unit && <span className="text-xs text-slate-500 whitespace-nowrap">{opts.unit}</span>}
      </div>
    </div>
  );
}

function fmtR(v: number) { return "₹" + Math.round(v).toLocaleString("en-IN"); }
function fmtPct(v: number) { return v.toFixed(1) + "%"; }
function uid() { return Math.random().toString(36).slice(2, 8); }
function aggUomLabel(uom: AggUoM | undefined): string {
  if (uom === "per_cft") return "₹/CFT";
  if (uom === "per_m3") return "₹/m³";
  return "₹/MT";
}
function hireModeLabel(mode: string | undefined): string {
  if (mode === "per_m3") return "₹/m³";
  if (mode === "per_month") return "₹/month";
  return "₹/day";
}

const BOQ_CAT_COLORS: Record<string, string> = {
  RCC: "bg-blue-100 text-blue-700 border-blue-300",
  PCC: "bg-stone-100 text-stone-700 border-stone-300",
  Excavation: "bg-orange-100 text-orange-700 border-orange-300",
  Backfill: "bg-green-100 text-green-700 border-green-300",
  Grating: "bg-slate-100 text-slate-700 border-slate-300",
  Weephole: "bg-slate-100 text-slate-700 border-slate-300",
  Steel: "bg-yellow-100 text-yellow-700 border-yellow-300",
  LiftingHook: "bg-slate-100 text-slate-700 border-slate-300",
  Curing: "bg-purple-100 text-purple-700 border-purple-300",
};
function getBOQCategory(desc: string): string | null {
  const d = desc.toLowerCase();
  if (/\brcc\b|reinforced cement/i.test(d)) return "RCC";
  if (/\bpcc\b|plain cement/i.test(d)) return "PCC";
  if (/excavat/.test(d)) return "Excavation";
  if (/backfill|earthfill/.test(d)) return "Backfill";
  if (/\bgrat/.test(d)) return "Grating";
  if (/weep/.test(d)) return "Weephole";
  if (/hysd|steel.*bar|reinforcement/i.test(d)) return "Steel";
  if (/lifting hook/i.test(d)) return "LiftingHook";
  if (/\bcur/.test(d)) return "Curing";
  return null;
}

// ─── QTO Calculations ─────────────────────────────────────────────────────────

function calcDrainQTO(q: QtoState, showTopSlab: boolean) {
  const span = q.clearSpan / 1000;
  const t = q.wallThickness / 1000;
  const is_t = q.invertSlabThick / 1000;
  const ts = q.topSlabThick / 1000;
  const pd = q.pccDepth / 1000;
  const po = q.pccOffset / 1000;
  const ws = q.workingSpace / 1000;
  const overallWidth = span + 2 * t;
  const pccWidth = overallWidth + 2 * po;
  const invertPerM = overallWidth * is_t;
  const topPerM = showTopSlab ? overallWidth * ts : 0;
  const pccPerM = pccWidth * pd;
  const excavWidth = pccWidth + 2 * ws;
  const zones = q.heightZones.map(z => {
    const h = z.height / 1000;
    const wallsM3perM = 2 * t * h;
    const rccPerM = wallsM3perM + invertPerM + topPerM;
    return { ...z, h, wallsM3perM, rccPerM, wallsM3: wallsM3perM * z.length, invertM3: invertPerM * z.length, topM3: topPerM * z.length, pccM3: pccPerM * z.length, totalRCCm3: rccPerM * z.length };
  });
  const totalLength = q.heightZones.reduce((s, z) => s + z.length, 0);
  const totalWalls = zones.reduce((s, z) => s + z.wallsM3, 0);
  const totalInvert = invertPerM * totalLength;
  const totalTop = topPerM * totalLength;
  const totalPCC = pccPerM * totalLength;
  // Weephole void deduction — π/4×d²×wallThick×count; subtracted from combined wall volume (both walls)
  const weepholeDiamM = (q.weepholeDiaMm ?? 100) / 1000;
  const weepholesCount = q.weepholesSpacing > 0 ? Math.ceil(totalLength / q.weepholesSpacing) : 0;
  const deductWeephole = (Math.PI / 4) * weepholeDiamM * weepholeDiamM * t * weepholesCount;
  // Grating opening deduction (from top slab)
  const gratingsCount = q.gratingsSpacing > 0 ? Math.ceil(totalLength / q.gratingsSpacing) : 0;
  const grOW = (q.gratingOpeningW ?? 200) / 1000;
  const grOD = (q.gratingOpeningD ?? 100) / 1000;
  const deductGrating = showTopSlab ? grOW * grOD * ts * gratingsCount : 0;
  // Lifting hooks count
  const liftingHooksCount = (q.liftingHookSpacingM ?? 0) > 0 ? Math.ceil(totalLength / (q.liftingHookSpacingM ?? 2)) : 0;
  // Net volumes (gross – deductions)
  const totalWallsNet = Math.max(0, totalWalls - deductWeephole);
  const totalTopNet = Math.max(0, totalTop - deductGrating);
  const totalRCC = totalWallsNet + totalInvert + totalTopNet;
  const avgWallH = totalLength > 0 ? q.heightZones.reduce((s, z) => s + z.height * z.length, 0) / totalLength / 1000 : 0;
  const excavDepth = avgWallH + is_t + pd;
  const excavVolume = excavWidth * excavDepth * totalLength;
  const backfillVol = Math.max(0, excavVolume - totalRCC - totalPCC);
  return { zones, totalLength, totalWalls, totalWallsNet, totalInvert, totalTop, totalTopNet, totalRCC, totalPCC, invertPerM, topPerM, pccPerM, excavWidth, excavDepth, excavVolume, backfillVol, gratingsCount, weepholesCount, liftingHooksCount, deductWeephole, deductGrating, avgWallH, overallWidth, pccWidth };
}

function calcBridgeRWQTO(q: QtoState) {
  const baseW = q.bwBaseWidth / 1000;
  const stemT = q.bwStemThick / 1000;
  const h = q.bwHeight / 1000;
  const fd = q.bwFootingDepth / 1000;
  const stemVol = stemT * h;
  const baseVol = baseW * fd;
  const totalRCCperM = stemVol + baseVol;
  return { stemVol, baseVol, totalRCCperM, baseW, stemT, h, fd };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConcreteCalculator() {
  const { toast } = useToast();
  const role = readEstimatorRole();
  const canEdit = role === "admin";

  const [s, setS] = useState<CalcState>(loadState);
  const [activeMainTab, setActiveMainTab] = useState("calculator");
  const [activeAnalysisTab, setActiveAnalysisTab] = useState("price-impact");
  const [savedEstimateId, setSavedEstimateId] = useState<number | null>(() => {
    // Support ?estimateId= query param
    const params = new URLSearchParams(window.location.search);
    const qid = params.get("estimateId");
    if (qid) return parseInt(qid);
    const lsId = localStorage.getItem(LS_KEY + "_estId");
    return lsId ? parseInt(lsId) : null;
  });
  const [priceImpactRates, setPriceImpactRates] = useState<Record<string, number>>({});
  const [helpOpen, setHelpOpen] = useState<string | null>(null);
  function toggleHelp(id: string) { setHelpOpen(prev => prev === id ? null : id); }

  // ── Inline help sub-components (closure over helpOpen + toggleHelp) ─────────
  function HelpBtn({ id }: { id: string }) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleHelp(id); }}
        className={`ml-2 p-1 rounded-full transition-colors ${helpOpen === id ? "bg-blue-100 text-blue-600" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted"}`}
        title="Help"
        data-testid={`help-btn-${id}`}
      >
        {helpOpen === id ? <X className="w-3.5 h-3.5" /> : <HelpCircle className="w-3.5 h-3.5" />}
      </button>
    );
  }

  function HelpPanel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    if (helpOpen !== id) return null;
    return (
      <div className="help-panel mx-4 mb-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-slate-700 overflow-hidden" data-testid={`help-panel-${id}`}>
        <div className="px-4 py-2 bg-blue-100 border-b border-blue-200">
          <span className="font-semibold text-blue-800 text-[11px] uppercase tracking-wide">{title} — Guide</span>
        </div>
        <div className="px-4 py-3 space-y-1">{children}</div>
      </div>
    );
  }

  const isStandalonePWA = useMemo(() => {
    const nav: Navigator & { standalone?: boolean } = window.navigator;
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  }, []);

  useEffect(() => {
    if (!role) window.location.href = "/estimator-login?returnTo=/concrete-calculator";
  }, [role]);

  // Load estimate by query-param estimateId on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qid = params.get("estimateId");
    if (!qid) return;
    const id = parseInt(qid);
    fetch(`/api/concrete-estimates/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((est: ConcreteEstimate) => {
        try {
          const loaded = JSON.parse(est.state);
          setS((prev) => ({ ...DEFAULT_STATE, ...loaded, qto: { ...DEFAULT_STATE.qto, ...(loaded.qto || {}) } }));
          setSavedEstimateId(id);
          localStorage.setItem(LS_KEY + "_estId", String(id));
        } catch {}
      })
      .catch(() => {});
  }, []);

  // Persist state
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }, [s]);

  function update(patch: Partial<CalcState>) {
    setS((prev) => ({ ...prev, ...patch }));
  }

  function updateMix(patch: Partial<MixDesign>) {
    setS((prev) => ({ ...prev, mix: { ...prev.mix, ...patch } }));
  }

  function updateWastage(patch: Partial<WastageFlags>) {
    setS((prev) => ({ ...prev, wastage: { ...prev.wastage, ...patch } }));
  }

  function updateQto(patch: Partial<QtoState>) {
    setS((prev) => ({ ...prev, qto: { ...prev.qto, ...patch } }));
  }

  // QTO calculations — must come before BBS (BBS spacing mode needs drain length)
  const isBoxCulvert = s.structureType === "Box Culvert";
  const isDrainType = s.structureType === "Drain" || s.structureType === "Box Culvert";
  const isBridgeType = s.structureType === "Bridge" || s.structureType === "Retaining Wall";
  const showTopSlab = isBoxCulvert || s.qto.isCovered;
  const qtoResult = useMemo(() => isDrainType ? calcDrainQTO(s.qto, showTopSlab) : null, [s.qto, showTopSlab, isDrainType]);
  const bridgeQtoResult = useMemo(() => isBridgeType ? calcBridgeRWQTO(s.qto) : null, [s.qto, isBridgeType]);

  // BBS steel cost (qtoCtx provides drain geometry for spacing-based count calculation)
  const qtoCtxForBBS = useMemo<BBSQtoCtx | undefined>(() => isDrainType && qtoResult ? {
    clearSpanMm: s.qto.clearSpan, wallThickMm: s.qto.wallThickness,
    heightZones: s.qto.heightZones, totalDrainLength: qtoResult.totalLength,
  } : undefined, [isDrainType, qtoResult, s.qto.clearSpan, s.qto.wallThickness, s.qto.heightZones]);
  const bbsSummary = useMemo(() => computeBBSSummary(s.bbsRows, s.steelRates, qtoCtxForBBS), [s.bbsRows, s.steelRates, qtoCtxForBBS]);
  const steelCostPerM3 = useMemo(() => s.totalVolume > 0 ? bbsSummary.totalCost / s.totalVolume : 0, [bbsSummary.totalCost, s.totalVolume]);

  // Cross-section area (m²) for ₹/RM ↔ ₹/m³ conversion
  const crossSectionM2 = useMemo(() => {
    const len = qtoResult?.totalLength ?? 0;
    const rcc = qtoResult?.totalRCC ?? 0;
    return (len > 0 && rcc > 0) ? rcc / len : 0;
  }, [qtoResult]);

  // Petty labour: convert ₹/RM → ₹/m³ using drain cross-section area
  // Returns undefined (disable petty labour) when ₹/RM selected but QTO cross-section unavailable
  const pettyLabourRatePerM3 = useMemo(() => {
    if (!s.pettyLabour.enabled) return undefined;
    if (s.pettyLabour.rateUnit === "per_m3") return s.pettyLabour.rateValue;
    // per_rm mode: ONLY apply when QTO cross-section is available; otherwise gate to disable
    if (crossSectionM2 <= 0) return undefined;
    return s.pettyLabour.rateValue / crossSectionM2;
  }, [s.pettyLabour, crossSectionM2]);

  // Normalize client rate to ₹/m³ regardless of per_m3 / per_rm mode
  // Used by ALL margin computations so they stay consistent with contractRateMode
  const effectiveClientRatePerM3 = useMemo(() => {
    if (s.contractRateMode === "per_rm" && crossSectionM2 > 0) return s.contractRate / crossSectionM2;
    return s.contractRate;
  }, [s.contractRate, s.contractRateMode, crossSectionM2]);

  // Main cost calculation
  const costs = useMemo(() => computeCosts(s, steelCostPerM3, undefined, undefined, pettyLabourRatePerM3), [s, steelCostPerM3, pettyLabourRatePerM3]);

  // QTO Per-Metre Rate Card all-in ₹/RM — mirrors the Per-Metre Rate Card in the QTO tab.
  // Includes PCC, all zone RCC, steel from BBS, earthwork, ancillaries.
  // Returns undefined when QTO zones are not yet entered.
  const qtoAllInPerM = useMemo(() => {
    if (!isDrainType || !qtoResult || qtoResult.totalLength <= 0 || qtoResult.zones.length === 0) return undefined;
    const eq = s.qto.elementGrades ?? { pcc: "M15", invert: "M25", wall: "M25", topSlab: "M25" };
    const rccBaseRate = costs.totalWithEsc - costs.steel;
    const baseMat = computeMaterialCostOnly(s.grade, s);
    const invertCostPerM3 = rccBaseRate - baseMat + computeMaterialCostOnly(eq.invert, s);
    const wallCostPerM3 = rccBaseRate - baseMat + computeMaterialCostOnly(eq.wall, s);
    const tsM = s.qto.topSlabThick / 1000;
    const topSlabCostPerM3 = (s.qto.topSlabType === "Precast" && tsM > 0)
      ? s.qto.precastRatePerM2 / tsM
      : rccBaseRate - baseMat + computeMaterialCostOnly(eq.topSlab, s);
    const pccCostPerM3 = Math.max(0, rccBaseRate - costs.formwork - baseMat + computeMaterialCostOnly(eq.pcc, s));
    const gratingPerM = s.qto.gratingsSpacing > 0 ? s.qto.gratingRatePerNos / s.qto.gratingsSpacing : 0;
    const weepholePerM = s.qto.weepholesSpacing > 0 ? s.qto.weepholeRatePerNos / s.qto.weepholesSpacing : 0;
    const steelRateAvg = bbsSummary.totalKg > 0 ? bbsSummary.totalCost / (bbsSummary.totalKg / 1000) : s.steelRates.r12;
    const steelPerM = bbsSummary.totalKgPerM * (steelRateAvg / 1000);
    const bwPerM = bbsSummary.totalKgPerM * ((s.qto.bindingWireKgPerMT ?? 10) / 1000) * (s.qto.bindingWireRatePerKg ?? 85);
    const lhPerM = (s.qto.liftingHookSpacingM ?? 0) > 0 ? (s.qto.liftingHookRatePerNos ?? 150) / (s.qto.liftingHookSpacingM ?? 2) : 0;
    const excavPerM = qtoResult.excavVolume * s.qto.excavationRate / qtoResult.totalLength;
    const backfillPerM = qtoResult.backfillVol * s.qto.backfillRate / qtoResult.totalLength;
    const avgNetWallPerM = qtoResult.totalWallsNet / qtoResult.totalLength * wallCostPerM3;
    const netTopSlabPerM = qtoResult.totalTopNet / qtoResult.totalLength * topSlabCostPerM3;
    return (qtoResult.pccPerM * pccCostPerM3) + (qtoResult.invertPerM * invertCostPerM3) +
      avgNetWallPerM + netTopSlabPerM + gratingPerM + weepholePerM + steelPerM + bwPerM + excavPerM + backfillPerM + lhPerM;
  }, [isDrainType, qtoResult, costs, s, bbsSummary]);

  // Price Impact revised costs — directly apply absolute rates from priceImpactRates
  const revisedCosts = useMemo(() => {
    const rates = priceImpactRates;
    const revised = {
      ...s,
      cementBagPrice: rates.cement !== undefined ? rates.cement : s.cementBagPrice,
      admixRate: rates.admix !== undefined ? rates.admix : s.admixRate,
      faPurchaseRate: rates.fa !== undefined ? rates.fa : s.faPurchaseRate,
      labourRatePerM3: rates.labour !== undefined ? rates.labour : s.labourRatePerM3,
      marginPct: rates.margin !== undefined ? rates.margin : s.marginPct,
      shutteringCostPerM2: rates.formwork !== undefined ? rates.formwork : s.shutteringCostPerM2,
      caTabs: s.caTabs.map((t, i) => ({ ...t, purchaseRate: rates[`ca${i}`] !== undefined ? rates[`ca${i}`] : t.purchaseRate })),
      batchingRows: s.batchingRows.map((row) => ({
        ...row,
        hireRate: rates.batching !== undefined ? rates.batching : row.hireRate,
        depreciation: rates.batching !== undefined && row.hireRate > 0 ? row.depreciation * (rates.batching / row.hireRate) : row.depreciation,
        fuel: rates.batching !== undefined && row.hireRate > 0 ? row.fuel * (rates.batching / row.hireRate) : row.fuel,
      })),
    };
    const steel8Factor = rates.steel8 !== undefined && s.steelRates.r8 > 0 ? rates.steel8 / s.steelRates.r8 : 1;
    const steel12Factor = rates.steel12p !== undefined && s.steelRates.r12 > 0 ? rates.steel12p / s.steelRates.r12 : 1;
    const steelFactor = 1 + (steel8Factor - 1) * 0.1 + (steel12Factor - 1) * 0.7;
    return computeCosts(revised, steelCostPerM3 * steelFactor, undefined, undefined, pettyLabourRatePerM3);
  }, [s, priceImpactRates, steelCostPerM3, pettyLabourRatePerM3]);

  // Save mutation
  const saveMutation = useMutation<ConcreteEstimate, Error, void>({
    mutationFn: async () => {
      const payload = {
        name: s.estimateName || "Untitled Estimate",
        contractor: s.contractor || null,
        structureType: s.structureType || null,
        grade: s.grade || null,
        state: JSON.stringify(s),
        totalCum: s.totalVolume || null,
        totalAmt: s.totalVolume ? costs.totalWithEsc * s.totalVolume : null,
      };
      const response = savedEstimateId
        ? await apiRequest("PATCH", `/api/concrete-estimates/${savedEstimateId}`, payload)
        : await apiRequest("POST", "/api/concrete-estimates", payload);
      return response.json() as Promise<ConcreteEstimate>;
    },
    onSuccess: (data: ConcreteEstimate) => {
      setSavedEstimateId(data.id);
      localStorage.setItem(LS_KEY + "_estId", String(data.id));
      queryClient.invalidateQueries({ queryKey: ["/api/concrete-estimates"] });
      toast({ title: savedEstimateId ? "Estimate updated" : "Estimate saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  function addBatchingRow() {
    update({ batchingRows: [...s.batchingRows, { id: uid(), type: "Ajax Self-Loader", model: "", mode: "hired", depreciation: 0, fuel: 0, operator: 0, output: 6, outputPerMonth: 0, hireRate: 2000, hireMode: "per_day" }] });
  }

  function updateBatchingRow(id: string, patch: Partial<BatchingRow>) {
    update({ batchingRows: s.batchingRows.map((r) => r.id === id ? { ...r, ...patch } : r) });
  }

  function removeBatchingRow(id: string) {
    update({ batchingRows: s.batchingRows.filter((r) => r.id !== id) });
  }

  function addBOQItem() {
    const presets = STRUCTURE_PRESETS[s.structureType] || [];
    const nextDesc = presets[s.boqItems.length] || `Item ${s.boqItems.length + 1}`;
    update({ boqItems: [...s.boqItems, { id: uid(), description: nextDesc, qty: 1, unit: "m³", dimL: 0, dimW: 0, dimD: 0, rate: costs.totalWithEsc, contractorRate: s.contractRate }] });
  }

  function updateBOQItem(id: string, patch: Partial<BOQItem>) {
    update({ boqItems: s.boqItems.map((r) => r.id === id ? { ...r, ...patch } : r) });
  }

  function removeBOQItem(id: string) {
    update({ boqItems: s.boqItems.filter((r) => r.id !== id) });
  }

  function addBBSRow() {
    update({ bbsRows: [...s.bbsRows, { id: uid(), mark: `B${s.bbsRows.length + 1}`, dia: 12, shape: "Straight", count: 1, cutLength: 3.0, overlapN: 50, element: "Invert-Bottom", zoneId: "all", countBasis: "spacing" as const, spacingMm: 200 }] });
  }

  function updateBBSRow(id: string, patch: Partial<BBSRow>) {
    update({ bbsRows: s.bbsRows.map((r) => r.id === id ? { ...r, ...patch } : r) });
  }

  function removeBBSRow(id: string) {
    update({ bbsRows: s.bbsRows.filter((r) => r.id !== id) });
  }

  function applyGradePreset(grade: string) {
    const preset = MIX_PRESETS[grade];
    if (preset) update({ grade, mix: { ...preset } });
    else update({ grade });
  }

  function applyStructureType(type: string) {
    const def = STRUCTURE_TYPE_DEFAULTS[type];
    update({ structureType: type, shutteringAreaPerM3: def?.shutteringArea || 3.0 });
  }

  function saveAsScenario(name: string) {
    const derivedChanges: Record<string, number> = {};
    for (const v of PRICE_VARIABLES) {
      const r = priceImpactRates[v.key];
      if (r !== undefined) {
        derivedChanges[v.key] = v.key === "margin" ? r - v.baseValue : v.baseValue > 0 ? ((r - v.baseValue) / v.baseValue) * 100 : 0;
      }
    }
    const newScenario: Scenario = { id: uid(), name, changes: derivedChanges, rates: { ...priceImpactRates } };
    update({ scenarios: [...(s.scenarios || []).slice(0, MAX_SCENARIOS - 1), newScenario] });
    toast({ title: `Scenario "${name}" saved` });
  }

  const totalRow = [
    { label: "Cement", value: costs.cement, color: "bg-amber-500" },
    { label: "Coarse Agg", value: costs.ca, color: "bg-orange-400" },
    { label: "Fine Agg", value: costs.fa, color: "bg-yellow-400" },
    { label: "Admixture", value: costs.admix, color: "bg-purple-400" },
    { label: "Steel", value: steelCostPerM3, color: "bg-slate-500" },
    { label: "Batching", value: costs.batching, color: "bg-blue-400" },
    { label: "Placement", value: costs.placement, color: "bg-sky-400" },
    { label: "Formwork", value: costs.formwork, color: "bg-teal-400" },
    { label: "Labour", value: costs.labour, color: "bg-green-500" },
    { label: "Curing", value: costs.curing, color: "bg-cyan-400" },
    { label: "Wastage", value: costs.wastage, color: "bg-red-300" },
    { label: "Overhead", value: costs.overhead, color: "bg-gray-400" },
    { label: "Margin", value: costs.margin, color: "bg-emerald-500" },
  ];

  const maxBar = Math.max(...totalRow.map((r) => r.value), 1);

  function boqVol(item: BOQItem) {
    return (item.dimL && item.dimW && item.dimD) ? item.dimL * item.dimW * item.dimD * item.qty : item.qty;
  }

  const boqTotalCum = s.boqItems.reduce((sum, item) => sum + boqVol(item), 0);
  const boqTotalAmt = s.boqItems.reduce((sum, item) => sum + boqVol(item) * item.rate, 0);

  // All 12 spec-required price sensitivity variables
  const PRICE_VARIABLES = [
    { key: "cement", label: "Cement Rate", baseValue: s.cementBagPrice, unit: "₹/bag", impact: costs.cement },
    { key: "admix", label: "Admixture Rate", baseValue: s.admixRate, unit: "₹/L", impact: costs.admix },
    { key: "ca0", label: "CA 20mm Rate", baseValue: s.caTabs[0]?.purchaseRate || 0, unit: aggUomLabel(s.caTabs[0]?.uom), impact: costs.ca * (s.caTabs[0]?.proportion || 60) / 100 },
    { key: "ca1", label: "CA 10mm Rate", baseValue: s.caTabs[1]?.purchaseRate || 0, unit: aggUomLabel(s.caTabs[1]?.uom), impact: costs.ca * (s.caTabs[1]?.proportion || 30) / 100 },
    { key: "ca2", label: "CA 6mm Rate", baseValue: s.caTabs[2]?.purchaseRate || 0, unit: aggUomLabel(s.caTabs[2]?.uom), impact: costs.ca * (s.caTabs[2]?.proportion || 10) / 100 },
    { key: "fa", label: "Fine Aggregate Rate", baseValue: s.faPurchaseRate, unit: aggUomLabel(s.faUom), impact: costs.fa },
    { key: "steel8", label: "Steel 8mm Rate", baseValue: s.steelRates.r8, unit: "₹/MT", impact: steelCostPerM3 * (bbsSummary.byDia[8]?.kg || 0) / (bbsSummary.totalKg || 1) },
    { key: "steel12p", label: "Steel 12mm+ Rate", baseValue: s.steelRates.r12, unit: "₹/MT", impact: steelCostPerM3 * ([12, 16, 20, 25].reduce((s2, d) => s2 + (bbsSummary.byDia[d]?.kg || 0), 0)) / (bbsSummary.totalKg || 1) },
    { key: "batching", label: "Batching Rate", baseValue: s.batchingRows[0]?.hireRate || 0, unit: hireModeLabel(s.batchingRows[0]?.hireMode), impact: costs.batching },
    { key: "formwork", label: "Formwork+Staging", baseValue: s.shutteringCostPerM2, unit: "₹/m²/use", impact: costs.formwork },
    { key: "labour", label: "Labour Rate", baseValue: s.labourRatePerM3, unit: "₹/m³", impact: costs.labour },
    { key: "margin", label: "Contractor Margin", baseValue: s.marginPct, unit: "%", impact: costs.margin },
  ].sort((a, b) => b.impact - a.impact);

  const [scenarioNameInput, setScenarioNameInput] = useState("");
  const [addingScenario, setAddingScenario] = useState(false);
  const [boqOverwriteConfirm, setBoqOverwriteConfirm] = useState(false);
  const [xlsxPreview, setXlsxPreview] = useState<{ headers: string[]; rows: string[][]; colDesc: number; colUnit: number; colQty: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function buildStandardDrainBOQ(): BOQItem[] {
    if (!qtoResult) return [];
    const r = qtoResult;
    const q = s.qto;
    const eq = q.elementGrades ?? { pcc: "M15", invert: "M25", wall: "M25", topSlab: "M25" };
    // Base rate for concrete elements (exclude steel — tracked as separate BOQ item)
    const rccBaseRate = costs.totalWithEsc - costs.steel;
    const baseMat = computeMaterialCostOnly(s.grade, s);

    // PCC rate: RCC base − steel already removed above; also remove formwork (PCC has no shuttering)
    const pccMatCost = computeMaterialCostOnly(eq.pcc, s);
    const pccRatePerM3 = Math.max(0, rccBaseRate - costs.formwork - baseMat + pccMatCost);

    // Per-element RCC cost (swap material component, keep all costs including formwork, excluding steel)
    const invertCostPerM3 = rccBaseRate - baseMat + computeMaterialCostOnly(eq.invert, s);
    const wallCostPerM3 = rccBaseRate - baseMat + computeMaterialCostOnly(eq.wall, s);
    // Top slab: if precast, use precastRatePerM2 ÷ thickness (m) → ₹/m³
    const isPrecast = q.topSlabType === "Precast";
    const tsM = q.topSlabThick / 1000;
    const topSlabCostPerM3 = isPrecast && tsM > 0
      ? q.precastRatePerM2 / tsM
      : rccBaseRate - baseMat + computeMaterialCostOnly(eq.topSlab, s);

    // Blended RCC rate weighted by net volumes
    const blendedRCCRate = r.totalRCC > 0
      ? (wallCostPerM3 * r.totalWallsNet + invertCostPerM3 * r.totalInvert + topSlabCostPerM3 * r.totalTopNet) / r.totalRCC
      : costs.totalWithEsc;

    const rccLabel = [eq.invert !== eq.wall ? `${eq.invert}/${eq.wall}` : eq.wall, "RCC"].join(" ");
    const steelMT = parseFloat((bbsSummary.totalKg / 1000).toFixed(3));
    const steelRateAvg = bbsSummary.totalKg > 0 ? bbsSummary.totalCost / (bbsSummary.totalKg / 1000) : s.steelRates.r12;
    // Always produce exactly 7 items in the standard client BOQ order
    return [
      // 1. Earthwork
      { id: uid(), description: "Earthwork Excavation in Foundation Trenches incl. disposal", qty: parseFloat(r.excavVolume.toFixed(2)), unit: "Cum", dimL: 0, dimW: 0, dimD: 0, rate: q.excavationRate, contractorRate: 0 },
      // 2. PCC bed
      { id: uid(), description: `${eq.pcc} PCC in Foundation, ${q.pccDepth}mm thick (${q.pccOffset}mm offset each side)`, qty: parseFloat(r.totalPCC.toFixed(2)), unit: "Cum", dimL: 0, dimW: 0, dimD: 0, rate: Math.round(pccRatePerM3), contractorRate: 0 },
      // 3. RCC — combined at blended element-grade rate
      { id: uid(), description: `${rccLabel} in Raft Foundation, Both Side Walls${showTopSlab ? " & Top Slab" : ""} incl. Centering, Shuttering & Vibration`, qty: parseFloat(r.totalRCC.toFixed(2)), unit: "Cum", dimL: 0, dimW: 0, dimD: 0, rate: Math.round(blendedRCCRate), contractorRate: s.contractRate },
      // 4. HYSD reinforcement — weighted avg steel rate from BBS
      { id: uid(), description: "HYSD Bar Reinforcements of Various Dia incl. Cutting, Bending & Placing in Position", qty: steelMT, unit: "MT", dimL: 0, dimW: 0, dimD: 0, rate: Math.round(steelRateAvg), contractorRate: 0 },
      // 5. Gratings
      { id: uid(), description: `Supply & Fixing MS Grating ${q.gratingOpeningW ?? 200}×${q.gratingOpeningD ?? 100}mm Opening @ ${q.gratingsSpacing}m c/c`, qty: r.gratingsCount, unit: "No's", dimL: 0, dimW: 0, dimD: 0, rate: q.gratingRatePerNos, contractorRate: 0 },
      // 6. Weepholes
      { id: uid(), description: `Supply & Fixing Weepholes ${q.weepholeDiaMm ?? 100}mm dia @ ${q.weepholesSpacing}m c/c interval`, qty: r.weepholesCount, unit: "No's", dimL: 0, dimW: 0, dimD: 0, rate: q.weepholeRatePerNos, contractorRate: 0 },
      // 7. Lifting Hooks
      { id: uid(), description: `Supply & Fixing Lifting Hooks ${q.liftingHookDia ?? 12}φ @ ${q.liftingHookSpacingM ?? 2}m c/c`, qty: r.liftingHooksCount, unit: "No's", dimL: 0, dimW: 0, dimD: 0, rate: q.liftingHookRatePerNos ?? 150, contractorRate: 0 },
    ];
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const all = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      if (all.length < 2) { toast({ title: "No data found in file", variant: "destructive" }); return; }
      const headers = (all[0] as string[]).map(h => String(h || ""));
      const rows = all.slice(1).map(r => (r as string[]).map(c => String(c ?? "")));
      const descIdx = headers.findIndex(h => /desc|item|work|particular/i.test(h));
      const unitIdx = headers.findIndex(h => /unit|uom/i.test(h));
      const qtyIdx = headers.findIndex(h => /qty|quantity|nos|no\.|number/i.test(h));
      setXlsxPreview({ headers, rows: rows.filter(r => r.some(c => c.trim())), colDesc: descIdx >= 0 ? descIdx : 0, colUnit: unitIdx >= 0 ? unitIdx : Math.min(1, headers.length - 1), colQty: qtyIdx >= 0 ? qtyIdx : Math.min(2, headers.length - 1) });
    } catch {
      toast({ title: "Failed to read Excel file", variant: "destructive" });
    }
    e.target.value = "";
  }

  function confirmExcelImport(p: { colDesc: number; colUnit: number; colQty: number; rows: string[][] }) {
    const newItems: BOQItem[] = p.rows.filter(r => r[p.colDesc]?.trim()).map(r => ({
      id: uid(),
      description: String(r[p.colDesc] || ""),
      unit: String(r[p.colUnit] || "m³"),
      qty: parseFloat(String(r[p.colQty] || "0")) || 0,
      dimL: 0, dimW: 0, dimD: 0, rate: 0, contractorRate: 0,
    }));
    update({ boqItems: [...s.boqItems, ...newItems] });
    setXlsxPreview(null);
    toast({ title: `${newItems.length} item${newItems.length !== 1 ? "s" : ""} imported from Excel` });
  }

  function applyChangesToState(base: CalcState, changes: Record<string, number>, baseSteelPerM3: number) {
    const revised = {
      ...base,
      cementBagPrice: base.cementBagPrice * (1 + (changes.cement || 0) / 100),
      admixRate: base.admixRate * (1 + (changes.admix || 0) / 100),
      faPurchaseRate: base.faPurchaseRate * (1 + (changes.fa || 0) / 100),
      labourRatePerM3: base.labourRatePerM3 * (1 + (changes.labour || 0) / 100),
      marginPct: base.marginPct + (changes.margin || 0),
      shutteringCostPerM2: base.shutteringCostPerM2 * (1 + (changes.formwork || 0) / 100),
      caTabs: base.caTabs.map((t, i) => ({ ...t, purchaseRate: t.purchaseRate * (1 + (changes[`ca${i}`] || 0) / 100) })),
      batchingRows: base.batchingRows.map((row) => ({
        ...row,
        hireRate: row.hireRate * (1 + (changes.batching || 0) / 100),
        depreciation: row.depreciation * (1 + (changes.batching || 0) / 100),
        fuel: row.fuel * (1 + (changes.batching || 0) / 100),
      })),
    };
    const steelFactor = 1 +
      (changes.steel8 || 0) / 100 * 0.1 +
      (changes.steel12p || 0) / 100 * 0.7;
    return computeCosts(revised, baseSteelPerM3 * steelFactor, undefined, undefined, pettyLabourRatePerM3);
  }

  function computeScenarioCosts(scenario: Scenario) {
    if (scenario.rates && Object.keys(scenario.rates).length > 0) {
      // Re-derive % changes from absolute saved rates against the CURRENT base values.
      // This prevents drift when base calculator rates are edited after scenario was saved.
      const derivedChanges: Record<string, number> = {};
      for (const v of PRICE_VARIABLES) {
        const absRate = scenario.rates[v.key];
        if (absRate !== undefined) {
          if (v.key === "margin") {
            derivedChanges[v.key] = absRate - v.baseValue;
          } else if (v.baseValue > 0) {
            derivedChanges[v.key] = ((absRate - v.baseValue) / v.baseValue) * 100;
          }
        }
      }
      return applyChangesToState(s, derivedChanges, steelCostPerM3);
    }
    return applyChangesToState(s, scenario.changes, steelCostPerM3);
  }

  function handlePiRateChange(key: string, newRate: number) {
    setPriceImpactRates((prev) => ({ ...prev, [key]: newRate }));
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-5">
        {!isStandalonePWA && (
          <Link href="/admin/concrete-estimates">
            <Button variant="ghost" size="sm" data-testid="btn-back">
              <ChevronLeft className="w-4 h-4 mr-1" /> Estimates
            </Button>
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">
              {s.estimateName || "New Concrete Estimate"}
            </h1>
            {s.grade && <Badge variant="outline" className="font-mono">{s.grade}</Badge>}
            {s.structureType && <Badge variant="outline" className="text-xs">{s.structureType}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fmtR(costs.totalWithEsc)}/m³ · {s.totalVolume} m³ · {s.contractor || "No contractor"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            size="sm"
            data-testid="btn-save"
          >
            <Save className="w-4 h-4 mr-1" />
            {saveMutation.isPending ? "Saving..." : savedEstimateId ? "Update" : "Save"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => { await signOutEstimator(); window.location.href = "/estimator-login"; }}
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Rate Summary bar ── */}
      <Card className="mb-5 bg-gradient-to-r from-blue-950 to-slate-900 text-white border-none">
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-semibold text-blue-200">Rate Summary — ₹/m³{crossSectionM2 > 0 ? " · ₹/RM" : ""}</span>
              {s.pettyLabour.enabled && <span className="ml-2 text-[10px] bg-amber-500/30 text-amber-200 px-1.5 py-0.5 rounded-full">Petty Labour Contract Active</span>}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{fmtR(costs.totalWithEsc)}/m³</div>
              {crossSectionM2 > 0 && <div className="text-sm text-blue-300">{fmtR(costs.totalWithEsc * crossSectionM2)}/RM</div>}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              { label: "Raw Materials", val: costs.cement + costs.ca + costs.fa + costs.admix },
              { label: "Steel", val: costs.steel },
              { label: "Plant, Labour & Formwork", val: costs.batching + costs.placement + costs.formwork + costs.labour + costs.curing },
              { label: "Overhead + Margin", val: costs.wastage + costs.overhead + costs.margin },
            ].map((item) => (
              <div key={item.label} className="bg-white/10 rounded-lg px-3 py-2">
                <div className="text-blue-300 mb-1">{item.label}</div>
                <div className="font-bold">{fmtR(item.val)}</div>
                {crossSectionM2 > 0 && <div className="text-[11px] text-blue-300/70 mt-0.5">{fmtR(item.val * crossSectionM2)}/RM</div>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Main tabs ── */}
      <Tabs value={activeMainTab} onValueChange={setActiveMainTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="calculator" data-testid="tab-calculator">Calculator</TabsTrigger>
          <TabsTrigger value="bbs" data-testid="tab-bbs">BBS & Wastage</TabsTrigger>
          <TabsTrigger value="qto-boq" data-testid="tab-qto-boq"><Building2 className="w-3.5 h-3.5 mr-1" />QTO & BOQ</TabsTrigger>
          <TabsTrigger value="analysis" data-testid="tab-analysis">
            <TrendingUp className="w-3.5 h-3.5 mr-1" />Analysis
          </TabsTrigger>
        </TabsList>

        {/* ══════════════ TAB 1: CALCULATOR ══════════════ */}
        <TabsContent value="calculator">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left column: sections 1-8 */}
            <div className="lg:col-span-2 space-y-5">

              {/* Section ①: Project Info */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">① Project Info</CardTitle>
                  <HelpBtn id="proj-info" />
                </CardHeader>
                <HelpPanel id="proj-info" title="① Project Info">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Estimate Name</b> — label that appears in the saved estimates list</li>
                <li><b>Contractor</b> — name used in the Contract Profitability section</li>
                <li><b>Structure Type</b> — drives QTO formulas and shuttering m²/m³ defaults (set this first)</li>
                <li><b>Concrete Grade</b> — auto-fills Mix Design kg/m³ per IS:456/IS:10262; all values stay editable</li>
                <li><b>Total Volume (m³)</b> — total concrete for this estimate; used to spread BBS steel cost and curing cost per m³</li>
                </ul>
              </HelpPanel>
                <CardContent className="px-5 pb-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Estimate Name</Label>
                      <Input
                        value={s.estimateName}
                        onChange={(e) => update({ estimateName: e.target.value.toUpperCase() })}
                        placeholder="e.g. DRAIN DESIGN PACKAGE - NH HIGHWAY"
                        className="mt-1 h-9 text-sm uppercase"
                        data-testid="input-estimate-name"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contractor</Label>
                      <Input value={s.contractor} onChange={(e) => update({ contractor: e.target.value.toUpperCase() })} className="mt-1 h-9 text-sm uppercase" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Prepared By</Label>
                      <Input value={s.preparedBy} onChange={(e) => update({ preparedBy: e.target.value.toUpperCase() })} className="mt-1 h-9 text-sm uppercase" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Structure Type</Label>
                      <Select value={s.structureType} onValueChange={applyStructureType}>
                        <SelectTrigger className="mt-1 h-9 text-sm" data-testid="select-structure-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["Drain", "Box Culvert", "Bridge", "Retaining Wall"].map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Concrete Grade</Label>
                      <Select value={s.grade} onValueChange={applyGradePreset}>
                        <SelectTrigger className="mt-1 h-9 text-sm" data-testid="select-grade">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(MIX_PRESETS).map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      {numInput("Total Volume (m³)", s.totalVolume, (v) => update({ totalVolume: v }), { unit: "m³", testId: "input-volume" })}
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Date</Label>
                      <Input type="date" value={s.date} onChange={(e) => update({ date: e.target.value })} className="mt-1 h-9 text-sm" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Section ②: Mix Design */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">② Concrete Mix Design (IS:456)</CardTitle>
                  <HelpBtn id="mix-design" />
                </CardHeader>
                <HelpPanel id="mix-design" title="② Mix Design">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li>Auto-filled from Grade selection using IS:456/IS:10262 codal quantities — all values are editable</li>
                <li><b>Cement kg/m³</b> — drives the ₹/m³ cement cost (quantity × price per 50 kg bag)</li>
                <li><b>Coarse Agg kg/m³</b> — total CA weight; split across 20mm/10mm/6mm tabs by proportion</li>
                <li><b>Fine Agg kg/m³</b> — for natural sand, volume is increased by bulkage factor (set in Section ③)</li>
                <li><b>W/C Ratio</b> — informational only (not used in cost calculation)</li>
                <li><b>Admix %</b> — admixture dosage as % of cement weight; multiplied by rate ₹/L from Section ③</li>
                <li>Re-selecting Grade re-fills all values from the preset; you can then override individually</li>
                </ul>
              </HelpPanel>
                <CardContent className="px-5 pb-5">
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {numInput("Cement (kg/m³)", s.mix.cementKg, (v) => updateMix({ cementKg: v }), { testId: "input-cement-kg" })}
                    {numInput("Coarse Agg (kg/m³)", s.mix.caKg, (v) => updateMix({ caKg: v }))}
                    {numInput("Fine Agg (kg/m³)", s.mix.faKg, (v) => updateMix({ faKg: v }))}
                    {numInput("W/C Ratio", s.mix.wcRatio, (v) => updateMix({ wcRatio: v }), { step: 0.01 })}
                    {numInput("Admix %", s.mix.admixPct, (v) => updateMix({ admixPct: v }), { unit: "%", step: 0.05 })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Preset auto-filled from grade — all values editable
                  </p>
                </CardContent>
              </Card>

              {/* Section ③: Raw Materials */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">③ Raw Materials</CardTitle>
                  <HelpBtn id="raw-materials" />
                </CardHeader>
                <HelpPanel id="raw-materials" title="③ Raw Materials">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Cement</b> — enter ₹/bag (50 kg bag). Auto-converted to ₹/m³ using mix kg/m³</li>
                <li><b>CA tabs (20mm / 10mm / 6mm)</b> — proportions must total 100%. Landed rate = Purchase rate + (Lead km × 2 × Freight ÷ Payload MT)</li>
                <li><b>UoM selector</b> — per_MT (default), per_CFT, or per_m³. Rates are normalised to ₹/MT internally for blending</li>
                <li><b>Fine Aggregate</b> — Natural Sand includes bulkage (slider 0–30%, default 12%). Robosand has no bulkage. Same landed-rate formula as CA</li>
                <li><b>Admixture</b> — enter rate ₹/L and dosage L/m³ → ₹/m³ = Rate × Dosage</li>
                </ul>
              </HelpPanel>
                <CardContent className="px-5 pb-5 space-y-5">
                  {/* Cement */}
                  <div>
                    <p className="text-xs font-semibold mb-2">Cement</p>
                    <div className="flex items-end gap-4">
                      {numInput("Price per 50-kg bag", s.cementBagPrice, (v) => update({ cementBagPrice: v }), { unit: "₹/bag", testId: "input-cement-price" })}
                      <div className="pb-1 text-xs text-muted-foreground whitespace-nowrap">
                        → {fmtR((s.mix.cementKg / 50) * s.cementBagPrice)}/m³
                      </div>
                    </div>
                  </div>

                  {/* Coarse Aggregate — tabbed */}
                  <div>
                    <p className="text-xs font-semibold mb-2">Coarse Aggregate</p>
                    <Tabs defaultValue="0">
                      <TabsList className="h-7">
                        {["20mm", "10mm", "6mm (Grit)"].map((lbl, i) => (
                          <TabsTrigger key={i} value={String(i)} className="text-xs px-3 py-1">{lbl}</TabsTrigger>
                        ))}
                      </TabsList>
                      {s.caTabs.map((tab, i) => {
                        const uom = tab.uom ?? "per_mt";
                        const uomLabel = uom === "per_cft" ? "₹/CFT" : uom === "per_m3" ? "₹/m³" : "₹/MT";
                        const ratePerMT = aggRateToPerMT(tab.purchaseRate, uom);
                        const landed = ratePerMT + (tab.leadKm * 2 * tab.freightRate / (tab.payload || 1));
                        return (
                          <TabsContent key={i} value={String(i)} className="pt-3">
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                              {numInput("Proportion %", tab.proportion, (v) => {
                                const tabs = [...s.caTabs]; tabs[i] = { ...tab, proportion: v }; update({ caTabs: tabs });
                              }, { unit: "%", testId: `input-ca-prop-${i}` })}
                              <div className="space-y-1">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Purchase Rate ({uomLabel})</Label>
                                <div className="flex gap-1 min-w-[180px]">
                                  <Input
                                    type="number"
                                    step="any"
                                    min={0}
                                    value={tab.purchaseRate}
                                    onChange={(e) => { const tabs = [...s.caTabs]; tabs[i] = { ...tab, purchaseRate: parseFloat(e.target.value) || 0 }; update({ caTabs: tabs }); }}
                                    className="h-9 text-sm flex-1 min-w-0"
                                    data-testid={`input-ca-rate-${i}`}
                                  />
                                  <Select value={uom} onValueChange={(v) => { const tabs = [...s.caTabs]; tabs[i] = { ...tab, uom: v as AggUoM }; update({ caTabs: tabs }); }}>
                                    <SelectTrigger className="h-9 w-[90px] text-xs shrink-0" data-testid={`select-ca-uom-${i}`}><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="per_mt">₹/MT</SelectItem>
                                      <SelectItem value="per_cft">₹/CFT</SelectItem>
                                      <SelectItem value="per_m3">₹/m³</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              {numInput("Lead (km)", tab.leadKm, (v) => {
                                const tabs = [...s.caTabs]; tabs[i] = { ...tab, leadKm: v }; update({ caTabs: tabs });
                              })}
                              {numInput("Freight (₹/MT/km)", tab.freightRate, (v) => {
                                const tabs = [...s.caTabs]; tabs[i] = { ...tab, freightRate: v }; update({ caTabs: tabs });
                              })}
                              {numInput("Payload (MT)", tab.payload, (v) => {
                                const tabs = [...s.caTabs]; tabs[i] = { ...tab, payload: v }; update({ caTabs: tabs });
                              })}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              Landed = {fmtR(ratePerMT)}/MT (normalized) + freight = <strong>{fmtR(landed)}/MT</strong>
                            </p>
                          </TabsContent>
                        );
                      })}
                    </Tabs>
                  </div>

                  {/* Fine Aggregate */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-xs font-semibold">Fine Aggregate</p>
                      <div className="flex items-center gap-2">
                        <button
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${s.faType === "natural" ? "bg-blue-600 text-white border-blue-600" : "text-muted-foreground border-border"}`}
                          onClick={() => update({ faType: "natural" })}
                          data-testid="btn-fa-natural"
                        >Natural River Sand</button>
                        <button
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${s.faType === "robosand" ? "bg-blue-600 text-white border-blue-600" : "text-muted-foreground border-border"}`}
                          onClick={() => update({ faType: "robosand" })}
                          data-testid="btn-fa-robosand"
                        >Robosand / M-Sand</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Purchase Rate ({(s.faUom ?? "per_cft") === "per_cft" ? "₹/CFT" : (s.faUom ?? "per_cft") === "per_m3" ? "₹/m³" : "₹/MT"})</Label>
                        <div className="flex gap-1 min-w-[180px]">
                          <Input type="number" step="any" min={0} value={s.faPurchaseRate}
                            onChange={(e) => update({ faPurchaseRate: parseFloat(e.target.value) || 0 })}
                            className="h-9 text-sm flex-1 min-w-0" data-testid="input-fa-rate" />
                          <Select value={s.faUom ?? "per_cft"} onValueChange={(v) => update({ faUom: v as AggUoM })}>
                            <SelectTrigger className="h-9 w-[90px] text-xs shrink-0" data-testid="select-fa-uom"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="per_mt">₹/MT</SelectItem>
                              <SelectItem value="per_cft">₹/CFT</SelectItem>
                              <SelectItem value="per_m3">₹/m³</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {numInput("Lead (km)", s.faLeadKm, (v) => update({ faLeadKm: v }))}
                      {numInput("Freight (₹/MT/km)", s.faFreightRate, (v) => update({ faFreightRate: v }))}
                      {numInput("Payload (MT)", s.faPayload, (v) => update({ faPayload: v }))}
                      {s.faType === "natural" && numInput("Bulkage %", s.faBulkagePct, (v) => update({ faBulkagePct: v }), { unit: "%", step: 1, min: 0, testId: "input-bulkage" })}
                    </div>
                    {s.faType === "natural" && (
                      <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                        <Info className="w-3 h-3" /> Bulkage adds {fmtPct(s.faBulkagePct)} to effective FA volume → +{fmtR(costs.fa * s.faBulkagePct / 100 / (1 + s.faBulkagePct / 100))}/m³ impact
                      </p>
                    )}
                  </div>

                  {/* Admixture */}
                  <div>
                    <p className="text-xs font-semibold mb-2">Admixture</p>
                    <div className="grid grid-cols-3 gap-3">
                      {numInput("Dosage (L/m³)", s.admixDosage, (v) => update({ admixDosage: v }), { step: 0.05 })}
                      {numInput("Rate (₹/L)", s.admixRate, (v) => update({ admixRate: v }))}
                      <div className="flex items-end pb-1">
                        <span className="text-xs text-muted-foreground">→ {fmtR(costs.admix)}/m³</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Location Variants Card */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-violet-500" /> Location Variants — Rate Blender
                      <HelpBtn id="location-variants" />
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Add different sourcing locations. Each overrides CA & FA rates/lead for that stretch. Weighted blend visible in Analysis → Rate Blender tab.</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                    onClick={() => {
                      const loc: LocationVariant = {
                        id: uid(), name: "Location " + ((s.locationVariants ?? []).length + 1), lengthM: 1000,
                        caSources: s.caTabs.map(t => ({ purchaseRate: t.purchaseRate, uom: t.uom, leadKm: t.leadKm, freightRate: t.freightRate, payload: t.payload })),
                        faOverride: { purchaseRate: s.faPurchaseRate, uom: s.faUom ?? "per_cft", leadKm: s.faLeadKm, freightRate: s.faFreightRate, payload: s.faPayload },
                      };
                      update({ locationVariants: [...(s.locationVariants ?? []), loc] });
                    }}
                    data-testid="btn-add-location"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Location
                  </Button>
                </CardHeader>
                <HelpPanel id="location-variants" title="Location Variants — Rate Blender">
                  <ul className="space-y-1.5 list-disc list-outside ml-3">
                    <li><b>Purpose</b> — model stretches of road where quarry distances or supplier rates differ. Each location gets its own CA and FA sourcing rates.</li>
                    <li><b>Proportions</b> — CA blend proportions (20mm/10mm/6mm split %) always come from the base Mix Design in Section ③ — only rates and lead change here.</li>
                    <li><b>Length (m)</b> — how long this stretch is. Used to weight the blended cost in Analysis → Rate Blender tab.</li>
                    <li><b>Cost badge</b> — the ₹/m³ figure shown on each location row is the full calculated cost (materials + plant + labour) using that location's CA/FA sourcing.</li>
                    <li><b>FA Override</b> — overrides the fine aggregate purchase rate and lead distance for this location only.</li>
                  </ul>
                </HelpPanel>
                {(s.locationVariants ?? []).length > 0 && (
                  <CardContent className="px-5 pb-5 space-y-4">
                    {(s.locationVariants ?? []).map((loc) => {
                      const locCosts = computeCosts(s, steelCostPerM3, loc.caSources, loc.faOverride, pettyLabourRatePerM3);
                      const totalLen = (s.locationVariants ?? []).reduce((sum, l) => sum + l.lengthM, 0);
                      const wt = totalLen > 0 ? (loc.lengthM / totalLen * 100).toFixed(1) : "0.0";
                      return (
                        <div key={loc.id} className="border border-violet-200 rounded-lg p-4 space-y-4 bg-violet-50/30" data-testid={`location-row-${loc.id}`}>
                          {/* Location header row */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <Input value={loc.name} onChange={(e) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, name: e.target.value.toUpperCase() } : l) })}
                              className="h-8 text-sm font-semibold uppercase flex-1 min-w-[140px]" placeholder="LOCATION NAME" data-testid={`input-loc-name-${loc.id}`} />
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Label className="text-sm font-medium text-slate-700 whitespace-nowrap">Length (m)</Label>
                              <Input type="number" step="100" min={1} value={loc.lengthM}
                                onChange={(e) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, lengthM: parseFloat(e.target.value) || 1 } : l) })}
                                className="h-8 w-28 text-sm" data-testid={`input-loc-length-${loc.id}`} />
                            </div>
                            <Badge variant="outline" className="text-xs text-violet-700 border-violet-300 shrink-0">{wt}% of total</Badge>
                            <Badge className="text-sm font-bold bg-violet-100 text-violet-800 border border-violet-300 shrink-0 px-3 py-1">{fmtR(locCosts.totalWithEsc)}/m³</Badge>
                            <button onClick={() => update({ locationVariants: (s.locationVariants ?? []).filter(l => l.id !== loc.id) })} className="text-destructive hover:text-destructive/70 p-1 ml-auto" data-testid={`btn-del-loc-${loc.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          {/* CA overrides — scrollable table */}
                          <div>
                            <p className="text-sm font-semibold text-slate-700 mb-2">CA Rates Override <span className="font-normal text-slate-500 text-xs">(proportions fixed from base mix design)</span></p>
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-sm" style={{ minWidth: 580 }}>
                                <thead>
                                  <tr className="bg-violet-100/60 text-slate-600">
                                    <th className="text-left p-2 font-medium text-xs">Size</th>
                                    <th className="text-left p-2 font-medium text-xs">Purchase Rate</th>
                                    <th className="text-left p-2 font-medium text-xs">UoM</th>
                                    <th className="text-left p-2 font-medium text-xs">Lead (km)</th>
                                    <th className="text-left p-2 font-medium text-xs">Freight (₹/MT/km)</th>
                                    <th className="text-left p-2 font-medium text-xs">Payload (MT)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(loc.caSources ?? []).map((src, i) => {
                                    const uom = src.uom ?? "per_mt";
                                    const labels = ["20mm", "10mm", "6mm"];
                                    const upd = (patch: Partial<CASourceOverride>) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, caSources: l.caSources.map((c, j) => j === i ? { ...c, ...patch } : c) } : l) });
                                    return (
                                      <tr key={i} className="border-t border-violet-100">
                                        <td className="p-2 font-semibold text-slate-700 whitespace-nowrap">{labels[i]} <span className="font-normal text-slate-500 text-xs">({s.caTabs[i]?.proportion ?? 0}%)</span></td>
                                        <td className="p-2"><Input type="number" step="any" min={0} value={src.purchaseRate}
                                          onChange={(e) => upd({ purchaseRate: parseFloat(e.target.value) || 0 })}
                                          className="h-8 text-sm w-28" data-testid={`input-loc-ca-rate-${loc.id}-${i}`} /></td>
                                        <td className="p-2">
                                          <Select value={uom} onValueChange={(v) => upd({ uom: v as AggUoM })}>
                                            <SelectTrigger className="h-8 text-xs w-[90px]"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="per_mt">₹/MT</SelectItem>
                                              <SelectItem value="per_cft">₹/CFT</SelectItem>
                                              <SelectItem value="per_m3">₹/m³</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </td>
                                        <td className="p-2"><Input type="number" step="1" min={0} value={src.leadKm}
                                          onChange={(e) => upd({ leadKm: parseFloat(e.target.value) || 0 })}
                                          className="h-8 text-sm w-20" data-testid={`input-loc-ca-lead-${loc.id}-${i}`} /></td>
                                        <td className="p-2"><Input type="number" step="0.5" min={0} value={src.freightRate}
                                          onChange={(e) => upd({ freightRate: parseFloat(e.target.value) || 0 })}
                                          className="h-8 text-sm w-24" data-testid={`input-loc-ca-freight-${loc.id}-${i}`} /></td>
                                        <td className="p-2"><Input type="number" step="0.5" min={0.1} value={src.payload}
                                          onChange={(e) => upd({ payload: parseFloat(e.target.value) || 1 })}
                                          className="h-8 text-sm w-20" data-testid={`input-loc-ca-payload-${loc.id}-${i}`} /></td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          {/* FA override */}
                          <div>
                            <p className="text-sm font-semibold text-slate-700 mb-2">FA Rate Override</p>
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-sm" style={{ minWidth: 580 }}>
                                <thead>
                                  <tr className="bg-violet-100/60 text-slate-600">
                                    <th className="text-left p-2 font-medium text-xs">Type</th>
                                    <th className="text-left p-2 font-medium text-xs">Purchase Rate</th>
                                    <th className="text-left p-2 font-medium text-xs">UoM</th>
                                    <th className="text-left p-2 font-medium text-xs">Lead (km)</th>
                                    <th className="text-left p-2 font-medium text-xs">Freight (₹/MT/km)</th>
                                    <th className="text-left p-2 font-medium text-xs">Payload (MT)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="border-t border-violet-100">
                                    <td className="p-2 font-semibold text-slate-700">Fine Agg</td>
                                    <td className="p-2"><Input type="number" step="any" min={0} value={loc.faOverride.purchaseRate}
                                      onChange={(e) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, faOverride: { ...l.faOverride, purchaseRate: parseFloat(e.target.value) || 0 } } : l) })}
                                      className="h-8 text-sm w-28" data-testid={`input-loc-fa-rate-${loc.id}`} /></td>
                                    <td className="p-2">
                                      <Select value={loc.faOverride.uom} onValueChange={(v) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, faOverride: { ...l.faOverride, uom: v as AggUoM } } : l) })}>
                                        <SelectTrigger className="h-8 text-xs w-[90px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="per_mt">₹/MT</SelectItem>
                                          <SelectItem value="per_cft">₹/CFT</SelectItem>
                                          <SelectItem value="per_m3">₹/m³</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="p-2"><Input type="number" step="1" min={0} value={loc.faOverride.leadKm}
                                      onChange={(e) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, faOverride: { ...l.faOverride, leadKm: parseFloat(e.target.value) || 0 } } : l) })}
                                      className="h-8 text-sm w-20" data-testid={`input-loc-fa-lead-${loc.id}`} /></td>
                                    <td className="p-2"><Input type="number" step="0.5" min={0} value={loc.faOverride.freightRate}
                                      onChange={(e) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, faOverride: { ...l.faOverride, freightRate: parseFloat(e.target.value) || 0 } } : l) })}
                                      className="h-8 text-sm w-24" data-testid={`input-loc-fa-freight-${loc.id}`} /></td>
                                    <td className="p-2"><Input type="number" step="0.5" min={0.1} value={loc.faOverride.payload}
                                      onChange={(e) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, faOverride: { ...l.faOverride, payload: parseFloat(e.target.value) || 1 } } : l) })}
                                      className="h-8 text-sm w-20" data-testid={`input-loc-fa-payload-${loc.id}`} /></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                              <Info className="w-3 h-3" /> CA+FA cost for this location: <strong>{fmtR(locCosts.ca + locCosts.fa)}/m³</strong>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>

              {/* Section ④: Batching Equipment */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <div className="flex items-center">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">④ Batching Equipment</CardTitle>
                    <HelpBtn id="batching" />
                  </div>
                  <Button size="sm" variant="outline" onClick={addBatchingRow} className="h-7 text-xs" data-testid="btn-add-batching">
                    <Plus className="w-3 h-3 mr-1" /> Add Row
                  </Button>
                </CardHeader>
                <HelpPanel id="batching" title="④ Batching Equipment">
                  <ul className="space-y-1.5 list-disc list-outside ml-3">
                    <li><b>Own mode</b> — enter hourly costs (depreciation + fuel + operator) and output m³/hr → ₹/m³ = Total/hr ÷ Output</li>
                    <li><b>Hired (per day)</b> — hire rate ₹/day ÷ output m³/day → ₹/m³</li>
                    <li><b>Hired (per m³)</b> — rate is already ₹/m³; enter it directly</li>
                    <li><b>Hired (per month)</b> — ₹/month ÷ m³/month output → ₹/m³</li>
                    <li>Add multiple rows (e.g. drum mixer + transit mixer); all ₹/m³ values sum to give Section ④ total</li>
                  </ul>
                </HelpPanel>
                <CardContent className="px-5 pb-5">
                  {s.batchingRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No equipment added. Click "Add Row" to add batching equipment.</p>
                  ) : (
                    <div className="space-y-4">
                      {s.batchingRows.map((row) => (
                        <div key={row.id} className="border border-border rounded-lg p-3 space-y-3" data-testid={`batching-row-${row.id}`}>
                          <div className="flex items-center gap-3">
                            <Select value={row.type} onValueChange={(v) => updateBatchingRow(row.id, { type: v })}>
                              <SelectTrigger className="h-7 text-xs flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {["Ajax Self-Loader", "Drum Mixer", "Pan Mixer", "Transit Mixer", "RMC"].map((t) => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input placeholder="Model" value={row.model} onChange={(e) => updateBatchingRow(row.id, { model: e.target.value.toUpperCase() })} className="h-7 text-xs w-32 uppercase" />
                            <div className="flex items-center gap-2">
                              <button
                                className={`text-xs px-2 py-1 rounded border transition-colors ${row.mode === "own" ? "bg-blue-100 text-blue-700 border-blue-300" : "text-muted-foreground border-border"}`}
                                onClick={() => updateBatchingRow(row.id, { mode: "own" })}
                              >Own</button>
                              <button
                                className={`text-xs px-2 py-1 rounded border transition-colors ${row.mode === "hired" ? "bg-blue-100 text-blue-700 border-blue-300" : "text-muted-foreground border-border"}`}
                                onClick={() => updateBatchingRow(row.id, { mode: "hired" })}
                              >Hired</button>
                            </div>
                            <button onClick={() => removeBatchingRow(row.id)} className="text-destructive hover:text-destructive/70 p-1">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                            {row.mode === "own" ? (
                              <>
                                {numInput("Depreciation (₹/hr)", row.depreciation, (v) => updateBatchingRow(row.id, { depreciation: v }))}
                                {numInput("Fuel (₹/hr)", row.fuel, (v) => updateBatchingRow(row.id, { fuel: v }))}
                                {numInput("Operator (₹/hr)", row.operator, (v) => updateBatchingRow(row.id, { operator: v }))}
                                {numInput("Output (m³/hr)", row.output, (v) => updateBatchingRow(row.id, { output: v }), { step: 0.5 })}
                                <div className="flex items-end pb-1 text-xs text-muted-foreground">
                                  → {fmtR(row.output > 0 ? (row.depreciation + row.fuel + row.operator) / row.output : 0)}/m³
                                </div>
                              </>
                            ) : (
                              <>
                                {numInput("Hire Rate", row.hireRate, (v) => updateBatchingRow(row.id, { hireRate: v }))}
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Rate Mode</Label>
                                  <Select value={row.hireMode} onValueChange={(v: "per_day" | "per_m3" | "per_month") => updateBatchingRow(row.id, { hireMode: v })}>
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="per_day">₹/day</SelectItem>
                                      <SelectItem value="per_m3">₹/m³</SelectItem>
                                      <SelectItem value="per_month">₹/month</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {row.hireMode === "per_day" && numInput("Output (m³/day)", row.output, (v) => updateBatchingRow(row.id, { output: v }), { step: 1 })}
                                {row.hireMode === "per_month" && numInput("Output (m³/month)", row.outputPerMonth ?? 0, (v) => updateBatchingRow(row.id, { outputPerMonth: v }), { step: 10 })}
                                <div className="flex items-end pb-1 text-xs text-muted-foreground">
                                  → {fmtR(row.hireMode === "per_m3" ? row.hireRate : row.hireMode === "per_month" ? ((row.outputPerMonth ?? 0) > 0 ? row.hireRate / (row.outputPerMonth ?? 1) : 0) : (row.output > 0 ? row.hireRate / row.output : 0))}/m³
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">Total batching: {fmtR(costs.batching)}/m³</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Section ⑤: Placement */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">⑤ Concrete Placement</CardTitle>
                  <HelpBtn id="placement" />
                </CardHeader>
                <HelpPanel id="placement" title="⑤ Concrete Placement">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Own Pump</b> — operating cost ₹/day ÷ output m³/day → ₹/m³</li>
                <li><b>Hired Pump</b> — hire rate ₹/day ÷ output m³/day → ₹/m³</li>
                <li><b>Transit Mixer</b> — (hire ₹/trip × trips/day) ÷ output m³/day → ₹/m³</li>
                <li><b>Labour Only</b> — enter ₹/m³ directly for manual placement without pump equipment</li>
                </ul>
              </HelpPanel>
                <CardContent className="px-5 pb-5">
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {(["own", "hired", "transit_mixer", "labour"] as const).map((m) => (
                      <button key={m} className={`text-xs px-3 py-1 rounded-full border transition-colors ${s.placementMode === m ? "bg-blue-600 text-white border-blue-600" : "text-muted-foreground border-border"}`}
                        onClick={() => update({ placementMode: m })}>
                        {m === "own" ? "Own Pump" : m === "hired" ? "Hired Pump" : m === "transit_mixer" ? "Transit Mixer" : "Labour Only"}
                      </button>
                    ))}
                  </div>
                  <div className={pettyLabourRatePerM3 !== undefined ? "opacity-40 pointer-events-none" : ""}>
                  {s.placementMode === "transit_mixer" ? (
                    <div className="grid grid-cols-3 gap-3">
                      {numInput("Hire per Trip (₹)", s.tmHirePerTrip, (v) => update({ tmHirePerTrip: v }))}
                      {numInput("Trips/day", s.tmTripsPerDay, (v) => update({ tmTripsPerDay: v }), { step: 1 })}
                      {numInput("Output (m³/day)", s.placementOutputPerDay, (v) => update({ placementOutputPerDay: v }))}
                      <div className="flex items-end pb-1 text-xs text-muted-foreground col-span-3">
                        → {fmtR(costs.placement)}/m³ &nbsp;({fmtR(s.tmHirePerTrip * s.tmTripsPerDay)}/day total ÷ {s.placementOutputPerDay} m³/day)
                      </div>
                    </div>
                  ) : s.placementMode === "labour" ? (
                    <div className="grid grid-cols-3 gap-3">
                      {numInput("Labour Placement Rate (₹/m³)", s.placementRatePerDay, (v) => update({ placementRatePerDay: v }))}
                      <div className="flex items-end pb-1 text-xs text-muted-foreground col-span-2">→ {fmtR(costs.placement)}/m³ (direct rate)</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {numInput(`${s.placementMode === "own" ? "Operating Cost" : "Hire Rate"} (₹/day)`, s.placementRatePerDay, (v) => update({ placementRatePerDay: v }))}
                      {numInput("Output (m³/day)", s.placementOutputPerDay, (v) => update({ placementOutputPerDay: v }))}
                      <div className="flex items-end pb-1 text-xs text-muted-foreground">→ {fmtR(costs.placement)}/m³</div>
                    </div>
                  )}
                  </div>

                  {/* Petty Labour Contract */}
                  <div className="mt-4 pt-4 border-t border-border/60">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs font-semibold">Petty Labour Contract</p>
                        <p className="text-[11px] text-muted-foreground">Replaces pump/placement rate with an all-in contract rate</p>
                      </div>
                      <Switch checked={s.pettyLabour.enabled} onCheckedChange={(v) => update({ pettyLabour: { ...s.pettyLabour, enabled: v } })} data-testid="switch-petty-labour" />
                    </div>
                    {s.pettyLabour.enabled && (
                      <div className="mt-3 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex-1 min-w-[120px]">
                            <Label className="text-xs text-muted-foreground">Contract Rate</Label>
                            <Input type="number" value={s.pettyLabour.rateValue} onChange={(e) => update({ pettyLabour: { ...s.pettyLabour, rateValue: parseFloat(e.target.value) || 0 } })} className="h-8 text-xs mt-0.5" data-testid="input-petty-labour-rate" />
                          </div>
                          <div className="min-w-[90px]">
                            <Label className="text-xs text-muted-foreground">Unit</Label>
                            <Select value={s.pettyLabour.rateUnit} onValueChange={(v) => update({ pettyLabour: { ...s.pettyLabour, rateUnit: v as "per_m3" | "per_rm" } })}>
                              <SelectTrigger className="h-8 text-xs mt-0.5" data-testid="select-petty-labour-unit"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="per_m3">₹/m³</SelectItem>
                                <SelectItem value="per_rm">₹/RM</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end pb-1 text-xs font-semibold">
                            {s.pettyLabour.rateUnit === "per_rm" && crossSectionM2 <= 0
                              ? <span className="text-red-600">⚠ Enter QTO data (Height Zones) for RM conversion</span>
                              : <span className="text-amber-700">= {fmtR(pettyLabourRatePerM3 ?? 0)}/m³</span>}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">Contractor's scope includes:</p>
                          <div className="flex flex-col gap-1.5">
                            {([
                              { key: "contractorFormwork" as const, label: "Formwork & Staging (bypasses ⑥ cost)" },
                              { key: "contractorBBS" as const, label: "Bar Bending & Fixing (informational — steel material cost still applies)" },
                            ]).map(({ key, label }) => (
                              <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                                <input type="checkbox" checked={s.pettyLabour[key] as boolean}
                                  onChange={(e) => update({ pettyLabour: { ...s.pettyLabour, [key]: e.target.checked } })}
                                  className="rounded" data-testid={`chk-petty-${key}`} />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Section ⑥: Formwork & Staging */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">⑥ Formwork & Staging</CardTitle>
                  <HelpBtn id="formwork" />
                </CardHeader>
                <HelpPanel id="formwork" title="⑥ Formwork & Staging">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Shuttering ₹/m³</b> = (m²/m³ × Cost/m²/use) ÷ Reuse cycles. Structure type sets m²/m³ default (Drain=3.0, Bridge=6.0)</li>
                <li><b>Reuse cycles</b> — more reuses = lower cost per pour. Factor in breakage/loss; Wastage toggle reduces cycles by 10%</li>
                <li><b>Staging ₹/m³</b> = Soffit area m²/m³ × Hire rate ₹/m²/month × Months in use</li>
                <li>Staging applies only to horizontal (soffit) surfaces; vertical walls have no staging component</li>
                </ul>
              </HelpPanel>
                <CardContent className="px-5 pb-5 space-y-5">
                  {s.pettyLabour.enabled && s.pettyLabour.contractorFormwork && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Bypassed — Petty Labour Contract covers Formwork &amp; Staging. Formwork cost = ₹0/m³ in this estimate.
                    </div>
                  )}
                  <div className={s.pettyLabour.enabled && s.pettyLabour.contractorFormwork ? "opacity-40 pointer-events-none" : ""}>
                  <div>
                    <p className="text-xs font-semibold mb-2">Shuttering System</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {["Steel Plates + Angles", "Steel Frame + Timber Ply", "Modular Aluminium Formwork", "I-beam + Plywood"].map((opt) => (
                        <button key={opt}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${s.shutteringSystem === opt ? "bg-blue-100 text-blue-700 border-blue-300" : "text-muted-foreground border-border hover:border-muted-foreground"}`}
                          onClick={() => update({ shutteringSystem: opt })}
                          data-testid={`btn-shuttering-${opt}`}
                        >{opt}</button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {numInput("Area (m²/m³ concrete)", s.shutteringAreaPerM3, (v) => update({ shutteringAreaPerM3: v }), { step: 0.5 })}
                      {numInput("Cost (₹/m²/use)", s.shutteringCostPerM2, (v) => update({ shutteringCostPerM2: v }))}
                      {numInput("Reuse Cycles", s.shutteringReuseCycles, (v) => update({ shutteringReuseCycles: v }))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-2">Staging System</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {["Cuplock Scaffolding", "Prop & Beam", "Timber Cribs", "I-beam Spans"].map((opt) => (
                        <button key={opt}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${s.stagingSystem === opt ? "bg-teal-100 text-teal-700 border-teal-300" : "text-muted-foreground border-border hover:border-muted-foreground"}`}
                          onClick={() => update({ stagingSystem: opt })}
                          data-testid={`btn-staging-${opt}`}
                        >{opt}</button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {numInput("Soffit Area (m²/m³)", s.stagingAreaPerM3, (v) => update({ stagingAreaPerM3: v }), { step: 0.1 })}
                      {numInput("Staging Height (m)", s.stagingHeight, (v) => update({ stagingHeight: v }), { step: 0.5 })}
                      {numInput("Hire Rate (₹/m²/month)", s.stagingHireRate, (v) => update({ stagingHireRate: v }))}
                      {numInput("Months in Use", s.stagingMonths, (v) => update({ stagingMonths: v }))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">Cost = Soffit Area (m²/m³) × Hire Rate (₹/m²/month) × Months. Applies only to horizontal/soffit surfaces (invert slab, deck, culvert roof).</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Total formwork + staging: {fmtR(costs.formwork)}/m³</p>
                  </div>
                </CardContent>
              </Card>

              {/* Section ⑦: Curing */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">⑦ Curing</CardTitle>
                  <HelpBtn id="curing" />
                </CardHeader>
                <HelpPanel id="curing" title="⑦ Curing">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Mobile Tanker</b> — ₹/m³ = (Trips/day × Hire rate ₹/trip × Curing days) ÷ Total volume m³</li>
                <li><b>Static Tank</b> — ₹/m³ = (Pump electricity cost + Daily water KL × water ₹/KL × days) ÷ Volume. Uses separate "Daily water KL" field</li>
                <li>Tanker and Static Tank are mutually exclusive — choose one radio button</li>
                <li><b>Curing Compound</b> — can be used alongside water curing; ₹/m³ = (Surface area m²/m³ ÷ Coverage m²/L) × Rate ₹/L</li>
                </ul>
              </HelpPanel>
                <CardContent className="px-5 pb-5 space-y-5">
                  <div>
                    <p className="text-xs font-semibold mb-2">Water Curing Mode</p>
                    <div className="flex gap-2 mb-3">
                      {[["tanker", "Mobile Tanker"], ["static", "Static Tank"]].map(([val, lbl]) => (
                        <button key={val}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${s.waterCuringMode === val ? "bg-cyan-100 text-cyan-700 border-cyan-300" : "text-muted-foreground border-border"}`}
                          onClick={() => update({ waterCuringMode: val as "tanker" | "static" })}
                        >{lbl}</button>
                      ))}
                    </div>
                    {s.waterCuringMode === "tanker" ? (
                      <div className="grid grid-cols-4 gap-3">
                        {numInput("Capacity (KL)", s.tankerCapKL, (v) => update({ tankerCapKL: v }))}
                        {numInput("Trips/day", s.tankerTripsPerDay, (v) => update({ tankerTripsPerDay: v }))}
                        {numInput("Hire Rate (₹/trip)", s.tankerHireRate, (v) => update({ tankerHireRate: v }))}
                        {numInput("Curing Days", s.curingDays, (v) => update({ curingDays: v }))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {numInput("Pump (kW)", s.staticPumpKw, (v) => update({ staticPumpKw: v }), { step: 0.5 })}
                        {numInput("Electricity (₹/kWh)", s.staticElecRate, (v) => update({ staticElecRate: v }))}
                        {numInput("Daily Water (KL/day)", s.staticDailyWaterKL, (v) => update({ staticDailyWaterKL: v }), { step: 0.5 })}
                        {numInput("Water Cost (₹/KL)", s.staticWaterCostKL, (v) => update({ staticWaterCostKL: v }))}
                        {numInput("Curing Days", s.curingDays, (v) => update({ curingDays: v }))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <Switch
                        checked={s.curingCompoundEnabled}
                        onCheckedChange={(v) => update({ curingCompoundEnabled: v })}
                        data-testid="switch-curing-compound"
                      />
                      <Label className="text-xs font-semibold">Curing Compound</Label>
                    </div>
                    {s.curingCompoundEnabled && (
                      <div className="grid grid-cols-3 gap-3">
                        {numInput("Rate (₹/L)", s.curingCompoundRate, (v) => update({ curingCompoundRate: v }))}
                        {numInput("Coverage (m²/L)", s.curingCompoundCoverage, (v) => update({ curingCompoundCoverage: v }))}
                        {numInput("Surface Area (m²/m³)", s.curingCompoundSurfaceArea, (v) => update({ curingCompoundSurfaceArea: v }), { step: 0.1 })}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Total curing: {fmtR(costs.curing)}/m³</p>
                </CardContent>
              </Card>

              {/* Section ⑧: Labour + Overhead & Margin */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">⑧ Labour, Overhead & Margin</CardTitle>
                  <HelpBtn id="overhead" />
                </CardHeader>
                <HelpPanel id="overhead" title="⑧ Overhead & Margin">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Labour ₹/m³</b> — direct cost for concrete crew (screeding, vibration, curing labour)</li>
                <li><b>Overhead %</b> — applied to total direct costs (materials + plant + formwork + labour + curing + wastage)</li>
                <li><b>Margin %</b> — contractor markup applied to (direct + overhead). This is your profit</li>
                <li><b>Escalation %</b> — price-rise provision applied after margin. Shown as "Total w/ Esc" in Rate Summary</li>
                </ul>
              </HelpPanel>
                <CardContent className="px-5 pb-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {numInput("Labour Rate (₹/m³)", s.labourRatePerM3, (v) => update({ labourRatePerM3: v }), { testId: "input-labour" })}
                    {numInput("Overhead %", s.overheadPct, (v) => update({ overheadPct: v }), { unit: "%" })}
                    {numInput("Contractor Margin %", s.marginPct, (v) => update({ marginPct: v }), { unit: "%" })}
                    {numInput("Escalation %", s.escalationPct, (v) => update({ escalationPct: v }), { unit: "%" })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column: Rate Summary panel */}
            <div className="lg:col-span-1">
              <div className="sticky top-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                    <CardTitle className="text-sm font-semibold">Rate Breakdown</CardTitle>
                    <HelpBtn id="rate-summary" />
                  </CardHeader>
                  <HelpPanel id="rate-summary" title="Rate Breakdown">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Materials</b> = Cement + CA + FA + Admix + Steel ₹/m³ (from BBS)</li>
                <li><b>Plant</b> = Batching + Placement; <b>Formwork</b> = Shuttering + Staging; <b>Curing</b> = water + compound</li>
                <li><b>Wastage</b> = sand bulkage + cement waste + steel cutting + formwork damage (from BBS & Wastage tab toggles)</li>
                <li>Overhead applied to sum of all direct costs; Margin applied to (Direct + Overhead)</li>
                <li><b>Total ₹/m³</b> is your base cost; "Total w/ Esc" adds escalation provision</li>
                <li><b>BOQ Margin</b> = (Contract rate − Total w/ Esc) ÷ Contract rate × 100. Green ≥10%, Amber 5-10%, Red &lt;5%</li>
                </ul>
              </HelpPanel>
                  <CardContent className="px-5 pb-5">
                    {/* Grouped cost breakdown */}
                    <div className="space-y-3 text-xs">
                      {(() => {
                        const rm = (v: number) => crossSectionM2 > 0 ? ` · ${fmtR(v * crossSectionM2)}/RM` : "";
                        const groups = [
                          {
                            label: "Raw Materials", color: "bg-amber-100 border-amber-200", textColor: "text-amber-800",
                            items: [
                              { label: "Cement", val: costs.cement, color: "bg-amber-500" },
                              { label: "Aggregates (CA+FA)", val: costs.ca + costs.fa, color: "bg-orange-400" },
                              { label: "Admixture", val: costs.admix, color: "bg-purple-400" },
                            ],
                            subtotal: costs.cement + costs.ca + costs.fa + costs.admix,
                          },
                          {
                            label: "Steel", color: "bg-slate-100 border-slate-200", textColor: "text-slate-700",
                            items: [{ label: "Reinforcement", val: costs.steel, color: "bg-slate-500" }],
                            subtotal: costs.steel,
                          },
                          {
                            label: "Plant, Labour & Formwork", color: "bg-blue-50 border-blue-200", textColor: "text-blue-800",
                            items: pettyLabourRatePerM3 !== undefined
                              ? [
                                  { label: "Batching", val: costs.batching, color: "bg-blue-400" },
                                  { label: "Petty Labour Contract", val: costs.placement, color: "bg-sky-400" },
                                  ...(s.pettyLabour.contractorFormwork
                                    ? []
                                    : [{ label: "Formwork", val: costs.formwork, color: "bg-teal-400" }]),
                                  { label: "Labour", val: costs.labour, color: "bg-green-500" },
                                  { label: "Curing", val: costs.curing, color: "bg-cyan-400" },
                                ]
                              : [
                                  { label: "Batching", val: costs.batching, color: "bg-blue-400" },
                                  { label: "Placement", val: costs.placement, color: "bg-sky-400" },
                                  { label: "Formwork", val: costs.formwork, color: "bg-teal-400" },
                                  { label: "Labour", val: costs.labour, color: "bg-green-500" },
                                  { label: "Curing", val: costs.curing, color: "bg-cyan-400" },
                                ],
                            subtotal: costs.batching + costs.placement + costs.formwork + costs.labour + costs.curing,
                          },
                          {
                            label: "Wastage + Overhead + Margin", color: "bg-emerald-50 border-emerald-200", textColor: "text-emerald-800",
                            items: [
                              { label: "Wastage", val: costs.wastage, color: "bg-red-300" },
                              { label: "Overhead", val: costs.overhead, color: "bg-gray-400" },
                              { label: "Margin", val: costs.margin, color: "bg-emerald-500" },
                            ],
                            subtotal: costs.wastage + costs.overhead + costs.margin,
                          },
                        ];
                        return groups.map(g => (
                          <div key={g.label} className={`rounded-lg border p-2 ${g.color}`}>
                            <div className={`flex justify-between items-center mb-1.5 font-semibold ${g.textColor}`}>
                              <span>{g.label}</span>
                              <span>{fmtR(g.subtotal)}/m³{rm(g.subtotal)}</span>
                            </div>
                            <div className="space-y-1">
                              {g.items.filter(i => i.val > 0 || g.items.length === 1).map(item => (
                                <div key={item.label} className="flex items-center gap-1.5">
                                  <div className="w-16 text-[11px] text-muted-foreground shrink-0">{item.label}</div>
                                  <div className="flex-1 bg-white/60 rounded h-2 overflow-hidden">
                                    <div className={`h-full rounded ${item.color}`} style={{ width: `${maxBar > 0 ? (item.val / maxBar) * 100 : 0}%` }} />
                                  </div>
                                  <div className="w-14 text-right text-[11px] font-medium">{fmtR(item.val)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                      <div className="border-t border-border pt-2 mt-1">
                        <div className="flex justify-between items-center font-bold">
                          <span>Total ₹/m³</span>
                          <span className="text-blue-700">{fmtR(costs.total)}</span>
                        </div>
                        {crossSectionM2 > 0 && <div className="flex justify-between items-center text-muted-foreground mt-0.5"><span>Total ₹/RM</span><span>{fmtR(costs.total * crossSectionM2)}</span></div>}
                        {s.escalationPct > 0 && (
                          <div className="flex justify-between items-center text-muted-foreground mt-0.5">
                            <span>With esc. ({s.escalationPct}%)</span>
                            <span className="font-semibold">{fmtR(costs.totalWithEsc)}{crossSectionM2 > 0 ? ` · ${fmtR(costs.totalWithEsc * crossSectionM2)}/RM` : ""}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Client's Offered Rate */}
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold">Client's Offered Rate</span>
                        <div className="flex items-center gap-1 text-[10px]">
                          <button onClick={() => update({ contractRateMode: "per_m3" })} className={`px-2 py-0.5 rounded border ${s.contractRateMode === "per_m3" ? "bg-blue-600 text-white border-blue-600" : "text-muted-foreground border-border"}`}>₹/m³</button>
                          <button
                            onClick={() => crossSectionM2 > 0 ? update({ contractRateMode: "per_rm" }) : undefined}
                            title={crossSectionM2 <= 0 ? "Enter QTO height zones to enable ₹/RM mode" : ""}
                            className={`px-2 py-0.5 rounded border ${s.contractRateMode === "per_rm" ? "bg-blue-600 text-white border-blue-600" : crossSectionM2 <= 0 ? "opacity-40 cursor-not-allowed text-muted-foreground border-border" : "text-muted-foreground border-border"}`}
                          >₹/RM</button>
                        </div>
                      </div>
                      {(() => {
                        const unit = s.contractRateMode === "per_rm" ? "₹/RM" : "₹/m³";
                        // In ₹/RM mode: use QTO all-in per-metre as our cost baseline (includes PCC, earthwork, steel)
                        // Fall back to RCC cross-section conversion when QTO zones are not yet populated
                        const rmMode = s.contractRateMode === "per_rm";
                        const ourCostRM = rmMode ? (qtoAllInPerM ?? (crossSectionM2 > 0 ? costs.totalWithEsc * crossSectionM2 : undefined)) : undefined;
                        const contractRatePerM3 = rmMode && crossSectionM2 > 0 ? s.contractRate / crossSectionM2 : s.contractRate;
                        const margin = rmMode
                          ? (ourCostRM !== undefined && s.contractRate > 0 ? (s.contractRate - ourCostRM) / s.contractRate * 100 : 0)
                          : (contractRatePerM3 > 0 ? (contractRatePerM3 - costs.totalWithEsc) / contractRatePerM3 * 100 : 0);
                        const color = margin >= 10 ? "text-green-600" : margin >= 5 ? "text-amber-600" : "text-red-600";
                        return (
                          <>
                            {numInput(`Client's rate (${unit})`, s.contractRate, (v) => update({ contractRate: v }), { unit })}
                            {rmMode && (
                              <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                                {ourCostRM !== undefined
                                  ? <>
                                      <div className="text-blue-700 font-medium">Our all-in: {fmtR(ourCostRM)}/RM{qtoAllInPerM ? " (QTO incl. PCC+earthwork)" : " (RCC only)"}</div>
                                    </>
                                  : <div className="text-orange-600">Enter QTO zones for ₹/RM comparison</div>}
                              </div>
                            )}
                            <div className={`mt-2 text-center text-sm font-bold ${color}`}>
                              BOQ Margin: {margin.toFixed(1)}%
                              {margin < 5 && <span className="block text-xs font-normal">⚠ Below 5% — review rates</span>}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════ TAB 2: BBS & Wastage ══════════════ */}
        <TabsContent value="bbs">
          <div className="space-y-5">

            {/* BBS Table */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                <div className="flex items-center gap-1">
                  <div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Bar Bending Schedule (BBS)</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Weight = Dia²/162 × Length; Hook allowances auto-applied by shape</p>
                  </div>
                  <HelpBtn id="bbs" />
                </div>
                <Button size="sm" variant="outline" onClick={addBBSRow} className="h-7 text-xs" data-testid="btn-add-bbs">
                  <Plus className="w-3 h-3 mr-1" /> Add Bar
                </Button>
              </CardHeader>
              <HelpPanel id="bbs" title="Bar Bending Schedule">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Mark</b> — label (e.g. M1); <b>Dia</b> — nominal dia mm; <b>Shape</b> → hook allowance: Straight=0, U-bar=2×9d, L-bar=9d, Ring/Stirrup=2×9d+10d</li>
                <li><b>Element</b> — structural element this bar belongs to (Invert/Wall/TopSlab etc.); <b>Zone</b> — height zone or All</li>
                <li><b>Count Basis</b> — <b>@Spacing</b>: enter bar spacing (mm) → count/m is auto-derived from element dimension ÷ spacing; <b>Manual</b>: enter absolute count</li>
                <li><b>Wt/m run (kg/m)</b> — weight of this bar row per metre of drain. For spacing mode: countPerM × unitLen × Dia²/162. For manual mode: total kg ÷ drain length</li>
                <li><b>Overlap N</b> — splice = N × dia. Default 50 per IS:456. Enter 0 if no splice needed</li>
                <li>Steel rates ₹/MT editable per dia below the table. Total steel cost feeds into Rate Summary (steel ₹/m³ = total cost ÷ volume)</li>
                </ul>
              </HelpPanel>
              <CardContent className="px-5 pb-5">
                {s.bbsRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No bars added yet. Click "Add Bar".</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse min-w-[900px]">
                        <thead>
                          <tr className="bg-muted/40 text-muted-foreground uppercase tracking-wide">
                            <th className="text-left p-2">Mark</th>
                            <th className="p-2">Dia</th>
                            <th className="p-2">Shape</th>
                            <th className="p-2">Element</th>
                            <th className="p-2">Zone</th>
                            <th className="p-2 text-center">Basis</th>
                            <th className="text-right p-2">Spacing/Count</th>
                            <th className="text-right p-2">Count/m</th>
                            <th className="text-right p-2">Cut (m)</th>
                            <th className="text-right p-2">Hook (m)</th>
                            <th className="text-right p-2">Overlap N</th>
                            <th className="text-right p-2">Wt/m (kg/m)</th>
                            <th className="text-right p-2">Total kg</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.bbsRows.map((row) => {
                            const hook = HOOK_ALLOWANCE[row.shape] ? HOOK_ALLOWANCE[row.shape](row.dia) : 0;
                            const overlapLen = (row.overlapN * row.dia) / 1000;
                            const unitLen = row.cutLength + hook + overlapLen;
                            const kgPerMBar = (row.dia * row.dia) / 162;
                            const basis = row.countBasis ?? "manual";
                            const dimType = ELEMENT_DIM_TYPE[row.element ?? "Manual"] ?? "manual";
                            const totalLength = qtoResult?.totalLength ?? 0;
                            const spanMm = s.qto.clearSpan + 2 * s.qto.wallThickness;
                            const avgWallHMm = s.qto.heightZones.length > 0 ? s.qto.heightZones.reduce((sum, z) => sum + z.height * z.length, 0) / Math.max(1, s.qto.heightZones.reduce((sum, z) => sum + z.length, 0)) : 0;
                            let countPerM = 0;
                            let rowKg = 0;
                            if (basis === "spacing" && (row.spacingMm ?? 200) > 0) {
                              if (dimType === "span") {
                                countPerM = spanMm / (row.spacingMm ?? 200);
                                rowKg = unitLen * countPerM * kgPerMBar * totalLength;
                              } else if (dimType === "wall") {
                                const selectedZone = row.zoneId && row.zoneId !== "all" ? s.qto.heightZones.find(z => z.id === row.zoneId) : null;
                                const wallH = selectedZone ? selectedZone.height : avgWallHMm;
                                const zoneLen = selectedZone ? selectedZone.length : totalLength;
                                countPerM = wallH / (row.spacingMm ?? 200);
                                rowKg = unitLen * countPerM * kgPerMBar * zoneLen;
                                countPerM = totalLength > 0 ? rowKg / (unitLen * kgPerMBar * totalLength) : countPerM;
                              } else {
                                // Dist/Tie/Lifting Hook — 1 bar per metre run
                                countPerM = 1;
                                rowKg = unitLen * countPerM * kgPerMBar * totalLength;
                              }
                            } else {
                              rowKg = unitLen * row.count * kgPerMBar;
                              countPerM = totalLength > 0 ? row.count / totalLength : 0;
                            }
                            const kgPerM = totalLength > 0 ? rowKg / totalLength : 0;
                            return (
                              <tr key={row.id} className="border-t border-border/50" data-testid={`bbs-row-${row.id}`}>
                                <td className="p-1.5">
                                  <Input value={row.mark} onChange={(e) => updateBBSRow(row.id, { mark: e.target.value.toUpperCase() })} className="h-7 text-xs w-14 uppercase" />
                                </td>
                                <td className="p-1.5">
                                  <Select value={String(row.dia)} onValueChange={(v) => updateBBSRow(row.id, { dia: parseInt(v) })}>
                                    <SelectTrigger className="h-7 text-xs w-16"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {DIA_SIZES.map((d) => <SelectItem key={d} value={String(d)}>{d}mm</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-1.5">
                                  <Select value={row.shape} onValueChange={(v) => updateBBSRow(row.id, { shape: v })}>
                                    <SelectTrigger className="h-7 text-xs w-22"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {["Straight", "U-bar", "L-bar", "Ring", "Stirrup"].map((sh) => <SelectItem key={sh} value={sh}>{sh}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-1.5">
                                  <Select value={row.element ?? "Manual"} onValueChange={(v) => {
                                    const patch: Partial<BBSRow> = { element: v };
                                    // Auto-set shape and dia for lifting hooks per IS drawing standard
                                    if (v === "Lifting Hook") { patch.shape = "U-bar"; patch.dia = 12; }
                                    updateBBSRow(row.id, patch);
                                  }}>
                                    <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {["Invert-Bottom","Invert-Top","Wall-Earth","Wall-Inner","TopSlab-Bottom","TopSlab-Top","Dist/Tie","Lifting Hook","Manual"].map(el => <SelectItem key={el} value={el}>{el}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-1.5">
                                  <Select value={row.zoneId ?? "all"} onValueChange={(v) => updateBBSRow(row.id, { zoneId: v })}>
                                    <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">All</SelectItem>
                                      {s.qto.heightZones.map(z => <SelectItem key={z.id} value={z.id}>{z.label}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-1.5 text-center">
                                  <button
                                    onClick={() => updateBBSRow(row.id, { countBasis: basis === "spacing" ? "manual" : "spacing" })}
                                    className={`text-xs px-2 py-1 rounded border transition-colors ${basis === "spacing" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"}`}
                                    title={basis === "spacing" ? "Spacing mode — click to switch to Manual" : "Manual count — click to switch to Spacing"}
                                  >
                                    {basis === "spacing" ? "@Spac" : "Mnl"}
                                  </button>
                                </td>
                                <td className="p-1.5">
                                  {basis === "spacing" ? (
                                    <Input type="number" value={row.spacingMm ?? 200} onChange={(e) => updateBBSRow(row.id, { spacingMm: parseFloat(e.target.value) || 200 })} className="h-7 text-xs w-20 text-right" title="Bar spacing in mm" />
                                  ) : (
                                    <Input type="number" value={row.count} onChange={(e) => updateBBSRow(row.id, { count: parseInt(e.target.value) || 0 })} className="h-7 text-xs w-16 text-right" />
                                  )}
                                </td>
                                <td className="p-1.5 text-right text-muted-foreground">{countPerM.toFixed(2)}/m</td>
                                <td className="p-1.5">
                                  <Input type="number" step="0.1" value={row.cutLength} onChange={(e) => updateBBSRow(row.id, { cutLength: parseFloat(e.target.value) || 0 })} className="h-7 text-xs w-20 text-right" />
                                </td>
                                <td className="p-1.5 text-right text-muted-foreground">{hook.toFixed(3)}</td>
                                <td className="p-1.5">
                                  <Input type="number" value={row.overlapN} onChange={(e) => updateBBSRow(row.id, { overlapN: parseInt(e.target.value) || 50 })} className="h-7 text-xs w-14 text-right" title="N×dia overlap splice" />
                                </td>
                                <td className="p-1.5 text-right font-medium text-yellow-700">{kgPerM.toFixed(3)}</td>
                                <td className="p-1.5 text-right font-medium">{rowKg.toFixed(1)}</td>
                                <td className="p-1.5">
                                  <button onClick={() => removeBBSRow(row.id)} className="text-destructive hover:text-destructive/70"><Trash2 className="w-3.5 h-3.5" /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                            <td colSpan={11} className="p-2 text-xs">Total Steel</td>
                            <td className="p-2 text-right text-xs text-yellow-700">{bbsSummary.totalKgPerM.toFixed(3)} kg/m</td>
                            <td className="p-2 text-right text-xs font-semibold">
                              {bbsSummary.totalKg.toFixed(1)} kg
                              {bbsSummary.totalKg >= 100 && (
                                <span className="ml-1 text-muted-foreground">({(bbsSummary.totalKg / 1000).toFixed(3)} MT)</span>
                              )}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Steel rates per dia */}
                    <div className="mt-5">
                      <p className="text-xs font-semibold mb-3">Steel Rates per Diameter</p>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                        {DIA_SIZES.map((d) => {
                          const key = `r${d}` as keyof SteelRates;
                          const diaKg = bbsSummary.byDia[d]?.kg || 0;
                          return (
                            <div key={d} className="space-y-1">
                              <Label className="text-xs text-muted-foreground">{d}mm ({(diaKg / 1000).toFixed(2)} MT)</Label>
                              <Input
                                type="number"
                                value={s.steelRates[key]}
                                onChange={(e) => update({ steelRates: { ...s.steelRates, [key]: parseFloat(e.target.value) || 0 } })}
                                className="h-8 text-xs"
                                data-testid={`input-steel-rate-${d}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 p-3 bg-muted/30 rounded-lg">
                        <div className="flex justify-between text-sm">
                          <span>Total Steel: {(bbsSummary.totalKg / 1000).toFixed(3)} MT</span>
                          <span className="font-semibold">{fmtR(bbsSummary.totalCost)} total</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Steel cost/m³: {fmtR(steelCostPerM3)} (÷ {s.totalVolume} m³)
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Wastage & Risk */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Wastage & Risk Allowances</CardTitle>
                <HelpBtn id="wastage" />
              </CardHeader>
              <HelpPanel id="wastage" title="Wastage & Risk Allowances">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Sand Bulkage</b> — auto-derived from Section ③ bulkage %; only applies to natural sand (no separate input needed)</li>
                <li><b>Cement Wastage %</b> — extra cost for site spillage/over-ordering. Default 2%. Applied to cement ₹/m³</li>
                <li><b>Steel Cutting Waste %</b> — off-cut losses. Default 4%. Applied to BBS steel ₹/m³</li>
                <li><b>Formwork Early Damage</b> — reduces effective reuse cycles by 10%, increasing shuttering ₹/m³</li>
                <li><b>Curing Water Loss</b> — evaporation adjustment. Applied as % of water curing ₹/m³</li>
                <li>Toggle each risk on or off. All wastage amounts are summed into the Wastage row of Rate Summary</li>
                </ul>
              </HelpPanel>
              <CardContent className="px-5 pb-5">
                <div className="space-y-3">
                  {[
                    {
                      key: "sandBulkage", label: "Sand Bulkage",
                      desc: `Auto from bulkage slider (${s.faBulkagePct}%) — ${s.faType === "natural" ? "active for River Sand" : "inactive for Robosand"}`,
                      enabled: s.wastage.sandBulkage,
                      toggle: (v: boolean) => updateWastage({ sandBulkage: v }),
                      impact: costs.fa * s.faBulkagePct / 100 / (1 + s.faBulkagePct / 100),
                    },
                    {
                      key: "cementWastage", label: "Cement Wastage",
                      desc: "Spillage, bag residue, over-batching",
                      enabled: s.wastage.cementWastage,
                      toggle: (v: boolean) => updateWastage({ cementWastage: v }),
                      pctField: { val: s.wastage.cementWastagePct, set: (v: number) => updateWastage({ cementWastagePct: v }) },
                      impact: s.wastage.cementWastage ? costs.cement * (s.wastage.cementWastagePct / 100) : 0,
                    },
                    {
                      key: "steelCuttingWaste", label: "Steel Cutting Waste",
                      desc: "Offcuts, scrap from bending and cutting",
                      enabled: s.wastage.steelCuttingWaste,
                      toggle: (v: boolean) => updateWastage({ steelCuttingWaste: v }),
                      pctField: { val: s.wastage.steelCuttingPct, set: (v: number) => updateWastage({ steelCuttingPct: v }) },
                      impact: s.wastage.steelCuttingWaste ? steelCostPerM3 * (s.wastage.steelCuttingPct / 100) : 0,
                    },
                    {
                      key: "formworkDamage", label: "Formwork Early Damage",
                      desc: "Reduces effective reuse cycles by factor",
                      enabled: s.wastage.formworkDamage,
                      toggle: (v: boolean) => updateWastage({ formworkDamage: v }),
                      pctField: { val: s.wastage.formworkDamageReduction, set: (v: number) => updateWastage({ formworkDamageReduction: v }) },
                      impact: s.wastage.formworkDamage ? (s.shutteringAreaPerM3 * s.shutteringCostPerM2) / s.shutteringReuseCycles * (s.wastage.formworkDamageReduction / 100) : 0,
                    },
                    {
                      key: "curingWaterLoss", label: "Curing Water Loss",
                      desc: "Evaporation adjustment for open-air curing",
                      enabled: s.wastage.curingWaterLoss,
                      toggle: (v: boolean) => updateWastage({ curingWaterLoss: v }),
                      pctField: { val: s.wastage.curingWaterLossPct, set: (v: number) => updateWastage({ curingWaterLossPct: v }) },
                      impact: s.wastage.curingWaterLoss ? costs.curing * (s.wastage.curingWaterLossPct / 100) : 0,
                    },
                  ].map((item) => (
                    <div key={item.key} className={`flex items-start gap-3 p-3 rounded-lg border ${item.enabled ? "border-amber-200 bg-amber-50" : "border-border bg-muted/20"}`}>
                      <Switch checked={item.enabled} onCheckedChange={item.toggle} className="mt-0.5" data-testid={`switch-wastage-${item.key}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.label}</span>
                          {item.pctField && item.enabled && (
                            <Input
                              type="number"
                              value={item.pctField.val}
                              onChange={(e) => item.pctField!.set(parseFloat(e.target.value) || 0)}
                              className="h-6 w-16 text-xs"
                              min={0}
                              max={100}
                            />
                          )}
                          {item.pctField && item.enabled && <span className="text-xs text-muted-foreground">%</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                      </div>
                      {item.enabled && (
                        <div className="text-right text-xs font-semibold text-amber-700 whitespace-nowrap">
                          +{fmtR(item.impact)}/m³
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm font-semibold flex justify-between">
                  <span>Total Wastage & Risk</span>
                  <span>{fmtR(costs.wastage)}/m³</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* hidden file input for Excel BOQ import */}
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} data-testid="input-excel-boq" />

        {/* ══════════════ QTO & BOQ Tab ══════════════ */}
        <TabsContent value="qto-boq">
          <div className="space-y-5">

            {/* Structure Dimensions */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                <div>
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Structure Dimensions</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Dimensions drive volume calculations below. Structure type is set in ① Project Info (Calculator tab).</p>
                </div>
                <HelpBtn id="qto-boq" />
              </CardHeader>
              <HelpPanel id="qto-boq" title="QTO & BOQ">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Structure Dimensions</b> — wall thickness, slab thickness, clear span (all in mm); drives all QTO formulas</li>
                <li><b>Height Zones</b> — each zone has a wall height and road length. Total drain length = Σ zone lengths</li>
                <li><b>Volume Summary</b> — shows walls/invert/top slab/PCC per zone. "Apply to Calculator" sets Section ① total volume</li>
                <li><b>Per-Metre Rate Card</b> — RCC cost ÷ road length. Enter offered rates per zone to see margin per linear metre</li>
                <li><b>BOQ Estimator</b> — "Load Standard Drain BOQ" auto-generates 9-item BOQ from QTO volumes. Import Excel or Add Item manually</li>
                <li><b>Contract Profitability</b> — compares your cost vs contractor offered rate per item. Green ≥10%, Amber 5-10%, Red &lt;5%</li>
                </ul>
              </HelpPanel>
              <CardContent className="px-5 pb-5">
                {isDrainType && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {numInput("Clear Span (mm)", s.qto.clearSpan, v => updateQto({ clearSpan: v }))}
                      {numInput("Wall Thickness (mm)", s.qto.wallThickness, v => updateQto({ wallThickness: v }))}
                      {numInput("Invert Slab Thick (mm)", s.qto.invertSlabThick, v => updateQto({ invertSlabThick: v }))}
                      {numInput("PCC Depth (mm)", s.qto.pccDepth, v => updateQto({ pccDepth: v }))}
                      {numInput("PCC Side Offset (mm)", s.qto.pccOffset, v => updateQto({ pccOffset: v }))}
                      {numInput("Working Space (mm)", s.qto.workingSpace, v => updateQto({ workingSpace: v }))}
                      {numInput("Gratings Spacing (m)", s.qto.gratingsSpacing, v => updateQto({ gratingsSpacing: v }))}
                      {numInput("Weepholes Spacing (m)", s.qto.weepholesSpacing, v => updateQto({ weepholesSpacing: v }))}
                    </div>

                    {/* Covered Drain toggle (only for open Drain, Box Culvert always has top slab) */}
                    {!isBoxCulvert && (
                      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/60 bg-muted/30 p-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={s.qto.isCovered}
                            onClick={() => updateQto({ isCovered: !s.qto.isCovered })}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${s.qto.isCovered ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"}`}
                            data-testid="toggle-covered-drain"
                          >
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${s.qto.isCovered ? "translate-x-4.5" : "translate-x-0.5"}`} />
                          </button>
                          <span className="text-sm font-medium">Covered Drain (Top Slab)</span>
                        </div>
                        {s.qto.isCovered && (
                          <>
                            {numInput("Top Slab Thick (mm)", s.qto.topSlabThick, v => updateQto({ topSlabThick: v }))}
                            <div className="space-y-1">
                              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Slab Type</Label>
                              <Select value={s.qto.topSlabType ?? "CIS"} onValueChange={(v) => updateQto({ topSlabType: v as "CIS" | "Precast" })}>
                                <SelectTrigger className="h-9 text-sm w-32"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="CIS">CIS (Cast In Situ)</SelectItem>
                                  <SelectItem value="Precast">Precast</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {s.qto.topSlabType === "Precast" && numInput("Precast Rate (₹/m²)", s.qto.precastRatePerM2, v => updateQto({ precastRatePerM2: v }))}
                          </>
                        )}
                      </div>
                    )}
                    {isBoxCulvert && numInput("Top Slab Thick (mm)", s.qto.topSlabThick, v => updateQto({ topSlabThick: v }))}

                    {/* Element Grades row */}
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Element Grades <span className="normal-case font-normal text-slate-400">(IS 456 — min. cover 40mm for exposure B2)</span></p>
                      <div className="flex flex-wrap gap-3">
                        {(["pcc","invert","wall","topSlab"] as const).filter(k => k !== "topSlab" || showTopSlab).map(key => {
                          const labels: Record<string, string> = { pcc: "PCC Bed", invert: "Invert Slab", wall: "Walls", topSlab: "Top Slab" };
                          const matCost = computeMaterialCostOnly(s.qto.elementGrades?.[key] ?? (key === "pcc" ? "M15" : "M25"), s);
                          return (
                            <div key={key} className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded border border-border/50 px-2 py-1.5">
                              <span className="text-xs text-muted-foreground w-16">{labels[key]}</span>
                              <Select
                                value={s.qto.elementGrades?.[key] ?? (key === "pcc" ? "M15" : "M25")}
                                onValueChange={(v) => updateQto({ elementGrades: { ...(s.qto.elementGrades ?? { pcc:"M15", invert:"M25", wall:"M25", topSlab:"M25" }), [key]: v } })}
                              >
                                <SelectTrigger className="h-7 text-xs w-20 border-0 shadow-none p-0"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["M10","M15","M20","M25","M30","M35","M40"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <span className="text-xs text-slate-500">{fmtR(matCost)}/m³</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Height Zones (wall height per road-reach)</p>
                        <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="btn-add-height-zone"
                          onClick={() => updateQto({ heightZones: [...s.qto.heightZones, { id: uid(), label: `Zone ${s.qto.heightZones.length + 1}`, height: 1000, length: 100 }] })}>
                          <Plus className="w-3 h-3 mr-1" /> Add Zone
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted/40 text-muted-foreground uppercase tracking-wide">
                              <th className="text-left p-2 font-semibold">Zone Label</th>
                              <th className="text-right p-2 font-semibold">Wall Height (mm)</th>
                              <th className="text-right p-2 font-semibold">Road Length (m)</th>
                              <th className="p-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.qto.heightZones.map((z, zi) => (
                              <tr key={z.id} className="border-t border-border/50" data-testid={`qto-zone-row-${z.id}`}>
                                <td className="p-2">
                                  <Input value={z.label} onChange={e => updateQto({ heightZones: s.qto.heightZones.map((hz, i) => i === zi ? { ...hz, label: e.target.value.toUpperCase() } : hz) })} className="h-7 text-xs w-28 uppercase" />
                                </td>
                                <td className="p-2 text-right">
                                  <Input type="number" value={z.height} onChange={e => updateQto({ heightZones: s.qto.heightZones.map((hz, i) => i === zi ? { ...hz, height: parseFloat(e.target.value) || 0 } : hz) })} className="h-7 text-xs w-24 text-right" />
                                </td>
                                <td className="p-2 text-right">
                                  <Input type="number" value={z.length} onChange={e => updateQto({ heightZones: s.qto.heightZones.map((hz, i) => i === zi ? { ...hz, length: parseFloat(e.target.value) || 0 } : hz) })} className="h-7 text-xs w-24 text-right" />
                                </td>
                                <td className="p-2">
                                  {s.qto.heightZones.length > 1 && (
                                    <button onClick={() => updateQto({ heightZones: s.qto.heightZones.filter((_, i) => i !== zi) })} className="text-destructive hover:text-destructive/70" data-testid={`btn-remove-zone-${z.id}`}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-border bg-muted/20 font-semibold text-xs">
                              <td className="p-2">Total</td>
                              <td className="p-2 text-right text-muted-foreground">—</td>
                              <td className="p-2 text-right">{s.qto.heightZones.reduce((sum, z) => sum + z.length, 0).toLocaleString()} m</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {isBridgeType && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {numInput("Base Width (mm)", s.qto.bwBaseWidth, v => updateQto({ bwBaseWidth: v }))}
                    {numInput("Stem Thickness (mm)", s.qto.bwStemThick, v => updateQto({ bwStemThick: v }))}
                    {numInput("Wall / Stem Height (mm)", s.qto.bwHeight, v => updateQto({ bwHeight: v }))}
                    {numInput("Footing Depth (mm)", s.qto.bwFootingDepth, v => updateQto({ bwFootingDepth: v }))}
                  </div>
                )}

                {!isDrainType && !isBridgeType && (
                  <p className="text-sm text-muted-foreground py-4 text-center">Select a structure type in ① Project Info (Calculator tab) to enable QTO.</p>
                )}
              </CardContent>
            </Card>

            {/* Volume Summary — Drain / Box Culvert */}
            {isDrainType && qtoResult && (
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-start justify-between gap-3 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Volume Summary</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Walls = 2·t·H·L | Invert/Top = (span+2t)·slab·L | PCC = (span+2t+2·offset)·d·L</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" data-testid="btn-apply-qto-volume"
                    onClick={() => { update({ totalVolume: parseFloat(qtoResult.totalRCC.toFixed(2)) }); toast({ title: `Total volume set to ${qtoResult.totalRCC.toFixed(2)} m³ in Calculator` }); }}>
                    Apply to Calculator
                  </Button>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted/40 text-muted-foreground uppercase tracking-wide">
                          <th className="text-left p-2 font-semibold">Zone</th>
                          <th className="text-right p-2 font-semibold">H (mm)</th>
                          <th className="text-right p-2 font-semibold">Length (m)</th>
                          <th className="text-right p-2 font-semibold">RCC Walls m³</th>
                          <th className="text-right p-2 font-semibold">Invert Slab m³</th>
                          {showTopSlab && <th className="text-right p-2 font-semibold">Top Slab m³</th>}
                          <th className="text-right p-2 font-semibold">PCC m³</th>
                          <th className="text-right p-2 font-semibold">Total RCC m³</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qtoResult.zones.map(z => (
                          <tr key={z.id} className="border-t border-border/50">
                            <td className="p-2 font-medium">{z.label}</td>
                            <td className="p-2 text-right">{z.height}</td>
                            <td className="p-2 text-right">{z.length}</td>
                            <td className="p-2 text-right">{z.wallsM3.toFixed(2)}</td>
                            <td className="p-2 text-right">{z.invertM3.toFixed(2)}</td>
                            {showTopSlab && <td className="p-2 text-right">{z.topM3.toFixed(2)}</td>}
                            <td className="p-2 text-right">{z.pccM3.toFixed(2)}</td>
                            <td className="p-2 text-right font-medium">{z.totalRCCm3.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                          <td className="p-2 text-xs" colSpan={3}>Total (gross)</td>
                          <td className="p-2 text-right text-xs">{qtoResult.totalWalls.toFixed(2)}</td>
                          <td className="p-2 text-right text-xs">{qtoResult.totalInvert.toFixed(2)}</td>
                          {showTopSlab && <td className="p-2 text-right text-xs">{qtoResult.totalTop.toFixed(2)}</td>}
                          <td className="p-2 text-right text-xs">{qtoResult.totalPCC.toFixed(2)}</td>
                          <td className="p-2 text-right text-xs">{(qtoResult.totalWalls + qtoResult.totalInvert + qtoResult.totalTop).toFixed(2)}</td>
                        </tr>
                        {(qtoResult.deductWeephole > 0 || qtoResult.deductGrating > 0) && (
                          <tr className="border-t border-border/30 text-orange-700 text-xs">
                            <td className="p-2 italic" colSpan={3}>Deductions</td>
                            <td className="p-2 text-right italic">−{qtoResult.deductWeephole.toFixed(3)} (weepholes)</td>
                            <td className="p-2 text-right text-muted-foreground">—</td>
                            {showTopSlab && <td className="p-2 text-right italic">−{qtoResult.deductGrating.toFixed(3)} (gratings)</td>}
                            <td className="p-2 text-right text-muted-foreground">—</td>
                            <td className="p-2 text-right italic">−{(qtoResult.deductWeephole + qtoResult.deductGrating).toFixed(3)}</td>
                          </tr>
                        )}
                        <tr className="border-t border-border bg-blue-50 font-bold">
                          <td className="p-2 text-xs text-blue-700" colSpan={3}>Net Total (used in BOQ)</td>
                          <td className="p-2 text-right text-xs text-blue-700">{qtoResult.totalWallsNet.toFixed(2)}</td>
                          <td className="p-2 text-right text-xs text-blue-700">{qtoResult.totalInvert.toFixed(2)}</td>
                          {showTopSlab && <td className="p-2 text-right text-xs text-blue-700">{qtoResult.totalTopNet.toFixed(2)}</td>}
                          <td className="p-2 text-right text-xs">{qtoResult.totalPCC.toFixed(2)}</td>
                          <td className="p-2 text-right text-xs font-bold text-blue-700">{qtoResult.totalRCC.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                      <p className="text-muted-foreground">Total RCC</p>
                      <p className="text-lg font-bold text-blue-700">{qtoResult.totalRCC.toFixed(2)} m³</p>
                    </div>
                    <div className="bg-stone-50 border border-stone-200 rounded-lg px-4 py-2">
                      <p className="text-muted-foreground">Total PCC</p>
                      <p className="text-lg font-bold">{qtoResult.totalPCC.toFixed(2)} m³</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
                      <p className="text-muted-foreground">Excavation (approx)</p>
                      <p className="text-lg font-bold text-orange-700">{qtoResult.excavVolume.toFixed(2)} m³</p>
                      <p className="text-muted-foreground">{qtoResult.excavWidth.toFixed(2)}m wide × avg {qtoResult.excavDepth.toFixed(2)}m deep</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                      <p className="text-muted-foreground">Backfill (approx)</p>
                      <p className="text-lg font-bold text-green-700">{qtoResult.backfillVol.toFixed(2)} m³</p>
                    </div>
                    {qtoResult.gratingsCount > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
                        <p className="text-muted-foreground">Gratings</p>
                        <p className="text-lg font-bold">{qtoResult.gratingsCount} nos</p>
                      </div>
                    )}
                    {qtoResult.weepholesCount > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
                        <p className="text-muted-foreground">Weepholes</p>
                        <p className="text-lg font-bold">{qtoResult.weepholesCount} nos</p>
                      </div>
                    )}
                  </div>
                  <button onClick={() => updateQto({ showFormulaRef: !s.qto.showFormulaRef })} className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {s.qto.showFormulaRef ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    How volumes are calculated
                  </button>
                  {s.qto.showFormulaRef && (
                    <div className="mt-2 p-3 bg-muted/30 rounded-lg text-xs space-y-0.5 text-muted-foreground font-mono">
                      <p>RCC Walls  = 2 × t × H × L  (per zone)</p>
                      <p>Invert Slab = (span + 2t) × is × L</p>
                      {showTopSlab && <p>Top Slab   = (span + 2t) × ts × L</p>}
                      <p>PCC Bed    = (span + 2t + 2×offset) × pd × L</p>
                      <p>Excavation = (pccWidth + 2×ws) × (avgH + is + pd) × totalL</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Volume Summary — Bridge / Retaining Wall */}
            {isBridgeType && bridgeQtoResult && (
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-start justify-between gap-3 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Volume Summary (per metre run)</CardTitle>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                    onClick={() => { update({ totalVolume: parseFloat(bridgeQtoResult.totalRCCperM.toFixed(2)) }); toast({ title: "Volume updated (per m run)" }); }}>
                    Apply to Calculator
                  </Button>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div className="bg-muted/30 rounded-lg p-3"><p className="text-muted-foreground">Stem (per m run)</p><p className="text-base font-bold">{bridgeQtoResult.stemVol.toFixed(3)} m³/m</p></div>
                    <div className="bg-muted/30 rounded-lg p-3"><p className="text-muted-foreground">Base/Footing (per m)</p><p className="text-base font-bold">{bridgeQtoResult.baseVol.toFixed(3)} m³/m</p></div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3"><p className="text-muted-foreground">Total RCC (per m)</p><p className="text-base font-bold text-blue-700">{bridgeQtoResult.totalRCCperM.toFixed(3)} m³/m</p></div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Per-Metre Rate Card (Drain / Box Culvert) */}
            {isDrainType && qtoResult && qtoResult.zones.length > 0 && (() => {
              const eq = s.qto.elementGrades ?? { pcc: "M15", invert: "M25", wall: "M25", topSlab: "M25" };
              // Exclude steel from concrete element rates — steel is tracked separately as BBS kg/m
              const rccBaseRate = costs.totalWithEsc - costs.steel;
              const baseMat = computeMaterialCostOnly(s.grade, s);
              const invertCostPerM3 = rccBaseRate - baseMat + computeMaterialCostOnly(eq.invert, s);
              const wallCostPerM3  = rccBaseRate - baseMat + computeMaterialCostOnly(eq.wall, s);
              const tsM = s.qto.topSlabThick / 1000;
              const topSlabCostPerM3 = (s.qto.topSlabType === "Precast" && tsM > 0)
                ? s.qto.precastRatePerM2 / tsM
                : rccBaseRate - baseMat + computeMaterialCostOnly(eq.topSlab, s);
              // PCC: no shuttering, no steel — use rccBaseRate minus formwork
              const pccCostPerM3 = Math.max(0, rccBaseRate - costs.formwork - baseMat + computeMaterialCostOnly(eq.pcc, s));
              const gratingPerM = s.qto.gratingsSpacing > 0 ? s.qto.gratingRatePerNos / s.qto.gratingsSpacing : 0;
              const weepholePerM = s.qto.weepholesSpacing > 0 ? s.qto.weepholeRatePerNos / s.qto.weepholesSpacing : 0;
              const steelRateAvg = bbsSummary.totalKg > 0 ? bbsSummary.totalCost / (bbsSummary.totalKg / 1000) : s.steelRates.r12;
              const steelPerM = bbsSummary.totalKgPerM * (steelRateAvg / 1000);
              const bwPerM = bbsSummary.totalKgPerM * ((s.qto.bindingWireKgPerMT ?? 10) / 1000) * (s.qto.bindingWireRatePerKg ?? 85);
              const lhPerM = (s.qto.liftingHookSpacingM ?? 0) > 0 ? (s.qto.liftingHookRatePerNos ?? 150) / (s.qto.liftingHookSpacingM ?? 2) : 0;
              const excavPerM = qtoResult.totalLength > 0 ? qtoResult.excavVolume * s.qto.excavationRate / qtoResult.totalLength : 0;
              const backfillPerM = qtoResult.totalLength > 0 ? qtoResult.backfillVol * s.qto.backfillRate / qtoResult.totalLength : 0;
              // All-in ₹/RM total (using net wall and net top slab volumes)
              const avgNetWallPerM = qtoResult.totalLength > 0 ? qtoResult.totalWallsNet / qtoResult.totalLength * wallCostPerM3 : 0;
              const netTopSlabPerM = qtoResult.totalLength > 0 ? qtoResult.totalTopNet / qtoResult.totalLength * topSlabCostPerM3 : 0;
              const allInPerM = (qtoResult.pccPerM * pccCostPerM3) + (qtoResult.invertPerM * invertCostPerM3) + avgNetWallPerM + netTopSlabPerM + gratingPerM + weepholePerM + steelPerM + bwPerM + excavPerM + backfillPerM + lhPerM;
              return (
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Per-Metre Rate Card</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Cost per linear metre by element and zone. Enter the client's offered rate to see margin.</p>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-5">
                  {/* Global ₹/RM breakdown (Steel, Binding Wire, Earthwork, etc.) */}
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Global Cost Components (₹/Running Metre)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white dark:bg-slate-800 rounded-lg border p-2.5">
                        <p className="text-muted-foreground">PCC {eq.pcc} Bed</p>
                        <p className="font-bold text-sm">{fmtR(qtoResult.pccPerM * pccCostPerM3)}/RM</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-lg border p-2.5">
                        <p className="text-muted-foreground">Invert Slab ({eq.invert})</p>
                        <p className="font-bold text-sm">{fmtR(qtoResult.invertPerM * invertCostPerM3)}/RM</p>
                      </div>
                      {showTopSlab && <div className="bg-white dark:bg-slate-800 rounded-lg border p-2.5">
                        <p className="text-muted-foreground">Top Slab ({s.qto.topSlabType === "Precast" ? "Precast ₹/m²" : eq.topSlab})</p>
                        <p className="font-bold text-sm">{fmtR(qtoResult.totalLength > 0 ? qtoResult.totalTopNet / qtoResult.totalLength * topSlabCostPerM3 : 0)}/RM</p>
                      </div>}
                      {gratingPerM > 0 && <div className="bg-white dark:bg-slate-800 rounded-lg border p-2.5">
                        <p className="text-muted-foreground">MS Gratings</p>
                        <p className="font-bold text-sm">{fmtR(gratingPerM)}/RM</p>
                      </div>}
                      {weepholePerM > 0 && <div className="bg-white dark:bg-slate-800 rounded-lg border p-2.5">
                        <p className="text-muted-foreground">Weepholes</p>
                        <p className="font-bold text-sm">{fmtR(weepholePerM)}/RM</p>
                      </div>}
                      {steelPerM > 0 && <div className="bg-yellow-50 border-yellow-200 border rounded-lg p-2.5">
                        <p className="text-muted-foreground">HYSD Steel ({bbsSummary.totalKgPerM.toFixed(2)} kg/m)</p>
                        <p className="font-bold text-sm text-yellow-700">{fmtR(steelPerM)}/RM</p>
                      </div>}
                      {bwPerM > 0 && <div className="bg-white dark:bg-slate-800 rounded-lg border p-2.5">
                        <p className="text-muted-foreground">Binding Wire</p>
                        <p className="font-bold text-sm">{fmtR(bwPerM)}/RM</p>
                      </div>}
                      {excavPerM > 0 && <div className="bg-orange-50 border-orange-200 border rounded-lg p-2.5">
                        <p className="text-muted-foreground">Earthwork</p>
                        <p className="font-bold text-sm text-orange-700">{fmtR(excavPerM)}/RM</p>
                      </div>}
                      {backfillPerM > 0 && <div className="bg-green-50 border-green-200 border rounded-lg p-2.5">
                        <p className="text-muted-foreground">Backfill</p>
                        <p className="font-bold text-sm text-green-700">{fmtR(backfillPerM)}/RM</p>
                      </div>}
                      {lhPerM > 0 && <div className="bg-white dark:bg-slate-800 rounded-lg border p-2.5">
                        <p className="text-muted-foreground">Lifting Hooks</p>
                        <p className="font-bold text-sm">{fmtR(lhPerM)}/RM</p>
                      </div>}
                    </div>
                    {/* All-in total row */}
                    <div className="mt-3 flex items-center justify-between border-t pt-3">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">All-in Cost</p>
                      <p className="text-xl font-bold text-primary">{fmtR(allInPerM)} <span className="text-sm font-normal text-muted-foreground">/ Running Metre</span></p>
                    </div>
                  </div>
                  {/* Per-zone cards (walls vary by zone height) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {qtoResult.zones.map(z => {
                      // Use net volumes: deduct weephole void distributed evenly per metre
                      const deductWallPerM = qtoResult.totalLength > 0 ? qtoResult.deductWeephole / qtoResult.totalLength : 0;
                      const netWallPerM = Math.max(0, z.wallsM3perM - deductWallPerM);
                      const wallsPerM = netWallPerM * wallCostPerM3;
                      const pccPerM_ = qtoResult.pccPerM * pccCostPerM3;
                      const invertPerM_ = qtoResult.invertPerM * invertCostPerM3;
                      // Net top slab per metre (after grating opening deduction)
                      const topSlabPerM_ = qtoResult.totalLength > 0 ? qtoResult.totalTopNet / qtoResult.totalLength * topSlabCostPerM3 : 0;
                      const totalPerM = wallsPerM + pccPerM_ + invertPerM_ + topSlabPerM_ + gratingPerM + weepholePerM + steelPerM + bwPerM + lhPerM + excavPerM + backfillPerM;
                      const offeredRate = s.qto.zoneOfferedRates[z.id] || 0;
                      const margin = offeredRate > 0 ? ((offeredRate - totalPerM) / offeredRate) * 100 : null;
                      const marginBadge = margin !== null ? (margin >= 10 ? "bg-green-100 text-green-700 border-green-300" : margin >= 5 ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-red-100 text-red-700 border-red-300") : "";
                      return (
                        <div key={z.id} className="border rounded-xl p-4 space-y-3 hover:shadow-sm transition-shadow">
                          <div>
                            <p className="font-semibold text-sm">{z.label}</p>
                            <p className="text-xs text-muted-foreground">H = {z.height} mm · L = {z.length} m</p>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-600">PCC {eq.pcc} Bed</span>
                              <span className="font-medium">{fmtR(pccPerM_)}/m</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Invert ({eq.invert})</span>
                              <span className="font-medium">{fmtR(invertPerM_)}/m</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Walls ({eq.wall}) H={z.height}mm</span>
                              <span className="font-medium">{fmtR(wallsPerM)}/m</span>
                            </div>
                            {showTopSlab && <div className="flex justify-between">
                              <span className="text-slate-600">Top Slab ({eq.topSlab})</span>
                              <span className="font-medium">{fmtR(topSlabPerM_)}/m</span>
                            </div>}
                            {steelPerM > 0 && <div className="flex justify-between text-yellow-700">
                              <span>Steel HYSD</span>
                              <span className="font-medium">{fmtR(steelPerM)}/m</span>
                            </div>}
                            {gratingPerM > 0 && <div className="flex justify-between">
                              <span className="text-slate-600">Gratings</span>
                              <span className="font-medium">{fmtR(gratingPerM)}/m</span>
                            </div>}
                            {weepholePerM > 0 && <div className="flex justify-between">
                              <span className="text-slate-600">Weepholes</span>
                              <span className="font-medium">{fmtR(weepholePerM)}/m</span>
                            </div>}
                            <div className="flex justify-between font-bold border-t pt-1.5 mt-1 text-sm">
                              <span>Total Cost ₹/m</span>
                              <span className="text-blue-700">{fmtR(totalPerM)}</span>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Offered Rate (₹/m run)</Label>
                            <Input
                              type="number"
                              value={offeredRate || ""}
                              placeholder="Enter offered rate"
                              onChange={e => updateQto({ zoneOfferedRates: { ...s.qto.zoneOfferedRates, [z.id]: parseFloat(e.target.value) || 0 } })}
                              className="h-7 text-xs mt-1"
                              data-testid={`input-offered-rate-${z.id}`}
                            />
                            {margin !== null && (
                              <Badge variant="outline" className={`mt-1 text-xs font-bold ${marginBadge}`}>
                                Margin: {margin.toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              );
            })()}

            {/* Bridge / RW Per-Metre Rate Card */}
            {isBridgeType && bridgeQtoResult && (
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Per-Metre Rate Card</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">RCC cost per linear metre of {s.structureType.toLowerCase()} (stem + footing).</p>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {(() => {
                    const bwCostPerM = bridgeQtoResult.totalRCCperM * costs.totalWithEsc;
                    const offeredRate = s.qto.bwOfferedRatePerM;
                    const margin = offeredRate > 0 ? ((offeredRate - bwCostPerM) / offeredRate) * 100 : null;
                    const marginBadge = margin !== null ? (margin >= 10 ? "bg-green-100 text-green-700 border-green-300" : margin >= 5 ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-red-100 text-red-700 border-red-300") : "";
                    return (
                      <div className="border rounded-xl p-4 space-y-3 max-w-sm">
                        <div>
                          <p className="font-semibold text-sm">{s.structureType}</p>
                          <p className="text-xs text-muted-foreground">Stem {bridgeQtoResult.stemVol.toFixed(3)} m³/m + Base {bridgeQtoResult.baseVol.toFixed(3)} m³/m</p>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">RCC {s.grade} cost</span>
                            <span className="font-medium">{fmtR(bridgeQtoResult.totalRCCperM * costs.totalWithEsc)}/m</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold border-t pt-1 mt-1">
                            <span>Cost ₹/m run</span>
                            <span className="text-blue-700">{fmtR(bwCostPerM)}</span>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Offered Rate (₹/m run)</Label>
                          <Input
                            type="number"
                            value={offeredRate || ""}
                            placeholder="Enter offered rate"
                            onChange={e => updateQto({ bwOfferedRatePerM: parseFloat(e.target.value) || 0 })}
                            className="h-7 text-xs mt-1"
                            data-testid="input-bw-offered-rate"
                          />
                          {margin !== null && (
                            <Badge variant="outline" className={`mt-1 text-xs font-bold ${marginBadge}`}>
                              Margin: {margin.toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Earthwork & PCC Rates for BOQ */}
            {isDrainType && (
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Earthwork & Ancillary Rates</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Used when generating the Standard Drain BOQ and Per-Metre Rate Card.</p>
                </CardHeader>
                <CardContent className="px-5 pb-4 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {numInput("PCC Rate (₹/m³)", s.qto.pccRatePerM3, v => updateQto({ pccRatePerM3: v }))}
                    {numInput("Excavation Rate (₹/m³)", s.qto.excavationRate, v => updateQto({ excavationRate: v }))}
                    {numInput("Backfill Rate (₹/m³)", s.qto.backfillRate, v => updateQto({ backfillRate: v }))}
                    {numInput("Grating Rate (₹/nos)", s.qto.gratingRatePerNos, v => updateQto({ gratingRatePerNos: v }))}
                    {numInput("Weephole Rate (₹/nos)", s.qto.weepholeRatePerNos, v => updateQto({ weepholeRatePerNos: v }))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Opening Sizes (for void deductions & BOQ descriptions)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {numInput("Weephole Dia (mm)", s.qto.weepholeDiaMm ?? 100, v => updateQto({ weepholeDiaMm: v }))}
                      {numInput("Grating Opening W (mm)", s.qto.gratingOpeningW ?? 200, v => updateQto({ gratingOpeningW: v }))}
                      {numInput("Grating Opening D (mm)", s.qto.gratingOpeningD ?? 100, v => updateQto({ gratingOpeningD: v }))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Binding Wire & Lifting Hooks</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {numInput("Binding Wire (kg/MT steel)", s.qto.bindingWireKgPerMT ?? 10, v => updateQto({ bindingWireKgPerMT: v }))}
                      {numInput("Binding Wire Rate (₹/kg)", s.qto.bindingWireRatePerKg ?? 85, v => updateQto({ bindingWireRatePerKg: v }))}
                      {numInput("Lifting Hook Dia (mm)", s.qto.liftingHookDia ?? 12, v => updateQto({ liftingHookDia: v }))}
                      {numInput("Lifting Hook Spacing (m)", s.qto.liftingHookSpacingM ?? 2, v => updateQto({ liftingHookSpacingM: v }))}
                      {numInput("Lifting Hook Rate (₹/nos)", s.qto.liftingHookRatePerNos ?? 150, v => updateQto({ liftingHookRatePerNos: v }))}
                      {(() => {
                        const lhSp = s.qto.liftingHookSpacingM ?? 2;
                        const lhCount = lhSp > 0 && qtoResult ? Math.ceil(qtoResult.totalLength / lhSp) : 0;
                        const lhRm = lhSp > 0 ? (s.qto.liftingHookRatePerNos ?? 150) / lhSp : 0;
                        return lhCount > 0 ? (
                          <div className="flex flex-col justify-center bg-slate-50 dark:bg-slate-800 rounded-lg border px-3 py-2">
                            <p className="text-xs text-muted-foreground">Computed Count</p>
                            <p className="font-bold text-sm">{lhCount} nos</p>
                            <p className="text-xs text-muted-foreground">{fmtR(lhRm)}/RM</p>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* BOQ Estimator */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between gap-2 flex-wrap sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">BOQ Estimator</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {isDrainType && qtoResult && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="btn-load-standard-boq"
                      onClick={() => { if (s.boqItems.length > 0) setBoqOverwriteConfirm(true); else update({ boqItems: buildStandardDrainBOQ() }); }}>
                      Load Standard Drain BOQ
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="btn-import-excel-boq"
                    onClick={() => fileInputRef.current?.click()}>
                    <FileUp className="w-3 h-3 mr-1" /> Import Excel
                  </Button>
                  <Button size="sm" variant="outline" onClick={addBOQItem} className="h-7 text-xs" data-testid="btn-add-boq">
                    <Plus className="w-3 h-3 mr-1" /> Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
                  <p><b>Quantities:</b> For Standard Drain BOQ, RCC and earthwork quantities come from QTO dimensions above. For Excel import, Description / Unit / Qty are read — rates and contractor rates must be entered manually.</p>
                  <p><b>Rate (₹/unit):</b> Your estimated cost rate. <b>Client's Rate:</b> The client's offered rate per BOQ item — used to compute margin in Contract Profitability below.</p>
                </div>
                {boqOverwriteConfirm && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between gap-3">
                    <p className="text-sm text-amber-800 font-medium">Replace {s.boqItems.length} existing item(s) with standard drain BOQ?</p>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" className="h-7 text-xs" onClick={() => { update({ boqItems: buildStandardDrainBOQ() }); setBoqOverwriteConfirm(false); }}>Replace</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setBoqOverwriteConfirm(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
                {xlsxPreview && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                    <p className="text-xs font-semibold text-blue-800">Excel Import — Map Columns ({xlsxPreview.rows.length} rows detected)</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(["colDesc", "colUnit", "colQty"] as const).map((key, li) => (
                        <div key={key}>
                          <Label className="text-xs text-muted-foreground">{["Description", "Unit", "Qty"][li]} Column</Label>
                          <Select
                            value={String(xlsxPreview[key])}
                            onValueChange={v => setXlsxPreview(prev => prev ? { ...prev, [key]: parseInt(v) } : prev)}>
                            <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {xlsxPreview.headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `Col ${i + 1}`}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded border bg-white text-xs">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-muted/30">
                            {xlsxPreview.headers.map((h, i) => <th key={i} className="p-1 text-left font-medium border-b">{h || `Col ${i + 1}`}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {xlsxPreview.rows.slice(0, 6).map((r, i) => (
                            <tr key={i} className="border-b border-border/40">
                              {xlsxPreview.headers.map((_, ci) => <td key={ci} className="p-1">{r[ci] || ""}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => confirmExcelImport(xlsxPreview)}>Import {xlsxPreview.rows.length} Rows</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setXlsxPreview(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
                {s.boqItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{isDrainType && qtoResult ? 'Use "Load Standard Drain BOQ" to auto-generate from QTO dimensions above, or click "Add Item" to add manually.' : 'Click "Add Item" to add BOQ items.'}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted/40 text-muted-foreground uppercase tracking-wide">
                          <th className="text-left p-2 font-semibold">Description</th>
                          <th className="text-right p-2 font-semibold">Qty</th>
                          <th className="text-right p-2 font-semibold">Unit</th>
                          <th className="text-right p-2 font-semibold">L × W × D</th>
                          <th className="text-right p-2 font-semibold">Vol</th>
                          <th className="text-right p-2 font-semibold">Rate (₹/unit)</th>
                          <th className="text-right p-2 font-semibold">Client's Rate (₹)</th>
                          <th className="text-right p-2 font-semibold">Amount</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.boqItems.map((item) => {
                          const vol = boqVol(item);
                          const amount = vol * item.rate;
                          const margin = item.contractorRate > 0 ? ((item.contractorRate - item.rate) / item.contractorRate) * 100 : 0;
                          const marginColor = margin >= 10 ? "text-green-600" : margin >= 5 ? "text-amber-600" : "text-red-600";
                          return (
                            <tr key={item.id} className="border-t border-border/50" data-testid={`boq-row-${item.id}`}>
                              <td className="p-2">
                                <div className="space-y-0.5">
                                  <Input value={item.description} onChange={(e) => updateBOQItem(item.id, { description: e.target.value.toUpperCase() })} className="h-8 text-xs w-56 uppercase" />
                                  {(() => { const cat = getBOQCategory(item.description); return cat ? <Badge variant="outline" className={`text-[10px] px-1 py-0 ${BOQ_CAT_COLORS[cat]}`}>{cat}</Badge> : null; })()}
                                </div>
                              </td>
                              <td className="p-2 text-right">
                                <Input type="number" value={item.qty} onChange={(e) => updateBOQItem(item.id, { qty: parseFloat(e.target.value) || 0 })} className="h-8 text-xs w-20 text-right" />
                              </td>
                              <td className="p-2">
                                <Select value={item.unit} onValueChange={(v) => updateBOQItem(item.id, { unit: v })}>
                                  <SelectTrigger className="h-8 text-xs w-16"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="m³">m³</SelectItem>
                                    <SelectItem value="Cum">Cum</SelectItem>
                                    <SelectItem value="m²">m²</SelectItem>
                                    <SelectItem value="m">m</SelectItem>
                                    <SelectItem value="nos">nos</SelectItem>
                                    <SelectItem value="No's">No's</SelectItem>
                                    <SelectItem value="MT">MT</SelectItem>
                                    <SelectItem value="kg">kg</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="p-2">
                                <div className="flex items-center gap-1">
                                  <Input type="number" value={item.dimL} onChange={(e) => updateBOQItem(item.id, { dimL: parseFloat(e.target.value) || 0 })} className="h-8 text-xs w-16" placeholder="L" />
                                  <Input type="number" value={item.dimW} onChange={(e) => updateBOQItem(item.id, { dimW: parseFloat(e.target.value) || 0 })} className="h-8 text-xs w-16" placeholder="W" />
                                  <Input type="number" value={item.dimD} onChange={(e) => updateBOQItem(item.id, { dimD: parseFloat(e.target.value) || 0 })} className="h-8 text-xs w-16" placeholder="D" />
                                </div>
                              </td>
                              <td className="p-2 text-right font-medium">{vol.toFixed(2)}</td>
                              <td className="p-2 text-right">
                                <Input type="number" value={item.rate} onChange={(e) => updateBOQItem(item.id, { rate: parseFloat(e.target.value) || 0 })} className="h-8 text-xs w-24 text-right" />
                              </td>
                              <td className="p-2">
                                <div className="flex items-center gap-1">
                                  <Input type="number" value={item.contractorRate} onChange={(e) => updateBOQItem(item.id, { contractorRate: parseFloat(e.target.value) || 0 })} className="h-8 text-xs w-24 text-right" />
                                  <span className={`text-xs font-semibold ${marginColor} whitespace-nowrap`}>{margin.toFixed(0)}%</span>
                                </div>
                              </td>
                              <td className="p-2 text-right font-medium">{fmtR(amount)}</td>
                              <td className="p-2">
                                <button onClick={() => removeBOQItem(item.id)} className="text-destructive hover:text-destructive/70"><Trash2 className="w-3.5 h-3.5" /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                          <td className="p-2 text-xs" colSpan={4}>Total</td>
                          <td className="p-2 text-right text-xs">{boqTotalCum.toFixed(2)} m³</td>
                          <td className="p-2 text-right text-xs">
                            {boqTotalCum > 0 ? fmtR(boqTotalAmt / boqTotalCum) + "/m³ avg" : "—"}
                          </td>
                          <td className="p-2 text-right text-xs">
                            {boqTotalCum > 0 ? fmtR(s.boqItems.reduce((sum, item) => sum + boqVol(item) * item.contractorRate, 0) / boqTotalCum) + "/m³" : "—"}
                          </td>
                          <td className="p-2 text-right text-xs">{fmtR(boqTotalAmt)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ⑪ Contract Profitability */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between flex-wrap gap-2 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">⑪ Contract Profitability</CardTitle>
                  <HelpBtn id="contract-profit" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Mode:</span>
                  {(["per_item", "lumpsum"] as const).map((m) => (
                    <button key={m} onClick={() => update({ profitMode: m })}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${s.profitMode === m ? "bg-blue-600 text-white border-blue-600" : "text-muted-foreground border-border"}`}>
                      {m === "per_item" ? "Per Item (BOQ)" : "Lumpsum (Total Contract)"}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <HelpPanel id="contract-profit" title="⑪ Contract Profitability">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                  <li><b>Per Item (BOQ)</b> — calculates margin per BOQ item. <em>Volume</em> = L×W×D when dimensions are provided, otherwise the Qty field is used directly. <em>Cost rate</em> = global calculator ₹/m³. <em>Revenue</em> = the Client Rate column you enter in the BOQ Estimator above.</li>
                  <li><b>Lumpsum (Total Contract)</b> — enter the total contract sum. Compared against (calculator ₹/m³ × total volume from Section ①).</li>
                  <li><b>Client Rate (Contractor Rate)</b> — this is the client's offered rate per BOQ item. Load the client's BOQ via "Import Excel" in the BOQ Estimator above (imports Description, Unit, Qty), then type in the client's offered rates in the Client Rate column.</li>
                  <li><b>Margin colour</b> — Green ≥ 10%, Amber 5–10%, Red below 5%.</li>
                  {isDrainType && qtoResult && <li><b>₹/Running Metre</b> — for drain structures, a per-linear-metre summary appears below the table, derived from total drain length in the QTO Height Zones above.</li>}
                </ul>
              </HelpPanel>
              <CardContent className="px-5 pb-5">
                {s.profitMode === "lumpsum" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {numInput("Total Contract Amount (₹)", s.lumpsumContractAmt, (v) => update({ lumpsumContractAmt: v }))}
                    </div>
                    {(() => {
                      const totalCost = costs.totalWithEsc * s.totalVolume;
                      const revenue = s.lumpsumContractAmt;
                      const profit = revenue - totalCost;
                      const pct = revenue > 0 ? (profit / revenue) * 100 : 0;
                      const cls = pct >= 10 ? "text-green-700 bg-green-50 border-green-200" : pct >= 5 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-red-700 bg-red-50 border-red-200";
                      return (
                        <div className={`rounded-xl border p-4 flex flex-wrap gap-6 ${cls}`}>
                          <div><p className="text-xs font-semibold uppercase tracking-wide opacity-70">Contract Value</p><p className="text-lg font-bold">{fmtR(revenue)}</p></div>
                          <div><p className="text-xs font-semibold uppercase tracking-wide opacity-70">Estimated Cost</p><p className="text-lg font-bold">{fmtR(totalCost)}</p><p className="text-xs opacity-60">{fmtR(costs.totalWithEsc)}/m³ × {s.totalVolume} m³</p></div>
                          <div><p className="text-xs font-semibold uppercase tracking-wide opacity-70">Gross Profit</p><p className="text-lg font-bold">{fmtR(profit)}</p></div>
                          <div><p className="text-xs font-semibold uppercase tracking-wide opacity-70">Margin %</p><p className="text-2xl font-bold">{pct.toFixed(1)}%</p></div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    {s.boqItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Add BOQ items above to see profitability analysis.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <p className="text-xs text-muted-foreground mb-2">
                          Cost uses global calculator rate ({fmtR(costs.totalWithEsc)}/m³). Revenue uses contractor offered rate per item.
                        </p>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted/40 text-muted-foreground uppercase tracking-wide text-xs">
                              <th className="text-left p-2 font-semibold">Item</th>
                              <th className="text-right p-2 font-semibold">m³</th>
                              <th className="text-right p-2 font-semibold">Client's Rate</th>
                              <th className="text-right p-2 font-semibold">Revenue (₹)</th>
                              <th className="text-right p-2 font-semibold">Cost @ {fmtR(costs.totalWithEsc)}/m³</th>
                              <th className="text-right p-2 font-semibold">Profit (₹)</th>
                              <th className="text-right p-2 font-semibold">Margin %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.boqItems.map((item) => {
                              const vol = boqVol(item);
                              const revenue = vol * item.contractorRate;
                              const itemCost = vol * costs.totalWithEsc;
                              const profit = revenue - itemCost;
                              const pct = revenue > 0 ? (profit / revenue) * 100 : 0;
                              const badgeCls = pct >= 10 ? "bg-green-100 text-green-700 border-green-300" : pct >= 5 ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-red-100 text-red-700 border-red-300";
                              return (
                                <tr key={item.id} className="border-t border-border/40 hover:bg-muted/10">
                                  <td className="p-2 font-medium">{item.description || "—"}</td>
                                  <td className="p-2 text-right">{vol.toFixed(2)}</td>
                                  <td className="p-2 text-right">{fmtR(item.contractorRate)}</td>
                                  <td className="p-2 text-right">{fmtR(revenue)}</td>
                                  <td className="p-2 text-right">{fmtR(itemCost)}</td>
                                  <td className={`p-2 text-right font-semibold ${profit >= 0 ? "text-green-700" : "text-red-700"}`}>{fmtR(profit)}</td>
                                  <td className="p-2 text-right">
                                    <Badge variant="outline" className={`text-xs font-bold ${badgeCls}`}>{pct.toFixed(1)}%</Badge>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            {(() => {
                              const totalRev = s.boqItems.reduce((sum, item) => sum + boqVol(item) * item.contractorRate, 0);
                              const totalCost = boqTotalCum * costs.totalWithEsc;
                              const totalProfit = totalRev - totalCost;
                              const totalPct = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
                              const badgeCls = totalPct >= 10 ? "bg-green-100 text-green-700 border-green-300" : totalPct >= 5 ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-red-100 text-red-700 border-red-300";
                              return (
                                <tr className="border-t-2 border-border bg-muted/20 font-bold">
                                  <td className="p-2" colSpan={2}>Total</td>
                                  <td className="p-2 text-right">{boqTotalCum.toFixed(2)} m³</td>
                                  <td className="p-2 text-right">{fmtR(totalRev)}</td>
                                  <td className="p-2 text-right">{fmtR(totalCost)}</td>
                                  <td className={`p-2 text-right ${totalProfit >= 0 ? "text-green-700" : "text-red-700"}`}>{fmtR(totalProfit)}</td>
                                  <td className="p-2 text-right">
                                    <Badge variant="outline" className={`text-xs font-bold ${badgeCls}`}>{totalPct.toFixed(1)}%</Badge>
                                  </td>
                                </tr>
                              );
                            })()}
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}
                {/* ₹/Running Metre Summary — Drain / Box Culvert only */}
                {isDrainType && qtoResult && qtoResult.totalLength > 0 && (() => {
                  const totalDrainLength = qtoResult.totalLength;
                  const totalRev = s.profitMode === "lumpsum"
                    ? s.lumpsumContractAmt
                    : s.boqItems.reduce((sum, item) => sum + boqVol(item) * item.contractorRate, 0);
                  const totalCostRs = s.profitMode === "lumpsum"
                    ? costs.totalWithEsc * s.totalVolume
                    : boqTotalCum * costs.totalWithEsc;
                  const totalProfit = totalRev - totalCostRs;
                  const rmRev = totalRev / totalDrainLength;
                  const rmCost = totalCostRs / totalDrainLength;
                  const rmProfit = totalProfit / totalDrainLength;
                  const rmPct = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
                  const cls = rmPct >= 10 ? "border-green-200 bg-green-50" : rmPct >= 5 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
                  const textCls = rmPct >= 10 ? "text-green-700" : rmPct >= 5 ? "text-amber-700" : "text-red-700";
                  // Component breakdown — exclude steel from concrete element rates
                  const eq = s.qto.elementGrades ?? { pcc: "M15", invert: "M25", wall: "M25", topSlab: "M25" };
                  const rccBaseRate_ = costs.totalWithEsc - costs.steel;
                  const baseMat = computeMaterialCostOnly(s.grade, s);
                  const pccCostPerM3_ = Math.max(0, rccBaseRate_ - costs.formwork - baseMat + computeMaterialCostOnly(eq.pcc, s));
                  const invertCostPerM3 = rccBaseRate_ - baseMat + computeMaterialCostOnly(eq.invert, s);
                  const wallCostPerM3 = rccBaseRate_ - baseMat + computeMaterialCostOnly(eq.wall, s);
                  const tsM_ = s.qto.topSlabThick / 1000;
                  const topSlabCostPerM3 = (s.qto.topSlabType === "Precast" && tsM_ > 0)
                    ? s.qto.precastRatePerM2 / tsM_
                    : rccBaseRate_ - baseMat + computeMaterialCostOnly(eq.topSlab, s);
                  const pccPerM_ = qtoResult.pccPerM * pccCostPerM3_;
                  const invertPerM_ = qtoResult.invertPerM * invertCostPerM3;
                  // Use net top slab volume (after grating deduction) for costing
                  const topPerM_ = totalDrainLength > 0 ? qtoResult.totalTopNet / totalDrainLength * topSlabCostPerM3 : 0;
                  const avgWallM3perM = qtoResult.totalWallsNet / totalDrainLength;
                  const wallsPerM_ = avgWallM3perM * wallCostPerM3;
                  const gratingPerM_ = s.qto.gratingsSpacing > 0 ? s.qto.gratingRatePerNos / s.qto.gratingsSpacing : 0;
                  const weepholePerM_ = s.qto.weepholesSpacing > 0 ? s.qto.weepholeRatePerNos / s.qto.weepholesSpacing : 0;
                  const steelRateAvg = bbsSummary.totalKg > 0 ? bbsSummary.totalCost / (bbsSummary.totalKg / 1000) : s.steelRates.r12;
                  const steelPerM_ = bbsSummary.totalKgPerM * (steelRateAvg / 1000);
                  const bwPerM_ = bbsSummary.totalKgPerM * ((s.qto.bindingWireKgPerMT ?? 10) / 1000) * (s.qto.bindingWireRatePerKg ?? 85);
                  const excavPerM_ = qtoResult.excavVolume * s.qto.excavationRate / totalDrainLength;
                  const backfillPerM_ = qtoResult.backfillVol * s.qto.backfillRate / totalDrainLength;
                  const lhPerM_ = (s.qto.liftingHookSpacingM ?? 0) > 0 ? (s.qto.liftingHookRatePerNos ?? 150) / (s.qto.liftingHookSpacingM ?? 2) : 0;
                  const componentRows = [
                    { label: `PCC ${eq.pcc} Bed`, val: pccPerM_, color: "text-stone-600" },
                    { label: `Invert Slab (${eq.invert})`, val: invertPerM_, color: "" },
                    { label: `Walls (${eq.wall})`, val: wallsPerM_, color: "" },
                    showTopSlab ? { label: `Top Slab (${s.qto.topSlabType === "Precast" ? "Precast" : eq.topSlab})`, val: topPerM_, color: "" } : null,
                    steelPerM_ > 0 ? { label: `HYSD Steel (${bbsSummary.totalKgPerM.toFixed(2)} kg/m)`, val: steelPerM_, color: "text-yellow-700" } : null,
                    bwPerM_ > 0 ? { label: "Binding Wire", val: bwPerM_, color: "" } : null,
                    gratingPerM_ > 0 ? { label: "MS Gratings", val: gratingPerM_, color: "" } : null,
                    weepholePerM_ > 0 ? { label: "Weepholes", val: weepholePerM_, color: "" } : null,
                    lhPerM_ > 0 ? { label: "Lifting Hooks", val: lhPerM_, color: "" } : null,
                    excavPerM_ > 0 ? { label: "Earthwork", val: excavPerM_, color: "text-orange-600" } : null,
                    backfillPerM_ > 0 ? { label: "Backfill", val: backfillPerM_, color: "text-green-600" } : null,
                  ].filter(Boolean) as { label: string; val: number; color: string }[];
                  return (
                    <div className={`mt-4 rounded-xl border p-4 ${totalRev > 0 ? cls : "border-slate-200 bg-slate-50"}`}>
                      <p className={`text-sm font-semibold mb-3 ${textCls}`}>
                        ₹ / Running Metre Summary
                        <span className="ml-2 text-xs font-normal text-slate-500">Total drain length: {totalDrainLength.toFixed(0)} m (from QTO zones)</span>
                      </p>
                      <div className="flex flex-wrap gap-6 mb-4">
                        <div>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Client's Rate</p>
                          <p className={`text-xl font-bold ${textCls}`}>{fmtR(rmRev)}<span className="text-sm font-normal">/RM</span></p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Our Cost</p>
                          <p className="text-xl font-bold">{fmtR(rmCost)}<span className="text-sm font-normal">/RM</span></p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Profit</p>
                          <p className={`text-xl font-bold ${rmProfit >= 0 ? "text-green-700" : "text-red-700"}`}>{fmtR(rmProfit)}<span className="text-sm font-normal">/RM</span></p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Margin</p>
                          <p className={`text-2xl font-bold ${textCls}`}>{rmPct.toFixed(1)}%</p>
                        </div>
                      </div>
                      {componentRows.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Cost Breakdown (₹/RM)</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {componentRows.map((row, i) => (
                              <div key={i} className="flex justify-between items-center bg-white/70 dark:bg-slate-800/50 rounded-lg px-2.5 py-1.5 border border-white/60 text-xs">
                                <span className={`text-muted-foreground ${row.color}`}>{row.label}</span>
                                <span className={`font-semibold ml-1 ${row.color}`}>{fmtR(row.val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {/* ══════════════ TAB 3: ANALYSIS ══════════════ */}
        <TabsContent value="analysis">
          <Tabs value={activeAnalysisTab} onValueChange={setActiveAnalysisTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="price-impact"><TrendingUp className="w-3.5 h-3.5 mr-1" />Price Impact</TabsTrigger>
              <TabsTrigger value="compare"><BarChart3 className="w-3.5 h-3.5 mr-1" />Compare Scenarios</TabsTrigger>
              <TabsTrigger value="rate-blender"><MapPin className="w-3.5 h-3.5 mr-1" />Rate Blender</TabsTrigger>
            </TabsList>

            {/* ── Price Impact ── */}
            <TabsContent value="price-impact">
              <div className="space-y-4">
                {/* Impact banner */}
                <Card className={`border-2 ${revisedCosts.totalWithEsc !== costs.totalWithEsc ? "border-blue-300 bg-blue-50" : "border-border"}`}>
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Combined Impact</p>
                        <p className="text-2xl font-bold">{fmtR(revisedCosts.totalWithEsc)}/m³</p>
                        <p className="text-xs text-muted-foreground">
                          Base: {fmtR(costs.totalWithEsc)}/m³ ·
                          Delta: {revisedCosts.totalWithEsc > costs.totalWithEsc ? "+" : ""}
                          {fmtR(revisedCosts.totalWithEsc - costs.totalWithEsc)}/m³
                        </p>
                      </div>
                      <div className="text-right">
                        {/* BOQ Margin impact */}
                        {(() => {
                          const baseMargin = ((effectiveClientRatePerM3 - costs.totalWithEsc) / effectiveClientRatePerM3) * 100;
                          const revisedMargin = ((effectiveClientRatePerM3 - revisedCosts.totalWithEsc) / effectiveClientRatePerM3) * 100;
                          const color = revisedMargin >= 10 ? "text-green-600" : revisedMargin >= 5 ? "text-amber-600" : "text-red-600";
                          return (
                            <div>
                              <p className="text-xs text-muted-foreground">BOQ Margin</p>
                              <p className={`text-lg font-bold ${color}`}>{revisedMargin.toFixed(1)}%</p>
                              <p className="text-xs text-muted-foreground">Base: {baseMargin.toFixed(1)}%</p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Variables table */}
                <Card>
                  <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                    <CardTitle className="text-sm font-semibold">Sensitivity Variables (ranked by 10% impact)</CardTitle>
                    <HelpBtn id="price-impact" />
                  </CardHeader>
                  <HelpPanel id="price-impact" title="Price Impact">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li>Variables are ranked by their ₹/m³ impact if each rate changes by 10% — highest impact at the top</li>
                <li><b>New Rate</b> — enter a new absolute rate in the shown unit (₹/bag, ₹/MT, ₹/day, etc.). Leave blank for no change</li>
                <li><b>Base column</b> — current rate from the calculator for reference</li>
                <li><b>Delta ₹/m³</b> — how much the total cost changes if you set that rate. Positive = cost increases</li>
                <li>Impact banner updates live showing revised total ₹/m³ and BOQ margin at the entered rates</li>
                <li>"Save as Scenario" captures the current rate set as a named scenario for the Compare tab</li>
                <li>"Reset All" clears all entered rates back to the base values from the calculator</li>
                </ul>
              </HelpPanel>
                  <CardContent className="px-5 pb-5">
                    <div className="space-y-2">
                      {PRICE_VARIABLES.map((v, rank) => {
                        const newRate = priceImpactRates[v.key];
                        const pctChange = newRate !== undefined
                          ? (v.key === "margin" ? newRate - v.baseValue : v.baseValue > 0 ? ((newRate - v.baseValue) / v.baseValue) * 100 : 0)
                          : 0;
                        const deltaPerM3 = (v.impact * pctChange) / 100;
                        return (
                          <div key={v.key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                            <span className="text-xs text-muted-foreground w-4 text-right">{rank + 1}</span>
                            <div className="w-32 text-xs font-medium shrink-0">{v.label}</div>
                            <div className="w-32 text-xs text-muted-foreground shrink-0">
                              <span className="text-[10px] text-muted-foreground/70 block">Base</span>
                              {v.key === "margin" ? `${v.baseValue.toFixed(1)}%` : `${fmtR(v.baseValue)} ${v.unit}`}
                            </div>
                            <div className="flex items-center gap-2 flex-1">
                              <Input
                                type="number"
                                value={priceImpactRates[v.key] ?? ""}
                                placeholder={String(v.baseValue)}
                                onChange={(e) => {
                                  const newRate = parseFloat(e.target.value);
                                  if (!isNaN(newRate)) handlePiRateChange(v.key, newRate);
                                  else { setPriceImpactRates((p) => { const n = { ...p }; delete n[v.key]; return n; }); }
                                }}
                                className="h-7 w-28 text-xs text-right"
                                step={v.key === "margin" ? 0.5 : 1}
                                data-testid={`pi-input-${v.key}`}
                              />
                              <span className="text-xs text-muted-foreground shrink-0">{v.unit}</span>
                            </div>
                            <div className={`w-24 text-right text-xs font-semibold ${deltaPerM3 > 0 ? "text-red-600" : deltaPerM3 < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                              {deltaPerM3 !== 0 ? `${deltaPerM3 > 0 ? "+" : ""}${fmtR(deltaPerM3)}/m³` : "—"}
                            </div>
                            <div className="w-20 text-right text-xs text-muted-foreground">
                              10% → {fmtR(v.impact * 0.1)}/m³
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Save as Scenario */}
                    <div className="mt-5 pt-5 border-t">
                      <div className="flex items-center gap-3">
                        {!addingScenario ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAddingScenario(true)}
                            disabled={(s.scenarios || []).length >= MAX_SCENARIOS}
                            data-testid="btn-save-scenario"
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            {(s.scenarios || []).length >= MAX_SCENARIOS ? "Max 3 Scenarios" : "Save as Scenario"}
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Scenario name..."
                              value={scenarioNameInput}
                              onChange={(e) => setScenarioNameInput(e.target.value)}
                              className="h-8 w-48 text-sm uppercase"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && scenarioNameInput.trim()) {
                                  saveAsScenario(scenarioNameInput.trim());
                                  setScenarioNameInput("");
                                  setAddingScenario(false);
                                }
                                if (e.key === "Escape") { setAddingScenario(false); setScenarioNameInput(""); }
                              }}
                              data-testid="input-scenario-name"
                            />
                            <Button size="sm" onClick={() => { if (scenarioNameInput.trim()) { saveAsScenario(scenarioNameInput.trim()); setScenarioNameInput(""); setAddingScenario(false); } }}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setAddingScenario(false); setScenarioNameInput(""); }}>Cancel</Button>
                          </div>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setPriceImpactRates({})}>Reset All</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* BOQ Margin Impact cards */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Client's Rate", value: fmtR(effectiveClientRatePerM3) + "/m³", sub: "Normalized to ₹/m³", color: "bg-blue-50 border-blue-200 text-blue-800" },
                    { label: "Base BOQ Margin", value: `${((effectiveClientRatePerM3 - costs.totalWithEsc) / effectiveClientRatePerM3 * 100).toFixed(1)}%`, sub: `Base cost: ${fmtR(costs.totalWithEsc)}/m³`, color: (() => { const m = (effectiveClientRatePerM3 - costs.totalWithEsc) / effectiveClientRatePerM3 * 100; return m >= 10 ? "bg-green-50 border-green-200 text-green-800" : m >= 5 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-800"; })() },
                    { label: "Revised BOQ Margin", value: `${((effectiveClientRatePerM3 - revisedCosts.totalWithEsc) / effectiveClientRatePerM3 * 100).toFixed(1)}%`, sub: `Revised cost: ${fmtR(revisedCosts.totalWithEsc)}/m³`, color: (() => { const m = (effectiveClientRatePerM3 - revisedCosts.totalWithEsc) / effectiveClientRatePerM3 * 100; return m >= 10 ? "bg-green-50 border-green-200 text-green-800" : m >= 5 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-800"; })() },
                  ].map((card) => (
                    <Card key={card.label} className={`border ${card.color}`}>
                      <CardContent className="py-4 px-5 text-center">
                        <p className="text-xs font-semibold mb-1">{card.label}</p>
                        <p className="text-xl font-bold">{card.value}</p>
                        <p className="text-xs mt-1">{card.sub}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* ── Compare Scenarios ── */}
            <TabsContent value="compare">
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <div className="flex items-center">
                    <CardTitle className="text-sm font-semibold">Scenario Comparison</CardTitle>
                    <HelpBtn id="compare" />
                  </div>
                  <div className="flex items-center gap-2">
                    {!addingScenario && (s.scenarios || []).length < MAX_SCENARIOS ? (
                      <Button size="sm" variant="outline" onClick={() => setAddingScenario(true)} data-testid="btn-compare-add-scenario">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Save Current as Scenario
                      </Button>
                    ) : !addingScenario ? (
                      <span className="text-xs text-muted-foreground border border-dashed border-muted rounded-lg px-3 py-1.5">Max 3 Scenarios</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Scenario name..."
                          value={scenarioNameInput}
                          onChange={(e) => setScenarioNameInput(e.target.value)}
                          className="h-8 w-40 text-sm uppercase"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && scenarioNameInput.trim()) {
                              saveAsScenario(scenarioNameInput.trim());
                              setScenarioNameInput("");
                              setAddingScenario(false);
                            }
                            if (e.key === "Escape") { setAddingScenario(false); setScenarioNameInput(""); }
                          }}
                        />
                        <Button size="sm" onClick={() => { if (scenarioNameInput.trim()) { saveAsScenario(scenarioNameInput.trim()); setScenarioNameInput(""); setAddingScenario(false); } }}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAddingScenario(false); setScenarioNameInput(""); }}>Cancel</Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <HelpPanel id="compare" title="Compare Scenarios">
                  <ul className="space-y-1.5 list-disc list-outside ml-3">
                    <li>Base column always shows the current calculator values. Add up to 3 named scenarios for comparison</li>
                    <li>"Save Current as Scenario" opens a name input — press Enter or click Save to store. Max 3 scenarios</li>
                    <li><b>Grouped table</b> — Materials / Plant+Formwork / Overhead+Margin rows for easy cross-scenario reading</li>
                    <li><b>BOQ Margin %</b> badge — ≥10% green, 5-10% amber, &lt;5% red. %-point delta is shown vs Base</li>
                    <li>Savings cards show "Rate Changes" (what was different) and net cost delta vs Base</li>
                    <li>Scenarios recalculate against current base rates — changing base values automatically updates all scenario comparisons</li>
                  </ul>
                </HelpPanel>
                <CardContent className="px-5 pb-5">
                  {(s.scenarios || []).length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm font-medium">No scenarios yet</p>
                      <p className="text-xs mt-1">Go to Price Impact tab, adjust variables, then save as a scenario.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                            <th className="text-left px-3 py-2.5 font-semibold">Component</th>
                            <th className="text-right px-3 py-2.5 font-semibold">Base</th>
                            {(s.scenarios || []).map((sc) => (
                              <th key={sc.id} className="text-right px-3 py-2.5 font-semibold">
                                <div className="flex items-center justify-end gap-1">
                                  {sc.name}
                                  <button onClick={() => update({ scenarios: (s.scenarios || []).filter((x) => x.id !== sc.id) })} className="text-muted-foreground hover:text-destructive ml-1">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: "Materials", rows: [
                              { label: "Cement", key: "cement" as keyof CostBreakdown },
                              { label: "Coarse Agg", key: "ca" as keyof CostBreakdown },
                              { label: "Fine Agg", key: "fa" as keyof CostBreakdown },
                              { label: "Admixture", key: "admix" as keyof CostBreakdown },
                              { label: "Steel (BBS)", key: "steel" as keyof CostBreakdown },
                            ]},
                            { label: "Plant & Formwork", rows: [
                              { label: "Batching", key: "batching" as keyof CostBreakdown },
                              { label: "Placement", key: "placement" as keyof CostBreakdown },
                              { label: "Formwork", key: "formwork" as keyof CostBreakdown },
                            ]},
                            { label: "Labour & Other", rows: [
                              { label: "Labour", key: "labour" as keyof CostBreakdown },
                              { label: "Curing", key: "curing" as keyof CostBreakdown },
                              { label: "Wastage", key: "wastage" as keyof CostBreakdown },
                            ]},
                            { label: "Overhead & Margin", rows: [
                              { label: "Overhead", key: "overhead" as keyof CostBreakdown },
                              { label: "Margin", key: "margin" as keyof CostBreakdown },
                            ]},
                          ].map((section) => (
                            <>
                              <tr key={section.label} className="bg-muted/20">
                                <td colSpan={2 + (s.scenarios || []).length} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{section.label}</td>
                              </tr>
                              {section.rows.map(({ label, key }) => {
                                const baseVal = costs[key] as number;
                                return (
                                  <tr key={key} className="border-t border-border/30 hover:bg-muted/10">
                                    <td className="px-3 py-2 text-sm">{label}</td>
                                    <td className="px-3 py-2 text-right text-sm">{fmtR(baseVal)}</td>
                                    {(s.scenarios || []).map((sc) => {
                                      const scCosts = computeScenarioCosts(sc);
                                      const scVal = scCosts[key] as number;
                                      const delta = scVal - baseVal;
                                      return (
                                        <td key={sc.id} className={`px-3 py-2 text-right text-sm ${delta < 0 ? "bg-green-50 text-green-700" : delta > 0 ? "bg-red-50 text-red-700" : ""}`}>
                                          {fmtR(scVal)}
                                          {delta !== 0 && <span className="text-xs ml-1">({delta > 0 ? "+" : ""}{fmtR(delta)})</span>}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </>
                          ))}
                          {/* Grand Total row */}
                          <tr className="border-t-2 border-border font-bold bg-muted/20">
                            <td className="px-3 py-2.5">Grand Total ₹/m³</td>
                            <td className="px-3 py-2.5 text-right">{fmtR(costs.totalWithEsc)}</td>
                            {(s.scenarios || []).map((sc) => {
                              const scCosts = computeScenarioCosts(sc);
                              const delta = scCosts.totalWithEsc - costs.totalWithEsc;
                              return (
                                <td key={sc.id} className={`px-3 py-2.5 text-right ${delta < 0 ? "text-green-700" : delta > 0 ? "text-red-700" : ""}`}>
                                  {fmtR(scCosts.totalWithEsc)}
                                  <span className="text-xs font-normal ml-1">({delta > 0 ? "+" : ""}{fmtR(delta)})</span>
                                </td>
                              );
                            })}
                          </tr>
                          {/* BOQ Margin % row */}
                          <tr className="border-t border-border bg-blue-50">
                            <td className="px-3 py-2.5 text-sm font-semibold">BOQ Margin %</td>
                            <td className="px-3 py-2.5 text-right">
                              {(() => {
                                const m = ((effectiveClientRatePerM3 - costs.totalWithEsc) / effectiveClientRatePerM3) * 100;
                                const cls = m >= 10 ? "bg-green-100 text-green-700 border-green-300" : m >= 5 ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-red-100 text-red-700 border-red-300";
                                return <Badge variant="outline" className={`text-xs font-bold ${cls}`}>{m.toFixed(1)}%</Badge>;
                              })()}
                            </td>
                            {(s.scenarios || []).map((sc) => {
                              const scCosts = computeScenarioCosts(sc);
                              const m = ((effectiveClientRatePerM3 - scCosts.totalWithEsc) / effectiveClientRatePerM3) * 100;
                              const baseM = ((effectiveClientRatePerM3 - costs.totalWithEsc) / effectiveClientRatePerM3) * 100;
                              const pp = m - baseM;
                              const cls = m >= 10 ? "bg-green-100 text-green-700 border-green-300" : m >= 5 ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-red-100 text-red-700 border-red-300";
                              return (
                                <td key={sc.id} className="px-3 py-2.5 text-right">
                                  <Badge variant="outline" className={`text-xs font-bold ${cls}`}>{m.toFixed(1)}%</Badge>
                                  <span className={`text-xs ml-1 ${pp > 0 ? "text-green-600" : pp < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                    {pp > 0 ? "+" : ""}{pp.toFixed(1)} pp
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>

                      {/* Savings cards */}
                      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {(s.scenarios || []).map((sc) => {
                          const scCosts = computeScenarioCosts(sc);
                          const savings = costs.totalWithEsc - scCosts.totalWithEsc;
                          const margin = ((effectiveClientRatePerM3 - scCosts.totalWithEsc) / effectiveClientRatePerM3) * 100;
                          const isBetter = savings > 0;
                          const rateChanges = sc.rates ? PRICE_VARIABLES.filter(v => {
                            const r = sc.rates![v.key];
                            return r !== undefined && Math.abs(r - v.baseValue) > 0.001;
                          }) : [];
                          return (
                            <div key={sc.id} className={`p-4 rounded-xl border ${isBetter ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">{sc.name}</p>
                              <p className={`text-lg font-bold ${isBetter ? "text-green-700" : "text-red-700"}`}>
                                {isBetter ? "Saves" : "Costs"} {fmtR(Math.abs(savings))}/m³
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">BOQ Margin: {margin.toFixed(1)}%</p>
                              {rateChanges.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-current/10 space-y-0.5">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Rate Changes</p>
                                  {rateChanges.map(v => (
                                    <div key={v.key} className="flex justify-between text-[10px] text-muted-foreground gap-1">
                                      <span className="truncate">{v.label.replace(" Rate", "")}</span>
                                      <span className="shrink-0 font-medium">{v.key === "margin" ? `${v.baseValue.toFixed(1)}% → ${sc.rates![v.key].toFixed(1)}%` : `${fmtR(v.baseValue)} → ${fmtR(sc.rates![v.key])} ${v.unit}`}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Rate Blender ── */}
            <TabsContent value="rate-blender">
              {(s.locationVariants ?? []).length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center text-muted-foreground">
                    <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">No location variants yet</p>
                    <p className="text-xs mt-1">Go to Calculator tab → Location Variants card and add locations with different sourcing rates.</p>
                  </CardContent>
                </Card>
              ) : (() => {
                const locs = s.locationVariants ?? [];
                const totalLen = locs.reduce((sum, l) => sum + l.lengthM, 0);
                const locCalcs = locs.map(loc => ({
                  loc,
                  costs: computeCosts(s, steelCostPerM3, loc.caSources, loc.faOverride, pettyLabourRatePerM3),
                  weight: totalLen > 0 ? loc.lengthM / totalLen : 0,
                }));
                const blendedCost = locCalcs.reduce((sum, lc) => sum + lc.costs.totalWithEsc * lc.weight, 0);
                const minCost = Math.min(...locCalcs.map(lc => lc.costs.totalWithEsc));
                const maxCost = Math.max(...locCalcs.map(lc => lc.costs.totalWithEsc));
                const quotedRate = blendedCost * (1 + (s.blendedMarkupPct ?? 0) / 100);
                const blendedMargin = effectiveClientRatePerM3 > 0 ? ((effectiveClientRatePerM3 - blendedCost) / effectiveClientRatePerM3) * 100 : 0;
                const quotedMargin = effectiveClientRatePerM3 > 0 ? ((effectiveClientRatePerM3 - quotedRate) / effectiveClientRatePerM3) * 100 : 0;
                const marginColor = (m: number) => m >= 10 ? "text-green-600" : m >= 5 ? "text-amber-600" : "text-red-600";
                return (
                  <div className="space-y-4">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <Card className="border-violet-200 bg-violet-50">
                        <CardContent className="py-4 px-4 text-center">
                          <p className="text-xs text-muted-foreground font-semibold mb-1">Blended Cost</p>
                          <p className="text-xl font-bold text-violet-800">{fmtR(blendedCost)}/m³</p>
                          <p className="text-xs text-muted-foreground mt-1">{locs.length} locations · {(totalLen / 1000).toFixed(1)} km total</p>
                        </CardContent>
                      </Card>
                      <Card className="border-slate-200">
                        <CardContent className="py-4 px-4 text-center">
                          <p className="text-xs text-muted-foreground font-semibold mb-1">Range</p>
                          <p className="text-sm font-bold">{fmtR(minCost)} – {fmtR(maxCost)}/m³</p>
                          <p className="text-xs text-muted-foreground mt-1">Spread: {fmtR(maxCost - minCost)}/m³</p>
                        </CardContent>
                      </Card>
                      <Card className={`border-2 ${blendedMargin >= 10 ? "border-green-200 bg-green-50" : blendedMargin >= 5 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                        <CardContent className="py-4 px-4 text-center">
                          <p className="text-xs text-muted-foreground font-semibold mb-1">Blended BOQ Margin</p>
                          <p className={`text-xl font-bold ${marginColor(blendedMargin)}`}>{blendedMargin.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground mt-1">Contract: {fmtR(s.contractRate)}/m³</p>
                        </CardContent>
                      </Card>
                      <Card className="border-slate-200">
                        <CardContent className="py-4 px-4 text-center">
                          <p className="text-xs text-muted-foreground font-semibold mb-1">Quoted Rate</p>
                          <p className="text-lg font-bold">{fmtR(quotedRate)}/m³</p>
                          <p className={`text-xs mt-1 font-semibold ${marginColor(quotedMargin)}`}>Margin: {quotedMargin.toFixed(1)}%</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Location table */}
                    <Card>
                      <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                        <CardTitle className="text-sm font-semibold">Location Cost Breakdown</CardTitle>
                        <HelpBtn id="rate-blender" />
                      </CardHeader>
                      <HelpPanel id="rate-blender" title="Rate Blender">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li>Add location variants via <b>Calculator tab → Location Variants card</b> (between Raw Materials and Batching)</li>
                <li>Each variant overrides CA and FA sourcing rates + lead km for that stretch of road</li>
                <li><b>Length (m)</b> is the weight: Blended cost = Σ(Location cost × Length) ÷ Total length</li>
                <li>Min/Max range shows best and worst-case sourcing scenarios across all locations</li>
                <li><b>Quote Rate Builder</b> — enter a markup % to compute a quoted rate. BOQ Margin shows vs your contract rate</li>
                <li>Tip: Use this when the same structure runs through zones with different quarry distances</li>
                </ul>
              </HelpPanel>
                      <CardContent className="px-5 pb-5">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                                <th className="text-left px-3 py-2.5 font-semibold">Location</th>
                                <th className="text-right px-3 py-2.5">Length (m)</th>
                                <th className="text-right px-3 py-2.5">Weight %</th>
                                <th className="text-right px-3 py-2.5">CA+FA /m³</th>
                                <th className="text-right px-3 py-2.5">Total Cost /m³</th>
                                <th className="text-right px-3 py-2.5">BOQ Margin</th>
                                <th className="text-right px-3 py-2.5">Contribution</th>
                              </tr>
                            </thead>
                            <tbody>
                              {locCalcs.map(({ loc, costs: lc, weight }) => {
                                const margin = effectiveClientRatePerM3 > 0 ? ((effectiveClientRatePerM3 - lc.totalWithEsc) / effectiveClientRatePerM3) * 100 : 0;
                                const contribution = lc.totalWithEsc * weight;
                                return (
                                  <tr key={loc.id} className="border-t border-border/30 hover:bg-muted/10">
                                    <td className="px-3 py-2.5 font-medium">{loc.name}</td>
                                    <td className="px-3 py-2.5 text-right">{loc.lengthM.toLocaleString()}</td>
                                    <td className="px-3 py-2.5 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <div className="w-16 bg-muted rounded-full h-1.5">
                                          <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${weight * 100}%` }} />
                                        </div>
                                        {(weight * 100).toFixed(1)}%
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtR(lc.ca + lc.fa)}</td>
                                    <td className="px-3 py-2.5 text-right font-semibold">{fmtR(lc.totalWithEsc)}</td>
                                    <td className={`px-3 py-2.5 text-right font-semibold ${marginColor(margin)}`}>{margin.toFixed(1)}%</td>
                                    <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtR(contribution)}</td>
                                  </tr>
                                );
                              })}
                              <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                                <td className="px-3 py-2.5">Weighted Blend</td>
                                <td className="px-3 py-2.5 text-right">{totalLen.toLocaleString()}</td>
                                <td className="px-3 py-2.5 text-right">100%</td>
                                <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
                                <td className="px-3 py-2.5 text-right text-violet-700">{fmtR(blendedCost)}</td>
                                <td className={`px-3 py-2.5 text-right ${marginColor(blendedMargin)}`}>{blendedMargin.toFixed(1)}%</td>
                                <td className="px-3 py-2.5 text-right">{fmtR(blendedCost)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Markup & quoted rate */}
                    <Card>
                      <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                        <CardTitle className="text-sm font-semibold">Quote Rate Builder</CardTitle>
                      </CardHeader>
                      <CardContent className="px-5 pb-5">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Blended Cost /m³</Label>
                            <div className="h-8 px-3 flex items-center text-sm font-semibold text-muted-foreground bg-muted/40 rounded-md border">{fmtR(blendedCost)}</div>
                          </div>
                          {numInput("Markup %", s.blendedMarkupPct ?? 0, (v) => update({ blendedMarkupPct: v }), { unit: "%", step: 0.5, testId: "input-blended-markup" })}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Quoted Rate /m³</Label>
                            <div className={`h-8 px-3 flex items-center text-sm font-bold rounded-md border ${quotedMargin >= 10 ? "bg-green-50 border-green-200 text-green-800" : quotedMargin >= 5 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-800"}`}>{fmtR(quotedRate)}</div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">BOQ Margin at Quote</Label>
                            <div className={`h-8 px-3 flex items-center text-sm font-bold rounded-md border ${quotedMargin >= 10 ? "bg-green-50 border-green-200 text-green-800" : quotedMargin >= 5 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-800"}`}>{quotedMargin.toFixed(1)}%</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
