import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Save, Plus, Trash2, Info, TrendingUp, BarChart3, LogOut, MapPin, Building2, FileUp, ChevronDown, ChevronUp, HelpCircle, X, AlertTriangle, Target, Lock, LockOpen } from "lucide-react";
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
interface BOQItem { id: string; description: string; qty: number; unit: string; dimL: number; dimW: number; dimD: number; rate: number; clientRate?: number; }
interface BBSRow { id: string; mark: string; dia: number; shape: string; count: number; cutLength: number; overlapN: number; element: string; zoneId: string; countBasis: "spacing" | "manual"; spacingMm: number; supplyLenM?: number; hookMult?: number; hookMm?: number; hookAuto?: boolean; }
interface IncludedCosts { cement: boolean; ca: boolean; fa: boolean; admix: boolean; batching: boolean; placement: boolean; formwork: boolean; labour: boolean; curing: boolean; steel: boolean; wastage: boolean; overhead: boolean; margin: boolean; }
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
  pccPlacingRatePerM3: number;
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
  steelFabRatePerMT: number;
  supplyBarLengthM: number;
  mixLocked: boolean;
  includeAdmix: boolean;
  includedCosts: IncludedCosts;
  clientOfferedRate: number;
  clientOfferedRateMode: "per_m3" | "per_rm";
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
const HOOK_ALLOWANCE: Record<string, (dia: number, mult?: number) => number> = {
  "Straight": () => 0,
  "U-bar":    (d, m = 4) => 2 * m * d / 1000,
  "L-bar":    (d, m = 4) => 1 * m * d / 1000,
  "Ring":     (d, m = 4) => 2 * m * d / 1000 + 10 * d / 1000,
  "Stirrup":  (d, m = 4) => 2 * m * d / 1000 + 10 * d / 1000,
};
const DEFAULT_HOOK_MULT = 4;

const MAX_SCENARIOS = 3;

// ─── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_STATE: CalcState = {
  estimateName: "", preparedBy: "", date: new Date().toISOString().split("T")[0],
  structureType: "Drain", grade: "M25", totalVolume: 0, contractor: "",
  mix: { ...MIX_PRESETS["M25"] },
  cementBagPrice: 0,
  caTabs: [
    { proportion: 60, purchaseRate: 0, uom: "per_mt", leadKm: 0, freightRate: 0, payload: 9 },
    { proportion: 30, purchaseRate: 0, uom: "per_mt", leadKm: 0, freightRate: 0, payload: 9 },
    { proportion: 10, purchaseRate: 0, uom: "per_mt", leadKm: 0, freightRate: 0, payload: 9 },
  ],
  faType: "natural", faPurchaseRate: 0, faUom: "per_cft", faLeadKm: 0, faFreightRate: 0, faPayload: 9, faBulkagePct: 12,
  admixDosage: 0, admixRate: 0,
  batchingRows: [],
  placementMode: "hired", placementRatePerDay: 0, placementOutputPerDay: 0,
  pccPlacingRatePerM3: 0,
  tmHirePerTrip: 0, tmTripsPerDay: 0,
  shutteringSystem: "Steel Frame + Timber Ply", stagingSystem: "Prop & Beam",
  shutteringAreaPerM3: 0, shutteringCostPerM2: 0, shutteringReuseCycles: 20,
  stagingHeight: 3.5, stagingHireRate: 0, stagingMonths: 2,
  waterCuringMode: "tanker",
  tankerCapKL: 6, tankerTripsPerDay: 2, tankerHireRate: 0, curingDays: 7,
  staticPumpKw: 1.5, staticElecRate: 0, staticWaterCostKL: 0, staticDailyWaterKL: 2,
  stagingAreaPerM3: 0,
  curingCompoundEnabled: false, curingCompoundRate: 0, curingCompoundCoverage: 5, curingCompoundSurfaceArea: 2,
  overheadPct: 8, marginPct: 10, escalationPct: 2,
  labourRatePerM3: 0,
  wastage: {
    sandBulkage: true, cementWastage: true, cementWastagePct: 2,
    steelCuttingWaste: true, steelCuttingPct: 4,
    formworkDamage: false, formworkDamageReduction: 10,
    curingWaterLoss: false, curingWaterLossPct: 10,
  },
  boqItems: [],
  bbsRows: [],
  steelRates: { r8: 58000, r10: 57000, r12: 56500, r16: 56000, r20: 55500, r25: 55000 },
  steelFabRatePerMT: 0,
  supplyBarLengthM: 12,
  mixLocked: false,
  includeAdmix: true,
  includedCosts: { cement: true, ca: true, fa: true, admix: true, batching: true, placement: true, formwork: true, labour: true, curing: true, steel: true, wastage: true, overhead: true, margin: true },
  clientOfferedRate: 0,
  clientOfferedRateMode: "per_m3",
  scenarios: [],
  locationVariants: [],
  blendedMarkupPct: 0,
  pettyLabour: {
    enabled: false, rateValue: 0, rateUnit: "per_m3",
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
    heightZones: [],
    gratingsSpacing: 3, weepholesSpacing: 1.5,
    gratingRatePerNos: 0, weepholeRatePerNos: 0,
    pccRatePerM3: 0, excavationRate: 0, backfillRate: 0,
    bwBaseWidth: 2000, bwStemThick: 400, bwHeight: 3000, bwFootingDepth: 500,
    showFormulaRef: false,
  },
};

type LegacyCalcState = Partial<CalcState> & { contractRate?: number; contractRateMode?: "per_m3" | "per_rm" };

function loadState(): CalcState {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const loaded = JSON.parse(saved) as LegacyCalcState;
      return {
        ...DEFAULT_STATE,
        ...loaded,
        clientOfferedRate: loaded.clientOfferedRate ?? loaded.contractRate ?? 0,
        clientOfferedRateMode: loaded.clientOfferedRateMode ?? loaded.contractRateMode ?? "per_m3",
        pettyLabour: { ...DEFAULT_STATE.pettyLabour, ...(loaded.pettyLabour || {}) },
        qto: {
          ...DEFAULT_STATE.qto,
          ...(loaded.qto || {}),
          elementGrades: { ...DEFAULT_STATE.qto.elementGrades, ...(loaded.qto?.elementGrades || {}) },
        },
        supplyBarLengthM: loaded.supplyBarLengthM ?? 12,
        mixLocked: loaded.mixLocked ?? false,
        includeAdmix: loaded.includeAdmix ?? true,
        includedCosts: (() => {
          const saved = loaded.includedCosts || {};
          // Migrate old caFa key → separate ca and fa
          const migratedCa = saved.ca !== undefined ? saved.ca : (saved.caFa !== undefined ? saved.caFa : true);
          const migratedFa = saved.fa !== undefined ? saved.fa : (saved.caFa !== undefined ? saved.caFa : true);
          return { ...DEFAULT_STATE.includedCosts, ...saved, ca: migratedCa, fa: migratedFa };
        })(),
        bbsRows: (loaded.bbsRows || []).map((r: any) => {
          const base = { element: "Invert-Bottom", zoneId: "all", countBasis: "spacing", spacingMm: 200, overlapN: 0, ...r };
          // Migrate hookMult -> hookMm if hookMm not yet stored
          if (base.hookMm === undefined && base.hookMult !== undefined && base.shape !== "Straight") {
            const m = base.hookMult ?? DEFAULT_HOOK_MULT;
            if (base.shape === "U-bar") base.hookMm = Math.round(2 * m * base.dia);
            else if (base.shape === "L-bar") base.hookMm = Math.round(1 * m * base.dia);
            else if (base.shape === "Ring" || base.shape === "Stirrup") base.hookMm = Math.round((2 * m + 10) * base.dia);
          }
          return base;
        }),
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

  // Admixture (excluded when includeAdmix is false)
  const admix = (s.includeAdmix !== false) ? s.admixDosage * s.admixRate : 0;

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
// "span"       → countPerM = overallWidth / spacing  (bars running ACROSS drain)
// "wall"       → countPerM = wallHeight / spacing     (horizontal distribution bars up the wall)
// "drain_len"  → countPerM = 1000 / spacing           (bars spaced ALONG drain, e.g. vertical wall bars)
// "along_drain"→ countPerM = overallWidth / spacing   (bars running ALONG drain; overlap fraction of supply length)
// "manual"     → user enters absolute count
const ELEMENT_DIM_TYPE: Record<string, "wall" | "span" | "along_drain" | "drain_len" | "manual"> = {
  "Invert-Bottom": "span", "Invert-Top": "span",
  "Invert-Longitudinal": "along_drain",
  "Wall-Earth": "wall", "Wall-Inner": "wall",
  "Wall-Vertical": "drain_len",
  "TopSlab-Bottom": "span", "TopSlab-Top": "span",
  "TopSlab-Longitudinal": "along_drain",
  "Dist/Tie": "manual", "Lifting Hook": "manual", "Manual": "manual",
};

interface BBSQtoCtx {
  clearSpanMm: number; wallThickMm: number;
  heightZones: HeightZone[]; totalDrainLength: number;
}

function computeBBSSummary(rows: BBSRow[], rates: SteelRates, qtoCtx?: BBSQtoCtx, supplyBarLengthM = 12) {
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
    // Hook allowance: use direct mm value if set, otherwise fall back to default formula
    const hookAll = row.shape === "Straight" ? 0
      : row.hookMm !== undefined ? row.hookMm / 1000
      : (HOOK_ALLOWANCE[row.shape] ? HOOK_ALLOWANCE[row.shape](row.dia, DEFAULT_HOOK_MULT) : 0);
    const overlapLen = (row.overlapN * row.dia) / 1000;
    const unitLen = row.cutLength + hookAll + overlapLen; // m per bar (for transverse bars)
    const kgPerMBar = (row.dia * row.dia) / 162;
    const rate = diaRateMap[row.dia] || 56000;

    let rowKg = 0;
    let rowKgPerM = 0;

    const basis = row.countBasis ?? "manual";
    const dimType = ELEMENT_DIM_TYPE[row.element ?? "Manual"] ?? "manual";

    if (basis === "spacing" && (row.spacingMm ?? 200) > 0) {
      if (dimType === "span") {
        // Bars running ACROSS drain: count = slab width ÷ spacing; unitLen = full physical bar length
        const countPerM = spanMm / (row.spacingMm ?? 200);
        rowKgPerM = unitLen * countPerM * kgPerMBar;
        rowKg = rowKgPerM * totalLength;
      } else if (dimType === "along_drain") {
        // Bars running ALONG drain: fixed number of bars across section width, each running full drain length.
        // Each bar contributes 1m of length per 1m of drain. Overlap splice adds (overlapLen / supplyLen) extra per metre.
        const countPerM = spanMm / (row.spacingMm ?? 200);
        const supplyLen = supplyBarLengthM > 0 ? supplyBarLengthM : 12;
        const overlapPerBar = (row.overlapN * row.dia) / 1000; // m per splice
        const overlapFracPerM = overlapPerBar / supplyLen; // extra m of bar per m of drain
        const effectiveUnitLen = 1.0 + overlapFracPerM; // FIX: was cutLength+hook+overlapFrac (12× error)
        rowKgPerM = countPerM * effectiveUnitLen * kgPerMBar;
        rowKg = rowKgPerM * totalLength;
      } else if (dimType === "drain_len") {
        // Vertical/longitudinal bars SPACED along the drain: count = 1000mm ÷ spacing.
        // unitLen is the physical bar height (cut length + hooks + overlap at lap joints).
        const countPerM = 1000 / (row.spacingMm ?? 200);
        rowKgPerM = unitLen * countPerM * kgPerMBar;
        rowKg = rowKgPerM * totalLength;
      } else if (dimType === "wall") {
        // Horizontal distribution bars: count = wall height ÷ spacing; zone-aware
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
  const admix = (s.includeAdmix !== false) ? s.admixDosage * s.admixRate : 0;
  return cement + ca + fa + admix;
}

// Compute a proper PCC rate per m³ from scratch:
// PCC material (own grade mix) + same batching + pccPlacingRate + same curing + OH + margin + esc
// No formwork, no steel.
function computePccRatePerM3(s: CalcState, pccGrade: string, pccPlacingRate: number): number {
  const pccMix = MIX_PRESETS[pccGrade] ?? MIX_PRESETS["M15"];
  const pccState: CalcState = { ...s, mix: pccMix, wastage: { ...s.wastage, steelCuttingWaste: false } };
  const raw = computeCosts(pccState, 0);
  const direct = raw.cement + raw.ca + raw.fa + raw.admix + raw.batching + pccPlacingRate + raw.curing + raw.labour + raw.wastage;
  const oh = direct * (s.overheadPct / 100);
  const mg = (direct + oh) * (s.marginPct / 100);
  return (direct + oh + mg) * (1 + s.escalationPct / 100);
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
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-9 text-sm min-w-[90px]"
          data-testid={opts.testId}
        />
        {opts.unit && <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap font-medium">{opts.unit}</span>}
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

// ─── Rate Analysis Pill Component ─────────────────────────────────────────────

type RateAnalysisElement = {
  key: string; label: string; grade: string;
  concreteType: "PCC" | "RCC";
  m3perRm: number; totalM3: number;
  mat: number; batching: number; placing: number;
  formwork: number; curing: number; overhead: number; margin: number; total: number;
};

function RateAnalysisPill({
  elements, allGrades, totalLength,
}: {
  elements: RateAnalysisElement[];
  allGrades: string[];
  totalLength: number;
}) {
  const [typeFilter, setTypeFilter] = useState<"All" | "PCC" | "RCC">("All");
  const [activeGrades, setActiveGrades] = useState<Set<string>>(() => new Set(allGrades));
  const [unit, setUnit] = useState<"m3" | "rm">("m3");

  const toggleGrade = (g: string) => {
    setActiveGrades(prev => {
      const n = new Set(prev);
      if (n.has(g)) { if (n.size > 1) n.delete(g); } else n.add(g);
      return n;
    });
  };

  const visible = elements.filter(e =>
    (typeFilter === "All" || e.concreteType === typeFilter) &&
    activeGrades.has(e.grade)
  );

  type NumericElemKey = "mat" | "batching" | "placing" | "formwork" | "curing" | "overhead" | "margin";
  const componentKeys: { key: NumericElemKey; label: string; color: string }[] = [
    { key: "mat", label: "Materials", color: "bg-blue-500" },
    { key: "batching", label: "Batching", color: "bg-violet-500" },
    { key: "placing", label: "Placing", color: "bg-indigo-500" },
    { key: "formwork", label: "Formwork", color: "bg-orange-400" },
    { key: "curing", label: "Curing", color: "bg-teal-500" },
    { key: "overhead", label: "Overhead", color: "bg-amber-500" },
    { key: "margin", label: "Margin", color: "bg-green-600" },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="px-5 py-4 flex flex-wrap gap-4 items-center">
          {/* Type */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 font-medium">Type:</span>
            {(["All", "PCC", "RCC"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${typeFilter === t ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-700 border-slate-300 hover:border-slate-500"}`}
              >{t}</button>
            ))}
          </div>
          {/* Grade toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-600 font-medium">Grade:</span>
            {allGrades.map(g => (
              <button
                key={g}
                onClick={() => toggleGrade(g)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${activeGrades.has(g) ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-500 border-slate-300"}`}
              >{g}</button>
            ))}
          </div>
          {/* Unit */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-600 font-medium">Show as:</span>
            {([["m3", "₹/m³"], ["rm", "₹/RM"]] as const).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setUnit(val)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${unit === val ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-700 border-slate-300 hover:border-slate-500"}`}
              >{lbl}</button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Element cards */}
      {visible.length === 0 ? (
        <Card><CardContent className="px-5 py-6 text-center text-slate-500 text-sm">No elements match the current filters.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map(el => {
            const mult = unit === "rm" ? el.m3perRm : 1;
            const total = el.total * mult;
            return (
              <Card key={el.key} className="overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-5 bg-slate-50 dark:bg-slate-800/50 border-b flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100">{el.label}</CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">{el.concreteType} · {el.grade} · {el.m3perRm.toFixed(3)} m³/RM · {el.totalM3.toFixed(1)} m³ total</p>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-blue-700">{fmtR(total)}</div>
                    <div className="text-[10px] text-slate-500">{unit === "rm" ? "per RM" : "per m³"}</div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 py-3 space-y-1.5">
                  {/* Progress bar */}
                  <div className="flex h-3 rounded-full overflow-hidden mb-3">
                    {componentKeys.filter(c => (el[c.key] as number) > 0).map(c => {
                      const pct = ((el[c.key] as number) / el.total) * 100;
                      return <div key={c.key} className={`${c.color}`} style={{ width: `${pct}%` }} title={`${c.label}: ${pct.toFixed(0)}%`} />;
                    })}
                  </div>
                  {/* Component rows */}
                  <table className="w-full text-xs">
                    <tbody>
                      {componentKeys.map(c => {
                        const raw = el[c.key] as number;
                        if (raw <= 0) return null;
                        const val = raw * mult;
                        const pct = (raw / el.total) * 100;
                        return (
                          <tr key={c.key}>
                            <td className="py-0.5 flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-sm inline-block ${c.color}`} />
                              {c.label}
                            </td>
                            <td className="py-0.5 text-right font-mono text-slate-700">{fmtR(val)}</td>
                            <td className="py-0.5 text-right text-slate-400 pl-3">{pct.toFixed(0)}%</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-slate-200 font-semibold">
                        <td className="pt-1.5">Total (pre-esc)</td>
                        <td className="pt-1.5 text-right font-mono text-blue-700">{fmtR(total)}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                  {totalLength > 0 && unit === "rm" && (
                    <p className="text-[10px] text-slate-500 pt-1">× {totalLength.toFixed(0)} m drain length = {fmtR(total * totalLength)}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConcreteCalculator() {
  const { toast } = useToast();
  const role = readEstimatorRole();
  const canEdit = role === "admin";

  const [s, setS] = useState<CalcState>(loadState);
  const [activeMainTab, setActiveMainTab] = useState(() => {
    try { return localStorage.getItem("cc_active_tab") ?? "calculator"; } catch { return "calculator"; }
  });
  const [activeAnalysisTab, setActiveAnalysisTab] = useState("price-impact");
  const [activeReportPill, setActiveReportPill] = useState("per-metre");
  const [expandedQuotRows, setExpandedQuotRows] = useState<Set<string>>(new Set());
  function toggleQuotRow(id: string) {
    setExpandedQuotRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
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
  const [breakdownGrade, setBreakdownGrade] = useState(() => s.grade);
  const [breakdownIsPcc, setBreakdownIsPcc] = useState(false);
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
      <div className="help-panel mx-4 mb-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-slate-800 overflow-hidden" data-testid={`help-panel-${id}`}>
        <div className="px-4 py-2.5 bg-blue-100 border-b border-blue-200">
          <span className="font-semibold text-blue-900 text-sm uppercase tracking-wide">{title} — Guide</span>
        </div>
        <div className="px-4 py-3 space-y-1.5">{children}</div>
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
          setBreakdownGrade(loaded.grade ?? DEFAULT_STATE.grade);
          setBreakdownIsPcc(false);
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
  const bbsSummary = useMemo(() => computeBBSSummary(s.bbsRows, s.steelRates, qtoCtxForBBS, s.supplyBarLengthM ?? 12), [s.bbsRows, s.steelRates, qtoCtxForBBS, s.supplyBarLengthM]);
  const steelMatCostPerM3 = useMemo(() => s.totalVolume > 0 ? bbsSummary.totalCost / s.totalVolume : 0, [bbsSummary.totalCost, s.totalVolume]);
  // Fabrication cost per m³ — only added to internal cost when petty contractor does NOT handle BBS
  const steelFabPerM3 = useMemo(() => {
    if (!s.steelFabRatePerMT || s.steelFabRatePerMT <= 0 || s.totalVolume <= 0) return 0;
    if (s.pettyLabour.enabled && s.pettyLabour.contractorBBS) return 0;
    return (bbsSummary.totalKg / 1000) * s.steelFabRatePerMT / s.totalVolume;
  }, [s.steelFabRatePerMT, s.pettyLabour.enabled, s.pettyLabour.contractorBBS, bbsSummary.totalKg, s.totalVolume]);
  const steelCostPerM3 = useMemo(() => steelMatCostPerM3 + steelFabPerM3, [steelMatCostPerM3, steelFabPerM3]);

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
  // Used by ALL margin computations so they stay consistent with clientOfferedRateMode
  const effectiveClientRatePerM3 = useMemo(() => {
    if (s.clientOfferedRateMode === "per_rm" && crossSectionM2 > 0) return s.clientOfferedRate / crossSectionM2;
    return s.clientOfferedRate;
  }, [s.clientOfferedRate, s.clientOfferedRateMode, crossSectionM2]);

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
    // PCC: proper rate from scratch — material + batching + pccPlacingRate + curing + OH + margin
    const isPettyRm = s.pettyLabour.enabled && s.pettyLabour.rateUnit === "per_rm";
    const pccPlacing = isPettyRm ? 0 : (s.pccPlacingRatePerM3 ?? 0);
    const pccCostPerM3 = computePccRatePerM3(s, eq.pcc, pccPlacing);
    const gratingPerM = s.qto.gratingsSpacing > 0 ? s.qto.gratingRatePerNos / s.qto.gratingsSpacing : 0;
    const weepholePerM = s.qto.weepholesSpacing > 0 ? s.qto.weepholeRatePerNos / s.qto.weepholesSpacing : 0;
    const steelRateAvg = bbsSummary.totalKg > 0 ? bbsSummary.totalCost / (bbsSummary.totalKg / 1000) : s.steelRates.r12;
    const steelFabForAllIn = (s.pettyLabour.enabled && s.pettyLabour.contractorBBS) ? 0 : (s.steelFabRatePerMT ?? 0);
    const steelPerM = bbsSummary.totalKgPerM * ((steelRateAvg + steelFabForAllIn) / 1000);
    const bwPerM = bbsSummary.totalKgPerM * ((s.qto.bindingWireKgPerMT ?? 10) / 1000) * (s.qto.bindingWireRatePerKg ?? 85);
    const lhPerM = (s.qto.liftingHookSpacingM ?? 0) > 0 ? (s.qto.liftingHookRatePerNos ?? 150) / (s.qto.liftingHookSpacingM ?? 2) : 0;
    const excavPerM = qtoResult.excavVolume * s.qto.excavationRate / qtoResult.totalLength;
    const backfillPerM = qtoResult.backfillVol * s.qto.backfillRate / qtoResult.totalLength;
    const avgNetWallPerM = qtoResult.totalWallsNet / qtoResult.totalLength * wallCostPerM3;
    const netTopSlabPerM = qtoResult.totalTopNet / qtoResult.totalLength * topSlabCostPerM3;
    return (qtoResult.pccPerM * pccCostPerM3) + (qtoResult.invertPerM * invertCostPerM3) +
      avgNetWallPerM + netTopSlabPerM + gratingPerM + weepholePerM + steelPerM + bwPerM + excavPerM + backfillPerM + lhPerM;
  }, [isDrainType, qtoResult, costs, s, bbsSummary]);

  // Element-level cost breakdown for Element Summary table and Rate Analysis report
  const elementCostBreakdown = useMemo(() => {
    if (!isDrainType || !qtoResult || qtoResult.totalLength <= 0) return null;
    const eq = s.qto.elementGrades ?? { pcc: "M15", invert: "M25", wall: "M25", topSlab: "M25" };
    const rccBaseRate = costs.totalWithEsc - costs.steel;
    const baseMat = computeMaterialCostOnly(s.grade, s);
    const invertCostPerM3 = rccBaseRate - baseMat + computeMaterialCostOnly(eq.invert, s);
    const wallCostPerM3 = rccBaseRate - baseMat + computeMaterialCostOnly(eq.wall, s);
    const tsM = s.qto.topSlabThick / 1000;
    const topSlabCostPerM3 = (s.qto.topSlabType === "Precast" && tsM > 0)
      ? s.qto.precastRatePerM2 / tsM
      : rccBaseRate - baseMat + computeMaterialCostOnly(eq.topSlab, s);
    // PCC: proper rate from scratch
    const isPettyRm = s.pettyLabour.enabled && s.pettyLabour.rateUnit === "per_rm";
    const pccPlacing = isPettyRm ? 0 : (s.pccPlacingRatePerM3 ?? 0);
    const pccCostPerM3 = computePccRatePerM3(s, eq.pcc, pccPlacing);
    // Derive PCC component breakdown from scratch for display
    const pccMix = MIX_PRESETS[eq.pcc] ?? MIX_PRESETS["M15"];
    const pccState: CalcState = { ...s, mix: pccMix, wastage: { ...s.wastage, steelCuttingWaste: false } };
    const rawPcc = computeCosts(pccState, 0);
    const pccDirect = rawPcc.cement + rawPcc.ca + rawPcc.fa + rawPcc.admix + rawPcc.batching + pccPlacing + rawPcc.curing + rawPcc.labour + rawPcc.wastage;
    const pccOH = pccDirect * (s.overheadPct / 100);
    const pccMg = (pccDirect + pccOH) * (s.marginPct / 100);
    const matBase = (grade: string) => computeMaterialCostOnly(grade, s);
    // RCC component fractions (from base rate, proportional approach)
    const batchPct = costs.batching / (rccBaseRate || 1);
    const placePct = costs.placement / (rccBaseRate || 1);
    const formworkPct = costs.formwork / (rccBaseRate || 1);
    const curingPct = costs.curing / (rccBaseRate || 1);
    const ohPct = costs.overhead / (rccBaseRate || 1);
    const mgPct = costs.margin / (rccBaseRate || 1);
    const rccElem = (total: number, mat: number) => ({
      mat, batching: total * batchPct, placing: total * placePct,
      formwork: total * formworkPct, curing: total * curingPct,
      overhead: total * ohPct, margin: total * mgPct, total,
    });
    return {
      pcc: {
        grade: eq.pcc, concreteType: "PCC" as const, m3perRm: qtoResult.pccPerM, totalM3: qtoResult.totalPCC,
        mat: rawPcc.cement + rawPcc.ca + rawPcc.fa + rawPcc.admix,
        batching: rawPcc.batching, placing: pccPlacing, formwork: 0,
        curing: rawPcc.curing, overhead: pccOH, margin: pccMg, total: pccCostPerM3,
      },
      invert: {
        grade: eq.invert, concreteType: "RCC" as const, m3perRm: qtoResult.invertPerM, totalM3: qtoResult.totalInvert,
        ...rccElem(invertCostPerM3, matBase(eq.invert)),
      },
      wall: {
        grade: eq.wall, concreteType: "RCC" as const,
        m3perRm: qtoResult.totalWallsNet / qtoResult.totalLength, totalM3: qtoResult.totalWallsNet,
        ...rccElem(wallCostPerM3, matBase(eq.wall)),
      },
      topSlab: showTopSlab ? {
        grade: eq.topSlab, concreteType: "RCC" as const,
        m3perRm: qtoResult.totalTopNet / qtoResult.totalLength, totalM3: qtoResult.totalTopNet,
        ...rccElem(topSlabCostPerM3, matBase(eq.topSlab)),
      } : null,
    };
  }, [isDrainType, qtoResult, costs, s, showTopSlab]);

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
    update({ boqItems: [...s.boqItems, { id: uid(), description: nextDesc, qty: 1, unit: "m³", dimL: 0, dimW: 0, dimD: 0, rate: costs.totalWithEsc }] });
  }

  function updateBOQItem(id: string, patch: Partial<BOQItem>) {
    update({ boqItems: s.boqItems.map((r) => r.id === id ? { ...r, ...patch } : r) });
  }

  function removeBOQItem(id: string) {
    update({ boqItems: s.boqItems.filter((r) => r.id !== id) });
  }

  function addBBSRow() {
    update({ bbsRows: [...s.bbsRows, { id: uid(), mark: `B${s.bbsRows.length + 1}`, dia: 12, shape: "Straight", count: 1, cutLength: 0.920, overlapN: 0, element: "Invert-Bottom", zoneId: "all", countBasis: "spacing" as const, spacingMm: 200, hookMm: 0 }] });
  }

  function updateBBSRow(id: string, patch: Partial<BBSRow>) {
    update({ bbsRows: s.bbsRows.map((r) => r.id === id ? { ...r, ...patch } : r) });
  }

  function removeBBSRow(id: string) {
    update({ bbsRows: s.bbsRows.filter((r) => r.id !== id) });
  }

  function applyGradePreset(grade: string) {
    const preset = MIX_PRESETS[grade];
    if (!s.mixLocked && preset) update({ grade, mix: { ...preset } });
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

    // PCC rate: RCC base − steel already removed above; also remove formwork + placement (PCC has no shuttering and no contractor placing)
    const pccMatCost = computeMaterialCostOnly(eq.pcc, s);
    const pccRatePerM3 = Math.max(0, rccBaseRate - costs.formwork - costs.placement - baseMat + pccMatCost);

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
    const steelMatRateAvg = bbsSummary.totalKg > 0 ? bbsSummary.totalCost / (bbsSummary.totalKg / 1000) : s.steelRates.r12;
    // For BOQ quoting: always include fabrication rate (even if covered by petty contractor internally)
    const steelBOQRate = Math.round(steelMatRateAvg + (s.steelFabRatePerMT ?? 0));
    // Always produce exactly 7 items in the standard client BOQ order
    return [
      // 1. Earthwork — L×W×D populated from QTO geometry
      { id: uid(), description: "Earthwork Excavation in Foundation Trenches incl. disposal", qty: parseFloat((r.excavVolume).toFixed(2)), unit: "Cum", dimL: 0, dimW: 0, dimD: 0, rate: q.excavationRate },
      // 2. PCC bed — pre-computed volume
      { id: uid(), description: `${eq.pcc} PCC in Foundation, ${q.pccDepth}mm thick (${q.pccOffset}mm offset each side)`, qty: parseFloat((r.totalLength * r.pccWidth * (q.pccDepth / 1000)).toFixed(2)), unit: "Cum", dimL: 0, dimW: 0, dimD: 0, rate: Math.round(pccRatePerM3) },
      // 3. RCC — combined at blended element-grade rate
      { id: uid(), description: `${rccLabel} in Raft Foundation, Both Side Walls${showTopSlab ? " & Top Slab" : ""} incl. Centering, Shuttering & Vibration`, qty: parseFloat(r.totalRCC.toFixed(2)), unit: "Cum", dimL: 0, dimW: 0, dimD: 0, rate: Math.round(blendedRCCRate) },
      // 4. HYSD reinforcement — material + fabrication (all-in client rate)
      { id: uid(), description: "HYSD Bar Reinforcements of Various Dia incl. Cutting, Bending & Placing in Position", qty: steelMT, unit: "MT", dimL: 0, dimW: 0, dimD: 0, rate: steelBOQRate },
      // 5. Gratings
      { id: uid(), description: `Supply & Fixing MS Grating ${q.gratingOpeningW ?? 200}×${q.gratingOpeningD ?? 100}mm Opening @ ${q.gratingsSpacing}m c/c`, qty: r.gratingsCount, unit: "No's", dimL: 0, dimW: 0, dimD: 0, rate: q.gratingRatePerNos },
      // 6. Weepholes
      { id: uid(), description: `Supply & Fixing Weepholes ${q.weepholeDiaMm ?? 100}mm dia @ ${q.weepholesSpacing}m c/c interval`, qty: r.weepholesCount, unit: "No's", dimL: 0, dimW: 0, dimD: 0, rate: q.weepholeRatePerNos },
      // 7. Lifting Hooks
      { id: uid(), description: `Supply & Fixing Lifting Hooks ${q.liftingHookDia ?? 12}φ @ ${q.liftingHookSpacingM ?? 2}m c/c`, qty: r.liftingHooksCount, unit: "No's", dimL: 0, dimW: 0, dimD: 0, rate: q.liftingHookRatePerNos ?? 150 },
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
      dimL: 0, dimW: 0, dimD: 0, rate: 0,
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
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
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
      <Card className="mb-5 bg-gradient-to-r from-blue-950 to-slate-900 text-white border-none print:hidden">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              { label: "Raw Materials", val: costs.cement + costs.ca + costs.fa + costs.admix },
              { label: "Steel", val: costs.steel },
              { label: "Plant, Labour & Formwork", val: costs.batching + costs.placement + costs.formwork + costs.labour + costs.curing },
              { label: "Overhead + Margin", val: costs.wastage + costs.overhead + costs.margin },
            ].map((item) => (
              <div key={item.label} className="bg-white/10 rounded-lg px-3 py-2">
                <div className="text-blue-200 mb-1 font-medium">{item.label}</div>
                <div className="font-bold text-base">{fmtR(item.val)}</div>
                {crossSectionM2 > 0 && <div className="text-xs text-blue-300/80 mt-0.5">{fmtR(item.val * crossSectionM2)}/RM</div>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Main tabs ── */}
      <Tabs value={activeMainTab} onValueChange={(v) => { setActiveMainTab(v); try { localStorage.setItem("cc_active_tab", v); } catch {} }}>
        <TabsList className="mb-4">
          <TabsTrigger value="calculator" data-testid="tab-calculator">Calculator</TabsTrigger>
          <TabsTrigger value="bbs" data-testid="tab-bbs">BBS & Wastage</TabsTrigger>
          <TabsTrigger value="qto-boq" data-testid="tab-qto-boq"><Building2 className="w-3.5 h-3.5 mr-1" />Dimensions & QTO</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <FileUp className="w-3.5 h-3.5 mr-1" />Reports
          </TabsTrigger>
          <TabsTrigger value="analysis" data-testid="tab-analysis">
            <TrendingUp className="w-3.5 h-3.5 mr-1" />Analysis
          </TabsTrigger>
        </TabsList>

        {/* ══════════════ TAB 1: CALCULATOR ══════════════ */}
        <TabsContent value="calculator">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Left column: sections 1-8 */}
            <div className="lg:col-span-3 space-y-5">

              {/* Section ①: Project Info */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">① Project Info</CardTitle>
                  <HelpBtn id="proj-info" />
                </CardHeader>
                <HelpPanel id="proj-info" title="① Project Info">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Estimate Name</b> — label that appears in the saved estimates list</li>
                <li><b>Contractor</b> — name used for identification in the estimate</li>
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
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">② Concrete Mix Design (IS:456)</CardTitle>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => update({ mixLocked: !s.mixLocked })}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${s.mixLocked ? "bg-amber-100 border-amber-300 text-amber-700" : "border-border text-muted-foreground hover:border-primary"}`}
                      title={s.mixLocked ? "Mix locked — grade change will not reset values. Click to unlock." : "Mix unlocked — grade change resets values to IS preset. Click to lock."}
                    >
                      {s.mixLocked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
                      <span className="hidden sm:inline">{s.mixLocked ? "Locked" : "Lock Mix"}</span>
                    </button>
                    <HelpBtn id="mix-design" />
                  </div>
                </CardHeader>
                <HelpPanel id="mix-design" title="② Mix Design">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li>Auto-filled from Grade selection using IS:456/IS:10262 codal quantities — all values are editable</li>
                <li><b>Lock Mix</b> — when locked (amber), changing the grade will NOT reset these values. Useful when you have a custom mix design from a lab report.</li>
                <li><b>Cement kg/m³</b> — drives the ₹/m³ cement cost (quantity × price per 50 kg bag)</li>
                <li><b>Coarse Agg kg/m³</b> — total CA weight; split across 20mm/10mm/6mm tabs by proportion</li>
                <li><b>Fine Agg kg/m³</b> — for natural sand, volume is increased by bulkage factor (set in Section ③)</li>
                <li><b>W/C Ratio</b> — informational only (not used in cost calculation)</li>
                <li><b>Admix %</b> — admixture dosage as % of cement weight; multiplied by rate ₹/L from Section ③</li>
                </ul>
              </HelpPanel>
                <CardContent className="px-5 pb-5">
                  <div className="flex items-end gap-4 mb-4 pb-4 border-b border-border/50">
                    <div>
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Concrete Grade</Label>
                      <Select value={s.grade} onValueChange={applyGradePreset}>
                        <SelectTrigger className="mt-1 h-9 text-sm w-28" data-testid="select-grade">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(MIX_PRESETS).map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1.5 max-w-xs">Selecting a grade auto-fills IS:456 quantities below. Lock the mix to prevent reset when grade changes.</p>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {numInput("Cement (kg/m³)", s.mix.cementKg, (v) => updateMix({ cementKg: v }), { testId: "input-cement-kg" })}
                    {numInput("Coarse Agg (kg/m³)", s.mix.caKg, (v) => updateMix({ caKg: v }))}
                    {numInput("Fine Agg (kg/m³)", s.mix.faKg, (v) => updateMix({ faKg: v }))}
                    {numInput("W/C Ratio", s.mix.wcRatio, (v) => updateMix({ wcRatio: v }), { step: 0.01 })}
                    {numInput("Admix %", s.mix.admixPct, (v) => updateMix({ admixPct: v }), { unit: "%", step: 0.05 })}
                  </div>
                  {s.mixLocked && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Mix locked — grade change will not reset these values
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Section ③: Raw Materials */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">③ Raw Materials</CardTitle>
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
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Cement</p>
                    <div className="flex items-end gap-4">
                      {numInput("Price per 50-kg bag", s.cementBagPrice, (v) => update({ cementBagPrice: v }), { unit: "₹/bag", testId: "input-cement-price" })}
                      <div className="pb-1 text-sm font-semibold text-slate-700 whitespace-nowrap">
                        → {fmtR((s.mix.cementKg / 50) * s.cementBagPrice)}/m³
                      </div>
                    </div>
                  </div>

                  {/* Coarse Aggregate — tabbed */}
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Coarse Aggregate</p>
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
                                    onFocus={(e) => e.target.select()}
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
                            <p className="text-sm text-slate-700 font-medium mt-2">
                              {fmtR(ratePerMT)}/MT{ratePerMT !== tab.purchaseRate ? " (normalized)" : ""} + freight <span className="text-slate-500">{fmtR(landed - ratePerMT)}/MT</span> = <strong>{fmtR(landed)}/MT</strong>
                            </p>
                          </TabsContent>
                        );
                      })}
                    </Tabs>
                  </div>

                  {/* Fine Aggregate */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Fine Aggregate</p>
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
                            onFocus={(e) => e.target.select()}
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
                    {(() => {
                      const faRatePerMT = aggRateToPerMT(s.faPurchaseRate, s.faUom ?? "per_cft");
                      const faFreightComp = s.faLeadKm * 2 * s.faFreightRate / Math.max(1, s.faPayload);
                      const faLandedMT = faRatePerMT + faFreightComp;
                      return (
                        <p className="text-sm text-slate-700 font-medium mt-2">
                          {fmtR(faRatePerMT)}/MT{faRatePerMT !== s.faPurchaseRate ? " (normalized)" : ""} + freight <span className="text-slate-500">{fmtR(faFreightComp)}/MT</span> = <strong>{fmtR(faLandedMT)}/MT</strong>
                        </p>
                      );
                    })()}
                    {s.faType === "natural" && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <Info className="w-3 h-3" /> Bulkage adds {fmtPct(s.faBulkagePct)} to effective FA volume → +{fmtR(costs.fa * s.faBulkagePct / 100 / (1 + s.faBulkagePct / 100))}/m³ impact
                      </p>
                    )}
                  </div>

                  {/* Admixture */}
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Admixture</p>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <Checkbox
                          checked={s.includeAdmix !== false}
                          onCheckedChange={(v) => update({ includeAdmix: !!v })}
                          className="h-3.5 w-3.5"
                          data-testid="chk-include-admix"
                        />
                        <span className="text-xs text-slate-500">Include in rate</span>
                      </label>
                    </div>
                    <div className={`grid grid-cols-3 gap-3 transition-opacity ${s.includeAdmix === false ? "opacity-50" : ""}`}>
                      {numInput("Dosage (L/m³)", s.admixDosage, (v) => update({ admixDosage: v }), { step: 0.05 })}
                      {numInput("Rate (₹/L)", s.admixRate, (v) => update({ admixRate: v }))}
                      <div className="flex items-end pb-1">
                        <span className="text-sm font-semibold text-slate-700">
                          → {s.includeAdmix === false ? <span className="line-through text-slate-400">{fmtR(s.admixDosage * s.admixRate)}/m³</span> : <>{fmtR(costs.admix)}/m³</>}
                        </span>
                      </div>
                    </div>
                    {s.includeAdmix === false && (
                      <p className="text-xs text-amber-600 mt-1">Admixture excluded from concrete rate — cost not included in totals</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Location Variants Card */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-violet-500" /> Location Variants — Rate Blender
                      <HelpBtn id="location-variants" />
                    </CardTitle>
                    <p className="text-sm text-slate-600 mt-1">Add different sourcing locations. Each overrides CA & FA rates/lead for that stretch. Weighted blend visible in Analysis → Rate Blender tab.</p>
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
                                onFocus={(e) => e.target.select()}
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
                            <p className="text-sm font-semibold text-slate-700 mb-2">CA Rates Override <span className="font-normal text-slate-600 dark:text-slate-400 text-xs">(proportions fixed from base mix design)</span></p>
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-sm" style={{ minWidth: 580 }}>
                                <thead>
                                  <tr className="bg-violet-100/60 text-slate-600">
                                    <th className="text-left p-2 font-medium text-sm">Size</th>
                                    <th className="text-left p-2 font-medium text-sm">Purchase Rate</th>
                                    <th className="text-left p-2 font-medium text-sm">UoM</th>
                                    <th className="text-left p-2 font-medium text-sm">Lead (km)</th>
                                    <th className="text-left p-2 font-medium text-sm">Freight (₹/MT/km)</th>
                                    <th className="text-left p-2 font-medium text-sm">Payload (MT)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(loc.caSources ?? []).map((src, i) => {
                                    const uom = src.uom ?? "per_mt";
                                    const labels = ["20mm", "10mm", "6mm"];
                                    const upd = (patch: Partial<CASourceOverride>) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, caSources: l.caSources.map((c, j) => j === i ? { ...c, ...patch } : c) } : l) });
                                    return (
                                      <tr key={i} className="border-t border-violet-100">
                                        <td className="p-2 font-semibold text-slate-700 whitespace-nowrap">{labels[i]} <span className="font-normal text-slate-600 dark:text-slate-400 text-xs">({s.caTabs[i]?.proportion ?? 0}%)</span></td>
                                        <td className="p-2"><Input type="number" step="any" min={0} value={src.purchaseRate}
                                          onFocus={(e) => e.target.select()}
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
                                          onFocus={(e) => e.target.select()}
                                          onChange={(e) => upd({ leadKm: parseFloat(e.target.value) || 0 })}
                                          className="h-8 text-sm w-20" data-testid={`input-loc-ca-lead-${loc.id}-${i}`} /></td>
                                        <td className="p-2"><Input type="number" step="0.5" min={0} value={src.freightRate}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(e) => upd({ freightRate: parseFloat(e.target.value) || 0 })}
                                          className="h-8 text-sm w-24" data-testid={`input-loc-ca-freight-${loc.id}-${i}`} /></td>
                                        <td className="p-2"><Input type="number" step="0.5" min={0.1} value={src.payload}
                                          onFocus={(e) => e.target.select()}
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
                                      onFocus={(e) => e.target.select()}
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
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, faOverride: { ...l.faOverride, leadKm: parseFloat(e.target.value) || 0 } } : l) })}
                                      className="h-8 text-sm w-20" data-testid={`input-loc-fa-lead-${loc.id}`} /></td>
                                    <td className="p-2"><Input type="number" step="0.5" min={0} value={loc.faOverride.freightRate}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, faOverride: { ...l.faOverride, freightRate: parseFloat(e.target.value) || 0 } } : l) })}
                                      className="h-8 text-sm w-24" data-testid={`input-loc-fa-freight-${loc.id}`} /></td>
                                    <td className="p-2"><Input type="number" step="0.5" min={0.1} value={loc.faOverride.payload}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => update({ locationVariants: (s.locationVariants ?? []).map(l => l.id === loc.id ? { ...l, faOverride: { ...l.faOverride, payload: parseFloat(e.target.value) || 1 } } : l) })}
                                      className="h-8 text-sm w-20" data-testid={`input-loc-fa-payload-${loc.id}`} /></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <p className="text-sm text-slate-700 font-medium mt-2 flex items-center gap-1">
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
                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">④ Batching Equipment</CardTitle>
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
                    <p className="text-sm text-slate-600">No equipment added. Click "Add Row" to add batching equipment.</p>
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
                                <div className="flex items-end pb-1 text-sm font-semibold text-slate-700">
                                  → {fmtR(row.output > 0 ? (row.depreciation + row.fuel + row.operator) / row.output : 0)}/m³
                                </div>
                              </>
                            ) : (
                              <>
                                {numInput("Hire Rate", row.hireRate, (v) => updateBatchingRow(row.id, { hireRate: v }))}
                                <div className="space-y-1">
                                  <Label className="text-sm font-medium text-slate-700">Rate Mode</Label>
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
                                <div className="flex items-end pb-1 text-sm font-semibold text-slate-700">
                                  → {fmtR(row.hireMode === "per_m3" ? row.hireRate : row.hireMode === "per_month" ? ((row.outputPerMonth ?? 0) > 0 ? row.hireRate / (row.outputPerMonth ?? 1) : 0) : (row.output > 0 ? row.hireRate / row.output : 0))}/m³
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      <p className="text-sm font-semibold text-slate-700">Total batching: {fmtR(costs.batching)}/m³</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Section ⑤: Placement */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">⑤ Concrete Placement</CardTitle>
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
                      <div className="flex items-end pb-1 text-sm font-semibold text-slate-700 col-span-3">
                        → {fmtR(costs.placement)}/m³ &nbsp;({fmtR(s.tmHirePerTrip * s.tmTripsPerDay)}/day total ÷ {s.placementOutputPerDay} m³/day)
                      </div>
                    </div>
                  ) : s.placementMode === "labour" ? (
                    <div className="grid grid-cols-3 gap-3">
                      {numInput("Labour Placement Rate (₹/m³)", s.placementRatePerDay, (v) => update({ placementRatePerDay: v }))}
                      <div className="flex items-end pb-1 text-sm font-semibold text-slate-700 col-span-2">→ {fmtR(costs.placement)}/m³ (direct rate)</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {numInput(`${s.placementMode === "own" ? "Operating Cost" : "Hire Rate"} (₹/day)`, s.placementRatePerDay, (v) => update({ placementRatePerDay: v }))}
                      {numInput("Output (m³/day)", s.placementOutputPerDay, (v) => update({ placementOutputPerDay: v }))}
                      <div className="flex items-end pb-1 text-sm font-semibold text-slate-700">→ {fmtR(costs.placement)}/m³</div>
                    </div>
                  )}
                  </div>

                  {/* Petty Labour Contract */}
                  <div className="mt-4 pt-4 border-t border-border/60">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Petty Labour Contract</p>
                        <p className="text-sm text-slate-600">Replaces pump/placement rate with an all-in contract rate</p>
                      </div>
                      <Switch checked={s.pettyLabour.enabled} onCheckedChange={(v) => update({ pettyLabour: { ...s.pettyLabour, enabled: v } })} data-testid="switch-petty-labour" />
                    </div>
                    {s.pettyLabour.enabled && (
                      <div className="mt-3 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex-1 min-w-[120px]">
                            <Label className="text-sm font-medium text-slate-700">Contract Rate</Label>
                            <Input type="number" value={s.pettyLabour.rateValue} onFocus={(e) => e.target.select()} onChange={(e) => update({ pettyLabour: { ...s.pettyLabour, rateValue: parseFloat(e.target.value) || 0 } })} className="h-9 text-sm mt-0.5" data-testid="input-petty-labour-rate" />
                          </div>
                          <div className="min-w-[90px]">
                            <Label className="text-sm font-medium text-slate-700">Unit</Label>
                            <Select value={s.pettyLabour.rateUnit} onValueChange={(v) => update({ pettyLabour: { ...s.pettyLabour, rateUnit: v as "per_m3" | "per_rm" } })}>
                              <SelectTrigger className="h-8 text-xs mt-0.5" data-testid="select-petty-labour-unit"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="per_m3">₹/m³</SelectItem>
                                <SelectItem value="per_rm">₹/RM</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end pb-1 text-sm font-semibold">
                            {s.pettyLabour.rateUnit === "per_rm" && crossSectionM2 <= 0
                              ? <span className="text-red-600">⚠ Enter QTO data (Height Zones) for RM conversion</span>
                              : <span className="text-amber-700">= {fmtR(pettyLabourRatePerM3 ?? 0)}/m³</span>}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Contractor's scope includes:</p>
                          <div className="flex flex-col gap-1.5">
                            {([
                              { key: "contractorFormwork" as const, label: "Formwork & Staging (bypasses ⑥ cost)" },
                              { key: "contractorBBS" as const, label: "Bar Bending & Fixing (informational — steel material cost still applies)" },
                            ]).map(({ key, label }) => (
                              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
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

                  {/* PCC Placing Rate — separate from RCC pump placement */}
                  {!(s.pettyLabour.enabled && s.pettyLabour.rateUnit === "per_rm") && (
                    <div className="mt-4 pt-4 border-t border-border/60">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">PCC Placing Rate</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        Labour/equipment cost for placing PCC (blinding concrete). Applied separately from RCC pump placement.
                        {s.pettyLabour.enabled && s.pettyLabour.rateUnit === "per_m3" && " (Petty labour contract covers RCC only — enter PCC placing separately.)"}
                      </p>
                      <div className="flex items-end gap-3 flex-wrap">
                        {numInput("PCC Placing Rate (₹/m³)", s.pccPlacingRatePerM3 ?? 0, (v) => update({ pccPlacingRatePerM3: v }), { testId: "input-pcc-placing-rate" })}
                        <div className="flex items-end pb-1 text-sm text-slate-600 dark:text-slate-400">
                          included in PCC ₹/m³ rate analysis
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Section ⑥: Formwork & Staging */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">⑥ Formwork & Staging</CardTitle>
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
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Shuttering System</p>
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
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Staging System</p>
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
                    <p className="text-sm text-slate-600 mt-1.5">Cost = Soffit Area (m²/m³) × Hire Rate (₹/m²/month) × Months. Applies only to horizontal/soffit surfaces (invert slab, deck, culvert roof).</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Total formwork + staging: {fmtR(costs.formwork)}/m³</p>
                  </div>
                </CardContent>
              </Card>

              {/* Section ⑦: Curing */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">⑦ Curing</CardTitle>
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
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Water Curing Mode</p>
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
                      <Label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Curing Compound</Label>
                    </div>
                    {s.curingCompoundEnabled && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-3">
                          {numInput("Rate (₹/L)", s.curingCompoundRate, (v) => update({ curingCompoundRate: v }))}
                          {numInput("Coverage (m²/L)", s.curingCompoundCoverage, (v) => update({ curingCompoundCoverage: v }))}
                          {numInput("Surface Area (m²/m³)", s.curingCompoundSurfaceArea, (v) => update({ curingCompoundSurfaceArea: v }), { step: 0.1 })}
                        </div>
                        {(() => {
                          if (!isDrainType || !qtoResult || qtoResult.totalLength <= 0) return null;
                          const span = s.qto.clearSpan / 1000;
                          const t = s.qto.wallThickness / 1000;
                          const overallW = span + 2 * t;
                          const rccPerM = qtoResult.totalRCC / qtoResult.totalLength;
                          const surfacePerM = span + 2 * qtoResult.avgWallH + 2 * t + (showTopSlab ? overallW : 0);
                          const autoVal = rccPerM > 0 ? parseFloat((surfacePerM / rccPerM).toFixed(2)) : 0;
                          if (autoVal <= 0) return null;
                          return (
                            <div className="flex items-center gap-2 text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span>Auto from QTO cross-section: <b>{autoVal} m²/m³</b> (invert + walls + top of walls{showTopSlab ? " + top slab soffit" : ""})</span>
                              <button className="ml-auto text-blue-600 font-semibold hover:underline whitespace-nowrap"
                                onClick={() => update({ curingCompoundSurfaceArea: autoVal })}>Use this</button>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Total curing: {fmtR(costs.curing)}/m³</p>
                </CardContent>
              </Card>

              {/* Section ⑧: Labour + Overhead & Margin */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">⑧ Labour, Overhead & Margin</CardTitle>
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
            <div className="lg:col-span-2">
              <div className="sticky top-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm font-semibold">Rate Breakdown</CardTitle>
                      <Select value={breakdownGrade} onValueChange={v => { setBreakdownGrade(v); setBreakdownIsPcc(false); }}>
                        <SelectTrigger className="h-6 text-xs w-20 border-slate-300" data-testid="select-breakdown-grade">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(MIX_PRESETS).map(g => (
                            <SelectItem key={g} value={g}>
                              {g}{g === s.grade ? " (Main)" : ""}
                              {g === s.qto.elementGrades?.pcc && g !== s.grade ? " (PCC)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => setBreakdownIsPcc(p => !p)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-medium transition-colors ${(breakdownIsPcc || s.qto.elementGrades?.pcc === breakdownGrade) ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-slate-50 border-slate-300 text-slate-500 hover:border-slate-400"}`}
                        title="Toggle PCC mode — hides steel, formwork and placement"
                        data-testid="btn-breakdown-pcc-toggle"
                      >
                        PCC
                      </button>
                    </div>
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
                        // ── Grade-aware cost recomputation ──────────────────────
                        // When the selected grade matches the main estimate grade, use s.mix
                        // (preserving any user edits/locked mix values). Otherwise use IS preset.
                        const bdMix = breakdownGrade === s.grade ? s.mix : (MIX_PRESETS[breakdownGrade] ?? s.mix);
                        const bdPccMode = breakdownIsPcc || (s.qto.elementGrades?.pcc === breakdownGrade);
                        const bdState: CalcState = {
                          ...s,
                          mix: bdMix,
                          ...(bdPccMode ? {
                            shutteringAreaPerM3: 0,
                            stagingAreaPerM3: 0,
                            // Zero placement across all four modes without changing placementMode:
                            // - own/hired/labour: placementRatePerDay=0 → rate/output = 0
                            // - transit_mixer: tmHirePerTrip=0 → 0*trips/output = 0
                            placementRatePerDay: 0,
                            tmHirePerTrip: 0,
                            labourRatePerM3: 0,
                            pettyLabour: { ...s.pettyLabour, enabled: false },
                            wastage: { ...s.wastage, steelCuttingWaste: false, formworkDamage: false },
                          } : {}),
                        };
                        const bdCosts = computeCosts(bdState, bdPccMode ? 0 : steelCostPerM3, undefined, undefined, bdPccMode ? undefined : pettyLabourRatePerM3);
                        const bdMaxBar = Math.max(bdCosts.cement, bdCosts.ca, bdCosts.fa, bdCosts.admix, bdCosts.batching, bdCosts.placement, bdCosts.formwork, bdCosts.labour, bdCosts.curing, bdCosts.steel, bdCosts.wastage, bdCosts.overhead, bdCosts.margin, 1);

                        const rm = (v: number) => crossSectionM2 > 0 ? ` · ${fmtR(v * crossSectionM2)}/RM` : "";
                        const rawMatTotal = bdCosts.cement + bdCosts.ca + bdCosts.fa + bdCosts.admix;
                        const plantTotal = bdCosts.batching + bdCosts.placement + bdCosts.formwork + bdCosts.labour + bdCosts.curing;
                        const directTotal = rawMatTotal + plantTotal + bdCosts.steel;
                        const ic = s.includedCosts ?? { cement: true, ca: true, fa: true, admix: true, batching: true, placement: true, formwork: true, labour: true, curing: true, steel: true, wastage: true, overhead: true, margin: true };
                        const toggleInc = (k: keyof IncludedCosts) => update({ includedCosts: { ...ic, [k]: !ic[k] } });

                        const usePettyLabel = pettyLabourRatePerM3 !== undefined && !bdPccMode;
                        const groups = [
                          {
                            label: "Raw Materials", color: "bg-amber-100 border-amber-200", textColor: "text-amber-800",
                            items: [
                              { label: "Cement", val: bdCosts.cement, color: "bg-amber-500", key: "cement" as keyof IncludedCosts },
                              { label: "Coarse Agg", val: bdCosts.ca, color: "bg-orange-400", key: "ca" as keyof IncludedCosts },
                              { label: "Fine Agg", val: bdCosts.fa, color: "bg-yellow-400", key: "fa" as keyof IncludedCosts },
                              { label: "Admixture", val: bdCosts.admix, color: "bg-purple-400", key: "admix" as keyof IncludedCosts },
                            ],
                            subtotal: rawMatTotal,
                          },
                          {
                            label: "Mixing, Placing & Curing", color: "bg-blue-50 border-blue-200", textColor: "text-blue-800",
                            items: usePettyLabel
                              ? [
                                  { label: "Batching", val: bdCosts.batching, color: "bg-blue-400", key: "batching" as keyof IncludedCosts },
                                  { label: "Petty Labour", val: bdCosts.placement, color: "bg-sky-400", key: "placement" as keyof IncludedCosts },
                                  ...(s.pettyLabour.contractorFormwork
                                    ? []
                                    : [{ label: "Formwork", val: bdCosts.formwork, color: "bg-teal-400", key: "formwork" as keyof IncludedCosts }]),
                                  { label: "Labour", val: bdCosts.labour, color: "bg-green-500", key: "labour" as keyof IncludedCosts },
                                  { label: "Curing", val: bdCosts.curing, color: "bg-cyan-400", key: "curing" as keyof IncludedCosts },
                                ]
                              : [
                                  { label: "Batching", val: bdCosts.batching, color: "bg-blue-400", key: "batching" as keyof IncludedCosts },
                                  { label: "Placement", val: bdCosts.placement, color: "bg-sky-400", key: "placement" as keyof IncludedCosts },
                                  { label: "Formwork", val: bdCosts.formwork, color: "bg-teal-400", key: "formwork" as keyof IncludedCosts },
                                  { label: "Labour", val: bdCosts.labour, color: "bg-green-500", key: "labour" as keyof IncludedCosts },
                                  { label: "Curing", val: bdCosts.curing, color: "bg-cyan-400", key: "curing" as keyof IncludedCosts },
                                ],
                            subtotal: plantTotal,
                          },
                          ...(!bdPccMode ? [{
                            label: "Steel", color: "bg-slate-100 border-slate-200", textColor: "text-slate-700",
                            items: [{ label: "Reinforcement", val: bdCosts.steel, color: "bg-slate-500", key: "steel" as keyof IncludedCosts }],
                            subtotal: bdCosts.steel,
                          }] : []),
                          {
                            label: "Wastage + Overhead + Margin", color: "bg-emerald-50 border-emerald-200", textColor: "text-emerald-800",
                            items: [
                              { label: "Wastage", val: bdCosts.wastage, color: "bg-red-300", key: "wastage" as keyof IncludedCosts },
                              { label: "Overhead", val: bdCosts.overhead, color: "bg-gray-400", key: "overhead" as keyof IncludedCosts },
                              { label: "Margin", val: bdCosts.margin, color: "bg-emerald-500", key: "margin" as keyof IncludedCosts },
                            ],
                            subtotal: bdCosts.wastage + bdCosts.overhead + bdCosts.margin,
                          },
                        ];
                        const allItems = groups.flatMap(g => g.items);
                        const selectedTotal = allItems.reduce((sum, item) => sum + (ic[item.key] ? item.val : 0), 0);
                        const anyUnchecked = allItems.some(item => !ic[item.key]);
                        const groupsBeforeWastage = bdPccMode ? 2 : 3;
                        return (
                          <>
                            {bdPccMode && (
                              <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-center gap-1">
                                <span className="font-medium">PCC mode</span> — steel, formwork & placement excluded; overhead &amp; margin recalculated on materials + batching + curing only.
                              </div>
                            )}
                            {groups.slice(0, groupsBeforeWastage).map(g => (
                              <div key={g.label} className={`rounded-lg border p-2 ${g.color}`}>
                                <div className={`flex justify-between items-center mb-1.5 font-semibold ${g.textColor}`}>
                                  <span>{g.label}</span>
                                  <span>{fmtR(g.subtotal)}/m³{rm(g.subtotal)}</span>
                                </div>
                                <div className="space-y-1">
                                  {g.items.filter(i => i.val > 0 || g.items.length === 1).map(item => (
                                    <div key={item.label} className="flex items-center gap-1.5">
                                      <Checkbox
                                        checked={ic[item.key]}
                                        onCheckedChange={() => toggleInc(item.key)}
                                        className="h-3 w-3 shrink-0"
                                        data-testid={`chk-inc-${item.key}`}
                                      />
                                      <div className="w-14 text-[11px] text-slate-600 font-medium shrink-0">{item.label}</div>
                                      <div className="flex-1 bg-white/60 rounded h-2 overflow-hidden">
                                        <div className={`h-full rounded ${item.color} ${ic[item.key] ? "opacity-100" : "opacity-30"}`} style={{ width: `${bdMaxBar > 0 ? (item.val / bdMaxBar) * 100 : 0}%` }} />
                                      </div>
                                      <div className={`w-14 text-right text-[11px] font-medium ${ic[item.key] ? "" : "line-through opacity-40"}`}>{fmtR(item.val)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                            <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 flex justify-between items-center">
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Direct Cost Sub-total</span>
                              <span className="text-sm font-bold text-slate-800">{fmtR(directTotal)}/m³{rm(directTotal)}</span>
                            </div>
                            {groups.slice(groupsBeforeWastage).map(g => (
                              <div key={g.label} className={`rounded-lg border p-2 ${g.color}`}>
                                <div className={`flex justify-between items-center mb-1.5 font-semibold ${g.textColor}`}>
                                  <span>{g.label}</span>
                                  <span>{fmtR(g.subtotal)}/m³{rm(g.subtotal)}</span>
                                </div>
                                <div className="space-y-1">
                                  {g.items.filter(i => i.val > 0 || g.items.length === 1).map(item => (
                                    <div key={item.label} className="flex items-center gap-1.5">
                                      <Checkbox
                                        checked={ic[item.key]}
                                        onCheckedChange={() => toggleInc(item.key)}
                                        className="h-3 w-3 shrink-0"
                                        data-testid={`chk-inc-${item.key}`}
                                      />
                                      <div className="w-14 text-[11px] text-slate-600 font-medium shrink-0">{item.label}</div>
                                      <div className="flex-1 bg-white/60 rounded h-2 overflow-hidden">
                                        <div className={`h-full rounded ${item.color} ${ic[item.key] ? "opacity-100" : "opacity-30"}`} style={{ width: `${bdMaxBar > 0 ? (item.val / bdMaxBar) * 100 : 0}%` }} />
                                      </div>
                                      <div className={`w-14 text-right text-[11px] font-medium ${ic[item.key] ? "" : "line-through opacity-40"}`}>{fmtR(item.val)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {anyUnchecked && (
                              <div className="flex justify-between items-center font-semibold text-violet-700 bg-violet-50 rounded px-2 py-1 border border-violet-200">
                                <span className="text-xs">Selected ₹/m³</span>
                                <span>{fmtR(selectedTotal)}{crossSectionM2 > 0 ? ` · ${fmtR(selectedTotal * crossSectionM2)}/RM` : ""}</span>
                              </div>
                            )}
                            <div className="border-t border-border pt-2 mt-1 space-y-1">
                              <div className="flex justify-between items-center font-bold">
                                <span>Total ₹/m³</span>
                                <span className="text-blue-700">{fmtR(bdCosts.total)}</span>
                              </div>
                              {crossSectionM2 > 0 && <div className="flex justify-between items-center text-slate-700 font-medium"><span>Total ₹/RM</span><span>{fmtR(bdCosts.total * crossSectionM2)}</span></div>}
                              {s.escalationPct > 0 && (
                                <div className="flex justify-between items-center text-slate-700 font-medium">
                                  <span>With esc. ({s.escalationPct}%)</span>
                                  <span className="font-semibold">{fmtR(bdCosts.totalWithEsc)}{crossSectionM2 > 0 ? ` · ${fmtR(bdCosts.totalWithEsc * crossSectionM2)}/RM` : ""}</span>
                                </div>
                              )}
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
                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Bar Bending Schedule (BBS)</CardTitle>
                    <p className="text-sm text-slate-600">Weight = Dia²/162 × Length; Hook (mm) is a direct input — default pre-filled from shape type</p>
                  </div>
                  <HelpBtn id="bbs" />
                </div>
                <Button size="sm" variant="outline" onClick={addBBSRow} className="h-7 text-xs" data-testid="btn-add-bbs">
                  <Plus className="w-3 h-3 mr-1" /> Add Bar
                </Button>
              </CardHeader>
              <HelpPanel id="bbs" title="Bar Bending Schedule">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Mark</b> — label (e.g. M1); <b>Dia</b> — nominal dia mm; <b>Shape</b> → sets default Hook (mm): Straight=0, U-bar=8d, L-bar=4d, Ring/Stirrup=18d. You can override the hook mm directly in the cell.</li>
                <li><b>Element</b> — structural element this bar belongs to (Invert/Wall/TopSlab etc.); <b>Zone</b> — height zone or All</li>
                <li><b>Count Basis</b> — <b>@Spacing</b>: enter bar spacing (mm) → count/m is auto-derived from element dimension ÷ spacing; <b>Manual</b>: enter absolute count</li>
                <li><b>Wt/m run (kg/m)</b> — weight of this bar row per metre of drain. For spacing mode: countPerM × unitLen × Dia²/162. For manual mode: total kg ÷ drain length</li>
                <li><b>Overlap N</b> — splice = N × dia. Default 50 per IS:456. Enter 0 if no splice needed</li>
                <li>Steel rates ₹/MT editable per dia below the table. Total steel cost feeds into Rate Summary (steel ₹/m³ = total cost ÷ volume)</li>
                </ul>
              </HelpPanel>
              <CardContent className="px-5 pb-5">
                {s.bbsRows.length === 0 ? (
                  <p className="text-sm text-slate-600">No bars added yet. Click "Add Bar".</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse min-w-[900px]">
                        <thead>
                          <tr className="bg-muted/40 text-slate-600 uppercase tracking-wide text-xs">
                            <th className="text-left p-2">Mark</th>
                            <th className="p-2">Dia</th>
                            <th className="p-2">Shape</th>
                            <th className="p-2">Element</th>
                            <th className="p-2">Zone</th>
                            <th className="p-2 text-center">Basis</th>
                            <th className="text-right p-2">Spacing/Count</th>
                            <th className="text-right p-2">Count/m</th>
                            <th className="text-right p-2">Cut (m)</th>
                            <th className="text-right p-2">Hook (mm)</th>
                            <th className="text-right p-2">Overlap N</th>
                            <th className="text-right p-2">Wt/m (kg/m)</th>
                            <th className="text-right p-2">Total kg</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.bbsRows.map((row) => {
                            // Hook allowance: direct mm if set, else default formula
                            const hook = row.shape === "Straight" ? 0
                              : row.hookMm !== undefined ? row.hookMm / 1000
                              : (HOOK_ALLOWANCE[row.shape] ? HOOK_ALLOWANCE[row.shape](row.dia, DEFAULT_HOOK_MULT) : 0);
                            // Computed auto hook for current dia + shape
                            const autoHookMm = row.shape === "Straight" ? 0
                              : Math.round((HOOK_ALLOWANCE[row.shape]?.(row.dia, DEFAULT_HOOK_MULT) ?? 0) * 1000);
                            const hookMmDisplay = row.hookMm !== undefined ? row.hookMm : autoHookMm;
                            // "auto" if hookMm matches computed value or is unset; "edited" if manually changed
                            const hookIsAuto = row.hookAuto !== false && (row.hookMm === undefined || row.hookMm === autoHookMm);
                            const overlapLen = (row.overlapN * row.dia) / 1000;
                            const unitLen = row.cutLength + hook + overlapLen; // for transverse/drain_len bars
                            const kgPerMBar = (row.dia * row.dia) / 162;
                            const basis = row.countBasis ?? "manual";
                            const dimType = ELEMENT_DIM_TYPE[row.element ?? "Manual"] ?? "manual";
                            const isAlongDrain = dimType === "along_drain";
                            const totalLength = qtoResult?.totalLength ?? 0;
                            const spanMm = s.qto.clearSpan + 2 * s.qto.wallThickness;
                            const avgWallHMm = s.qto.heightZones.length > 0 ? s.qto.heightZones.reduce((sum, z) => sum + z.height * z.length, 0) / Math.max(1, s.qto.heightZones.reduce((sum, z) => sum + z.length, 0)) : 0;
                            let countPerM = 0;
                            let rowKg = 0;
                            const globalSupplyLen = (s.supplyBarLengthM ?? 12) > 0 ? (s.supplyBarLengthM ?? 12) : 12;
                            if (basis === "spacing" && (row.spacingMm ?? 200) > 0) {
                              if (dimType === "span") {
                                countPerM = spanMm / (row.spacingMm ?? 200);
                                rowKg = unitLen * countPerM * kgPerMBar * totalLength;
                              } else if (dimType === "along_drain") {
                                // FIXED: each bar contributes 1m per metre of drain; overlap distributed over supply length
                                countPerM = spanMm / (row.spacingMm ?? 200);
                                const overlapPerBar = (row.overlapN * row.dia) / 1000;
                                const overlapFracPerM = overlapPerBar / globalSupplyLen;
                                const effectiveUnitLen = 1.0 + overlapFracPerM;
                                rowKg = countPerM * effectiveUnitLen * kgPerMBar * totalLength;
                              } else if (dimType === "drain_len") {
                                // Vertical bars SPACED along drain: count = 1000mm ÷ spacing
                                countPerM = 1000 / (row.spacingMm ?? 200);
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
                              <Fragment key={row.id}>
                              <tr className="border-t border-border/50" data-testid={`bbs-row-${row.id}`}>
                                <td className="p-1.5">
                                  <Input value={row.mark} onChange={(e) => updateBBSRow(row.id, { mark: e.target.value.toUpperCase() })} className="h-7 text-xs w-14 uppercase" />
                                </td>
                                <td className="p-1.5">
                                  <Select value={String(row.dia)} onValueChange={(v) => {
                                    const newDia = parseInt(v);
                                    const newAutoHook = row.shape === "Straight" ? 0 : Math.round((HOOK_ALLOWANCE[row.shape]?.(newDia, DEFAULT_HOOK_MULT) ?? 0) * 1000);
                                    // Auto-update hook if it was auto (not manually edited)
                                    const hookPatch = hookIsAuto ? { hookMm: newAutoHook, hookAuto: true } : {};
                                    updateBBSRow(row.id, { dia: newDia, ...hookPatch });
                                  }}>
                                    <SelectTrigger className="h-7 text-xs w-16"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {DIA_SIZES.map((d) => <SelectItem key={d} value={String(d)}>{d}mm</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-1.5">
                                  <Select value={row.shape} onValueChange={(v) => {
                                    const newHook = v === "Straight" ? 0 : Math.round((HOOK_ALLOWANCE[v]?.(row.dia, DEFAULT_HOOK_MULT) ?? 0) * 1000);
                                    updateBBSRow(row.id, { shape: v, hookMm: newHook, hookAuto: true });
                                  }}>
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
                                      {[
                                        "Invert-Bottom","Invert-Top","Invert-Longitudinal",
                                        "Wall-Earth","Wall-Inner","Wall-Vertical",
                                        "TopSlab-Bottom","TopSlab-Top","TopSlab-Longitudinal",
                                        "Dist/Tie","Lifting Hook","Manual"
                                      ].map(el => <SelectItem key={el} value={el}>{el}</SelectItem>)}
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
                                    <Input type="number" value={row.spacingMm ?? 200} onFocus={(e) => e.target.select()} onChange={(e) => updateBBSRow(row.id, { spacingMm: parseFloat(e.target.value) || 200 })} className="h-7 text-sm w-24 text-right" title="Bar spacing in mm" />
                                  ) : (
                                    <Input type="number" value={row.count} onFocus={(e) => e.target.select()} onChange={(e) => updateBBSRow(row.id, { count: parseInt(e.target.value) || 0 })} className="h-7 text-sm w-20 text-right" />
                                  )}
                                </td>
                                <td className="p-1.5 text-right text-slate-700 font-medium">{countPerM.toFixed(2)}/m</td>
                                <td className="p-1.5">
                                  <Input type="number" step="0.01" value={row.cutLength} onFocus={(e) => e.target.select()} onChange={(e) => updateBBSRow(row.id, { cutLength: parseFloat(e.target.value) || 0 })} className={`h-7 text-sm w-24 text-right ${isAlongDrain ? "opacity-40 cursor-not-allowed" : ""}`} disabled={isAlongDrain} title={isAlongDrain ? "Not used for along-drain bars — bars run full drain length" : "Cut length in metres"} />
                                </td>
                                <td className="p-1.5">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <Input
                                      type="number"
                                      step="1"
                                      min="0"
                                      value={hookMmDisplay}
                                      disabled={row.shape === "Straight"}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => updateBBSRow(row.id, { hookMm: parseFloat(e.target.value) || 0, hookAuto: false })}
                                      className="h-7 text-sm w-16 text-right disabled:opacity-40"
                                      title={row.shape === "Straight" ? "No hook for straight bars" : `Hook allowance in mm. Auto = ${autoHookMm}mm (IS formula). Edit to override for thickness constraints.`}
                                    />
                                    {row.shape !== "Straight" && (
                                      <span className={`text-[9px] leading-none px-1 rounded ${hookIsAuto ? "text-green-700 bg-green-50" : "text-amber-700 bg-amber-50"}`}>
                                        {hookIsAuto ? "auto" : "edited"}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-1.5">
                                  <Input type="number" value={row.overlapN} onFocus={(e) => e.target.select()} onChange={(e) => updateBBSRow(row.id, { overlapN: isNaN(parseInt(e.target.value)) ? row.overlapN : parseInt(e.target.value) })} className="h-7 text-sm w-16 text-right" title="N×dia overlap splice" />
                                </td>
                                <td className="p-1.5 text-right font-medium text-yellow-700">{kgPerM.toFixed(3)}</td>
                                <td className="p-1.5 text-right font-medium">{rowKg.toFixed(1)}</td>
                                <td className="p-1.5">
                                  <button onClick={() => removeBBSRow(row.id)} className="text-destructive hover:text-destructive/70"><Trash2 className="w-3.5 h-3.5" /></button>
                                </td>
                              </tr>
                              </Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                            <td colSpan={12} className="p-2 text-xs">Total Steel</td>
                            <td className="p-2 text-right text-xs text-yellow-700">
                              {bbsSummary.totalKgPerM.toFixed(3)} kg/m
                              {s.totalVolume > 0 && crossSectionM2 > 0 && (
                                <span className="ml-1 text-slate-500">({(bbsSummary.totalKgPerM / crossSectionM2).toFixed(1)} kg/m³)</span>
                              )}
                            </td>
                            <td className="p-2 text-right text-xs font-semibold">
                              {bbsSummary.totalKg.toFixed(1)} kg
                              {bbsSummary.totalKg >= 100 && (
                                <span className="ml-1 text-slate-600 dark:text-slate-400">({(bbsSummary.totalKg / 1000).toFixed(3)} MT)</span>
                              )}
                              {s.totalVolume > 0 && (
                                <span className="ml-1 text-slate-500 text-[10px]">= {(bbsSummary.totalKg / s.totalVolume).toFixed(1)} kg/m³</span>
                              )}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Steel rates per dia */}
                    <div className="mt-5">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Steel Rates per Diameter</p>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                        {DIA_SIZES.map((d) => {
                          const key = `r${d}` as keyof SteelRates;
                          const diaKg = bbsSummary.byDia[d]?.kg || 0;
                          return (
                            <div key={d} className="space-y-1">
                              <Label className="text-sm text-slate-700 font-medium">{d}mm ({(diaKg / 1000).toFixed(2)} MT)</Label>
                              <Input
                                type="number"
                                value={s.steelRates[key]}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => update({ steelRates: { ...s.steelRates, [key]: parseFloat(e.target.value) || 0 } })}
                                className="h-8 text-xs"
                                data-testid={`input-steel-rate-${d}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      {/* Standard Supply Bar Length */}
                      <div className="mt-4 flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Standard Supply Bar Length</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Length of TMT bars as supplied (m) — used to compute overlap splice cost for longitudinal bars</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={s.supplyBarLengthM ?? 12}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => update({ supplyBarLengthM: parseFloat(e.target.value) || 12 })}
                            className="h-8 text-sm w-20 text-right"
                            min="1"
                            step="0.5"
                            data-testid="input-supply-bar-length"
                          />
                          <span className="text-xs text-slate-500 whitespace-nowrap">m</span>
                        </div>
                      </div>

                      {/* Fabrication rate input */}
                      <div className="mt-4 p-3 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Fabrication Rate</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Cutting, bending & placing labour (₹/MT) — added to BOQ steel rate</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={s.steelFabRatePerMT || ""}
                              placeholder="e.g. 4000"
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => update({ steelFabRatePerMT: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-sm w-32 text-right"
                              data-testid="input-steel-fab-rate"
                            />
                            <span className="text-xs text-slate-500 whitespace-nowrap">₹/MT</span>
                          </div>
                        </div>
                        {s.pettyLabour.enabled && s.pettyLabour.contractorBBS && (
                          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
                            Petty contractor handles bar bending — fabrication cost already in contract rate. Rate entered here is for <b>client BOQ quoting only</b> and is not added to your internal cost.
                          </p>
                        )}
                      </div>

                      {/* Summary footer */}
                      <div className="mt-3 p-3 bg-muted/30 rounded-lg space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Total Steel: {(bbsSummary.totalKg / 1000).toFixed(3)} MT</span>
                          <span className="font-semibold">{fmtR(bbsSummary.totalCost)} material</span>
                        </div>
                        {s.steelFabRatePerMT > 0 && (
                          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                            <span>Fabrication: {fmtR(s.steelFabRatePerMT)}/MT × {(bbsSummary.totalKg / 1000).toFixed(3)} MT</span>
                            <span>{fmtR((bbsSummary.totalKg / 1000) * s.steelFabRatePerMT)}</span>
                          </div>
                        )}
                        {s.steelFabRatePerMT > 0 && (
                          <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 border-t border-border/50 pt-1 mt-1">
                            <span>All-in for BOQ: {fmtR((bbsSummary.totalKg > 0 ? bbsSummary.totalCost / (bbsSummary.totalKg / 1000) : 0) + s.steelFabRatePerMT)}/MT</span>
                            <span>{fmtR(bbsSummary.totalCost + (bbsSummary.totalKg / 1000) * s.steelFabRatePerMT)}</span>
                          </div>
                        )}
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-1">
                          Steel cost/m³ (internal): {fmtR(steelCostPerM3)} (÷ {s.totalVolume} m³)
                          {steelFabPerM3 > 0 && <span className="text-xs font-normal text-slate-500 ml-2">incl. fab ₹{fmtR(steelFabPerM3)}/m³</span>}
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
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Wastage & Risk Allowances</CardTitle>
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
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => item.pctField!.set(parseFloat(e.target.value) || 0)}
                              className="h-6 w-16 text-xs"
                              min={0}
                              max={100}
                            />
                          )}
                          {item.pctField && item.enabled && <span className="text-xs text-slate-600 dark:text-slate-400">%</span>}
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5">{item.desc}</p>
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
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Structure Dimensions</CardTitle>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">Dimensions drive volume calculations below. Structure type is set in ① Project Info (Calculator tab).</p>
                </div>
                <HelpBtn id="qto-boq" />
              </CardHeader>
              <HelpPanel id="qto-boq" title="QTO & BOQ">
                <ul className="space-y-1.5 list-disc list-outside ml-3">
                <li><b>Structure Dimensions</b> — wall thickness, slab thickness, clear span (all in mm); drives all QTO formulas</li>
                <li><b>Height Zones</b> — each zone has a wall height and road length. Total drain length = Σ zone lengths</li>
                <li><b>Volume Summary</b> — shows walls/invert/top slab/PCC per zone. "Apply to Calculator" sets Section ① total volume</li>
                <li><b>Per-Metre Rate Card &amp; Quotation</b> — now in the <b>Reports</b> tab (pill: Per Metre / Quotation)</li>
                <li><b>BOQ Estimator</b> — "Load Standard Drain BOQ" auto-generates 9-item BOQ from QTO volumes. Import Excel or Add Item manually</li>
                <li><b>Concrete Rates</b> (in Reports tab) — element-by-element cost breakdown per m³ (mat/batching/placing/curing/OH/margin)</li>
                <li><b>Rate vs Client Offer</b> — enter client's offered rate in Analysis tab to compute BOQ margin</li>
                </ul>
              </HelpPanel>
              <CardContent className="px-5 pb-5">
                {isDrainType && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {numInput("Clear Span (mm)", s.qto.clearSpan, v => updateQto({ clearSpan: v }))}
                      {/* Wall Thickness + inline grade */}
                      <div>
                        {numInput("Wall Thickness (mm)", s.qto.wallThickness, v => updateQto({ wallThickness: v }))}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[11px] text-slate-600 dark:text-slate-400 shrink-0">Wall Grade:</span>
                          <Select
                            value={s.qto.elementGrades?.wall ?? "M25"}
                            onValueChange={(v) => updateQto({ elementGrades: { ...(s.qto.elementGrades ?? { pcc:"M15", invert:"M25", wall:"M25", topSlab:"M25" }), wall: v } })}
                          >
                            <SelectTrigger className="h-6 text-xs flex-1 px-1.5"><SelectValue /></SelectTrigger>
                            <SelectContent>{["M10","M15","M20","M25","M30","M35","M40"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Invert Slab Thick + inline grade */}
                      <div>
                        {numInput("Invert Slab Thick (mm)", s.qto.invertSlabThick, v => updateQto({ invertSlabThick: v }))}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[11px] text-slate-600 dark:text-slate-400 shrink-0">Invert Grade:</span>
                          <Select
                            value={s.qto.elementGrades?.invert ?? "M25"}
                            onValueChange={(v) => updateQto({ elementGrades: { ...(s.qto.elementGrades ?? { pcc:"M15", invert:"M25", wall:"M25", topSlab:"M25" }), invert: v } })}
                          >
                            <SelectTrigger className="h-6 text-xs flex-1 px-1.5"><SelectValue /></SelectTrigger>
                            <SelectContent>{["M10","M15","M20","M25","M30","M35","M40"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* PCC Depth + inline grade */}
                      <div>
                        {numInput("PCC Depth (mm)", s.qto.pccDepth, v => updateQto({ pccDepth: v }))}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[11px] text-slate-600 dark:text-slate-400 shrink-0">PCC Grade:</span>
                          <Select
                            value={s.qto.elementGrades?.pcc ?? "M15"}
                            onValueChange={(v) => updateQto({ elementGrades: { ...(s.qto.elementGrades ?? { pcc:"M15", invert:"M25", wall:"M25", topSlab:"M25" }), pcc: v } })}
                          >
                            <SelectTrigger className="h-6 text-xs flex-1 px-1.5"><SelectValue /></SelectTrigger>
                            <SelectContent>{["M10","M15","M20","M25","M30","M35","M40"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
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
                            <div>
                              {numInput("Top Slab Thick (mm)", s.qto.topSlabThick, v => updateQto({ topSlabThick: v }))}
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[11px] text-slate-600 dark:text-slate-400 shrink-0">Slab Grade:</span>
                                <Select
                                  value={s.qto.elementGrades?.topSlab ?? "M25"}
                                  onValueChange={(v) => updateQto({ elementGrades: { ...(s.qto.elementGrades ?? { pcc:"M15", invert:"M25", wall:"M25", topSlab:"M25" }), topSlab: v } })}
                                >
                                  <SelectTrigger className="h-6 text-xs flex-1 px-1.5"><SelectValue /></SelectTrigger>
                                  <SelectContent>{["M10","M15","M20","M25","M30","M35","M40"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                            </div>
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
                    {isBoxCulvert && (
                      <div className="inline-block">
                        {numInput("Top Slab Thick (mm)", s.qto.topSlabThick, v => updateQto({ topSlabThick: v }))}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[11px] text-slate-600 dark:text-slate-400 shrink-0">Slab Grade:</span>
                          <Select
                            value={s.qto.elementGrades?.topSlab ?? "M25"}
                            onValueChange={(v) => updateQto({ elementGrades: { ...(s.qto.elementGrades ?? { pcc:"M15", invert:"M25", wall:"M25", topSlab:"M25" }), topSlab: v } })}
                          >
                            <SelectTrigger className="h-6 text-xs w-20 px-1.5"><SelectValue /></SelectTrigger>
                            <SelectContent>{["M10","M15","M20","M25","M30","M35","M40"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Height Zones (wall height per road-reach)</p>
                        <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="btn-add-height-zone"
                          onClick={() => updateQto({ heightZones: [...s.qto.heightZones, { id: uid(), label: `Zone ${s.qto.heightZones.length + 1}`, height: 1000, length: 100 }] })}>
                          <Plus className="w-3 h-3 mr-1" /> Add Zone
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted/40 text-slate-600 uppercase tracking-wide">
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
                                  <Input type="number" value={z.height} onFocus={(e) => e.target.select()} onChange={e => updateQto({ heightZones: s.qto.heightZones.map((hz, i) => i === zi ? { ...hz, height: parseFloat(e.target.value) || 0 } : hz) })} className="h-7 text-sm w-28 text-right" />
                                </td>
                                <td className="p-2 text-right">
                                  <Input type="number" value={z.length} onFocus={(e) => e.target.select()} onChange={e => updateQto({ heightZones: s.qto.heightZones.map((hz, i) => i === zi ? { ...hz, length: parseFloat(e.target.value) || 0 } : hz) })} className="h-7 text-sm w-28 text-right" />
                                </td>
                                <td className="p-2">
                                  <button onClick={() => updateQto({ heightZones: s.qto.heightZones.filter((_, i) => i !== zi) })} className="text-destructive hover:text-destructive/70" data-testid={`btn-remove-zone-${z.id}`}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-border bg-muted/20 font-semibold text-xs">
                              <td className="p-2">Total</td>
                              <td className="p-2 text-right text-slate-500">—</td>
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
                    {/* Stem Thickness + inline grade */}
                    <div>
                      {numInput("Stem Thickness (mm)", s.qto.bwStemThick, v => updateQto({ bwStemThick: v }))}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[11px] text-slate-600 dark:text-slate-400 shrink-0">Stem Grade:</span>
                        <Select
                          value={s.qto.elementGrades?.wall ?? "M25"}
                          onValueChange={(v) => updateQto({ elementGrades: { ...(s.qto.elementGrades ?? { pcc:"M15", invert:"M25", wall:"M25", topSlab:"M25" }), wall: v } })}
                        >
                          <SelectTrigger className="h-6 text-xs flex-1 px-1.5"><SelectValue /></SelectTrigger>
                          <SelectContent>{["M10","M15","M20","M25","M30","M35","M40"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    {numInput("Wall / Stem Height (mm)", s.qto.bwHeight, v => updateQto({ bwHeight: v }))}
                    {/* Footing Depth + inline grade */}
                    <div>
                      {numInput("Footing Depth (mm)", s.qto.bwFootingDepth, v => updateQto({ bwFootingDepth: v }))}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[11px] text-slate-600 dark:text-slate-400 shrink-0">Footing Grade:</span>
                        <Select
                          value={s.qto.elementGrades?.invert ?? "M25"}
                          onValueChange={(v) => updateQto({ elementGrades: { ...(s.qto.elementGrades ?? { pcc:"M15", invert:"M25", wall:"M25", topSlab:"M25" }), invert: v } })}
                        >
                          <SelectTrigger className="h-6 text-xs flex-1 px-1.5"><SelectValue /></SelectTrigger>
                          <SelectContent>{["M10","M15","M20","M25","M30","M35","M40"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {!isDrainType && !isBridgeType && (
                  <p className="text-sm text-slate-600 py-4 text-center">Select a structure type in ① Project Info (Calculator tab) to enable QTO.</p>
                )}
              </CardContent>
            </Card>

            {/* Volume Summary — Drain / Box Culvert */}
            {isDrainType && qtoResult && (
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-start justify-between gap-3 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Volume Summary</CardTitle>
                    <p className="text-sm text-slate-600 mt-0.5">Walls = 2·t·H·L | Invert/Top = (span+2t)·slab·L | PCC = (span+2t+2·offset)·d·L</p>
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
                        <tr className="bg-muted/40 text-slate-600 uppercase tracking-wide">
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
                            <td className="p-2 text-right text-slate-500">—</td>
                            {showTopSlab && <td className="p-2 text-right italic">−{qtoResult.deductGrating.toFixed(3)} (gratings)</td>}
                            <td className="p-2 text-right text-slate-500">—</td>
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
                      <p className="text-xs text-slate-600">Total RCC</p>
                      <p className="text-lg font-bold text-blue-700">{qtoResult.totalRCC.toFixed(2)} m³</p>
                    </div>
                    <div className="bg-stone-50 border border-stone-200 rounded-lg px-4 py-2">
                      <p className="text-xs text-slate-600">Total PCC</p>
                      <p className="text-lg font-bold">{qtoResult.totalPCC.toFixed(2)} m³</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
                      <p className="text-xs text-slate-600">Excavation (approx)</p>
                      <p className="text-lg font-bold text-orange-700">{qtoResult.excavVolume.toFixed(2)} m³</p>
                      <p className="text-xs text-slate-600">{qtoResult.excavWidth.toFixed(2)}m wide × avg {qtoResult.excavDepth.toFixed(2)}m deep</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                      <p className="text-xs text-slate-600">Backfill (approx)</p>
                      <p className="text-lg font-bold text-green-700">{qtoResult.backfillVol.toFixed(2)} m³</p>
                    </div>
                    {qtoResult.gratingsCount > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
                        <p className="text-xs text-slate-600">Gratings</p>
                        <p className="text-lg font-bold">{qtoResult.gratingsCount} nos</p>
                      </div>
                    )}
                    {qtoResult.weepholesCount > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
                        <p className="text-xs text-slate-600">Weepholes</p>
                        <p className="text-lg font-bold">{qtoResult.weepholesCount} nos</p>
                      </div>
                    )}
                  </div>
                  <button onClick={() => updateQto({ showFormulaRef: !s.qto.showFormulaRef })} className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {s.qto.showFormulaRef ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    How volumes are calculated
                  </button>
                  {s.qto.showFormulaRef && (
                    <div className="mt-2 p-3 bg-muted/30 rounded-lg text-xs space-y-0.5 text-slate-600 dark:text-slate-400 font-mono">
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
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Volume Summary (per metre run)</CardTitle>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                    onClick={() => { update({ totalVolume: parseFloat(bridgeQtoResult.totalRCCperM.toFixed(2)) }); toast({ title: "Volume updated (per m run)" }); }}>
                    Apply to Calculator
                  </Button>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div className="bg-muted/30 rounded-lg p-3"><p className="text-xs text-slate-600">Stem (per m run)</p><p className="text-base font-bold">{bridgeQtoResult.stemVol.toFixed(3)} m³/m</p></div>
                    <div className="bg-muted/30 rounded-lg p-3"><p className="text-xs text-slate-600">Base/Footing (per m)</p><p className="text-base font-bold">{bridgeQtoResult.baseVol.toFixed(3)} m³/m</p></div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3"><p className="text-xs text-slate-600">Total RCC (per m)</p><p className="text-base font-bold text-blue-700">{bridgeQtoResult.totalRCCperM.toFixed(3)} m³/m</p></div>
                  </div>
                </CardContent>
              </Card>
            )}


            {/* Earthwork & PCC Rates for BOQ */}
            {isDrainType && (
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Earthwork & Ancillary Rates</CardTitle>
                  <p className="text-sm text-slate-600 mt-0.5">Used when generating the Standard Drain BOQ and Per-Metre Rate Card.</p>
                </CardHeader>
                <CardContent className="px-5 pb-4 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {numInput("Excavation Rate (₹/m³)", s.qto.excavationRate, v => updateQto({ excavationRate: v }))}
                    {numInput("Backfill Rate (₹/m³)", s.qto.backfillRate, v => updateQto({ backfillRate: v }))}
                    {numInput("Grating Rate (₹/nos)", s.qto.gratingRatePerNos, v => updateQto({ gratingRatePerNos: v }))}
                    {numInput("Weephole Rate (₹/nos)", s.qto.weepholeRatePerNos, v => updateQto({ weepholeRatePerNos: v }))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">Opening Sizes (for void deductions & BOQ descriptions)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {numInput("Weephole Dia (mm)", s.qto.weepholeDiaMm ?? 100, v => updateQto({ weepholeDiaMm: v }))}
                      {numInput("Grating Opening W (mm)", s.qto.gratingOpeningW ?? 200, v => updateQto({ gratingOpeningW: v }))}
                      {numInput("Grating Opening D (mm)", s.qto.gratingOpeningD ?? 100, v => updateQto({ gratingOpeningD: v }))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">Binding Wire & Lifting Hooks</p>
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
                            <p className="text-sm text-slate-600">Computed Count</p>
                            <p className="font-bold text-sm">{lhCount} nos</p>
                            <p className="text-sm font-semibold text-slate-700">{fmtR(lhRm)}/RM</p>
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
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">BOQ Estimator</CardTitle>
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
                  <p><b>Quantities:</b> For Standard Drain BOQ, RCC and earthwork quantities come from QTO dimensions above. For Excel import, Description / Unit / Qty are read — rates must be entered manually.</p>
                  <p><b>Rate (₹/unit):</b> Your estimated cost rate. For margin analysis against client's offered rate, go to the Analysis → Rate vs Client Offer tab.</p>
                </div>
                {boqOverwriteConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setBoqOverwriteConfirm(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">Replace existing BOQ?</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">This will replace {s.boqItems.length} existing item(s) with the standard drain BOQ generated from your QTO dimensions. This cannot be undone.</p>
                        </div>
                      </div>
                      <div className="flex gap-3 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setBoqOverwriteConfirm(false)}>Cancel</Button>
                        <Button size="sm" onClick={() => { update({ boqItems: buildStandardDrainBOQ() }); setBoqOverwriteConfirm(false); }}>Replace</Button>
                      </div>
                    </div>
                  </div>
                )}
                {xlsxPreview && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                    <p className="text-sm font-semibold text-blue-800">Excel Import — Map Columns ({xlsxPreview.rows.length} rows detected)</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(["colDesc", "colUnit", "colQty"] as const).map((key, li) => (
                        <div key={key}>
                          <Label className="text-xs text-slate-600 dark:text-slate-400">{["Description", "Unit", "Qty"][li]} Column</Label>
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
                  <p className="text-sm text-slate-600">{isDrainType && qtoResult ? 'Use "Load Standard Drain BOQ" to auto-generate from QTO dimensions above, or click "Add Item" to add manually.' : 'Click "Add Item" to add BOQ items.'}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted/40 text-slate-600 uppercase tracking-wide">
                          <th className="text-left p-2 font-semibold w-6">#</th>
                          <th className="text-left p-2 font-semibold">Description</th>
                          <th className="text-right p-2 font-semibold">Qty</th>
                          <th className="text-right p-2 font-semibold">Unit</th>
                          <th className="text-right p-2 font-semibold">Rate (₹)</th>
                          <th className="text-right p-2 font-semibold">Amount</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.boqItems.map((item, idx) => {
                          const qty = boqVol(item);
                          const amount = qty * item.rate;
                          return (
                            <tr key={item.id} className="border-t border-border/50" data-testid={`boq-row-${item.id}`}>
                              <td className="p-2 text-slate-500 tabular-nums">{idx + 1}</td>
                              <td className="p-2">
                                <div className="space-y-0.5">
                                  <Input value={item.description} onChange={(e) => updateBOQItem(item.id, { description: e.target.value.toUpperCase() })} className="h-8 text-xs w-64 uppercase" />
                                  {(() => { const cat = getBOQCategory(item.description); return cat ? <Badge variant="outline" className={`text-[10px] px-1 py-0 ${BOQ_CAT_COLORS[cat]}`}>{cat}</Badge> : null; })()}
                                </div>
                              </td>
                              <td className="p-2 text-right">
                                <Input type="number" value={qty} onFocus={(e) => e.target.select()} onChange={(e) => updateBOQItem(item.id, { qty: parseFloat(e.target.value) || 0, dimL: 0, dimW: 0, dimD: 0 })} className="h-8 text-sm w-24 text-right" />
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
                              <td className="p-2 text-right">
                                <Input type="number" value={item.rate} onFocus={(e) => e.target.select()} onChange={(e) => updateBOQItem(item.id, { rate: parseFloat(e.target.value) || 0 })} className="h-8 text-sm w-28 text-right" />
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
                          <td className="p-2 text-xs" colSpan={5}>Grand Total</td>
                          <td className="p-2 text-right text-xs">{fmtR(boqTotalAmt)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>


          </div>
        </TabsContent>

        {/* ══════════════ TAB: REPORTS ══════════════ */}
        <TabsContent value="reports">
          {/* Pill selector */}
          <div className="flex gap-2 flex-wrap mb-5">
            {([
              { id: "concrete-rates", label: "Concrete Rates" },
              { id: "steel-rates", label: "Steel Rates" },
              { id: "rate-analysis", label: "Rate Analysis" },
              { id: "per-metre", label: "Per Metre" },
              { id: "boq", label: "BOQ" },
              { id: "quotation", label: "Quotation" },
            ] as const).map(p => (
              <button
                key={p.id}
                data-testid={`pill-report-${p.id}`}
                onClick={() => setActiveReportPill(p.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  activeReportPill === p.id
                    ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
                    : "bg-white text-slate-700 border-slate-300 hover:border-slate-500 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-600"
                }`}
              >{p.label}</button>
            ))}
          </div>

          {/* ── Concrete Rates ── */}
          {activeReportPill === "concrete-rates" && (() => {
            // Build a component-by-component cost table for each relevant grade
            // Rows per spec: Cement/CA/FA/Admix → Raw Mats sub-total; Batching/Placement/Formwork/Curing
            // (+ Labour if petty-labour active) → Plant sub-total; Wastage (when > 0); Direct; OH; Margin; Total
            function buildConcGradeTable(grade: string, withFormworkPlacement: boolean, costsForGrade: CostBreakdown) {
              const rawMat = costsForGrade.cement + costsForGrade.ca + costsForGrade.fa + costsForGrade.admix;
              const plantBase = costsForGrade.batching + (withFormworkPlacement ? costsForGrade.placement : 0) + (withFormworkPlacement ? costsForGrade.formwork : 0) + costsForGrade.curing + costsForGrade.labour;
              const plantSub = plantBase;
              const direct = rawMat + plantSub + costsForGrade.wastage;
              const tableRows: { label: string; val: number; isSub?: boolean; indent?: boolean; bold?: boolean }[] = [
                { label: "Cement", val: costsForGrade.cement, indent: true },
                { label: "Coarse Aggregate", val: costsForGrade.ca, indent: true },
                { label: "Fine Aggregate", val: costsForGrade.fa, indent: true },
                { label: "Admixture", val: costsForGrade.admix, indent: true },
                { label: "Raw Materials Sub-total", val: rawMat, isSub: true },
                { label: "Batching", val: costsForGrade.batching, indent: true },
                { label: "Placement", val: withFormworkPlacement ? costsForGrade.placement : 0, indent: true },
                ...(costsForGrade.labour > 0 ? [{ label: "Petty Labour", val: costsForGrade.labour, indent: true }] : []),
                { label: "Formwork & Staging", val: withFormworkPlacement ? costsForGrade.formwork : 0, indent: true },
                { label: "Curing", val: costsForGrade.curing, indent: true },
                { label: "Plant & Placing Sub-total", val: plantSub, isSub: true },
                ...(costsForGrade.wastage > 0 ? [{ label: "Wastage (Sand/Cement/Curing/Formwork)", val: costsForGrade.wastage, indent: true }] : []),
                { label: "Direct Cost Sub-total", val: direct, isSub: true, bold: true },
                { label: `Overhead (${s.overheadPct}%)`, val: costsForGrade.overhead, indent: true },
                { label: `Margin (${s.marginPct}%)`, val: costsForGrade.margin, indent: true },
                { label: `Total ₹/m³ (${grade})`, val: costsForGrade.total, isSub: true, bold: true },
              ];
              return tableRows;
            }

            // Main grade costs — recompute from scratch with steel forced to 0 and steel-cutting-waste disabled
            // This ensures overhead and margin are derived from a concrete-only direct base (no steel contamination)
            const sNoSteel: CalcState = { ...s, wastage: { ...s.wastage, steelCuttingWaste: false } };
            const mainCosts = computeCosts(sNoSteel, 0, undefined, undefined, pettyLabourRatePerM3);
            const mainRows = buildConcGradeTable(s.grade, true, mainCosts);

            // PCC grade (only if pccDepth > 0)
            const hasPCC = (s.qto?.pccDepth ?? 0) > 0;
            const pccGrade = s.qto?.elementGrades?.pcc ?? "M15";
            let pccCosts: CostBreakdown | null = null;
            if (hasPCC) {
              // Use the canonical PCC rate computation (bottom-up, includes pccPlacingRate, no formwork, no steel)
              const pccPlacing = (s.pettyLabour.enabled && s.pettyLabour.rateUnit === "per_rm") ? 0 : (s.pccPlacingRatePerM3 ?? 0);
              // Build a detailed cost breakdown for display — reuse the PCC material/batching cost path
              const pccMix = MIX_PRESETS[pccGrade] ?? MIX_PRESETS["M15"];
              const pccState: CalcState = { ...s, mix: pccMix, wastage: { ...s.wastage, steelCuttingWaste: false } };
              const rawPcc = computeCosts(pccState, 0);
              const pccDirect = rawPcc.cement + rawPcc.ca + rawPcc.fa + rawPcc.admix + rawPcc.batching + pccPlacing + rawPcc.curing + rawPcc.labour + rawPcc.wastage;
              const pccOH = pccDirect * (s.overheadPct / 100);
              const pccMg = (pccDirect + pccOH) * (s.marginPct / 100);
              const pccTotal = pccDirect + pccOH + pccMg;
              pccCosts = {
                ...rawPcc,
                placement: pccPlacing,
                formwork: 0,
                overhead: pccOH,
                margin: pccMg,
                total: pccTotal,
                totalWithEsc: pccTotal * (1 + s.escalationPct / 100)
              };
            }
            const pccRows = pccCosts ? buildConcGradeTable(pccGrade, false, pccCosts) : [];

            const renderTable = (rows: { label: string; val: number; isSub?: boolean; indent?: boolean; bold?: boolean }[]) => (
              <table className="text-xs w-full border-separate border-spacing-0 mt-2">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60">
                    <th className="text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200">Component</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200">₹ / m³</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const lastRow = rows[rows.length - 1];
                    const pct = lastRow.val > 0 ? (r.val / lastRow.val) * 100 : 0;
                    return (
                      <tr key={i} className={r.bold ? "bg-blue-50/80 dark:bg-blue-900/15 font-bold" : r.isSub ? "bg-slate-100 dark:bg-slate-700/40 font-semibold" : (i % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-slate-50/40 dark:bg-slate-800/20")}>
                        <td className={`px-3 py-1.5 ${r.indent ? "pl-6 text-slate-700 dark:text-slate-300" : ""}`}>{r.label}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.val > 0 ? fmtR(r.val) : "—"}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{r.isSub && r.val > 0 ? `${pct.toFixed(0)}%` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );

            return (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl flex flex-row items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Concrete Rate Analysis — {s.grade}</CardTitle>
                      <p className="text-xs text-slate-600 mt-0.5">Full cost breakdown (materials, plant, overhead, margin) for the active concrete grade.</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs print:hidden" onClick={() => window.print()}>Print</Button>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {renderTable(mainRows)}
                  </CardContent>
                </Card>
                {hasPCC && pccRows.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                      <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">PCC Bed — {pccGrade}</CardTitle>
                      <p className="text-xs text-slate-600 mt-0.5">PCC rate excludes formwork and placement — blinding coat only.</p>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {renderTable(pccRows)}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

          {/* ── Steel Rates ── */}
          {activeReportPill === "steel-rates" && (() => {
            const steelFabForCard = s.steelFabRatePerMT ?? 0;
            const fabIsBOQOnly = s.pettyLabour?.enabled && s.pettyLabour?.contractorBBS;
            const diaRows = ([8, 10, 12, 16, 20, 25] as const).map(dia => {
              const key = `r${dia}` as keyof SteelRates;
              const purchaseRate = s.steelRates[key];
              const bbsKg = bbsSummary.byDia[dia]?.kg ?? 0;
              const purchCost = bbsKg * purchaseRate / 1000;
              const fabCost = bbsKg * steelFabForCard / 1000;
              const totalCost = purchCost + fabCost;
              return { dia, purchaseRate, bbsKg, purchCost, fabCost, totalCost };
            });
            const totalBBSKg = bbsSummary.totalKg;
            const totalPurchCost = bbsSummary.totalCost;
            const totalFabCost = steelFabForCard * totalBBSKg / 1000;
            const avgPurchasePerMT = totalBBSKg > 0 ? totalPurchCost / (totalBBSKg / 1000) : 0;
            const kgPerM3 = s.totalVolume > 0 ? totalBBSKg / s.totalVolume : 0;

            // Structured analysis ₹/MT and ₹/m³
            const wasteEnabled = s.wastage.steelCuttingWaste && totalBBSKg > 0;
            const directSteelPerMT = avgPurchasePerMT + steelFabForCard;
            const wastePerMT = wasteEnabled ? directSteelPerMT * (s.wastage.steelCuttingPct / 100) : 0;
            const directWastePerMT = directSteelPerMT + wastePerMT;
            const overheadPerMT = directWastePerMT * (s.overheadPct / 100);
            const marginPerMT = (directWastePerMT + overheadPerMT) * (s.marginPct / 100);
            const totalPerMT = directWastePerMT + overheadPerMT + marginPerMT;
            const toM3 = (perMT: number) => kgPerM3 > 0 ? perMT * kgPerM3 / 1000 : 0;

            const analysisRows: { lbl: string; perMT: number; perM3: number; isSub?: boolean; bold?: boolean }[] = [
              { lbl: `Weighted Avg Purchase (${totalBBSKg > 0 ? diaRows.filter(r => r.bbsKg > 0).length : 0} dia)`, perMT: avgPurchasePerMT, perM3: toM3(avgPurchasePerMT) },
              { lbl: `Fabrication (cutting/bending/placing)${fabIsBOQOnly ? " — BOQ rate only" : ""}`, perMT: steelFabForCard, perM3: toM3(steelFabForCard) },
              { lbl: "Direct Steel Sub-total", perMT: directSteelPerMT, perM3: toM3(directSteelPerMT), isSub: true },
              ...(wasteEnabled ? [{ lbl: `Cutting Wastage (${s.wastage.steelCuttingPct}%)`, perMT: wastePerMT, perM3: toM3(wastePerMT) }] : []),
              ...(wasteEnabled ? [{ lbl: "Direct + Wastage Sub-total", perMT: directWastePerMT, perM3: toM3(directWastePerMT), isSub: true }] : []),
              { lbl: `Overhead (${s.overheadPct}%)`, perMT: overheadPerMT, perM3: toM3(overheadPerMT) },
              { lbl: `Margin (${s.marginPct}%)`, perMT: marginPerMT, perM3: toM3(marginPerMT) },
              { lbl: "Total (incl. OH + Margin)", perMT: totalPerMT, perM3: toM3(totalPerMT), isSub: true, bold: true },
            ];

            return (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl flex flex-row items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Steel Rate Analysis</CardTitle>
                      <p className="text-xs text-slate-600 mt-0.5">Purchase rate + fabrication + wastage + OH + margin per diameter and summary.</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs print:hidden" onClick={() => window.print()}>Print</Button>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 overflow-x-auto">
                    <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-wide mb-2">Per Diameter — Purchase Cost</p>
                    <table className="text-xs w-full min-w-[540px] border-separate border-spacing-0 mb-5">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60">
                          {["Dia", "Purchase ₹/MT", "BBS Weight (kg)", "Purchase ₹", "Fab ₹/MT", "Fab ₹", "Total ₹", "Total ₹/m³"].map(h => (
                            <th key={h} className="text-right first:text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {diaRows.filter(r => r.bbsKg > 0).map((r, i) => (
                          <tr key={r.dia} className={i % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-slate-50/60 dark:bg-slate-800/20"}>
                            <td className="px-3 py-2 font-medium">Ø{r.dia}mm</td>
                            <td className="px-3 py-2 text-right">{fmtR(r.purchaseRate)}</td>
                            <td className="px-3 py-2 text-right">{r.bbsKg.toFixed(1)}</td>
                            <td className="px-3 py-2 text-right">{fmtR(r.purchCost)}</td>
                            <td className="px-3 py-2 text-right">{fmtR(steelFabForCard)}</td>
                            <td className="px-3 py-2 text-right">{fmtR(r.fabCost)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{fmtR(r.totalCost)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{kgPerM3 > 0 ? fmtR(r.totalCost / s.totalVolume) : "—"}</td>
                          </tr>
                        ))}
                        {totalBBSKg > 0 && (
                          <tr className="bg-slate-100 dark:bg-slate-700/40 font-bold">
                            <td className="px-3 py-2">Total</td>
                            <td className="px-3 py-2 text-right">{fmtR(avgPurchasePerMT)}/MT</td>
                            <td className="px-3 py-2 text-right">{totalBBSKg.toFixed(1)} kg</td>
                            <td className="px-3 py-2 text-right">{fmtR(totalPurchCost)}</td>
                            <td className="px-3 py-2 text-right">—</td>
                            <td className="px-3 py-2 text-right">{fmtR(totalFabCost)}</td>
                            <td className="px-3 py-2 text-right">{fmtR(totalPurchCost + totalFabCost)}</td>
                            <td className="px-3 py-2 text-right">{kgPerM3 > 0 ? fmtR((totalPurchCost + totalFabCost) / s.totalVolume) : "—"}</td>
                          </tr>
                        )}
                        {totalBBSKg === 0 && (
                          <tr><td colSpan={8} className="px-3 py-3 text-center text-slate-600">No BBS data — add bars in the BBS tab</td></tr>
                        )}
                      </tbody>
                    </table>

                    <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-wide mb-2">Rate Analysis — ₹/MT and ₹/m³</p>
                    <table className="text-xs w-full min-w-[360px] border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60">
                          {["Component", "₹ / MT", "₹ / m³"].map(h => (
                            <th key={h} className="text-right first:text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysisRows.map((r, i) => (
                          <tr key={i} className={r.bold ? "bg-blue-50/80 dark:bg-blue-900/15 font-bold" : r.isSub ? "bg-slate-100 dark:bg-slate-700/40 font-semibold" : (i % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-slate-50/40 dark:bg-slate-800/20")}>
                            <td className={`px-3 py-1.5 ${!r.isSub ? "pl-5" : ""}`}>{r.lbl}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{r.perMT > 0 ? fmtR(r.perMT) : "—"}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{r.perM3 > 0 ? fmtR(r.perM3) : (s.totalVolume > 0 ? "—" : "set volume")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {crossSectionM2 > 0 && totalBBSKg > 0 && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-slate-600">Steel kg/m</p>
                          <p className="font-bold">{bbsSummary.totalKgPerM.toFixed(2)} kg/m</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-slate-600">Steel ₹/m (all-in)</p>
                          <p className="font-bold">{fmtR(bbsSummary.totalKgPerM * totalPerMT / 1000)}/m</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-slate-600">Steel ₹/m³ (all-in)</p>
                          <p className="font-bold">{fmtR(toM3(totalPerMT))}/m³</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* ── Rate Analysis ── */}
          {activeReportPill === "rate-analysis" && (() => {
            const ecd = elementCostBreakdown;
            if (!ecd) {
              return (
                <Card>
                  <CardContent className="px-5 py-8 text-center text-slate-500">
                    <p>Rate Analysis requires QTO dimensions — enter them in the <b>Dimensions &amp; QTO</b> tab first.</p>
                  </CardContent>
                </Card>
              );
            }
            // Gather all elements into flat list
            const allElems = [
              { key: "pcc", label: "PCC (Blinding)", ...ecd.pcc },
              { key: "invert", label: "Invert", ...ecd.invert },
              { key: "wall", label: "Wall", ...ecd.wall },
              ...(ecd.topSlab ? [{ key: "topSlab", label: "Top Slab", ...ecd.topSlab }] : []),
            ];
            // Unique grades
            const allGrades = [...new Set(allElems.map(e => e.grade))];
            // Per-metre indicator
            const totalLen = qtoResult?.totalLength ?? 0;
            return (
              <RateAnalysisPill
                elements={allElems}
                allGrades={allGrades}
                totalLength={totalLen}
              />
            );
          })()}

          {/* ── Per Metre ── */}
          {activeReportPill === "per-metre" && (() => {
            if (!isDrainType || !qtoResult || qtoResult.zones.length === 0) {
              if (isBridgeType && bridgeQtoResult) {
                const bEq = s.qto.elementGrades ?? { pcc: "M15", invert: "M25", wall: "M25", topSlab: "M25" };
                const bRccBaseRate = costs.totalWithEsc - costs.steel;
                const bBaseMat = computeMaterialCostOnly(s.grade, s);
                const bStemCostPerM3 = bRccBaseRate - bBaseMat + computeMaterialCostOnly(bEq.wall, s);
                const bFootCostPerM3 = bRccBaseRate - bBaseMat + computeMaterialCostOnly(bEq.invert, s);
                const bConcretePerM = bridgeQtoResult.stemVol * bStemCostPerM3 + bridgeQtoResult.baseVol * bFootCostPerM3;
                return (
                  <Card>
                    <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl flex flex-row items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Per-Metre Rate Card</CardTitle>
                        <p className="text-xs text-slate-600 mt-0.5">RCC cost per linear metre of {s.structureType.toLowerCase()} (stem + footing).</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs print:hidden" onClick={() => window.print()}>Print</Button>
                    </CardHeader>
                    <CardContent className="px-5 pb-5">
                      <div className="border rounded-xl p-4 space-y-3 max-w-sm">
                        <div>
                          <p className="font-semibold text-sm">{s.structureType}</p>
                          <p className="text-sm text-slate-700 font-medium">Stem {bridgeQtoResult.stemVol.toFixed(3)} m³/m + Base {bridgeQtoResult.baseVol.toFixed(3)} m³/m</p>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Stem RCC {bEq.wall} ₹/m³</span>
                            <span className="font-medium">{fmtR(bStemCostPerM3)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Footing RCC {bEq.invert} ₹/m³</span>
                            <span className="font-medium">{fmtR(bFootCostPerM3)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Concrete ₹/m run</span>
                            <span className="font-medium">{fmtR(bConcretePerM)}</span>
                          </div>
                          {(() => {
                            const steelRateAvg2 = bbsSummary.totalKg > 0 ? bbsSummary.totalCost / (bbsSummary.totalKg / 1000) : s.steelRates.r12;
                            const steelFab2 = (s.pettyLabour.enabled && s.pettyLabour.contractorBBS) ? 0 : (s.steelFabRatePerMT ?? 0);
                            const steelPerM2 = bbsSummary.totalKgPerM * ((steelRateAvg2 + steelFab2) / 1000);
                            const totalPerM = bConcretePerM + steelPerM2;
                            return (
                              <>
                                {bbsSummary.totalKgPerM > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-slate-600">Steel ({bbsSummary.totalKgPerM.toFixed(2)} kg/m)</span>
                                    <span className="font-medium">{fmtR(steelPerM2)}/m</span>
                                  </div>
                                )}
                                <div className="flex justify-between font-bold border-t pt-1 mt-1">
                                  <span>Total ₹/m run</span>
                                  <span className="text-blue-700">{fmtR(totalPerM)}</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              return (
                <Card>
                  <CardContent className="px-5 py-8 text-center text-slate-500">
                    <p>Per-Metre Rate Card requires QTO dimensions to be entered in the Dimensions &amp; QTO tab.</p>
                  </CardContent>
                </Card>
              );
            }

            const eq = s.qto.elementGrades ?? { pcc: "M15", invert: "M25", wall: "M25", topSlab: "M25" };
            const rccBaseRate = costs.totalWithEsc - costs.steel;
            const baseMat = computeMaterialCostOnly(s.grade, s);
            const invertCostPerM3 = rccBaseRate - baseMat + computeMaterialCostOnly(eq.invert, s);
            const wallCostPerM3 = rccBaseRate - baseMat + computeMaterialCostOnly(eq.wall, s);
            const tsM = s.qto.topSlabThick / 1000;
            const topSlabCostPerM3 = (s.qto.topSlabType === "Precast" && tsM > 0)
              ? s.qto.precastRatePerM2 / tsM
              : rccBaseRate - baseMat + computeMaterialCostOnly(eq.topSlab, s);
            const isPettyRmPerM = s.pettyLabour.enabled && s.pettyLabour.rateUnit === "per_rm";
            const pccCostPerM3 = computePccRatePerM3(s, eq.pcc, isPettyRmPerM ? 0 : (s.pccPlacingRatePerM3 ?? 0));
            const steelRateAvg = bbsSummary.totalKg > 0 ? bbsSummary.totalCost / (bbsSummary.totalKg / 1000) : s.steelRates.r12;
            const steelFabForCard = (s.pettyLabour.enabled && s.pettyLabour.contractorBBS) ? 0 : (s.steelFabRatePerMT ?? 0);
            const bwPerM = bbsSummary.totalKgPerM * ((s.qto.bindingWireKgPerMT ?? 10) / 1000) * (s.qto.bindingWireRatePerKg ?? 85);
            const lhPerM = (s.qto.liftingHookSpacingM ?? 0) > 0 ? (s.qto.liftingHookRatePerNos ?? 150) / (s.qto.liftingHookSpacingM ?? 2) : 0;
            const steelPerM = bbsSummary.totalKgPerM * ((steelRateAvg + steelFabForCard) / 1000);
            const gratingPerM = s.qto.gratingsSpacing > 0 ? s.qto.gratingRatePerNos / s.qto.gratingsSpacing : 0;
            const weepholePerM = s.qto.weepholesSpacing > 0 ? s.qto.weepholeRatePerNos / s.qto.weepholesSpacing : 0;

            // Helper to render a per-metre table for given zone lengths
            // zoneWalls is gross for individual zones, net (after deductions) for the Combined row
            // topVolOverride allows the combined row to use net top slab quantity (after grating deduction)
            function renderPerMTable(zoneWalls: number, zoneTotalLen: number, zoneLabel: string, wallBasis: "gross" | "net" = "gross", topVolOverride?: number) {
              const wallVol = zoneTotalLen > 0 ? zoneWalls / zoneTotalLen : 0;
              const invertVol = qtoResult.invertPerM;
              const topVol = topVolOverride !== undefined ? topVolOverride : qtoResult.topPerM;
              const pccVol = qtoResult.pccPerM;
              const pccC = pccVol * pccCostPerM3;
              const invC = invertVol * invertCostPerM3;
              const wllC = wallVol * wallCostPerM3;
              const topC = topVol * topSlabCostPerM3;
              const concSub = pccC + invC + wllC + topC;
              const excVol = (qtoResult.totalLength > 0 && zoneTotalLen > 0) ? qtoResult.excavVolume / qtoResult.totalLength : 0;
              const bkfVol = (qtoResult.totalLength > 0 && zoneTotalLen > 0) ? qtoResult.backfillVol / qtoResult.totalLength : 0;
              const excC = excVol * s.qto.excavationRate;
              const bkfC = bkfVol * s.qto.backfillRate;
              const earthSub = excC + bkfC;
              const ancC = gratingPerM + weepholePerM;
              const grdTotal = concSub + earthSub + steelPerM + bwPerM + lhPerM + ancC;
              const steelKgPerM = bbsSummary.totalKgPerM;
              const steelMTPerM = steelKgPerM / 1000;
              const pMRows: { label: string; qty: string; unit: string; rate: string; costPerM: number; isSub?: boolean }[] = [
                { label: `PCC ${eq.pcc} Bed`, qty: pccVol.toFixed(3), unit: "m³/RM", rate: `${fmtR(pccCostPerM3)}/m³`, costPerM: pccC },
                { label: `Invert Slab (${eq.invert})`, qty: invertVol.toFixed(3), unit: "m³/RM", rate: `${fmtR(invertCostPerM3)}/m³`, costPerM: invC },
                { label: `Walls (${eq.wall}, ${wallBasis})`, qty: wallVol.toFixed(3), unit: "m³/RM", rate: `${fmtR(wallCostPerM3)}/m³`, costPerM: wllC },
                ...(s.qto.isCovered || isBoxCulvert ? [{ label: `Top Slab (${eq.topSlab})`, qty: topVol.toFixed(3), unit: "m³/RM", rate: `${fmtR(topSlabCostPerM3)}/m³`, costPerM: topC }] : []),
                { label: "Concrete Sub-total", qty: "", unit: "", rate: "", costPerM: concSub, isSub: true },
                { label: "Excavation", qty: excVol.toFixed(3), unit: "m³/RM", rate: `${fmtR(s.qto.excavationRate)}/m³`, costPerM: excC },
                { label: "Backfill", qty: bkfVol.toFixed(3), unit: "m³/RM", rate: `${fmtR(s.qto.backfillRate)}/m³`, costPerM: bkfC },
                { label: "Earthwork Sub-total", qty: "", unit: "", rate: "", costPerM: earthSub, isSub: true },
                { label: "Steel (BBS)", qty: steelMTPerM.toFixed(4), unit: "MT/RM", rate: `${fmtR(steelRateAvg + steelFabForCard)}/MT`, costPerM: steelPerM },
                ...(bwPerM > 0 ? [{ label: "Binding Wire", qty: "", unit: "", rate: "", costPerM: bwPerM }] : []),
                ...(lhPerM > 0 ? [{ label: "Lifting Hooks", qty: "", unit: "", rate: "", costPerM: lhPerM }] : []),
                ...(ancC > 0 ? [{ label: "Gratings & Weepholes", qty: "", unit: "", rate: "", costPerM: ancC }] : []),
                { label: "Grand Total ₹/RM", qty: "", unit: "", rate: "", costPerM: grdTotal, isSub: true },
              ];
              return (
                <div key={zoneLabel} className="mb-4">
                  {zoneLabel !== "Combined" && <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1 px-1">{zoneLabel}</p>}
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full min-w-[400px] border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60">
                          {["Item", "Qty / RM", "Unit", "Rate ₹ / unit", "₹ / RM"].map(h => (
                            <th key={h} className="text-right first:text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pMRows.map((r, ri) => (
                          <tr key={ri} className={r.isSub ? "bg-slate-100 dark:bg-slate-700/40 font-bold" : (ri % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-slate-50/40 dark:bg-slate-800/20")}>
                            <td className={`px-3 py-2 whitespace-nowrap ${r.isSub ? "pl-3" : "pl-6"}`}>{r.label}</td>
                            <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{r.qty}</td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 text-[11px]">{r.unit}</td>
                            <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{r.rate}</td>
                            <td className={`px-3 py-2 text-right ${r.isSub ? "text-blue-700 dark:text-blue-400 font-bold" : ""}`}>
                              {r.costPerM > 0 ? fmtR(r.costPerM) : (r.isSub ? fmtR(0) : "—")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg px-3 py-2 text-center">
                      <p className="text-[10px] text-blue-600">₹/RM</p>
                      <p className="text-base font-bold text-blue-800 dark:text-blue-300">{fmtR(grdTotal)}</p>
                    </div>
                    {zoneTotalLen > 0 && (
                      <div className="bg-slate-50 border rounded-lg px-3 py-2 text-center">
                        <p className="text-[10px] text-slate-600">{zoneTotalLen.toFixed(0)} m total</p>
                        <p className="text-base font-bold">{fmtR(grdTotal * zoneTotalLen)}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // Per-zone breakdown (only if multiple zones; always show combined)
            const hasMultiZone = qtoResult.zones.length > 1;

            return (
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl flex flex-row items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Per-Metre Rate Card</CardTitle>
                    <p className="text-xs text-slate-600 mt-0.5">All-in cost per running metre — concrete by element, earthwork, steel + ancillaries.</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs print:hidden" onClick={() => window.print()}>Print</Button>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {hasMultiZone && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Per Zone</p>
                      {qtoResult.zones.map(z => renderPerMTable(z.wallsM3, z.length, `${z.label} (${z.length} m)`, "gross"))}
                      <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-2">
                        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Combined ({qtoResult.totalLength.toFixed(0)} m)</p>
                        {renderPerMTable(qtoResult.totalWallsNet, qtoResult.totalLength, "Combined", "net", qtoResult.totalLength > 0 ? qtoResult.totalTopNet / qtoResult.totalLength : 0)}
                      </div>
                    </div>
                  )}
                  {!hasMultiZone && renderPerMTable(qtoResult.totalWallsNet, qtoResult.totalLength, "Combined", "net", qtoResult.totalLength > 0 ? qtoResult.totalTopNet / qtoResult.totalLength : 0)}
                </CardContent>
              </Card>
            );
          })()}

          {/* ── BOQ ── */}
          {activeReportPill === "boq" && (() => {
            const items = s.boqItems ?? [];
            if (items.length === 0) {
              return (
                <Card>
                  <CardContent className="px-5 py-8 text-center text-slate-600">
                    <p>No BOQ items yet. Add items in the Dimensions &amp; QTO tab.</p>
                  </CardContent>
                </Card>
              );
            }
            const grandTotal = items.reduce((sum, it) => sum + it.qty * it.rate, 0);
            return (
              <Card>
                <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                  <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">BOQ — Bill of Quantities</CardTitle>
                  <p className="text-xs text-slate-600 mt-0.5">{items.length} item(s) — our estimated rates.</p>
                </CardHeader>
                <CardContent className="px-4 pb-4 overflow-x-auto">
                  <table className="text-xs w-full min-w-[500px] border-separate border-spacing-0">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60">
                        {["#", "Description", "Unit", "Qty", "Rate (₹)", "Amount (₹)"].map(h => (
                          <th key={h} className="text-right first:text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={it.id} className={i % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-slate-50/60 dark:bg-slate-800/20"}>
                          <td className="px-3 py-2">{i + 1}</td>
                          <td className="px-3 py-2 max-w-[280px]">{it.description}</td>
                          <td className="px-3 py-2 text-right">{it.unit}</td>
                          <td className="px-3 py-2 text-right">{it.qty.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{fmtR(it.rate)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtR(it.qty * it.rate)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 dark:bg-slate-700/40 font-bold">
                        <td className="px-3 py-2" colSpan={5}>Grand Total</td>
                        <td className="px-3 py-2 text-right text-blue-700 dark:text-blue-400">{fmtR(grandTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })()}

          {/* ── Quotation ── */}
          {activeReportPill === "quotation" && (() => {
            const items = s.boqItems ?? [];
            if (items.length === 0) {
              return (
                <Card>
                  <CardContent className="px-5 py-8 text-center text-slate-600">
                    <p>No BOQ items yet. Add items in the Dimensions &amp; QTO tab, then enter client-offered rates here.</p>
                  </CardContent>
                </Card>
              );
            }
            const updateClientRate = (id: string, rate: number) => {
              update({ boqItems: s.boqItems.map(it => it.id === id ? { ...it, clientRate: rate } : it) });
            };
            const rows = items.map(it => {
              const ourCost = it.qty * it.rate;
              const clientRev = it.clientRate != null ? it.qty * it.clientRate : null;
              const marginAmt = clientRev != null ? clientRev - ourCost : null;
              const marginPct = clientRev != null && ourCost > 0 ? ((clientRev - ourCost) / clientRev) * 100 : null;
              return { ...it, ourCost, clientRev, marginAmt, marginPct };
            });
            const totalOurCost = rows.reduce((acc, r) => acc + r.ourCost, 0);
            const totalClientRev = rows.filter(r => r.clientRev != null).reduce((acc, r) => acc + (r.clientRev ?? 0), 0);
            const totalMargin = totalClientRev - rows.filter(r => r.clientRev != null).reduce((acc, r) => acc + r.ourCost, 0);
            const overallMarginPct = totalClientRev > 0 ? (totalMargin / totalClientRev) * 100 : 0;
            const badgeColor = (pct: number | null) => pct == null ? "" : pct >= 10 ? "bg-green-100 text-green-800" : pct >= 5 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";

            return (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl flex flex-row items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Quotation — Client Rate vs Our Cost</CardTitle>
                      <p className="text-xs text-slate-600 mt-0.5">Enter client's offered rate per item to compute margin.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs print:hidden" onClick={() => window.print()}>Print</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" data-testid="btn-export-quotation-excel"
                        onClick={async () => {
                          const XLSX = await import("xlsx");
                          const header = ["#", "Description", "Unit", "Qty", "Our Rate (₹)", "Our Amount (₹)", "Client Rate (₹)", "Client Revenue (₹)", "Margin (₹)", "Margin (%)"];
                          const dataRows = rows.map((r, i) => [
                            i + 1, r.description, r.unit, r.qty.toFixed(2),
                            r.rate, r.ourCost,
                            r.clientRate ?? "", r.clientRev ?? "",
                            r.marginAmt ?? "", r.marginPct != null ? `${r.marginPct.toFixed(1)}%` : "",
                          ]);
                          const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "Quotation");
                          XLSX.writeFile(wb, `quotation-${s.estimateName || "estimate"}.xlsx`);
                        }}>
                        <FileUp className="w-3 h-3 mr-1" /> Export Excel
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 overflow-x-auto">
                    {/* Print-only quotation header — hidden on screen, visible when printing */}
                    <div className="hidden print:block mb-6 pb-4 border-b-2 border-slate-800">
                      <p className="text-lg font-bold text-slate-900 uppercase tracking-widest">High Lane Constructions</p>
                      <p className="text-sm font-semibold text-slate-700 mt-1">QUOTATION</p>
                      <div className="flex gap-8 mt-2 text-xs text-slate-600">
                        <div><span className="font-semibold">Estimate: </span>{s.estimateName || "—"}</div>
                        <div><span className="font-semibold">Structure: </span>{s.structureType} ({s.grade})</div>
                        <div><span className="font-semibold">Prepared by: </span>{s.preparedBy || "—"}</div>
                        <div><span className="font-semibold">Date: </span>{s.date}</div>
                      </div>
                    </div>
                    <table className="text-xs w-full min-w-[500px] border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 print:bg-slate-100">
                          {["#", "Description", "Unit", "Qty", "Rate (₹)", "Amount (₹)"].map(h => (
                            <th key={h} className="text-right first:text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const isExpanded = expandedQuotRows.has(r.id);
                          // Per-item cost breakdown: detect item type from description and map to costs
                          const catType = getBOQCategory(r.description);
                          const itemCosts = (() => {
                            if (catType === "RCC" || catType === "PCC") {
                              const isPCC = catType === "PCC";
                              const grade = isPCC ? (s.qto?.elementGrades?.pcc ?? "M15") : s.grade;
                              let c: CostBreakdown;
                              if (isPCC) {
                                const pMix = MIX_PRESETS[grade] ?? MIX_PRESETS["M15"];
                                const pState: CalcState = { ...s, mix: pMix };
                                const raw = computeCosts(pState, 0);
                                const d2 = raw.cement + raw.ca + raw.fa + raw.admix + raw.batching + raw.curing;
                                const oh2 = d2 * (s.overheadPct / 100);
                                const mg2 = (d2 + oh2) * (s.marginPct / 100);
                                c = { ...raw, placement: 0, formwork: 0, overhead: oh2, margin: mg2, total: d2 + oh2 + mg2, totalWithEsc: 0 };
                              } else {
                                // RCC: use costs but exclude steel (steel is separate BOQ item)
                                const concrDirect = costs.cement + costs.ca + costs.fa + costs.admix + costs.batching + costs.placement + costs.formwork + costs.curing + costs.labour + costs.wastage;
                                const concrOH = concrDirect * (s.overheadPct / 100);
                                const concrMg = (concrDirect + concrOH) * (s.marginPct / 100);
                                c = { ...costs, steel: 0, overhead: concrOH, margin: concrMg, total: concrDirect + concrOH + concrMg, totalWithEsc: 0 };
                              }
                              const concrTotal = c.cement + c.ca + c.fa + c.admix + c.batching + c.placement + c.formwork + c.curing + c.labour + c.wastage + c.overhead + c.margin;
                              return [
                                { lbl: "Cement", val: c.cement * r.qty }, { lbl: "Coarse Aggregate", val: c.ca * r.qty },
                                { lbl: "Fine Aggregate", val: c.fa * r.qty }, { lbl: "Admixture", val: c.admix * r.qty },
                                { lbl: "Batching", val: c.batching * r.qty }, { lbl: "Placement", val: c.placement * r.qty },
                                { lbl: "Formwork", val: c.formwork * r.qty }, { lbl: "Curing", val: c.curing * r.qty },
                                { lbl: "Overhead", val: c.overhead * r.qty }, { lbl: "Margin", val: c.margin * r.qty },
                                { lbl: "Total", val: concrTotal * r.qty, isBold: true },
                              ];
                            }
                            if (catType === "Steel") {
                              const totalKg = bbsSummary.totalKg;
                              const purchCostAll = bbsSummary.totalCost;
                              const quotSteelFabRate = (s.pettyLabour?.enabled && s.pettyLabour?.contractorBBS) ? 0 : (s.steelFabRatePerMT ?? 0);
                              const fabCostAll = quotSteelFabRate * totalKg / 1000;
                              const directSteel = purchCostAll + fabCostAll;
                              const steelWaste = s.wastage.steelCuttingWaste ? directSteel * (s.wastage.steelCuttingPct / 100) : 0;
                              const steelDW = directSteel + steelWaste;
                              const steelOH = steelDW * (s.overheadPct / 100);
                              const steelMg = (steelDW + steelOH) * (s.marginPct / 100);
                              const steelTotal = steelDW + steelOH + steelMg;
                              const factor = steelTotal > 0 ? r.ourCost / steelTotal : 1;
                              return [
                                { lbl: "Purchase (BBS)", val: purchCostAll * factor },
                                { lbl: "Fabrication", val: fabCostAll * factor },
                                ...(steelWaste > 0 ? [{ lbl: `Cutting Wastage (${s.wastage.steelCuttingPct}%)`, val: steelWaste * factor }] : []),
                                { lbl: `Overhead (${s.overheadPct}%)`, val: steelOH * factor },
                                { lbl: `Margin (${s.marginPct}%)`, val: steelMg * factor },
                                { lbl: "Total", val: r.ourCost, isBold: true },
                              ];
                            }
                            if (catType === "Excavation") return [
                              { lbl: `${r.qty.toFixed(2)} ${r.unit} × ${fmtR(r.rate)}/${r.unit}`, val: r.ourCost, isBold: true },
                            ];
                            if (catType === "Backfill") return [
                              { lbl: `${r.qty.toFixed(2)} ${r.unit} × ${fmtR(r.rate)}/${r.unit}`, val: r.ourCost, isBold: true },
                            ];
                            return [{ lbl: "Our Cost", val: r.ourCost, isBold: true }];
                          })();
                          return (
                            <Fragment key={r.id}>
                              <tr
                                className={`cursor-pointer ${i % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-slate-50/60 dark:bg-slate-800/20"} hover:bg-blue-50/40 dark:hover:bg-blue-900/10`}
                                onClick={() => toggleQuotRow(r.id)}
                              >
                                <td className="px-3 py-2">
                                  <span className="inline-flex items-center gap-1">
                                    {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                                    {i + 1}
                                  </span>
                                </td>
                                <td className="px-3 py-2 max-w-[220px] truncate" title={r.description}>{r.description}</td>
                                <td className="px-3 py-2 text-right">{r.unit}</td>
                                <td className="px-3 py-2 text-right">{r.qty.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right">{fmtR(r.rate)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{fmtR(r.ourCost)}</td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-blue-50/30 dark:bg-blue-900/10">
                                  <td colSpan={6} className="px-6 py-3">
                                    <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-wide mb-2">Cost Breakdown — {r.description}</p>
                                    <div className="flex flex-wrap gap-2">
                                      {itemCosts.map((c, ci) => (
                                        <div key={ci} className={`rounded border px-2 py-1.5 text-center min-w-[100px] ${c.isBold ? "bg-slate-100 dark:bg-slate-700/60 border-slate-300" : "bg-white dark:bg-slate-800 border-slate-200"}`}>
                                          <p className="text-[10px] text-slate-600">{c.lbl}</p>
                                          <p className={`text-xs ${c.isBold ? "font-bold" : "font-medium"}`}>{c.val > 0 ? fmtR(c.val) : "—"}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                        <tr className="bg-slate-100 dark:bg-slate-700/40 font-bold">
                          <td className="px-3 py-2" colSpan={5}>Total</td>
                          <td className="px-3 py-2 text-right">{fmtR(totalOurCost)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            );
          })()}
        </TabsContent>

        {/* ══════════════ TAB 3: ANALYSIS ══════════════ */}
        <TabsContent value="analysis">
          <Tabs value={activeAnalysisTab} onValueChange={setActiveAnalysisTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="price-impact"><TrendingUp className="w-3.5 h-3.5 mr-1" />Price Impact</TabsTrigger>
              <TabsTrigger value="compare"><BarChart3 className="w-3.5 h-3.5 mr-1" />Compare Scenarios</TabsTrigger>
              <TabsTrigger value="rate-client-offer"><Target className="w-3.5 h-3.5 mr-1" />Rate vs Client Offer</TabsTrigger>
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
                        <p className="text-sm font-semibold text-slate-700 mb-1">Combined Impact</p>
                        <p className="text-2xl font-bold">{fmtR(revisedCosts.totalWithEsc)}/m³</p>
                        <p className="text-sm text-slate-700">
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
                              <p className="text-sm font-semibold text-slate-700">BOQ Margin</p>
                              <p className={`text-lg font-bold ${color}`}>{revisedMargin.toFixed(1)}%</p>
                              <p className="text-sm text-slate-600">Base: {baseMargin.toFixed(1)}%</p>
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
                            <span className="text-xs text-slate-500 w-4 text-right">{rank + 1}</span>
                            <div className="w-32 text-xs font-medium shrink-0">{v.label}</div>
                            <div className="w-32 text-xs text-slate-600 dark:text-slate-400 shrink-0">
                              <span className="text-[10px] text-slate-500 block">Base</span>
                              {v.key === "margin" ? `${v.baseValue.toFixed(1)}%` : `${fmtR(v.baseValue)} ${v.unit}`}
                            </div>
                            <div className="flex items-center gap-2 flex-1">
                              <Input
                                type="number"
                                value={priceImpactRates[v.key] ?? ""}
                                placeholder={String(v.baseValue)}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const newRate = parseFloat(e.target.value);
                                  if (!isNaN(newRate)) handlePiRateChange(v.key, newRate);
                                  else { setPriceImpactRates((p) => { const n = { ...p }; delete n[v.key]; return n; }); }
                                }}
                                className="h-7 w-28 text-xs text-right"
                                step={v.key === "margin" ? 0.5 : 1}
                                data-testid={`pi-input-${v.key}`}
                              />
                              <span className="text-xs text-slate-600 dark:text-slate-400 shrink-0">{v.unit}</span>
                            </div>
                            <div className={`w-24 text-right text-xs font-semibold ${deltaPerM3 > 0 ? "text-red-600" : deltaPerM3 < 0 ? "text-green-600" : "text-slate-500"}`}>
                              {deltaPerM3 !== 0 ? `${deltaPerM3 > 0 ? "+" : ""}${fmtR(deltaPerM3)}/m³` : "—"}
                            </div>
                            <div className="w-20 text-right text-xs text-slate-600 dark:text-slate-400">
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
                      <span className="text-xs text-slate-600 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5">Max 3 Scenarios</span>
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
                    <div className="text-center py-12 text-slate-600 dark:text-slate-400">
                      <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm font-medium">No scenarios yet</p>
                      <p className="text-sm text-slate-600 mt-1">Go to Price Impact tab, adjust variables, then save as a scenario.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-muted/40 text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wide">
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
                                <td colSpan={2 + (s.scenarios || []).length} className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{section.label}</td>
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
                                  <span className={`text-xs ml-1 ${pp > 0 ? "text-green-600" : pp < 0 ? "text-red-600" : "text-slate-500"}`}>
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
                              <p className="text-sm font-semibold text-slate-700 mb-1">{sc.name}</p>
                              <p className={`text-lg font-bold ${isBetter ? "text-green-700" : "text-red-700"}`}>
                                {isBetter ? "Saves" : "Costs"} {fmtR(Math.abs(savings))}/m³
                              </p>
                              <p className="text-sm text-slate-700 font-medium mt-1">BOQ Margin: {margin.toFixed(1)}%</p>
                              {rateChanges.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-current/10 space-y-0.5">
                                  <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Rate Changes</p>
                                  {rateChanges.map(v => (
                                    <div key={v.key} className="flex justify-between text-[10px] text-slate-600 dark:text-slate-400 gap-1">
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

            {/* ── Rate vs Client Offer ── */}
            <TabsContent value="rate-client-offer">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3 pt-4 px-5 sticky top-14 z-10 bg-card border-b shadow-sm rounded-t-xl">
                    <CardTitle className="text-sm font-semibold">Rate vs Client Offer</CardTitle>
                    <p className="text-sm text-slate-600 mt-0.5">Enter the client's offered rate to compute margin against your cost estimate.</p>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[11px]">
                        <button onClick={() => update({ clientOfferedRateMode: "per_m3" })} className={`px-2.5 py-1 rounded-lg border font-medium transition-colors ${s.clientOfferedRateMode === "per_m3" ? "bg-blue-600 text-white border-blue-600" : "text-muted-foreground border-border hover:bg-muted/40"}`}>₹/m³</button>
                        <button
                          onClick={() => crossSectionM2 > 0 ? update({ clientOfferedRateMode: "per_rm" }) : undefined}
                          title={crossSectionM2 <= 0 ? "Enter QTO height zones to enable ₹/RM mode" : ""}
                          className={`px-2.5 py-1 rounded-lg border font-medium transition-colors ${s.clientOfferedRateMode === "per_rm" ? "bg-blue-600 text-white border-blue-600" : crossSectionM2 <= 0 ? "opacity-40 cursor-not-allowed text-muted-foreground border-border" : "text-muted-foreground border-border hover:bg-muted/40"}`}
                        >₹/RM</button>
                      </div>
                      <div className="flex-1 max-w-xs">
                        {numInput(`Client's Offered Rate (${s.clientOfferedRateMode === "per_rm" ? "₹/RM" : "₹/m³"})`, s.clientOfferedRate, (v) => update({ clientOfferedRate: v }), { unit: s.clientOfferedRateMode === "per_rm" ? "₹/RM" : "₹/m³" })}
                      </div>
                    </div>
                    {(() => {
                      const rate = effectiveClientRatePerM3;
                      if (rate <= 0) return <p className="text-sm text-slate-600">Enter the client's offered rate above to see margin analysis.</p>;
                      const baseCost = costs.totalWithEsc;
                      const revisedCostVal = revisedCosts.totalWithEsc;
                      const baseMargin = ((rate - baseCost) / rate) * 100;
                      const revisedMargin = ((rate - revisedCostVal) / rate) * 100;
                      const qtoMargin = qtoAllInPerM && crossSectionM2 > 0
                        ? ((s.clientOfferedRateMode === "per_rm" ? s.clientOfferedRate : s.clientOfferedRate * crossSectionM2) - qtoAllInPerM) / (s.clientOfferedRateMode === "per_rm" ? s.clientOfferedRate : s.clientOfferedRate * crossSectionM2) * 100
                        : null;
                      const clr = (m: number) => m >= 10 ? "text-green-700" : m >= 5 ? "text-amber-600" : "text-red-600";
                      const bg = (m: number) => m >= 10 ? "bg-green-50 border-green-200" : m >= 5 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
                      return (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Card className={`border ${bg(baseMargin)}`}>
                              <CardContent className="py-4 px-5 text-center">
                                <p className="text-sm font-semibold text-slate-700 mb-1">Client's Rate</p>
                                <p className="text-xl font-bold text-blue-700">{fmtR(rate)}/m³</p>
                                {crossSectionM2 > 0 && <p className="text-xs text-slate-600 mt-1">{fmtR(rate * crossSectionM2)}/RM</p>}
                              </CardContent>
                            </Card>
                            <Card className={`border ${bg(baseMargin)}`}>
                              <CardContent className="py-4 px-5 text-center">
                                <p className="text-sm font-semibold text-slate-700 mb-1">Base BOQ Margin</p>
                                <p className={`text-2xl font-bold ${clr(baseMargin)}`}>{baseMargin.toFixed(1)}%</p>
                                <p className="text-xs text-slate-600 mt-1">Cost: {fmtR(baseCost)}/m³ · Profit: {fmtR(rate - baseCost)}/m³</p>
                              </CardContent>
                            </Card>
                            {Object.keys(priceImpactRates).length > 0 && (
                              <Card className={`border ${bg(revisedMargin)}`}>
                                <CardContent className="py-4 px-5 text-center">
                                  <p className="text-sm font-semibold text-slate-700 mb-1">Revised Margin (Price Impact)</p>
                                  <p className={`text-2xl font-bold ${clr(revisedMargin)}`}>{revisedMargin.toFixed(1)}%</p>
                                  <p className="text-xs text-slate-600 mt-1">Revised cost: {fmtR(revisedCostVal)}/m³</p>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                          {qtoAllInPerM !== undefined && (
                            <div className={`rounded-xl border p-4 ${bg(qtoMargin ?? 0)}`}>
                              <p className="text-sm font-semibold text-slate-700 mb-2">All-in ₹/RM Margin (QTO incl. PCC, Steel, Earthwork)</p>
                              <div className="flex flex-wrap gap-6">
                                <div>
                                  <p className="text-xs text-slate-600 uppercase tracking-wide font-medium">Our All-in Cost</p>
                                  <p className="text-xl font-bold">{fmtR(qtoAllInPerM)}/RM</p>
                                </div>
                                <div>
                                  <p className="text-xs text-slate-600 uppercase tracking-wide font-medium">Client's Rate</p>
                                  <p className="text-xl font-bold text-blue-700">{fmtR(s.clientOfferedRateMode === "per_rm" ? s.clientOfferedRate : s.clientOfferedRate * crossSectionM2)}/RM</p>
                                </div>
                                {qtoMargin !== null && (
                                  <div>
                                    <p className="text-xs text-slate-600 uppercase tracking-wide font-medium">Margin %</p>
                                    <p className={`text-2xl font-bold ${clr(qtoMargin)}`}>{qtoMargin.toFixed(1)}%</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="p-3 bg-slate-50 rounded-lg border text-xs text-slate-600 space-y-1">
                            <p><b>BOQ Margin %</b> = (Client Rate − Our Cost) ÷ Client Rate × 100</p>
                            <p>Green ≥ 10% · Amber 5–10% · Red below 5%</p>
                            {crossSectionM2 > 0 && <p>Cross-section: {crossSectionM2.toFixed(4)} m² · Use ₹/RM mode when client quotes per running metre.</p>}
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Rate Blender ── */}
            <TabsContent value="rate-blender">
              {(s.locationVariants ?? []).length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center text-slate-600 dark:text-slate-400">
                    <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">No location variants yet</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Go to Calculator tab → Location Variants card and add locations with different sourcing rates.</p>
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
                          <p className="text-sm font-semibold text-slate-700 mb-1">Blended Cost</p>
                          <p className="text-xl font-bold text-violet-800">{fmtR(blendedCost)}/m³</p>
                          <p className="text-sm text-slate-600 mt-1">{locs.length} locations · {(totalLen / 1000).toFixed(1)} km total</p>
                        </CardContent>
                      </Card>
                      <Card className="border-slate-200">
                        <CardContent className="py-4 px-4 text-center">
                          <p className="text-sm font-semibold text-slate-700 mb-1">Range</p>
                          <p className="text-sm font-bold">{fmtR(minCost)} – {fmtR(maxCost)}/m³</p>
                          <p className="text-sm text-slate-600 mt-1">Spread: {fmtR(maxCost - minCost)}/m³</p>
                        </CardContent>
                      </Card>
                      <Card className={`border-2 ${blendedMargin >= 10 ? "border-green-200 bg-green-50" : blendedMargin >= 5 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                        <CardContent className="py-4 px-4 text-center">
                          <p className="text-sm font-semibold text-slate-700 mb-1">Blended BOQ Margin</p>
                          <p className={`text-xl font-bold ${marginColor(blendedMargin)}`}>{blendedMargin.toFixed(1)}%</p>
                          <p className="text-sm text-slate-600 mt-1">Client rate: {fmtR(s.clientOfferedRate)}/m³</p>
                        </CardContent>
                      </Card>
                      <Card className="border-slate-200">
                        <CardContent className="py-4 px-4 text-center">
                          <p className="text-sm font-semibold text-slate-700 mb-1">Quoted Rate</p>
                          <p className="text-lg font-bold">{fmtR(quotedRate)}/m³</p>
                          <p className={`text-sm mt-1 font-semibold ${marginColor(quotedMargin)}`}>Margin: {quotedMargin.toFixed(1)}%</p>
                        </CardContent>
                      </Card>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 text-center">Client rate from <b>Rate vs Client Offer</b> tab. Set it there to see margin here.</p>

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
                              <tr className="bg-muted/40 text-slate-600 text-xs uppercase tracking-wide">
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
                                    <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-400">{fmtR(lc.ca + lc.fa)}</td>
                                    <td className="px-3 py-2.5 text-right font-semibold">{fmtR(lc.totalWithEsc)}</td>
                                    <td className={`px-3 py-2.5 text-right font-semibold ${marginColor(margin)}`}>{margin.toFixed(1)}%</td>
                                    <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-400">{fmtR(contribution)}</td>
                                  </tr>
                                );
                              })}
                              <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                                <td className="px-3 py-2.5">Weighted Blend</td>
                                <td className="px-3 py-2.5 text-right">{totalLen.toLocaleString()}</td>
                                <td className="px-3 py-2.5 text-right">100%</td>
                                <td className="px-3 py-2.5 text-right text-slate-500">—</td>
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
                            <Label className="text-sm font-medium text-slate-700">Blended Cost /m³</Label>
                            <div className="h-8 px-3 flex items-center text-sm font-semibold text-slate-700 bg-muted/40 rounded-md border">{fmtR(blendedCost)}</div>
                          </div>
                          {numInput("Markup %", s.blendedMarkupPct ?? 0, (v) => update({ blendedMarkupPct: v }), { unit: "%", step: 0.5, testId: "input-blended-markup" })}
                          <div className="space-y-1">
                            <Label className="text-sm font-medium text-slate-700">Quoted Rate /m³</Label>
                            <div className={`h-8 px-3 flex items-center text-sm font-bold rounded-md border ${quotedMargin >= 10 ? "bg-green-50 border-green-200 text-green-800" : quotedMargin >= 5 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-800"}`}>{fmtR(quotedRate)}</div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-sm font-medium text-slate-700">BOQ Margin at Quote</Label>
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
