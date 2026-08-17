import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { useAuth } from "@/lib/auth-context";
import { ChevronLeft, Plus, Trash2, Save, Loader2, UserPlus, X, Shield, Check, Send, Camera, Image as ImageIcon, Paperclip } from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { EditPermissionButton } from "@/components/EditPermissionButton";
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
import { InsufficientDieselDialog, parseInsufficientPlantStock, type InsufficientPlantStockPayload } from "@/components/InsufficientDieselDialog";
import { format } from "date-fns";
import { useDpr } from "@/hooks/use-dprs";
import type { EquipmentMasterType, Site, Personnel } from "@shared/schema";
import { PERSONNEL_ROLES } from "@shared/schema";
import { STRUCTURE_TYPES, STRUCTURE_ITEMS, getSubTypes, getStages } from "@shared/structureHierarchy";
import { calculateDprQuantity, quantitiesMatch, MANUAL_QUANTITY_SOURCES, calculateLengthFromChainage } from "@shared/dprGeometry";
import { evaluateDprSubmitReadiness, type DprReadinessResult } from "@shared/dprSubmitReadiness";
import { DprReadinessDialog } from "@/components/DprReadinessDialog";
import { isBarSide, parseChainageKm, QUANTITY_SOURCES, QUANTITY_SOURCE_LABELS } from "@shared/barSide";
import { normalizeDprSideKey } from "@shared/dprProgrammeLink";
import { ProgrammeBarPicker, BarLinkFeedback } from "@/components/ProgrammeBarPicker";
import { ActivityReceiptStrip } from "@/components/ActivityReceiptStrip";
import { DprDayTripsPanel } from "@/components/DprDayTripsPanel";
import { useChainageOverlapContext, useChainageOverlapHits, ChainageOverlapWarning } from "@/components/ChainageOverlapGuard";
import { type CandidateChainageRow } from "@shared/chainageOverlap";
import { boqItemDisplayName } from "@shared/boqItemName";
import { layerFieldLabel } from "@shared/layerDisplay";
import { newEntryKey, MAX_ACTIVITY_PHOTOS, activityPhotoCapacity, countEntryAttachments } from "@shared/dprPhotos";
import { fetchLatestPriorClosing } from "@/lib/equipmentContinuity";

interface ProgressEntry {
  // Batch 06C §22: stable photo-link key (same semantics as Guided/New DPR).
  entryKey: string;
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
  // 030A: direct programme-bar linkage
  programmeBarId: number | null;
  // 06T �3: resolved execution arrangement persisted as a historical fact
  earthworkArrangementId: number | null;
  quantitySource: string;
  quantitySourceNote: string;
  chainageOverrideReason: string;
  executedBy: string;
  // 06P: optional physical layer/lift number; null = not multi-layer.
  layerNo: number | null;
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
  // 06Q (client-only, stripped from the payload): true for rows added during
  // this edit session — only those get opening-reading continuity. Rows
  // loaded from the stored DPR NEVER have their opening recalculated on load.
  isNew?: boolean;
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

const SIDE_OPTIONS = ["LHS", "RHS", "Both Sides", "Full Width"];
const UOM_OPTIONS = ["SQM", "CUM", "RMT", "MT", "NOS"];
const LABOUR_CATEGORIES = ["Skilled", "Semi-Skilled", "Unskilled"];
const GENDER_OPTIONS = ["Male", "Female"];

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

interface StructureItem {
  structureType: string;
  structureSubType: string;
  structureName: string;
  stage: string;
  itemOfWork: string;
  quantity: number | null;
  uom: string;
  remarks: string;
}

const STRUCTURE_UOM_OPTIONS = ["m³", "m²", "m", "MT", "Nos", "RM"];

// Shared mapping from a raw DPR object to typed form state.
// Used for initial load, draft comparison, and discard-draft restore.
function mapDprToFormState(dpr: any) {
  const baseSite = dpr.site.replace(/ – (Edited by|Copy by) .+$/, '').trim();
  const header = { date: dpr.date, site: baseSite, engineer: dpr.engineer };
  const workType: "road" | "structure" = dpr.workType === "structure" ? "structure" : "road";
  const structureItems: StructureItem[] = dpr.structureItems?.length
    ? dpr.structureItems.map((s: any) => ({
        structureType: s.structureType || "Other",
        structureSubType: s.structureSubType || "",
        structureName: s.structureName || "",
        stage: s.stage || "",
        itemOfWork: s.itemOfWork || "",
        quantity: s.quantity ?? null,
        uom: s.uom || "m³",
        remarks: s.remarks || "",
      }))
    : [{ structureType: "Culvert", structureSubType: "Pipe Culvert", structureName: "", stage: "Excavation", itemOfWork: "Excavation", quantity: null, uom: "m³", remarks: "" }];

  const progress: ProgressEntry[] = dpr.progress?.length
    ? dpr.progress.map((p: any) => ({
        // Batch 06C §22: keep the row's entryKey through edits — photos are
        // linked to it, and progress rows are wholesale-replaced on save.
        entryKey: p.entryKey || newEntryKey(),
        activity: p.activity || "",
        side: p.side || "",
        chainageFrom: p.chainageFrom || "",
        chainageTo: p.chainageTo || "",
        // 06T §1: a missing/zero stored Length is reconciled from chainage on
        // load (shared module) — a stale stored value is never shown silently.
        length: (() => {
          const stored = p.length != null ? Number(p.length) : null;
          if (stored != null && stored > 0) return stored;
          return calculateLengthFromChainage(p.chainageFrom || "", p.chainageTo || "") ?? stored;
        })(),
        width: p.width,
        thickness: p.thickness,
        quantity: p.quantity,
        uom: p.uom || "SQM",
        noSiteWork: p.noSiteWork || false,
        noSiteWorkDescription: p.noSiteWorkDescription || "",
        personnelIds: p.personnelIds || [],
        boqItemId: p.boqItemId ?? null,
        programmeBarId: p.programmeBarId ?? null,
        earthworkArrangementId: p.earthworkArrangementId ?? null,
        quantitySource: p.quantitySource || "",
        quantitySourceNote: p.quantitySourceNote || "",
        chainageOverrideReason: p.chainageOverrideReason || "",
        executedBy: p.executedBy || "",
        layerNo: p.layerNo != null ? Number(p.layerNo) : null,
      }))
    : [{ entryKey: newEntryKey(), activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [], boqItemId: null, programmeBarId: null, earthworkArrangementId: null, quantitySource: "", quantitySourceNote: "", chainageOverrideReason: "", executedBy: "", layerNo: null }];

  const equipment: EquipmentEntry[] = dpr.equipment?.length
    ? dpr.equipment.map((e: any) => ({
        machine: e.machine || "",
        vehicleNo: e.vehicleNo || "",
        operator: e.operator || "",
        task: e.task || "",
        entryType: e.entryType ?? "time_meter",
        startTime: e.startTime || "",
        endTime: e.endTime || "",
        openingReading: e.openingReading ?? null,
        closingReading: e.closingReading ?? null,
        diesel: e.diesel,
        equipmentId: e.equipmentId ?? null,
        dieselSource: e.dieselSource ?? "plant_stock",
        fuelStation: e.fuelStation ?? "",
        billNumber: e.billNumber ?? "",
        amountPaid: e.amountPaid ?? null,
        numberOfTrips: e.numberOfTrips ?? null,
        tripDistance: e.tripDistance ?? null,
        totalKm: e.totalKm ?? null,
        waterQuantity: e.waterQuantity ?? null,
      }))
    : [{ machine: "", vehicleNo: "", operator: "", task: "", entryType: "time_meter", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null, numberOfTrips: null, tripDistance: null, totalKm: null, waterQuantity: null, isNew: true }];

  const labour: LabourEntry[] = dpr.labour?.length
    ? dpr.labour.map((l: any) => ({
        category: l.category || "Skilled",
        gender: l.gender || "Male",
        count: l.count,
        task: l.task || "",
        contractor: l.contractor || "",
      }))
    : [{ category: "Skilled", gender: "Male", count: 0, task: "", contractor: "" }];

  const materials: MaterialEntry[] = dpr.materials
    ? dpr.materials.map((m: any) => ({
        type: m.type || "Received",
        material: m.material || "",
        quantity: m.quantity != null ? Number(m.quantity) : null,
        uom: m.uom || "",
        vehicleNumber: m.vehicleNumber || "",
        supplier: m.supplier || "",
        location: m.location || "",
        receiptNumber: m.receiptNumber || "",
      }))
    : [];

  const sitePurchases: SitePurchaseEntry[] = dpr.sitePurchases
    ? dpr.sitePurchases.map((sp: any) => ({
        itemDescription: sp.itemDescription || "",
        vendor: sp.vendor || "",
        billNo: sp.billNo || "",
        amount: sp.amount != null ? Number(sp.amount) : null,
        quantity: sp.quantity != null ? Number(sp.quantity) : null,
        uom: sp.uom || "",
      }))
    : [];

  return { header, workType, structureItems, progress, equipment, labour, materials, sitePurchases };
}

export default function SiteEdit() {
  const [, params] = useRoute("/site/edit/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { getBackLink, appendOrigin } = useOrigin();
  const { sectionCan, user: authUser } = useAuth();
  const id = parseInt(params?.id || "0");
  const backToReport = appendOrigin(`/site/report/${id}`);
  const DRAFT_KEY = `dpr_draft_${id}`;

  const isCompleteMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('complete');

  // Get PIN and role from sessionStorage (set by SiteReport before navigating)
  // Keep credentials in sessionStorage until successful save to handle page refresh
  const [pin] = useState(() => {
    if (isCompleteMode) return "complete";
    return sessionStorage.getItem(`edit_pin_${id}`) || "";
  });
  
  const [role] = useState<"manager" | "admin" | "engineer">(() => {
    if (isCompleteMode) return "engineer";
    const storedRole = sessionStorage.getItem(`auth_role_${id}`) || "manager";
    return storedRole as "manager" | "admin";
  });

  // If the user navigated directly (bookmark/share/refresh), sessionStorage may be empty.
  // Fall back to the live permission check so authorised users are never locked out.
  const canEditLive = sectionCan("site_dprs", "edit");
  const effectivePin = pin || (canEditLive ? (authUser?.isAdmin ? "admin" : "manager") : "");
  const effectiveRole = (pin ? role : (canEditLive ? (authUser?.isAdmin ? "admin" : "manager") : role)) as "manager" | "admin" | "engineer";

  // editGranted: gates the edit form for submitted DPRs.
  // True if: came through EditPermissionButton flow (token already in sessionStorage),
  // in complete mode, user is admin, or the Permission Panel grants site_dprs.edit
  // (direct editors never need a request).
  // 06M-B: structured shortage from the server's plant-stock diesel guard
  const [dieselShortage, setDieselShortage] = useState<InsufficientPlantStockPayload | null>(null);
  const [editGranted, setEditGranted] = useState(() => {
    if (isCompleteMode) return true;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(`edit_pin_${id}`)) return true;
    if (authUser?.isAdmin) return true;
    if (canEditLive) return true;
    return false;
  });
  const { data: dpr, isLoading } = useDpr(id);

  // Auto-grant for draft DPRs, admins, and Permission-Panel direct editors
  // when DPR/auth data arrives (permissions may load after mount).
  useEffect(() => {
    if (editGranted || !dpr) return;
    const isDraft = (dpr as any).dprStatus === "draft";
    if (isDraft || authUser?.isAdmin || canEditLive) setEditGranted(true);
  }, [dpr, editGranted, authUser?.isAdmin, canEditLive]);

  // Auto-issue sessionStorage token when derived from live permission — but only
  // once edit has been granted (prevents bypassing the EditPermissionButton flow).
  useEffect(() => {
    if (!pin && effectivePin && editGranted) {
      sessionStorage.setItem(`edit_pin_${id}`, effectivePin);
      sessionStorage.setItem(`auth_role_${id}`, effectiveRole);
    }
  }, [id, pin, effectivePin, effectiveRole, editGranted]);

  // Clear credentials and draft after successful save
  const clearCredentials = () => {
    sessionStorage.removeItem(`edit_pin_${id}`);
    sessionStorage.removeItem(`auth_role_${id}`);
    sessionStorage.removeItem(DRAFT_KEY);
  };

  const [draftRestored, setDraftRestored] = useState(false);
  const formInitializedRef = useRef(false);
  // JSON snapshot of the server-provided form state; used to detect real user edits before saving a draft
  const serverSnapshotRef = useRef<string | null>(null);

  const { data: equipmentMaster } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment", "all"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/equipment?includeInactive=true");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const activeEquipment = equipmentMaster?.filter(e => e.isActive) || [];

  const { data: sitesList = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });
  const activeSites = sitesList.filter(s => s.isActive);

  const [header, setHeader] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    site: "",
    engineer: "",
  });

  // Resolve numeric siteId from the selected site name
  const selectedSiteId = useMemo(() => {
    if (!header.site) return null;
    return sitesList.find((s) => s.name === header.site)?.id ?? null;
  }, [header.site, sitesList]);

  // BOQ project linked to this site
  const { data: siteBoqProjects = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/boq/projects", selectedSiteId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects?siteId=${selectedSiteId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!selectedSiteId,
  });
  const siteBoqProjectId = siteBoqProjects[0]?.id ?? null;

  // Items of that BOQ project
  const { data: siteBoqItems = [] } = useQuery<Array<{ id: number; description: string; itemCode: string | null; unit: string }>>({
    queryKey: ["/api/boq/projects", siteBoqProjectId, "items"],
    enabled: !!siteBoqProjectId,
  });

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
    { entryKey: newEntryKey(), activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [], boqItemId: null, programmeBarId: null, earthworkArrangementId: null, quantitySource: "", quantitySourceNote: "", chainageOverrideReason: "", executedBy: "", layerNo: null }
  ]);

  // Batch 06B — chainage duplicate/overlap guard (same neutral shared helper
  // as Guided/Detailed entry, Progress Report and the server recheck). The
  // DPR being edited is excluded from the prior-progress comparison.
  const overlapCandidateRows: CandidateChainageRow[] = progress.map((p, i) => ({
    rowKey: i,
    boqItemId: p.boqItemId,
    side: p.side || null,
    fromKm: parseChainageKm(p.chainageFrom),
    toKm: parseChainageKm(p.chainageTo),
    chainageOverrideReason: p.chainageOverrideReason,
    label: p.activity,
    noSiteWork: p.noSiteWork,
    layerNo: p.layerNo,
  }));
  const { priors: overlapPriors } = useChainageOverlapContext(
    progress.map((p) => p.boqItemId).filter((bid): bid is number => bid != null),
    id,
  );
  const overlapHits = useChainageOverlapHits(overlapCandidateRows, overlapPriors);

  const [equipment, setEquipment] = useState<EquipmentEntry[]>([
    { machine: "", vehicleNo: "", operator: "", task: "", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null }
  ]);

  const [labour, setLabour] = useState<LabourEntry[]>([
    { category: "Skilled", gender: "Male", count: 0, task: "", contractor: "" }
  ]);

  const [materials, setMaterials] = useState<MaterialEntry[]>([]);
  // Batch 04: consolidated submit-readiness panel (one dialog, not N toasts).
  const [readiness, setReadiness] = useState<DprReadinessResult | null>(null);

  const [sitePurchases, setSitePurchases] = useState<SitePurchaseEntry[]>([]);

  const [workType, setWorkType] = useState<"road" | "structure">("road");
  const [structureItems, setStructureItems] = useState<StructureItem[]>([
    { structureType: "Culvert", structureName: "", itemOfWork: "Excavation", quantity: null, uom: "m³", remarks: "" }
  ]);

  useEffect(() => {
    if (!dpr) return;

    // Compute and store the canonical server-side form state for dirty-checking
    const serverState = mapDprToFormState(dpr);
    const serverJson = JSON.stringify(serverState);
    serverSnapshotRef.current = serverJson;

    // Check for a saved draft first — restore it instead of overwriting with server data
    const savedDraft = sessionStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        // Only restore the draft if it actually differs from the server state
        if (JSON.stringify(draft) !== serverJson) {
          setHeader(draft.header || serverState.header);
          if (draft.progress?.length) setProgress(draft.progress);
          if (draft.equipment?.length) setEquipment(draft.equipment);
          if (draft.labour?.length) setLabour(draft.labour);
          setMaterials(draft.materials || []);
          setSitePurchases(draft.sitePurchases || []);
          if (draft.workType) setWorkType(draft.workType);
          if (draft.structureItems?.length) setStructureItems(draft.structureItems);
          setDraftRestored(true);
          formInitializedRef.current = true;
          return;
        }
        // Draft matches server — treat as stale, remove it
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // Corrupted draft — discard it and fall through to server data
        sessionStorage.removeItem(DRAFT_KEY);
      }
    }

    const { header: h, workType: wt, structureItems: si, progress: prog, equipment: eq, labour: lab, materials: mat, sitePurchases: sp } = serverState;
    setHeader(h);
    setWorkType(wt);
    setStructureItems(si);
    setProgress(prog);
    setEquipment(eq);
    setLabour(lab);
    setMaterials(mat);
    setSitePurchases(sp);
    formInitializedRef.current = true;
  }, [dpr]);

  // Auto-save draft to sessionStorage whenever form state changes (only after initial load,
  // and only when the state actually differs from what the server provided — prevents stale drafts)
  useEffect(() => {
    if (!formInitializedRef.current) return;
    const draft = { header, workType, structureItems, progress, equipment, labour, materials, sitePurchases };
    const draftJson = JSON.stringify(draft);
    if (draftJson === serverSnapshotRef.current) {
      // Form matches server state — no real edits, remove any stale draft
      sessionStorage.removeItem(DRAFT_KEY);
      return;
    }
    sessionStorage.setItem(DRAFT_KEY, draftJson);
  }, [header, workType, structureItems, progress, equipment, labour, materials, sitePurchases]);

  // Batch 06C §22: per-activity photos while editing — existing attached
  // photos count toward the 3-per-activity cap; newly staged files are
  // uploaded (with progressEntryKey) against whichever DPR id the save
  // produces (new version id, or the draft id itself).
  const { uploadFile } = useUpload();
  const { data: existingAttachments = [] } = useQuery<Array<{ id: number; fileName: string; objectPath: string; progressEntryKey?: string | null }>>({
    queryKey: ["/api/attachments", "dpr_progress", id],
    queryFn: async () => {
      const res = await fetch(`/api/attachments?moduleType=dpr_progress&linkedRecordId=${id}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: id != null,
  });
  const [entryPhotos, setEntryPhotos] = useState<Record<string, File[]>>({});
  const entryPhotoTargetRef = useRef<string | null>(null);
  const entryCameraInputRef = useRef<HTMLInputElement>(null);
  const entryGalleryInputRef = useRef<HTMLInputElement>(null);
  const entryFileInputRef = useRef<HTMLInputElement>(null);
  const addEntryPhotos = (files: FileList | null) => {
    const key = entryPhotoTargetRef.current;
    if (!key || !files || files.length === 0) return;
    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    const valid = Array.from(files).filter((f) => {
      if (f.size > MAX_FILE_SIZE) { toast({ title: "File too large", description: `${f.name} exceeds 15MB.`, variant: "destructive" }); return false; }
      if (!f.type.startsWith("image/")) { toast({ title: "Unsupported file", description: `${f.name} must be an image.`, variant: "destructive" }); return false; }
      return true;
    });
    if (valid.length === 0) return;
    const capacity = activityPhotoCapacity(countEntryAttachments(existingAttachments, key), (entryPhotos[key] ?? []).length);
    if (capacity <= 0) {
      toast({ title: "Photo limit reached", description: `Maximum ${MAX_ACTIVITY_PHOTOS} photos per activity.`, variant: "destructive" });
      return;
    }
    if (valid.length > capacity) {
      toast({ title: "Some photos not added", description: `Only ${capacity} more allowed — maximum ${MAX_ACTIVITY_PHOTOS} photos per activity.`, variant: "destructive" });
    }
    setEntryPhotos((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), ...valid.slice(0, capacity)] }));
  };
  const removeEntryPhoto = (key: string, pIdx: number) =>
    setEntryPhotos((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((_, i) => i !== pIdx) }));
  // Batch 06D: report failures so explicit Save Draft can keep failed files
  // staged instead of navigating away and silently dropping them.
  const uploadEntryPhotos = async (targetDprId: number): Promise<{ failedByEntry: Record<string, File[]>; failedCount: number }> => {
    const failedByEntry: Record<string, File[]> = {};
    let failedCount = 0;
    const markFailed = (key: string, file: File) => {
      (failedByEntry[key] ??= []).push(file);
      failedCount += 1;
    };
    for (const [key, files] of Object.entries(entryPhotos)) {
      for (const file of files) {
        const uploadResponse = await uploadFile(file);
        if (!uploadResponse) { markFailed(key, file); continue; }
        try {
          await apiRequest("POST", "/api/attachments", {
            moduleType: "dpr_progress",
            linkedRecordId: targetDprId,
            siteId: null,
            boqProjectId: null,
            fileName: file.name,
            objectPath: uploadResponse.objectPath,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
            progressEntryKey: key,
          });
        } catch {
          toast({ title: "Some photos failed to attach", description: file.name, variant: "destructive" });
          markFailed(key, file);
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/attachments", "dpr_progress", targetDprId] });
    return { failedByEntry, failedCount };
  };

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      // Create a new version instead of overwriting original
      // Send client's local timestamp for accurate time display
      const clientTimestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
      
      const response = await apiRequest("POST", `/api/dprs/${id}/version`, { 
        pin: effectivePin, 
        editedBy: effectiveRole,
        data,
        clientTimestamp,
      });
      return response.json();
    },
    onSuccess: async (newVersion) => {
      // Clear credentials after successful save
      clearCredentials();
      // Batch 06C §22: attachments were carried to the new version server-side;
      // newly staged per-activity photos upload against the new version's id.
      if (Object.values(entryPhotos).some((f) => f.length > 0)) {
        await uploadEntryPhotos(newVersion.id);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dprs/:id", id] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ predicate: (q) => { const key = q.queryKey; return Array.isArray(key) && key[0] === "/api/boq/projects" && key[2] === "plan-vs-actual"; } });
      toast({
        title: "New Version Created",
        description: "Your edited version has been saved successfully.",
      });
      // Redirect to the new version's report
      setLocation(appendOrigin(`/site/report/${newVersion.id}`));
    },
    onError: (error: any) => {
      const shortage = parseInsufficientPlantStock(error);
      if (shortage) { setDieselShortage(shortage); return; }
      toast({
        title: "Error",
        description: error.message || "Failed to save changes",
        variant: "destructive",
      });
    },
  });

  // Calculate length from chainage if not manually entered
  const getEffectiveLength = (entry: ProgressEntry): number | null => {
    // If length is manually entered, use it
    if (entry.length !== null && entry.length > 0) {
      return entry.length;
    }
    // Otherwise calculate from chainage
    return calculateLengthFromChainage(entry.chainageFrom, entry.chainageTo);
  };

  // Geometry quantity via the SAME shared BOQ-profile-aware formula used by
  // SiteEntry, Guided and the server (calculateDprQuantity) — a manual-
  // measurement BOQ item (MT/NOS/LS) never produces a "calculated" quantity.
  const entryBoqItem = (entry: ProgressEntry) =>
    entry.boqItemId != null ? (siteBoqItems.find(i => i.id === entry.boqItemId) as any) ?? null : null;

  const calculateQuantity = (entry: ProgressEntry): number | null => {
    const length = getEffectiveLength(entry);
    const boqItem = entryBoqItem(entry);
    const geo = calculateDprQuantity(length, entry.width, entry.thickness, boqItem);
    if (geo != null) {
      entry.uom = boqItem ? entry.uom : (deriveDprUom(length, entry.width, entry.thickness) ?? entry.uom);
      return geo;
    }
    return entry.quantity ?? null;
  };

  // Set source = "calculated" at the moment the geometry calc runs (same
  // mechanism as SiteEntry — a geometry-derived qty must never look manual).
  const applyCalc = (entry: ProgressEntry) => {
    const length = getEffectiveLength(entry);
    const boqItem = entryBoqItem(entry);
    const geo = calculateDprQuantity(length, entry.width, entry.thickness, boqItem);
    if (geo != null) {
      if (!boqItem) entry.uom = deriveDprUom(length, entry.width, entry.thickness) ?? entry.uom;
      entry.quantity = geo;
      entry.quantitySource = "calculated";
      entry.quantitySourceNote = "";
    } else if (entry.quantitySource === "calculated") {
      entry.quantitySource = "";
    }
  };

  const calculateHours = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? diff / 60 : 0;
  };

  const calculateMeterHours = (openingReading: number | null, closingReading: number | null): number | null => {
    if (openingReading === null || closingReading === null) return null;
    const diff = closingReading - openingReading;
    return diff >= 0 ? diff : null;
  };

  const getWorkingHours = (entry: EquipmentEntry): number => {
    const meterHours = calculateMeterHours(entry.openingReading, entry.closingReading);
    if (meterHours !== null) return meterHours;
    return calculateHours(entry.startTime, entry.endTime);
  };

  const getTotalDiesel = (): number => {
    return equipment.reduce((sum, e) => sum + (e.diesel || 0), 0);
  };

  const addRow = (section: 'progress' | 'equipment' | 'labour') => {
    if (section === 'progress') {
      setProgress([...progress, { entryKey: newEntryKey(), activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [], boqItemId: null, programmeBarId: null, earthworkArrangementId: null, quantitySource: "", quantitySourceNote: "", chainageOverrideReason: "", executedBy: "", layerNo: null }]);
    } else if (section === 'equipment') {
      // 06Q: rows added during the edit session are flagged isNew — they get
      // opening-reading continuity when equipment is selected.
      setEquipment([...equipment, { machine: "", vehicleNo: "", operator: "", task: "", entryType: "time_meter", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null, numberOfTrips: null, tripDistance: null, totalKm: null, waterQuantity: null, isNew: true }]);
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

  const addMaterial = () => {
    setMaterials([...materials, { type: "Received", material: "", quantity: null, uom: "", vehicleNumber: "", supplier: "", location: "", receiptNumber: "" }]);
  };
  const removeMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };
  const updateMaterial = (index: number, field: keyof MaterialEntry, value: any) => {
    const updated = [...materials];
    (updated[index] as any)[field] = value;
    setMaterials(updated);
  };

  const isDraftMode = !!(dpr as any)?.dprStatus && (dpr as any).dprStatus === "draft";

  // Classic → Guided is only offered when the draft carries nothing the
  // Guided screen can't represent — otherwise a later Guided save would
  // silently drop materials/site purchases/meter readings/etc.
  const guidedCompatible = useMemo(() => {
    const d = dpr as any;
    if (!d) return false;
    if (d.materials?.length || d.sitePurchases?.length || d.structureItems?.length) return false;
    for (const p of d.progress ?? []) {
      if (p.noSiteWork) return false;
      if (p.personnelIds?.length) return false;
      if (p.length != null) return false;
    }
    for (const e of d.equipment ?? []) {
      if (!e.machine) continue;
      if (e.startTime || e.endTime || e.openingReading != null || e.closingReading != null || e.diesel != null ||
          e.numberOfTrips != null || e.totalKm != null || e.waterQuantity != null || e.amountPaid != null) return false;
    }
    for (const l of d.labour ?? []) {
      if (l.boqItemId != null || l.structureId != null) return false;
    }
    return true;
  }, [dpr]);

  const isEditFormComplete = (): boolean => {
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

  const buildPayload = () => ({
    ...header,
    workType,
    structureItems: workType === "structure" ? structureItems.filter(s => s.itemOfWork) : [],
    progress: workType === "road" ? progress.filter(p => p.activity).map(p => {
      const effectiveLength = getEffectiveLength(p);
      return {
        ...p,
        length: effectiveLength,
        quantity: p.quantity ?? calculateQuantity(p),
        // 030A: numeric chainage (Km) alongside the display text
        chainageFromKm: parseChainageKm(p.chainageFrom),
        chainageToKm: parseChainageKm(p.chainageTo),
        quantitySource: p.quantitySource || null,
        quantitySourceNote: p.quantitySourceNote?.trim() || null,
        chainageOverrideReason: p.chainageOverrideReason || null,
        executedBy: p.executedBy || null,
      };
    }) : [],
    equipment: equipment.filter(e => e.machine).map(eq => {
      // 06Q: isNew is client-session state only — never sent to the server.
      const { isNew: _isNew, ...rest } = eq;
      return {
        ...rest,
        totalKm: eq.entryType === "trip_based" && eq.numberOfTrips && eq.tripDistance
          ? Number(eq.numberOfTrips) * Number(eq.tripDistance) * 2 : eq.totalKm || null,
      };
    }),
    labour: labour.filter(l => l.count > 0),
    materials: materials.filter(m => m.material).map(m => ({
      type: m.type, material: m.material, quantity: m.quantity, uom: m.uom,
      vehicleNumber: m.vehicleNumber || undefined, supplier: m.supplier || undefined,
      location: m.location || undefined, receiptNumber: m.receiptNumber || undefined,
    })),
    sitePurchases: sitePurchases.filter(sp => sp.itemDescription),
  });

  const draftSaveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await apiRequest("PATCH", `/api/dprs/${id}/draft`, payload);
      return response.json();
    },
    onSuccess: async () => {
      sessionStorage.removeItem(DRAFT_KEY);
      // Batch 06C §22: draft saves keep the same DPR id — upload staged
      // per-activity photos now so they survive close/reopen.
      let failedPhotoCount = 0;
      if (Object.values(entryPhotos).some((f) => f.length > 0)) {
        const { failedByEntry, failedCount } = await uploadEntryPhotos(id as number);
        // Keep only failed files staged so a retry never double-uploads.
        setEntryPhotos(failedByEntry);
        failedPhotoCount = failedCount;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dprs/:id", id] });
      // Batch 06D: never exit while failed photos remain staged — leaving
      // would unmount and silently lose them. Retrying Save Progress here is
      // safe (PATCHes the same draft id).
      if (failedPhotoCount > 0) {
        toast({
          title: "Draft saved — photos need retry",
          description: `${failedPhotoCount} photo${failedPhotoCount !== 1 ? "s" : ""} failed to upload and ${failedPhotoCount !== 1 ? "are" : "is"} still attached here. Save again to retry.`,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Draft Saved", description: "You can complete today's DPR later from Field Home." });
      // Batch 06D §5: explicit Save Draft exits to the originating context
      // (returnTo when provided, otherwise Field Home), same expectation as
      // the Guided wizard. Navigation happens only after the server save.
      {
        const returnToParam = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("returnTo");
        setLocation(returnToParam ?? appendOrigin("/"));
      }
    },
    onError: (error: any) => {
      const shortage = parseInsufficientPlantStock(error);
      if (shortage) { setDieselShortage(shortage); return; }
      toast({ title: "Error", description: error.message || "Failed to save draft", variant: "destructive" });
    },
  });

  const submitDraftMutation = useMutation({
    mutationFn: async (payload: any) => {
      const clientTimestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
      const response = await apiRequest("POST", `/api/dprs/${id}/submit`, { ...payload, clientTimestamp });
      return response.json();
    },
    onSuccess: async (data) => {
      sessionStorage.removeItem(DRAFT_KEY);
      // Batch 06C §22: upload any still-staged per-activity photos against
      // the submitted DPR's id before navigating away.
      if (Object.values(entryPhotos).some((f) => f.length > 0)) {
        await uploadEntryPhotos(data.id);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dprs/:id", id] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ predicate: (q) => { const key = q.queryKey; return Array.isArray(key) && key[0] === "/api/boq/projects" && key[2] === "plan-vs-actual"; } });
      toast({ title: "DPR Submitted", description: "Your daily progress report has been submitted successfully." });
      const returnToParam = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("returnTo");
      setLocation(returnToParam ?? appendOrigin(`/site/report/${data.id}`));
    },
    onError: (error: any) => {
      const shortage = parseInsufficientPlantStock(error);
      if (shortage) { setDieselShortage(shortage); return; }
      toast({ title: "Error", description: error.message || "Failed to submit DPR", variant: "destructive" });
    },
  });

  const handleDraftSave = () => {
    if (!header.date || !header.site || !header.engineer) {
      toast({ title: "Missing Fields", description: "Please fill in date, site name, and engineer name.", variant: "destructive" });
      return;
    }
    draftSaveMutation.mutate(buildPayload());
  };

  const handleSubmitDraft = () => {
    if (!header.date || !header.site || !header.engineer) {
      toast({ title: "Missing Fields", description: "Please fill in date, site name, and engineer name.", variant: "destructive" });
      return;
    }
    // Batch 06B — a real chainage overlap needs a reason before Final Submit
    // (draft save stays lenient).
    for (let i = 0; i < progress.length; i++) {
      const p = progress[i];
      if (p.noSiteWork) continue;
      if ((overlapHits.get(i) ?? []).length > 0 && !p.chainageOverrideReason.trim()) {
        toast({ title: `Row ${i + 1}: reason required`, description: "Possible chainage overlap requires a reason before submission — tap \u201cGive reason\u201d on the overlap warning.", variant: "destructive" });
        return;
      }
    }
    // Batch 04: same shared readiness rule as Guided/Detailed/server.
    const payload = buildPayload();
    const r = evaluateDprSubmitReadiness(payload as any);
    if (r.mandatory.length > 0 || r.advisories.length > 0) {
      setReadiness(r);
      return;
    }
    submitDraftMutation.mutate(payload);
  };

  const handleSave = () => {
    if (!header.date || !header.site || !header.engineer) {
      toast({
        title: "Missing Fields",
        description: "Please fill in date, site name, and engineer name.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate(buildPayload());
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  if (!dpr) {
    return <div className="p-20 text-center text-red-500">Report not found.</div>;
  }

  if (!editGranted && !isDraftMode) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(backToReport)} data-testid="button-back-to-report">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">Edit Report</h1>
            <p className="text-muted-foreground text-sm">{(dpr as any)?.date} — {(dpr as any)?.site}</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
            <Shield className="w-8 h-8 text-muted-foreground" />
            <div>
              <p className="font-semibold">This report has been submitted</p>
              <p className="text-sm text-muted-foreground mt-1">Request edit access to make changes to this DPR</p>
            </div>
            <EditPermissionButton
              recordType="dpr"
              recordId={id}
              onEditGranted={() => {
                const r = authUser?.isAdmin ? "admin" : "manager";
                sessionStorage.setItem(`edit_pin_${id}`, r);
                sessionStorage.setItem(`auth_role_${id}`, r);
                setEditGranted(true);
              }}
              label="Request Edit"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const _searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const _returnTo = _searchParams.get("returnTo");
  const draftBackHref = _returnTo ?? appendOrigin("/");

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      <InsufficientDieselDialog payload={dieselShortage} onClose={() => setDieselShortage(null)} />
      {isDraftMode && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Shield className="w-4 h-4 shrink-0" />
          <span><strong>Draft DPR</strong> — Fill in closing readings and quantities, then tap <strong>Submit DPR</strong> when done.</span>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(isDraftMode ? draftBackHref : backToReport)} data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">{isDraftMode ? "Complete DPR" : "Edit Report"}</h1>
            <p className="text-muted-foreground text-sm">{isDraftMode ? "Add closing details and submit when ready" : "Modify and save your changes"}</p>
          </div>
        </div>
        {isDraftMode ? (
          <div className="flex items-center gap-2">
            {workType === "road" && guidedCompatible && (
              <Button
                variant="ghost"
                onClick={() => {
                  // Batch 05 (spec §4): view switch only — never changes the
                  // persistent default entry mode.
                  setLocation(`/site/guided?draftId=${id}${_returnTo ? `&returnTo=${encodeURIComponent(_returnTo)}` : ""}`);
                }}
                className="gap-2"
                data-testid="button-switch-guided"
              >
                Guided DPR
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleDraftSave}
              disabled={draftSaveMutation.isPending || submitDraftMutation.isPending}
              className="gap-2"
              data-testid="button-save-draft-progress"
            >
              {draftSaveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Progress
            </Button>
            {isEditFormComplete() && (
              <Button
                onClick={handleSubmitDraft}
                disabled={submitDraftMutation.isPending || draftSaveMutation.isPending}
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-submit-dpr"
              >
                {submitDraftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit DPR
              </Button>
            )}
          </div>
        ) : (
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2" data-testid="button-save">
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </Button>
        )}
      </div>

      {draftRestored && (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
          data-testid="banner-draft-restored"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 shrink-0" />
            <span><strong>Unsaved draft restored.</strong> Your in-progress edits were recovered after the page refresh. Save when ready or discard below.</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-400 h-7 px-2"
            onClick={() => {
              sessionStorage.removeItem(DRAFT_KEY);
              setDraftRestored(false);
              if (dpr) {
                const serverState = mapDprToFormState(dpr);
                setHeader(serverState.header);
                setProgress(serverState.progress);
                setEquipment(serverState.equipment);
                setLabour(serverState.labour);
                setMaterials(serverState.materials);
                setSitePurchases(serverState.sitePurchases);
              }
            }}
            data-testid="button-discard-draft"
          >
            <X className="w-3 h-3 mr-1" />
            Discard draft
          </Button>
        </div>
      )}

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
                  {header.engineer && !(personnelList || []).some(p => 
                    `${p.name.toUpperCase()} - ${p.role.toUpperCase()}` === header.engineer
                  ) && (
                    <SelectItem value={header.engineer}>{header.engineer} (LEGACY)</SelectItem>
                  )}
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
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle>{workType === "structure" ? "Structure Works Progress" : "Activity Progress"}</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setWorkType("road")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${workType === "road" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                data-testid="button-worktype-road"
              >Road</button>
              <button
                type="button"
                onClick={() => setWorkType("structure")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${workType === "structure" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                data-testid="button-worktype-structure"
              >Structure</button>
            </div>
            {workType === "road" && (
              <Button size="sm" variant="outline" onClick={() => addRow('progress')} data-testid="button-add-progress">
                <Plus className="w-4 h-4 mr-1" /> Add Row
              </Button>
            )}
            {workType === "structure" && (
              <Button size="sm" variant="outline" onClick={() => setStructureItems(prev => [...prev, { structureType: "Culvert", structureSubType: "Pipe Culvert", structureName: "", stage: "Excavation", itemOfWork: "Excavation", quantity: null, uom: "m³", remarks: "" }])} data-testid="button-add-structure">
                <Plus className="w-4 h-4 mr-1" /> Add Item
              </Button>
            )}
          </div>
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
                    <Input placeholder="e.g. Culvert at Ch. 5+200" value={item.structureName} onChange={(e) => updateField("structureName", e.target.value)} data-testid={`input-structure-name-${idx}`} />
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
                      <SelectTrigger data-testid={`select-item-work-${idx}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{STRUCTURE_ITEMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    {isOtherItem && <Input placeholder="Specify item…" value={item.itemOfWork !== "Other" ? item.itemOfWork : ""} onChange={(e) => updateField("itemOfWork", e.target.value || "Other")} data-testid={`input-structure-item-other-${idx}`} />}
                  </div>
                  <div>
                    <Label className="text-sm">Quantity</Label>
                    <Input type="number" placeholder="0" value={item.quantity ?? ""} onChange={(e) => updateField("quantity", e.target.value ? parseFloat(e.target.value) : null)} data-testid={`input-structure-qty-${idx}`} />
                  </div>
                  <div>
                    <Label className="text-sm">Unit</Label>
                    <Select value={item.uom} onValueChange={(v) => updateField("uom", v)}>
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
          ) : null}
          {workType === "road" && progress.map((entry, idx) => (
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
                      data-testid={`input-description-${idx}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="col-span-2">
                    {/* When site has a BOQ project:
                        - If boqItemId is set: show BOQ dropdown pre-selected (allows switching item)
                        - If activity is empty: show BOQ dropdown for new selection
                        - If free-text activity exists (legacy data): show text input with option to switch to BOQ
                        boqItemId is saved with the DPR payload and persisted to progress_entries.boq_item_id */}
                    <Label className="text-sm">{siteBoqItems.length > 0 ? "BOQ Item / Activity" : "Activity"}</Label>
                    {siteBoqItems.length > 0 && entry.boqItemId != null ? (
                      <Select
                        value={String(entry.boqItemId)}
                        onValueChange={(val) => {
                          const updated = [...progress];
                          if (val === "__none__") {
                            updated[idx].boqItemId = null;
                            updated[idx].activity = "";
                          } else {
                            const boqItem = siteBoqItems.find((i) => i.id === parseInt(val));
                            updated[idx].boqItemId = parseInt(val);
                            updated[idx].activity = boqItem ? boqItemDisplayName(boqItem).toUpperCase() : "";
                          }
                          // 06T §3: deliberate BOQ-item change — the old
                          // arrangement and bar link no longer describe this
                          // row's context; both re-resolve.
                          updated[idx].earthworkArrangementId = null;
                          updated[idx].programmeBarId = null;
                          setProgress(updated);
                        }}
                        data-testid={`select-boq-item-${idx}`}
                      >
                        <SelectTrigger className="uppercase text-sm">
                          <SelectValue placeholder="Select BOQ item…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Unlink from BOQ —</SelectItem>
                          {siteBoqItems.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {item.itemCode ? `${item.itemCode} · ` : ""}{boqItemDisplayName(item)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : siteBoqItems.length > 0 && !entry.activity ? (
                      <Select
                        value="__none__"
                        onValueChange={(val) => {
                          const updated = [...progress];
                          if (val !== "__none__") {
                            const boqItem = siteBoqItems.find((i) => i.id === parseInt(val));
                            updated[idx].boqItemId = parseInt(val);
                            updated[idx].activity = boqItem ? boqItemDisplayName(boqItem).toUpperCase() : "";
                            // 06T §3: BOQ context change — arrangement/bar re-resolve.
                            updated[idx].earthworkArrangementId = null;
                            updated[idx].programmeBarId = null;
                          }
                          setProgress(updated);
                        }}
                        data-testid={`select-boq-item-${idx}`}
                      >
                        <SelectTrigger className="uppercase text-sm">
                          <SelectValue placeholder="Select BOQ item…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Select activity —</SelectItem>
                          {siteBoqItems.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {item.itemCode ? `${item.itemCode} · ` : ""}{boqItemDisplayName(item)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="space-y-1">
                        <Input
                          placeholder="Activity description"
                          value={entry.activity}
                          onChange={(e) => {
                            const updated = [...progress];
                            updated[idx].activity = e.target.value.toUpperCase();
                            setProgress(updated);
                          }}
                          className="uppercase"
                          data-testid={`input-activity-${idx}`}
                        />
                        {siteBoqItems.length > 0 && (
                          <p className="text-[12px] text-muted-foreground">
                            Free-text entry.{" "}
                            <button
                              className="underline text-blue-600"
                              type="button"
                              onClick={() => {
                                const updated = [...progress];
                                updated[idx].activity = "";
                                setProgress(updated);
                              }}
                              data-testid={`button-switch-to-boq-${idx}`}
                            >
                              Switch to BOQ item
                            </button>
                          </p>
                        )}
                      </div>
                    )}
                    {/* 030A: programme-bar linkage (parity with SiteEntry) */}
                    {siteBoqItems.length > 0 && entry.boqItemId != null && siteBoqProjectId != null && (
                      <ProgrammeBarPicker
                        projectId={siteBoqProjectId}
                        boqItemId={entry.boqItemId}
                        dprDate={header.date}
                        value={entry.programmeBarId}
                        sideLabel={entry.side || null}
                        fromKm={parseChainageKm(entry.chainageFrom)}
                        toKm={parseChainageKm(entry.chainageTo)}
                        testidPrefix={`progress-${idx}`}
                        onSelect={(bar) => {
                          const updated = [...progress];
                          // 06T §3: bar context changed — arrangement re-resolves.
                          updated[idx].earthworkArrangementId = null;
                          if (!bar) {
                            updated[idx].programmeBarId = null;
                            setProgress(updated);
                            return;
                          }
                          updated[idx].programmeBarId = bar.id;
                          if (bar.chainageFrom != null && !updated[idx].chainageFrom) updated[idx].chainageFrom = String(bar.chainageFrom);
                          if (bar.chainageTo != null && !updated[idx].chainageTo) updated[idx].chainageTo = String(bar.chainageTo);
                          if (!updated[idx].side && bar.side) {
                            // Batch 1: Both-Sides/Full-Width bars never preset the actual side.
                            if (bar.side === "lhs") updated[idx].side = "LHS";
                            else if (bar.side === "rhs") updated[idx].side = "RHS";
                          }
                          if (updated[idx].width == null && bar.plannedWidthM != null) updated[idx].width = Number(bar.plannedWidthM);
                          const calc = calculateLengthFromChainage(updated[idx].chainageFrom, updated[idx].chainageTo);
                          if (calc !== null) updated[idx].length = calc;
                          applyCalc(updated[idx]);
                          setProgress(updated);
                        }}
                      />
                    )}
                    {entry.programmeBarId != null && (() => {
                      const sideKey = (() => { const k = normalizeDprSideKey(entry.side); return k && isBarSide(k) ? k : null; })();
                      const fromKm = parseChainageKm(entry.chainageFrom);
                      const toKm = parseChainageKm(entry.chainageTo);
                      return (
                        <BarLinkFeedback
                          projectId={siteBoqProjectId}
                          boqItemId={entry.boqItemId}
                          programmeBarId={entry.programmeBarId}
                          sideKey={sideKey}
                          sideLabel={entry.side}
                          fromKm={fromKm}
                          toKm={toKm}
                          overrideReason={entry.chainageOverrideReason}
                          onOverrideReason={(v) => {
                            const updated = [...progress];
                            updated[idx].chainageOverrideReason = v;
                            setProgress(updated);
                          }}
                          qty={entry.quantity}
                          executedBy={entry.executedBy || null}
                          onExecutedBy={(v) => {
                            const updated = [...progress];
                            updated[idx].executedBy = v;
                            setProgress(updated);
                          }}
                          testidPrefix={`progress-${idx}`}
                        />
                      );
                    })()}
                    {/* Batch 06E: Detailed parity — read-only Linked Site
                        Receipts (linkage lives on site_material_trips). */}
                    {entry.boqItemId != null && siteBoqProjectId != null && header.site && !entry.noSiteWork && (
                      <ActivityReceiptStrip
                        siteName={header.site}
                        date={header.date}
                        boqProjectId={siteBoqProjectId}
                        boqItemId={entry.boqItemId}
                        programmeBarId={entry.programmeBarId}
                        executedQty={(() => { const q = entry.quantity ?? calculateQuantity(entry); const f = (siteBoqItems.find((it) => it.id === entry.boqItemId) as any)?.dprConversionFactor ?? 1; return q != null ? q * f : null; })()}
                        executedUom={(siteBoqItems.find((it) => it.id === entry.boqItemId) as any)?.unit ?? entry.uom ?? null}
                        readOnly
                        persistedArrangementId={entry.earthworkArrangementId}
                        onArrangementResolved={(id) => {
                          setProgress((prev) => prev.map((p, i) => (i === idx ? { ...p, earthworkArrangementId: id } : p)));
                        }}
                        activityMaterialHint={entry.activity || null}
                        testIdPrefix={`detailed-receipt-${idx}`}
                      />
                    )}
                    {/* Batch 06B: possible-overlap advisory — reuses this row's
                        chainageOverrideReason; prior DPRs open read-only in a
                        modal over this form. */}
                    <ChainageOverlapWarning
                      hits={overlapHits.get(idx) ?? []}
                      overrideReason={entry.chainageOverrideReason}
                      onOverrideReason={(v) => {
                        const updated = [...progress];
                        updated[idx].chainageOverrideReason = v;
                        setProgress(updated);
                      }}
                      testidPrefix={`progress-${idx}`}
                    />
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
                      <SelectTrigger data-testid={`select-side-${idx}`}>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {SIDE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">From (Km)</Label>
                    <Input
                      placeholder="0+000"
                      value={entry.chainageFrom}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].chainageFrom = e.target.value.toUpperCase();
                        const calc = calculateLengthFromChainage(e.target.value.toUpperCase(), updated[idx].chainageTo);
                        if (calc !== null) updated[idx].length = calc;
                        applyCalc(updated[idx]);
                        setProgress(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-chainage-from-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">To (Km)</Label>
                    <Input
                      placeholder="0+000"
                      value={entry.chainageTo}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].chainageTo = e.target.value.toUpperCase();
                        const calc = calculateLengthFromChainage(updated[idx].chainageFrom, e.target.value.toUpperCase());
                        if (calc !== null) updated[idx].length = calc;
                        applyCalc(updated[idx]);
                        setProgress(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-chainage-to-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Length (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={entry.length ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].length = e.target.value ? parseFloat(e.target.value) : null;
                        applyCalc(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-length-${idx}`}
                    />
                    {(() => {
                      // 06T §1: computed-vs-overridden visibility (same pattern
                      // as quantity) — never silently show a stale Length.
                      const calc = calculateLengthFromChainage(entry.chainageFrom, entry.chainageTo);
                      if (calc != null && entry.length != null && entry.length > 0 && Math.abs(calc - entry.length) > 0.01) {
                        return (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1" data-testid={`note-length-override-${idx}`}>
                            Overridden — chainage gives {calc} m
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div>
                    <Label className="text-sm">Width (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={entry.width ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].width = e.target.value ? parseFloat(e.target.value) : null;
                        applyCalc(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-width-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Thickness (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={entry.thickness ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].thickness = e.target.value ? parseFloat(e.target.value) : null;
                        applyCalc(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-thickness-${idx}`}
                    />
                  </div>
                  <div>
                    {/* 06P: optional layer/lift number — blank = today's behaviour. */}
                    <Label className="text-sm">{layerFieldLabel(entry.activity)}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      step={1}
                      min={1}
                      placeholder="—"
                      value={entry.layerNo ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].layerNo = e.target.value === "" ? null : Math.trunc(Number(e.target.value));
                        setProgress(updated);
                      }}
                      data-testid={`input-layer-no-${idx}`}
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
                        applyCalc(updated[idx]);
                        setProgress(updated);
                      }}
                    >
                      <SelectTrigger data-testid={`select-uom-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UOM_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Qty</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={calculateQuantity(entry)?.toFixed(3) || "Auto"}
                      value={entry.quantity ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        const v = e.target.value ? parseFloat(e.target.value) : null;
                        updated[idx].quantity = v;
                        const calc = calculateQuantity(updated[idx]);
                        if (v == null) {
                          if (updated[idx].quantitySource === "calculated") updated[idx].quantitySource = "";
                        } else if (calc != null && calc !== v && !quantitiesMatch(v, calc)) {
                          if (updated[idx].quantitySource === "calculated") updated[idx].quantitySource = "";
                        } else if (calc != null && quantitiesMatch(v, calc)) {
                          updated[idx].quantitySource = "calculated";
                          updated[idx].quantitySourceNote = "";
                        }
                        setProgress(updated);
                      }}
                      data-testid={`input-qty-${idx}`}
                    />
                    {/* Calculated quantities are labelled read-only; only a manual
                        or overridden quantity asks for a real source. */}
                    {entry.quantitySource === "calculated" ? (
                      <p className="text-[10px] text-muted-foreground mt-1" data-testid={`text-qty-source-auto-${idx}`}>
                        Quantity source: Calculated from geometry (automatic)
                      </p>
                    ) : entry.quantity != null ? (
                      <>
                        <Select
                          value={entry.quantitySource || undefined}
                          onValueChange={(val) => {
                            const updated = [...progress];
                            updated[idx].quantitySource = val;
                            if (val !== "other") updated[idx].quantitySourceNote = "";
                            setProgress(updated);
                          }}
                        >
                          <SelectTrigger className="h-7 mt-1 text-xs" data-testid={`select-qty-source-${idx}`}>
                            <SelectValue placeholder="Qty source (required)" />
                          </SelectTrigger>
                          <SelectContent>
                            {MANUAL_QUANTITY_SOURCES.map(qs => (
                              <SelectItem key={qs} value={qs}>{QUANTITY_SOURCE_LABELS[qs]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {entry.quantitySource === "other" && (
                          <Input className="h-7 mt-1 text-xs" placeholder="How was this quantity determined? (required)"
                            value={entry.quantitySourceNote}
                            onChange={(e) => {
                              const updated = [...progress];
                              updated[idx].quantitySourceNote = e.target.value;
                              setProgress(updated);
                            }}
                            data-testid={`input-qty-source-note-${idx}`} />
                        )}
                      </>
                    ) : null}
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

              {/* Batch 06C §22: per-activity photos while editing — already
                  attached ones shown (server-counted) + newly staged, max 3. */}
              <div className="mt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-sm text-muted-foreground">
                    Photos ({countEntryAttachments(existingAttachments, entry.entryKey) + (entryPhotos[entry.entryKey] ?? []).length}/{MAX_ACTIVITY_PHOTOS}):
                  </Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1"
                    disabled={activityPhotoCapacity(countEntryAttachments(existingAttachments, entry.entryKey), (entryPhotos[entry.entryKey] ?? []).length) <= 0}
                    onClick={() => { entryPhotoTargetRef.current = entry.entryKey; entryCameraInputRef.current?.click(); }}
                    data-testid={`button-entry-photo-camera-${idx}`}>
                    <Camera className="w-3.5 h-3.5" /> Camera
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1"
                    disabled={activityPhotoCapacity(countEntryAttachments(existingAttachments, entry.entryKey), (entryPhotos[entry.entryKey] ?? []).length) <= 0}
                    onClick={() => { entryPhotoTargetRef.current = entry.entryKey; entryGalleryInputRef.current?.click(); }}
                    data-testid={`button-entry-photo-gallery-${idx}`}>
                    <ImageIcon className="w-3.5 h-3.5" /> Gallery
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1"
                    disabled={activityPhotoCapacity(countEntryAttachments(existingAttachments, entry.entryKey), (entryPhotos[entry.entryKey] ?? []).length) <= 0}
                    onClick={() => { entryPhotoTargetRef.current = entry.entryKey; entryFileInputRef.current?.click(); }}
                    data-testid={`button-entry-photo-file-${idx}`}>
                    <Paperclip className="w-3.5 h-3.5" /> File
                  </Button>
                </div>
                {(existingAttachments.filter((a) => a.progressEntryKey === entry.entryKey).length > 0 || (entryPhotos[entry.entryKey] ?? []).length > 0) && (
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {existingAttachments.filter((a) => a.progressEntryKey === entry.entryKey).map((a) => (
                      <img key={a.id} src={a.objectPath} alt={a.fileName} className="w-14 h-14 object-cover rounded-md border" />
                    ))}
                    {(entryPhotos[entry.entryKey] ?? []).map((file, pIdx) => (
                      <div key={pIdx} className="relative">
                        <img src={URL.createObjectURL(file)} alt={file.name} className="w-14 h-14 object-cover rounded-md border" />
                        <button type="button" className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
                          onClick={() => removeEntryPhoto(entry.entryKey, pIdx)} data-testid={`button-remove-entry-photo-${idx}-${pIdx}`}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {workType === "road" && (
            <>
              <input ref={entryCameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { addEntryPhotos(e.target.files); if (entryCameraInputRef.current) entryCameraInputRef.current.value = ""; }} />
              <input ref={entryGalleryInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { addEntryPhotos(e.target.files); if (entryGalleryInputRef.current) entryGalleryInputRef.current.value = ""; }} />
              <input ref={entryFileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { addEntryPhotos(e.target.files); if (entryFileInputRef.current) entryFileInputRef.current.value = ""; }} />
            </>
          )}
          {workType === "road" && (
            <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => addRow('progress')} data-testid="button-add-progress-bottom">
              <Plus className="w-4 h-4 mr-1" /> Add Row
            </Button>
          )}
          {workType === "structure" && (
            <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => setStructureItems(prev => [...prev, { structureType: "Culvert", structureSubType: "Pipe Culvert", structureName: "", stage: "Excavation", itemOfWork: "Excavation", quantity: null, uom: "m³", remarks: "" }])} data-testid="button-add-structure-bottom">
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          )}
        </CardContent>
      </Card>

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
                      const wasExistingWithReading = !entry.isNew && entry.openingReading != null && entry.equipmentId !== selectedEquip.id;
                      updated[idx].equipmentId = selectedEquip.id;
                      updated[idx].machine = selectedEquip.name;
                      updated[idx].vehicleNo = selectedEquip.registrationNumber || "";
                      if (selectedEquip.ownership !== "hired") {
                        updated[idx].entryType = "time_meter";
                        updated[idx].numberOfTrips = null;
                        updated[idx].tripDistance = null;
                        updated[idx].totalKm = null;
                      }
                      setEquipment(updated);
                      // 06Q: opening-reading continuity for rows added during
                      // this edit session (isNew). Existing historical rows are
                      // NEVER silently recalculated — changing equipment on an
                      // existing row asks for explicit confirmation first.
                      const runContinuity = entry.isNew
                        ? true
                        : wasExistingWithReading
                          ? window.confirm("You changed the equipment on an existing entry. Replace its stored Opening Reading with this equipment's latest prior closing reading? Cancel keeps the stored value.")
                          : false;
                      if (runContinuity && header.date) {
                        fetchLatestPriorClosing(selectedEquip.id, header.date).then((latest) => {
                          if (latest.closingReading == null) return;
                          setEquipment(prev => {
                            const next = [...prev];
                            const row = next[idx];
                            // Stale guard: only apply if this row still shows
                            // this equipment. New rows only fill a blank
                            // opening (manual entry is never overwritten);
                            // confirmed existing-row changes replace it.
                            if (!row || row.equipmentId !== selectedEquip.id) return prev;
                            if (row.isNew && row.openingReading != null) return prev;
                            next[idx] = { ...row, openingReading: latest.closingReading };
                            return next;
                          });
                        });
                      }
                      return;
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
                  <p className="text-sm text-muted-foreground mt-1" data-testid={`text-equipment-reg-${idx}`}>Reg: {entry.vehicleNo}</p>
                )}
                {entry.equipmentId && (() => {
                  const selEquip = activeEquipment.find(e => e.id === entry.equipmentId) || equipmentMaster?.find(e => e.id === entry.equipmentId);
                  if (!selEquip) return null;
                  const ownerLabel = selEquip.ownership === "hired" ? `HIRED: ${selEquip.vendorName || "VENDOR"}` : "HLC OWN";
                  return <p className="text-sm text-muted-foreground mt-0.5" data-testid={`text-equipment-owner-${idx}`}>{ownerLabel}</p>;
                })()}
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
                  data-testid={`input-operator-${idx}`}
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
                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                    <div>
                      <Label className="text-sm">Start</Label>
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
                      <Label className="text-sm">End</Label>
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
                      <Label className="text-sm">Opening Reading</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Meter"
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
                      <Label className="text-sm">Closing Reading</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Meter"
                        value={entry.closingReading ?? ""}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].closingReading = e.target.value ? parseFloat(e.target.value) : null;
                          setEquipment(updated);
                        }}
                        data-testid={`input-equipment-closing-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Working Hours</Label>
                      <div className="bg-primary/10 px-3 py-2 rounded border border-primary/20 font-semibold text-primary text-sm" data-testid={`display-working-hours-${idx}`}>
                        {workingHours > 0 ? `${workingHours.toFixed(3)} hrs` : "-"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm">Diesel (L)</Label>
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
                      <div className="bg-primary/10 px-3 py-2 rounded border border-primary/20 font-semibold text-primary text-sm" data-testid={`display-total-km-${idx}`}>
                        {calculatedTotalKm > 0 ? `${calculatedTotalKm.toFixed(1)} km` : "-"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm">Diesel (L)</Label>
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
                        value={entry.fuelStation ?? ""}
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
                        value={entry.billNumber ?? ""}
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

      {/* Materials */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-orange-600">Materials Log</CardTitle>
          <Button size="sm" variant="outline" onClick={addMaterial} data-testid="button-add-material-top">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 06T §5: today's Site Material Trips — read-only, so engineers
              never re-enter bulk deliveries that already exist as trips. */}
          {header.site && header.date && (
            <DprDayTripsPanel siteName={header.site} date={header.date} testIdPrefix="edit-materials" />
          )}
          {materials.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No materials recorded.</p>
          ) : (
            materials.map((m, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-8 gap-3 items-end p-4 bg-muted/30 rounded-lg relative" data-testid={`material-row-${idx}`}>
                <Button size="icon" variant="ghost" className="absolute right-0 top-0 text-muted-foreground hover:text-destructive" onClick={() => removeMaterial(idx)} data-testid={`button-remove-material-${idx}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
                <div>
                  <Label>Type</Label>
                  <Select value={m.type} onValueChange={(v) => updateMaterial(idx, 'type', v)}>
                    <SelectTrigger data-testid={`select-material-type-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Received">Received</SelectItem>
                      <SelectItem value="Issued">Issued</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Material</Label>
                  <Input placeholder="e.g. 20MM AGGREGATE" value={m.material} onChange={e => updateMaterial(idx, 'material', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-material-name-${idx}`} />
                </div>
                <div>
                  <Label>Qty</Label>
                  <Input type="number" step="0.001" placeholder="0" value={m.quantity ?? ''} onChange={e => updateMaterial(idx, 'quantity', e.target.value ? parseFloat(e.target.value) : null)} data-testid={`input-material-qty-${idx}`} />
                </div>
                <div>
                  <Label>UOM</Label>
                  <Input placeholder="CFT/MT" value={m.uom} onChange={e => updateMaterial(idx, 'uom', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-material-uom-${idx}`} />
                </div>
                <div>
                  <Label>Vehicle No</Label>
                  <Input placeholder="Vehicle number" value={m.vehicleNumber} onChange={e => updateMaterial(idx, 'vehicleNumber', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-material-vehicle-${idx}`} />
                </div>
                <div>
                  <Label>Supplier</Label>
                  <Input placeholder="Supplier name" value={m.supplier} onChange={e => updateMaterial(idx, 'supplier', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-material-supplier-${idx}`} />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input placeholder="Location" value={m.location} onChange={e => updateMaterial(idx, 'location', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-material-location-${idx}`} />
                </div>
                <div>
                  <Label>Receipt No</Label>
                  <Input placeholder="Receipt number" value={m.receiptNumber} onChange={e => updateMaterial(idx, 'receiptNumber', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-material-receipt-${idx}`} />
                </div>
              </div>
            ))
          )}
          {materials.length > 0 && (
            <Button variant="outline" className="w-full border-dashed" onClick={addMaterial} data-testid="button-add-material-bottom">
              <Plus className="w-4 h-4 mr-1" /> Add Material
            </Button>
          )}
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
            <p className="text-muted-foreground text-sm text-center py-4">No site purchases added.</p>
          ) : (
            sitePurchases.map((sp, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end p-4 bg-muted/30 rounded-lg relative">
                <Button size="icon" variant="ghost" className="absolute right-0 top-0 text-muted-foreground hover:text-destructive" onClick={() => removeSitePurchase(idx)} data-testid={`button-remove-site-purchase-${idx}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
                <div className="md:col-span-2">
                  <Label>Item Description</Label>
                  <Input placeholder="e.g. Diesel for cleaning" value={sp.itemDescription} onChange={e => updateSitePurchase(idx, 'itemDescription', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-site-purchase-item-${idx}`} />
                </div>
                <div>
                  <Label>Vendor</Label>
                  <Input placeholder="e.g. Local Fuel Station" value={sp.vendor} onChange={e => updateSitePurchase(idx, 'vendor', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-site-purchase-vendor-${idx}`} />
                </div>
                <div>
                  <Label>Bill No</Label>
                  <Input placeholder="e.g. INV-001" value={sp.billNo} onChange={e => updateSitePurchase(idx, 'billNo', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-site-purchase-bill-${idx}`} />
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={sp.amount ?? ''} onChange={e => updateSitePurchase(idx, 'amount', e.target.value ? parseFloat(e.target.value) : null)} data-testid={`input-site-purchase-amount-${idx}`} />
                </div>
                <div>
                  <Label>Qty</Label>
                  <Input type="number" step="0.01" placeholder="0" value={sp.quantity ?? ''} onChange={e => updateSitePurchase(idx, 'quantity', e.target.value ? parseFloat(e.target.value) : null)} data-testid={`input-site-purchase-qty-${idx}`} />
                </div>
                <div>
                  <Label>UOM</Label>
                  <Input placeholder="Litres/Nos" value={sp.uom} onChange={e => updateSitePurchase(idx, 'uom', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-site-purchase-uom-${idx}`} />
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

      <div className="flex justify-end gap-4 pt-4">
        <Button variant="outline" onClick={() => setLocation(backToReport)} data-testid="button-cancel">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2" data-testid="button-save-bottom">
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
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

      {/* Batch 04: consolidated submit-readiness panel */}
      <DprReadinessDialog
        readiness={readiness}
        onClose={() => setReadiness(null)}
        onSubmitAnyway={() => submitDraftMutation.mutate(buildPayload())}
        onSaveDraft={handleDraftSave}
      />
    </div>
  );
}
