import { useState, useCallback, useEffect, Fragment } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import {
  Building2, Plus, Trash2, ChevronDown, ChevronUp, Save, FolderOpen,
  ArrowLeft, Copy, BarChart3, Ruler, Layers, Calculator
} from "lucide-react";
import type { ConcreteEstimateV2 } from "@shared/schema";
import { readEstimatorRole } from "@/lib/estimatorAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

type AggUom = "per_mt" | "per_cft" | "per_m3";
type BarTypeV2 = "u_bar" | "invert_main" | "invert_dist" | "wall_dist" | "slab_main" | "slab_dist";
type FAType = "natural" | "robosand";

interface CATab {
  proportion: number;
  purchaseRate: number;
  uom: AggUom;
  leadKm: number;
  freightRate: number;
  payload: number;
}

interface FASource {
  type: FAType;
  purchaseRate: number;
  uom: AggUom;
  leadKm: number;
  freightRate: number;
  payload: number;
  bulkagePct: number;
}

interface SectionDimsV2 {
  invertClearWidthMm: number;
  wallHeightMm: number;
  wallThickMm: number;
  invertSlabThickMm: number;
  coverSlabThickMm: number;
  pccDepthMm: number;
  pccOffsetMm: number;
  workingSpaceMm: number;
}

interface SubZoneV2 {
  id: string;
  label: string;
  wallHeightMm: number;
  lengthM: number;
}

interface RebarRowV2 {
  id: string;
  barType: BarTypeV2;
  diaMm: number;
  spacingMm: number;
  coverMm: number;
  wallFaces: 2 | 4;
  layers: 1 | 2;
  faceCount?: number;
}

interface FixtureV2 {
  id: string;
  name: string;
  ratePerNos: number;
  spacingM: number;
}

interface LocationV2 {
  id: string;
  name: string;
  lengthM: number;
  section: SectionDimsV2;
  subZones: SubZoneV2[];
  caTabs: CATab[];
  faSource: FASource;
  steelRatePerMT: number;
  steelFabRatePerMT: number;
  excavRatePerM3: number;
  backfillRatePerM3: number;
  rebarRows: RebarRowV2[];
  fixtures: FixtureV2[];
  overheadPct: number;
  marginPct: number;
}

interface ProjectV2 {
  // Identity
  name: string;
  preparedBy: string;
  date: string;
  contractor: string;
  structureType: "Drain" | "Box Culvert";
  // Concrete grades
  pccGrade: string;
  invertGrade: string;
  wallGrade: string;
  slabGrade: string;
  // Cement
  cementBagPrice: number;
  // Batching / plant
  batchingRatePerM3: number;
  // Placing labour
  placingRatePerM3: number;    // RCC placing (invert, walls, slab)
  pccPlacingPerM3: number;     // PCC bedding placing
  // Admixture
  admixEnabled: boolean;
  admixDosageL: number;
  admixRatePerL: number;
  // Curing — water
  curingMode: "tanker" | "flat";
  curingFlatRatePerM3: number;
  tankerCapKL: number;
  tankerTripsPerDay: number;
  tankerHireRatePerDay: number;
  curingDays: number;
  // Curing — compound (additive toggle on top of water curing)
  curingCompoundEnabled: boolean;
  curingCompoundRatePerL: number;
  curingCompoundCoverageM2perL: number;
  curingCompoundSurfacePerRM: number;
  // Petty labour contract
  pettyLabourEnabled: boolean;
  pettyLabourPerRM: number;
  // Overhead & margin defaults
  defaultOverheadPct: number;
  defaultMarginPct: number;
  // Commercial
  clientRatePerRM: number;
}

interface StateV2 {
  project: ProjectV2;
  locations: LocationV2[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIX_PRESETS: Record<string, { cementKg: number; caKg: number; faKg: number }> = {
  M10: { cementKg: 220, caKg: 1200, faKg: 800 },
  M15: { cementKg: 280, caKg: 1180, faKg: 790 },
  M20: { cementKg: 320, caKg: 1150, faKg: 750 },
  M25: { cementKg: 380, caKg: 1100, faKg: 700 },
  M30: { cementKg: 420, caKg: 1080, faKg: 680 },
  M35: { cementKg: 450, caKg: 1050, faKg: 650 },
  M40: { cementKg: 480, caKg: 1020, faKg: 620 },
};

const BAR_TYPE_LABELS: Record<BarTypeV2, string> = {
  u_bar:       "U-Bar — Wall + Invert (transverse)",
  invert_main: "Invert Floor Main (transverse)",
  invert_dist: "Invert Floor Dist (longitudinal)",
  wall_dist:   "Wall Horizontal Dist (longitudinal)",
  slab_main:   "Cover Slab Main (transverse)",
  slab_dist:   "Cover Slab Dist (longitudinal)",
};

const BAR_TYPE_NOTES: Record<BarTypeV2, string> = {
  u_bar:       "Bent bar spanning both walls + invert floor",
  invert_main: "Straight bar across invert bottom (transverse)",
  invert_dist: "Bars along drain length on invert floor (longitudinal) — 1 or 2 layers",
  wall_dist:   "Horizontal bars along walls (longitudinal) — inner face or both faces",
  slab_main:   "Bar across cover slab width (transverse)",
  slab_dist:   "Bar along cover slab length (longitudinal) — always single layer",
};

const DEFAULT_REBAR_ROWS: RebarRowV2[] = [
  { id: "r1", barType: "u_bar",       diaMm: 10, spacingMm: 150, coverMm: 40, wallFaces: 2, layers: 1 },
  { id: "r2", barType: "invert_main", diaMm: 10, spacingMm: 200, coverMm: 40, wallFaces: 2, layers: 1 },
  { id: "r3", barType: "invert_dist", diaMm: 8,  spacingMm: 200, coverMm: 40, wallFaces: 2, layers: 1 },
  { id: "r4", barType: "wall_dist",   diaMm: 8,  spacingMm: 200, coverMm: 40, wallFaces: 2, layers: 1 },
  { id: "r5", barType: "slab_main",   diaMm: 10, spacingMm: 150, coverMm: 40, wallFaces: 2, layers: 1 },
  { id: "r6", barType: "slab_dist",   diaMm: 8,  spacingMm: 200, coverMm: 40, wallFaces: 2, layers: 1 },
];

const DEFAULT_SECTION: SectionDimsV2 = {
  invertClearWidthMm: 600,
  wallHeightMm: 900,
  wallThickMm: 150,
  invertSlabThickMm: 150,
  coverSlabThickMm: 150,
  pccDepthMm: 100,
  pccOffsetMm: 150,
  workingSpaceMm: 300,
};

const DEFAULT_CA_TABS: CATab[] = [
  { proportion: 60, purchaseRate: 0, uom: "per_mt", leadKm: 0, freightRate: 0, payload: 9 },
  { proportion: 30, purchaseRate: 0, uom: "per_mt", leadKm: 0, freightRate: 0, payload: 9 },
  { proportion: 10, purchaseRate: 0, uom: "per_mt", leadKm: 0, freightRate: 0, payload: 9 },
];

const DEFAULT_FA: FASource = {
  type: "natural", purchaseRate: 0, uom: "per_mt", leadKm: 0, freightRate: 0, payload: 9, bulkagePct: 12,
};

function makeDefaultLocation(project: ProjectV2, idx: number): LocationV2 {
  return {
    id: `loc_${Date.now()}_${idx}`,
    name: `Location ${idx + 1}`,
    lengthM: 100,
    section: { ...DEFAULT_SECTION },
    subZones: [],
    caTabs: DEFAULT_CA_TABS.map(t => ({ ...t })),
    faSource: { ...DEFAULT_FA },
    steelRatePerMT: 65000,
    steelFabRatePerMT: 8000,
    excavRatePerM3: 180,
    backfillRatePerM3: 80,
    rebarRows: DEFAULT_REBAR_ROWS.map(r => ({ ...r })),
    fixtures: [],
    overheadPct: project.defaultOverheadPct,
    marginPct: project.defaultMarginPct,
  };
}

const DEFAULT_PROJECT: ProjectV2 = {
  name: "",
  preparedBy: "",
  date: new Date().toISOString().split("T")[0],
  contractor: "",
  structureType: "Drain",
  pccGrade: "M15",
  invertGrade: "M25",
  wallGrade: "M25",
  slabGrade: "M25",
  cementBagPrice: 380,
  batchingRatePerM3: 350,
  placingRatePerM3: 250,
  pccPlacingPerM3: 300,
  admixEnabled: true,
  admixDosageL: 0.5,
  admixRatePerL: 80,
  curingMode: "tanker",
  curingFlatRatePerM3: 50,
  tankerCapKL: 6,
  tankerTripsPerDay: 2,
  tankerHireRatePerDay: 1200,
  curingDays: 7,
  curingCompoundEnabled: false,
  curingCompoundRatePerL: 120,
  curingCompoundCoverageM2perL: 5,
  curingCompoundSurfacePerRM: 2.5,
  pettyLabourEnabled: true,
  pettyLabourPerRM: 2500,
  defaultOverheadPct: 8,
  defaultMarginPct: 10,
  clientRatePerRM: 0,
};

const DEFAULT_STATE: StateV2 = {
  project: DEFAULT_PROJECT,
  locations: [],
};

// ─── Pure Computation ─────────────────────────────────────────────────────────

function toRatePerMT(rate: number, uom: AggUom): number {
  if (uom === "per_mt") return rate;
  if (uom === "per_m3") return rate / 1.6;
  if (uom === "per_cft") return rate / (0.02832 * 1.6);
  return rate;
}

function landedPerMT(tab: { purchaseRate: number; uom: AggUom; leadKm: number; freightRate: number; payload: number }): number {
  const base = toRatePerMT(tab.purchaseRate, tab.uom);
  const freight = tab.payload > 0 ? (tab.leadKm * 2 * tab.freightRate) / tab.payload : 0;
  return base + freight;
}

function concreteMatPerM3(grade: string, project: ProjectV2, loc: LocationV2): number {
  const mix = MIX_PRESETS[grade] ?? MIX_PRESETS["M25"];
  const cementCost = (mix.cementKg / 50) * project.cementBagPrice;

  const [tab20, tab10, tab6] = loc.caTabs;
  const totalCA = mix.caKg;
  const ca20 = totalCA * (tab20.proportion / 100);
  const ca10 = totalCA * (tab10.proportion / 100);
  const ca6  = totalCA * (tab6.proportion  / 100);
  const caCost = (ca20 / 1000) * landedPerMT(tab20) + (ca10 / 1000) * landedPerMT(tab10) + (ca6 / 1000) * landedPerMT(tab6);

  const faMT = mix.faKg / 1000;
  const faLanded = landedPerMT(loc.faSource);
  const bulkMult = (loc.faSource.type === "natural" && loc.faSource.bulkagePct > 0)
    ? (1 + loc.faSource.bulkagePct / 100) : 1;
  const faCost = faMT * faLanded * bulkMult;

  const admixCost = project.admixEnabled ? project.admixDosageL * project.admixRatePerL : 0;
  return cementCost + caCost + faCost + admixCost;
}

function allIn(direct: number, ohPct: number, mgPct: number): number {
  const oh = direct * (ohPct / 100);
  const mg = (direct + oh) * (mgPct / 100);
  return direct + oh + mg;
}

interface GeomResult {
  pccM3perM: number;
  invertM3perM: number;
  wallM3perM: number;
  slabM3perM: number;
  totalRccM3perM: number;
  excavM3perM: number;
  backfillM3perM: number;
  effectiveLengthM: number;
  effectiveWallHMm: number;
}

function computeGeom(loc: LocationV2): GeomResult {
  const s = loc.section;
  const subZones = loc.subZones;

  let effectiveWallHMm = s.wallHeightMm;
  let effectiveLengthM = loc.lengthM;
  if (subZones.length > 0) {
    const totalLen = subZones.reduce((a, z) => a + z.lengthM, 0);
    if (totalLen > 0) {
      effectiveWallHMm = subZones.reduce((a, z) => a + z.wallHeightMm * z.lengthM, 0) / totalLen;
      effectiveLengthM = totalLen;
    }
  }

  const overallWM = (s.invertClearWidthMm + 2 * s.wallThickMm) / 1000;
  const invThM  = s.invertSlabThickMm / 1000;
  const wallThM = s.wallThickMm / 1000;
  const slabThM = s.coverSlabThickMm / 1000;
  const wallHM  = effectiveWallHMm / 1000;
  const pccDepM = s.pccDepthMm / 1000;
  const pccOffM = s.pccOffsetMm / 1000;
  const wkSpM   = s.workingSpaceMm / 1000;

  const pccWidthM   = overallWM + 2 * pccOffM;
  const pccM3perM   = pccWidthM * pccDepM;
  const invertM3perM = overallWM * invThM;
  const netWallHM   = Math.max(0, wallHM - invThM);
  const wallM3perM  = 2 * wallThM * netWallHM;
  const slabM3perM  = slabThM > 0 ? overallWM * slabThM : 0;
  const totalRccM3perM = invertM3perM + wallM3perM + slabM3perM;

  const excavDepM = pccDepM + invThM + wallHM + slabThM;
  const excavWidM = pccWidthM + 2 * wkSpM;
  const excavM3perM = excavWidM * excavDepM;
  const backfillM3perM = Math.max(0, excavM3perM - pccM3perM - totalRccM3perM);

  return { pccM3perM, invertM3perM, wallM3perM, slabM3perM, totalRccM3perM, excavM3perM, backfillM3perM, effectiveLengthM, effectiveWallHMm };
}

interface RebarResult {
  totalKgPerM: number;
  rows: Array<{ id: string; cutLengthMm: number; nosPerM: number; kgPerM: number; cutFormula: string; nosFormula: string }>;
}

interface RebarComputedRow {
  id: string;
  cutLengthMm: number;
  nosPerM: number;
  kgPerM: number;
  cutFormula: string;
  nosFormula: string;
}

function computeRebar(loc: { section: SectionDimsV2; rebarRows: RebarRowV2[]; effectiveWallHMm?: number }): RebarResult {
  const s = loc.section;
  const overallWMm = s.invertClearWidthMm + 2 * s.wallThickMm;
  const wallHMm    = loc.effectiveWallHMm ?? s.wallHeightMm;

  const rows: RebarComputedRow[] = loc.rebarRows.map(row => {
    const { barType, diaMm, spacingMm, coverMm } = row;
    const kgPerMBar = diaMm * diaMm / 162;
    let cutLengthMm = 0;
    let nosPerM = 0;
    let cutFormula = "";
    let nosFormula = "";

    // Backward-compat: old estimates may have faceCount instead of wallFaces
    const wallFaces: 2 | 4 = row.wallFaces ?? (row.faceCount === 4 ? 4 : 2);
    const layers: 1 | 2    = row.layers ?? 1;

    switch (barType) {
      case "u_bar": {
        const hooks = 2 * 9 * diaMm;
        cutLengthMm = 2 * wallHMm + overallWMm - 2 * coverMm + hooks;
        nosPerM = spacingMm > 0 ? 1000 / spacingMm : 0;
        cutFormula = `2×${wallHMm}(wallH) + ${overallWMm}(width) − 2×${coverMm}(cover) + ${hooks}(hooks) = ${cutLengthMm.toFixed(0)}mm`;
        nosFormula = `1000 / ${spacingMm}(spacing) = ${nosPerM.toFixed(2)} nos/m`;
        break;
      }
      case "invert_main": {
        cutLengthMm = overallWMm - 2 * coverMm;
        nosPerM = spacingMm > 0 ? 1000 / spacingMm : 0;
        cutFormula = `${overallWMm}(overallW) − 2×${coverMm}(cover) = ${cutLengthMm.toFixed(0)}mm`;
        nosFormula = `1000 / ${spacingMm}(spacing) = ${nosPerM.toFixed(2)} nos/m`;
        break;
      }
      case "invert_dist": {
        const stdHook = 9 * diaMm;
        cutLengthMm = 1000 + 2 * stdHook;
        nosPerM = spacingMm > 0 ? layers * (overallWMm - 2 * coverMm) / spacingMm : 0;
        cutFormula = `1000 + 2×${stdHook}(hook) = ${cutLengthMm.toFixed(0)}mm`;
        nosFormula = `${layers}(layer) × (${overallWMm} − 2×${coverMm}) / ${spacingMm} = ${nosPerM.toFixed(2)} nos/m`;
        break;
      }
      case "wall_dist": {
        cutLengthMm = 1000;
        const barsPerFace = spacingMm > 0 ? (wallHMm - 2 * coverMm) / spacingMm : 0;
        nosPerM = wallFaces * barsPerFace;
        cutFormula = `1000mm (runs along drain length)`;
        nosFormula = spacingMm > 0
          ? `${wallFaces}(faces) × (${wallHMm} − 2×${coverMm}) / ${spacingMm} = ${nosPerM.toFixed(2)} nos/m`
          : `${wallFaces}(faces) × (${wallHMm} − 2×${coverMm}) / spacing — enter spacing to compute`;
        break;
      }
      case "slab_main": {
        cutLengthMm = overallWMm - 2 * coverMm;
        nosPerM = spacingMm > 0 ? 1000 / spacingMm : 0;
        cutFormula = `${overallWMm}(overallW) − 2×${coverMm}(cover) = ${cutLengthMm.toFixed(0)}mm`;
        nosFormula = `1000 / ${spacingMm}(spacing) = ${nosPerM.toFixed(2)} nos/m`;
        break;
      }
      case "slab_dist": {
        const stdHook = 9 * diaMm;
        cutLengthMm = 1000 + 2 * stdHook;
        nosPerM = spacingMm > 0 ? (overallWMm - 2 * coverMm) / spacingMm : 0;
        cutFormula = `1000 + 2×${stdHook}(hook) = ${cutLengthMm.toFixed(0)}mm`;
        nosFormula = `(${overallWMm} − 2×${coverMm}) / ${spacingMm} = ${nosPerM.toFixed(2)} nos/m`;
        break;
      }
    }

    const kgPerM = (cutLengthMm / 1000) * nosPerM * kgPerMBar;
    return { id: row.id, cutLengthMm, nosPerM, kgPerM, cutFormula, nosFormula };
  });

  return { totalKgPerM: rows.reduce((s, r) => s + r.kgPerM, 0), rows };
}

interface ElementCost { allInPerUnit: number; perM: number; directPerUnit: number; }

interface LocCostResult {
  geom: GeomResult;
  rebar: RebarResult;
  pcc: ElementCost;
  invert: ElementCost;
  walls: ElementCost;
  slab: ElementCost;
  steel: ElementCost;
  excav: ElementCost;
  backfill: ElementCost;
  fixtureResults: Array<{ fixture: FixtureV2; nosPerM: number; allInPerNos: number; allInPerM: number }>;
  pettyPerM: number;
  totalPerM: number;
  totalProjectCost: number;
}

function computeLocCost(loc: LocationV2, project: ProjectV2): LocCostResult {
  const geom = computeGeom(loc);
  const rebar = computeRebar({ section: loc.section, rebarRows: loc.rebarRows, effectiveWallHMm: geom.effectiveWallHMm });
  const oh = loc.overheadPct;
  const mg = loc.marginPct;

  const pccMat     = concreteMatPerM3(project.pccGrade, project, loc);
  const invertMat  = concreteMatPerM3(project.invertGrade, project, loc);
  const wallMat    = concreteMatPerM3(project.wallGrade, project, loc);
  const slabMat    = concreteMatPerM3(project.slabGrade, project, loc);

  const mkElem = (directPerUnit: number, qtyPerM: number): ElementCost => ({
    directPerUnit,
    allInPerUnit: allIn(directPerUnit, oh, mg),
    perM: allIn(directPerUnit, oh, mg) * qtyPerM,
  });

  // Curing cost per m³ — computed from project curing settings
  const totalRccM3 = geom.totalRccM3perM + geom.pccM3perM; // approx volume for tanker calc
  const locVol = totalRccM3 * geom.effectiveLengthM || 1;
  let curingPerM3 = 0;
  if (project.curingMode === "tanker") {
    const tankerTotalCost = project.tankerTripsPerDay * project.tankerHireRatePerDay * project.curingDays;
    curingPerM3 = locVol > 0 ? tankerTotalCost / locVol : 0;
  } else {
    curingPerM3 = project.curingFlatRatePerM3;
  }
  if (project.curingCompoundEnabled) {
    const compSurfaceM2 = loc.lengthM * project.curingCompoundSurfacePerRM;
    const compCoverage  = project.curingCompoundCoverageM2perL || 1;
    const compCost      = (compSurfaceM2 / compCoverage) * project.curingCompoundRatePerL;
    curingPerM3 += locVol > 0 ? compCost / locVol : 0;
  }

  const pccDirect    = pccMat    + project.batchingRatePerM3 + curingPerM3 + project.pccPlacingPerM3;
  const invertDirect = invertMat + project.batchingRatePerM3 + curingPerM3 + project.placingRatePerM3;
  const wallDirect   = wallMat   + project.batchingRatePerM3 + curingPerM3 + project.placingRatePerM3;
  const slabDirect   = slabMat   + project.batchingRatePerM3 + curingPerM3 + project.placingRatePerM3;
  const steelDirect  = loc.steelRatePerMT + loc.steelFabRatePerMT;

  const pcc     = mkElem(pccDirect,    geom.pccM3perM);
  const invert  = mkElem(invertDirect, geom.invertM3perM);
  const walls   = mkElem(wallDirect,   geom.wallM3perM);
  const slab    = mkElem(slabDirect,   geom.slabM3perM);
  const steel   = mkElem(steelDirect,  rebar.totalKgPerM / 1000);
  const excav   = mkElem(loc.excavRatePerM3,   geom.excavM3perM);
  const backfill = mkElem(loc.backfillRatePerM3, geom.backfillM3perM);

  const fixtureResults = loc.fixtures.map(f => {
    const nosPerM = f.spacingM > 0 ? 1 / f.spacingM : 0;
    const allInPerNos = allIn(f.ratePerNos, oh, mg);
    return { fixture: f, nosPerM, allInPerNos, allInPerM: allInPerNos * nosPerM };
  });
  const fixturesPerM = fixtureResults.reduce((s, f) => s + f.allInPerM, 0);

  const pettyPerM = project.pettyLabourEnabled ? project.pettyLabourPerRM : 0;
  const totalPerM = pcc.perM + invert.perM + walls.perM + slab.perM + steel.perM + excav.perM + backfill.perM + fixturesPerM + pettyPerM;

  return {
    geom, rebar,
    pcc, invert, walls, slab, steel, excav, backfill,
    fixtureResults, pettyPerM,
    totalPerM,
    totalProjectCost: totalPerM * geom.effectiveLengthM,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 0): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtM(n: number): string { return fmt(n, 3); }
function uid(): string { return `_${Math.random().toString(36).slice(2)}`; }

function NumInput({ label, value, onChange, unit, dec = 0, small = false }: {
  label?: string; value: number; onChange: (v: number) => void; unit?: string; dec?: number; small?: boolean;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  return (
    <div className={small ? "" : "space-y-1"}>
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <div className="flex items-center gap-1">
        <Input
          className="h-8 text-sm"
          type="number"
          value={raw !== null ? raw : (value === 0 ? "" : String(value))}
          onChange={e => setRaw(e.target.value)}
          onBlur={() => { const v = parseFloat(raw ?? ""); onChange(isNaN(v) ? 0 : +v.toFixed(dec + 2)); setRaw(null); }}
          onFocus={e => { setRaw(String(value)); e.target.select(); }}
          placeholder="0"
        />
        {unit && <span className="text-xs text-muted-foreground whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  );
}

function GradeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="space-y-1">
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.keys(MIX_PRESETS).map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CATabsInput({ tabs, onChange }: { tabs: CATab[]; onChange: (tabs: CATab[]) => void }) {
  const [active, setActive] = useState(0);
  const labels = ["20mm", "10mm", "6mm"];
  const tab = tabs[active];
  const upd = (field: keyof CATab, val: number | string) => {
    const next = tabs.map((t, i) => i === active ? { ...t, [field]: val } : t);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {labels.map((l, i) => (
          <button key={l} onClick={() => setActive(i)}
            className={`px-3 py-1 text-xs rounded border transition-colors ${active === i ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumInput label="Proportion %" value={tab.proportion} onChange={v => upd("proportion", v)} />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">UoM</Label>
          <Select value={tab.uom} onValueChange={v => upd("uom", v as AggUom)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="per_mt">₹/MT</SelectItem>
              <SelectItem value="per_m3">₹/m³</SelectItem>
              <SelectItem value="per_cft">₹/CFT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumInput label="Purchase Rate" value={tab.purchaseRate} onChange={v => upd("purchaseRate", v)} unit="₹" />
        <NumInput label="Lead" value={tab.leadKm} onChange={v => upd("leadKm", v)} unit="km" />
        <NumInput label="Freight" value={tab.freightRate} onChange={v => upd("freightRate", v)} unit="₹/MT/km" />
        <NumInput label="Payload" value={tab.payload} onChange={v => upd("payload", v)} unit="MT" />
      </div>
      <p className="text-xs text-muted-foreground">Landed: ₹{fmt(landedPerMT(tab), 0)}/MT</p>
    </div>
  );
}

function FAInput({ fa, onChange }: { fa: FASource; onChange: (fa: FASource) => void }) {
  const upd = (field: keyof FASource, val: unknown) => onChange({ ...fa, [field]: val });
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <Label className="text-xs text-muted-foreground">Type:</Label>
        {(["natural", "robosand"] as FAType[]).map(t => (
          <button key={t} onClick={() => upd("type", t)}
            className={`px-3 py-1 text-xs rounded border transition-colors ${fa.type === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
            {t === "natural" ? "Natural Sand" : "Robosand"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">UoM</Label>
          <Select value={fa.uom} onValueChange={v => upd("uom", v as AggUom)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="per_mt">₹/MT</SelectItem>
              <SelectItem value="per_m3">₹/m³</SelectItem>
              <SelectItem value="per_cft">₹/CFT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumInput label="Purchase Rate" value={fa.purchaseRate} onChange={v => upd("purchaseRate", v)} unit="₹" />
        <NumInput label="Lead" value={fa.leadKm} onChange={v => upd("leadKm", v)} unit="km" />
        <NumInput label="Freight" value={fa.freightRate} onChange={v => upd("freightRate", v)} unit="₹/MT/km" />
        <NumInput label="Payload" value={fa.payload} onChange={v => upd("payload", v)} unit="MT" />
        {fa.type === "natural" && (
          <NumInput label="Bulkage %" value={fa.bulkagePct} onChange={v => upd("bulkagePct", v)} unit="%" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Landed: ₹{fmt(landedPerMT(fa), 0)}/MT{fa.type === "natural" && fa.bulkagePct > 0 ? ` (+${fa.bulkagePct}% bulkage)` : ""}
      </p>
    </div>
  );
}

function RebarTable({ rows, section, effectiveWallHMm, onChange }: {
  rows: RebarRowV2[]; section: SectionDimsV2; effectiveWallHMm?: number;
  onChange: (rows: RebarRowV2[]) => void;
}) {
  const rebar = computeRebar({ section, rebarRows: rows, effectiveWallHMm });
  const rowResultMap = Object.fromEntries(rebar.rows.map(r => [r.id, r]));

  const addRow = () => onChange([...rows, {
    id: uid(), barType: "u_bar", diaMm: 10, spacingMm: 150, coverMm: 40, wallFaces: 2, layers: 1
  }]);
  const updRow = (id: string, field: keyof RebarRowV2, val: unknown) =>
    onChange(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
  const delRow = (id: string) => onChange(rows.filter(r => r.id !== id));

  const overallWMm = section.invertClearWidthMm + 2 * section.wallThickMm;

  return (
    <div className="space-y-3">
      {/* Guidance callout */}
      <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded p-2.5 text-xs text-blue-800 dark:text-blue-200 space-y-1">
        <p className="font-semibold">Cut length and Nos/m are auto-derived from section dimensions.</p>
        <p>You only need to enter: <strong>bar type, diameter, spacing, and cover</strong>.
          For wall distribution bars, also pick wall coverage (inner or both faces).
          For invert floor dist bars, pick layers (1 or 2).</p>
        <p className="text-blue-600 dark:text-blue-300">
          Tip: For chainages with different rebar density (e.g. single-layer walls vs double-layer),
          create <strong>separate Locations</strong> — the Rate Sheet combines them automatically.
          Cover slab distribution bars (slab_dist) are always single layer.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b bg-muted/20">
              <th className="text-left py-1.5 pr-2 pl-1 font-medium text-muted-foreground w-48">Bar Type</th>
              <th className="text-right py-1.5 pr-2 font-medium text-muted-foreground w-16">Ø (mm)</th>
              <th className="text-right py-1.5 pr-2 font-medium text-muted-foreground w-20">Spacing</th>
              <th className="text-right py-1.5 pr-2 font-medium text-muted-foreground w-16">Cover</th>
              <th className="text-left py-1.5 pr-2 font-medium text-muted-foreground w-36">Wall / Layers</th>
              <th className="text-right py-1.5 pr-2 font-medium text-muted-foreground">Cut (mm)</th>
              <th className="text-right py-1.5 pr-2 font-medium text-muted-foreground">Nos/m</th>
              <th className="text-right py-1.5 font-medium text-muted-foreground">kg/m</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const res = rowResultMap[row.id];
              const wallFaces: 2 | 4 = row.wallFaces ?? (row.faceCount === 4 ? 4 : 2);
              const layers: 1 | 2   = row.layers ?? 1;
              return (
                <tr key={row.id} className={`border-b hover:bg-muted/30 ${ri % 2 === 0 ? "" : "bg-muted/5"}`}>
                  <td className="py-1 pr-2 pl-1">
                    <div>
                      <Select value={row.barType} onValueChange={v => updRow(row.id, "barType", v as BarTypeV2)}>
                        <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(BAR_TYPE_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k} title={BAR_TYPE_NOTES[k as BarTypeV2]}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-muted-foreground mt-0.5 text-[10px] leading-tight pl-0.5">
                        {BAR_TYPE_NOTES[row.barType]}
                      </p>
                    </div>
                  </td>
                  <td className="pr-2 align-top pt-1">
                    <Input type="number" className="h-7 text-xs w-16 text-right"
                      value={row.diaMm} onChange={e => updRow(row.id, "diaMm", +e.target.value)} />
                  </td>
                  <td className="pr-2 align-top pt-1">
                    <Input type="number" className="h-7 text-xs w-20 text-right"
                      value={row.spacingMm} onChange={e => updRow(row.id, "spacingMm", +e.target.value)} />
                  </td>
                  <td className="pr-2 align-top pt-1">
                    <Input type="number" className="h-7 text-xs w-16 text-right"
                      value={row.coverMm} onChange={e => updRow(row.id, "coverMm", +e.target.value)} />
                  </td>
                  <td className="pr-2 align-top pt-1">
                    {row.barType === "wall_dist" && (
                      <Select value={String(wallFaces)} onValueChange={v => updRow(row.id, "wallFaces", +v as 2 | 4)}>
                        <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">Inner face (×2 walls)</SelectItem>
                          <SelectItem value="4">Both faces (×4 walls)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {row.barType === "invert_dist" && (
                      <Select value={String(layers)} onValueChange={v => updRow(row.id, "layers", +v as 1 | 2)}>
                        <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Single layer</SelectItem>
                          <SelectItem value="2">Double layer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {row.barType !== "wall_dist" && row.barType !== "invert_dist" && (
                      <span className="text-muted-foreground text-xs px-2">—</span>
                    )}
                  </td>
                  <td className="text-right pr-2 align-top pt-1.5 tabular-nums" title={res?.cutFormula}>
                    <span className="cursor-help border-b border-dotted border-muted-foreground">
                      {res ? fmt(res.cutLengthMm, 0) : "—"}
                    </span>
                  </td>
                  <td className="text-right pr-2 align-top pt-1.5 tabular-nums" title={res?.nosFormula}>
                    <span className="cursor-help border-b border-dotted border-muted-foreground">
                      {res ? fmtM(res.nosPerM) : "—"}
                    </span>
                  </td>
                  <td className="text-right align-top pt-1.5 tabular-nums font-medium">{res ? fmtM(res.kgPerM) : "—"}</td>
                  <td className="pl-1 align-top pt-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => delRow(row.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30">
              <td colSpan={7} className="py-1.5 text-right pr-2 font-semibold text-xs">
                Total Steel &nbsp;
                <span className="font-normal text-muted-foreground text-[10px]">
                  (overallW={overallWMm}mm)
                </span>
              </td>
              <td className="text-right font-bold text-xs tabular-nums pr-1">{fmtM(rebar.totalKgPerM)} kg/m</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={addRow} className="h-7 text-xs gap-1">
        <Plus className="h-3 w-3" /> Add Bar Row
      </Button>
    </div>
  );
}

function SubZoneEditor({ subZones, defaultHeight, onChange }: {
  subZones: SubZoneV2[];
  defaultHeight: number;
  onChange: (zones: SubZoneV2[]) => void;
}) {
  const add = () => onChange([...subZones, { id: uid(), label: `Zone ${subZones.length + 1}`, wallHeightMm: defaultHeight, lengthM: 50 }]);
  const upd = (id: string, field: keyof SubZoneV2, val: unknown) =>
    onChange(subZones.map(z => z.id === id ? { ...z, [field]: val } : z));
  const del = (id: string) => onChange(subZones.filter(z => z.id !== id));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Define zones with varying wall heights (e.g., for changing invert levels)</p>
        <Button variant="outline" size="sm" onClick={add} className="h-7 text-xs gap-1">
          <Plus className="h-3 w-3" /> Add Zone
        </Button>
      </div>
      {subZones.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No sub-zones — using uniform wall height from section dimensions above.</p>
      )}
      {subZones.map(z => (
        <div key={z.id} className="flex items-center gap-2">
          <Input className="h-7 text-xs flex-1" placeholder="Zone label" value={z.label}
            onChange={e => upd(z.id, "label", e.target.value)} />
          <Input type="number" className="h-7 text-xs w-24" placeholder="Wall H mm"
            value={z.wallHeightMm || ""} onChange={e => upd(z.id, "wallHeightMm", +e.target.value)} />
          <Input type="number" className="h-7 text-xs w-20" placeholder="Length m"
            value={z.lengthM || ""} onChange={e => upd(z.id, "lengthM", +e.target.value)} />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => del(z.id)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ))}
      {subZones.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Effective length: {fmt(subZones.reduce((s, z) => s + z.lengthM, 0), 1)}m ·
          Avg wall height: {fmt(subZones.reduce((s, z) => s + z.wallHeightMm, 0) / subZones.length, 0)}mm
        </p>
      )}
    </div>
  );
}

function FixturesInput({ fixtures, onChange }: { fixtures: FixtureV2[]; onChange: (v: FixtureV2[]) => void }) {
  const add = () => onChange([...fixtures, { id: uid(), name: "Grating", ratePerNos: 0, spacingM: 1 }]);
  const upd = (id: string, field: keyof FixtureV2, val: unknown) =>
    onChange(fixtures.map(f => f.id === id ? { ...f, [field]: val } : f));
  const del = (id: string) => onChange(fixtures.filter(f => f.id !== id));

  return (
    <div className="space-y-2">
      {fixtures.map(f => (
        <div key={f.id} className="flex items-center gap-2">
          <Input className="h-7 text-xs flex-1" placeholder="Fixture name"
            value={f.name} onChange={e => upd(f.id, "name", e.target.value)} />
          <Input type="number" className="h-7 text-xs w-28" placeholder="Rate ₹/nos"
            value={f.ratePerNos || ""} onChange={e => upd(f.id, "ratePerNos", +e.target.value)} />
          <Input type="number" className="h-7 text-xs w-24" placeholder="Spacing m"
            value={f.spacingM || ""} onChange={e => upd(f.id, "spacingM", +e.target.value)} />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => del(f.id)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="h-7 text-xs gap-1">
        <Plus className="h-3 w-3" /> Add Fixture
      </Button>
    </div>
  );
}

function LocationCard({ loc, project, index, onUpdate, onDelete, onDuplicate }: {
  loc: LocationV2; project: ProjectV2; index: number;
  onUpdate: (loc: LocationV2) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const [secTab, setSecTab] = useState<"section" | "aggregates" | "rebar" | "fixtures" | "costs">("section");
  const cost = computeLocCost(loc, project);
  const upd = (field: keyof LocationV2, val: unknown) => onUpdate({ ...loc, [field]: val });
  const updSec = (field: keyof SectionDimsV2, val: number) => onUpdate({ ...loc, section: { ...loc.section, [field]: val } });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border">
        <CardHeader className="p-3">
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <Input className="h-7 text-sm font-medium flex-1 border-0 p-0 focus-visible:ring-0"
              value={loc.name} onChange={e => upd("name", e.target.value)} placeholder={`Location ${index + 1}`} />
            <div className="flex items-center gap-1">
              <NumInput value={loc.lengthM} onChange={v => upd("lengthM", v)} unit="m" small />
            </div>
            <Badge variant="secondary" className="text-xs shrink-0">₹{fmt(cost.totalPerM, 0)}/m</Badge>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDuplicate} title="Duplicate">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDelete} title="Delete">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="p-3 pt-0 space-y-3">
            <div className="flex flex-wrap gap-1 border-b pb-2">
              {(["section", "aggregates", "rebar", "fixtures", "costs"] as const).map(t => (
                <button key={t} onClick={() => setSecTab(t)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${secTab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {secTab === "section" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumInput label="Clear Width (mm)" value={loc.section.invertClearWidthMm} onChange={v => updSec("invertClearWidthMm", v)} />
                  <NumInput label="Wall Height (mm)" value={loc.section.wallHeightMm} onChange={v => updSec("wallHeightMm", v)} />
                  <NumInput label="Wall Thick (mm)" value={loc.section.wallThickMm} onChange={v => updSec("wallThickMm", v)} />
                  <NumInput label="Invert Slab Thick (mm)" value={loc.section.invertSlabThickMm} onChange={v => updSec("invertSlabThickMm", v)} />
                  <NumInput label="Cover Slab Thick (mm)" value={loc.section.coverSlabThickMm} onChange={v => updSec("coverSlabThickMm", v)} />
                  <NumInput label="PCC Depth (mm)" value={loc.section.pccDepthMm} onChange={v => updSec("pccDepthMm", v)} />
                  <NumInput label="PCC Offset (mm)" value={loc.section.pccOffsetMm} onChange={v => updSec("pccOffsetMm", v)} />
                  <NumInput label="Working Space (mm)" value={loc.section.workingSpaceMm} onChange={v => updSec("workingSpaceMm", v)} />
                </div>
                <div className="bg-muted/30 rounded p-3 text-xs">
                  <p className="font-semibold text-muted-foreground mb-1">Computed Volumes (per metre run)</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                    {[
                      ["PCC", fmtM(cost.geom.pccM3perM), "m³/m"],
                      ["Invert Slab", fmtM(cost.geom.invertM3perM), "m³/m"],
                      ["Side Walls", fmtM(cost.geom.wallM3perM), "m³/m"],
                      ["Cover Slab", fmtM(cost.geom.slabM3perM), "m³/m"],
                      ["Total RCC", fmtM(cost.geom.totalRccM3perM), "m³/m"],
                      ["Excavation", fmtM(cost.geom.excavM3perM), "m³/m"],
                      ["Backfill", fmtM(cost.geom.backfillM3perM), "m³/m"],
                    ].map(([l, v, u]) => (
                      <div key={l as string}>
                        <span className="text-muted-foreground">{l}: </span>
                        <span className="font-medium">{v} {u}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-medium mb-2">Variable-Height Sub-Zones (optional)</p>
                  <SubZoneEditor
                    subZones={loc.subZones}
                    defaultHeight={loc.section.wallHeightMm}
                    onChange={zones => upd("subZones", zones)}
                  />
                </div>
              </div>
            )}

            {secTab === "aggregates" && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Coarse Aggregate</p>
                  <CATabsInput tabs={loc.caTabs} onChange={tabs => upd("caTabs", tabs)} />
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-2">Fine Aggregate</p>
                  <FAInput fa={loc.faSource} onChange={fa => upd("faSource", fa)} />
                </div>
              </div>
            )}

            {secTab === "rebar" && (
              <RebarTable
                rows={loc.rebarRows}
                section={loc.section}
                effectiveWallHMm={cost.geom.effectiveWallHMm}
                onChange={rows => upd("rebarRows", rows)}
              />
            )}

            {secTab === "fixtures" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Fixtures (gratings, weepholes, expansion joints, etc.)</p>
                <FixturesInput fixtures={loc.fixtures} onChange={f => upd("fixtures", f)} />
              </div>
            )}

            {secTab === "costs" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <NumInput label="Steel Supply" value={loc.steelRatePerMT} onChange={v => upd("steelRatePerMT", v)} unit="₹/MT" />
                  <NumInput label="Steel Fabrication" value={loc.steelFabRatePerMT} onChange={v => upd("steelFabRatePerMT", v)} unit="₹/MT" />
                  <NumInput label="Excavation" value={loc.excavRatePerM3} onChange={v => upd("excavRatePerM3", v)} unit="₹/m³" />
                  <NumInput label="Backfill" value={loc.backfillRatePerM3} onChange={v => upd("backfillRatePerM3", v)} unit="₹/m³" />
                  <NumInput label="Overhead %" value={loc.overheadPct} onChange={v => upd("overheadPct", v)} unit="%" dec={1} />
                  <NumInput label="Margin %" value={loc.marginPct} onChange={v => upd("marginPct", v)} unit="%" dec={1} />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Batching, placing labour, admixture, curing &amp; petty labour rates are set in Cost Rates &amp; Parameters (project-wide).
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── Rate Analysis — Grade Build-Up + BOQ Abstract + Rate Sheet ─────────────

interface GradeLineItem { label: string; amount: number; }
interface GradeBreakdown {
  grade: string;
  elements: string[];
  mix: { cementKg: number; caKg: number; faKg: number };
  lines: GradeLineItem[];
  directPerM3: number;
  ohPct: number; marginPct: number;
  ohPerM3: number; marginPerM3: number;
  allInPerM3: number;
}

function computeGradeBreakdown(
  grade: string, elements: string[],
  project: ProjectV2, loc: LocationV2,
  addPccPlacing = false
): GradeBreakdown {
  const mix = MIX_PRESETS[grade] ?? MIX_PRESETS["M25"];
  const cementCost = (mix.cementKg / 50) * project.cementBagPrice;
  const [tab20, tab10, tab6] = loc.caTabs;
  const caCost =
    (mix.caKg * (tab20.proportion / 100) / 1000) * landedPerMT(tab20) +
    (mix.caKg * (tab10.proportion / 100) / 1000) * landedPerMT(tab10) +
    (mix.caKg * (tab6.proportion  / 100) / 1000) * landedPerMT(tab6);
  const bulkMult = (loc.faSource.type === "natural" && loc.faSource.bulkagePct > 0)
    ? (1 + loc.faSource.bulkagePct / 100) : 1;
  const faCost = (mix.faKg / 1000) * landedPerMT(loc.faSource) * bulkMult;
  const admixCost = project.admixEnabled ? project.admixDosageL * project.admixRatePerL : 0;
  // Approximate curing cost per m³ using project settings (flat-rate equivalent for grade card)
  const curingPerM3Approx = project.curingMode === "flat"
    ? project.curingFlatRatePerM3
    : (project.tankerTripsPerDay * project.tankerHireRatePerDay * project.curingDays) / 100; // per 100m³ approximation
  const lines: GradeLineItem[] = [
    { label: `Cement (${mix.cementKg} kg/m³)`,       amount: cementCost },
    { label: `Coarse Agg. (${mix.caKg} kg/m³)`,      amount: caCost },
    { label: `Fine Agg. (${mix.faKg} kg/m³)`,        amount: faCost },
  ];
  if (admixCost > 0) lines.push({ label: `Admixture (${project.admixDosageL} L/m³)`, amount: admixCost });
  lines.push({ label: "Batching / Transit Mix",       amount: project.batchingRatePerM3 });
  if (addPccPlacing) {
    lines.push({ label: "PCC Placing Labour",         amount: project.pccPlacingPerM3 });
  } else {
    lines.push({ label: "RCC Placing Labour",         amount: project.placingRatePerM3 });
  }
  lines.push({ label: "Curing (water)",               amount: curingPerM3Approx });
  if (project.curingCompoundEnabled) {
    const compCostPerRM = (project.curingCompoundSurfacePerRM / (project.curingCompoundCoverageM2perL || 1)) * project.curingCompoundRatePerL;
    lines.push({ label: "Curing Compound",            amount: compCostPerRM }); // shown as additive note
  }
  const directPerM3 = lines.reduce((s, l) => s + l.amount, 0);
  const ohPct = loc.overheadPct; const marginPct = loc.marginPct;
  const ohPerM3     = directPerM3 * (ohPct / 100);
  const marginPerM3 = (directPerM3 + ohPerM3) * (marginPct / 100);
  const allInPerM3  = directPerM3 + ohPerM3 + marginPerM3;
  return { grade, elements, mix, lines, directPerM3, ohPct, marginPct, ohPerM3, marginPerM3, allInPerM3 };
}

// ─── Rate Sheet ───────────────────────────────────────────────────────────────

function RateSheet({ state }: { state: StateV2 }) {
  const { project, locations } = state;
  const [collapsedGrades, setCollapsedGrades] = useState<Set<string>>(new Set());
  const toggleGrade = (grade: string) =>
    setCollapsedGrades(prev => {
      const next = new Set(prev);
      next.has(grade) ? next.delete(grade) : next.add(grade);
      return next;
    });

  if (locations.length === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p>Add at least one location to see the Rate Analysis Sheet.</p>
    </div>
  );

  const costs = locations.map(loc => computeLocCost(loc, project));
  const totalLen = costs.reduce((s, c) => s + c.geom.effectiveLengthM, 0);
  const totalProjectCost = costs.reduce((s, c) => s + c.totalProjectCost, 0);
  const blendedRM = totalLen > 0 ? totalProjectCost / totalLen : 0;

  const allFixtureNames = Array.from(new Set(locations.flatMap(l => l.fixtures.map(f => f.name))));
  const hasSlab = locations.some(l => l.section.coverSlabThickMm > 0);

  // Weighted average per metre across all locations
  const wAvg = (vals: number[]) => {
    if (totalLen === 0) return 0;
    return costs.reduce((s, c, i) => s + (vals[i] ?? 0) * c.geom.effectiveLengthM, 0) / totalLen;
  };

  // ── Grade Rate Build-Up Data ──────────────────────────────────────────────
  const firstLoc = locations[0];
  const ohsDiffer = locations.length > 1 && locations.some(
    l => l.overheadPct !== firstLoc.overheadPct || l.marginPct !== firstLoc.marginPct
  );
  const gradeMap = new Map<string, { elements: string[]; isPcc: boolean }>();
  const addGrade = (grade: string, element: string, isPcc = false) => {
    if (gradeMap.has(grade)) {
      gradeMap.get(grade)!.elements.push(element);
    } else {
      gradeMap.set(grade, { elements: [element], isPcc });
    }
  };
  addGrade(project.pccGrade,    "PCC Bedding",  true);
  addGrade(project.invertGrade, "Invert Slab");
  addGrade(project.wallGrade,   "Side Walls");
  if (hasSlab) addGrade(project.slabGrade, "Cover Slab");
  const gradeBreakdowns = Array.from(gradeMap.entries()).map(([grade, meta]) =>
    computeGradeBreakdown(grade, meta.elements, project, firstLoc, meta.isPcc)
  );

  // ── Style classes ─────────────────────────────────────────────────────────
  const th = "text-right p-2 text-xs font-semibold text-muted-foreground border-b border-r last:border-r-0 bg-muted/20";
  const td = "text-right p-2 text-xs border-b border-r last:border-r-0 tabular-nums";
  const tdBold = td + " font-bold";
  const rowLabel = "p-2 text-xs font-medium border-b border-r whitespace-nowrap";
  const unitCell = "p-2 text-xs text-muted-foreground border-b border-r";

  type SheetRow = {
    label: string;
    unit: string;
    qty: (c: LocCostResult) => number;
    rate: (c: LocCostResult) => number;
    cost: (c: LocCostResult) => number;
    isSummary?: boolean;
    isAbsolute?: boolean;
    showRate?: boolean;
  };

  const FLAT_LABELS = ["Petty Labour", "TOTAL RATE", "TOTAL PROJECT COST", "Client Rate", "Profit/Loss"];
  function showRate(label: string) { return !FLAT_LABELS.includes(label); }

  const rows: SheetRow[] = [
    { label: `PCC ${project.pccGrade}`, unit: "m³/m",
      qty: c => c.geom.pccM3perM, rate: c => c.pcc.allInPerUnit, cost: c => c.pcc.perM },
    { label: `RCC ${project.invertGrade} — Invert Slab`, unit: "m³/m",
      qty: c => c.geom.invertM3perM, rate: c => c.invert.allInPerUnit, cost: c => c.invert.perM },
    { label: `RCC ${project.wallGrade} — Side Walls`, unit: "m³/m",
      qty: c => c.geom.wallM3perM, rate: c => c.walls.allInPerUnit, cost: c => c.walls.perM },
    ...(hasSlab ? [{
      label: `RCC ${project.slabGrade} — Cover Slab`, unit: "m³/m",
      qty: (c: LocCostResult) => c.geom.slabM3perM,
      rate: (c: LocCostResult) => c.slab.allInPerUnit,
      cost: (c: LocCostResult) => c.slab.perM,
    }] : []),
    { label: "Steel (Supply+Fab)", unit: "kg/m",
      qty: c => c.rebar.totalKgPerM,
      rate: c => c.steel.allInPerUnit,
      cost: c => c.steel.perM },
    { label: "Excavation", unit: "m³/m",
      qty: c => c.geom.excavM3perM, rate: c => c.excav.allInPerUnit, cost: c => c.excav.perM },
    { label: "Backfill", unit: "m³/m",
      qty: c => c.geom.backfillM3perM, rate: c => c.backfill.allInPerUnit, cost: c => c.backfill.perM },
    ...allFixtureNames.map(name => ({
      label: name, unit: "nos/m",
      qty: (c: LocCostResult) => c.fixtureResults.find(f => f.fixture.name === name)?.nosPerM ?? 0,
      rate: (c: LocCostResult) => c.fixtureResults.find(f => f.fixture.name === name)?.allInPerNos ?? 0,
      cost: (c: LocCostResult) => c.fixtureResults.find(f => f.fixture.name === name)?.allInPerM ?? 0,
    })),
    { label: "Petty Labour", unit: "₹/m",
      qty: () => 1, rate: c => c.pettyPerM, cost: c => c.pettyPerM },
    { label: "TOTAL RATE", unit: "₹/m",
      qty: () => 1, rate: c => c.totalPerM, cost: c => c.totalPerM, isSummary: true },
    { label: "TOTAL PROJECT COST", unit: "₹",
      qty: c => c.geom.effectiveLengthM, rate: () => 1, cost: c => c.totalProjectCost, isSummary: true, isAbsolute: true },
  ];

  const clientRate = project.clientRatePerRM;
  const hasClientRate = clientRate > 0;

  // ── BOQ Abstract rows ─────────────────────────────────────────────────────
  type AbsRow = {
    label: string; grade: string; unit: string; rateUnit: string;
    qty: (c: LocCostResult) => number;
    rate: (c: LocCostResult) => number;
    cost: (c: LocCostResult) => number;
    isSummary?: boolean; isAbsolute?: boolean;
  };
  const absRows: AbsRow[] = [
    { label: "PCC Bedding",   grade: project.pccGrade,    unit: "m³/m", rateUnit: "₹/m³",
      qty: c => c.geom.pccM3perM,     rate: c => c.pcc.allInPerUnit,    cost: c => c.pcc.perM },
    { label: "Invert Slab",   grade: project.invertGrade, unit: "m³/m", rateUnit: "₹/m³",
      qty: c => c.geom.invertM3perM,  rate: c => c.invert.allInPerUnit, cost: c => c.invert.perM },
    { label: "Side Walls",    grade: project.wallGrade,   unit: "m³/m", rateUnit: "₹/m³",
      qty: c => c.geom.wallM3perM,    rate: c => c.walls.allInPerUnit,  cost: c => c.walls.perM },
    ...(hasSlab ? [{
      label: "Cover Slab", grade: project.slabGrade, unit: "m³/m", rateUnit: "₹/m³",
      qty: (c: LocCostResult) => c.geom.slabM3perM,
      rate: (c: LocCostResult) => c.slab.allInPerUnit, cost: (c: LocCostResult) => c.slab.perM,
    }] : []),
    { label: "Reinforcement", grade: "—", unit: "kg/m", rateUnit: "₹/MT",
      qty: c => c.rebar.totalKgPerM, rate: c => c.steel.allInPerUnit, cost: c => c.steel.perM },
    { label: "Excavation",    grade: "—", unit: "m³/m", rateUnit: "₹/m³",
      qty: c => c.geom.excavM3perM,   rate: c => c.excav.allInPerUnit,  cost: c => c.excav.perM },
    { label: "Backfill",      grade: "—", unit: "m³/m", rateUnit: "₹/m³",
      qty: c => c.geom.backfillM3perM, rate: c => c.backfill.allInPerUnit, cost: c => c.backfill.perM },
    ...allFixtureNames.map(name => ({
      label: name, grade: "—", unit: "nos/m", rateUnit: "₹/nos",
      qty:  (c: LocCostResult) => c.fixtureResults.find(f => f.fixture.name === name)?.nosPerM ?? 0,
      rate: (c: LocCostResult) => c.fixtureResults.find(f => f.fixture.name === name)?.allInPerNos ?? 0,
      cost: (c: LocCostResult) => c.fixtureResults.find(f => f.fixture.name === name)?.allInPerM ?? 0,
    })),
    { label: "Petty Labour", grade: "—", unit: "₹/m", rateUnit: "—",
      qty: () => 1, rate: c => c.pettyPerM, cost: c => c.pettyPerM },
    { label: "TOTAL", grade: "", unit: "₹/m", rateUnit: "",
      qty: () => 1, rate: c => c.totalPerM, cost: c => c.totalPerM,
      isSummary: true, isAbsolute: false },
    { label: "TOTAL PROJECT ₹", grade: "", unit: "₹", rateUnit: "",
      qty: c => c.geom.effectiveLengthM, rate: () => 0, cost: c => c.totalProjectCost,
      isSummary: true, isAbsolute: true },
  ];

  return (
    <div className="space-y-8">

      {/* ── Section 1: Concrete Grade Rate Build-Up ─────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Concrete Grade Rate Build-Up</h3>
          <span className="text-xs text-muted-foreground">(rates incl. OH & Margin from {firstLoc.name})</span>
          {ohsDiffer && (
            <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded">
              OH / Margin varies by zone
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {gradeBreakdowns.map(bd => {
            const isCollapsed = collapsedGrades.has(bd.grade);
            return (
              <div key={bd.grade} className="border rounded-lg overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => toggleGrade(bd.grade)}
                  className="w-full bg-slate-800 dark:bg-slate-700 text-white px-3 py-1.5 flex items-center justify-between hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-sm">{bd.grade}</span>
                    <span className="text-slate-300 text-[11px]">{bd.elements.join(" · ")}</span>
                  </span>
                  <span className="text-slate-300 text-[11px] flex items-center gap-1">
                    <span className="font-semibold tabular-nums">₹{fmt(bd.allInPerM3, 0)}/m³</span>
                    <span>{isCollapsed ? "▶" : "▼"}</span>
                  </span>
                </button>
                {!isCollapsed && (
                  <>
                    <div className="px-2 py-1 bg-muted/20 text-[10px] text-muted-foreground border-b">
                      Mix: {bd.mix.cementKg} kg cement · {bd.mix.caKg} kg CA · {bd.mix.faKg} kg FA
                    </div>
                    <table className="w-full">
                      <tbody>
                        {bd.lines.map(line => (
                          <tr key={line.label} className="border-b border-border/50">
                            <td className="px-2 py-1 text-left">{line.label}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmt(line.amount, 0)}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/30 border-t-2 border-border">
                          <td className="px-2 py-1 text-left font-semibold">Direct Total</td>
                          <td className="px-2 py-1 text-right tabular-nums font-semibold">{fmt(bd.directPerM3, 0)}</td>
                        </tr>
                        <tr className="text-amber-700 dark:text-amber-400">
                          <td className="px-2 py-1 text-left">+ Overhead ({bd.ohPct}%)</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmt(bd.ohPerM3, 0)}</td>
                        </tr>
                        <tr className="text-amber-700 dark:text-amber-400 border-b">
                          <td className="px-2 py-1 text-left">+ Margin ({bd.marginPct}%)</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmt(bd.marginPerM3, 0)}</td>
                        </tr>
                        <tr className="bg-green-50 dark:bg-green-950">
                          <td className="px-2 py-1.5 text-left font-bold text-green-800 dark:text-green-300">
                            All-In Rate ₹/m³
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-bold text-green-800 dark:text-green-300">
                            {fmt(bd.allInPerM3, 0)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2: BOQ Abstract ──────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Abstract of Quantities &amp; Costs — Location / Zone-wise</h3>
        <div className="overflow-x-auto">
          <table
            className="border-collapse border text-xs"
            style={{ minWidth: `${Math.max(520, 270 + locations.length * 220)}px` }}
          >
            <thead>
              <tr className="bg-muted/50">
                <th className="p-2 text-left font-semibold border-b border-r">Item</th>
                <th className="p-2 text-left font-semibold text-muted-foreground border-b border-r">Grade</th>
                <th className="p-2 text-left font-semibold text-muted-foreground border-b border-r">Unit</th>
                {locations.map((l, i) => (
                  <th key={l.id} colSpan={5} className={`${th} text-center`}>
                    {l.name}
                    <br/>
                    <span className="font-normal text-muted-foreground text-[10px]">
                      {fmtM(costs[i].geom.effectiveLengthM)} m
                    </span>
                  </th>
                ))}
                {locations.length > 1 && (
                  <th colSpan={3} className={`${th} text-center bg-blue-50 dark:bg-blue-950`}>
                    Combined
                    <br/>
                    <span className="font-normal text-[10px]">{fmtM(totalLen)} m</span>
                  </th>
                )}
              </tr>
              <tr className="bg-muted/20">
                <th className="p-2 border-b border-r" />
                <th className="p-2 border-b border-r" />
                <th className="p-2 border-b border-r" />
                {locations.map(l => (
                  <Fragment key={l.id}>
                    <th className={th}>Qty/m</th>
                    <th className={th}>Total</th>
                    <th className={th}>Rate/unit</th>
                    <th className={th}>₹/m</th>
                    <th className={th}>Total ₹</th>
                  </Fragment>
                ))}
                {locations.length > 1 && (
                  <Fragment>
                    <th className={`${th} bg-blue-50 dark:bg-blue-950`}>Total</th>
                    <th className={`${th} bg-blue-50 dark:bg-blue-950`}>₹/m</th>
                    <th className={`${th} bg-blue-50 dark:bg-blue-950`}>Total ₹</th>
                  </Fragment>
                )}
              </tr>
            </thead>
            <tbody>
              {absRows.map((row, ri) => {
                const isSummary = !!row.isSummary;
                const isAbsolute = !!row.isAbsolute;
                const trCls = isSummary
                  ? "bg-blue-50/50 dark:bg-blue-950/30 font-bold"
                  : ri % 2 === 0 ? "" : "bg-muted/10";
                const showUnitRate = row.rateUnit !== "" && row.rateUnit !== "—";
                return (
                  <tr key={row.label} className={trCls}>
                    <td className={`${rowLabel} ${isSummary ? "font-bold" : ""}`}>{row.label}</td>
                    <td className={`${unitCell} text-left`}>{row.grade}</td>
                    <td className={unitCell}>{row.unit}</td>
                    {costs.map((c, ci) => {
                      const q  = row.qty(c);
                      const r  = row.rate(c);
                      const v  = row.cost(c);
                      const len = c.geom.effectiveLengthM;
                      const totalQ = isAbsolute ? len : q * len;
                      const totalQLabel = row.unit === "m³/m"
                        ? `${fmt(totalQ, 1)} m³`
                        : row.unit === "kg/m"
                          ? `${fmt(totalQ, 0)} kg`
                          : row.unit === "nos/m"
                            ? `${fmt(totalQ, 1)} nos`
                            : fmt(totalQ, 0);
                      const totalRs = isAbsolute ? v : v * len;
                      return (
                        <Fragment key={ci}>
                          <td className={isSummary ? tdBold : td}>{isAbsolute ? "—" : fmtM(q)}</td>
                          <td className={isSummary ? tdBold : td}>{isAbsolute ? fmt(len, 1)+" m" : totalQLabel}</td>
                          <td className={isSummary ? tdBold : td}>
                            {isAbsolute || !showUnitRate ? "—" : `${fmt(r, 0)} ${row.rateUnit}`}
                          </td>
                          <td className={isSummary ? tdBold : td}>{isAbsolute ? "—" : fmt(v, 0)}</td>
                          <td className={isSummary ? tdBold : td}>{fmt(totalRs, 0)}</td>
                        </Fragment>
                      );
                    })}
                    {locations.length > 1 && (() => {
                      const combTotal = isAbsolute
                        ? totalLen
                        : costs.reduce((s, c) => s + row.qty(c) * c.geom.effectiveLengthM, 0);
                      const combRPM = isAbsolute
                        ? totalProjectCost
                        : wAvg(costs.map(c => row.cost(c)));
                      const combTotalRs = isAbsolute
                        ? totalProjectCost
                        : costs.reduce((s, c) => s + row.cost(c) * c.geom.effectiveLengthM, 0);
                      const combTotalLabel = row.unit === "m³/m"
                        ? `${fmt(combTotal, 1)} m³`
                        : row.unit === "kg/m"
                          ? `${fmt(combTotal, 0)} kg`
                          : row.unit === "nos/m"
                            ? `${fmt(combTotal, 1)} nos`
                            : fmt(combTotal, 0);
                      return (
                        <Fragment>
                          <td className={`${isSummary ? tdBold : td} bg-blue-50/30 dark:bg-blue-950/20`}>
                            {isAbsolute ? fmt(totalLen, 1)+" m" : combTotalLabel}
                          </td>
                          <td className={`${isSummary ? tdBold : td} bg-blue-50/30 dark:bg-blue-950/20`}>
                            {isAbsolute ? "—" : fmt(combRPM, 0)}
                          </td>
                          <td className={`${isSummary ? tdBold : td} bg-blue-50/30 dark:bg-blue-950/20`}>
                            {fmt(combTotalRs, 0)}
                          </td>
                        </Fragment>
                      );
                    })()}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 3: Detailed Rate Sheet ───────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Detailed Rate Sheet — All-In ₹/m (incl. OH &amp; Margin)</h3>
      <div className="overflow-x-auto">
        <table className="border-collapse border text-sm" style={{ minWidth: `${Math.max(500, 260 + locations.length * 240)}px` }}>
          <thead>
            <tr className="bg-muted/50">
              <th className="p-2 text-left text-xs font-semibold border-b border-r">Item</th>
              <th className="p-2 text-xs font-semibold text-muted-foreground border-b border-r">Unit</th>
              {locations.map((l, i) => (
                <th key={l.id} colSpan={3} className={`${th} text-center`}>
                  {l.name}<br/>
                  <span className="font-normal text-muted-foreground">{fmtM(costs[i].geom.effectiveLengthM)} m</span>
                </th>
              ))}
              {locations.length > 1 && (
                <th colSpan={3} className={`${th} text-center bg-blue-50 dark:bg-blue-950`}>
                  Combined<br/>
                  <span className="font-normal">{fmtM(totalLen)} m</span>
                </th>
              )}
            </tr>
            <tr className="bg-amber-50/60 dark:bg-amber-950/20">
              <th className="p-1 border-b border-r text-[10px] text-amber-700 dark:text-amber-400 font-medium text-left">
                OH / Margin
              </th>
              <th className="p-1 border-b border-r" />
              {locations.map(l => (
                <th key={l.id} colSpan={3}
                  className="p-1 text-center text-[10px] text-amber-700 dark:text-amber-400 border-b border-r font-normal italic">
                  OH {l.overheadPct}% &nbsp;·&nbsp; Margin {l.marginPct}%
                </th>
              ))}
              {locations.length > 1 && (
                <th colSpan={3} className="p-1 border-b bg-blue-50/30 dark:bg-blue-950/20" />
              )}
            </tr>
            <tr className="bg-muted/20">
              <th className="p-2 border-b border-r" />
              <th className="p-2 border-b border-r" />
              {locations.map(l => (
                <Fragment key={l.id}>
                  <th className={th}>Qty/m</th>
                  <th className={th}>Rate (₹)</th>
                  <th className={th}>₹/m</th>
                </Fragment>
              ))}
              {locations.length > 1 && (
                <Fragment>
                  <th className={`${th} bg-blue-50 dark:bg-blue-950`}>Qty/m</th>
                  <th className={`${th} bg-blue-50 dark:bg-blue-950`}>Rate (₹)</th>
                  <th className={`${th} bg-blue-50 dark:bg-blue-950`}>₹/m</th>
                </Fragment>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const isSummary = !!row.isSummary;
              const isAbsolute = !!row.isAbsolute;
              const trCls = isSummary ? "bg-blue-50/50 dark:bg-blue-950/30 font-bold" : ri % 2 === 0 ? "" : "bg-muted/10";
              const noRate = !showRate(row.label);

              return (
                <tr key={row.label} className={trCls}>
                  <td className={`${rowLabel} ${isSummary ? "font-bold" : ""}`}>{row.label}</td>
                  <td className={unitCell}>{row.unit}</td>
                  {costs.map((c, ci) => {
                    const q = row.qty(c);
                    const r = row.rate(c);
                    const v = row.cost(c);
                    return (
                      <Fragment key={ci}>
                        <td className={isSummary ? tdBold : td}>{isAbsolute ? fmt(q, 1) : fmtM(q)}</td>
                        <td className={isSummary ? tdBold : td}>{noRate ? "—" : fmt(r, 0)}</td>
                        <td className={isSummary ? tdBold : td}>{fmt(v, 0)}</td>
                      </Fragment>
                    );
                  })}
                  {locations.length > 1 && (() => {
                    const combinedQty = isAbsolute ? totalLen : wAvg(costs.map(c => row.qty(c)));
                    const combinedRate = wAvg(costs.map(c => row.rate(c)));
                    const combinedCost = isAbsolute
                      ? costs.reduce((s, c) => s + row.cost(c), 0)
                      : wAvg(costs.map(c => row.cost(c)));
                    return (
                      <Fragment>
                        <td className={`${isSummary ? tdBold : td} bg-blue-50/30 dark:bg-blue-950/20`}>
                          {isAbsolute ? fmt(combinedQty, 1) : fmtM(combinedQty)}
                        </td>
                        <td className={`${isSummary ? tdBold : td} bg-blue-50/30 dark:bg-blue-950/20`}>
                          {noRate ? "—" : fmt(combinedRate, 0)}
                        </td>
                        <td className={`${isSummary ? tdBold : td} bg-blue-50/30 dark:bg-blue-950/20`}>
                          {fmt(combinedCost, 0)}
                        </td>
                      </Fragment>
                    );
                  })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      {/* Client Rate & Margin Summary */}
      {hasClientRate && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/30 px-4 py-2 font-semibold text-sm">Contract Profitability</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: `${Math.max(500, 260 + locations.length * 240)}px` }}>
              <tbody>
                <tr className="border-b">
                  <td className={rowLabel}>Client Rate (offered)</td>
                  <td className={unitCell}>₹/m</td>
                  {costs.map((_, ci) => (
                    <Fragment key={ci}>
                      <td className={td}>—</td>
                      <td className={td}>—</td>
                      <td className={td + " font-semibold"}>{fmt(clientRate, 0)}</td>
                    </Fragment>
                  ))}
                  {locations.length > 1 && (
                    <Fragment>
                      <td className={`${td} bg-blue-50/30 dark:bg-blue-950/20`}>—</td>
                      <td className={`${td} bg-blue-50/30 dark:bg-blue-950/20`}>—</td>
                      <td className={`${td} bg-blue-50/30 dark:bg-blue-950/20 font-semibold`}>{fmt(clientRate, 0)}</td>
                    </Fragment>
                  )}
                </tr>
                <tr className="border-b">
                  <td className={rowLabel}>Our Cost</td>
                  <td className={unitCell}>₹/m</td>
                  {costs.map((c, ci) => (
                    <Fragment key={ci}>
                      <td className={td}>—</td>
                      <td className={td}>—</td>
                      <td className={td}>{fmt(c.totalPerM, 0)}</td>
                    </Fragment>
                  ))}
                  {locations.length > 1 && (
                    <Fragment>
                      <td className={`${td} bg-blue-50/30 dark:bg-blue-950/20`}>—</td>
                      <td className={`${td} bg-blue-50/30 dark:bg-blue-950/20`}>—</td>
                      <td className={`${td} bg-blue-50/30 dark:bg-blue-950/20`}>{fmt(blendedRM, 0)}</td>
                    </Fragment>
                  )}
                </tr>
                <tr>
                  <td className={rowLabel + " font-bold"}>Profit / Loss</td>
                  <td className={unitCell}>₹/m + %</td>
                  {costs.map((c, ci) => {
                    const profit = clientRate - c.totalPerM;
                    const pct = clientRate > 0 ? (profit / clientRate) * 100 : 0;
                    const color = pct >= 10 ? "text-green-600" : pct >= 5 ? "text-amber-600" : "text-red-600";
                    return (
                      <Fragment key={ci}>
                        <td className={td}>—</td>
                        <td className={td}>—</td>
                        <td className={`${td} font-bold ${color}`}>
                          {fmt(profit, 0)} ({fmt(pct, 1)}%)
                        </td>
                      </Fragment>
                    );
                  })}
                  {locations.length > 1 && (() => {
                    const profit = clientRate - blendedRM;
                    const pct = clientRate > 0 ? (profit / clientRate) * 100 : 0;
                    const color = pct >= 10 ? "text-green-600" : pct >= 5 ? "text-amber-600" : "text-red-600";
                    return (
                      <Fragment>
                        <td className={`${td} bg-blue-50/30 dark:bg-blue-950/20`}>—</td>
                        <td className={`${td} bg-blue-50/30 dark:bg-blue-950/20`}>—</td>
                        <td className={`${td} font-bold ${color} bg-blue-50/30 dark:bg-blue-950/20`}>
                          {fmt(profit, 0)} ({fmt(pct, 1)}%)
                        </td>
                      </Fragment>
                    );
                  })()}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── State Normalization ──────────────────────────────────────────────────────

function normalizeRebarRow(row: RebarRowV2): RebarRowV2 {
  const wallFaces: 2 | 4 = row.wallFaces ?? (row.faceCount === 4 ? 4 : 2);
  const layers: 1 | 2    = row.layers ?? 1;
  return { ...row, wallFaces, layers };
}

function normalizeState(raw: StateV2): StateV2 {
  const p = raw.project ?? {};
  // Migrate old project-level fields
  const project: ProjectV2 = {
    ...DEFAULT_PROJECT,
    ...p,
    // If old schema had curingRatePerM3 but no curingMode, migrate to flat mode
    curingMode: (p as any).curingMode ?? ((p as any).curingRatePerM3 ? "flat" : "tanker"),
    curingFlatRatePerM3: (p as any).curingFlatRatePerM3 ?? (p as any).curingRatePerM3 ?? DEFAULT_PROJECT.curingFlatRatePerM3,
    // Migrate old default fields to new direct fields
    pettyLabourPerRM: (p as any).pettyLabourPerRM ?? (p as any).defaultPettyLabourPerRM ?? DEFAULT_PROJECT.pettyLabourPerRM,
    pccPlacingPerM3: (p as any).pccPlacingPerM3 ?? (p as any).defaultPccPlacingPerM3 ?? DEFAULT_PROJECT.pccPlacingPerM3,
    placingRatePerM3: (p as any).placingRatePerM3 ?? DEFAULT_PROJECT.placingRatePerM3,
    admixEnabled: (p as any).admixEnabled ?? true,
    admixDosageL: (p as any).admixDosageL ?? DEFAULT_PROJECT.admixDosageL,
    admixRatePerL: (p as any).admixRatePerL ?? DEFAULT_PROJECT.admixRatePerL,
    pettyLabourEnabled: (p as any).pettyLabourEnabled ?? true,
  };
  return {
    ...raw,
    project,
    locations: (raw.locations ?? []).map(loc => {
      const l: LocationV2 = {
        id: loc.id,
        name: loc.name,
        lengthM: loc.lengthM,
        section: loc.section,
        subZones: loc.subZones ?? [],
        caTabs: loc.caTabs ?? DEFAULT_CA_TABS.map(t => ({ ...t })),
        faSource: loc.faSource ?? { ...DEFAULT_FA },
        steelRatePerMT: (loc as any).steelRatePerMT ?? 65000,
        steelFabRatePerMT: (loc as any).steelFabRatePerMT ?? 8000,
        excavRatePerM3: (loc as any).excavRatePerM3 ?? 180,
        backfillRatePerM3: (loc as any).backfillRatePerM3 ?? 80,
        rebarRows: ((loc as any).rebarRows ?? []).map(normalizeRebarRow),
        fixtures: (loc as any).fixtures ?? [],
        overheadPct: (loc as any).overheadPct ?? project.defaultOverheadPct,
        marginPct: (loc as any).marginPct ?? project.defaultMarginPct,
      };
      return l;
    }),
  };
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ConcreteCalculatorV2() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const role = readEstimatorRole();

  const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const estimateIdParam = urlParams.get("estimateId");

  const [state, setState] = useState<StateV2>(DEFAULT_STATE);
  const [savedId, setSavedId] = useState<number | null>(estimateIdParam ? parseInt(estimateIdParam) : null);
  const [dirty, setDirty] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("setup");

  useEffect(() => {
    if (!role) setLocation("/estimator-login?returnTo=/concrete-calculator-v2");
    if (role === "manager") setLocation("/estimator-hub");
  }, [role]);

  const { data: loadedEst } = useQuery<ConcreteEstimateV2>({
    queryKey: ["/api/concrete/v2/estimates", savedId],
    enabled: !!savedId,
    queryFn: () => fetch(`/api/concrete/v2/estimates/${savedId}`, { credentials: "include" }).then(r => r.json()),
  });

  useEffect(() => {
    if (loadedEst?.state) {
      try {
        setState(normalizeState(JSON.parse(loadedEst.state)));
        setDirty(false);
      } catch {}
    }
  }, [loadedEst]);

  const { data: allEstimates = [] } = useQuery<ConcreteEstimateV2[]>({
    queryKey: ["/api/concrete/v2/estimates"],
    queryFn: () => fetch("/api/concrete/v2/estimates", { credentials: "include" }).then(r => r.json()),
    enabled: showLoadDialog,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const totalLen = state.locations.reduce((s, l) => {
        const sz = l.subZones;
        return s + (sz.length > 0 ? sz.reduce((a, z) => a + z.lengthM, 0) : l.lengthM);
      }, 0);
      const costs = state.locations.map(loc => computeLocCost(loc, state.project));
      const totalAmt = costs.reduce((s, c) => s + c.totalProjectCost, 0);
      const payload = {
        name: state.project.name || "Untitled Estimate",
        contractor: state.project.contractor || null,
        structureType: state.project.structureType,
        state: JSON.stringify(state),
        totalLengthM: totalLen,
        totalRmAmt: totalAmt,
      };
      const response = savedId
        ? await apiRequest("PATCH", `/api/concrete/v2/estimates/${savedId}`, payload)
        : await apiRequest("POST", "/api/concrete/v2/estimates", payload);
      return response.json() as Promise<ConcreteEstimateV2>;
    },
    onSuccess: (data) => {
      setSavedId(data.id);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/concrete/v2/estimates"] });
      toast({ title: "Saved", description: "Estimate saved successfully." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const updProject = useCallback((field: keyof ProjectV2, val: unknown) => {
    setState(s => ({ ...s, project: { ...s.project, [field]: val } }));
    setDirty(true);
  }, []);

  const addLocation = useCallback(() => {
    setState(s => ({ ...s, locations: [...s.locations, makeDefaultLocation(s.project, s.locations.length)] }));
    setDirty(true);
  }, []);

  const updLocation = useCallback((id: string, loc: LocationV2) => {
    setState(s => ({ ...s, locations: s.locations.map(l => l.id === id ? loc : l) }));
    setDirty(true);
  }, []);

  const delLocation = useCallback((id: string) => {
    setState(s => ({ ...s, locations: s.locations.filter(l => l.id !== id) }));
    setDirty(true);
  }, []);

  const dupLocation = useCallback((id: string) => {
    setState(s => {
      const src = s.locations.find(l => l.id === id);
      if (!src) return s;
      const copy: LocationV2 = { ...JSON.parse(JSON.stringify(src)), id: uid(), name: src.name + " (copy)" };
      const idx = s.locations.findIndex(l => l.id === id);
      const next = [...s.locations];
      next.splice(idx + 1, 0, copy);
      return { ...s, locations: next };
    });
    setDirty(true);
  }, []);

  const loadEstimate = (est: ConcreteEstimateV2) => {
    try {
      setState(normalizeState(JSON.parse(est.state)));
      setSavedId(est.id);
      setDirty(false);
      setShowLoadDialog(false);
    } catch {
      toast({ title: "Failed to load", variant: "destructive" });
    }
  };

  const newEstimate = () => {
    setState(DEFAULT_STATE);
    setSavedId(null);
    setDirty(false);
  };

  if (!role) return null;

  const costs = state.locations.map(loc => computeLocCost(loc, state.project));
  const totalLen = costs.reduce((s, c) => s + c.geom.effectiveLengthM, 0);
  const totalAmt = costs.reduce((s, c) => s + c.totalProjectCost, 0);
  const blendedRM = totalLen > 0 ? totalAmt / totalLen : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/estimator-hub")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Hub
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">
            {state.project.name || "New Concrete Estimate"}{dirty ? <span className="text-muted-foreground text-sm ml-1">•</span> : ""}
          </h1>
          <p className="text-sm text-muted-foreground">{state.project.structureType} · {state.project.contractor || "—"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowLoadDialog(true)} className="gap-1">
            <FolderOpen className="h-4 w-4" /> Load
          </Button>
          <Button variant="outline" size="sm" onClick={newEstimate} className="gap-1">
            <Plus className="h-4 w-4" /> New
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1">
            <Save className="h-4 w-4" /> {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {state.locations.length > 0 && (
        <div className="flex gap-4 bg-muted/30 rounded-lg p-3 text-sm flex-wrap">
          <div><span className="text-muted-foreground">Locations: </span><strong>{state.locations.length}</strong></div>
          <div><span className="text-muted-foreground">Total Length: </span><strong>{fmt(totalLen, 1)} m</strong></div>
          <div><span className="text-muted-foreground">Blended Rate: </span><strong>₹{fmt(blendedRM, 0)}/m</strong></div>
          <div><span className="text-muted-foreground">Total Cost: </span><strong>₹{fmt(totalAmt, 0)}</strong></div>
          {state.project.clientRatePerRM > 0 && (() => {
            const profit = state.project.clientRatePerRM - blendedRM;
            const pct = state.project.clientRatePerRM > 0 ? (profit / state.project.clientRatePerRM) * 100 : 0;
            const color = pct >= 10 ? "text-green-600" : pct >= 5 ? "text-amber-600" : "text-red-600";
            return <div><span className="text-muted-foreground">Margin: </span><strong className={color}>{fmt(pct, 1)}%</strong></div>;
          })()}
        </div>
      )}

      {/* Load dialog */}
      {showLoadDialog && (
        <Card className="border-2 border-primary">
          <CardHeader className="p-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Load Saved Estimate</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowLoadDialog(false)}>✕</Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {allEstimates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved v2 estimates yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {allEstimates.map(est => (
                  <div key={est.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{est.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {est.structureType} · {est.contractor || "—"} · {est.totalLengthM ? fmt(est.totalLengthM, 1) + "m" : "—"}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => loadEstimate(est)}>Load</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="setup" className="gap-1"><Ruler className="h-3.5 w-3.5" /> Setup</TabsTrigger>
          <TabsTrigger value="analysis" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> Rate Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-4 mt-4">
          {/* ── Project Info ───────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Project Info</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Estimate / Project Name</Label>
                  <Input className="h-8 text-sm" value={state.project.name}
                    onChange={e => updProject("name", e.target.value)} placeholder="e.g. NH-44 Road Drain Ch.0–5km" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input className="h-8 text-sm" type="date" value={state.project.date} onChange={e => updProject("date", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Client / Contractor</Label>
                  <Input className="h-8 text-sm" value={state.project.contractor} onChange={e => updProject("contractor", e.target.value)} placeholder="Client or contractor name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Prepared By</Label>
                  <Input className="h-8 text-sm" value={state.project.preparedBy} onChange={e => updProject("preparedBy", e.target.value)} placeholder="Name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Structure Type</Label>
                  <Select value={state.project.structureType} onValueChange={v => updProject("structureType", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Drain">Drain</SelectItem>
                      <SelectItem value="Box Culvert">Box Culvert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Cost Rates & Parameters ────────────────────────────────────── */}
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-sm flex items-center gap-2"><Calculator className="h-4 w-4" /> Cost Rates &amp; Parameters</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-4">

              {/* Concrete Grades */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Concrete Grades</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <GradeSelect label="PCC Grade" value={state.project.pccGrade} onChange={v => updProject("pccGrade", v)} />
                  <GradeSelect label="Invert Slab Grade" value={state.project.invertGrade} onChange={v => updProject("invertGrade", v)} />
                  <GradeSelect label="Side Walls Grade" value={state.project.wallGrade} onChange={v => updProject("wallGrade", v)} />
                  <GradeSelect label="Cover Slab Grade" value={state.project.slabGrade} onChange={v => updProject("slabGrade", v)} />
                </div>
              </div>

              <Separator />

              {/* Cement */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cement</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumInput label="Cement Price" value={state.project.cementBagPrice} onChange={v => updProject("cementBagPrice", v)} unit="₹/bag (50 kg)" />
                </div>
              </div>

              <Separator />

              {/* Batching & Placing */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Plant — Batching &amp; Placing</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumInput label="Batching / Transit Mix" value={state.project.batchingRatePerM3} onChange={v => updProject("batchingRatePerM3", v)} unit="₹/m³" />
                  <NumInput label="RCC Placing Labour" value={state.project.placingRatePerM3} onChange={v => updProject("placingRatePerM3", v)} unit="₹/m³" />
                  <NumInput label="PCC Bedding Placing" value={state.project.pccPlacingPerM3} onChange={v => updProject("pccPlacingPerM3", v)} unit="₹/m³" />
                </div>
              </div>

              <Separator />

              {/* Admixture */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Admixture</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{state.project.admixEnabled ? "Included" : "Not used"}</span>
                    <Switch
                      checked={state.project.admixEnabled}
                      onCheckedChange={v => updProject("admixEnabled", v)}
                    />
                  </div>
                </div>
                <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 transition-opacity ${!state.project.admixEnabled ? "opacity-40 pointer-events-none" : ""}`}>
                  <NumInput label="Dosage" value={state.project.admixDosageL} onChange={v => updProject("admixDosageL", v)} unit="L/m³" dec={2} />
                  <NumInput label="Rate" value={state.project.admixRatePerL} onChange={v => updProject("admixRatePerL", v)} unit="₹/L" />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Cost</Label>
                    <div className="h-8 flex items-center text-sm font-medium tabular-nums text-green-700 dark:text-green-400">
                      {state.project.admixEnabled ? `₹${fmt(state.project.admixDosageL * state.project.admixRatePerL, 0)}/m³` : "—"}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Curing — Water */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Curing — Water</p>
                <div className="flex items-center gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => updProject("curingMode", "tanker")}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${state.project.curingMode === "tanker" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"}`}
                  >
                    Water Tanker
                  </button>
                  <button
                    type="button"
                    onClick={() => updProject("curingMode", "flat")}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${state.project.curingMode === "flat" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"}`}
                  >
                    Flat Rate
                  </button>
                </div>
                {state.project.curingMode === "tanker" ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <NumInput label="Tanker Capacity" value={state.project.tankerCapKL} onChange={v => updProject("tankerCapKL", v)} unit="KL" dec={1} />
                    <NumInput label="Trips / Day" value={state.project.tankerTripsPerDay} onChange={v => updProject("tankerTripsPerDay", v)} />
                    <NumInput label="Hire Rate" value={state.project.tankerHireRatePerDay} onChange={v => updProject("tankerHireRatePerDay", v)} unit="₹/day" />
                    <NumInput label="Curing Days" value={state.project.curingDays} onChange={v => updProject("curingDays", v)} unit="days" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <NumInput label="Curing Rate" value={state.project.curingFlatRatePerM3} onChange={v => updProject("curingFlatRatePerM3", v)} unit="₹/m³" />
                  </div>
                )}

                {/* Curing Compound — toggle */}
                <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold">Curing Compound</p>
                      <p className="text-[10px] text-muted-foreground">Applied in addition to water curing</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{state.project.curingCompoundEnabled ? "ON" : "OFF"}</span>
                      <Switch
                        checked={state.project.curingCompoundEnabled}
                        onCheckedChange={v => updProject("curingCompoundEnabled", v)}
                      />
                    </div>
                  </div>
                  <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 transition-opacity ${!state.project.curingCompoundEnabled ? "opacity-40 pointer-events-none" : ""}`}>
                    <NumInput label="Compound Rate" value={state.project.curingCompoundRatePerL} onChange={v => updProject("curingCompoundRatePerL", v)} unit="₹/L" />
                    <NumInput label="Coverage" value={state.project.curingCompoundCoverageM2perL} onChange={v => updProject("curingCompoundCoverageM2perL", v)} unit="m²/L" dec={1} />
                    <NumInput label="Surface per RM" value={state.project.curingCompoundSurfacePerRM} onChange={v => updProject("curingCompoundSurfacePerRM", v)} unit="m²/m" dec={2} />
                    {state.project.curingCompoundEnabled && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Cost per RM</Label>
                        <div className="h-8 flex items-center text-sm font-medium tabular-nums text-green-700 dark:text-green-400">
                          ₹{fmt(
                            (state.project.curingCompoundSurfacePerRM / (state.project.curingCompoundCoverageM2perL || 1)) * state.project.curingCompoundRatePerL,
                            0
                          )}/m
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Petty Labour Contract */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Petty Labour Contract</p>
                    <p className="text-[10px] text-muted-foreground">Site formwork, setting-out, minor works — per running metre</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{state.project.pettyLabourEnabled ? "Active" : "Not used"}</span>
                    <Switch
                      checked={state.project.pettyLabourEnabled}
                      onCheckedChange={v => updProject("pettyLabourEnabled", v)}
                    />
                  </div>
                </div>
                <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 transition-opacity ${!state.project.pettyLabourEnabled ? "opacity-40 pointer-events-none" : ""}`}>
                  <NumInput label="Rate" value={state.project.pettyLabourPerRM} onChange={v => updProject("pettyLabourPerRM", v)} unit="₹/RM" />
                </div>
              </div>

              <Separator />

              {/* Overhead, Margin & Commercial */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Overhead, Margin &amp; Commercial</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumInput label="Default Overhead %" value={state.project.defaultOverheadPct} onChange={v => updProject("defaultOverheadPct", v)} unit="%" dec={1} />
                  <NumInput label="Default Margin %" value={state.project.defaultMarginPct} onChange={v => updProject("defaultMarginPct", v)} unit="%" dec={1} />
                  <NumInput label="Client Offered Rate" value={state.project.clientRatePerRM} onChange={v => updProject("clientRatePerRM", v)} unit="₹/RM" />
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Locations */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Locations ({state.locations.length})</h2>
              <Button size="sm" onClick={addLocation} className="gap-1 h-7 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Location
              </Button>
            </div>
            {state.locations.length === 0 && (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <Ruler className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No locations yet — click "Add Location" to begin.</p>
              </div>
            )}
            {state.locations.map((loc, i) => (
              <LocationCard
                key={loc.id}
                loc={loc}
                project={state.project}
                index={i}
                onUpdate={updated => updLocation(loc.id, updated)}
                onDelete={() => delLocation(loc.id)}
                onDuplicate={() => dupLocation(loc.id)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-4">
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Rate Analysis Sheet
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <RateSheet state={state} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
