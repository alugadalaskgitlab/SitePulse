import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { useAuth } from "@/lib/auth-context";
import { ChevronLeft, Plus, Trash2, Save, Loader2, UserPlus, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useDpr } from "@/hooks/use-dprs";
import type { EquipmentMasterType, Site, Personnel } from "@shared/schema";
import { PERSONNEL_ROLES } from "@shared/schema";
import { STRUCTURE_TYPES, STRUCTURE_ITEMS, getSubTypes, getStages } from "@shared/structureHierarchy";

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

const SIDE_OPTIONS = ["LHS", "RHS", "Full Width"];
const UOM_OPTIONS = ["SQM", "CUM", "RMT", "MT", "NOS"];
const LABOUR_CATEGORIES = ["Skilled", "Semi-Skilled", "Unskilled"];
const GENDER_OPTIONS = ["Male", "Female"];

// Helper to parse chainage like "0+500" or "1+250" into meters
function parseChainageToMeters(chainage: string): number | null {
  if (!chainage) return null;
  const match = chainage.match(/^(\d+)\+(\d+)$/);
  if (match) {
    const km = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    return km * 1000 + m;
  }
  // Decimal kilometres (e.g. "2.100" = 2.1 km = 2100 m)
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
        activity: p.activity || "",
        side: p.side || "",
        chainageFrom: p.chainageFrom || "",
        chainageTo: p.chainageTo || "",
        length: p.length,
        width: p.width,
        thickness: p.thickness,
        quantity: p.quantity,
        uom: p.uom || "SQM",
        noSiteWork: p.noSiteWork || false,
        noSiteWorkDescription: p.noSiteWorkDescription || "",
        personnelIds: p.personnelIds || [],
        boqItemId: p.boqItemId ?? null,
      }))
    : [{ activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [], boqItemId: null }];

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
    : [{ machine: "", vehicleNo: "", operator: "", task: "", entryType: "time_meter", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null, numberOfTrips: null, tripDistance: null, totalKm: null, waterQuantity: null }];

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

  // Auto-issue token into sessionStorage when derived from live permission,
  // so subsequent reads (e.g. after a sub-navigation) find consistent values.
  useEffect(() => {
    if (!pin && effectivePin) {
      sessionStorage.setItem(`edit_pin_${id}`, effectivePin);
      sessionStorage.setItem(`auth_role_${id}`, effectiveRole);
    }
  }, [id, pin, effectivePin, effectiveRole]);

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

  const { data: dpr, isLoading } = useDpr(id);

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
    { activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [], boqItemId: null }
  ]);

  const [equipment, setEquipment] = useState<EquipmentEntry[]>([
    { machine: "", vehicleNo: "", operator: "", task: "", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null }
  ]);

  const [labour, setLabour] = useState<LabourEntry[]>([
    { category: "Skilled", gender: "Male", count: 0, task: "", contractor: "" }
  ]);

  const [materials, setMaterials] = useState<MaterialEntry[]>([]);

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
    onSuccess: (newVersion) => {
      // Clear credentials after successful save
      clearCredentials();
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dprs/:id", id] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      toast({
        title: "New Version Created",
        description: "Your edited version has been saved successfully.",
      });
      // Redirect to the new version's report
      setLocation(appendOrigin(`/site/report/${newVersion.id}`));
    },
    onError: (error: any) => {
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

  const calculateQuantity = (entry: ProgressEntry): number | null => {
    const length = getEffectiveLength(entry);
    if (!length || !entry.width) return null;
    if (entry.uom === "SQM") {
      return length * entry.width;
    } else if (entry.uom === "CUM" && entry.thickness) {
      return length * entry.width * entry.thickness;
    }
    return null;
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

  const handleSave = () => {
    if (!header.date || !header.site || !header.engineer) {
      toast({
        title: "Missing Fields",
        description: "Please fill in date, site name, and engineer name.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      ...header,
      workType,
      structureItems: workType === "structure" ? structureItems.filter(s => s.itemOfWork) : [],
      progress: workType === "road" ? progress.filter(p => p.activity).map(p => {
        const effectiveLength = getEffectiveLength(p);
        return {
          ...p,
          length: effectiveLength,
          quantity: calculateQuantity(p) || p.quantity,
        };
      }) : [],
      equipment: equipment.filter(e => e.machine).map(eq => ({
        ...eq,
        totalKm: eq.entryType === "trip_based" && eq.numberOfTrips && eq.tripDistance
          ? Number(eq.numberOfTrips) * Number(eq.tripDistance) * 2 : eq.totalKm || null,
      })),
      labour: labour.filter(l => l.count > 0),
      materials: materials.filter(m => m.material).map(m => ({
        type: m.type,
        material: m.material,
        quantity: m.quantity,
        uom: m.uom,
        vehicleNumber: m.vehicleNumber || undefined,
        supplier: m.supplier || undefined,
        location: m.location || undefined,
        receiptNumber: m.receiptNumber || undefined,
      })),
      sitePurchases: sitePurchases.filter(sp => sp.itemDescription),
    };

    updateMutation.mutate(payload);
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

  if (!effectivePin) {
    return (
      <div className="p-20 text-center">
        <p className="text-muted-foreground mb-4">Authorization required to edit this report.</p>
        <Button onClick={() => setLocation(backToReport)} data-testid="button-back-to-report">
          Back to Report
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(backToReport)} data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">Edit Report</h1>
            <p className="text-muted-foreground text-sm">Modify and save your changes</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2" data-testid="button-save">
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
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
                            updated[idx].activity = boqItem ? boqItem.description.toUpperCase() : "";
                          }
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
                              {item.itemCode ? `${item.itemCode} · ` : ""}{item.description}
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
                            updated[idx].activity = boqItem ? boqItem.description.toUpperCase() : "";
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
                              {item.itemCode ? `${item.itemCode} · ` : ""}{item.description}
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
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-length-${idx}`}
                    />
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
                        updated[idx].quantity = calculateQuantity(updated[idx]);
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
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-thickness-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">UOM</Label>
                    <Select
                      value={entry.uom}
                      onValueChange={(val) => {
                        const updated = [...progress];
                        updated[idx].uom = val;
                        updated[idx].quantity = calculateQuantity(updated[idx]);
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
                        updated[idx].quantity = e.target.value ? parseFloat(e.target.value) : null;
                        setProgress(updated);
                      }}
                      data-testid={`input-qty-${idx}`}
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
          ))}
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
    </div>
  );
}
