/**
 * Task #1375 — Guided DPR (road progress pilot).
 *
 * A programme-driven fast path for filing the daily road DPR:
 *  - "Today's likely activities" checklist comes from the Work Programme bars
 *    active on the report date, minus anything already reported today.
 *  - Tapping an activity creates a prefilled entry (item / reach / side); the
 *    engineer types only chainage + quantity. Everything else sits behind one
 *    "Add details" expander.
 *  - "Same as yesterday" copies yesterday's report STRUCTURE only (work items,
 *    reach, side, equipment, labour, agency) and clears all measurements,
 *    photos, readings, remarks and submit status — always with a preview.
 *  - Saves through the exact same server path as the Detailed DPR
 *    (POST /api/dprs), so the records are indistinguishable downstream.
 *
 * This screen deliberately does NOT modify SiteEntry.tsx (Detailed DPR).
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Link } from "wouter";
import {
  ChevronDown, ChevronUp, Plus, Trash2, Loader2, Check, Camera, X,
  ChevronLeft, CalendarDays, History, LayoutList, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { format, subDays } from "date-fns";
import type { Site, Personnel, DprWithDetails } from "@shared/schema";
import { barSideLabel, parseChainageKm, QUANTITY_SOURCE_LABELS } from "@shared/barSide";
import { chainageOutsideBar } from "@shared/dprProgrammeLink";
import { geometryQtyForRow, resolveQuantitySource, checkQuantitySourceRow, MANUAL_QUANTITY_SOURCES } from "@shared/dprGeometry";
import { ProgrammeBarPicker, BarLinkFeedback, type PickerBar } from "@/components/ProgrammeBarPicker";
import { useAutosave } from "@/hooks/use-autosave";
import { DraftRestoreBanner } from "@/components/DraftRestoreBanner";
import { setDprEntryMode } from "@/lib/dprEntryMode";
import { extractYesterdayStructure } from "@/lib/sameAsYesterday";

// ── Local types (shapes mirror SiteEntry payload rows) ───────────────────────

type SiteBoqItem = {
  id: number; description: string; itemCode: string | null; itemName: string | null;
  unit: string; dprConversionFactor: number | null;
};

type ProgrammeBar = {
  id: number; boqItemId: number; reachLabel: string | null;
  chainageFrom: number | null; chainageTo: number | null;
  startDate: string | null; endDate: string | null;
  plannedQty: number; side: string | null; structureId: string | null;
};

interface GuidedEntry {
  activity: string;
  boqItemId: number | null;
  programmeBarId: number | null;
  side: string;
  chainageFrom: string;
  chainageTo: string;
  quantity: number | null;
  uom: string;
  expanded: boolean;        // "Add details" expander
  width: number | null;
  thickness: number | null;
  remark: string;           // per-entry note, folded into DPR remarks
  // Instruction 031
  quantitySource: string;          // Part E — how the quantity was determined
  quantitySourceNote: string;      // required when source = "other"
  chainageOverrideReason: string;  // Part F — out-of-range reason
  executedBy: string;              // Part H — "hlc" | "agency" when arrangement applies
}

interface SimpleEquipmentRow { machine: string; vehicleNo: string; operator: string; task: string; }
interface SimpleLabourRow { category: string; count: number | null; contractor: string; task: string; }

const SIDE_OPTIONS = ["LHS", "RHS", "Full Width"];
const LABOUR_CATEGORIES = ["Skilled", "Semi-Skilled", "Unskilled"];

// Same label shortener behaviour as the Detailed DPR (kept local so we don't
// export from SiteEntry and risk coupling).
function shortName(full?: string | null): string {
  if (!full) return "";
  let s = String(full).replace(/\s+/g, " ").trim();
  s = s.replace(/^(providing\s*(&|and)\s*(laying|fixing|casting)\s*(in\s*position\s*)?(of\s*)?|supplying\s*(&|and)\s*\w*\s*(of\s*)?|construction\s*of\s*|laying\s*(of\s*)?)/i, "").trim();
  s = s.split(/\b(complete as per|as per drawing|as per technical|including all lead|all complete|including cost of)/i)[0].trim();
  s = s.replace(/[,;:.\-\s]+$/, "").trim();
  if (s.length < 4) return String(full).trim().slice(0, 60);
  if (s.length > 70) s = s.slice(0, 70).replace(/\s+\S*$/, "") + "…";
  return s;
}

function fmtCh(km: number | null | undefined): string {
  if (km == null) return "?";
  const m = Math.round(km * 1000);
  return `${Math.floor(m / 1000)}+${String(m % 1000).padStart(3, "0")}`;
}

export default function GuidedDpr() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const { toast } = useToast();
  const { uploadFile } = useUpload();
  const returnTo = new URLSearchParams(searchStr).get("returnTo") ?? "/site";

  // Visiting this screen counts as choosing it — remembered per user/device so
  // every Road DPR entry point routes here next time.
  useEffect(() => { setDprEntryMode("guided"); }, []);

  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [siteName, setSiteName] = useState("");
  const [engineer, setEngineer] = useState("");
  const [entries, setEntries] = useState<GuidedEntry[]>([]);
  const [equipment, setEquipment] = useState<SimpleEquipmentRow[]>([]);
  const [labour, setLabour] = useState<SimpleLabourRow[]>([]);
  const [remarks, setRemarks] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showYesterdayPreview, setShowYesterdayPreview] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Instruction 031 Part A: once a draft is saved, later saves UPDATE the same
  // record (PATCH) and submit promotes it — never a duplicate row.
  const [draftId, setDraftId] = useState<number | null>(null);

  // Part A: local autosave so accidental navigation/refresh loses nothing
  // (same mechanism as the Detailed DPR, guided-specific key).
  type GuidedFormState = {
    date: string; siteName: string; engineer: string;
    entries: GuidedEntry[]; equipment: SimpleEquipmentRow[]; labour: SimpleLabourRow[];
    remarks: string; draftId: number | null;
  };
  const autosaveData: GuidedFormState = { date, siteName, engineer, entries, equipment, labour, remarks, draftId };
  const autosave = useAutosave<GuidedFormState>({
    formKey: "guided-dpr-new",
    data: autosaveData,
    onRestore: (d) => {
      setDate(d.date); setSiteName(d.siteName); setEngineer(d.engineer);
      setEntries(d.entries ?? []); setEquipment(d.equipment ?? []); setLabour(d.labour ?? []);
      setRemarks(d.remarks ?? ""); setDraftId(d.draftId ?? null);
    },
  });

  // ── Master data ────────────────────────────────────────────────────────────
  const { data: sitesList = [] } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const activeSites = sitesList.filter((s) => s.isActive);
  useEffect(() => {
    if (activeSites.length === 1 && !siteName) setSiteName(activeSites[0].name);
  }, [activeSites, siteName]);
  const selectedSiteId = useMemo(
    () => sitesList.find((s) => s.name === siteName)?.id ?? null,
    [siteName, sitesList],
  );

  const { data: personnelList = [] } = useQuery<Personnel[]>({ queryKey: ["/api/personnel"] });

  const { data: siteBoqProjects = [] } = useQuery<Array<{ id: number; name: string; status?: string; barCount?: number }>>({
    queryKey: ["/api/boq/projects", selectedSiteId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects?siteId=${selectedSiteId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!selectedSiteId,
  });
  // Same project-resolution priority as the Detailed DPR.
  const boqProjectId = useMemo(() => {
    if (siteBoqProjects.length === 0) return null;
    return (
      siteBoqProjects.find((p) => p.status === "active" && (p.barCount ?? 0) > 0)?.id ??
      siteBoqProjects.find((p) => p.status === "active")?.id ??
      siteBoqProjects[0].id
    );
  }, [siteBoqProjects]);

  const { data: boqItems = [] } = useQuery<SiteBoqItem[]>({
    queryKey: ["/api/boq/projects", boqProjectId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${boqProjectId}/items`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!boqProjectId,
  });
  const itemById = useMemo(() => {
    const m = new Map<number, SiteBoqItem>();
    boqItems.forEach((i) => m.set(i.id, i));
    return m;
  }, [boqItems]);

  // Part C (scoped balance): whole-BOQ-item totals — same endpoint the
  // Detailed DPR uses — shown smaller/separate from the bar's own figures.
  type PlanVsActualRow = { boqItemId: number; currentQty: number; totalActual: number; unit: string };
  const { data: planVsActualRows = [] } = useQuery<PlanVsActualRow[]>({
    queryKey: ["/api/boq/projects", boqProjectId, "plan-vs-actual", date],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${boqProjectId}/plan-vs-actual?asOf=${date}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!boqProjectId,
  });
  const itemTotals = (boqItemId: number | null): { currentQty: number; totalActual: number; balance: number; unit: string } | null => {
    if (boqItemId == null) return null;
    const row = planVsActualRows.find((r) => r.boqItemId === boqItemId);
    if (!row) return null;
    const balance = Math.round((row.currentQty - row.totalActual) * 1000) / 1000;
    return { currentQty: row.currentQty, totalActual: row.totalActual, balance, unit: row.unit };
  };

  const { data: programmeBars = [] } = useQuery<ProgrammeBar[]>({
    queryKey: ["/api/boq/projects", boqProjectId, "programme"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${boqProjectId}/programme`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!boqProjectId,
  });

  // DPRs already filed today + yesterday's report (for structure copy).
  const yesterday = useMemo(() => format(subDays(new Date(date + "T00:00:00"), 1), "yyyy-MM-dd"), [date]);
  const { data: recentDprs = [] } = useQuery<DprWithDetails[]>({
    queryKey: ["/api/dprs/with-details", yesterday, date],
    queryFn: async () => {
      const res = await fetch(`/api/dprs/with-details?dateFrom=${yesterday}&dateTo=${date}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!date,
  });
  // isSuperseded excludes old versions of edited DPRs so their bars aren't
  // double-counted as "already reported".
  const todayDprs = useMemo(
    () => recentDprs.filter((d) => d.date === date && d.site === siteName && !d.isSuperseded),
    [recentDprs, date, siteName],
  );
  const yesterdayDpr = useMemo(
    () => recentDprs.find((d) => d.date === yesterday && d.site === siteName && d.workType !== "structure" && !d.isSuperseded) ?? null,
    [recentDprs, yesterday, siteName],
  );

  // ── Today's likely activities ─────────────────────────────────────────────
  const reportedBarIds = useMemo(() => {
    const ids = new Set<number>();
    todayDprs.forEach((d) => (d.progress ?? []).forEach((p: any) => {
      if (p.programmeBarId != null) ids.add(p.programmeBarId);
    }));
    return ids;
  }, [todayDprs]);

  const suggestedBars = useMemo(() => {
    return programmeBars
      .filter((b) => !b.structureId) // road bars only on this screen
      .filter((b) => b.startDate && b.endDate && date >= b.startDate && date <= b.endDate)
      .filter((b) => !reportedBarIds.has(b.id))
      .filter((b) => !entries.some((e) => e.programmeBarId === b.id));
  }, [programmeBars, date, reportedBarIds, entries]);

  const addEntryFromBar = (bar: ProgrammeBar) => {
    const item = itemById.get(bar.boqItemId);
    setEntries((prev) => [...prev, {
      activity: shortName(item?.itemName || item?.description) || `BOQ item ${bar.boqItemId}`,
      boqItemId: bar.boqItemId,
      programmeBarId: bar.id,
      side: bar.side ? barSideLabel(bar.side as any) : "",
      chainageFrom: bar.chainageFrom != null ? fmtCh(bar.chainageFrom) : "",
      chainageTo: "",
      quantity: null,
      uom: item?.unit ?? "",
      expanded: false,
      width: null,
      thickness: null,
      remark: "",
      quantitySource: "",
      quantitySourceNote: "",
      chainageOverrideReason: "",
      executedBy: "",
    }]);
  };

  const addEntryFromItem = (item: SiteBoqItem) => {
    setEntries((prev) => [...prev, {
      activity: shortName(item.itemName || item.description),
      boqItemId: item.id,
      programmeBarId: null,
      side: "",
      chainageFrom: "",
      chainageTo: "",
      quantity: null,
      uom: item.unit ?? "",
      expanded: false,
      width: null,
      thickness: null,
      remark: "",
      quantitySource: "",
      quantitySourceNote: "",
      chainageOverrideReason: "",
      executedBy: "",
    }]);
    setAddItemOpen(false);
  };

  const updateEntry = (idx: number, patch: Partial<GuidedEntry>) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  const removeEntry = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));

  // ── Same as yesterday (structure-only copy, always previewed) ─────────────
  const applyYesterdayStructure = () => {
    if (!yesterdayDpr) return;
    // 031 Part I: shared structure-only extraction (same module as SiteEntry).
    const st = extractYesterdayStructure(yesterdayDpr as any);
    setEntries(st.progress.map((p) => ({
      activity: p.activity,
      boqItemId: p.boqItemId,
      programmeBarId: p.programmeBarId,
      side: p.side,
      chainageFrom: "",           // measurements deliberately cleared
      chainageTo: "",
      quantity: null,
      uom: p.uom,
      expanded: false,
      width: null,
      thickness: null,
      remark: "",
      quantitySource: "",
      quantitySourceNote: "",
      chainageOverrideReason: "",
      executedBy: "",
    })));
    setEquipment(st.equipment);
    setLabour(st.labour);
    // photos / readings / remarks / submit status intentionally NOT copied
    setRemarks("");
    setStagedPhotos([]);
    setShowYesterdayPreview(false);
    toast({ title: "Structure copied", description: "Yesterday's work items and crew copied. Enter today's chainage and quantities." });
  };

  // ── Photos ────────────────────────────────────────────────────────────────
  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter((f) => {
      if (f.size > 15 * 1024 * 1024) { toast({ title: "File too large", description: `${f.name} exceeds 15MB.`, variant: "destructive" }); return false; }
      if (!f.type.startsWith("image/")) { toast({ title: "Unsupported file", description: `${f.name} must be an image.`, variant: "destructive" }); return false; }
      return true;
    });
    setStagedPhotos((prev) => [...prev, ...valid]);
  };
  /**
   * Uploads staged photos and returns the files that FAILED, so the caller can
   * keep only those staged for retry — successfully attached photos leave the
   * staged list (otherwise the next draft save re-uploads them as duplicates).
   */
  const uploadStagedPhotos = async (dprId: number): Promise<File[]> => {
    const failed: File[] = [];
    for (const file of stagedPhotos) {
      const up = await uploadFile(file);
      if (!up) { failed.push(file); continue; }
      try {
        await apiRequest("POST", "/api/attachments", {
          moduleType: "dpr_progress", linkedRecordId: dprId,
          siteId: selectedSiteId ?? null, boqProjectId: boqProjectId ?? null,
          fileName: file.name, objectPath: up.objectPath,
          mimeType: file.type || "application/octet-stream", fileSize: file.size,
        });
      } catch {
        failed.push(file);
        toast({ title: "Photo failed to attach — kept for retry", description: file.name, variant: "destructive" });
      }
    }
    return failed;
  };

  // ── Save / submit ─────────────────────────────────────────────────────────
  const entriesComplete = entries.length > 0 && entries.every(
    (e) => e.chainageFrom && e.chainageTo && e.quantity != null && e.quantity > 0,
  );

  /**
   * Quantity-source state for a guided entry, recomputed from geometry —
   * NEVER guessed from the UOM (the old fallback silently recorded "measured"/
   * "weighment" for quantities that were actually calculated).
   * Returns "calculated" when the entered quantity matches chainage-span ×
   * width × thickness under the BOQ item's measurement profile.
   */
  const entrySourceState = (e: GuidedEntry): "calculated" | null => {
    const boqItem = e.boqItemId != null ? itemById.get(e.boqItemId) : null;
    return resolveQuantitySource(
      { length: null, chainageFrom: e.chainageFrom, chainageTo: e.chainageTo, width: e.width, thickness: e.thickness, quantity: e.quantity },
      boqItem as any,
    );
  };

  const buildPayload = (asDraft: boolean) => {
    const progress = entries.map((e) => {
      const fromKm = parseChainageKm(e.chainageFrom);
      const toKm = parseChainageKm(e.chainageTo);
      // Instruction 031 Part B: the server is now draft-lenient — a draft row
      // with incomplete chainage KEEPS its programmeBarId (no more dropping
      // the link to survive validation).
      return {
        activity: e.activity,
        side: e.side,
        chainageFrom: e.chainageFrom,
        chainageTo: e.chainageTo,
        length: null,
        width: e.width,
        thickness: e.thickness,
        quantity: e.quantity,
        uom: e.uom,
        noSiteWork: false,
        noSiteWorkDescription: "",
        personnelIds: [] as number[],
        boqItemId: e.boqItemId,
        programmeBarId: e.programmeBarId,
        chainageFromKm: fromKm,
        chainageToKm: toKm,
        // Source is real state: "calculated" only when geometry recomputation
        // matches; otherwise the engineer's explicit pick (or null on drafts).
        quantitySource: entrySourceState(e) ?? (e.quantitySource || null),
        quantitySourceNote: e.quantitySourceNote.trim() || null,
        chainageOverrideReason: e.chainageOverrideReason.trim() || null,
        executedBy: e.executedBy || null,
      };
    });
    const entryRemarks = entries.filter((e) => e.remark.trim()).map((e) => `${e.activity}: ${e.remark.trim()}`);
    const allRemarks = [...entryRemarks, remarks.trim()].filter(Boolean).join("\n");
    return {
      date, site: siteName, engineer, role: "engineer", workType: "road",
      boqProjectId: boqProjectId ?? undefined,
      ...(asDraft ? { dprStatus: "draft" } : {}),
      progress,
      structureItems: [],
      equipment: equipment.filter((e) => e.machine).map((e) => ({
        machine: e.machine, vehicleNo: e.vehicleNo, operator: e.operator, task: e.task,
        entryType: "", startTime: "", endTime: "",
        openingReading: null, closingReading: null, diesel: null, equipmentId: null,
        dieselSource: "", fuelStation: "", billNumber: "", amountPaid: null,
        numberOfTrips: null, tripDistance: null, totalKm: null, waterQuantity: null,
        boqItemId: null, structureId: null, plantUsageId: null,
      })),
      labour: labour.filter((l) => l.category).map((l) => ({
        category: l.category, gender: "", count: l.count ?? 0, task: l.task,
        contractor: l.contractor, boqItemId: null, structureId: null,
      })),
      materials: [],
      sitePurchases: [],
      remarks: allRemarks || undefined,
      clientTimestamp: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
    };
  };

  const saveMutation = useMutation({
    mutationFn: async (asDraft: boolean) => {
      // Part A: reuse the saved draft record instead of creating duplicates.
      let res;
      if (draftId != null && asDraft) {
        res = await apiRequest("PATCH", `/api/dprs/${draftId}/draft`, buildPayload(true));
      } else if (draftId != null && !asDraft) {
        res = await apiRequest("POST", `/api/dprs/${draftId}/submit`, buildPayload(false));
      } else {
        res = await apiRequest("POST", "/api/dprs", buildPayload(asDraft));
      }
      return { data: await res.json(), asDraft };
    },
    onSuccess: async ({ data, asDraft }) => {
      if (stagedPhotos.length > 0) {
        // Attached photos leave the staged list (no duplicate re-upload on the
        // next save); failed ones stay staged so the user can retry.
        const failed = await uploadStagedPhotos(data.id);
        setStagedPhotos(failed);
        queryClient.invalidateQueries({ queryKey: ["/api/attachments", "dpr_progress", data.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      if (asDraft) {
        setDraftId(data.id ?? draftId);
        toast({ title: "Draft Saved", description: "Keep working here — saving again updates this same draft. Submit promotes it." });
      } else {
        await autosave.clearDraft();
        toast({ title: "Report Saved Successfully", description: "Your site report has been submitted." });
        setLocation(`/site/success/${data.id ?? draftId}?type=road&returnTo=${encodeURIComponent(returnTo)}`);
      }
    },
    onError: () => toast({ title: "Error", description: "Failed to save report. Please try again.", variant: "destructive" }),
  });

  const validateHeader = (): boolean => {
    if (!siteName || !engineer) {
      toast({ title: "Missing Information", description: "Please select the site and engineer first.", variant: "destructive" });
      return false;
    }
    if (entries.length === 0) {
      toast({ title: "Nothing to report", description: "Add at least one activity.", variant: "destructive" });
      return false;
    }
    return true;
  };

  // Friendly pre-check before submit so programme-linked rows don't bounce off
  // the server's chainage validation with a raw error.
  const validateForSubmit = (): boolean => {
    for (const e of entries) {
      const fromKm = parseChainageKm(e.chainageFrom);
      const toKm = parseChainageKm(e.chainageTo);
      if (fromKm == null || toKm == null) {
        toast({ title: "Chainage needed", description: `"${e.activity}": enter chainage From and To (e.g. 1+200).`, variant: "destructive" });
        return false;
      }
      if (toKm <= fromKm) {
        toast({ title: "Check chainage", description: `"${e.activity}": chainage To must be greater than From.`, variant: "destructive" });
        return false;
      }
      if (e.programmeBarId != null && !e.side) {
        toast({ title: "Side needed", description: `"${e.activity}": select the executed side.`, variant: "destructive" });
        return false;
      }
      {
        const boqItem = e.boqItemId != null ? itemById.get(e.boqItemId) : null;
        const qtyErr = checkQuantitySourceRow(
          { length: null, chainageFrom: e.chainageFrom, chainageTo: e.chainageTo, width: e.width, thickness: e.thickness,
            quantity: e.quantity, quantitySource: entrySourceState(e) ?? (e.quantitySource || null), quantitySourceNote: e.quantitySourceNote },
          boqItem as any,
        );
        if (qtyErr) {
          toast({ title: `"${e.activity}": quantity source`, description: qtyErr, variant: "destructive" });
          return false;
        }
      }
      // Instruction 031 Parts F/H — same rules as the Detailed DPR.
      if (e.programmeBarId != null && e.boqItemId != null) {
        const bars = queryClient.getQueryData<PickerBar[]>(["/api/dpr/programme-bars", boqProjectId, e.boqItemId]) ?? [];
        const bar = bars.find((b) => b.id === e.programmeBarId);
        if (bar) {
          if (chainageOutsideBar(fromKm, toKm, bar) && !e.chainageOverrideReason.trim()) {
            toast({ title: "Reason required", description: `"${e.activity}": the chainage is outside the planned reach — tap “Give reason” or correct the chainage.`, variant: "destructive" });
            return false;
          }
          if (bar.arrangement && /part/i.test(bar.arrangement.mode ?? "") && !e.executedBy) {
            toast({ title: "Executed by required", description: `"${e.activity}": this reach is partly outsourced — select HLC or agency (separate rows per executor).`, variant: "destructive" });
            return false;
          }
        }
      }
    }
    return true;
  };

  // Part J: switching views mid-entry never loses data. If a server draft
  // exists, continue it in the Detailed editor; otherwise the local autosave
  // (plus a confirm) protects unsaved entries.
  const switchToDetailed = () => {
    setDprEntryMode("detailed");
    if (draftId != null) {
      setLocation(`/site/edit/${draftId}?draft&returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (entries.length > 0 && !window.confirm("You have unsaved activities. They stay locally autosaved on this screen, but the Detailed DPR starts fresh — save a draft first to continue it there. Switch anyway?")) {
      setDprEntryMode("guided");
      return;
    }
    setLocation(`/site/new?type=road&returnTo=${encodeURIComponent(returnTo)}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <Link href={returnTo}>
          <Button variant="ghost" size="sm" data-testid="button-back"><ChevronLeft className="w-4 h-4 mr-1" />Back</Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={switchToDetailed} data-testid="button-switch-detailed">
          <LayoutList className="w-4 h-4 mr-1" />Detailed DPR
        </Button>
      </div>
      <h1 className="text-xl font-bold" data-testid="text-guided-title">Guided DPR{draftId != null ? <Badge variant="outline" className="ml-2 align-middle" data-testid="badge-editing-draft">Draft #{draftId}</Badge> : null}</h1>
      {autosave.hasDraft && (
        <DraftRestoreBanner
          draftAge={autosave.draftAge}
          onRestore={autosave.restoreDraft}
          onDiscard={autosave.discardDraft}
        />
      )}
      <p className="text-sm text-muted-foreground mb-4 flex items-start gap-1.5" data-testid="text-responsibility">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        Records today's road progress against the work programme — same official record as the Detailed DPR, faster entry.
      </p>

      {/* Report header */}
      <Card className="mb-4">
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-date" />
          </div>
          <div>
            <Label>Site</Label>
            <Select value={siteName} onValueChange={setSiteName}>
              <SelectTrigger data-testid="select-site"><SelectValue placeholder="Select site" /></SelectTrigger>
              <SelectContent>
                {activeSites.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Engineer</Label>
            <Select value={engineer} onValueChange={setEngineer}>
              <SelectTrigger data-testid="select-engineer"><SelectValue placeholder="Select engineer" /></SelectTrigger>
              <SelectContent>
                {personnelList.map((p) => (
                  <SelectItem key={p.id} value={`${p.name.toUpperCase()} - ${p.role.toUpperCase()}`}>
                    {p.name} ({p.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Same as yesterday */}
      {yesterdayDpr && entries.length === 0 && (
        <Button variant="outline" className="w-full mb-4" onClick={() => setShowYesterdayPreview(true)} data-testid="button-same-as-yesterday">
          <History className="w-4 h-4 mr-2" />Same as yesterday — copy work items &amp; crew
        </Button>
      )}

      {/* Today's likely activities */}
      {siteName && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" />Today's likely activities
          </h2>
          {suggestedBars.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-suggestions">
              {programmeBars.length === 0
                ? "No work programme found for this site — add activities manually below."
                : "Nothing pending from the programme for this date — everything planned is already reported, or use “+ Record another activity”."}
            </p>
          ) : (
            <div className="space-y-2">
              {suggestedBars.map((bar) => {
                const item = itemById.get(bar.boqItemId);
                return (
                  <button
                    key={bar.id}
                    className="w-full text-left border rounded-lg p-3 bg-white dark:bg-slate-900 hover:border-primary transition-colors flex items-center justify-between gap-2"
                    onClick={() => addEntryFromBar(bar)}
                    data-testid={`button-suggested-bar-${bar.id}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{shortName(item?.itemName || item?.description) || `BOQ item ${bar.boqItemId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {bar.reachLabel || `Ch ${fmtCh(bar.chainageFrom)}–${fmtCh(bar.chainageTo)}`}
                        {bar.side ? ` · ${barSideLabel(bar.side as any)}` : ""}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 shrink-0 text-primary" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Entry cards */}
      {entries.map((e, idx) => (
        <Card key={idx} className="mb-3" data-testid={`card-entry-${idx}`}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm">{e.activity}</p>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {e.side && <Badge variant="secondary">{e.side}</Badge>}
                  {e.programmeBarId != null && <Badge variant="outline">Programme-linked</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeEntry(idx)} data-testid={`button-remove-entry-${idx}`}>
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
            {/* 031 Part C: manually-added items get the shared bar picker with
                auto-matching (1 candidate → auto-link, several → pick,
                incompatible bars stay behind "Other bars"). */}
            {e.boqItemId != null && boqProjectId != null && (
              <ProgrammeBarPicker
                projectId={boqProjectId}
                boqItemId={e.boqItemId}
                dprDate={date}
                value={e.programmeBarId}
                autoSelect={e.programmeBarId == null}
                testidPrefix={`guided-${idx}`}
                onSelect={(bar) => {
                  if (!bar) { updateEntry(idx, { programmeBarId: null }); return; }
                  updateEntry(idx, {
                    programmeBarId: bar.id,
                    ...(bar.chainageFrom != null && !e.chainageFrom ? { chainageFrom: fmtCh(bar.chainageFrom) } : {}),
                    ...(bar.side && !e.side ? { side: barSideLabel(bar.side as any) } : {}),
                  });
                }}
              />
            )}
            {/* 031 Parts D/F/G/H: same shared feedback component as the Detailed DPR */}
            {e.programmeBarId != null && (
              <BarLinkFeedback
                projectId={boqProjectId}
                boqItemId={e.boqItemId}
                programmeBarId={e.programmeBarId}
                sideKey={e.side === "LHS" ? "lhs" : e.side === "RHS" ? "rhs" : e.side === "Full Width" ? "full_width" : null}
                sideLabel={e.side}
                fromKm={parseChainageKm(e.chainageFrom)}
                toKm={parseChainageKm(e.chainageTo)}
                overrideReason={e.chainageOverrideReason}
                onOverrideReason={(v) => updateEntry(idx, { chainageOverrideReason: v })}
                qty={e.quantity}
                itemTotals={itemTotals(e.boqItemId)}
                executedBy={e.executedBy || null}
                onExecutedBy={(v) => updateEntry(idx, { executedBy: v })}
                testidPrefix={`guided-${idx}`}
              />
            )}
            {!e.side && (
              <div>
                <Label>Side</Label>
                <Select value={e.side} onValueChange={(v) => updateEntry(idx, { side: v })}>
                  <SelectTrigger data-testid={`select-side-${idx}`}><SelectValue placeholder="Select side" /></SelectTrigger>
                  <SelectContent>{SIDE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Ch. From</Label>
                <Input value={e.chainageFrom} placeholder="0+000" onChange={(ev) => updateEntry(idx, { chainageFrom: ev.target.value })} data-testid={`input-ch-from-${idx}`} />
              </div>
              <div>
                <Label>Ch. To</Label>
                <Input value={e.chainageTo} placeholder="0+000" onChange={(ev) => updateEntry(idx, { chainageTo: ev.target.value })} data-testid={`input-ch-to-${idx}`} />
              </div>
              <div>
                <Label>Qty {e.uom ? `(${e.uom})` : ""}</Label>
                <Input type="number" inputMode="decimal" value={e.quantity ?? ""} onChange={(ev) => updateEntry(idx, { quantity: ev.target.value === "" ? null : Number(ev.target.value) })} data-testid={`input-qty-${idx}`} />
              </div>
            </div>
            <button className="text-xs text-primary flex items-center gap-1" onClick={() => updateEntry(idx, { expanded: !e.expanded })} data-testid={`button-details-${idx}`}>
              {e.expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Add details
            </button>
            {e.expanded && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <Label>Width (m)</Label>
                  <Input type="number" inputMode="decimal" value={e.width ?? ""} onChange={(ev) => updateEntry(idx, { width: ev.target.value === "" ? null : Number(ev.target.value) })} data-testid={`input-width-${idx}`} />
                </div>
                <div>
                  <Label>Thickness (m)</Label>
                  <Input type="number" inputMode="decimal" value={e.thickness ?? ""} onChange={(ev) => updateEntry(idx, { thickness: ev.target.value === "" ? null : Number(ev.target.value) })} data-testid={`input-thickness-${idx}`} />
                </div>
                <div className="col-span-2">
                  <Label>Quantity source</Label>
                  {entrySourceState(e) === "calculated" ? (
                    <p className="text-xs text-muted-foreground mt-1" data-testid={`text-qty-source-auto-${idx}`}>
                      Calculated from geometry (automatic)
                    </p>
                  ) : (
                    <>
                      <Select
                        value={e.quantitySource || undefined}
                        onValueChange={(v) => updateEntry(idx, { quantitySource: v, ...(v !== "other" ? { quantitySourceNote: "" } : {}) })}
                      >
                        <SelectTrigger data-testid={`select-qty-source-${idx}`}><SelectValue placeholder="How was the quantity determined?" /></SelectTrigger>
                        <SelectContent>
                          {MANUAL_QUANTITY_SOURCES.map((qs) => <SelectItem key={qs} value={qs}>{QUANTITY_SOURCE_LABELS[qs]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {e.quantitySource === "other" && (
                        <Input className="mt-1" placeholder="How was this quantity determined? (required)"
                          value={e.quantitySourceNote}
                          onChange={(ev) => updateEntry(idx, { quantitySourceNote: ev.target.value })}
                          data-testid={`input-qty-source-note-${idx}`} />
                      )}
                    </>
                  )}
                </div>
                <div className="col-span-2">
                  <Label>Note</Label>
                  <Input value={e.remark} onChange={(ev) => updateEntry(idx, { remark: ev.target.value })} data-testid={`input-note-${idx}`} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* + Record another activity */}
      {siteName && (
        <Button variant="outline" className="w-full mb-4" onClick={() => setAddItemOpen(true)} data-testid="button-add-activity">
          <Plus className="w-4 h-4 mr-2" />Record another activity
        </Button>
      )}

      {/* Photos */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5"><Camera className="w-4 h-4" />Site photos</Label>
            <Button variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} data-testid="button-add-photos">Add photos</Button>
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          </div>
          {stagedPhotos.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {stagedPhotos.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} alt={f.name} className="w-16 h-16 object-cover rounded-md border" />
                  <button className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full p-0.5" onClick={() => setStagedPhotos((prev) => prev.filter((_, j) => j !== i))} data-testid={`button-remove-photo-${i}`}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DPR-level Add details: equipment / labour / remarks */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <button className="w-full flex items-center justify-between text-sm font-medium" onClick={() => setDetailsOpen((v) => !v)} data-testid="button-dpr-details">
            <span>Equipment, labour &amp; remarks {equipment.length + labour.length > 0 ? `(${equipment.length + labour.length})` : ""}</span>
            {detailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {detailsOpen && (
            <div className="space-y-4 mt-3">
              <div>
                <Label className="mb-1 block">Equipment</Label>
                {equipment.map((eq, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2">
                    <Input placeholder="Machine" value={eq.machine} onChange={(ev) => setEquipment((p) => p.map((r, j) => j === i ? { ...r, machine: ev.target.value } : r))} data-testid={`input-eq-machine-${i}`} />
                    <Input placeholder="Task" value={eq.task} onChange={(ev) => setEquipment((p) => p.map((r, j) => j === i ? { ...r, task: ev.target.value } : r))} data-testid={`input-eq-task-${i}`} />
                    <Button variant="ghost" size="icon" onClick={() => setEquipment((p) => p.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEquipment((p) => [...p, { machine: "", vehicleNo: "", operator: "", task: "" }])} data-testid="button-add-equipment">
                  <Plus className="w-3.5 h-3.5 mr-1" />Equipment
                </Button>
              </div>
              <div>
                <Label className="mb-1 block">Labour</Label>
                {labour.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_1fr_auto] gap-2 mb-2">
                    <Select value={l.category} onValueChange={(v) => setLabour((p) => p.map((r, j) => j === i ? { ...r, category: v } : r))}>
                      <SelectTrigger data-testid={`select-labour-cat-${i}`}><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>{LABOUR_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" placeholder="Nos" value={l.count ?? ""} onChange={(ev) => setLabour((p) => p.map((r, j) => j === i ? { ...r, count: ev.target.value === "" ? null : Number(ev.target.value) } : r))} data-testid={`input-labour-count-${i}`} />
                    <Input placeholder="Agency / contractor" value={l.contractor} onChange={(ev) => setLabour((p) => p.map((r, j) => j === i ? { ...r, contractor: ev.target.value } : r))} data-testid={`input-labour-contractor-${i}`} />
                    <Button variant="ghost" size="icon" onClick={() => setLabour((p) => p.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setLabour((p) => [...p, { category: "", count: null, contractor: "", task: "" }])} data-testid="button-add-labour">
                  <Plus className="w-3.5 h-3.5 mr-1" />Labour
                </Button>
              </div>
              <div>
                <Label>Remarks</Label>
                <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} data-testid="input-remarks" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-950 border-t p-3 z-20">
        <div className="max-w-2xl mx-auto flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={saveMutation.isPending}
            onClick={() => { if (validateHeader()) saveMutation.mutate(true); }}
            data-testid="button-save-draft"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Draft"}
          </Button>
          <Button
            className="flex-1"
            disabled={saveMutation.isPending || !entriesComplete}
            onClick={() => { if (validateHeader() && validateForSubmit()) saveMutation.mutate(false); }}
            data-testid="button-submit"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Submit DPR</>}
          </Button>
        </div>
        {!entriesComplete && entries.length > 0 && (
          <p className="max-w-2xl mx-auto text-xs text-muted-foreground mt-1.5" data-testid="text-submit-hint">
            Enter chainage from/to and quantity for every activity to submit — or save a draft and finish later.
          </p>
        )}
      </div>

      {/* Yesterday preview dialog */}
      <Dialog open={showYesterdayPreview} onOpenChange={setShowYesterdayPreview}>
        <DialogContent data-testid="dialog-yesterday-preview">
          <DialogHeader>
            <DialogTitle>Copy yesterday's structure?</DialogTitle>
            <DialogDescription>
              Copies work items, reach, side, equipment, labour and agency from {yesterday}. Chainage, quantities, photos, readings, remarks and submit status are NOT copied — you enter today's actuals fresh.
            </DialogDescription>
          </DialogHeader>
          {yesterdayDpr && (
            <div className="text-sm space-y-2 max-h-64 overflow-y-auto">
              <div>
                <p className="font-medium mb-1">Work items</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  {(yesterdayDpr.progress ?? []).filter((p: any) => !p.noSiteWork && p.activity).map((p: any, i: number) => (
                    <li key={i}>{p.activity}{p.side ? ` · ${p.side}` : ""}</li>
                  ))}
                </ul>
              </div>
              {(yesterdayDpr.equipment ?? []).filter((e: any) => e.machine).length > 0 && (
                <div>
                  <p className="font-medium mb-1">Equipment</p>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {(yesterdayDpr.equipment ?? []).filter((e: any) => e.machine).map((e: any, i: number) => <li key={i}>{e.machine}</li>)}
                  </ul>
                </div>
              )}
              {(yesterdayDpr.labour ?? []).filter((l: any) => l.category).length > 0 && (
                <div>
                  <p className="font-medium mb-1">Labour</p>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {(yesterdayDpr.labour ?? []).filter((l: any) => l.category).map((l: any, i: number) => (
                      <li key={i}>{l.category} × {l.count}{l.contractor ? ` (${l.contractor})` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowYesterdayPreview(false)} data-testid="button-cancel-yesterday">Cancel</Button>
            <Button onClick={applyYesterdayStructure} data-testid="button-confirm-yesterday">Copy structure</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add-another-activity dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent data-testid="dialog-add-activity">
          <DialogHeader>
            <DialogTitle>Record another activity</DialogTitle>
            <DialogDescription>Pick the BOQ item you worked on today.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {boqItems.length === 0 && <p className="text-sm text-muted-foreground">No BOQ items found for this site's project.</p>}
            {boqItems.map((item) => (
              <button
                key={item.id}
                className="w-full text-left border rounded-md p-2.5 hover:border-primary transition-colors"
                onClick={() => addEntryFromItem(item)}
                data-testid={`button-boq-item-${item.id}`}
              >
                <p className="text-sm font-medium">{shortName(item.itemName || item.description)}</p>
                <p className="text-xs text-muted-foreground">{item.itemCode ? `${item.itemCode} · ` : ""}{item.unit}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
