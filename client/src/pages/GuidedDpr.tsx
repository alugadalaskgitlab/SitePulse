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
  ChevronLeft, CalendarDays, History, LayoutList, Info, AlertTriangle,
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
import { layerDisplayName } from "@shared/layerDisplay";
import { parseDprError } from "@/lib/dprErrors";
import { InsufficientDieselDialog, parseInsufficientPlantStock, type InsufficientPlantStockPayload } from "@/components/InsufficientDieselDialog";
import { useUpload } from "@/hooks/use-upload";
import { format, subDays } from "date-fns";
import type { Site, Personnel, DprWithDetails } from "@shared/schema";
import { barSideLabel, parseChainageKm, QUANTITY_SOURCE_LABELS, allowedDprSides, dprSideOptionsForBar, isDprSideCompatible, isBarSide } from "@shared/barSide";
import { chainageOutsideBar, suggestGuidedBars, emptySuggestionsReason, normalizeDprSideKey } from "@shared/dprProgrammeLink";
import { resolveQuantitySource, checkQuantitySourceRow, MANUAL_QUANTITY_SOURCES, calculateLengthFromChainage, resolveBoqUomProfile, boqProgressQty, dprMeasurementSummary } from "@shared/dprGeometry";
import { requiredDims, applyGeometryChange, applyQuantityEdit, overrideMismatch, deriveOverridden, computedQty } from "@/lib/guidedEntryGeometry";
import { ProgrammeBarPicker, BarLinkFeedback, type PickerBar } from "@/components/ProgrammeBarPicker";
import { useAutosave } from "@/hooks/use-autosave";
import { DraftRestoreBanner } from "@/components/DraftRestoreBanner";
import { reconcileNewDprAutosaves } from "@/lib/dprAutosaveReconcile";
import { unlinkedOpenUsages, usageToGuidedRow, duplicateUsageAdvisory, openUsageHandoffContext, type OpenUsageLike } from "@shared/dprPlantLink";
import { extractYesterdayStructure } from "@/lib/sameAsYesterday";
import { applyGuidedEquipmentMasterSelection, splitGuidedEquipmentRow, buildGuidedEquipmentPayload, newGuidedEquipmentRow, computeTotalDiesel, computeTripTotalKm, isWaterTankerName, OTHER_EQUIPMENT_VALUE, type GuidedEquipmentRow } from "@shared/guidedEquipment";
import { evaluateDprSubmitReadiness, type DprReadinessIssue, type DprReadinessResult } from "@shared/dprSubmitReadiness";
import { ActivityReceiptStrip } from "@/components/ActivityReceiptStrip";
import { DprReadinessDialog } from "@/components/DprReadinessDialog";
import { useChainageOverlapContext, useChainageOverlapHits, ChainageOverlapWarning } from "@/components/ChainageOverlapGuard";
import { type CandidateChainageRow } from "@shared/chainageOverlap";
import { GUIDED_STEPS, READINESS_SECTION_TO_GUIDED_STEP, clampGuidedStep, guidedStepBlocker, guidedEntryComplete, firstIncompleteGuidedStep, type GuidedStepId } from "@/lib/guidedWizard";
import { fetchLatestPriorClosing } from "@/lib/equipmentContinuity";
import { MAX_ACTIVITY_PHOTOS, activityPhotoCapacity, countEntryAttachments } from "@shared/dprPhotos";
import { Checkbox } from "@/components/ui/checkbox";
import { extractNotReadyRowTarget, scrollAndHighlightRow, dprRowKey } from "@/lib/dprNotReadyHighlight";
import { CutFillOutcomeControls } from "@/components/CutFillOutcomeControls";
import { BillItemPicker } from "@/components/BillItemPicker";
import { useDprBoqItems } from "@/hooks/use-dpr-boq-items";
import { dprBoqItemDisplayName } from "@shared/dprBoqSelection";
import { BreakdownStoppageEditor, type StagedBreakdown } from "@/components/BreakdownStoppageEditor";
import { classifyWorkType } from "@shared/workTypeRecipes";
import { flattenCutFillConsumptions, hydrateCutFillConsumptions, validateCutFillForm } from "@/lib/cutFillLedger";
import { blocksExternalReceiptsForBoqItem } from "@shared/materialReceiptSummary";
import { DprEquipmentCompact } from "@/components/DprEquipmentCompact";
import { computeEquipmentUsage } from "@/lib/equipmentUsage";

// ── Local types (shapes mirror SiteEntry payload rows) ───────────────────────

type SiteBoqItem = {
  id: number; description: string; itemCode: string | null; itemName: string | null;
  displayName?: string | null;
  unit: string; dprConversionFactor: number | null; dprMeasurementMethod?: string | null;
};

type ProgrammeBar = {
  id: number; boqItemId: number; reachLabel: string | null;
  chainageFrom: number | null; chainageTo: number | null;
  startDate: string | null; endDate: string | null;
  plannedQty: number; side: string | null; structureId: string | null;
};

interface GuidedEntry {
  // Task #1409: stable client-generated key — survives the wholesale
  // progress-row replacement on draft PATCH; per-activity photos link to it.
  entryKey: string;
  // Task #1409: per-activity "No Site Work" (rain / suspension / non-billable
  // rework like re-clearing vegetation). Mirrors the Detailed DPR semantics:
  // clears geometry/quantity, excluded from BOQ progress and overlap checks.
  noSiteWork: boolean;
  noSiteWorkDescription: string;
  activity: string;
  boqItemId: number | null;
  programmeBarId: number | null;
  // 06T �3: resolved execution arrangement persisted as a historical fact
  earthworkArrangementId: number | null;
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
  // Guided correction item 6: the engineer deliberately replaced the
  // geometry-calculated quantity — geometry edits must not silently undo it.
  qtyOverridden: boolean;
  // 06P: optional physical layer/lift number (1, 2, 3…). null = not a
  // multi-layer entry — behaves exactly as pre-06P everywhere.
  layerNo: number | null;
  // Batch 06V: Incidental / Non-BOQ work
  isIncidental: boolean;
  incidentalDescription: string;
  materialOutcome?: string | null;
  reusableQty?: number | null;
  allocations?: Array<{ sourceEntryKey?: string | null; openingBalanceId?: number | null; quantity: number }>;
}

// Batch 04 save fidelity: Guided edits 4 fields but must round-trip every
// other equipment field untouched (shared/guidedEquipment.ts).
type SimpleEquipmentRow = GuidedEquipmentRow;
// Batch 06C §12–13: Guided labour carries the SAME fields as Detailed —
// gender, task and the optional Work Item linkage are preserved, never
// hard-coded away on save.
interface SimpleLabourRow {
  category: string; gender: string; count: number | null; contractor: string; task: string;
  boqItemId: number | null; structureId: string | null;
}
const newLabourRow = (): SimpleLabourRow =>
  ({ category: "", gender: "", count: null, contractor: "", task: "", boqItemId: null, structureId: null });
const GENDER_OPTIONS = ["Male", "Female"];

// Batch 1: actual-execution-side choices come from the shared matrix — the
// four roadway values by default, narrowed to the matching corridor when the
// linked bar is corridor-planned (median / shoulder / service road).
const sideOptionsFor = (plannedSide: string | null | undefined): string[] =>
  dprSideOptionsForBar(plannedSide).map((k) => barSideLabel(k));
// Batch 1 Part H: prefill the actual side ONLY when the planned side allows
// exactly one value (LHS / RHS / corridor bars). Both-Sides / Full-Width bars
// must prompt the engineer to confirm — never preset.
const prefillSideFor = (plannedSide: string | null | undefined): string => {
  const allowed = allowedDprSides(plannedSide);
  return allowed && allowed.length === 1 ? barSideLabel(allowed[0]) : "";
};
const sideKeyOf = (label: string | null | undefined): string | null => {
  const k = normalizeDprSideKey(label);
  return k && isBarSide(k) ? k : null;
};
const LABOUR_CATEGORIES = ["Skilled", "Semi-Skilled", "Unskilled"];

// BOQ item labels use the shared display-name helper (shared/boqItemName.ts)
// so operational naming can't drift between Guided DPR, Detailed DPR and pickers.
import { boqItemDisplayName } from "@shared/boqItemName";
import { layerFieldLabel, showLayerField } from "@shared/layerDisplay";

const newEntryKey = (): string =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `ek-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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
  const prepareBreakdownAttachments = async (rows: SimpleEquipmentRow[]) => Promise.all(rows.map(async (row) => {
    const breakdowns = (row.passthrough?.breakdowns ?? []) as StagedBreakdown[];
    return {
      ...row,
      passthrough: {
        ...row.passthrough,
        breakdowns: await Promise.all(breakdowns.map(async (breakdown) => {
          if (!breakdown.file || breakdown.attachment) return breakdown;
          const uploaded = await uploadFile(breakdown.file);
          if (!uploaded) throw new Error(`Failed to upload breakdown attachment: ${breakdown.file.name}`);
          const attachment = {
            fileName: breakdown.file.name, objectPath: uploaded.objectPath,
            mimeType: breakdown.file.type || "application/octet-stream", fileSize: breakdown.file.size,
          };
          setEquipment(current => current.map(item => {
            const existing = (item.passthrough?.breakdowns ?? []) as StagedBreakdown[];
            return { ...item, passthrough: { ...item.passthrough, breakdowns: existing.map(candidate =>
              candidate.clientKey === breakdown.clientKey ? { ...candidate, attachment, file: undefined } : candidate) } };
          }));
          return { ...breakdown, attachment, file: undefined };
        })),
      },
    };
  }));
  const returnTo = new URLSearchParams(searchStr).get("returnTo") ?? "/site";
  // Pre-deployment Part A: Classic → Guided keeps the SAME server draft.
  // `?draftId=` loads that draft here instead of starting a fresh one.
  const urlDraftId = (() => {
    const raw = new URLSearchParams(searchStr).get("draftId");
    const n = raw ? Number(raw) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  })();
  // Batch 06D — deliberate "Complete Today's DPR" entry: open at the first
  // incomplete step derived from the server draft's readiness instead of the
  // autosaved step. Only this explicit intent overrides the normal
  // accidental-refresh step restore.
  const completeIntent = new URLSearchParams(searchStr).get("complete") === "1";
  // The work hub uses semantic section names, while this established screen
  // owns the actual editing controls. Keep the route small and deterministic.
  const hubSection = new URLSearchParams(searchStr).get("section");
  const hubStep: GuidedStepId | null = hubSection === "activities" ? 3
    : hubSection === "labour" ? 4
    : hubSection === "equipment" ? 5
    : hubSection === "review" ? 7
    : null;

  // Batch 05 (spec §4): merely VIEWING a screen must never change the user's
  // persistent entry-mode preference — the old mount-time setDprEntryMode
  // call is gone. Preference changes only through the explicit
  // "Set … as my default" control on the Detailed screen.

  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  // 06M-B: structured shortage from the server's plant-stock diesel guard
  const [dieselShortage, setDieselShortage] = useState<InsufficientPlantStockPayload | null>(null);
  const [siteName, setSiteName] = useState("");
  const [engineer, setEngineer] = useState("");
  const [entries, setEntries] = useState<GuidedEntry[]>([]);
  const [equipment, setEquipment] = useState<SimpleEquipmentRow[]>([]);
  const [otherEquipmentRows, setOtherEquipmentRows] = useState<Set<number>>(() => new Set());
  const [labour, setLabour] = useState<SimpleLabourRow[]>([]);
  const [remarks, setRemarks] = useState("");
  const [showYesterdayPreview, setShowYesterdayPreview] = useState(false);
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoCameraRef = useRef<HTMLInputElement>(null);
  // Task #1409: wizard step (1 Report · 2 Activities · 3 Details · 4 Photos &
  // crew · 5 Review). Steps 1–2 gate Next; later steps stay draft-lenient.
  const [step, setStep] = useState<GuidedStepId>(hubStep ?? 1);
  // Task #1409: per-activity staged photos, keyed by the row's stable
  // entryKey. Kept OUT of the (JSON) autosave blob — File objects don't
  // serialise; like the DPR-level staged list they live only in this session.
  const [entryPhotos, setEntryPhotos] = useState<Record<string, File[]>>({});
  // Which activity row the per-entry Camera/Gallery/File inputs feed.
  const entryPhotoTargetRef = useRef<string | null>(null);
  const entryCameraRef = useRef<HTMLInputElement>(null);
  const entryGalleryRef = useRef<HTMLInputElement>(null);
  const entryFileRef = useRef<HTMLInputElement>(null);
  // Instruction 031 Part A: once a draft is saved, later saves UPDATE the same
  // record (PATCH) and submit promotes it — never a duplicate row.
  const [draftId, setDraftId] = useState<number | null>(null);
  // Instruction 06X: when a DPR_NOT_READY error names a row on a different
  // wizard step, we store the highlight target here, navigate to the step,
  // then scroll/highlight on the next render (via useEffect).
  const pendingHighlightRef = useRef<import("@/lib/dprNotReadyHighlight").DprNotReadyRowTarget | null>(null);
  // Batch 04: sections the Guided UI doesn't manage (materials / site
  // purchases / structure items) loaded with a server draft — passed back
  // verbatim on save so the child-row replacement can't delete them.
  const unmanagedSectionsRef = useRef<{ materials: any[]; sitePurchases: any[]; structureItems: any[] }>({
    materials: [], sitePurchases: [], structureItems: [],
  });
  // Batch 04: consolidated submit-readiness panel (one dialog, not N toasts).
  const [readiness, setReadiness] = useState<DprReadinessResult | null>(null);

  // Part A: local autosave so accidental navigation/refresh loses nothing
  // (same mechanism as the Detailed DPR, guided-specific key).
  type GuidedFormState = {
    date: string; siteName: string; engineer: string;
    entries: GuidedEntry[]; equipment: SimpleEquipmentRow[]; labour: SimpleLabourRow[];
    remarks: string; draftId: number | null;
    step?: number;
  };
  // Set true by every restore/hydration generation; consumed by the
  // override-derivation effect once BOQ items are available.
  const deriveNeededRef = useRef(false);
  const autosaveData: GuidedFormState = { date, siteName, engineer, entries, equipment, labour, remarks, draftId, step };
  const autosave = useAutosave<GuidedFormState>({
    // A draft with a server id autosaves under its own key so it never
    // collides with (or duplicates into) the fresh-DPR autosave blob.
    // Batch 05: the key follows draftId too — the moment a fresh DPR is saved
    // as a server draft, subsequent autosave writes move to the draft-specific
    // key and can never recreate a stale "guided-dpr-new" blob.
    formKey: (urlDraftId ?? draftId) != null ? `guided-dpr-${urlDraftId ?? draftId}` : "guided-dpr-new",
    data: autosaveData,
    onRestore: (d) => {
      setDate(d.date); setSiteName(d.siteName); setEngineer(d.engineer);
      // Legacy blobs predate entryKey / No Work — normalise so old rows keep
      // working (fresh keys are fine: their photos were session-local anyway).
      setEntries((d.entries ?? []).map((e) => ({
        ...e,
        qtyOverridden: e.qtyOverridden ?? false,
        layerNo: e.layerNo ?? null,
        entryKey: e.entryKey || newEntryKey(),
        noSiteWork: e.noSiteWork ?? false,
        noSiteWorkDescription: e.noSiteWorkDescription ?? "",
        isIncidental: e.isIncidental ?? false,
        incidentalDescription: e.incidentalDescription ?? "",
         materialOutcome: e.materialOutcome ?? null,
         reusableQty: e.reusableQty != null ? Number(e.reusableQty) : null,
         allocations: e.allocations ?? [],
      })));
      // Normal restore keeps the stored step; a deliberate Complete entry
      // computes its own step from the server draft's readiness instead.
      if (!completeIntent) setStep(clampGuidedStep(d.step));
      // Legacy autosave blobs predate `passthrough` — normalise so old rows
      // don't crash the payload builder.
      setEquipment((d.equipment ?? []).map((e: any) => ({ ...newGuidedEquipmentRow(), ...e, passthrough: e.passthrough ?? {} })));
      // Legacy autosave blobs predate gender/work-item fields — normalise.
      setLabour((d.labour ?? []).map((l: any) => ({ ...newLabourRow(), ...l })));
      setRemarks(d.remarks ?? ""); setDraftId(d.draftId ?? null);
      // Restored rows (incl. legacy blobs without the flag) get their override
      // state re-derived from geometry once BOQ items are available.
      deriveNeededRef.current = true;
    },
  });

  // Hydrate from an existing server draft (Classic → Guided switch). Only
  // once, and only if the autosave restore hasn't already loaded this draft.
  const hydratedRef = useRef(false);
  const { data: urlDraftDpr } = useQuery<any>({
    queryKey: ["/api/dprs", urlDraftId],
    queryFn: async () => {
      const res = await fetch(`/api/dprs/${urlDraftId}`, { credentials: "include" });
      if (!res.ok) throw new Error("draft_load_failed");
      return res.json();
    },
    enabled: urlDraftId != null,
  });
  useEffect(() => {
    if (!urlDraftDpr || hydratedRef.current) return;
    hydratedRef.current = true;
    setDraftId(urlDraftDpr.id);
    setDate(urlDraftDpr.date ?? today);
    setSiteName(String(urlDraftDpr.site ?? "").replace(/ – (Edited by|Copy by) .+$/, "").trim());
    setEngineer(urlDraftDpr.engineer ?? "");
    setRemarks(urlDraftDpr.remarks ?? "");
    // Task #1409: no-work rows are first-class in Guided now — hydrate them
    // instead of silently dropping them from the draft.
     setEntries(hydrateCutFillConsumptions((urlDraftDpr.progress ?? [])
      .map((p: any): GuidedEntry => ({
        entryKey: p.entryKey || newEntryKey(),
        noSiteWork: !!p.noSiteWork,
        noSiteWorkDescription: p.noSiteWorkDescription || "",
        activity: p.activity || "",
        boqItemId: p.boqItemId ?? null,
        programmeBarId: p.programmeBarId ?? null, // never stripped client-side
        earthworkArrangementId: p.earthworkArrangementId ?? null,
        side: p.side || "",
        chainageFrom: p.chainageFrom || "",
        chainageTo: p.chainageTo || "",
        quantity: p.quantity != null ? Number(p.quantity) : null,
        uom: p.uom || "SQM",
        expanded: false,
        width: p.width != null ? Number(p.width) : null,
        thickness: p.thickness != null ? Number(p.thickness) : null,
        remark: "",
        quantitySource: p.quantitySource || "",
        quantitySourceNote: p.quantitySourceNote || "",
        chainageOverrideReason: p.chainageOverrideReason || "",
        executedBy: p.executedBy || "",
        // Derived properly once BOQ items load (see derivation effect); this
        // is only the pre-derivation placeholder.
        qtyOverridden: p.quantitySource != null && p.quantitySource !== "" && p.quantitySource !== "calculated",
        layerNo: p.layerNo != null ? Number(p.layerNo) : null,
        isIncidental: !!p.isIncidental,
        incidentalDescription: p.incidentalDescription || "",
         materialOutcome: p.materialOutcome ?? null,
         reusableQty: p.reusableQty != null ? Number(p.reusableQty) : null,
         allocations: [],
      })), urlDraftDpr.cutFillConsumptions));
    deriveNeededRef.current = true;
    // Batch 04: keep every non-edited equipment field for round-trip — a
    // Guided save must never wipe readings/times/fuel entered elsewhere.
    setEquipment((urlDraftDpr.equipment ?? []).map((e: any): SimpleEquipmentRow => splitGuidedEquipmentRow(e)));
    // Sections the Guided UI doesn't manage must be passed back on save,
    // otherwise the child-row replacement deletes them from the draft.
    unmanagedSectionsRef.current = {
      materials: (urlDraftDpr.materials ?? []).map(({ id, dprId, ...rest }: any) => rest),
      sitePurchases: (urlDraftDpr.sitePurchases ?? []).map(({ id, dprId, ...rest }: any) => rest),
      structureItems: (urlDraftDpr.structureItems ?? []).map(({ id, dprId, ...rest }: any) => rest),
    };
    setLabour((urlDraftDpr.labour ?? []).map((l: any): SimpleLabourRow => ({
      category: l.category || "", gender: l.gender || "",
      count: l.count != null ? Number(l.count) : null,
      contractor: l.contractor || "", task: l.task || "",
      boqItemId: l.boqItemId ?? null, structureId: l.structureId ?? null,
    })));
    // Batch 05 (spec §10): this server draft is authoritative — silence any
    // stale "new DPR" autosave blob that belongs to the same draft/context.
    reconcileNewDprAutosaves({
      draftId: urlDraftDpr.id,
      site: String(urlDraftDpr.site ?? ""),
      date: urlDraftDpr.date ?? today,
    });
    // Batch 06D §10/§12: "Complete Today's DPR" opens at the first relevant
    // incomplete step, derived from the SAME shared readiness validator (no
    // new rules, no fragile checklist item ids). Nothing incomplete → Review.
    if (completeIntent) {
      const r = evaluateDprSubmitReadiness({
        workType: urlDraftDpr.workType ?? "road",
        progress: (urlDraftDpr.progress ?? []).filter((p: any) => !p?.noSiteWork),
        equipment: urlDraftDpr.equipment ?? [],
        labour: urlDraftDpr.labour ?? [],
        materials: urlDraftDpr.materials ?? [],
      });
      setStep(firstIncompleteGuidedStep(r.mandatory.map((i) => i.section)));
    } else if (hubStep != null) {
      setStep(hubStep);
    }
  }, [urlDraftDpr, completeIntent, hubStep]);

  // ── Batch 05: Equipment & Fleet linkage (same mechanism as Detailed DPR) ──
  // Open usage records for the DPR date are discoverable and linkable via
  // plantUsageId; the server closes them on Final Submit (closePlantUsage).
  // Discovery is site-scoped server-side: only open usage recorded for this
  // DPR's site is returned (no cross-site disclosure).
  const { data: openUsages = [] } = useQuery<OpenUsageLike[]>({
    queryKey: ["/api/plant-module/equipment-usage/open-today", date, siteName],
    queryFn: async () => {
      // 06X-HF2: site context is required — the server will return 400 without
      // it. The enabled guard below prevents this call when siteName is empty,
      // but surface a clear message if somehow called without site context.
      if (!siteName) {
        console.warn("GuidedDpr: open-usage discovery skipped — no site context");
        return [];
      }
      let res: Response;
      try {
        res = await fetch(
          `/api/plant-module/equipment-usage/open-today?date=${encodeURIComponent(date)}&site=${encodeURIComponent(siteName)}`,
          { credentials: "include" },
        );
      } catch (error) {
        console.warn("GuidedDpr: open-usage discovery network error:", error);
        toast({
          title: "Equipment linkage unavailable",
          description: "Could not check dispatched equipment. You can continue with manual equipment entry.",
          variant: "destructive",
        });
        return [];
      }
      if (!res.ok) {
        // 06X-HF2: surface actionable errors rather than silently returning
        // empty. 400 = missing/invalid site param; 403 = no site access.
        // These are non-fatal for the DPR — we return [] but log a warning
        // and show a toast so the user knows equipment linkage is unavailable.
        let serverMsg = "";
        try { serverMsg = (await res.json()).message ?? ""; } catch { /* ignore */ }
        console.warn(`GuidedDpr: open-usage discovery failed (${res.status}): ${serverMsg}`);
        toast({
          title: "Equipment linkage unavailable",
          description: serverMsg || (
            res.status === 403
              ? "You do not have access to this site's dispatched equipment."
              : "Could not check dispatched equipment. You can continue with manual equipment entry."
          ),
          variant: "destructive",
        });
        return [];
      }
      return res.json();
    },
    enabled: !!date && !!siteName,
  });
  const { data: equipmentMasterList = [] } = useQuery<any[]>({
    queryKey: ["/api/plant-module/equipment", "guided"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/equipment?includeInactive=true", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    // Batch 06C §9: the master must load whenever the Equipment step is
    // usable — open-usage reuse is an ADDITIONAL mechanism, not a
    // prerequisite for picking a machine from the Equipment & Fleet master.
  });
  const activeEquipmentMaster = useMemo(
    () => equipmentMasterList.filter((e: any) => e.isActive !== 0 && e.isActive !== false),
    [equipmentMasterList],
  );
  const equipmentNameOf = (equipmentId: number): string | undefined =>
    equipmentMasterList.find((e: any) => e.id === equipmentId)?.name;
  const unlinkedUsages = unlinkedOpenUsages(openUsages, equipment);
  // Batch 06C §18: photos already attached to this draft on the server —
  // they count toward each activity's 3-photo cap across save/reopen cycles.
  const { data: existingAttachments = [] } = useQuery<Array<{ progressEntryKey?: string | null }>>({
    queryKey: ["/api/attachments", "dpr_progress", draftId],
    queryFn: async () => {
      const res = await fetch(`/api/attachments?moduleType=dpr_progress&linkedRecordId=${draftId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: draftId != null,
  });
  // Batch 05 (spec §10): backstop sweep — a debounced autosave write that was
  // already scheduled under "guided-dpr-new" when the server draft got saved
  // could land AFTER the success-handler cleanup. Once a server draft exists,
  // this delayed reconcile clears any such stale blob for the same context
  // (rule: same draftId, or same site+date). Runs after the 1s debounce window.
  useEffect(() => {
    if (draftId == null || !siteName) return;
    const t = setTimeout(() => { reconcileNewDprAutosaves({ draftId, site: siteName, date }); }, 2000);
    return () => clearTimeout(t);
  }, [draftId, siteName, date]);

  // Edit a field the simple Guided UI now exposes but that lives in the
  // Batch 04 passthrough bag (readings/times). Blank input removes the key so
  // no ""/null values are fabricated for fields the user never set.
  const setPassthroughField = (idx: number, key: string, raw: string, numeric: boolean) => {
    setEquipment((prev) => prev.map((r, j) => {
      if (j !== idx) return r;
      const pt = { ...r.passthrough };
      if (raw === "") delete pt[key];
      else pt[key] = numeric ? Number(raw) : raw;
      return { ...r, passthrough: pt };
    }));
  };

  // ── Master data ────────────────────────────────────────────────────────────
  const { data: sitesList = [] } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const activeSites = sitesList.filter((s) => s.isActive);
  useEffect(() => {
    if (activeSites.length === 1 && !siteName) setSiteName(activeSites[0].name);
  }, [activeSites, siteName]);
  const { data: personnelList = [] } = useQuery<Personnel[]>({ queryKey: ["/api/personnel"] });

  const {
    siteId: selectedSiteId,
    projectId: boqProjectId,
    items: boqItems,
  } = useDprBoqItems<SiteBoqItem>({
    siteName,
    sites: sitesList,
  });
  const { data: cutFillArrangements = [] } = useQuery<any[]>({
    queryKey: ["/api/boq/projects", boqProjectId, "earthwork-arrangements"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${boqProjectId}/earthwork-arrangements`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.arrangements ?? []);
    },
    enabled: !!boqProjectId,
  });
  const usesCutMaterialSource = (boqItemId: number | null) =>
    boqItemId != null && blocksExternalReceiptsForBoqItem(cutFillArrangements, boqItemId);
  const itemById = useMemo(() => {
    const m = new Map<number, SiteBoqItem>();
    boqItems.forEach((i) => m.set(i.id, i));
    return m;
  }, [boqItems]);

  // Batch 06B — chainage duplicate/overlap guard: same neutral shared helper
  // as the Progress Report and the server Final-Submit recheck. Advisory
  // until acknowledged; the existing per-row chainageOverrideReason is reused.
  const overlapRows: CandidateChainageRow[] = entries.map((e, i) => ({
    rowKey: i,
    boqItemId: e.boqItemId,
    side: e.side || null,
    fromKm: parseChainageKm(e.chainageFrom),
    toKm: parseChainageKm(e.chainageTo),
    chainageOverrideReason: e.chainageOverrideReason,
    label: e.activity,
    noSiteWork: e.noSiteWork,
    isIncidental: e.isIncidental,
    layerNo: e.layerNo,
  }));
  const { priors: overlapPriors } = useChainageOverlapContext(
    entries.map((e) => e.boqItemId).filter((id): id is number => id != null),
    draftId,
  );
  const overlapHits = useChainageOverlapHits(overlapRows, overlapPriors);

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

  // Role-independent by construction: shared helper takes only bars + date +
  // reported/linked ids — no user, role or engineer input exists.
  const suggestedBars = useMemo(() => {
    const linked = new Set<number>();
    entries.forEach((e) => { if (e.programmeBarId != null) linked.add(e.programmeBarId); });
    return suggestGuidedBars(programmeBars, date, reportedBarIds, linked);
  }, [programmeBars, date, reportedBarIds, entries]);

  const addEntryFromBar = (bar: ProgrammeBar) => {
    const item = itemById.get(bar.boqItemId);
    setEntries((prev) => [...prev, {
      entryKey: newEntryKey(),
      noSiteWork: false,
      noSiteWorkDescription: "",
      activity: boqItemDisplayName(item) || `BOQ item ${bar.boqItemId}`,
      boqItemId: bar.boqItemId,
      programmeBarId: bar.id,
      earthworkArrangementId: null,
      side: prefillSideFor(bar.side),
      chainageFrom: bar.chainageFrom != null ? fmtCh(bar.chainageFrom) : "",
      chainageTo: "",
      quantity: null,
      uom: item ? resolveBoqUomProfile(item).uom : "",
      expanded: false,
      width: null,
      thickness: null,
      remark: "",
      quantitySource: "",
      quantitySourceNote: "",
      chainageOverrideReason: "",
      executedBy: "",
      qtyOverridden: false,
      layerNo: null,
      isIncidental: false,
      incidentalDescription: "",
    }]);
  };

  // Batch 06C §7: "+ Add Row" creates the activity row DIRECTLY — no modal.
  // The row itself carries the No Site Work checkbox and (when off) the BOQ
  // item selector; programme suggestions in step 2 stay as one-tap adds.
  const addBlankEntry = () => {
    setEntries((prev) => [...prev, {
      entryKey: newEntryKey(),
      noSiteWork: false,
      noSiteWorkDescription: "",
      activity: "",
      boqItemId: null,
      programmeBarId: null,
      earthworkArrangementId: null,
      side: "",
      chainageFrom: "",
      chainageTo: "",
      quantity: null,
      uom: "",
      expanded: false,
      width: null,
      thickness: null,
      remark: "",
      quantitySource: "",
      quantitySourceNote: "",
      chainageOverrideReason: "",
      executedBy: "",
      qtyOverridden: false,
      layerNo: null,
      isIncidental: false,
      incidentalDescription: "",
    }]);
    if (step === 2) setStep(3);
  };

  // Selecting/changing the row's BOQ item (rows not linked to a programme bar).
  const setEntryBoqItem = (idx: number, item: SiteBoqItem) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? {
      ...e,
      boqItemId: item.id,
      activity: dprBoqItemDisplayName(item),
      uom: resolveBoqUomProfile(item).uom,
      programmeBarId: null,
      // 06T §3: deliberate BOQ-item change — the persisted arrangement no
      // longer describes this row's context, so it re-resolves.
      earthworkArrangementId: null,
    } : e)));

  const updateEntry = (idx: number, patch: Partial<GuidedEntry>) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  // Geometry-field change (chainage / width / thickness): auto-recalculate the
  // quantity immediately — unless the engineer overrode it, in which case the
  // entered value is preserved and a mismatch flag renders instead.
  const updateGeometry = (idx: number, patch: Partial<GuidedEntry>) =>
    setEntries((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      const after = { ...e, ...patch };
      const item = after.boqItemId != null ? itemById.get(after.boqItemId) : null;
      return { ...after, ...applyGeometryChange(after, item) };
    }));

  // Manual quantity edit: differs from geometry → overridden (real source
  // required); restored to the calculated value → back to automatic.
  const updateQuantity = (idx: number, quantity: number | null) =>
    setEntries((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      const after = { ...e, quantity };
      const item = after.boqItemId != null ? itemById.get(after.boqItemId) : null;
      const res = applyQuantityEdit(after, item);
      return { ...after, ...res, ...(res.qtyOverridden ? {} : { quantitySource: "", quantitySourceNote: "" }) };
    }));

  // Whenever a restore/hydration generation lands (autosave OR ?draftId — in
  // any order relative to the BOQ-item load), settle each row's override flag
  // from geometry. deriveOverridden is the single semantic: a quantity that
  // doesn't match the (complete) geometry computation is overridden — so an
  // incomplete-geometry manual quantity is PROTECTED from silent recalc, and a
  // matching one returns to automatic. Runs once per generation, never loops.
  useEffect(() => {
    if (!deriveNeededRef.current || boqItems.length === 0 || entries.length === 0) return;
    deriveNeededRef.current = false;
    setEntries((prev) => prev.map((e) => ({
      ...e,
      qtyOverridden: deriveOverridden(e, e.boqItemId != null ? itemById.get(e.boqItemId) : null),
    })));
  }, [boqItems, entries, itemById]);

  // Instruction 06X: after a step navigation triggered by a DPR_NOT_READY
  // error, execute the deferred scroll+highlight on the next paint.
  useEffect(() => {
    const target = pendingHighlightRef.current;
    if (!target) return;
    pendingHighlightRef.current = null;
    // Defer until the DOM has rendered the new step's rows.
    const id = setTimeout(() => scrollAndHighlightRow(target), 100);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const jumpToReadinessIssue = (issue: DprReadinessIssue) => {
    const rowIndex = issue.rowIndex
      ?? (typeof issue.rowKey === "number" && Number.isFinite(issue.rowKey) ? issue.rowKey : null);
    if (rowIndex == null) return;
    const target = { section: issue.section, rowIndex, rowKey: issue.rowKey ?? null };
    const targetStep = READINESS_SECTION_TO_GUIDED_STEP[issue.section] ?? 7;
    setReadiness(null);
    if (targetStep !== step) {
      pendingHighlightRef.current = target;
      setStep(targetStep);
    } else {
      setTimeout(() => scrollAndHighlightRow(target), 100);
    }
  };

  const removeEntry = (idx: number) => {
    const key = entries[idx]?.entryKey;
    setEntries((prev) => prev.filter((_, i) => i !== idx));
    if (key) setEntryPhotos((prev) => { const { [key]: _gone, ...rest } = prev; return rest; });
  };

  // Batch 06V: state toggles are mutually exclusive, but physical values stay
  // in local state while hidden. The no-work payload branch strips them on save.
  const setNoSiteWork = (idx: number, checked: boolean) =>
    setEntries((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      if (checked) {
        return {
          ...e, noSiteWork: true,
          isIncidental: false, incidentalDescription: "",
        };
      }
      return { ...e, noSiteWork: false };
    }));

  // Batch 06V: toggle Incidental / Non-BOQ. Mutually exclusive with noSiteWork.
  const [incidentalConfirm, setIncidentalConfirm] = useState<{
    idx: number; qty: number | null; uom: string;
  } | null>(null);

  const setIncidental = (idx: number, checked: boolean) =>
    setEntries((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      if (checked) return { ...e, isIncidental: true, noSiteWork: false };
      return { ...e, isIncidental: false };
    }));

  // ── Same as yesterday (structure-only copy, always previewed) ─────────────
  const applyYesterdayStructure = () => {
    if (!yesterdayDpr) return;
    // 031 Part I: shared structure-only extraction (same module as SiteEntry).
    const st = extractYesterdayStructure(yesterdayDpr as any);
    setEntries(st.progress.map((p) => ({
      entryKey: newEntryKey(),
      noSiteWork: false,
      noSiteWorkDescription: "",
      activity: p.activity,
      boqItemId: p.boqItemId,
      programmeBarId: p.programmeBarId,
      // 06T §3: yesterday's arrangement is NOT copied — it re-resolves for
      // today's context when the row is completed.
      earthworkArrangementId: null,
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
      qtyOverridden: false,
      layerNo: null,
      isIncidental: false,
      incidentalDescription: "",
    })));
    // Yesterday copy is structure-only: seeds carry the 4 edited fields and an
    // empty passthrough (no readings/times are ever copied across days).
    setEquipment(st.equipment.map((e: any) => ({ ...newGuidedEquipmentRow(), ...e, passthrough: {} })));
    setLabour(st.labour.map((l: any) => ({ ...newLabourRow(), ...l })));
    // photos / readings / remarks / submit status intentionally NOT copied
    setRemarks("");
    setStagedPhotos([]);
    setEntryPhotos({});
    setShowYesterdayPreview(false);
    toast({ title: "Structure copied", description: "Yesterday's work items and crew copied. Enter today's chainage and quantities." });
  };

  // ── Photos ────────────────────────────────────────────────────────────────
  const filterValidPhotos = (files: FileList | null): File[] => {
    if (!files) return [];
    return Array.from(files).filter((f) => {
      if (f.size > 15 * 1024 * 1024) { toast({ title: "File too large", description: `${f.name} exceeds 15MB.`, variant: "destructive" }); return false; }
      if (!f.type.startsWith("image/")) { toast({ title: "Unsupported file", description: `${f.name} must be an image.`, variant: "destructive" }); return false; }
      return true;
    });
  };
  const addPhotos = (files: FileList | null) => {
    const valid = filterValidPhotos(files);
    if (valid.length) setStagedPhotos((prev) => [...prev, ...valid]);
  };
  // Task #1409: per-activity staged photos (Camera / Gallery / File inputs
  // share one target row via entryPhotoTargetRef).
  // Batch 06C §18: hard cap — already-attached (server) + staged (local) may
  // never exceed MAX_ACTIVITY_PHOTOS per activity row. The server rejects a
  // fourth independently; this stops it earlier with a clear message.
  const entryAttachedCount = (key: string): number => countEntryAttachments(existingAttachments, key);
  const entryPhotoCapacityOf = (key: string): number =>
    activityPhotoCapacity(entryAttachedCount(key), (entryPhotos[key] ?? []).length);
  const addEntryPhotos = (files: FileList | null) => {
    const key = entryPhotoTargetRef.current;
    const valid = filterValidPhotos(files);
    if (!key || valid.length === 0) return;
    const capacity = entryPhotoCapacityOf(key);
    if (capacity <= 0) {
      toast({ title: "Photo limit reached", description: `Maximum ${MAX_ACTIVITY_PHOTOS} photos per activity.`, variant: "destructive" });
      return;
    }
    if (valid.length > capacity) {
      toast({ title: "Some photos not added", description: `Only ${capacity} more allowed — maximum ${MAX_ACTIVITY_PHOTOS} photos per activity.`, variant: "destructive" });
    }
    const accepted = valid.slice(0, capacity);
    setEntryPhotos((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), ...accepted] }));
  };
  const removeEntryPhoto = (key: string, i: number) =>
    setEntryPhotos((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((_, j) => j !== i) }));
  const stagedPhotoCount = stagedPhotos.length + Object.values(entryPhotos).reduce((n, l) => n + l.length, 0);

  /**
   * Uploads one staged photo and attaches it to the DPR (optionally to a
   * specific activity row via progressEntryKey). Returns true on success.
   */
  const uploadOnePhoto = async (dprId: number, file: File, progressEntryKey: string | null): Promise<boolean> => {
    const up = await uploadFile(file);
    if (!up) return false;
    try {
      await apiRequest("POST", "/api/attachments", {
        moduleType: "dpr_progress", linkedRecordId: dprId,
        siteId: selectedSiteId ?? null, boqProjectId: boqProjectId ?? null,
        fileName: file.name, objectPath: up.objectPath,
        mimeType: file.type || "application/octet-stream", fileSize: file.size,
        progressEntryKey,
      });
      return true;
    } catch {
      toast({ title: "Photo failed to attach — kept for retry", description: file.name, variant: "destructive" });
      return false;
    }
  };
  /**
   * Uploads all staged photos (DPR-level + per-activity) and returns the
   * files that FAILED per bucket, so the caller keeps only those staged for
   * retry — successfully attached photos leave the staged lists (otherwise
   * the next draft save re-uploads them as duplicates).
   */
  const uploadStagedPhotos = async (dprId: number): Promise<{ failed: File[]; failedByEntry: Record<string, File[]> }> => {
    const failed: File[] = [];
    for (const file of stagedPhotos) {
      if (!(await uploadOnePhoto(dprId, file, null))) failed.push(file);
    }
    const failedByEntry: Record<string, File[]> = {};
    for (const [key, files] of Object.entries(entryPhotos)) {
      for (const file of files) {
        if (!(await uploadOnePhoto(dprId, file, key))) {
          (failedByEntry[key] ??= []).push(file);
        }
      }
    }
    return { failed, failedByEntry };
  };

  // ── Save / submit ─────────────────────────────────────────────────────────
  const entriesComplete = entries.length > 0 && entries.every(guidedEntryComplete);

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
      // Task #1409: No Site Work rows carry only the activity + description —
      // no geometry, quantity or programme measurements (same as Detailed).
      if (e.noSiteWork) {
        return {
          entryKey: e.entryKey,
          activity: e.activity,
          side: "", chainageFrom: "", chainageTo: "",
          length: null, width: null, thickness: null, quantity: null,
          uom: e.uom || null,
          noSiteWork: true,
          noSiteWorkDescription: e.noSiteWorkDescription,
          isIncidental: false,
          incidentalDescription: null,
          personnelIds: [] as number[],
          boqItemId: e.boqItemId,
          programmeBarId: e.programmeBarId,
          earthworkArrangementId: null,
          chainageFromKm: null, chainageToKm: null,
          quantitySource: null, quantitySourceNote: null,
          chainageOverrideReason: null, executedBy: null,
        };
      }
      const fromKm = parseChainageKm(e.chainageFrom);
      const toKm = parseChainageKm(e.chainageTo);
      // Instruction 031 Part B: the server is now draft-lenient — a draft row
      // with incomplete chainage KEEPS its programmeBarId (no more dropping
      // the link to survive validation).
      return {
        entryKey: e.entryKey,
        activity: e.activity,
        side: e.side,
        chainageFrom: e.chainageFrom,
        chainageTo: e.chainageTo,
        // 06T §1: persist the chainage-derived length (Guided has no manual
        // Length field) so downstream views never show a blank/zero Length.
        length: calculateLengthFromChainage(e.chainageFrom, e.chainageTo),
        width: e.width,
        thickness: e.thickness,
        quantity: e.quantity,
        // DPR quantity is the physical measurement. For geometry-backed BOQ
        // items persist its physical profile UOM (e.g. SQM), never the BOQ UOM
        // (e.g. Ha). BOQ credit is derived separately via the factor.
        uom: e.boqItemId != null && itemById.get(e.boqItemId)
          ? resolveBoqUomProfile(itemById.get(e.boqItemId)!).uom
          : e.uom,
        noSiteWork: false,
        noSiteWorkDescription: "",
        isIncidental: e.isIncidental,
        incidentalDescription: e.isIncidental ? (e.incidentalDescription.trim() || null) : null,
        personnelIds: [] as number[],
        boqItemId: e.boqItemId,
        programmeBarId: e.programmeBarId,
        // 06T §3: resolved arrangement travels with the row as a historical fact.
        earthworkArrangementId: e.earthworkArrangementId,
        chainageFromKm: fromKm,
        chainageToKm: toKm,
        // Source is real state: "calculated" only when geometry recomputation
        // matches; otherwise the engineer's explicit pick (or null on drafts).
        quantitySource: entrySourceState(e) ?? (e.quantitySource || null),
        quantitySourceNote: e.quantitySourceNote.trim() || null,
        chainageOverrideReason: e.chainageOverrideReason.trim() || null,
        executedBy: e.executedBy || null,
        layerNo: e.layerNo,
        materialOutcome: e.materialOutcome || null,
        reusableQty: e.materialOutcome == null ? null : e.reusableQty,
      };
    });
    const entryRemarks = entries.filter((e) => !e.noSiteWork && e.remark.trim()).map((e) => `${e.activity}: ${e.remark.trim()}`);
    const allRemarks = [...entryRemarks, remarks.trim()].filter(Boolean).join("\n");
    return {
      date, site: siteName, engineer, role: "engineer", workType: "road",
      boqProjectId: boqProjectId ?? undefined,
      ...(asDraft ? { dprStatus: "draft" } : {}),
      progress,
      cutFillConsumptions: flattenCutFillConsumptions(entries),
      structureItems: unmanagedSectionsRef.current.structureItems,
      // Batch 04: edited fields on top of the untouched passthrough — no more
      // hard-coded ""/null wiping of values entered in the Detailed editor.
      // 06T §6: the trace showed the only real loss point was this filter —
      // a draft row without a machine name was silently dropped, then the
      // draft PATCH's replace semantics deleted it from the DB. Drafts now
      // keep any row with ANY content (machine may be "" — column accepts it);
      // final submits still require a machine name.
      equipment: equipment
        .filter((e) =>
          asDraft
            ? e.machine || e.vehicleNo || e.operator || e.task || Object.values(e.passthrough ?? {}).some((v) => v != null && v !== "")
            : e.machine,
        )
        .map((e) => {
          const pt = e.passthrough as any;
          const master = activeEquipmentMaster.find((m: any) => m.id === pt.equipmentId);
          const preview = computeEquipmentUsage(master ?? (pt.dieselNorm != null ? { consumptionNorm: Number(pt.dieselNorm) } : null), pt);
          return buildGuidedEquipmentPayload({
            ...e,
            passthrough: {
              ...pt,
              totalKm: preview.totalKm ?? pt.totalKm ?? null,
              hoursWorked: preview.hoursWorked,
              expectedDiesel: preview.expectedDiesel,
              dieselNorm: preview.efficiencyValue ?? pt.dieselNorm ?? null,
            },
          });
        }),
      // Batch 06C §12: real values round-trip — gender / work-item / structure
      // links are never wiped by a Guided save.
      labour: labour.filter((l) => l.category).map((l) => ({
        category: l.category, gender: l.gender, count: l.count ?? 0, task: l.task,
        contractor: l.contractor, boqItemId: l.boqItemId, structureId: l.structureId,
      })),
      materials: unmanagedSectionsRef.current.materials,
      sitePurchases: unmanagedSectionsRef.current.sitePurchases,
      remarks: allRemarks || undefined,
      clientTimestamp: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
    };
  };

  const saveMutation = useMutation({
    mutationFn: async (asDraft: boolean) => {
      const missingFuelSource = equipment.some((row) =>
        Number(row.passthrough?.diesel ?? 0) > 0 && !row.passthrough?.dieselSource
      );
      if (missingFuelSource) {
        toast({ title: "Select diesel source for every equipment row with positive diesel", variant: "destructive" });
        throw new Error("Diesel source is required for positive diesel");
      }
      const payload = buildPayload(asDraft);
      const payloadRows = equipment.filter((e) =>
        asDraft
          ? e.machine || e.vehicleNo || e.operator || e.task || Object.values(e.passthrough ?? {}).some((v) => v != null && v !== "")
          : e.machine,
      );
      payload.equipment = (await prepareBreakdownAttachments(payloadRows)).map((row) => buildGuidedEquipmentPayload(row)) as any[];
      // Part A: reuse the saved draft record instead of creating duplicates.
      let res;
      if (draftId != null && asDraft) {
        res = await apiRequest("PATCH", `/api/dprs/${draftId}/draft`, payload);
      } else if (draftId != null && !asDraft) {
        res = await apiRequest("POST", `/api/dprs/${draftId}/submit`, payload);
      } else {
        res = await apiRequest("POST", "/api/dprs", payload);
      }
      return { data: await res.json(), asDraft };
    },
    onSuccess: async ({ data, asDraft }) => {
      let failedPhotoCount = 0;
      if (stagedPhotoCount > 0) {
        // Attached photos leave the staged lists (no duplicate re-upload on
        // the next save); failed ones stay staged so the user can retry.
        const { failed, failedByEntry } = await uploadStagedPhotos(data.id);
        setStagedPhotos(failed);
        setEntryPhotos(failedByEntry);
        failedPhotoCount = failed.length + Object.values(failedByEntry).reduce((n, f) => n + f.length, 0);
        queryClient.invalidateQueries({ queryKey: ["/api/attachments", "dpr_progress", data.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      if (asDraft) {
        const savedId = data.id ?? draftId;
        setDraftId(savedId);
        // Batch 05 (spec §10): once the server draft holds this work, the
        // server is authoritative — clear this screen's local blob and any
        // stale new-DPR blob (either silo) for the same draft/site/date.
        await autosave.clearDraft();
        if (savedId != null) await reconcileNewDprAutosaves({ draftId: savedId, site: siteName, date });
        // Batch 06D §3: explicit Save Draft = "park it safely and leave".
        // Navigate only AFTER the server confirmed the save (we're in
        // onSuccess) AND every staged photo uploaded — leaving would unmount
        // the still-staged failed files and silently lose them. Retrying
        // Save Draft here is safe (PATCHes the same draft).
        if (failedPhotoCount > 0) {
          toast({
            title: "Draft saved — photos need retry",
            description: `${failedPhotoCount} photo${failedPhotoCount !== 1 ? "s" : ""} failed to upload and ${failedPhotoCount !== 1 ? "are" : "is"} still attached here. Tap Save Draft again to retry.`,
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Draft Saved", description: "You can complete today's DPR later from Field Home." });
        setLocation(returnTo);
      } else {
        await autosave.clearDraft();
        if ((data.id ?? draftId) != null) await reconcileNewDprAutosaves({ draftId: data.id ?? draftId!, site: siteName, date });
        toast({ title: "Report Saved Successfully", description: "Your site report has been submitted." });
        setLocation(`/site/success/${data.id ?? draftId}?type=road&returnTo=${encodeURIComponent(returnTo)}`);
      }
    },
    onError: (err: any) => {
      const shortage = parseInsufficientPlantStock(err);
      if (shortage) { setDieselShortage(shortage); return; }
      // Batch 06V: normalised DPR error — plain message, never raw JSON/code.
      const dprErr = parseDprError(err);
      toast({ title: dprErr.title, description: dprErr.lines.join("\n") || undefined, variant: "destructive" });
      // Instruction 06X: prefer rowIndex/rowKey from DPR_NOT_READY; fall back
      // to highlightActivity for activity-section rows.
      const target = extractNotReadyRowTarget(err);
      if (target) {
        // Map the error's section to the wizard step that owns those rows.
        const targetStep = READINESS_SECTION_TO_GUIDED_STEP[target.section] ?? null;
        if (targetStep !== null && targetStep !== step) {
          // Navigate first; the useEffect on `step` will scroll after render.
          pendingHighlightRef.current = target;
          setStep(targetStep as GuidedStepId);
        } else {
          // Already on the correct step — scroll immediately.
          scrollAndHighlightRow(target);
        }
      } else if (dprErr.highlightActivity) {
        // Legacy: locate by activity name when rowIndex absent.
        // Activities live on step 2 (Activities) or 3 (Details).
        const idx = entries.findIndex((e) => e.activity === dprErr.highlightActivity);
        if (idx >= 0) {
          const activityStep: GuidedStepId = 2;
          if (step !== activityStep) {
            pendingHighlightRef.current = { section: "activities", rowIndex: idx, rowKey: null };
            setStep(activityStep);
          } else {
            const el = document.querySelector(`[data-testid="card-entry-${idx}"]`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("ring-2", "ring-destructive", "ring-offset-2");
              setTimeout(() => el.classList.remove("ring-2", "ring-destructive", "ring-offset-2"), 3000);
            }
          }
        }
      }
    },
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
      // Task #1409: a No Site Work row needs only its activity text — no
      // chainage/side/quantity/programme rules apply (excluded from BOQ math).
      if (e.noSiteWork) {
        if (!e.activity.trim()) {
          toast({ title: "Activity needed", description: "Name the no-work activity (e.g. RE-CLEARING VEGETATION, MACHINERY SHIFTING).", variant: "destructive" });
          return false;
        }
        continue;
      }
      // Batch 06V: incidental rows need a description
      if (e.isIncidental && !e.incidentalDescription.trim()) {
        toast({ title: "Description required", description: `"${e.activity || "Incidental activity"}": enter a description for this Incidental / Non-BOQ item.`, variant: "destructive" });
        return false;
      }
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
      // Batch 1 Part A: actual execution side is mandatory for every guided
      // (road / chainage-based) activity, linked or not.
      if (!e.side) {
        toast({ title: "Side needed", description: `"${e.activity}": select the actual execution side (LHS / RHS / Both Sides / Full Width).`, variant: "destructive" });
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
      // Batch 06B — a real chainage overlap (this DPR or a prior submitted
      // DPR) needs a reason before Final Submit. Draft save stays lenient.
      {
        const idx = entries.indexOf(e);
        const hits = overlapHits.get(idx) ?? [];
        if (hits.length > 0 && !e.chainageOverrideReason.trim()) {
          toast({ title: "Reason required", description: `"${e.activity}": possible chainage overlap requires a reason before submission — tap “Give reason” on the overlap warning.`, variant: "destructive" });
          return false;
        }
      }
      // Instruction 031 Parts F/H — same rules as the Detailed DPR.
      if (e.programmeBarId != null && e.boqItemId != null) {
        const bars = queryClient.getQueryData<PickerBar[]>(["/api/dpr/programme-bars", boqProjectId, e.boqItemId]) ?? [];
        const bar = bars.find((b) => b.id === e.programmeBarId);
        if (bar) {
          // Batch 1 Part C: hard client-side block on incompatible planned ↔
          // actual side (the server enforces the same shared matrix).
          if (!isDprSideCompatible(bar.side, sideKeyOf(e.side))) {
            toast({ title: "Side not allowed", description: `"${e.activity}": a bar planned ${barSideLabel(bar.side)} cannot record actual execution as ${e.side}.`, variant: "destructive" });
            return false;
          }
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
    const cutFillIssues = validateCutFillForm(entries as any, boqItems, cutFillArrangements, [], true);
    if (cutFillIssues.length > 0) {
      toast({ title: "Cut / fill reconciliation needed", description: cutFillIssues[0], variant: "destructive" });
      return false;
    }
    return true;
  };

  // Part J: switching views mid-entry never loses data. If a server draft
  // exists, continue it in the Detailed editor; otherwise the local autosave
  // (plus a confirm) protects unsaved entries.
  // Batch 05 (spec §4): this is a VIEW switch over the same DPR — it must NOT
  // call setDprEntryMode. The persistent default changes only via the
  // explicit control on the Detailed screen.
  const switchToDetailed = () => {
    if (draftId != null) {
      setLocation(`/site/edit/${draftId}?draft&returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (entries.length > 0 && !window.confirm("You have unsaved activities. They stay locally autosaved on this screen, but the Detailed DPR starts fresh — save a draft first to continue it there. Switch anyway?")) {
      return;
    }
    setLocation(`/site/new?type=road&returnTo=${encodeURIComponent(returnTo)}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto w-full pb-28">
      <InsufficientDieselDialog payload={dieselShortage} onClose={() => setDieselShortage(null)} />
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <Link href={returnTo}>
          <Button variant="ghost" size="sm" data-testid="button-back"><ChevronLeft className="w-4 h-4 mr-1" />Back</Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={switchToDetailed} data-testid="button-switch-detailed">
          <LayoutList className="w-4 h-4 mr-1" />Detailed / Advanced view
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

      {/* Task #1409: wizard step indicator */}
      <div className="flex items-center gap-1 mb-4" data-testid="wizard-stepper">
        {GUIDED_STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1 flex-1 min-w-0">
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 flex-1 min-w-0"
              // Completed steps are tappable to go back; forward jumps go
              // through Next so the step gates run.
              onClick={() => { if (s.id < step) setStep(s.id as GuidedStepId); }}
              data-testid={`wizard-step-${s.id}`}
            >
              <span className={`w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center shrink-0 ${
                s.id === step ? "bg-primary text-primary-foreground"
                : s.id < step ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"}`}>
                {s.id < step ? <Check className="w-3.5 h-3.5" /> : s.id}
              </span>
              <span className={`text-[10px] leading-tight truncate w-full text-center ${s.id === step ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </button>
            {i < GUIDED_STEPS.length - 1 && <div className={`h-px flex-1 max-w-6 ${s.id < step ? "bg-primary/40" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      {/* Step 1 — Report header */}
      {step === 1 && (
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
      )}

      {/* Step 2 — pick today's activities */}
      {step === 2 && (<>
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
              {(() => {
                // The "already reported" claim is only made when the data
                // genuinely supports it (bars covering this date all reported).
                const reason = emptySuggestionsReason(programmeBars, date);
                if (reason === "no_programme") return "No work programme found for this site — add activities manually below.";
                if (reason === "no_date_coverage") return "The work programme has no activities planned for this date — check the programme's bar dates, or add activities manually below.";
                return "Nothing pending from the programme for this date — everything planned is already reported, or use “+ Record another activity”.";
              })()}
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
                      <p className="text-sm font-medium truncate">{boqItemDisplayName(item) || `BOQ item ${bar.boqItemId}`}</p>
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

      {/* Chosen activities so far (details entered in the next step) */}
      {entries.length > 0 && (
        <div className="mb-4" data-testid="chosen-activities">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Today's selected activities</h2>
          <div className="space-y-1.5">
            {entries.map((e, idx) => (
              <div key={e.entryKey} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2 bg-white dark:bg-slate-900" data-testid={`chosen-activity-${idx}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{e.activity}</p>
                  {e.noSiteWork && <Badge variant="secondary" className="mt-0.5">No site work</Badge>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeEntry(idx)} data-testid={`button-remove-chosen-${idx}`}>
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch 06C §7: + Add Row creates the activity row directly (no modal)
          and jumps to Details where the row carries its own No Site Work
          checkbox and BOQ item selector. */}
      {siteName && (
        <Button variant="outline" className="w-full mb-4" onClick={addBlankEntry} data-testid="button-add-activity">
          <Plus className="w-4 h-4 mr-2" />Add Activity
        </Button>
      )}
      </>)}

      {/* Step 3 — per-activity details */}
      {step === 3 && (<>
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground mb-4" data-testid="text-no-entries-step3">
          No activities selected yet — go back to pick today's activities.
        </p>
      )}
      {/* Entry cards */}
      {entries.map((e, idx) => {
        // Batch 1 Part B: planned side (from the linked bar) and actual
        // execution side are separate concepts, displayed separately. The
        // reactive programme query (not a cache peek) so restored drafts show
        // the planned badge + matrix-narrowed options as soon as bars load.
        const linkedBar = e.programmeBarId != null
          ? programmeBars.find((b) => b.id === e.programmeBarId)
            ?? (e.boqItemId != null
              ? (queryClient.getQueryData<PickerBar[]>(["/api/dpr/programme-bars", boqProjectId, e.boqItemId]) ?? []).find((b) => b.id === e.programmeBarId)
              : undefined)
            ?? null
          : null;
        const boqItem = e.boqItemId != null ? itemById.get(e.boqItemId) ?? null : null;
        const measurement = dprMeasurementSummary(
          {
            length: null,
            chainageFrom: e.chainageFrom,
            chainageTo: e.chainageTo,
            width: e.width,
            thickness: e.thickness,
            quantity: e.quantity,
            uom: e.uom,
          },
          boqItem,
        );
        return (
        <Card key={idx} className="mb-3 transition-all duration-500" data-testid={`card-entry-${idx}`} data-dpr-row-key={dprRowKey("activities", idx)}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm">{e.activity}</p>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {linkedBar?.side && (
                    <Badge variant="secondary" data-testid={`badge-planned-side-${idx}`}>
                      Planned side: {barSideLabel(linkedBar.side)}
                    </Badge>
                  )}
                  {e.programmeBarId != null && <Badge variant="outline">Programme-linked</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeEntry(idx)} data-testid={`button-remove-entry-${idx}`}>
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
            {/* Task #1409 + Batch 06V: per-activity status toggles (mutually exclusive). */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`guided-no-work-${idx}`}
                  checked={e.noSiteWork}
                  onCheckedChange={(checked) => setNoSiteWork(idx, checked === true)}
                  data-testid={`checkbox-no-site-work-${idx}`}
                />
                <Label htmlFor={`guided-no-work-${idx}`} className="text-xs cursor-pointer">No site work</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`guided-incidental-${idx}`}
                  checked={e.isIncidental}
                  onCheckedChange={(checked) => {
                    const willCheck = checked === true;
                    const item = e.boqItemId != null ? itemById.get(e.boqItemId) : null;
                    const creditedQty = e.quantity ?? computedQty(e, item);
                    if (willCheck && creditedQty != null && creditedQty > 0 && !e.isIncidental) {
                      setIncidentalConfirm({ idx, qty: creditedQty, uom: measurement.measuredUom ?? e.uom });
                    } else {
                      setIncidental(idx, willCheck);
                    }
                  }}
                  data-testid={`checkbox-incidental-${idx}`}
                />
                <Label htmlFor={`guided-incidental-${idx}`} className="text-xs cursor-pointer">Incidental / Non-BOQ</Label>
              </div>
            </div>
            {e.noSiteWork && (
              <div className="space-y-2" data-testid={`no-work-block-${idx}`}>
                <div>
                  <Label className="text-sm">Activity</Label>
                  <Input
                    placeholder="e.g., RE-CLEARING VEGETATION, MACHINERY SHIFTING"
                    value={e.activity}
                    onChange={(ev) => updateEntry(idx, { activity: ev.target.value.toUpperCase() })}
                    className="uppercase"
                    data-testid={`input-nowork-activity-${idx}`}
                  />
                </div>
                <div>
                  <Label className="text-sm">Description</Label>
                  <Textarea
                    placeholder="Describe what was done and why it isn't billable progress…"
                    value={e.noSiteWorkDescription}
                    onChange={(ev) => updateEntry(idx, { noSiteWorkDescription: ev.target.value.toUpperCase() })}
                    className="uppercase"
                    rows={3}
                    data-testid={`input-nowork-description-${idx}`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  This row is recorded on the daily report but never counts toward BOQ quantities or billing.
                </p>
              </div>
            )}
            {e.isIncidental && !e.noSiteWork && (
              <div className="space-y-1.5" data-testid={`incidental-block-${idx}`}>
                <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">
                  Incidental / Non-BOQ · No BOQ Credit
                </Badge>
                <div>
                  <Label className="text-xs">Description <span className="text-destructive">*</span></Label>
                  <Textarea
                    placeholder="Describe this incidental / Non-BOQ work…"
                    value={e.incidentalDescription}
                    onChange={(ev) => updateEntry(idx, { incidentalDescription: ev.target.value })}
                    rows={2}
                    data-testid={`input-incidental-description-${idx}`}
                  />
                  {e.incidentalDescription.trim() === "" && (
                    <p className="text-xs text-destructive mt-0.5">Required before submitting.</p>
                  )}
                </div>
              </div>
            )}
            {!e.noSiteWork && (<>
            {/* Batch 06C §7: rows created via "+ Add Row" pick their BOQ item
                right here — programme-suggested rows keep their item fixed
                (the bar defines it), so the selector shows only for unlinked
                rows. Changing the item resets the bar link. */}
            {e.programmeBarId == null && (
              <div>
                <Label>BOQ Item / Activity</Label>
                <BillItemPicker
                  items={boqItems}
                  value={e.boqItemId}
                  stacked
                  labels={false}
                  testidPrefix={`guided-progress-${idx}`}
                  reviewPath={boqProjectId ? `/work-program/${boqProjectId}/item-review` : undefined}
                  onChange={(_id, item) => {
                    if (item) {
                      setEntryBoqItem(idx, item as SiteBoqItem);
                    } else {
                      updateEntry(idx, {
                        boqItemId: null,
                        activity: "",
                        uom: "",
                        programmeBarId: null,
                        earthworkArrangementId: null,
                      });
                    }
                  }}
                />
              </div>
            )}
            {/* Batch 1 Part A: actual execution side is a core, ALWAYS-visible,
                editable field — never just a fixed badge. Options come from the
                shared matrix, narrowed by the linked bar's planned side. */}
            <div>
              <Label>Actual execution side *</Label>
              <Select value={e.side} onValueChange={(v) => updateEntry(idx, { side: v })}>
                <SelectTrigger data-testid={`select-side-${idx}`}><SelectValue placeholder="Select actual side executed" /></SelectTrigger>
                <SelectContent>
                  {sideOptionsFor(linkedBar?.side).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  {/* keep an out-of-matrix saved value visible so it can be corrected */}
                  {e.side && !sideOptionsFor(linkedBar?.side).includes(e.side) && (
                    <SelectItem value={e.side}>{e.side}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {linkedBar?.side && e.side && !isDprSideCompatible(linkedBar.side, sideKeyOf(e.side)) && (
                <p className="text-xs text-destructive mt-1" data-testid={`text-side-incompatible-${idx}`}>
                  Blocked: a bar planned {barSideLabel(linkedBar.side)} cannot record actual execution as {e.side}. Change the side or the planned reach.
                </p>
              )}
            </div>
            {(() => {
              // Item/UOM-aware geometry: show only the dimensions this BOQ
              // item's quantity actually needs (CUM: W+T, SQM: W, RMT/MT/Nos:
              // none) — required fields live in the MAIN card, never behind
              // "Add details".
              const item = e.boqItemId != null ? itemById.get(e.boqItemId) : null;
              const dims = requiredDims(item);
              const needW = dims.includes("W");
              const needT = dims.includes("T");
              const mismatchCalc = overrideMismatch(e, item);
              const srcState = entrySourceState(e);
              return (
                <>
                  <div className="grid grid-cols-3 gap-2" data-testid={`activity-identity-block-${idx}`}>
                    <div>
                      <Label>Ch. From</Label>
                      <Input value={e.chainageFrom} placeholder="0+000" onChange={(ev) => updateGeometry(idx, { chainageFrom: ev.target.value })} data-testid={`input-ch-from-${idx}`} />
                    </div>
                    <div>
                      <Label>Ch. To</Label>
                      <Input value={e.chainageTo} placeholder="0+000" onChange={(ev) => updateGeometry(idx, { chainageTo: ev.target.value })} data-testid={`input-ch-to-${idx}`} />
                    </div>
                    {/* Batch 06C-P §13/14: derived Length — canonical chainage
                        math (shared/dprGeometry), read-only; the Engineer never
                        types the same length twice. */}
                    <div>
                      <Label>Length (m)</Label>
                      <Input
                        readOnly
                        tabIndex={-1}
                        className="bg-muted/50"
                        value={(() => { const L = calculateLengthFromChainage(e.chainageFrom, e.chainageTo); return L != null ? L.toFixed(2) : ""; })()}
                        placeholder="—"
                        data-testid={`input-length-${idx}`}
                      />
                    </div>
                    {needW && (
                      <div>
                        <Label>Width (m)</Label>
                        <Input type="number" inputMode="decimal" value={e.width ?? ""} onChange={(ev) => updateGeometry(idx, { width: ev.target.value === "" ? null : Number(ev.target.value) })} data-testid={`input-width-${idx}`} />
                      </div>
                    )}
                    {needT && (
                      <div>
                        <Label>Thickness (m)</Label>
                        <Input type="number" inputMode="decimal" value={e.thickness ?? ""} onChange={(ev) => updateGeometry(idx, { thickness: ev.target.value === "" ? null : Number(ev.target.value) })} data-testid={`input-thickness-${idx}`} />
                      </div>
                    )}
                    {/* Task #1419: the optional layer/lift field only appears for
                        layer-capable BOQ items (earthwork/embankment, subgrade,
                        GSB, WMM, or items configured for multi-lift work) — or
                        when a layerNo is already saved on this row, so existing
                        values stay visible/editable. It is never mandatory. */}
                    {showLayerField(item, e.layerNo) && (
                    <div>
                      {/* 06P: optional layer/lift number — blank = exactly today's behaviour.
                          "Lift" wording is a pure client-side display convention. */}
                      <Label>{layerFieldLabel(e.activity)}</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        step={1}
                        min={1}
                        placeholder="—"
                        value={e.layerNo ?? ""}
                        onChange={(ev) => updateEntry(idx, { layerNo: ev.target.value === "" ? null : Math.trunc(Number(ev.target.value)) })}
                        data-testid={`input-layer-no-${idx}`}
                      />
                    </div>
                    )}
                    <div>
                      <Label>Physical Qty {measurement.measuredUom ? `(${measurement.measuredUom})` : ""}</Label>
                      <Input type="number" inputMode="decimal" value={e.quantity ?? ""} onChange={(ev) => updateQuantity(idx, ev.target.value === "" ? null : Number(ev.target.value))} data-testid={`input-qty-${idx}`} />
                      {measurement.boqQty != null && measurement.boqUom && (
                        <p className="text-xs font-medium text-teal-700 mt-1" data-testid={`text-boq-qty-${idx}`}>
                          BOQ Qty: {measurement.boqQty.toLocaleString(undefined, { maximumFractionDigits: 6 })} {measurement.boqUom}
                        </p>
                      )}
                    </div>
                  </div>
                  {mismatchCalc != null && (
                    <p className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1" data-testid={`text-override-mismatch-${idx}`}>
                      Geometry now computes {mismatchCalc.toFixed(2)} {measurement.measuredUom ?? e.uom} but your entered quantity ({e.quantity}) is kept — it was manually overridden. Update it deliberately if the dimensions changed.
                    </p>
                  )}
                  <div data-testid={`qty-source-block-${idx}`}>
                    {srcState === "calculated" ? (
                      <p className="text-xs text-muted-foreground" data-testid={`text-qty-source-auto-${idx}`}>
                        Quantity source: Calculated from geometry
                      </p>
                    ) : e.quantity != null ? (
                      <>
                        <Label className="text-xs">Quantity source</Label>
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
                    ) : null}
                  </div>
                </>
              );
            })()}
            <div className="space-y-1 border-t pt-2" data-testid={`activity-execution-status-block-${idx}`}>
              {e.boqItemId != null && boqProjectId != null && (
                <ProgrammeBarPicker
                  projectId={boqProjectId} boqItemId={e.boqItemId} dprDate={date}
                  value={e.programmeBarId} autoSelect={e.programmeBarId == null}
                  sideLabel={e.side || null} fromKm={parseChainageKm(e.chainageFrom)}
                  toKm={parseChainageKm(e.chainageTo)} testidPrefix={`guided-${idx}`}
                  onSelect={(bar) => {
                    if (!bar) { updateEntry(idx, { programmeBarId: null, earthworkArrangementId: null }); return; }
                    updateEntry(idx, {
                      programmeBarId: bar.id, earthworkArrangementId: null,
                      ...(bar.chainageFrom != null && !e.chainageFrom ? { chainageFrom: fmtCh(bar.chainageFrom) } : {}),
                      ...(!e.side ? { side: prefillSideFor(bar.side) } : {}),
                    });
                  }}
                />
              )}
              {e.programmeBarId != null && (
                <BarLinkFeedback projectId={boqProjectId} boqItemId={e.boqItemId}
                  programmeBarId={e.programmeBarId} sideKey={sideKeyOf(e.side)} sideLabel={e.side}
                  fromKm={parseChainageKm(e.chainageFrom)} toKm={parseChainageKm(e.chainageTo)}
                  overrideReason={e.chainageOverrideReason} onOverrideReason={(v) => updateEntry(idx, { chainageOverrideReason: v })}
                  boqQty={boqProgressQty(e.quantity, boqItem)} warnOverBalance itemTotals={itemTotals(e.boqItemId)}
                  executedBy={e.executedBy || null} onExecutedBy={(v) => updateEntry(idx, { executedBy: v })}
                  testidPrefix={`guided-${idx}`} />
              )}
              <ChainageOverlapWarning hits={overlapHits.get(idx) ?? []}
                overrideReason={e.chainageOverrideReason} onOverrideReason={(v) => updateEntry(idx, { chainageOverrideReason: v })}
                testidPrefix={`guided-${idx}`} />
            </div>
            {/* Batch 06E: material receipt strip — arrangement-linked bulk
                receipts (site_material_trips) for this activity. Renders only
                where it has meaning (arrangement exists or receipts linked). */}
            <div className="space-y-2 border-t pt-2" data-testid={`activity-material-source-block-${idx}`}>
            {e.boqItemId != null && classifyWorkType(String(itemById.get(e.boqItemId)?.description ?? ""), String(itemById.get(e.boqItemId)?.unit ?? "")) === "roadway_excavation" ? (
              <CutFillOutcomeControls quantity={e.quantity} outcome={e.materialOutcome ?? null} reusableQty={e.reusableQty ?? null}
                onOutcomeChange={(materialOutcome, reusableQty) => updateEntry(idx, { materialOutcome, reusableQty })} />
            ) : usesCutMaterialSource(e.boqItemId) ? (
              <CutFillOutcomeControls fillMode projectId={boqProjectId} arrangementId={e.earthworkArrangementId}
                boqItemDescription={e.boqItemId != null ? String(itemById.get(e.boqItemId)?.description ?? itemById.get(e.boqItemId)?.displayName ?? "") : ""}
                quantity={e.quantity} outcome={null} reusableQty={null} allocations={e.allocations as any}
                currentEntryKey={e.entryKey} formRows={entries as any} boqItems={boqItems}
                onOutcomeChange={() => undefined} onAllocationsChange={allocations => updateEntry(idx, { allocations: allocations as any })} />
            ) : e.boqItemId != null && boqProjectId != null && siteName && (() => {
              const item = itemById.get(e.boqItemId);
              const executedQty = boqProgressQty(e.quantity, item);
              const loc = [e.side ? barSideLabel(e.side) : null, e.chainageFrom && e.chainageTo ? `Ch. ${e.chainageFrom}–${e.chainageTo}` : null].filter(Boolean).join(" ");
              return (
                <ActivityReceiptStrip
                  siteName={siteName}
                  date={date}
                  boqProjectId={boqProjectId}
                  boqItemId={e.boqItemId}
                  programmeBarId={e.programmeBarId}
                  executedQty={executedQty}
                  executedUom={item?.unit ?? e.uom ?? null}
                  locationLabel={loc || null}
                  barPlannedQty={linkedBar?.plannedQty ?? null}
                  persistedArrangementId={e.earthworkArrangementId}
                  onArrangementResolved={(id) => updateEntry(idx, { earthworkArrangementId: id })}
                  activityMaterialHint={item ? boqItemDisplayName(item) : e.activity || null}
                  testIdPrefix={`guided-receipt-${idx}`}
                />
              );
            })()}
            </div>
            <button className="text-xs text-primary flex items-center gap-1" onClick={() => updateEntry(idx, { expanded: !e.expanded })} data-testid={`button-details-${idx}`}>
              {e.expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Add details
            </button>
            {e.expanded && (
              <div className="pt-1">
                <Label>Note</Label>
                <Input value={e.remark} onChange={(ev) => updateEntry(idx, { remark: ev.target.value })} data-testid={`input-note-${idx}`} />
              </div>
            )}
            </>)}
            {/* Task #1409: per-activity photos — Camera / Gallery / File */}
            <div className="pt-1 border-t" data-testid={`activity-resources-block-${idx}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="flex items-center gap-1.5 text-xs"><Camera className="w-3.5 h-3.5" />Photos for this activity</Label>
                <div className="flex gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => { entryPhotoTargetRef.current = e.entryKey; entryCameraRef.current?.click(); }}
                    data-testid={`button-entry-photo-camera-${idx}`}>
                    <Camera className="w-3.5 h-3.5" />Camera
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => { entryPhotoTargetRef.current = e.entryKey; entryGalleryRef.current?.click(); }}
                    data-testid={`button-entry-photo-gallery-${idx}`}>
                    <Plus className="w-3.5 h-3.5" />Gallery
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => { entryPhotoTargetRef.current = e.entryKey; entryFileRef.current?.click(); }}
                    data-testid={`button-entry-photo-file-${idx}`}>
                    <LayoutList className="w-3.5 h-3.5" />File
                  </Button>
                </div>
              </div>
              {(entryPhotos[e.entryKey] ?? []).length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {(entryPhotos[e.entryKey] ?? []).map((f, i) => (
                    <div key={i} className="relative">
                      <img src={URL.createObjectURL(f)} alt={f.name} className="w-14 h-14 object-cover rounded-md border" />
                      <button className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full p-0.5"
                        onClick={() => removeEntryPhoto(e.entryKey, i)}
                        data-testid={`button-remove-entry-photo-${idx}-${i}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        );
      })}

      {/* Batch 06C §7: direct row creation — no BOQ-picker modal */}
      {siteName && (
        <Button variant="outline" className="w-full mb-4" onClick={addBlankEntry} data-testid="button-add-activity-step3">
          <Plus className="w-4 h-4 mr-2" />Add Activity
        </Button>
      )}
      {/* Shared hidden inputs for per-activity photos (one set, routed by
          entryPhotoTargetRef — capture=environment opens the camera). */}
      <input ref={entryCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        data-testid="input-entry-photo-camera"
        onChange={(ev) => { addEntryPhotos(ev.target.files); ev.target.value = ""; }} />
      <input ref={entryGalleryRef} type="file" accept="image/*" multiple className="hidden"
        data-testid="input-entry-photo-gallery"
        onChange={(ev) => { addEntryPhotos(ev.target.files); ev.target.value = ""; }} />
      <input ref={entryFileRef} type="file" accept="image/*" multiple className="hidden"
        data-testid="input-entry-photo-file"
        onChange={(ev) => { addEntryPhotos(ev.target.files); ev.target.value = ""; }} />
      </>)}

      {/* Step 6 — general site photos & remarks (Batch 06C-P: Labour and
          Equipment moved to their own dedicated steps 4 and 5) */}
      {step === 6 && (<>
      {/* Photos */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label className="flex items-center gap-1.5"><Camera className="w-4 h-4" />General site photos</Label>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => photoCameraRef.current?.click()} data-testid="button-add-photos-camera">
                <Camera className="w-3.5 h-3.5" />Camera
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => photoInputRef.current?.click()} data-testid="button-add-photos">
                <Plus className="w-3.5 h-3.5" />Gallery / file
              </Button>
            </div>
            <input ref={photoCameraRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="input-photo-camera" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Photos of a specific activity are better added on that activity's card (previous step).</p>
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

      {/* Remarks stay with general photos on this step */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <Label>Remarks</Label>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} data-testid="input-remarks" />
        </CardContent>
      </Card>
      </>)}

      {/* Step 5 — Equipment (dedicated wizard page, Batch 06C-P §18) */}
      {step === 5 && (
      <Card className="mb-4" data-testid="card-equipment-step">
        <CardContent className="pt-4">
          <div className="space-y-4">
              <div>
                <Label className="mb-1 block font-semibold">Equipment</Label>
                {/* Batch 05: surface open Equipment & Fleet usage for reuse —
                    same linking mechanism as the Detailed DPR, so nothing is
                    typed twice and no duplicate usage record is created. */}
                {unlinkedUsages.length > 0 && (
                  <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-sm" data-testid="panel-open-usages">
                    <p className="font-medium text-amber-800 dark:text-amber-300 mb-1">Equipment usage already recorded today</p>
                    {unlinkedUsages.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-2 py-0.5">
                        <span className="text-amber-900 dark:text-amber-200">
                          {equipmentNameOf(u.equipmentId) ?? `Equipment #${u.equipmentId}`}
                          {u.openingReading != null ? ` · Opening ${u.openingReading}` : ""}
                          {u.startTime ? ` · Start ${u.startTime}` : ""}
                          {u.siteName ? ` · ${u.siteName}` : ""}
                        </span>
                        <Button size="sm" variant="outline" className="shrink-0"
                          onClick={() => setEquipment((p) => (
                            // The panel can briefly render stale query data after
                            // a double click. Link an open usage at most once.
                            p.some((row) => (row.passthrough as any)?.plantUsageId === u.id)
                              ? p
                              : [...p, usageToGuidedRow(u, equipmentNameOf(u.equipmentId) ?? "")]
                          ))}
                          data-testid={`button-use-usage-${u.id}`}>
                          Use in this DPR
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {equipment.map((eq, i) => {
                  const pt = eq.passthrough as Record<string, any>;
                  const linked = pt.plantUsageId != null;
                  const advisory = duplicateUsageAdvisory(eq, openUsages, equipmentNameOf);
                  // Batch 06C-Q: same conditional semantics as Detailed —
                  // entry type is selectable for hired equipment only, and it
                  // drives which usage fields appear. No new enum values.
                  const master = activeEquipmentMaster.find((m: any) => m.id === pt.equipmentId);
                  const isHired = master?.ownership === "hired";
                  const entryType = (pt.entryType as string) || "time_meter";
                  const isTripBased = entryType === "trip_based";
                  const isDailyOrMonthly = entryType === "daily" || entryType === "monthly";
                  // Robustness: a linked/draft row can carry a hired-only
                  // entryType while the master list is still loading (or the
                  // master row was retired) — keep the selector visible so the
                  // stored type is never hidden or silently lost.
                  const showEntryType = isHired || entryType !== "time_meter";
                  const isWaterTanker = isWaterTankerName(eq.machine);
                  const isDirectPurchase = pt.dieselSource === "direct_purchase";
                  return (
                    <div key={i} className="mb-3 p-3 border rounded-lg bg-muted/20 space-y-2 transition-all duration-500" data-dpr-row-key={dprRowKey("equipment", i)} data-testid={"equipment-row-" + String(i)}>
                      <details open className="group">
                      <summary className="cursor-pointer list-none text-xs font-semibold text-muted-foreground after:ml-2 after:content-['Edit_Usage_Details'] group-open:after:content-['Close_Usage_Details']" />
                      {/* A. Identity */}
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        {/* Batch 06C §8: machine comes from the Equipment & Fleet
                            master (same selector as Detailed) — no free-typed
                            machine identity. Selecting sets equipmentId, canonical
                            name, registration and keeps ownership context. */}
                        <Select
                          value={pt.equipmentId != null ? String(pt.equipmentId) : (eq.machine ? OTHER_EQUIPMENT_VALUE : "")}
                          onValueChange={(v) => {
                            if (v === OTHER_EQUIPMENT_VALUE) {
                              setEquipment((p) => p.map((r, j) =>
                                j === i ? applyGuidedEquipmentMasterSelection(r, null) : r));
                              setOtherEquipmentRows((rows) => new Set(rows).add(i));
                              return;
                            }
                            const sel = activeEquipmentMaster.find((m: any) => m.id === Number(v));
                            if (!sel) return;
                            setOtherEquipmentRows((rows) => {
                              const next = new Set(rows);
                              next.delete(i);
                              return next;
                            });
                            setEquipment((p) => p.map((r, j) => {
                              if (j !== i) return r;
                              const selectedRow = applyGuidedEquipmentMasterSelection(r, sel);
                              const nextPt = { ...selectedRow.passthrough } as Record<string, any>;
                              // Same rule as Detailed: owned equipment is always
                              // Time / Meter — trip fields don't apply.
                              if (sel.ownership !== "hired") {
                                nextPt.entryType = "time_meter";
                                delete nextPt.numberOfTrips;
                                delete nextPt.tripDistance;
                                delete nextPt.totalKm;
                              }
                              // 06Q priority 1: same-day already-open Plant
                              // Usage for this equipment (not linked on any
                              // other row) — link it and carry its opening.
                              const open = openUsages.find((u: any) =>
                                u.equipmentId === sel.id &&
                                !p.some((o, k) => k !== j && (o.passthrough as any)?.plantUsageId === u.id));
                              if (open) {
                                nextPt.plantUsageId = open.id;
                                if (open.openingReading != null) nextPt.openingReading = open.openingReading;
                              }
                              return { ...selectedRow, passthrough: nextPt };
                            }));
                            // 06Q priority 2: otherwise the canonical resolver —
                            // latest valid closing strictly before this DPR's
                            // date. Applied only if the row still shows this
                            // equipment (stale guard), is unlinked, and the
                            // opening is blank (manual entries are never
                            // overwritten).
                            // If this machine's open usage is already linked on
                            // another row, this new row remains unlinked and is
                            // eligible for canonical continuity (not a duplicate
                            // link to that usage).
                            const hasOpen = !!open;
                            if (!hasOpen && date) {
                              // Inclusive continuity is deliberate: a same-day
                              // prior Site/Plant segment is the correct opening.
                              fetchLatestPriorClosing(sel.id, date, { inclusive: true }).then((latest) => {
                                if (latest.closingReading == null) return;
                                setEquipment((p) => p.map((r, j) => {
                                  // Only the row this selection happened on —
                                  // never other rows that share the machine.
                                  if (j !== i) return r;
                                  const pt = r.passthrough as Record<string, any>;
                                  if (pt?.equipmentId !== sel.id) return r;
                                  if (pt.plantUsageId != null) return r;
                                  if (pt.openingReading !== undefined && pt.openingReading !== null && pt.openingReading !== "") return r;
                                  return { ...r, passthrough: { ...pt, openingReading: latest.closingReading } };
                                }));
                              });
                            }
                          }}
                        >
                          <SelectTrigger data-testid={`select-eq-machine-${i}`}>
                            <SelectValue placeholder="Select equipment…">
                              {eq.machine || undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {activeEquipmentMaster.map((m: any) => (
                              <SelectItem key={m.id} value={String(m.id)}>
                                {m.name} {m.registrationNumber ? `(${m.registrationNumber})` : ""} — {m.ownership === "hired" ? `HIRED: ${m.vendorName ?? ""}` : "HLC OWN"}
                              </SelectItem>
                            ))}
                            <SelectItem value={OTHER_EQUIPMENT_VALUE}>Other / Unlisted equipment</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEquipment((p) => p.filter((_, j) => j !== i));
                          setOtherEquipmentRows((rows) => new Set(
                            Array.from(rows).filter((j) => j !== i).map((j) => j > i ? j - 1 : j),
                          ));
                        }}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                      {pt.equipmentId == null && (otherEquipmentRows.has(i) || !!eq.machine) && (
                        <Input
                          value={eq.machine}
                          onChange={(e) => setEquipment((p) => p.map((r, j) =>
                            j === i
                              ? { ...r, machine: e.target.value, passthrough: { ...r.passthrough, equipmentId: null } }
                              : r))}
                          placeholder="Enter equipment name"
                          aria-label="Other / Unlisted equipment name"
                          data-testid={`input-eq-machine-other-${i}`}
                        />
                      )}
                      {eq.vehicleNo && (
                        <p className="text-xs text-muted-foreground" data-testid={`text-eq-reg-${i}`}>Reg: {eq.vehicleNo}</p>
                      )}
                      {linked && (() => {
                        const usage = openUsages.find((u) => u.id === pt.plantUsageId);
                        const handoff = usage && openUsageHandoffContext(usage);
                        return handoff ? <p className="text-xs text-blue-700 dark:text-blue-300">{handoff}</p> : null;
                      })()}
                      {/* Deployment / Usage Type — hired equipment only, same
                          stored entryType values as Detailed */}
                      {showEntryType && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <Label className="text-xs text-muted-foreground">Deployment / Usage Type</Label>
                            <Select
                              value={entryType}
                              onValueChange={(v) => {
                                setEquipment((p) => p.map((r, j) => {
                                  if (j !== i) return r;
                                  const nextPt = { ...r.passthrough, entryType: v } as Record<string, any>;
                                  if (v !== "trip_based") {
                                    delete nextPt.numberOfTrips;
                                    delete nextPt.tripDistance;
                                    delete nextPt.totalKm;
                                  }
                                  return { ...r, passthrough: nextPt };
                                }));
                              }}
                            >
                              <SelectTrigger data-testid={`select-eq-entry-type-${i}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="time_meter">Time / Meter Reading</SelectItem>
                                <SelectItem value="hourly">Hourly Hire</SelectItem>
                                <SelectItem value="daily">Daily Hire</SelectItem>
                                <SelectItem value="trip_based">Trip Based</SelectItem>
                                <SelectItem value="monthly">Monthly Hire</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {isDailyOrMonthly && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 mt-4" data-testid={`badge-eq-entry-type-${i}`}>
                              {entryType === "daily" ? "DAILY HIRE" : "MONTHLY HIRE"}
                            </Badge>
                          )}
                        </div>
                      )}
                      {/* B. Work */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Operator</Label>
                          <Input placeholder="Operator name" value={eq.operator} onChange={(ev) => setEquipment((p) => p.map((r, j) => j === i ? { ...r, operator: ev.target.value } : r))} data-testid={`input-eq-operator-${i}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Task</Label>
                          <Input placeholder="Task" value={eq.task} onChange={(ev) => setEquipment((p) => p.map((r, j) => j === i ? { ...r, task: ev.target.value } : r))} data-testid={`input-eq-task-${i}`} />
                        </div>
                      </div>
                      {/* Batch 06C §11: optional Work Item linkage (same fields as
                          Detailed — boqItemId; structure link is preserved on
                          round-trip and cleared when the item changes). */}
                      <div>
                        <Label className="text-xs text-muted-foreground">Work item (optional)</Label>
                        <Select
                          value={pt.boqItemId != null ? String(pt.boqItemId) : "none"}
                          onValueChange={(v) => {
                            setEquipment((p) => p.map((r, j) => {
                              if (j !== i) return r;
                              const nextPt = { ...r.passthrough } as Record<string, any>;
                              if (v === "none") { delete nextPt.boqItemId; nextPt.structureId = null; }
                              else { nextPt.boqItemId = Number(v); nextPt.structureId = null; }
                              return { ...r, passthrough: nextPt };
                            }));
                          }}
                        >
                          <SelectTrigger data-testid={`select-eq-workitem-${i}`}><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {boqItems.map((item) => (
                              <SelectItem key={item.id} value={String(item.id)}>{boqItemDisplayName(item)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* C. Usage — time/meter fields hidden for Trip Based rows
                          (type-driven presentation); any previously entered
                          values stay preserved in the passthrough bag. */}
                      {!isTripBased && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Opening{linked ? " (from plant — locked)" : ""}</Label>
                          <Input type="number" inputMode="decimal" placeholder="Reading" value={pt.openingReading ?? ""} readOnly={linked}
                            className={linked ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300" : ""}
                            onChange={(ev) => { if (!linked) setPassthroughField(i, "openingReading", ev.target.value, true); }}
                            data-testid={`input-eq-opening-${i}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Closing</Label>
                          <Input type="number" inputMode="decimal" placeholder="Reading" value={pt.closingReading ?? ""}
                            onChange={(ev) => setPassthroughField(i, "closingReading", ev.target.value, true)}
                            data-testid={`input-eq-closing-${i}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Start time</Label>
                          <Input type="time" value={pt.startTime ?? ""}
                            onChange={(ev) => setPassthroughField(i, "startTime", ev.target.value, false)}
                            data-testid={`input-eq-start-${i}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">End time</Label>
                          <Input type="time" value={pt.endTime ?? ""}
                            onChange={(ev) => setPassthroughField(i, "endTime", ev.target.value, false)}
                            data-testid={`input-eq-end-${i}`} />
                        </div>
                      </div>
                      )}
                      {/* Trip Based — same fields and round-trip km rule as Detailed */}
                      {isTripBased && (
                        <div className="grid grid-cols-3 gap-2" data-testid={`section-eq-trip-${i}`}>
                          <div>
                            <Label className="text-xs text-muted-foreground">No. of Trips</Label>
                            <Input type="number" inputMode="numeric" placeholder="0" value={pt.numberOfTrips ?? ""}
                              onChange={(ev) => {
                                setEquipment((p) => p.map((r, j) => {
                                  if (j !== i) return r;
                                  const nextPt = { ...r.passthrough } as Record<string, any>;
                                  if (ev.target.value === "") delete nextPt.numberOfTrips; else nextPt.numberOfTrips = parseInt(ev.target.value);
                                  const km = computeTripTotalKm(nextPt.numberOfTrips, nextPt.tripDistance);
                                  if (km > 0) nextPt.totalKm = km; else delete nextPt.totalKm;
                                  return { ...r, passthrough: nextPt };
                                }));
                              }}
                              data-testid={`input-eq-trips-${i}`} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Trip Distance (km)</Label>
                            <Input type="number" inputMode="decimal" placeholder="One-way" value={pt.tripDistance ?? ""}
                              onChange={(ev) => {
                                setEquipment((p) => p.map((r, j) => {
                                  if (j !== i) return r;
                                  const nextPt = { ...r.passthrough } as Record<string, any>;
                                  if (ev.target.value === "") delete nextPt.tripDistance; else nextPt.tripDistance = parseFloat(ev.target.value);
                                  const km = computeTripTotalKm(nextPt.numberOfTrips, nextPt.tripDistance);
                                  if (km > 0) nextPt.totalKm = km; else delete nextPt.totalKm;
                                  return { ...r, passthrough: nextPt };
                                }));
                              }}
                              data-testid={`input-eq-trip-distance-${i}`} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Total KM (round trip)</Label>
                            <div className="bg-primary/10 px-3 py-2 rounded border border-primary/20 font-semibold text-primary text-sm" data-testid={`display-eq-total-km-${i}`}>
                              {computeTripTotalKm(pt.numberOfTrips, pt.tripDistance) > 0 ? `${computeTripTotalKm(pt.numberOfTrips, pt.tripDistance).toFixed(1)} km` : "-"}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Water tanker — same special fields as Detailed */}
                      {isWaterTanker && (
                        <div className="grid grid-cols-2 gap-2" data-testid={`section-eq-water-${i}`}>
                          <div>
                            <Label className="text-xs text-muted-foreground">Water Quantity (Litres)</Label>
                            <Input type="number" inputMode="decimal" placeholder="0" value={pt.waterQuantity ?? ""}
                              onChange={(ev) => setPassthroughField(i, "waterQuantity", ev.target.value, true)}
                              data-testid={`input-eq-water-qty-${i}`} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">No. of Trips</Label>
                            <Input type="number" inputMode="numeric" placeholder="0" value={pt.numberOfTrips ?? ""}
                              onChange={(ev) => setPassthroughField(i, "numberOfTrips", ev.target.value, true)}
                              data-testid={`input-eq-water-trips-${i}`} />
                          </div>
                        </div>
                      )}
                      {/* D. Fuel — same stored fields (diesel / dieselSource /
                          purchase details) as Detailed; purchase details are
                          hidden but preserved when the source changes. */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Diesel (Litres)</Label>
                          <Input type="number" inputMode="decimal" placeholder="0" value={pt.diesel ?? ""}
                            onChange={(ev) => setPassthroughField(i, "diesel", ev.target.value, true)}
                            data-testid={`input-eq-diesel-${i}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Diesel Source</Label>
                          <Select
                            value={(pt.dieselSource as string) ?? ""}
                            onValueChange={(v) => setEquipment((p) => p.map((r, j) => j === i ? { ...r, passthrough: { ...r.passthrough, dieselSource: v } } : r))}
                          >
                            <SelectTrigger data-testid={`select-eq-diesel-source-${i}`}><SelectValue placeholder="Select diesel source" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="plant_stock">Plant Stock</SelectItem>
                              <SelectItem value="direct_purchase">Direct Site Purchase</SelectItem>
                              <SelectItem value="contractor">Contractor</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {isDirectPurchase && (
                        <div className="grid grid-cols-3 gap-2" data-testid={`section-eq-purchase-${i}`}>
                          <div>
                            <Label className="text-xs text-muted-foreground">Fuel Station</Label>
                            <Input placeholder="HP / BPCL" value={pt.fuelStation ?? ""}
                              onChange={(ev) => setPassthroughField(i, "fuelStation", ev.target.value.toUpperCase(), false)}
                              className="uppercase" data-testid={`input-eq-fuel-station-${i}`} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Bill No.</Label>
                            <Input placeholder="Receipt #" value={pt.billNumber ?? ""}
                              onChange={(ev) => setPassthroughField(i, "billNumber", ev.target.value.toUpperCase(), false)}
                              className="uppercase" data-testid={`input-eq-bill-number-${i}`} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Amount (Rs)</Label>
                            <Input type="number" inputMode="decimal" placeholder="0" value={pt.amountPaid ?? ""}
                              onChange={(ev) => setPassthroughField(i, "amountPaid", ev.target.value, true)}
                              data-testid={`input-eq-amount-paid-${i}`} />
                          </div>
                        </div>
                      )}
                      {advisory && (
                        <p className="text-xs text-amber-700 dark:text-amber-400" data-testid={`text-eq-dup-advisory-${i}`}>{advisory}</p>
                      )}
                      </details>
                      <DprEquipmentCompact
                        row={{ ...pt, machine: eq.machine, vehicleNo: eq.vehicleNo }}
                        equipment={master}
                        index={i}
                        beforeDate={date}
                        site={siteName}
                        onChange={(patch) => setEquipment((rows) => rows.map((row, rowIndex) => rowIndex === i
                          ? { ...row, passthrough: { ...row.passthrough, ...patch } } : row))}
                      />
                      <BreakdownStoppageEditor
                        value={(pt.breakdowns ?? []) as StagedBreakdown[]}
                        onChange={(breakdowns) => setEquipment(rows => rows.map((row, rowIndex) =>
                          rowIndex === i ? { ...row, passthrough: { ...row.passthrough, breakdowns } } : row,
                        ))}
                        testId={`guided-equipment-breakdown-${i}`}
                      />
                    </div>
                  );
                })}
                {computeTotalDiesel(equipment.map((e) => e.passthrough)) > 0 && (
                  <p className="text-sm font-semibold text-primary mb-2" data-testid="text-total-diesel">
                    Total Diesel: {computeTotalDiesel(equipment.map((e) => e.passthrough)).toFixed(3)} L
                  </p>
                )}
                <Button variant="outline" size="sm" onClick={() => setEquipment((p) => [...p, newGuidedEquipmentRow()])} data-testid="button-add-equipment">
                  <Plus className="w-3.5 h-3.5 mr-1" />Add Equipment
                </Button>
              </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Step 4 — Labour (dedicated wizard page, Batch 06C-P §16) */}
      {step === 4 && (
      <Card className="mb-4" data-testid="card-labour-step">
        <CardContent className="pt-4">
          <div className="space-y-4">
              <div>
                <Label className="mb-1 block font-semibold">Labour</Label>
                {labour.map((l, i) => (
                  <div key={i} className="mb-3 space-y-1.5 transition-all duration-500" data-dpr-row-key={dprRowKey("labour", i)} data-testid={"labour-row-" + String(i)}>
                    <div className="grid grid-cols-[1fr_90px_70px_auto] gap-2">
                      <Select value={l.category} onValueChange={(v) => setLabour((p) => p.map((r, j) => j === i ? { ...r, category: v } : r))}>
                        <SelectTrigger data-testid={`select-labour-cat-${i}`}><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>{LABOUR_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                      {/* Batch 06C §12: gender is a real field, same as Detailed */}
                      <Select value={l.gender} onValueChange={(v) => setLabour((p) => p.map((r, j) => j === i ? { ...r, gender: v } : r))}>
                        <SelectTrigger data-testid={`select-labour-gender-${i}`}><SelectValue placeholder="Gender" /></SelectTrigger>
                        <SelectContent>{GENDER_OPTIONS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" placeholder="Nos" value={l.count ?? ""} onChange={(ev) => setLabour((p) => p.map((r, j) => j === i ? { ...r, count: ev.target.value === "" ? null : Number(ev.target.value) } : r))} data-testid={`input-labour-count-${i}`} />
                      <Button variant="ghost" size="icon" onClick={() => setLabour((p) => p.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Agency / contractor" value={l.contractor} onChange={(ev) => setLabour((p) => p.map((r, j) => j === i ? { ...r, contractor: ev.target.value } : r))} data-testid={`input-labour-contractor-${i}`} />
                      <Input placeholder="Task (e.g. RE-CLEARING VEGETATION)" value={l.task} onChange={(ev) => setLabour((p) => p.map((r, j) => j === i ? { ...r, task: ev.target.value } : r))} data-testid={`input-labour-task-${i}`} />
                    </div>
                    {/* Batch 06C §13: optional Work Item linkage — blank for
                        No Site Work crews, a BOQ item for billable work. */}
                    <Select
                      value={l.boqItemId != null ? String(l.boqItemId) : "none"}
                      onValueChange={(v) => setLabour((p) => p.map((r, j) => j === i
                        ? { ...r, boqItemId: v === "none" ? null : Number(v), structureId: null }
                        : r))}
                    >
                      <SelectTrigger data-testid={`select-labour-workitem-${i}`}><SelectValue placeholder="Work item (optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No work item</SelectItem>
                        {boqItems.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>{boqItemDisplayName(item)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setLabour((p) => [...p, newLabourRow()])} data-testid="button-add-labour">
                  <Plus className="w-3.5 h-3.5 mr-1" />Add Labour
                </Button>
              </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Step 7 — review & submit */}
      {step === 7 && (
      <Card className="mb-4" data-testid="card-review">
        <CardContent className="pt-4 space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-0.5">Report</p>
            <p className="text-muted-foreground">{date} · {siteName || "No site"} · {engineer || "No engineer"}</p>
          </div>
          <div>
            <p className="font-semibold mb-1">Activities ({entries.length})</p>
            {entries.length === 0 && <p className="text-muted-foreground">None — go back to add today's work.</p>}
            <div className="space-y-1.5">
              {entries.map((e, idx) => {
                const complete = guidedEntryComplete(e);
                const photoCount = (entryPhotos[e.entryKey] ?? []).length;
                const item = e.boqItemId != null ? itemById.get(e.boqItemId) ?? null : null;
                const measurement = dprMeasurementSummary(
                  {
                    length: null,
                    chainageFrom: e.chainageFrom,
                    chainageTo: e.chainageTo,
                    width: e.width,
                    thickness: e.thickness,
                    quantity: e.quantity,
                    uom: e.uom,
                  },
                  item,
                );
                const quantityText = measurement.measuredQty != null
                  ? [
                      `Physical ${measurement.measuredQty.toLocaleString(undefined, { maximumFractionDigits: 6 })}${measurement.measuredUom ? ` ${measurement.measuredUom}` : ""}`,
                      measurement.boqQty != null && measurement.boqUom
                        ? `BOQ ${measurement.boqQty.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${measurement.boqUom}`
                        : null,
                    ].filter(Boolean).join(" · ")
                  : "No quantity";
                return (
                  <div key={e.entryKey} className="border rounded-md px-3 py-2" data-testid={`review-entry-${idx}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{e.activity || "Unnamed activity"}</p>
                      {complete
                        ? <Badge variant="secondary" className="shrink-0">Ready</Badge>
                        : <Badge variant="destructive" className="shrink-0">Incomplete</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {e.noSiteWork
                        ? `No site work${e.noSiteWorkDescription ? ` — ${e.noSiteWorkDescription}` : ""}`
                        : [
                            e.isIncidental ? "Incidental / Non-BOQ · No BOQ Credit" : null,
                            e.side || null,
                            e.chainageFrom && e.chainageTo ? `Ch ${e.chainageFrom}–${e.chainageTo}` : "No chainage",
                            e.layerNo != null ? layerDisplayName(e.activity, e.layerNo) : null,
                            quantityText,
                          ].filter(Boolean).join(" · ")}
                      {photoCount > 0 ? ` · ${photoCount} photo${photoCount > 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Batch 06C-P §24: Labour and Equipment summarised separately */}
          <div>
            <p className="font-semibold mb-0.5">Labour</p>
            <p className="text-muted-foreground" data-testid="review-labour">
              {labour.filter((l) => l.category).length === 0 ? "No labour recorded" : labour.filter((l) => l.category).map((l) => `${l.category}${l.count != null ? ` × ${l.count}` : ""}`).join(" · ")}
            </p>
          </div>
          <div>
            <p className="font-semibold mb-0.5">Equipment</p>
            <p className="text-muted-foreground" data-testid="review-equipment">
              {equipment.filter((e) => e.machine).length === 0 ? "No equipment recorded" : equipment.filter((e) => e.machine).map((e) => e.machine).join(" · ")}
            </p>
          </div>
          {unmanagedSectionsRef.current.materials.length > 0 && (
            <div>
              <p className="font-semibold mb-1">Materials from Detailed DPR</p>
              <p className="text-xs text-muted-foreground mb-2">
                Guided DPR preserves these rows, but material corrections are made in Detailed DPR.
              </p>
              <div className="space-y-1.5">
                {unmanagedSectionsRef.current.materials.map((material: any, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 border rounded-md px-3 py-2 transition-all duration-500"
                    data-dpr-row-key={dprRowKey("materials", idx)}
                    data-testid={`materials-row-${idx}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{material.material || `Material row ${idx + 1}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {material.quantity != null ? material.quantity : "No quantity"} {material.uom || ""}
                      </p>
                    </div>
                    {draftId != null && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setLocation(`/site/edit/${draftId}?draft&rowSection=materials&rowIndex=${idx}&returnTo=${encodeURIComponent(returnTo)}`)}
                        data-testid={`button-edit-guided-material-${idx}`}
                      >
                        Edit in Detailed DPR
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="font-semibold mb-0.5">Photos</p>
            <p className="text-muted-foreground" data-testid="review-photos">
              {stagedPhotos.length} general photo{stagedPhotos.length === 1 ? "" : "s"}{Object.values(entryPhotos).reduce((n, l) => n + l.length, 0) > 0 ? ` · ${Object.values(entryPhotos).reduce((n, l) => n + l.length, 0)} activity photo(s)` : ""}
            </p>
          </div>
          {remarks.trim() && (
            <div>
              <p className="font-semibold mb-0.5">Remarks</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{remarks}</p>
            </div>
          )}
          {!entriesComplete && entries.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="text-review-incomplete">
              Some activities are incomplete — go back to Details to finish them, or save a draft.
            </p>
          )}
        </CardContent>
      </Card>
      )}

      {/* Sticky action bar — Batch 06C-Q §19: the app shell has a fixed
          224px sidebar on md+ (md:pl-56), so the bar must start after it
          (md:left-56) or its centered inner container drifts left relative
          to the page body, which centers inside the content area. */}
      <div className="fixed bottom-0 left-0 right-0 md:left-56 bg-white dark:bg-slate-950 border-t p-3 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          {step > 1 && (
            <Button variant="outline" className="min-w-[96px]" onClick={() => setStep((s) => (s - 1) as GuidedStepId)} data-testid="button-step-back">
              Back
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1"
            disabled={saveMutation.isPending}
            onClick={() => { if (validateHeader()) saveMutation.mutate(true); }}
            data-testid="button-save-draft"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Draft"}
          </Button>
          {step < 7 && (
            <Button
              className="flex-1"
              onClick={() => {
                const blocker = guidedStepBlocker(step, { siteName, engineer, entryCount: entries.length });
                if (blocker) { toast({ title: "Not yet", description: blocker, variant: "destructive" }); return; }
                setStep((s) => (s + 1) as GuidedStepId);
              }}
              data-testid="button-step-next"
            >
              Next
            </Button>
          )}
          {step === 7 && (
          <Button
            className="flex-1"
            disabled={saveMutation.isPending || !entriesComplete}
            onClick={() => {
              if (!validateHeader() || !validateForSubmit()) return;
              // Batch 04: one consolidated readiness panel before Final Submit.
              const r = evaluateDprSubmitReadiness({
                workType: "road",
                progress: entries.map((e) => ({ activity: e.activity, boqItemId: e.boqItemId, noSiteWork: e.noSiteWork, chainageFrom: e.chainageFrom, chainageTo: e.chainageTo, quantity: e.quantity })),
                equipment: equipment.filter((e) => e.machine).map((e) => buildGuidedEquipmentPayload(e)) as any[],
                labour: labour as any[],
                materials: unmanagedSectionsRef.current.materials as any[],
              });
              if (r.mandatory.length > 0 || r.advisories.length > 0) { setReadiness(r); return; }
              saveMutation.mutate(false);
            }}
            data-testid="button-submit"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Submit DPR</>}
          </Button>
          )}
        </div>
        {step === 7 && !entriesComplete && entries.length > 0 && (
          <p className="max-w-3xl mx-auto text-xs text-muted-foreground mt-1.5" data-testid="text-submit-hint">
            Enter chainage from/to and quantity for every activity (or mark it No site work) to submit — or save a draft and finish later.
          </p>
        )}
      </div>

      {/* Batch 04: consolidated submit-readiness panel */}
      <DprReadinessDialog
        readiness={readiness}
        onClose={() => setReadiness(null)}
        onSubmitAnyway={() => { if (validateForSubmit()) saveMutation.mutate(false); }}
        onSaveDraft={() => { if (validateHeader()) saveMutation.mutate(true); }}
        onMandatoryIssue={jumpToReadinessIssue}
      />

      {/* Batch 06V: confirm changing a credited row to incidental */}
      <Dialog open={incidentalConfirm != null} onOpenChange={(v) => { if (!v) setIncidentalConfirm(null); }}>
        <DialogContent data-testid="dialog-incidental-confirm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Change to Incidental / Non-BOQ?
            </DialogTitle>
            <DialogDescription>
              This row currently has a credited quantity of{" "}
              <strong>{incidentalConfirm?.qty} {incidentalConfirm?.uom}</strong>.
              Marking it Incidental / Non-BOQ means it will <strong>no longer count toward BOQ credit</strong>,
              but the measurements are kept on record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIncidentalConfirm(null)} data-testid="button-incidental-confirm-cancel">
              Keep as credited
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (incidentalConfirm != null) { setIncidental(incidentalConfirm.idx, true); setIncidentalConfirm(null); }
              }}
              data-testid="button-incidental-confirm-ok"
            >
              Yes, mark as incidental
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

    </div>
  );
}
