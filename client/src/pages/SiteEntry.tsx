import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { useOrigin } from "@/hooks/use-origin";
import { useAutosave } from "@/hooks/use-autosave";
import { DraftRestoreBanner } from "@/components/DraftRestoreBanner";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import { ChevronLeft, Plus, Trash2, Eye, Loader2, UserPlus, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deriveDprUom, computeDprQty } from "@/lib/dprUom";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import SitePreview from "@/pages/SitePreview";
import type { EquipmentMasterType, Site, Personnel } from "@shared/schema";
import { PERSONNEL_ROLES } from "@shared/schema";
import { STRUCTURE_TYPES, STRUCTURE_ITEMS, getSubTypes, getStages } from "@shared/structureHierarchy";
import { BillItemPicker } from "@/components/BillItemPicker";

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
}

interface LabourEntry {
  category: string;
  gender: string;
  count: number;
  task: string;
  contractor: string;
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
}

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
}

const SIDE_OPTIONS = ["LHS", "RHS", "Full Width"];
const UOM_OPTIONS = ["SQM", "CUM", "RMT", "MT", "NOS"];
const LABOUR_CATEGORIES = ["Skilled", "Semi-Skilled", "Unskilled"];
const GENDER_OPTIONS = ["Male", "Female"];
const STRUCTURE_UOM_OPTIONS = ["m³", "m²", "m", "MT", "Nos", "RM"];

type SiteBoqItem = { id: number; description: string; itemCode: string | null; itemName: string | null; unit: string; dprConversionFactor: number | null; categoryName?: string | null; sortOrder?: number | null };

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

export default function SiteEntry() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/site/dashboard");
  const [showPreview, setShowPreview] = useState(false);

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

  const createPersonnelMutation = useMutation({
    mutationFn: (data: { name: string; role: string; phone?: string }) =>
      apiRequest("POST", "/api/personnel", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personnel"] });
      setAddPersonnelOpen(false);
      setNewPersonnelName("");
      setNewPersonnelRole("Engineer");
      setNewPersonnelPhone("");
      toast({ title: "Personnel added" });
    },
  });

  const [progress, setProgress] = useState<ProgressEntry[]>([
    { activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [], boqItemId: null }
  ]);

  const [equipment, setEquipment] = useState<EquipmentEntry[]>([
    { machine: "", vehicleNo: "", operator: "", task: "", entryType: "time_meter", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null, numberOfTrips: null, tripDistance: null, totalKm: null, waterQuantity: null }
  ]);

  const [labour, setLabour] = useState<LabourEntry[]>([
    { category: "Skilled", gender: "Male", count: 0, task: "", contractor: "" }
  ]);

  // Materials are now managed separately in the Materials Received tab
  const [materials] = useState<MaterialEntry[]>([]);

  const [sitePurchases, setSitePurchases] = useState<SitePurchaseEntry[]>([]);

  const lockedWorkType = useMemo(() => {
    const t = new URLSearchParams(window.location.search).get("type");
    return t === "structure" ? "structure" : t === "road" ? "road" : null;
  }, []);
  const [workType, setWorkType] = useState<string>(lockedWorkType ?? "road");
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

  // Derive UoM + qty from the dimensions; mutates entry.uom so the saved row matches.
  // Falls back to the existing manual uom/qty for non-geometric items (MT / NOS).
  const calculateQuantity = (entry: ProgressEntry): number | null => {
    const length = getEffectiveLength(entry);
    const derivedUom = deriveDprUom(length, entry.width, entry.thickness);
    if (derivedUom) {
      entry.uom = derivedUom;
      return computeDprQty(length, entry.width, entry.thickness);
    }
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

  const addRow = (section: 'progress' | 'equipment' | 'labour') => {
    if (section === 'progress') {
      setProgress([...progress, { activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [], boqItemId: null }]);
    } else if (section === 'equipment') {
      setEquipment([...equipment, { machine: "", vehicleNo: "", operator: "", task: "", entryType: "time_meter", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null, numberOfTrips: null, tripDistance: null, totalKm: null, waterQuantity: null }]);
    } else if (section === 'labour') {
      setLabour([...labour, { category: "Skilled", gender: "Male", count: 0, task: "", contractor: "" }]);
    }
  };

  const removeRow = (section: 'progress' | 'equipment' | 'labour', index: number) => {
    if (section === 'progress' && progress.length > 1) {
      setProgress(progress.filter((_, i) => i !== index));
    } else if (section === 'equipment' && equipment.length > 1) {
      setEquipment(equipment.filter((_, i) => i !== index));
    } else if (section === 'labour' && labour.length > 1) {
      setLabour(labour.filter((_, i) => i !== index));
    }
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
        structureItems: workType === "structure" ? structureItems.filter(s => s.structureType && s.itemOfWork) : [],
        equipment: normalizedEquipment,
        labour,
        materials,
        sitePurchases: sitePurchases.filter(sp => sp.itemDescription),
        clientTimestamp,
      });
      return response.json();
    },
    onSuccess: async (data) => {
      await clearDraft();
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      toast({
        title: "Report Saved Successfully",
        description: "Your site report has been submitted.",
      });
      setLocation(appendOrigin(`/site/success/${data.id}`));
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

  const handleSubmit = () => {
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

  if (showPreview) {
    return (
      <SitePreview
        data={getPreviewData()}
        onBack={() => setShowPreview(false)}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
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

      {/* Header Section */}
      <Card>
        <CardHeader>
          <CardTitle>Report Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                onClick={() => setAddPersonnelOpen(true)}
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

      {/* Activity Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle>{workType === "structure" ? "Structure Progress" : "Road Works Progress"}</CardTitle>
            {!lockedWorkType ? (
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  size="sm"
                  variant={workType === "road" ? "default" : "ghost"}
                  className="h-7 px-3 text-sm"
                  onClick={() => setWorkType("road")}
                  data-testid="button-work-type-road"
                >Road</Button>
                <Button
                  size="sm"
                  variant={workType === "structure" ? "default" : "ghost"}
                  className="h-7 px-3 text-sm"
                  onClick={() => setWorkType("structure")}
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
                  {siteBoqItems.length > 0 && (
                  <div className="sm:col-span-2 md:col-span-4 space-y-1">
                    <Label className="text-sm">BOQ Item (Plan vs Actual link)</Label>
                    <BillItemPicker
                      items={siteBoqItems}
                      value={item.boqItemId ?? null}
                      testidPrefix={`structure-${idx}`}
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
                        onChange={(id, it) => {
                          const updated = [...progress];
                          updated[idx].boqItemId = id;
                          updated[idx].activity = it ? it.description.toUpperCase() : "";
                          setProgress(updated);
                        }}
                      />
                    ) : (
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
                      {deriveDprUom(getEffectiveLength(entry), entry.width, entry.thickness) && (
                        <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700">auto</span>
                      )}
                    </Label>
                    <Select
                      value={entry.uom}
                      disabled={!!deriveDprUom(getEffectiveLength(entry), entry.width, entry.thickness)}
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

      {/* Equipment Log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Equipment Log</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('equipment')} data-testid="button-add-equipment">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {equipment.map((entry, idx) => {
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
                        <Label className="text-sm">Opening Hour Meter</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g. 1234.5"
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
                        <Label className="text-sm">Closing Hour Meter</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g. 1238.0"
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

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm">Working Hours</Label>
                        <div 
                          className="bg-primary/10 px-3 py-2 rounded border border-primary/20 font-semibold text-primary text-sm"
                          data-testid={`display-working-hours-${idx}`}
                        >
                          {workingHours > 0 ? `${workingHours.toFixed(3)} hrs` : "-"}
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

      {/* Labour Strength */}
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
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => addRow('labour')} data-testid="button-add-labour-bottom">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardContent>
      </Card>

      {/* Site Purchases */}
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

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-4 pt-4">
        <AutoSaveIndicator lastSavedAt={lastSavedAt} isDirty={isDirty} className="mr-auto" />
        <Button variant="outline" onClick={() => confirmLeave(() => setLocation(backLink))} data-testid="button-cancel">
          Cancel
        </Button>
        <Button onClick={handlePreview} className="gap-2" data-testid="button-preview">
          <Eye className="w-4 h-4" />
          Preview Report
        </Button>
      </div>

      <Dialog open={addPersonnelOpen} onOpenChange={setAddPersonnelOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add New Personnel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={newPersonnelName}
                onChange={(e) => setNewPersonnelName(e.target.value.toUpperCase())}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPersonnelOpen(false)}>Cancel</Button>
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
    </div>
  );
}
