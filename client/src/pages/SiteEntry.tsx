import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { useOrigin } from "@/hooks/use-origin";
import { useAutosave } from "@/hooks/use-autosave";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDeviceType } from "@/hooks/use-device-type";
import { useAuth } from "@/lib/auth-context";
import { DraftRestoreBanner } from "@/components/DraftRestoreBanner";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import { ChevronLeft, ChevronRight, Plus, Trash2, Eye, Loader2, UserPlus, X, Shield, AlertTriangle, Check, Camera, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deriveDprUom, computeDprQty, boqUomProfile } from "@/lib/dprUom";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { format } from "date-fns";
import SitePreview from "@/pages/SitePreview";
import type { EquipmentMasterType, Site, Personnel } from "@shared/schema";
import { PERSONNEL_ROLES } from "@shared/schema";
import { STRUCTURE_TYPES, STRUCTURE_ITEMS, getSubTypes, getStages } from "@shared/structureHierarchy";
import { BillItemPicker } from "@/components/BillItemPicker";
import { computeEquipmentUsage } from "@/lib/equipmentUsage";
import { calculateBomDemand, fmtQty, type BomInputItem, type BomInputBar, type BomDemand } from "@shared/planningEngine";

interface ProgressEntry {
  activity: string;
  side: string;
  chainageFrom: string;
  chainageTo: string;
  length: number | null;
  width: number | null;
  thickness: number | null;
  quantity: number | null;
  uom: string;
  noSiteWork: boolean;
  noSiteWorkDescription: string;
  personnelIds: number[];
  boqItemId: number | null;
}

interface EquipmentEntry {
  machine: string;
  vehicleNo: string;
  operator: string;
  task: string;
  entryType: string;
  startTime: string;
  endTime: string;
  openingReading: number | null;
  closingReading: number | null;
  diesel: number | null;
  equipmentId: number | null;
  dieselSource: string;
  fuelStation: string;
  billNumber: string;
  amountPaid: number | null;
  numberOfTrips: number | null;
  tripDistance: number | null;
  totalKm: number | null;
  waterQuantity: number | null;
  // Phase 3: optional link to the planned BOQ item / structure this usage is
  // charged against, for planned vs actual comparison.
  boqItemId: number | null;
  structureId: string | null;
}

interface LabourEntry {
  category: string;
  gender: string;
  count: number;
  task: string;
  contractor: string;
  // Phase 3: optional link to the planned BOQ item / structure this deployment
  // is charged against, for planned vs actual comparison.
  boqItemId: number | null;
  structureId: string | null;
}

interface MaterialEntry {
  type: string;
  material: string;
  quantity: number | null;
  uom: string;
  vehicleNumber: string;
  supplier: string;
  location: string;
  receiptNumber: string;
  // Phase 3: optional link to the planned BOQ item / structure this material
  // consumption/issue is charged against, for planned vs actual comparison.
  boqItemId: number | null;
  structureId: string | null;
}

const MATERIAL_TYPE_OPTIONS = ["Received", "Issued"];

interface SitePurchaseEntry {
  itemDescription: string;
  vendor: string;
  billNo: string;
  amount: number | null;
  quantity: number | null;
  uom: string;
}

interface StructureItem {
  structureType: string;
  structureSubType: string;
  structureName: string;
  stage: string;
  itemOfWork: string;
  quantity: number | null;
  uom: string;
  boqItemId?: number | null;
  dprConversionFactor?: number | null;
  remarks: string;
  // Client-side only: links this row to an imported Structure Schedule location
  // (work_program_bars.structureId) so the BOQ item list can be narrowed to the
  // items actually planned at that structure. Not sent to the backend.
  programmeStructureId?: string | null;
}

// Programme/BOQ data shapes used to link DPR rows to the Work Programme (Phase 2)
type ProgrammeBar = {
  id: number;
  boqItemId: number;
  reachLabel: string | null;
  chainageFrom: number | null;
  chainageTo: number | null;
  startDate: string | null;
  endDate: string | null;
  plannedQty: number;
  planningMode: string | null;
  structureId: string | null;
  structureLocType: string | null;
  boqSubItem: string | null;
};

type PlanVsActualRow = {
  boqItemId: number;
  itemCode: string | null;
  description: string;
  unit: string;
  currentQty: number;
  totalPlanned: number;
  totalActual: number;
  percentComplete: number;
};

const SIDE_OPTIONS = ["LHS", "RHS", "Full Width"];
const UOM_OPTIONS = ["SQM", "CUM", "RMT", "MT", "NOS"];
const LABOUR_CATEGORIES = ["Skilled", "Semi-Skilled", "Unskilled"];
const GENDER_OPTIONS = ["Male", "Female"];
const STRUCTURE_UOM_OPTIONS = ["m³", "m²", "m", "MT", "Nos", "RM"];

type SiteBoqItem = { id: number; description: string; itemCode: string | null; itemName: string | null; unit: string; dprConversionFactor: number | null; categoryName?: string | null; sortOrder?: number | null; planningWorkType?: string | null };

interface SiteEntryFormData {
  header: { date: string; site: string; engineer: string };
  workType: string;
  progress: ProgressEntry[];
  structureItems: StructureItem[];
  equipment: EquipmentEntry[];
  labour: LabourEntry[];
  materials: MaterialEntry[];
  sitePurchases: SitePurchaseEntry[];
}

// Helper to parse chainage like "0+500" or "1+250" or decimal km like "5.2" into meters
function parseChainageToMeters(chainage: string): number | null {
  if (!chainage) return null;
  const match = chainage.match(/^(\d+)\+(\d+)$/);
  if (match) {
    const km = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    return km * 1000 + m;
  }
  // Try parsing as decimal kilometers (e.g., "5.2" = 5.2 km = 5200 meters)
  const num = parseFloat(chainage);
  return isNaN(num) ? null : num * 1000;
}

// Calculate length from chainage difference
function calculateLengthFromChainage(from: string, to: string): number | null {
  const fromMeters = parseChainageToMeters(from);
  const toMeters = parseChainageToMeters(to);
  if (fromMeters !== null && toMeters !== null) {
    return Math.abs(toMeters - fromMeters);
  }
  return null;
}

function formatTimeDuration(start: string, end: string): string | null {
  if (!start || !end) return null;
  try {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) return null;
    return `${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`;
  } catch { return null; }
}

// Turn a verbose BOQ description into a short, still-identifiable label.
// Removes only boilerplate wrappers; KEEPS grade (M15/M20…), material (PCC/RCC) and the
// structural location/component so the user can still match the right item. Never returns
// something useless like just "Providing and laying".
function shortItemName(full?: string | null): string {
  if (!full) return "";
  let s = String(full).replace(/\s+/g, " ").trim();

  // 1) Strip leading boilerplate verbs/phrases (repeatedly, in case they stack).
  const PREFIXES = [
    /^providing\s*(&|and)\s*laying\s*(in\s*position\s*)?(of\s*)?/i,
    /^providing\s*(&|and)\s*fixing\s*(of\s*)?/i,
    /^providing\s*(&|and)\s*casting\s*(of\s*)?/i,
    /^providing,?\s*laying\s*(&|and)?\s*(compacting|finishing)?\s*(of\s*)?/i,
    /^providing\s*(of\s*)?/i,
    /^supplying\s*(&|and)\s*(laying|fixing|installing|stacking)?\s*(of\s*)?/i,
    /^supply\s*(&|and)\s*(laying|fixing)?\s*(of\s*)?/i,
    /^construction\s*of\s*/i,
    /^constructing\s*(of\s*)?/i,
    /^laying\s*(of\s*)?/i,
    /^casting\s*(of\s*)?/i,
    /^fixing\s*(of\s*)?/i,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of PREFIXES) {
      const next = s.replace(re, "");
      if (next !== s) { s = next.trim(); changed = true; }
    }
  }

  // 2) Cut trailing boilerplate (rate / "complete as per…" / leads & lifts / etc.).
  s = s.split(/\b(complete as per|as per drawing|as per technical|as per specification|including all lead|including all lift|all complete|at all (heights|leads|lifts)|including cost of|excluding cost of|i\/c\b|incl\.? )/i)[0].trim();

  // 3) Trim trailing connectors/punctuation.
  s = s.replace(/[,;:.\-\s]+$/, "").trim();

  // 4) Safety nets.
  if (s.length < 4) return String(full).replace(/\s+/g, " ").trim().slice(0, 60);
  if (s.length > 80) s = s.slice(0, 80).replace(/\s+\S*$/, "") + "…";
  return s;
}

// Steps for the mobile-first guided DPR flow (Phase 1 UX facelift). Each step
// maps to one or more of the existing form sections below — no new business
// logic, just a different presentation shell around the same state/handlers.
const GUIDED_STEPS = [
  { key: "setup", label: "Today's Work" },
  { key: "activity", label: "Work Item & Qty" },
  { key: "labour", label: "Labour" },
  { key: "equipment", label: "Equipment" },
  { key: "materials", label: "Materials" },
  { key: "review", label: "Remarks & Submit" },
] as const;

export default function SiteEntry() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  // Honor ?returnTo= so SiteHome/FieldHome/SiteDashboard each get their own
  // landing back.  Fall back to appendOrigin for portal (estimator) users.
  const _urlParams = new URLSearchParams(searchStr);
  const returnTo = _urlParams.get("returnTo") ?? null;
  const backLink = returnTo ?? appendOrigin("/site/dashboard");
  const [showPreview, setShowPreview] = useState(false);
  const [overBalanceWarnings, setOverBalanceWarnings] = useState<string[] | null>(null);

  // ── Guided mobile mode (Phase 1 UX facelift) ──────────────────────────
  // Engineers on mobile land on a simplified one-step-at-a-time flow by
  // default; anyone can switch back to the classic full-page layout, and the
  // choice is remembered for the session. Managers/admins always keep the
  // classic layout unless they explicitly opt into guided mode.
  //
  // Role decides whether guided entry is the default (field engineers get
  // it on every device — mobile, tablet, or desktop); device only decides
  // how the guided steps are laid out (see `deviceType` below and
  // `showStep`/step Card widths further down). Was keyed off `!isManager`,
  // which is true for every non-admin authenticated user, so this never
  // actually triggered for anyone logged in. Now keyed off the explicit
  // isFieldEngineer flag, which defaults to false so existing users see no
  // behavior change.
  const isMobileViewport = useIsMobile();
  const deviceType = useDeviceType();
  const { isAdmin, isFieldEngineer } = useAuth();
  const [guidedOverride, setGuidedOverride] = useState<boolean | null>(null);
  const defaultGuided = !isAdmin && isFieldEngineer;
  const guidedMode = guidedOverride ?? defaultGuided;
  const [guidedStep, setGuidedStep] = useState(0);
  const [remarksNote, setRemarksNote] = useState("");
  // Photos are staged locally until the DPR is saved (it needs a DB id
  // before an attachment can be linked to it), then uploaded in one batch.
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([]);
  const { uploadFile } = useUpload();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const addStagedPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    const valid = Array.from(files).filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: "File too large", description: `${f.name} exceeds 15MB.`, variant: "destructive" });
        return false;
      }
      if (!f.type.startsWith("image/")) {
        toast({ title: "Unsupported file", description: `${f.name} must be an image.`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setStagedPhotos((prev) => [...prev, ...valid]);
  };
  const removeStagedPhoto = (idx: number) => setStagedPhotos((prev) => prev.filter((_, i) => i !== idx));
  const uploadStagedPhotos = async (dprId: number) => {
    for (const file of stagedPhotos) {
      const uploadResponse = await uploadFile(file);
      if (!uploadResponse) continue;
      try {
        await apiRequest("POST", "/api/attachments", {
          moduleType: "dpr_progress",
          linkedRecordId: dprId,
          siteId: selectedSiteId ?? null,
          boqProjectId: header.boqProjectId ?? null,
          fileName: file.name,
          objectPath: uploadResponse.objectPath,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        });
      } catch {
        // Non-fatal — DPR is already saved; surface via toast but don't block navigation.
        toast({ title: "Some photos failed to attach", description: file.name, variant: "destructive" });
      }
    }
  };
  const showStep = (n: number) => !guidedMode || guidedStep === n;
  const goToStep = (n: number) => setGuidedStep(Math.max(0, Math.min(GUIDED_STEPS.length - 1, n)));

  // Fetch equipment master for unified equipment tracking
  const { data: equipmentMaster } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment", "all"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/equipment?includeInactive=true");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  // Fetch sites master for dropdown
  const { data: sitesList = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });
  const activeSites = sitesList.filter(s => s.isActive);

  // Filter to only active equipment
  const activeEquipment = equipmentMaster?.filter(e => e.isActive) || [];

  const [header, setHeader] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    site: "",
    engineer: "",
    boqProjectId: null as number | null,
  });

  // Resolve numeric siteId from selected site name (must be after `header`)
  const selectedSiteId = useMemo(() => {
    if (!header.site) return null;
    return sitesList.find((s) => s.name === header.site)?.id ?? null;
  }, [header.site, sitesList]);

  // Find the BOQ project(s) linked to this site (if any)
  const { data: siteBoqProjects = [] } = useQuery<Array<{ id: number; name: string; status?: string; barCount?: number; itemCount?: number }>>({
    queryKey: ["/api/boq/projects", selectedSiteId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects?siteId=${selectedSiteId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!selectedSiteId,
  });

  // Priority: 1. active + has bars  2. any active  3. first (newest) in list
  const resolvedBoqProjectId = useMemo(() => {
    if (siteBoqProjects.length === 0) return null;
    const activeWithBars = siteBoqProjects.find(
      (p) => p.status === "active" && (p.barCount ?? 0) > 0
    );
    if (activeWithBars) return activeWithBars.id;
    const active = siteBoqProjects.find((p) => p.status === "active");
    if (active) return active.id;
    return siteBoqProjects[0].id;
  }, [siteBoqProjects]);

  // Sync resolved project explicitly into header state so the DPR carries the
  // right project ID as a first-class field, not an implicit computation at
  // submit time.
  useEffect(() => {
    setHeader((h) => ({ ...h, boqProjectId: resolvedBoqProjectId }));
  }, [resolvedBoqProjectId]);

  // Site Access filtering (part of Task #1247 follow-up): /api/sites already
  // returns only the sites this user is permitted to see. When a restricted
  // user has exactly one permitted site, auto-select it so they never have
  // to hunt through a dropdown — this is the "File Now" prefill requirement.
  useEffect(() => {
    if (activeSites.length === 1 && !header.site) {
      setHeader((h) => ({ ...h, site: activeSites[0].name }));
    }
  }, [activeSites, header.site]);

  const siteBoqProjectId = header.boqProjectId;

  const siteBoqProjectName = useMemo(() => {
    if (!siteBoqProjectId) return null;
    return siteBoqProjects.find((p) => p.id === siteBoqProjectId)?.name ?? null;
  }, [siteBoqProjectId, siteBoqProjects]);

  // Fetch items of that BOQ project
  const { data: siteBoqItems = [] } = useQuery<SiteBoqItem[]>({
    queryKey: ["/api/boq/projects", siteBoqProjectId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${siteBoqProjectId}/items`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!siteBoqProjectId,
  });

  // ── Phase 2: Programme-linked DPR entry ────────────────────────────────
  // Reuses the existing Work Programme + Plan vs Actual read endpoints (no new
  // backend logic) so DPR rows can be tied to a planned BOQ item / structure
  // location, with planned/previous/balance quantities shown inline.
  const { data: programmeBars = [] } = useQuery<ProgrammeBar[]>({
    queryKey: ["/api/boq/projects", siteBoqProjectId, "programme"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${siteBoqProjectId}/programme`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!siteBoqProjectId,
  });

  // Phase 3: BOM recipe data (materials/equipment/labour per BOQ item) used to
  // surface "planned for this item" while entering actuals. Read-only reuse of
  // the existing BOM & Demand endpoint — no new backend logic.
  const { data: bomData } = useQuery<{ items: BomInputItem[]; bars: BomInputBar[] }>({
    queryKey: ["/api/boq/projects", siteBoqProjectId, "bom"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${siteBoqProjectId}/bom`, { credentials: "include" });
      return res.ok ? res.json() : { items: [], bars: [] };
    },
    enabled: !!siteBoqProjectId,
  });

  // Planned key materials / equipment / labour for a single BOQ item (optionally
  // scoped to one structure location), computed with the same engine used on the
  // BOM & Demand page — just filtered down to one item + its bars.
  const getPlannedDemandForItem = (boqItemId: number | null | undefined, structureId?: string | null) => {
    if (boqItemId == null || !bomData?.items?.length) return null;
    const item = bomData.items.find((i) => i.id === boqItemId);
    if (!item) return null;
    let itemBars = bomData.bars.filter((b) => b.boqItemId === boqItemId);
    if (structureId) {
      const barsWithStructure = programmeBars.filter((b) => b.boqItemId === boqItemId && b.structureId === structureId);
      if (barsWithStructure.length) {
        itemBars = barsWithStructure.map((b) => ({
          boqItemId: b.boqItemId,
          chainageFrom: b.chainageFrom,
          chainageTo: b.chainageTo,
          plannedQty: b.plannedQty,
          isQtyOverride: true,
        }));
      }
    }
    const result = calculateBomDemand([item], itemBars, 60);
    if (!result.materials.length && !result.equipment.length && !result.labour.length) return null;
    return result;
  };

  const { data: planVsActualRows = [] } = useQuery<PlanVsActualRow[]>({
    queryKey: ["/api/boq/projects", siteBoqProjectId, "plan-vs-actual", header.date],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${siteBoqProjectId}/plan-vs-actual?asOf=${header.date}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!siteBoqProjectId && !!header.date,
  });

  const planVsActualByItem = useMemo(() => {
    const m = new Map<number, PlanVsActualRow>();
    planVsActualRows.forEach((r) => m.set(r.boqItemId, r));
    return m;
  }, [planVsActualRows]);

  // Planned/previous/balance for a BOQ item, "as of" the DPR's date. Balance is
  // project-level (BOQ qty - cumulative actual so far), matching the same figure
  // shown on the BOM & Demand / Plan-vs-Actual pages.
  const balanceInfo = (boqItemId: number | null | undefined) => {
    if (boqItemId == null) return null;
    const row = planVsActualByItem.get(boqItemId);
    if (!row) return null;
    const balance = Math.round((row.currentQty - row.totalActual) * 1000) / 1000;
    return { ...row, balance };
  };

  // Road programme bars covering the DPR's date (excludes imported structure-location bars).
  const activeRoadBars = useMemo(() => {
    return programmeBars.filter((b) => {
      if (b.planningMode === "structure_location") return false;
      if (!b.startDate || !b.endDate) return true; // no calendar dates on the bar → can't tell, don't flag as unplanned
      return header.date >= b.startDate && header.date <= b.endDate;
    });
  }, [programmeBars, header.date]);

  const activeRoadBarsByItem = useMemo(() => {
    const m = new Map<number, ProgrammeBar[]>();
    activeRoadBars.forEach((b) => {
      const list = m.get(b.boqItemId) ?? [];
      list.push(b);
      m.set(b.boqItemId, list);
    });
    return m;
  }, [activeRoadBars]);

  const hasRoadProgramme = useMemo(
    () => programmeBars.some((b) => b.planningMode !== "structure_location"),
    [programmeBars],
  );

  // Structure-level actuals: /plan-vs-actual only aggregates per BOQ item across the
  // whole project, but a structure schedule can plan the same BOQ item at multiple
  // structures (e.g. "RCC M25" at Culvert-1 and Culvert-2). To track balance per
  // structure we reuse the existing (read-only) /api/dprs/with-details endpoint and
  // aggregate previously-saved structure items ourselves — no new backend route.
  const { data: allDprsWithDetails = [] } = useQuery<Array<{ boqProjectId: number | null; date: string; structureItems: Array<{ boqItemId: number | null; structureId: string | null; quantity: number | null; dprConversionFactor: number | null }> }>>({
    queryKey: ["/api/dprs/with-details"],
    queryFn: async () => {
      const res = await fetch(`/api/dprs/with-details`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!siteBoqProjectId,
  });

  const structureActualByKey = useMemo(() => {
    const m = new Map<string, number>();
    if (!siteBoqProjectId) return m;
    allDprsWithDetails
      .filter((d) => d.boqProjectId === siteBoqProjectId && d.date < header.date)
      .forEach((d) => {
        (d.structureItems || []).forEach((si) => {
          if (si.boqItemId == null || !si.structureId || si.quantity == null) return;
          const key = `${si.boqItemId}::${si.structureId}`;
          const contribution = si.quantity * (si.dprConversionFactor ?? 1);
          m.set(key, Math.round(((m.get(key) ?? 0) + contribution) * 1000) / 1000);
        });
      });
    return m;
  }, [allDprsWithDetails, siteBoqProjectId, header.date]);

  // Planned/previous/balance scoped to a specific structure + BOQ item pair, using
  // the bar's own plannedQty (per-structure) rather than the project-wide BOQ total.
  const structureBalanceInfo = (structureId: string | null | undefined, boqItemId: number | null | undefined) => {
    if (!structureId || boqItemId == null) return null;
    const loc = structureLocations.find((s) => s.structureId === structureId);
    const bar = loc?.bars.find((b) => b.boqItemId === boqItemId);
    if (!bar) return null;
    const boqItem = siteBoqItems.find((bi) => bi.id === boqItemId);
    const unit = boqItem?.unit ?? "";
    const totalActual = structureActualByKey.get(`${boqItemId}::${structureId}`) ?? 0;
    const balance = Math.round((bar.plannedQty - totalActual) * 1000) / 1000;
    return { currentQty: bar.plannedQty, totalActual, balance, unit };
  };

  // Structure-schedule locations imported via the Structure Schedule Import wizard.
  const structureLocations = useMemo(() => {
    const m = new Map<string, { structureId: string; structureLocType: string | null; bars: ProgrammeBar[] }>();
    programmeBars.forEach((b) => {
      if (b.planningMode !== "structure_location" || !b.structureId) return;
      const entry = m.get(b.structureId) ?? { structureId: b.structureId, structureLocType: b.structureLocType, bars: [] };
      entry.bars.push(b);
      m.set(b.structureId, entry);
    });
    return Array.from(m.values());
  }, [programmeBars]);

  // Renders inline Planned / Done-so-far / Balance chips for a linked BOQ item,
  // flagging (non-blocking) when the given quantity would push actual past balance.
  // Pass `overrideInfo` (e.g. from structureBalanceInfo) to scope to a specific
  // structure/bar instead of the project-wide BOQ item total.
  const renderBalanceChips = (
    boqItemId: number | null | undefined,
    qty: number | null,
    overrideInfo?: { currentQty: number; totalActual: number; balance: number; unit: string } | null,
  ) => {
    const info = overrideInfo !== undefined ? overrideInfo : balanceInfo(boqItemId);
    if (!info) return null;
    const over = qty != null && qty > info.balance + 0.0001;
    return (
      <div className={`text-xs mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 ${over ? "text-amber-700" : "text-slate-500"}`}>
        <span>Planned: {info.currentQty} {info.unit}</span>
        <span>Done so far: {info.totalActual} {info.unit}</span>
        <span className={over ? "font-semibold" : ""}>Balance: {info.balance} {info.unit}</span>
        {over && (
          <span className="inline-flex items-center gap-1 font-semibold" data-testid="badge-over-balance">
            <AlertTriangle className="w-3 h-3" /> Exceeds balance
          </span>
        )}
      </div>
    );
  };

  // Structure BOQ-item helpers — link each structure DPR row to the right BOQ line.
  const STRUCTURE_KW = /culvert|bridge|\brcc\b|\bpsc\b|\brob\b|\bvup\b|\blup\b|girder|abutment|\bpier\b|\bdeck\b|\bbox\b|\bslab\b|\bpile\b|retaining|breast\s*wall|\bdrain\b|\bcd\b\s*work|head\s*wall|wing\s*wall|parapet|foundation|footing|protection\s*work|excavation|back\s*fill/i;
  const isStructureBoqItem = (bi: any) =>
    STRUCTURE_KW.test(`${bi.categoryName ?? ""} ${bi.itemName ?? ""} ${bi.description ?? ""}`);

  // Map DPR structure vocabulary -> likely BOQ wording so e.g. "RCC M25" matches "M25",
  // "Excavation" matches "earthwork in excavation", "Pier-Abutment" matches "pier"/"column".
  const STRUCT_SYNONYMS: Record<string, string[]> = {
    excavation: ["excavation", "earthwork", "earth work", "excavating"],
    pcc: ["pcc", "plain cement concrete", "lean concrete", "levelling course", "leveling course"],
    rcc: ["rcc", "reinforced cement concrete", "cement concrete", "reinforced concrete"],
    "rcc m20": ["m20", "m 20", "m-20"], "rcc m25": ["m25", "m 25", "m-25"],
    "rcc m30": ["m30", "m 30", "m-30"], "rcc m35": ["m35", "m 35", "m-35"],
    shuttering: ["shuttering", "formwork", "form work", "centering", "staging"],
    "de-shuttering": ["shuttering", "formwork"],
    backfilling: ["backfill", "back fill", "filling", "granular fill"],
    foundation: ["foundation", "footing", "open foundation", "raft", "pile cap"],
    "pier-abutment": ["pier", "abutment", "column", "substructure", "sub-structure"],
    "pier cap": ["pier cap", "cap", "bed block"],
    girder: ["girder", "beam", "psc", "prestressed"],
    "deck slab": ["deck", "slab"],
    "wearing coat": ["wearing coat", "wearing course"],
    culvert: ["culvert", "hume pipe", "rcc pipe", "np3", "np4", "box cell", "box culvert", "slab culvert"],
    bridge: ["bridge", "viaduct", "rob", "vup", "lup"],
    drain: ["drain", "chute", "catch water", "lined drain", "kerb"],
    "retaining wall": ["retaining wall", "breast wall", "reinforced earth", "re wall"],
    "cd work": ["culvert", "cross drainage", "cd work", "pipe"],
  };
  const expandTokens = (phrase: string): string[] => {
    const p = (phrase || "").toLowerCase().trim();
    if (!p || p === "other") return [];
    const out = new Set<string>();
    if (STRUCT_SYNONYMS[p]) STRUCT_SYNONYMS[p].forEach((s) => out.add(s));
    p.split(/\s+/).forEach((t) => { if (t.length > 2) out.add(t); });
    return [...out];
  };

  // Rank BOQ items by relevance to the WHOLE structure context. Never returns empty,
  // and always keeps the already-selected item in the list.
  const structureBoqItemsFor = (row: any) => {
    const structOnly = siteBoqItems.filter(isStructureBoqItem);
    const base = structOnly.length ? structOnly : siteBoqItems;
    const score = (bi: any) => {
      const hay = `${bi.itemCode ?? ""} ${bi.itemName ?? ""} ${bi.description ?? ""} ${(bi as any).categoryName ?? ""}`.toLowerCase();
      let s = 0;
      expandTokens(row.itemOfWork).forEach((t) => { if (hay.includes(t)) s += 5; });
      expandTokens(row.stage).forEach((t) => { if (hay.includes(t)) s += 3; });
      expandTokens(row.structureSubType).forEach((t) => { if (hay.includes(t)) s += 2; });
      expandTokens(row.structureType).forEach((t) => { if (hay.includes(t)) s += 2; });
      return s;
    };
    const scored = base.map((bi) => ({ bi, s: score(bi) }));
    const relevant = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.bi);
    let result = relevant.length ? relevant : base;
    if (row.boqItemId != null && !result.some((bi: any) => bi.id === row.boqItemId)) {
      const sel = siteBoqItems.find((bi) => bi.id === row.boqItemId);
      if (sel) result = [sel, ...result];
    }
    return result;
  };

  const { data: personnelList } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel"],
  });

  const [addPersonnelOpen, setAddPersonnelOpen] = useState(false);
  const [newPersonnelName, setNewPersonnelName] = useState("");
  const [newPersonnelRole, setNewPersonnelRole] = useState("Engineer");
  const [newPersonnelPhone, setNewPersonnelPhone] = useState("");
  // Task #1247 — tracks which "+ New Personnel" trigger opened the dialog so
  // the newly created person can be auto-attached to that exact target on
  // success, instead of just closing the dialog with no linkage. `null`
  // means no specific target (dialog opened generically) — in that case we
  // just refresh the list, matching the previous behavior.
  type PersonnelAddTarget = { kind: "header" } | { kind: "progressRow"; idx: number };
  const [personnelAddTarget, setPersonnelAddTarget] = useState<PersonnelAddTarget | null>(null);
  const [duplicatePersonnel, setDuplicatePersonnel] = useState<Personnel | null>(null);

  // Attach a person (existing or newly created) to whichever target opened
  // the "+ New Personnel" dialog, then reset the dialog state.
  const attachPersonnelToTarget = useCallback((person: Personnel) => {
    const target = personnelAddTarget;
    setPersonnelAddTarget(null);
    if (target?.kind === "header") {
      setHeader((h) => ({ ...h, engineer: `${person.name.toUpperCase()} - ${person.role.toUpperCase()}` }));
    } else if (target?.kind === "progressRow") {
      setProgress((prev) => {
        const updated = [...prev];
        const row = updated[target.idx];
        if (row && !row.personnelIds.includes(person.id)) {
          updated[target.idx] = { ...row, personnelIds: [...row.personnelIds, person.id] };
        }
        return updated;
      });
    }
  }, [personnelAddTarget]);

  const createPersonnelMutation = useMutation({
    mutationFn: async (data: { name: string; role: string; phone?: string }) => {
      const res = await fetch("/api/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: any = new Error(body?.message || `Failed to add personnel (${res.status})`);
        err.status = res.status;
        err.existingPersonnel = body?.existingPersonnel;
        throw err;
      }
      return body as Personnel;
    },
    onSuccess: (created: Personnel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/personnel"] });
      setAddPersonnelOpen(false);
      setNewPersonnelName("");
      setNewPersonnelRole("Engineer");
      setNewPersonnelPhone("");
      attachPersonnelToTarget(created);
      toast({ title: "Personnel added" });
    },
    onError: (err: any) => {
      if (err?.status === 409 && err?.existingPersonnel) {
        setDuplicatePersonnel(err.existingPersonnel);
        toast({
          title: "Personnel already exists",
          description: err.message,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Couldn't add personnel",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  // When the backend reports a duplicate name, let the user attach the
  // existing person to their target with one click instead of dead-ending.
  const useExistingPersonnel = useCallback((person: Personnel) => {
    setAddPersonnelOpen(false);
    setNewPersonnelName("");
    setNewPersonnelRole("Engineer");
    setNewPersonnelPhone("");
    attachPersonnelToTarget(person);
    toast({ title: `${person.name} selected` });
  }, [attachPersonnelToTarget, toast]);

  const [progress, setProgress] = useState<ProgressEntry[]>([
    { activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [], boqItemId: null }
  ]);

  const [equipment, setEquipment] = useState<EquipmentEntry[]>([
    { machine: "", vehicleNo: "", operator: "", task: "", entryType: "time_meter", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null, numberOfTrips: null, tripDistance: null, totalKm: null, waterQuantity: null, boqItemId: null, structureId: null }
  ]);

  const [labour, setLabour] = useState<LabourEntry[]>([
    { category: "Skilled", gender: "Male", count: 0, task: "", contractor: "", boqItemId: null, structureId: null }
  ]);

  // Actual material consumption/issue captured against a work item, for Plan
  // vs Actual comparison. Bulk material deliveries by vehicle trip continue to
  // be tracked separately in the Materials Received tab; this section is for
  // recording what was actually consumed/issued against a planned BOQ item.
  const [materials, setMaterials] = useState<MaterialEntry[]>([]);

  const [sitePurchases, setSitePurchases] = useState<SitePurchaseEntry[]>([]);

  const lockedWorkType = useMemo(() => {
    const t = new URLSearchParams(window.location.search).get("type");
    return t === "structure" ? "structure" : t === "road" ? "road" : null;
  }, []);
  const [workType, setWorkType] = useState<string>(lockedWorkType ?? "road");
  const workTypeTouchedRef = useRef(!!lockedWorkType);

  // Derive road-only/structure-only default (and toggle visibility) from the
  // site's own BOQ items when the DPR wasn't opened via a locked ?type= link.
  const boqWorkTypeHint = useMemo<"road" | "structure" | null>(() => {
    if (!siteBoqItems.length) return null;
    // Only infer a lock when every item is EXPLICITLY classified. An item with a
    // missing/null planningWorkType is "unclassified", not "road" — treating it
    // as road by default would wrongly lock mixed/unclassified projects to Road.
    if (siteBoqItems.some((bi) => bi.planningWorkType !== "road" && bi.planningWorkType !== "structure")) {
      return null;
    }
    const types = new Set(siteBoqItems.map((bi) => bi.planningWorkType));
    return types.size === 1 ? (types.values().next().value as "road" | "structure") : null;
  }, [siteBoqItems]);

  useEffect(() => {
    if (lockedWorkType) return;
    if (workTypeTouchedRef.current) return;
    if (boqWorkTypeHint) setWorkType(boqWorkTypeHint);
  }, [lockedWorkType, boqWorkTypeHint]);

  const effectiveLockedWorkType = lockedWorkType ?? boqWorkTypeHint;
  const [structureItems, setStructureItems] = useState<StructureItem[]>([
    { structureType: "Culvert", structureSubType: "Pipe Culvert", structureName: "", stage: "Excavation", itemOfWork: "Excavation", quantity: null, uom: "m³", remarks: "" }
  ]);

  const formData = useMemo<SiteEntryFormData>(() => ({
    header,
    workType,
    progress,
    structureItems,
    equipment,
    labour,
    materials,
    sitePurchases,
  }), [header, workType, progress, structureItems, equipment, labour, materials, sitePurchases]);

  const handleRestoreDraft = useCallback((data: SiteEntryFormData) => {
    setHeader(data.header);
    if (data.workType) setWorkType(data.workType);
    setProgress(data.progress);
    if (data.structureItems) setStructureItems(data.structureItems);
    setEquipment(data.equipment);
    setLabour(data.labour);
    if (data.materials) setMaterials(data.materials);
    if (data.sitePurchases) setSitePurchases(data.sitePurchases);
  }, []);

  const { hasDraft, draftAge, lastSavedAt, isDirty, restoreDraft, discardDraft, clearDraft } = useAutosave<SiteEntryFormData>({
    formKey: "site-entry-new",
    data: formData,
    onRestore: handleRestoreDraft,
  });

  const { confirmLeave } = useBeforeUnload(isDirty);

  // Calculate length from chainage if not manually entered
  const getEffectiveLength = (entry: ProgressEntry): number | null => {
    // If length is manually entered, use it
    if (entry.length !== null && entry.length > 0) {
      return entry.length;
    }
    // Otherwise calculate from chainage
    return calculateLengthFromChainage(entry.chainageFrom, entry.chainageTo);
  };

  // UOM follows the linked BOQ item's unit; qty is computed only from the dimensions
  // that unit requires. Count/weight units (Nos, MT…) keep a manual quantity.
  const progressUom = (entry: ProgressEntry): string | null => {
    const boqItem = entry.boqItemId != null ? siteBoqItems.find(i => i.id === entry.boqItemId) : null;
    if (boqItem) {
      const prof = boqUomProfile(boqItem.unit);
      if (prof.dimClass !== "count") return prof.uom;
      return UOM_OPTIONS.includes(prof.uom) ? prof.uom : "NOS";
    }
    return deriveDprUom(getEffectiveLength(entry), entry.width, entry.thickness);
  };

  const calculateQuantity = (entry: ProgressEntry): number | null => {
    const length = getEffectiveLength(entry);
    const boqItem = entry.boqItemId != null ? siteBoqItems.find(i => i.id === entry.boqItemId) : null;
    if (boqItem) {
      const prof = boqUomProfile(boqItem.unit);
      entry.uom = progressUom(entry) ?? entry.uom;
      if (prof.dimClass === "volume") return (length && entry.width && entry.thickness) ? length * entry.width * entry.thickness : (entry.quantity ?? null);
      if (prof.dimClass === "area") return (length && entry.width) ? length * entry.width : (entry.quantity ?? null);
      if (prof.dimClass === "length") return length ?? (entry.quantity ?? null);
      return entry.quantity ?? null; // count / weight → manual
    }
    const derivedUom = deriveDprUom(length, entry.width, entry.thickness);
    if (derivedUom) { entry.uom = derivedUom; return computeDprQty(length, entry.width, entry.thickness); }
    return entry.quantity ?? null;
  };

  const calculateHours = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 0;
    try {
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      const startMins = startHour * 60 + startMin;
      const endMins = endHour * 60 + endMin;
      const diff = endMins - startMins;
      return diff > 0 ? diff / 60 : 0;
    } catch {
      return 0;
    }
  };

  // Calculate hours from meter readings (meter readings take priority over time entry)
  const calculateMeterHours = (openingReading: number | null, closingReading: number | null): number | null => {
    if (openingReading === null || closingReading === null) return null;
    const diff = closingReading - openingReading;
    return diff >= 0 ? diff : null;
  };

  // Get working hours - prefer meter reading if available, else time
  const getWorkingHours = (entry: EquipmentEntry): number => {
    const meterHours = calculateMeterHours(entry.openingReading, entry.closingReading);
    if (meterHours !== null) return meterHours;
    return calculateHours(entry.startTime, entry.endTime);
  };

  const getTotalDiesel = (): number => {
    return equipment.reduce((sum, e) => sum + (e.diesel || 0), 0);
  };

  const getMaterialsAbstract = () => {
    const grouped: Record<string, { material: string; uom: string; trips: number; total: number }> = {};
    materials.forEach(m => {
      if (!m.material) return;
      const key = `${m.material}|${m.uom}`;
      if (!grouped[key]) {
        grouped[key] = { material: m.material, uom: m.uom, trips: 0, total: 0 };
      }
      grouped[key].trips += 1;
      grouped[key].total += m.quantity || 0;
    });
    return Object.values(grouped);
  };

  const addRow = (section: 'progress' | 'equipment' | 'labour' | 'materials') => {
    if (section === 'progress') {
      setProgress([...progress, { activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [], boqItemId: null }]);
    } else if (section === 'equipment') {
      setEquipment([...equipment, { machine: "", vehicleNo: "", operator: "", task: "", entryType: "time_meter", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null, numberOfTrips: null, tripDistance: null, totalKm: null, waterQuantity: null, boqItemId: null, structureId: null }]);
    } else if (section === 'labour') {
      setLabour([...labour, { category: "Skilled", gender: "Male", count: 0, task: "", contractor: "", boqItemId: null, structureId: null }]);
    } else if (section === 'materials') {
      setMaterials([...materials, { type: "Issued", material: "", quantity: null, uom: "", vehicleNumber: "", supplier: "", location: "", receiptNumber: "", boqItemId: null, structureId: null }]);
    }
  };

  const removeRow = (section: 'progress' | 'equipment' | 'labour' | 'materials', index: number) => {
    if (section === 'progress' && progress.length > 1) {
      setProgress(progress.filter((_, i) => i !== index));
    } else if (section === 'equipment' && equipment.length > 1) {
      setEquipment(equipment.filter((_, i) => i !== index));
    } else if (section === 'labour' && labour.length > 1) {
      setLabour(labour.filter((_, i) => i !== index));
    } else if (section === 'materials') {
      setMaterials(materials.filter((_, i) => i !== index));
    }
  };

  const updateMaterial = (index: number, field: keyof MaterialEntry, value: any) => {
    const updated = [...materials];
    (updated[index] as any)[field] = value;
    setMaterials(updated);
  };

  const addSitePurchase = () => {
    setSitePurchases([...sitePurchases, { itemDescription: "", vendor: "", billNo: "", amount: null, quantity: null, uom: "" }]);
  };

  const removeSitePurchase = (index: number) => {
    setSitePurchases(sitePurchases.filter((_, i) => i !== index));
  };

  const updateSitePurchase = (index: number, field: keyof SitePurchaseEntry, value: any) => {
    const updated = [...sitePurchases];
    (updated[index] as any)[field] = value;
    setSitePurchases(updated);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const progressWithCalc = progress.map(p => {
        const effectiveLength = getEffectiveLength(p);
        return {
          ...p,
          length: effectiveLength,
          quantity: p.quantity || calculateQuantity(p)
        };
      });

      // Send client's local timestamp for accurate time display
      const clientTimestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

      const normalizedEquipment = equipment.map(eq => ({
        ...eq,
        totalKm: eq.entryType === "trip_based" && eq.numberOfTrips && eq.tripDistance
          ? Number(eq.numberOfTrips) * Number(eq.tripDistance) * 2 : eq.totalKm || null,
      }));

      const response = await apiRequest("POST", "/api/dprs", {
        date: header.date,
        site: header.site,
        engineer: header.engineer,
        role: "engineer",
        workType,
        boqProjectId: header.boqProjectId ?? undefined,
        progress: workType === "structure" ? [] : progressWithCalc,
        structureItems: workType === "structure"
          ? structureItems.filter(s => s.structureType && s.itemOfWork).map(s => ({
              ...s,
              structureId: s.programmeStructureId ?? null,
            }))
          : [],
        equipment: normalizedEquipment,
        labour,
        materials: materials.filter(m => m.material),
        sitePurchases: sitePurchases.filter(sp => sp.itemDescription),
        remarks: remarksNote.trim() || undefined,
        clientTimestamp,
      });
      return response.json();
    },
    onSuccess: async (data) => {
      await clearDraft();
      if (stagedPhotos.length > 0) {
        await uploadStagedPhotos(data.id);
        queryClient.invalidateQueries({ queryKey: ["/api/attachments", "dpr_progress", data.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      toast({
        title: "Report Saved Successfully",
        description: "Your site report has been submitted.",
      });
      // Forward returnTo into SiteSuccess so its "Back to Home" button also
      // goes to the right landing page.
      const successBase = `/site/success/${data.id}?type=${workType}`;
      const successUrl = returnTo
        ? `${successBase}&returnTo=${encodeURIComponent(returnTo)}`
        : appendOrigin(successBase);
      setLocation(successUrl);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save report. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePreview = () => {
    if (!header.site || !header.engineer) {
      toast({
        title: "Missing Information",
        description: "Please fill in site name and engineer name.",
        variant: "destructive",
      });
      return;
    }
    setShowPreview(true);
  };

  // Returns true when all "end-of-day" mandatory fields are filled and
  // the DPR is ready for final submission. Returns false while any
  // opening-only entry is still missing its closing counterpart.
  const isFormComplete = (): boolean => {
    for (const p of progress) {
      if (p.chainageFrom && !p.chainageTo) return false;
    }
    for (const e of equipment) {
      if (!e.machine) continue;
      if (e.openingReading !== null && e.closingReading === null) return false;
      if (e.startTime && !e.endTime) return false;
    }
    return true;
  };

  const draftMutation = useMutation({
    mutationFn: async () => {
      const progressWithCalc = progress.map(p => {
        const effectiveLength = getEffectiveLength(p);
        return { ...p, length: effectiveLength, quantity: p.quantity || calculateQuantity(p) };
      });
      const clientTimestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
      const normalizedEquipment = equipment.map(eq => ({
        ...eq,
        totalKm: eq.entryType === "trip_based" && eq.numberOfTrips && eq.tripDistance
          ? Number(eq.numberOfTrips) * Number(eq.tripDistance) * 2 : eq.totalKm || null,
      }));
      const response = await apiRequest("POST", "/api/dprs", {
        date: header.date,
        site: header.site,
        engineer: header.engineer,
        role: "engineer",
        workType,
        boqProjectId: header.boqProjectId ?? undefined,
        dprStatus: "draft",
        progress: workType === "structure" ? [] : progressWithCalc,
        structureItems: workType === "structure"
          ? structureItems.filter(s => s.structureType && s.itemOfWork).map(s => ({
              ...s, structureId: s.programmeStructureId ?? null,
            }))
          : [],
        equipment: normalizedEquipment,
        labour,
        materials: materials.filter(m => m.material),
        sitePurchases: sitePurchases.filter(sp => sp.itemDescription),
        remarks: remarksNote.trim() || undefined,
        clientTimestamp,
      });
      return response.json();
    },
    onSuccess: async (data) => {
      await clearDraft();
      if (stagedPhotos.length > 0) {
        await uploadStagedPhotos(data.id);
        queryClient.invalidateQueries({ queryKey: ["/api/attachments", "dpr_progress", data.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      toast({
        title: "Draft Saved",
        description: "Your draft DPR is saved. Open it from Field Home to complete and submit.",
      });
      const draftUrl = returnTo
        ? `/site/edit/${data.id}?draft&returnTo=${encodeURIComponent(returnTo)}`
        : `/site/edit/${data.id}?draft`;
      setLocation(draftUrl);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save draft. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveDraft = () => {
    if (!header.site || !header.engineer) {
      toast({
        title: "Missing Information",
        description: "Please fill in site name and engineer name before saving.",
        variant: "destructive",
      });
      return;
    }
    draftMutation.mutate();
  };

  // Non-blocking check: warns (with a confirm step) when a row's quantity would
  // push the linked BOQ item's cumulative actual past its planned balance.
  const getOverBalanceWarnings = (): string[] => {
    const warnings: string[] = [];
    const rows: Array<{ boqItemId: number | null | undefined; qty: number | null; structureId?: string | null }> =
      workType === "structure"
        ? structureItems.map((s) => ({ boqItemId: s.boqItemId, qty: s.quantity, structureId: s.programmeStructureId }))
        : progress.map((p) => ({ boqItemId: p.boqItemId, qty: p.quantity ?? calculateQuantity(p) }));
    rows.forEach((r) => {
      if (r.boqItemId == null || r.qty == null) return;
      const info = r.structureId ? structureBalanceInfo(r.structureId, r.boqItemId) : balanceInfo(r.boqItemId);
      if (!info) return;
      if (r.qty > info.balance + 0.0001) {
        const boqItem = siteBoqItems.find((b) => b.id === r.boqItemId);
        const label = boqItem?.itemCode || boqItem?.itemName || boqItem?.description || "This item";
        const scope = r.structureId ? ` at ${r.structureId}` : "";
        warnings.push(`${label}${scope}: entering ${r.qty} ${info.unit} exceeds the remaining balance of ${info.balance} ${info.unit}`);
      }
    });
    return warnings;
  };

  const handleSubmit = () => {
    if (workType !== "structure") {
      for (let i = 0; i < progress.length; i++) {
        const p = progress[i];
        if (p.noSiteWork || p.boqItemId == null) continue;
        const boqItem = siteBoqItems.find(it => it.id === p.boqItemId);
        if (!boqItem) continue;
        const prof = boqUomProfile(boqItem.unit);
        const L = getEffectiveLength(p);
        const missing: string[] = [];
        if (prof.dims.includes("L") && !(L && L > 0)) missing.push("Length");
        if (prof.dims.includes("W") && !(p.width && p.width > 0)) missing.push("Width");
        if (prof.dims.includes("T") && !(p.thickness && p.thickness > 0)) missing.push("Thickness");
        if (prof.dimClass === "count" && !(p.quantity && p.quantity > 0)) missing.push(`Quantity (${prof.uom})`);
        if (missing.length) {
          toast({
            title: `Row ${i + 1}: missing ${prof.uom} input`,
            description: `${boqItem.itemCode ? boqItem.itemCode + " · " : ""}This item is measured in ${boqItem.unit}. Please enter ${missing.join(", ")} before saving.`,
            variant: "destructive",
          });
          return;
        }
      }
    }
    const warnings = getOverBalanceWarnings();
    if (warnings.length > 0) {
      setOverBalanceWarnings(warnings);
      return;
    }
    createMutation.mutate();
  };

  const getPreviewData = () => {
    return {
      date: header.date,
      site: header.site,
      engineer: header.engineer,
      progress: progress.map(p => {
        const effectiveLength = getEffectiveLength(p);
        return {
          ...p,
          length: effectiveLength,
          quantity: p.quantity || calculateQuantity(p)
        };
      }),
      equipment,
      labour,
      materials,
      sitePurchases,
      totalDiesel: getTotalDiesel(),
      materialsAbstract: getMaterialsAbstract(),
    };
  };

  const overBalanceDialog = (
    <Dialog open={!!overBalanceWarnings} onOpenChange={(open) => { if (!open) setOverBalanceWarnings(null); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5" /> Over Planned Balance
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2 text-sm">
          <p className="text-muted-foreground">
            The following entries exceed the remaining planned balance. You can still save this report if this is intentional (e.g. re-measurement or programme revision).
          </p>
          <ul className="list-disc pl-5 space-y-1" data-testid="list-over-balance-warnings">
            {(overBalanceWarnings ?? []).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOverBalanceWarnings(null)} data-testid="button-cancel-over-balance">Cancel</Button>
          <Button
            onClick={() => {
              setOverBalanceWarnings(null);
              createMutation.mutate();
            }}
            data-testid="button-confirm-over-balance"
          >
            Save Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (showPreview) {
    return (
      <>
        <SitePreview
          data={getPreviewData()}
          onBack={() => setShowPreview(false)}
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending}
        />
        {overBalanceDialog}
      </>
    );
  }

  // Same guided workflow on every device — only the container width and
  // step-dot density adapt: mobile stays a tight single-column wizard,
  // tablet/desktop get a wider card layout with more context visible at once.
  const guidedContainerClass =
    deviceType === "mobile" ? "max-w-lg" : deviceType === "tablet" ? "max-w-3xl" : "max-w-5xl";

  return (
    <div className={`${guidedMode ? guidedContainerClass : "max-w-5xl"} mx-auto space-y-6 pb-20`}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => confirmLeave(() => setLocation(backLink))} data-testid="button-back">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-display">New Site Report</h1>
          <p className="text-muted-foreground text-sm">Fill in the daily progress details</p>
        </div>
      </div>

      {hasDraft && (
        <DraftRestoreBanner
          draftAge={draftAge}
          onRestore={restoreDraft}
          onDiscard={discardDraft}
        />
      )}

      {guidedMode && (
        <div className="space-y-3" data-testid="guided-flow-shell">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {GUIDED_STEPS.map((s, i) => (
                <div
                  key={s.key}
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${
                    i === guidedStep
                      ? "bg-primary text-primary-foreground border-primary"
                      : i < guidedStep
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-muted text-muted-foreground border-transparent"
                  }`}
                  data-testid={`guided-step-dot-${i}`}
                >
                  {i < guidedStep ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs text-muted-foreground"
              onClick={() => setGuidedOverride(false)}
              data-testid="button-switch-classic-view"
            >
              <LayoutList className="w-3.5 h-3.5" /> Classic view
            </Button>
          </div>
          <p className="text-sm font-semibold text-foreground" data-testid="text-guided-step-label">
            Step {guidedStep + 1} of {GUIDED_STEPS.length}: {GUIDED_STEPS[guidedStep].label}
          </p>
        </div>
      )}

      {!guidedMode && (
        <div className="flex justify-end -mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground"
            onClick={() => { setGuidedOverride(true); setGuidedStep(0); }}
            data-testid="button-switch-guided-view"
          >
            <LayoutList className="w-3.5 h-3.5" /> Switch to guided view
          </Button>
        </div>
      )}

      {/* Header Section */}
      {showStep(0) && (
      <Card>
        <CardHeader>
          <CardTitle>Report Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {activeSites.length === 0 && (
            <div className="md:col-span-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700" data-testid="alert-no-site-assigned">
              No site assigned. Please contact admin.
            </div>
          )}
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={header.date}
              onChange={(e) => setHeader({ ...header, date: e.target.value })}
              data-testid="input-date"
            />
          </div>
          <div>
            <Label>Site Name</Label>
            <Select value={header.site} onValueChange={(val) => setHeader({ ...header, site: val })}>
              <SelectTrigger data-testid="input-site">
                <SelectValue placeholder="Select Site" />
              </SelectTrigger>
              <SelectContent>
                {activeSites.map((s) => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Engineer / Submitted By</Label>
            <div className="flex gap-2">
              <Select
                value={header.engineer}
                onValueChange={(val) => setHeader({ ...header, engineer: val })}
              >
                <SelectTrigger className="uppercase" data-testid="select-engineer">
                  <SelectValue placeholder="Select Engineer" />
                </SelectTrigger>
                <SelectContent>
                  {(personnelList || []).filter(p => p.isActive).map((p) => (
                    <SelectItem key={p.id} value={`${p.name.toUpperCase()} - ${p.role.toUpperCase()}`}>
                      {p.name.toUpperCase()} - {p.role.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => { setPersonnelAddTarget({ kind: "header" }); setAddPersonnelOpen(true); }}
                title="Add new personnel"
                data-testid="button-add-engineer-personnel"
              >
                <UserPlus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
        {siteBoqProjectName && (
          <div className="px-6 pb-4">
            <Badge variant="outline" className="text-xs text-muted-foreground gap-1" data-testid="badge-boq-project">
              <span className="font-medium text-foreground">BOQ:</span> {siteBoqProjectName}
            </Badge>
          </div>
        )}
      </Card>
      )}

      {/* Activity Progress */}
      {showStep(1) && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle>{workType === "structure" ? "Structure Progress" : "Road Works Progress"}</CardTitle>
            {!effectiveLockedWorkType ? (
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  size="sm"
                  variant={workType === "road" ? "default" : "ghost"}
                  className="h-7 px-3 text-sm"
                  onClick={() => { workTypeTouchedRef.current = true; setWorkType("road"); }}
                  data-testid="button-work-type-road"
                >Road</Button>
                <Button
                  size="sm"
                  variant={workType === "structure" ? "default" : "ghost"}
                  className="h-7 px-3 text-sm"
                  onClick={() => { workTypeTouchedRef.current = true; setWorkType("structure"); }}
                  data-testid="button-work-type-structure"
                >Structure</Button>
              </div>
            ) : (
              <Badge variant="outline" className="text-sm" data-testid="badge-work-mode">
                {workType === "structure" ? "Structures" : "Road Works"}
              </Badge>
            )}
          </div>
          {workType === "road" ? (
            <Button size="sm" variant="outline" onClick={() => addRow('progress')} data-testid="button-add-progress">
              <Plus className="w-4 h-4 mr-1" /> Add Row
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setStructureItems(prev => [...prev, { structureType: "Culvert", structureSubType: "Pipe Culvert", structureName: "", stage: "Excavation", itemOfWork: "Excavation", quantity: null, uom: "m³", remarks: "" }])} data-testid="button-add-structure-item">
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {workType === "structure" ? (
            structureItems.map((item, idx) => {
              const subTypes = getSubTypes(item.structureType);
              const selectType = STRUCTURE_TYPES.includes(item.structureType) ? item.structureType : "Other";
              const isOtherType = selectType === "Other";
              const selectSubType = item.structureSubType === "" ? subTypes[0] : (subTypes.includes(item.structureSubType) ? item.structureSubType : "Other");
              const isOtherSubType = selectSubType === "Other";
              const stages = getStages(item.structureType, isOtherSubType ? "Other" : selectSubType);
              const selectStage = item.stage === "" ? stages[0] : (stages.includes(item.stage) ? item.stage : "Other");
              const isOtherStage = selectStage === "Other";
              const selectItem = STRUCTURE_ITEMS.includes(item.itemOfWork) ? item.itemOfWork : "Other";
              const isOtherItem = selectItem === "Other";
              const updateField = (field: keyof StructureItem, val: any) => {
                setStructureItems(structureItems.map((s, i) => i === idx ? { ...s, [field]: val } : s));
              };
              const handleTypeChange = (val: string) => {
                if (val === "Other") {
                  setStructureItems(structureItems.map((s, i) => i === idx ? { ...s, structureType: "Other", structureSubType: "Other", stage: "Other" } : s));
                } else {
                  const subs = getSubTypes(val);
                  const sub = subs[0];
                  const stgs = getStages(val, sub);
                  setStructureItems(structureItems.map((s, i) => i === idx ? { ...s, structureType: val, structureSubType: sub, stage: stgs[0] } : s));
                }
              };
              const handleSubTypeChange = (val: string) => {
                if (val === "Other") {
                  setStructureItems(structureItems.map((s, i) => i === idx ? { ...s, structureSubType: "Other", stage: "Other" } : s));
                } else {
                  const stgs = getStages(item.structureType, val);
                  setStructureItems(structureItems.map((s, i) => i === idx ? { ...s, structureSubType: val, stage: stgs[0] } : s));
                }
              };
              return (
              <div key={idx} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">Structure Item #{idx + 1}</span>
                  <Button size="icon" variant="ghost" onClick={() => setStructureItems(prev => prev.filter((_, i) => i !== idx))} disabled={structureItems.length === 1} data-testid={`button-remove-structure-${idx}`}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Structure Type</Label>
                    <Select value={selectType} onValueChange={handleTypeChange}>
                      <SelectTrigger data-testid={`select-structure-type-${idx}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{STRUCTURE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    {isOtherType && <Input placeholder="Specify type…" value={item.structureType !== "Other" ? item.structureType : ""} onChange={(e) => updateField("structureType", e.target.value || "Other")} data-testid={`input-structure-type-other-${idx}`} />}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Sub-type</Label>
                    <Select value={selectSubType} onValueChange={handleSubTypeChange}>
                      <SelectTrigger data-testid={`select-structure-subtype-${idx}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{subTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    {isOtherSubType && <Input placeholder="Specify sub-type…" value={item.structureSubType !== "Other" ? item.structureSubType : ""} onChange={(e) => updateField("structureSubType", e.target.value || "Other")} data-testid={`input-structure-subtype-other-${idx}`} />}
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-sm">Structure Name / Location</Label>
                    <Input placeholder="e.g. Culvert at km 12+400" value={item.structureName} onChange={(e) => updateField("structureName", e.target.value)} data-testid={`input-structure-name-${idx}`} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Stage / Part</Label>
                    <Select value={selectStage} onValueChange={(val) => updateField("stage", val)}>
                      <SelectTrigger data-testid={`select-structure-stage-${idx}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{stages.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    {isOtherStage && <Input placeholder="Specify stage…" value={item.stage !== "Other" ? item.stage : ""} onChange={(e) => updateField("stage", e.target.value || "Other")} data-testid={`input-structure-stage-other-${idx}`} />}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Item of Work</Label>
                    <Select value={selectItem} onValueChange={(val) => updateField("itemOfWork", val)}>
                      <SelectTrigger data-testid={`select-structure-item-${idx}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{STRUCTURE_ITEMS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                    </Select>
                    {isOtherItem && <Input placeholder="Specify item…" value={item.itemOfWork !== "Other" ? item.itemOfWork : ""} onChange={(e) => updateField("itemOfWork", e.target.value || "Other")} data-testid={`input-structure-item-other-${idx}`} />}
                  </div>
                  {structureLocations.length > 0 && (
                  <div className="sm:col-span-2 md:col-span-4 space-y-1">
                    <Label className="text-sm">Structure (from imported schedule)</Label>
                    <Select
                      value={item.programmeStructureId ?? "__none__"}
                      onValueChange={(val) => {
                        const structureId = val === "__none__" ? null : val;
                        setStructureItems((prev) =>
                          prev.map((s, i) =>
                            i === idx
                              ? { ...s, programmeStructureId: structureId, boqItemId: null }
                              : s,
                          ),
                        );
                      }}
                    >
                      <SelectTrigger data-testid={`select-structure-programme-${idx}`}>
                        <SelectValue placeholder="Select a structure…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Manual entry (no schedule match) —</SelectItem>
                        {structureLocations.map((s) => (
                          <SelectItem key={s.structureId} value={s.structureId}>
                            {s.structureId}{s.structureLocType ? ` (${s.structureLocType})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  )}
                  {siteBoqItems.length > 0 && (
                  <div className="sm:col-span-2 md:col-span-4 space-y-1">
                    <Label className="text-sm">BOQ Item (Plan vs Actual link)</Label>
                    <BillItemPicker
                      items={
                        item.programmeStructureId
                          ? siteBoqItems.filter((bi) =>
                              structureLocations
                                .find((s) => s.structureId === item.programmeStructureId)
                                ?.bars.some((b) => b.boqItemId === bi.id),
                            )
                          : structureBoqItemsFor(item)
                      }
                      value={item.boqItemId ?? null}
                      testidPrefix={`structure-${idx}`}
                      reviewPath={siteBoqProjectId ? `/work-program/${siteBoqProjectId}/item-review` : undefined}
                      onChange={(id, it) => {
                        setStructureItems((prev) =>
                          prev.map((s, i) =>
                            i === idx
                              ? { ...s, boqItemId: id, uom: it?.unit ? it.unit : s.uom }
                              : s,
                          ),
                        );
                      }}
                    />
                    {renderBalanceChips(
                      item.boqItemId,
                      item.quantity,
                      item.programmeStructureId ? structureBalanceInfo(item.programmeStructureId, item.boqItemId) : undefined,
                    )}
                    {structureLocations.length > 0 && item.programmeStructureId == null && item.boqItemId != null && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 mt-1" data-testid={`badge-unplanned-structure-${idx}`}>
                        <AlertTriangle className="w-3 h-3" /> Unplanned DPR entry — no structure schedule match
                      </span>
                    )}
                  </div>
                  )}
                  <div>
                    <Label className="text-sm">Quantity</Label>
                    <Input type="number" step="0.01" placeholder="0" value={item.quantity ?? ""} onChange={(e) => updateField("quantity", e.target.value ? parseFloat(e.target.value) : null)} data-testid={`input-structure-qty-${idx}`} />
                  </div>
                  <div>
                    <Label className="text-sm">Unit</Label>
                    <Select value={item.uom} onValueChange={(val) => updateField("uom", val)}>
                      <SelectTrigger data-testid={`select-structure-uom-${idx}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{STRUCTURE_UOM_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2 md:col-span-4">
                    <Label className="text-sm">Remarks (optional)</Label>
                    <Input placeholder="Any remarks..." value={item.remarks} onChange={(e) => updateField("remarks", e.target.value)} data-testid={`input-structure-remarks-${idx}`} />
                  </div>
                </div>
              </div>
              );
            })
          ) : (
          progress.map((entry, idx) => (
            <div key={idx} className="p-4 border rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`no-site-work-${idx}`}
                      checked={entry.noSiteWork}
                      onCheckedChange={(checked) => {
                        const updated = [...progress];
                        updated[idx].noSiteWork = checked === true;
                        if (checked) {
                          updated[idx].activity = updated[idx].activity || "NO SITE WORK";
                          updated[idx].side = "";
                          updated[idx].chainageFrom = "";
                          updated[idx].chainageTo = "";
                          updated[idx].length = null;
                          updated[idx].width = null;
                          updated[idx].thickness = null;
                          updated[idx].quantity = null;
                        } else {
                          updated[idx].noSiteWorkDescription = "";
                        }
                        setProgress(updated);
                      }}
                      data-testid={`checkbox-no-site-work-${idx}`}
                    />
                    <Label htmlFor={`no-site-work-${idx}`} className="text-sm cursor-pointer">No Site Work</Label>
                  </div>
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => removeRow('progress', idx)}
                  disabled={progress.length === 1}
                  data-testid={`button-remove-progress-${idx}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>

              {entry.noSiteWork ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Activity</Label>
                    <Input
                      placeholder="e.g., MACHINERY SHIFTING, OFFICE WORK"
                      value={entry.activity}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].activity = e.target.value.toUpperCase();
                        setProgress(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-nowork-activity-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Description</Label>
                    <Textarea
                      placeholder="Describe what was done..."
                      value={entry.noSiteWorkDescription}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].noSiteWorkDescription = e.target.value.toUpperCase();
                        setProgress(updated);
                      }}
                      className="uppercase"
                      rows={3}
                      data-testid={`input-progress-description-${idx}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                  <div className="col-span-2">
                    {/* When site has a BOQ project, Activity becomes a BOQ item selector.
                        boqItemId is stored on the progress entry and sent with the DPR payload. */}
                    <Label className="text-sm">{siteBoqItems.length > 0 ? "BOQ Item / Activity" : "Activity"}</Label>
                    {siteBoqItems.length > 0 ? (
                      <BillItemPicker
                        items={siteBoqItems}
                        value={entry.boqItemId ?? null}
                        stacked
                        labels={false}
                        testidPrefix={`progress-${idx}`}
                        reviewPath={siteBoqProjectId ? `/work-program/${siteBoqProjectId}/item-review` : undefined}
                        onChange={(id, it) => {
                          const updated = [...progress];
                          updated[idx].boqItemId = id;
                          updated[idx].activity = it ? it.description.toUpperCase() : "";
                          setProgress(updated);
                        }}
                      />
                    ) : null}
                    {siteBoqItems.length > 0 && entry.boqItemId != null && (activeRoadBarsByItem.get(entry.boqItemId)?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {activeRoadBarsByItem.get(entry.boqItemId)!.map((bar) => (
                          <Button
                            key={bar.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            onClick={() => {
                              const updated = [...progress];
                              if (bar.chainageFrom != null) updated[idx].chainageFrom = String(bar.chainageFrom);
                              if (bar.chainageTo != null) updated[idx].chainageTo = String(bar.chainageTo);
                              const calc = calculateLengthFromChainage(updated[idx].chainageFrom, updated[idx].chainageTo);
                              if (calc !== null) updated[idx].length = calc;
                              updated[idx].quantity = calculateQuantity(updated[idx]);
                              setProgress(updated);
                            }}
                            data-testid={`button-prefill-bar-${bar.id}`}
                          >
                            Use {bar.reachLabel || `Ch ${bar.chainageFrom ?? "?"}–${bar.chainageTo ?? "?"}`}
                          </Button>
                        ))}
                      </div>
                    )}
                    {siteBoqItems.length > 0 && entry.boqItemId != null && hasRoadProgramme && (activeRoadBarsByItem.get(entry.boqItemId)?.length ?? 0) === 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 mt-1" data-testid={`badge-unplanned-progress-${idx}`}>
                        <AlertTriangle className="w-3 h-3" /> Unplanned DPR entry — no active programme for {header.date}
                      </span>
                    )}
                    {siteBoqItems.length > 0 && renderBalanceChips(entry.boqItemId, entry.quantity ?? calculateQuantity(entry))}
                    {siteBoqItems.length === 0 && (
                      <Input
                        placeholder="Activity name"
                        value={entry.activity}
                        onChange={(e) => {
                          const updated = [...progress];
                          updated[idx].activity = e.target.value.toUpperCase();
                          setProgress(updated);
                        }}
                        className="uppercase"
                        data-testid={`input-progress-activity-${idx}`}
                      />
                    )}
                  </div>
                  <div>
                    <Label className="text-sm">Side</Label>
                    <Select
                      value={entry.side}
                      onValueChange={(val) => {
                        const updated = [...progress];
                        updated[idx].side = val;
                        setProgress(updated);
                      }}
                    >
                      <SelectTrigger data-testid={`select-progress-side-${idx}`}>
                        <SelectValue placeholder="Side" />
                      </SelectTrigger>
                      <SelectContent>
                        {SIDE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">From (Ch.)</Label>
                    <Input
                      placeholder="0+000"
                      value={entry.chainageFrom}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].chainageFrom = e.target.value.toUpperCase();
                        const calc = calculateLengthFromChainage(e.target.value.toUpperCase(), updated[idx].chainageTo);
                        if (calc !== null) updated[idx].length = calc;
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-progress-from-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">To (Ch.)</Label>
                    <Input
                      placeholder="0+000"
                      value={entry.chainageTo}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].chainageTo = e.target.value.toUpperCase();
                        const calc = calculateLengthFromChainage(updated[idx].chainageFrom, e.target.value.toUpperCase());
                        if (calc !== null) updated[idx].length = calc;
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-progress-to-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">L (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={entry.length ?? (calculateLengthFromChainage(entry.chainageFrom, entry.chainageTo)?.toFixed(0) ?? "")}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].length = e.target.value ? parseFloat(e.target.value) : null;
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-progress-length-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">W (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={entry.width ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].width = e.target.value ? parseFloat(e.target.value) : null;
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-progress-width-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">T (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={entry.thickness ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].thickness = e.target.value ? parseFloat(e.target.value) : null;
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-progress-thickness-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm flex items-center gap-1">
                      UOM
                      {progressUom(entry) && (
                        <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700">auto</span>
                      )}
                    </Label>
                    <Select
                      value={progressUom(entry) ?? entry.uom}
                      disabled={!!progressUom(entry)}
                      onValueChange={(val) => {
                        const updated = [...progress];
                        updated[idx].uom = val;
                        setProgress(updated);
                      }}
                    >
                      <SelectTrigger data-testid={`select-progress-uom-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UOM_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm flex items-center gap-1">
                      Qty
                      {(() => {
                        const boqItem = entry.boqItemId != null
                          ? siteBoqItems.find(i => i.id === entry.boqItemId)
                          : null;
                        if (!boqItem) return null;
                        const f = boqItem.dprConversionFactor;
                        if (f != null && f !== 1) {
                          return (
                            <span
                              className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 normal-case"
                              title={`DPR qty × ${f} → ${boqItem.unit} for Plan vs Actual`}
                            >
                              → {boqItem.unit}
                            </span>
                          );
                        }
                        return (
                          <span className="text-[10px] text-slate-400 font-normal">{boqItem.unit}</span>
                        );
                      })()}
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={calculateQuantity(entry)?.toFixed(3) || "Auto"}
                      value={entry.quantity ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].quantity = e.target.value ? parseFloat(e.target.value) : null;
                        setProgress(updated);
                      }}
                      data-testid={`input-progress-qty-${idx}`}
                    />
                  </div>
                </div>
              )}


              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-sm text-muted-foreground">Personnel:</Label>
                {entry.personnelIds.map(pid => {
                  const person = personnelList?.find(p => p.id === pid);
                  return person ? (
                    <Badge key={pid} variant="secondary" className="text-sm gap-1">
                      {person.name}
                      <X className="w-3 h-3 cursor-pointer" onClick={() => {
                        const updated = [...progress];
                        updated[idx].personnelIds = updated[idx].personnelIds.filter(id => id !== pid);
                        setProgress(updated);
                      }} />
                    </Badge>
                  ) : null;
                })}
                <Select
                  value=""
                  onValueChange={(val) => {
                    if (val === "__add_new__") {
                      setPersonnelAddTarget({ kind: "progressRow", idx });
                      setAddPersonnelOpen(true);
                      return;
                    }
                    const pid = parseInt(val);
                    if (!entry.personnelIds.includes(pid)) {
                      const updated = [...progress];
                      updated[idx].personnelIds = [...updated[idx].personnelIds, pid];
                      setProgress(updated);
                    }
                  }}
                >
                  <SelectTrigger className="w-[140px] h-7 text-sm" data-testid={`select-personnel-${idx}`}>
                    <SelectValue placeholder="+ Add person" />
                  </SelectTrigger>
                  <SelectContent>
                    {personnelList?.filter(p => !entry.personnelIds.includes(p.id)).map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.role})</SelectItem>
                    ))}
                    <SelectItem value="__add_new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1"><UserPlus className="h-3 w-3" /> New Personnel</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )))}
          {workType !== "structure" && (
            <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => addRow('progress')} data-testid="button-add-progress-bottom">
              <Plus className="w-4 h-4 mr-1" /> Add Row
            </Button>
          )}
        </CardContent>
      </Card>
      )}

      {/* Equipment Log */}
      {showStep(3) && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Equipment Log</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('equipment')} data-testid="button-add-equipment">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {equipment.map((entry, idx) => {
            const selectedEquipForRow = activeEquipment.find(e => e.id === entry.equipmentId);
            const usage = computeEquipmentUsage(selectedEquipForRow, entry);
            const isOdometer = usage.meterType === "odometer";
            const workingHours = getWorkingHours(entry);
            const isTimeMeter = !entry.entryType || entry.entryType === "time_meter" || entry.entryType === "hourly";
            const isTripBased = entry.entryType === "trip_based";
            const isDailyOrMonthly = entry.entryType === "daily" || entry.entryType === "monthly";
            const calculatedTotalKm = (entry.numberOfTrips && entry.tripDistance) ? entry.numberOfTrips * entry.tripDistance * 2 : 0;
            const isWaterTanker = (entry.machine || '').toUpperCase().includes('WATER') || (entry.machine || '').toUpperCase().includes('TANKER');
            
            return (
              <div key={idx} className="p-4 border rounded-lg bg-muted/30 space-y-4 relative">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => removeRow('equipment', idx)}
                  disabled={equipment.length === 1}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                  data-testid={`button-remove-equipment-${idx}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <Label className="text-sm">Equipment</Label>
                    <Select
                      value={entry.equipmentId ? String(entry.equipmentId) : ""}
                      onValueChange={(val) => {
                        const updated = [...equipment];
                        const selectedEquip = activeEquipment.find(e => e.id === Number(val));
                        if (selectedEquip) {
                          updated[idx].equipmentId = selectedEquip.id;
                          updated[idx].machine = selectedEquip.name;
                          updated[idx].vehicleNo = selectedEquip.registrationNumber || "";
                          if (selectedEquip.ownership !== "hired") {
                            updated[idx].entryType = "time_meter";
                            updated[idx].numberOfTrips = null;
                            updated[idx].tripDistance = null;
                            updated[idx].totalKm = null;
                          }
                        }
                        setEquipment(updated);
                      }}
                    >
                      <SelectTrigger data-testid={`select-equipment-${idx}`}>
                        <SelectValue placeholder="Select equipment..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeEquipment.map((eq) => (
                          <SelectItem key={eq.id} value={String(eq.id)}>
                            {eq.name} {eq.registrationNumber ? `(${eq.registrationNumber})` : ""} — {eq.ownership === "hired" ? `HIRED: ${eq.vendorName}` : "HLC OWN"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {entry.equipmentId && entry.vehicleNo && (
                      <p className="text-sm text-muted-foreground mt-1">Reg: {entry.vehicleNo}</p>
                    )}
                    {(() => {
                      const selectedEquipForType = activeEquipment.find(e => e.id === entry.equipmentId);
                      if (!selectedEquipForType || selectedEquipForType.ownership !== "hired") return null;
                      return (
                        <div className="mt-2">
                          <Label className="text-sm">Entry Type</Label>
                          <div className="flex items-center gap-2">
                            <Select
                              value={entry.entryType ?? "time_meter"}
                              onValueChange={(val) => {
                                const updated = [...equipment];
                                updated[idx].entryType = val;
                                if (val !== "trip_based") {
                                  updated[idx].numberOfTrips = null;
                                  updated[idx].tripDistance = null;
                                  updated[idx].totalKm = null;
                                }
                                setEquipment(updated);
                              }}
                            >
                              <SelectTrigger data-testid={`select-entry-type-${idx}`} className="w-48">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="time_meter">Time / Meter Reading</SelectItem>
                                <SelectItem value="hourly">Hourly Hire</SelectItem>
                                <SelectItem value="daily">Daily Hire</SelectItem>
                                <SelectItem value="trip_based">Trip Based</SelectItem>
                                <SelectItem value="monthly">Monthly Hire</SelectItem>
                              </SelectContent>
                            </Select>
                            {isDailyOrMonthly && (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 px-3 py-1.5" data-testid={`badge-entry-type-${idx}`}>
                                {entry.entryType === "daily" ? "DAILY HIRE" : "MONTHLY HIRE"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <Label className="text-sm">Operator</Label>
                    <Input
                      placeholder="Operator name"
                      value={entry.operator}
                      onChange={(e) => {
                        const updated = [...equipment];
                        updated[idx].operator = e.target.value.toUpperCase();
                        setEquipment(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-equipment-operator-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Task</Label>
                    <Input
                      placeholder="Task performed"
                      value={entry.task}
                      onChange={(e) => {
                        const updated = [...equipment];
                        updated[idx].task = e.target.value.toUpperCase();
                        setEquipment(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-equipment-task-${idx}`}
                    />
                  </div>
                </div>

                {siteBoqItems.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm text-muted-foreground">Link to Work Item (optional)</Label>
                      <Select
                        value={entry.boqItemId ? String(entry.boqItemId) : "__none__"}
                        onValueChange={(val) => {
                          const updated = [...equipment];
                          updated[idx].boqItemId = val === "__none__" ? null : Number(val);
                          updated[idx].structureId = null;
                          setEquipment(updated);
                        }}
                      >
                        <SelectTrigger data-testid={`select-equipment-boqitem-${idx}`}>
                          <SelectValue placeholder="Not linked" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Not linked</SelectItem>
                          {siteBoqItems.map((bi) => (
                            <SelectItem key={bi.id} value={String(bi.id)}>
                              {bi.itemCode ? `[${bi.itemCode}] ` : ""}{bi.itemName || bi.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(() => {
                      if (entry.boqItemId == null) return null;
                      const structuresForItem = structureLocations.filter((s) =>
                        s.bars.some((b) => b.boqItemId === entry.boqItemId),
                      );
                      if (structuresForItem.length === 0) return null;
                      return (
                        <div>
                          <Label className="text-sm text-muted-foreground">Structure / Reach (optional)</Label>
                          <Select
                            value={entry.structureId ?? "__none__"}
                            onValueChange={(val) => {
                              const updated = [...equipment];
                              updated[idx].structureId = val === "__none__" ? null : val;
                              setEquipment(updated);
                            }}
                          >
                            <SelectTrigger data-testid={`select-equipment-structure-${idx}`}>
                              <SelectValue placeholder="All / not specified" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">All / not specified</SelectItem>
                              {structuresForItem.map((s) => (
                                <SelectItem key={s.structureId} value={s.structureId}>
                                  {s.structureId}{s.structureLocType ? ` (${s.structureLocType})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })()}
                    {entry.boqItemId != null && (() => {
                      const plan = getPlannedDemandForItem(entry.boqItemId, entry.structureId);
                      const planRow = plan?.equipment.find((e) => e.equipmentName.toUpperCase() === (entry.machine || "").toUpperCase());
                      if (!planRow) return null;
                      return (
                        <div className="flex items-end">
                          <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5" data-testid={`text-planned-equipment-${idx}`}>
                            Planned: {fmtQty(planRow.totalHours, 1)} hrs total for {planRow.equipmentName}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <>
                    <p className="text-sm font-semibold text-muted-foreground border-b pb-1">
                      {entry.entryType === "hourly" ? "Hourly Hire — Time Entry" : "Time / Meter Entry"}
                    </p>
                    <p className="text-sm text-muted-foreground italic">Enter opening reading and diesel in the morning. Closing reading and end time can be added later.</p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      <div>
                        <Label className="text-sm">Start Time</Label>
                        <Input
                          type="time"
                          value={entry.startTime}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].startTime = e.target.value;
                            setEquipment(updated);
                          }}
                          data-testid={`input-equipment-start-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">End Time</Label>
                        <Input
                          type="time"
                          value={entry.endTime}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].endTime = e.target.value;
                            setEquipment(updated);
                          }}
                          data-testid={`input-equipment-end-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Duration</Label>
                        <div className="bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded border border-amber-200 dark:border-amber-700 font-semibold text-amber-700 dark:text-amber-400 text-sm" data-testid={`display-time-duration-${idx}`}>
                          {formatTimeDuration(entry.startTime, entry.endTime) ?? "-"}
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm">{isOdometer ? "Opening Odometer (km)" : "Opening Hour Meter"}</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder={isOdometer ? "e.g. 45230" : "e.g. 1234.5"}
                          value={entry.openingReading ?? ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].openingReading = e.target.value ? parseFloat(e.target.value) : null;
                            setEquipment(updated);
                          }}
                          data-testid={`input-equipment-opening-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">{isOdometer ? "Closing Odometer (km)" : "Closing Hour Meter"}</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder={isOdometer ? "e.g. 45310" : "e.g. 1238.0"}
                          value={entry.closingReading ?? ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].closingReading = e.target.value ? parseFloat(e.target.value) : null;
                            setEquipment(updated);
                          }}
                          data-testid={`input-equipment-closing-${idx}`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-sm">{isOdometer ? "KM Run" : "Working Hours"}</Label>
                        <div 
                          className="bg-primary/10 px-3 py-2 rounded border border-primary/20 font-semibold text-primary text-sm"
                          data-testid={`display-working-hours-${idx}`}
                        >
                          {usage.runtime > 0 ? `${usage.runtime.toFixed(isOdometer ? 1 : 3)} ${isOdometer ? "km" : "hrs"}` : "-"}
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Expected Diesel</Label>
                        <div className="bg-muted px-3 py-2 rounded border font-semibold text-sm" data-testid={`display-expected-diesel-${idx}`}>
                          {usage.expectedDiesel != null ? `${usage.expectedDiesel.toFixed(1)} L` : "-"}
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Norm</Label>
                        <div className="bg-muted px-3 py-2 rounded border font-semibold text-sm" data-testid={`display-efficiency-${idx}`}>
                          {usage.efficiencyLabel ?? "-"}
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm">Diesel Issued (L)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0"
                          value={entry.diesel ?? ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].diesel = e.target.value ? parseFloat(e.target.value) : null;
                            setEquipment(updated);
                          }}
                          data-testid={`input-equipment-diesel-${idx}`}
                        />
                      </div>
                    </div>
                    {usage.warning && (
                      <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid={`warning-equipment-${idx}`}>
                        ⚠ {usage.warning}
                      </p>
                    )}
                </>

                {isTripBased && (
                  <>
                    <p className="text-sm font-semibold text-muted-foreground border-b pb-1">Trip Based Entry</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-sm">No. of Trips</Label>
                        <Input
                          type="number"
                          step="1"
                          placeholder="0"
                          value={entry.numberOfTrips ?? ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].numberOfTrips = e.target.value ? parseInt(e.target.value) : null;
                            const trips = updated[idx].numberOfTrips || 0;
                            const dist = updated[idx].tripDistance || 0;
                            updated[idx].totalKm = trips * dist * 2;
                            setEquipment(updated);
                          }}
                          data-testid={`input-equipment-trips-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Trip Distance (km one-way)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0"
                          value={entry.tripDistance ?? ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].tripDistance = e.target.value ? parseFloat(e.target.value) : null;
                            const trips = updated[idx].numberOfTrips || 0;
                            const dist = updated[idx].tripDistance || 0;
                            updated[idx].totalKm = trips * dist * 2;
                            setEquipment(updated);
                          }}
                          data-testid={`input-equipment-trip-distance-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Total KM (round trip)</Label>
                        <div 
                          className="bg-primary/10 px-3 py-2 rounded border border-primary/20 font-semibold text-primary text-sm"
                          data-testid={`display-total-km-${idx}`}
                        >
                          {calculatedTotalKm > 0 ? `${calculatedTotalKm.toFixed(1)} km` : "-"}
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm">Diesel Issued (L)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0"
                          value={entry.diesel ?? ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].diesel = e.target.value ? parseFloat(e.target.value) : null;
                            setEquipment(updated);
                          }}
                          data-testid={`input-equipment-diesel-${idx}`}
                        />
                      </div>
                    </div>
                  </>
                )}

                {isWaterTanker && (
                  <>
                    <p className="text-sm font-semibold text-blue-600 border-b border-blue-200 pb-1">Water Delivery</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-sm">Water Quantity (Liters)</Label>
                        <Input
                          type="number"
                          step="1"
                          placeholder="0"
                          value={entry.waterQuantity ?? ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].waterQuantity = e.target.value ? parseFloat(e.target.value) : null;
                            setEquipment(updated);
                          }}
                          data-testid={`input-equipment-water-qty-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">No. of Trips</Label>
                        <Input
                          type="number"
                          step="1"
                          placeholder="0"
                          value={entry.numberOfTrips ?? ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].numberOfTrips = e.target.value ? parseInt(e.target.value) : null;
                            setEquipment(updated);
                          }}
                          data-testid={`input-equipment-water-trips-${idx}`}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-sm">Diesel Source</Label>
                    <Select 
                      value={entry.dieselSource ?? "plant_stock"} 
                      onValueChange={(value) => {
                        const updated = [...equipment];
                        updated[idx].dieselSource = value;
                        setEquipment(updated);
                      }}
                    >
                      <SelectTrigger data-testid={`select-diesel-source-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plant_stock">Plant Stock</SelectItem>
                        <SelectItem value="direct_purchase">Direct Site Purchase</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {entry.dieselSource === "direct_purchase" && (
                    <>
                      <div>
                        <Label className="text-sm">Fuel Station</Label>
                        <Input
                          placeholder="HP / BPCL"
                          value={entry.fuelStation || ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].fuelStation = e.target.value.toUpperCase();
                            setEquipment(updated);
                          }}
                          className="uppercase"
                          data-testid={`input-fuel-station-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Bill No.</Label>
                        <Input
                          placeholder="Receipt #"
                          value={entry.billNumber || ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].billNumber = e.target.value.toUpperCase();
                            setEquipment(updated);
                          }}
                          className="uppercase"
                          data-testid={`input-bill-number-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Amount (Rs)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={entry.amountPaid ?? ""}
                          onChange={(e) => {
                            const updated = [...equipment];
                            updated[idx].amountPaid = e.target.value ? parseFloat(e.target.value) : null;
                            setEquipment(updated);
                          }}
                          data-testid={`input-amount-paid-${idx}`}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-sm text-muted-foreground">Total Diesel</p>
            <p className="text-2xl font-bold text-primary">{getTotalDiesel().toFixed(3)} L</p>
          </div>
          <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => addRow('equipment')} data-testid="button-add-equipment-bottom">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardContent>
      </Card>
      )}

      {/* Labour Strength */}
      {showStep(2) && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Labour Strength</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('labour')} data-testid="button-add-labour">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {labour.map((entry, idx) => (
            <div key={idx} className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4 border rounded-lg bg-muted/30">
              <div>
                <Label className="text-sm">Category</Label>
                <Select
                  value={entry.category}
                  onValueChange={(val) => {
                    const updated = [...labour];
                    updated[idx].category = val;
                    setLabour(updated);
                  }}
                >
                  <SelectTrigger data-testid={`select-labour-category-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LABOUR_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Gender</Label>
                <Select
                  value={entry.gender}
                  onValueChange={(val) => {
                    const updated = [...labour];
                    updated[idx].gender = val;
                    setLabour(updated);
                  }}
                >
                  <SelectTrigger data-testid={`select-labour-gender-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Count</Label>
                <Input
                  type="number"
                  min="0"
                  value={entry.count || ""}
                  onChange={(e) => {
                    const updated = [...labour];
                    updated[idx].count = parseInt(e.target.value) || 0;
                    setLabour(updated);
                  }}
                  data-testid={`input-labour-count-${idx}`}
                />
              </div>
              <div>
                <Label className="text-sm">Task/Work</Label>
                <Input
                  placeholder="e.g. Spreading WMM"
                  value={entry.task}
                  onChange={(e) => {
                    const updated = [...labour];
                    updated[idx].task = e.target.value.toUpperCase();
                    setLabour(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-labour-task-${idx}`}
                />
              </div>
              <div>
                <Label className="text-sm">Contractor/Gang</Label>
                <Input
                  placeholder="e.g. Raju Gang"
                  value={entry.contractor}
                  onChange={(e) => {
                    const updated = [...labour];
                    updated[idx].contractor = e.target.value.toUpperCase();
                    setLabour(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-labour-contractor-${idx}`}
                />
              </div>
              <div className="flex items-end">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => removeRow('labour', idx)}
                  disabled={labour.length === 1}
                  data-testid={`button-remove-labour-${idx}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
              {siteBoqItems.length > 0 && (
                <div className="col-span-2 md:col-span-6 grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <Label className="text-sm text-muted-foreground">Link to Work Item (optional)</Label>
                    <Select
                      value={entry.boqItemId ? String(entry.boqItemId) : "__none__"}
                      onValueChange={(val) => {
                        const updated = [...labour];
                        updated[idx].boqItemId = val === "__none__" ? null : Number(val);
                        updated[idx].structureId = null;
                        setLabour(updated);
                      }}
                    >
                      <SelectTrigger data-testid={`select-labour-boqitem-${idx}`}>
                        <SelectValue placeholder="Not linked" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not linked</SelectItem>
                        {siteBoqItems.map((bi) => (
                          <SelectItem key={bi.id} value={String(bi.id)}>
                            {bi.itemCode ? `[${bi.itemCode}] ` : ""}{bi.itemName || bi.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(() => {
                    if (entry.boqItemId == null) return null;
                    const structuresForItem = structureLocations.filter((s) =>
                      s.bars.some((b) => b.boqItemId === entry.boqItemId),
                    );
                    if (structuresForItem.length === 0) return null;
                    return (
                      <div>
                        <Label className="text-sm text-muted-foreground">Structure / Reach (optional)</Label>
                        <Select
                          value={entry.structureId ?? "__none__"}
                          onValueChange={(val) => {
                            const updated = [...labour];
                            updated[idx].structureId = val === "__none__" ? null : val;
                            setLabour(updated);
                          }}
                        >
                          <SelectTrigger data-testid={`select-labour-structure-${idx}`}>
                            <SelectValue placeholder="All / not specified" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">All / not specified</SelectItem>
                            {structuresForItem.map((s) => (
                              <SelectItem key={s.structureId} value={s.structureId}>
                                {s.structureId}{s.structureLocType ? ` (${s.structureLocType})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
                  {entry.boqItemId != null && (() => {
                    const plan = getPlannedDemandForItem(entry.boqItemId, entry.structureId);
                    const planRow = plan?.labour.find((l) => l.designation.toUpperCase() === (entry.category || "").toUpperCase());
                    if (!planRow) return null;
                    return (
                      <div className="flex items-end">
                        <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5" data-testid={`text-planned-labour-${idx}`}>
                          Planned: {fmtQty(planRow.totalDays, 1)} person-days total for {planRow.designation}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => addRow('labour')} data-testid="button-add-labour-bottom">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardContent>
      </Card>
      )}

      {/* Materials Consumed/Issued (linked to work item for Plan vs Actual) */}
      {showStep(4) && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-teal-600">Materials Consumed / Issued</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('materials')} data-testid="button-add-material-top">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {materials.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No materials recorded. Click "Add" to record material consumed or issued against a work item. (Bulk deliveries by vehicle trip are still tracked separately in Materials Received.)</p>
          ) : (
            materials.map((m, idx) => (
              <div key={idx} className="p-4 bg-muted/30 rounded-lg relative space-y-3">
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-0 top-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow('materials', idx)}
                  data-testid={`button-remove-material-${idx}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select value={m.type} onValueChange={(v) => updateMaterial(idx, 'type', v)}>
                      <SelectTrigger data-testid={`select-material-type-${idx}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MATERIAL_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Material</Label>
                    <Input
                      placeholder="e.g. WMM / VG-30 / Cement"
                      value={m.material}
                      onChange={(e) => updateMaterial(idx, 'material', e.target.value.toUpperCase())}
                      className="uppercase"
                      data-testid={`input-material-name-${idx}`}
                    />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={m.quantity ?? ''}
                      onChange={(e) => updateMaterial(idx, 'quantity', e.target.value ? parseFloat(e.target.value) : null)}
                      data-testid={`input-material-qty-${idx}`}
                    />
                  </div>
                  <div>
                    <Label>UOM</Label>
                    <Input
                      placeholder="MT/CUM"
                      value={m.uom}
                      onChange={(e) => updateMaterial(idx, 'uom', e.target.value.toUpperCase())}
                      className="uppercase"
                      data-testid={`input-material-uom-${idx}`}
                    />
                  </div>
                  <div>
                    <Label>Location/Task</Label>
                    <Input
                      placeholder="Where used"
                      value={m.location}
                      onChange={(e) => updateMaterial(idx, 'location', e.target.value.toUpperCase())}
                      className="uppercase"
                      data-testid={`input-material-location-${idx}`}
                    />
                  </div>
                </div>
                {siteBoqItems.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm text-muted-foreground">Link to Work Item (optional)</Label>
                      <Select
                        value={m.boqItemId ? String(m.boqItemId) : "__none__"}
                        onValueChange={(val) => {
                          const updated = [...materials];
                          updated[idx].boqItemId = val === "__none__" ? null : Number(val);
                          updated[idx].structureId = null;
                          setMaterials(updated);
                        }}
                      >
                        <SelectTrigger data-testid={`select-material-boqitem-${idx}`}>
                          <SelectValue placeholder="Not linked" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Not linked</SelectItem>
                          {siteBoqItems.map((bi) => (
                            <SelectItem key={bi.id} value={String(bi.id)}>
                              {bi.itemCode ? `[${bi.itemCode}] ` : ""}{bi.itemName || bi.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(() => {
                      if (m.boqItemId == null) return null;
                      const structuresForItem = structureLocations.filter((s) =>
                        s.bars.some((b) => b.boqItemId === m.boqItemId),
                      );
                      if (structuresForItem.length === 0) return null;
                      return (
                        <div>
                          <Label className="text-sm text-muted-foreground">Structure / Reach (optional)</Label>
                          <Select
                            value={m.structureId ?? "__none__"}
                            onValueChange={(val) => {
                              const updated = [...materials];
                              updated[idx].structureId = val === "__none__" ? null : val;
                              setMaterials(updated);
                            }}
                          >
                            <SelectTrigger data-testid={`select-material-structure-${idx}`}>
                              <SelectValue placeholder="All / not specified" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">All / not specified</SelectItem>
                              {structuresForItem.map((s) => (
                                <SelectItem key={s.structureId} value={s.structureId}>
                                  {s.structureId}{s.structureLocType ? ` (${s.structureLocType})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })()}
                    {m.boqItemId != null && (() => {
                      const plan = getPlannedDemandForItem(m.boqItemId, m.structureId);
                      const planRow = plan?.materials.find((mm) => mm.materialName.toUpperCase() === (m.material || "").toUpperCase());
                      if (!planRow) return null;
                      return (
                        <div className="flex items-end">
                          <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5" data-testid={`text-planned-material-${idx}`}>
                            Planned: {fmtQty(planRow.totalQty, 2)} {planRow.uom} total for {planRow.materialName}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))
          )}
          {materials.length > 0 && (
            <Button variant="outline" className="w-full border-dashed" onClick={() => addRow('materials')} data-testid="button-add-material-bottom">
              <Plus className="w-4 h-4 mr-1" /> Add Material
            </Button>
          )}
        </CardContent>
      </Card>
      )}

      {/* Site Purchases — kept in classic view only; guided flow keeps materials focused */}
      {!guidedMode && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-teal-600">Site Purchases</CardTitle>
          <Button size="sm" variant="outline" onClick={addSitePurchase} data-testid="button-add-site-purchase-top">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {sitePurchases.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No site purchases added. Click "Add" to record direct site purchases like diesel for cleaning, small consumables, etc.</p>
          ) : (
            sitePurchases.map((sp, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end p-4 bg-muted/30 rounded-lg relative">
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-0 top-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSitePurchase(idx)}
                  data-testid={`button-remove-site-purchase-${idx}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <div className="md:col-span-2">
                  <Label>Item Description</Label>
                  <Input
                    placeholder="e.g. Diesel for cleaning"
                    value={sp.itemDescription}
                    onChange={e => updateSitePurchase(idx, 'itemDescription', e.target.value.toUpperCase())}
                    className="uppercase"
                    data-testid={`input-site-purchase-item-${idx}`}
                  />
                </div>
                <div>
                  <Label>Vendor</Label>
                  <Input
                    placeholder="e.g. Local Fuel Station"
                    value={sp.vendor}
                    onChange={e => updateSitePurchase(idx, 'vendor', e.target.value.toUpperCase())}
                    className="uppercase"
                    data-testid={`input-site-purchase-vendor-${idx}`}
                  />
                </div>
                <div>
                  <Label>Bill No</Label>
                  <Input
                    placeholder="e.g. INV-001"
                    value={sp.billNo}
                    onChange={e => updateSitePurchase(idx, 'billNo', e.target.value.toUpperCase())}
                    className="uppercase"
                    data-testid={`input-site-purchase-bill-${idx}`}
                  />
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={sp.amount ?? ''}
                    onChange={e => updateSitePurchase(idx, 'amount', e.target.value ? parseFloat(e.target.value) : null)}
                    data-testid={`input-site-purchase-amount-${idx}`}
                  />
                </div>
                <div>
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={sp.quantity ?? ''}
                    onChange={e => updateSitePurchase(idx, 'quantity', e.target.value ? parseFloat(e.target.value) : null)}
                    data-testid={`input-site-purchase-qty-${idx}`}
                  />
                </div>
                <div>
                  <Label>UOM</Label>
                  <Input
                    placeholder="Litres/Nos"
                    value={sp.uom}
                    onChange={e => updateSitePurchase(idx, 'uom', e.target.value.toUpperCase())}
                    className="uppercase"
                    data-testid={`input-site-purchase-uom-${idx}`}
                  />
                </div>
              </div>
            ))
          )}
          {sitePurchases.length > 0 && (
            <Button variant="outline" className="w-full border-dashed" onClick={addSitePurchase} data-testid="button-add-site-purchase-bottom">
              <Plus className="w-4 h-4 mr-1" /> Add Site Purchase
            </Button>
          )}
        </CardContent>
      </Card>
      )}

      {/* Remarks & Review — guided flow only, final step before submit */}
      {guidedMode && showStep(5) && (
        <Card>
          <CardHeader>
            <CardTitle>Remarks & Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Remarks (optional)</Label>
              <Textarea
                value={remarksNote}
                onChange={(e) => setRemarksNote(e.target.value)}
                placeholder="Any notes about today's work, delays, issues..."
                rows={4}
                data-testid="input-remarks"
              />
            </div>
            <div>
              <Label className="mb-2 block">Photos</Label>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                data-testid="input-dpr-photo-camera"
                onChange={(e) => { addStagedPhotos(e.target.files); if (cameraInputRef.current) cameraInputRef.current.value = ""; }}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                data-testid="input-dpr-photo-gallery"
                onChange={(e) => { addStagedPhotos(e.target.files); if (galleryInputRef.current) galleryInputRef.current.value = ""; }}
              />
              <div className="flex gap-2 mb-3">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => cameraInputRef.current?.click()} data-testid="button-dpr-photo-camera">
                  <Camera className="w-4 h-4" /> Camera
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => galleryInputRef.current?.click()} data-testid="button-dpr-photo-gallery">
                  <Plus className="w-4 h-4" /> Gallery
                </Button>
              </div>
              {stagedPhotos.length === 0 ? (
                <div className="w-full border-2 border-dashed rounded-lg py-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Camera className="w-6 h-6" />
                  <span className="text-sm">No photos added yet</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {stagedPhotos.map((file, idx) => (
                    <div key={idx} className="relative border rounded-md overflow-hidden bg-muted aspect-square" data-testid={`card-staged-photo-${idx}`}>
                      <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute top-1 right-1 bg-background/90 rounded-full p-1"
                        onClick={() => removeStagedPhoto(idx)}
                        data-testid={`button-remove-staged-photo-${idx}`}
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Photos are uploaded once you save the report.</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Review your entries using the step dots above, then tap Preview Report to finish.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons - sticky on mobile so Save/Preview stay reachable while scrolling a long form */}
      <div className="sticky bottom-0 left-0 right-0 z-10 -mx-4 sm:mx-0 mt-2 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 backdrop-blur px-4 py-3 sm:static sm:border-0 sm:bg-transparent sm:backdrop-blur-0 sm:px-0 sm:py-0">
        <AutoSaveIndicator lastSavedAt={lastSavedAt} isDirty={isDirty} className="mr-auto" />
        {guidedMode ? (
          <>
            {guidedStep > 0 && (
              <Button variant="outline" onClick={() => goToStep(guidedStep - 1)} className="gap-1" data-testid="button-guided-prev">
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
            )}
            {guidedStep < GUIDED_STEPS.length - 1 ? (
              <Button onClick={() => goToStep(guidedStep + 1)} className="gap-1" data-testid="button-guided-next">
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            ) : isFormComplete() ? (
              <Button onClick={handlePreview} className="gap-2" data-testid="button-preview">
                <Eye className="w-4 h-4" />
                Preview Report
              </Button>
            ) : (
              <Button
                onClick={handleSaveDraft}
                disabled={draftMutation.isPending}
                className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="button-save-draft"
              >
                {draftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Start / Draft
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => confirmLeave(() => setLocation(backLink))} data-testid="button-cancel">
              Cancel
            </Button>
            {isFormComplete() ? (
              <Button onClick={handlePreview} className="gap-2" data-testid="button-preview">
                <Eye className="w-4 h-4" />
                Preview Report
              </Button>
            ) : (
              <Button
                onClick={handleSaveDraft}
                disabled={draftMutation.isPending}
                className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="button-save-draft"
              >
                {draftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Start / Draft
              </Button>
            )}
          </>
        )}
      </div>

      <Dialog
        open={addPersonnelOpen}
        onOpenChange={(open) => {
          setAddPersonnelOpen(open);
          if (!open) { setPersonnelAddTarget(null); setDuplicatePersonnel(null); }
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add New Personnel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={newPersonnelName}
                onChange={(e) => { setNewPersonnelName(e.target.value.toUpperCase()); setDuplicatePersonnel(null); }}
                placeholder="Full name"
                className="uppercase"
                data-testid="input-new-personnel-name"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={newPersonnelRole} onValueChange={setNewPersonnelRole}>
                <SelectTrigger data-testid="select-new-personnel-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSONNEL_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input
                value={newPersonnelPhone}
                onChange={(e) => setNewPersonnelPhone(e.target.value.toUpperCase())}
                placeholder="Phone number"
                className="uppercase"
                data-testid="input-new-personnel-phone"
              />
            </div>
            {duplicatePersonnel && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 flex items-center justify-between gap-2" data-testid="alert-duplicate-personnel">
                <span>{duplicatePersonnel.name} already exists ({duplicatePersonnel.role}).</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => useExistingPersonnel(duplicatePersonnel)}
                  data-testid="button-use-existing-personnel"
                >
                  Use this person
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddPersonnelOpen(false); setPersonnelAddTarget(null); setDuplicatePersonnel(null); }}>Cancel</Button>
            <Button
              disabled={!newPersonnelName.trim() || createPersonnelMutation.isPending}
              onClick={() => createPersonnelMutation.mutate({
                name: newPersonnelName.trim(),
                role: newPersonnelRole,
                phone: newPersonnelPhone.trim() || undefined,
              })}
              data-testid="button-save-new-personnel"
            >
              {createPersonnelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {overBalanceDialog}
    </div>
  );
}
