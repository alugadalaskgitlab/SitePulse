// Batch 06E — compact material-receipt strip for a billable DPR activity.
// Shows: applicable Execution Arrangement, Required today (approved priority,
// NO prorating), Received today (active linked site_material_trips), Executed
// (existing DPR credit passed in by the caller) — plus View Receipts and
// Record Receipt (which creates a REAL Site Material Trip via the existing
// endpoint; never a DPR-only duplicate record).
//
// Used by Guided DPR (Step 3 activity cards) and Detailed DPR (read parity).
// All quantity/matching rules live in shared/materialReceiptSummary.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Truck, ImagePlus, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AttachmentGallery } from "@/components/AttachmentGallery";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SiteMaterialTrip } from "@shared/schema";
import {
  aggregateReceived,
  buildReceiptComparison,
  classifyReceiptMatch,
  receiptRelevanceForType,
  resolveApplicableArrangements,
  resolveRequiredToday,
  COMPARISON_BASES_DIFFER,
  type ArrangementBarAllocation,
  type SuggestableTrip,
} from "@shared/materialReceiptSummary";
import { findDailyFulfilmentForItem, fulfilmentLabel } from "@shared/requirementFulfilment";

const UOM_OPTIONS = ["CFT", "MT", "Cum", "Liters", "Trips", "Kgs", "Tons"];

interface ArrangementRow {
  id: number;
  status: string;
  arrangementType?: string | null;
  boqProjectId: number;
  boqItemId?: number | null;
  boqItemAllocations?: Array<{ boqItemId?: number | null }> | null;
  agencyName?: string | null;
  materialLabel?: string | null;
  workDescription?: string | null;
  uom?: string | null;
  agreedRate?: number | null;
  allocatedQty?: number | null;
}

export interface ActivityReceiptStripProps {
  siteName: string;
  date: string; // yyyy-MM-dd
  boqProjectId: number;
  boqItemId: number;
  programmeBarId?: number | null;
  /** Existing DPR BOQ-credit quantity for this activity row (physical × factor). */
  executedQty?: number | null;
  executedUom?: string | null;
  /** e.g. "RHS Ch. 2+000–2+150" — prefills unloading location. */
  locationLabel?: string | null;
  /** Bar planned total across its whole window — shown as CONTEXT only. */
  barPlannedQty?: number | null;
  /** Priority-2/3 Required Today feeds. SitePulse currently has NO
      day-specific programme quantity and no per-day BOM resolver, so callers
      pass nothing today and the strip correctly shows "Not determined" when
      no arrangement allocation exists. These props are the wiring point if a
      genuine day-level resolver is added later — never a prorated bar total. */
  dayProgrammeQty?: number | null;
  bomRequirementQty?: number | null;
  /** Detailed DPR passes true: read-only display (View Receipts only). */
  readOnly?: boolean;
  testIdPrefix: string;
}

export function ActivityReceiptStrip(props: ActivityReceiptStripProps) {
  const { siteName, date, boqProjectId, boqItemId, programmeBarId, readOnly, testIdPrefix } = props;
  const { toast } = useToast();
  const { uploadFile } = useUpload();
  const [viewOpen, setViewOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [selectedArrangementId, setSelectedArrangementId] = useState<number | null>(null);

  const { data: arrangements = [] } = useQuery<ArrangementRow[]>({
    queryKey: ["earthwork-arrangements-item", boqProjectId, boqItemId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${boqProjectId}/earthwork-arrangements/item/${boqItemId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: allocations = [] } = useQuery<ArrangementBarAllocation[]>({
    queryKey: ["arrangement-programme-allocations", boqProjectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${boqProjectId}/arrangement-programme-allocations`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: dayTrips = [] } = useQuery<SiteMaterialTrip[]>({
    queryKey: ["/api/site-material-trips", siteName, date],
    queryFn: async () => {
      const res = await fetch(`/api/site-material-trips?site=${encodeURIComponent(siteName)}&dateFrom=${date}&dateTo=${date}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!siteName && !!date,
  });

  // 06G: today's PM daily allocation (fulfilment) for this activity's BOQ
  // item. Operational display context only — governs today's supplier
  // suggestion; NEVER mutates the standing arrangement.
  const { data: sitesList = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/sites"],
  });
  const stripSiteId = useMemo(() => sitesList.find((s) => s.name === siteName)?.id ?? null, [sitesList, siteName]);
  const { data: dayRequirements = [] } = useQuery<any[]>({
    queryKey: ["/api/site-requirements", "daily-fulfilment", stripSiteId, date],
    queryFn: async () => {
      const res = await fetch(`/api/site-requirements?siteId=${stripSiteId}&dateFrom=${date}&dateTo=${date}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: stripSiteId != null && !!date,
    staleTime: 30_000,
  });
  const dailyFulfilment = useMemo(
    () => findDailyFulfilmentForItem(dayRequirements, boqItemId),
    [dayRequirements, boqItemId],
  );

  const resolution = useMemo(
    () => resolveApplicableArrangements(arrangements, { boqProjectId, boqItemId, programmeBarId }, allocations),
    [arrangements, boqProjectId, boqItemId, programmeBarId, allocations],
  );
  // Operational resolution priority (06G §3):
  //  1. today's daily fulfilment naming a specific arrangement;
  //  2. exact-bar/single standing arrangement prefill;
  //  3. Engineer's controlled selection when several genuinely apply.
  const dailyArrangement =
    dailyFulfilment?.entry.fulfilmentType === "arrangement" && dailyFulfilment.entry.arrangementId != null
      ? arrangements.find((a) => a.id === dailyFulfilment.entry.arrangementId) ?? null
      : null;
  const arrangement =
    dailyArrangement ??
    resolution.prefill ??
    (selectedArrangementId != null ? resolution.applicable.find((a) => a.id === selectedArrangementId) ?? null : null);
  const relevance = receiptRelevanceForType(arrangement?.arrangementType);
  // Non-arrangement daily overrides for TODAY's supplier display:
  const dailyOverride =
    dailyFulfilment?.entry.fulfilmentType === "other_agency" || dailyFulfilment?.entry.fulfilmentType === "hlc"
      ? dailyFulfilment.entry
      : null;

  const ctx = {
    siteName,
    date,
    boqProjectId,
    boqItemId,
    programmeBarId: programmeBarId ?? null,
    earthworkArrangementId: arrangement?.id ?? null,
    materialLabel: arrangement?.materialLabel ?? null,
  };
  const linkedTrips = useMemo(
    () => dayTrips.filter((t) => classifyReceiptMatch(t as unknown as SuggestableTrip, ctx) === "linked"),
    [dayTrips, siteName, date, boqItemId, programmeBarId, arrangement?.id],
  );
  const suggestedTrips = useMemo(
    () => dayTrips.filter((t) => classifyReceiptMatch(t as unknown as SuggestableTrip, ctx) === "suggested"),
    [dayTrips, siteName, date, boqItemId, programmeBarId, arrangement?.id, arrangement?.materialLabel],
  );

  // Required today — approved priority. Only an arrangement bar allocation
  // qualifies as an authoritative planned requirement here; a multi-day bar
  // total is context, never divided by days.
  const barAllocation = useMemo(
    () =>
      arrangement && programmeBarId != null
        ? allocations.find((al) => al.arrangementId === arrangement.id && al.programmeBarId === programmeBarId) ?? null
        : null,
    [allocations, arrangement, programmeBarId],
  );
  const required = resolveRequiredToday({
    arrangementAllocationQty: barAllocation?.allocatedQty ?? null,
    dayProgrammeQty: props.dayProgrammeQty ?? null,
    bomRequirementQty: props.bomRequirementQty ?? null,
    uom: arrangement?.uom ?? null,
  });
  const received = useMemo(() => aggregateReceived(linkedTrips), [linkedTrips]);
  const comparison = buildReceiptComparison({
    ...required,
    received,
    executedQty: props.executedQty ?? null,
    executedUom: props.executedUom ?? null,
  });

  // 06G: only hide when receipt evidence is genuinely NOT applicable for the
  // resolved arrangement type (e.g. reused excavated material) and nothing is
  // linked. Having no arrangement is NOT a reason to hide — the Engineer
  // still needs "Received today: 0" context before the first truck arrives.
  if (relevance === "none" && linkedTrips.length === 0 && suggestedTrips.length === 0) return null;

  const fmt = (q: number | null | undefined, u?: string | null) =>
    q == null ? "—" : `${Number(q.toFixed ? q.toFixed(2) : q)} ${u ?? ""}`.trim();

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm" data-testid={`${testIdPrefix}-receipt-strip`}>
      <div className="flex items-center gap-2 font-medium">
        <Truck className="w-4 h-4 text-muted-foreground" />
        <span>Material receipt</span>
        {dailyOverride ? (
          <Badge variant="secondary" data-testid={`${testIdPrefix}-daily-override-badge`}>
            Today: {fulfilmentLabel(dailyOverride)}
          </Badge>
        ) : arrangement ? (
          <Badge variant="secondary" data-testid={`${testIdPrefix}-arrangement-badge`}>
            {arrangement.agencyName || "Arrangement"} · {arrangement.materialLabel}
            {dailyArrangement ? " · today's allocation" : ""}
          </Badge>
        ) : (
          <Badge variant="outline" data-testid={`${testIdPrefix}-no-arrangement-badge`}>HLC / Main Contractor — no execution arrangement</Badge>
        )}
        {dailyOverride && arrangement && (
          <Badge variant="outline" className="text-[10px]" data-testid={`${testIdPrefix}-standing-context-badge`}>
            Standing: {arrangement.agencyName || "Arrangement"}
          </Badge>
        )}
        {arrangement?.arrangementType === "client_supplied" && (
          <Badge variant="outline">Client supplied — not an HLC payable</Badge>
        )}
      </div>

      {resolution.requiresSelection && dailyArrangement == null && !readOnly && (
        <div>
          <Label className="text-xs">Multiple arrangements apply — select one</Label>
          <Select value={selectedArrangementId != null ? String(selectedArrangementId) : ""} onValueChange={(v) => setSelectedArrangementId(Number(v))}>
            <SelectTrigger data-testid={`${testIdPrefix}-arrangement-select`}><SelectValue placeholder="Select arrangement…" /></SelectTrigger>
            <SelectContent>
              {resolution.applicable.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.agencyName || `Arrangement #${a.id}`} — {a.materialLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Required today</p>
          <p data-testid={`${testIdPrefix}-required-qty`}>
            {required.requiredQty != null ? fmt(required.requiredQty, required.requiredUom) : "Not determined"}
          </p>
          {required.requiredQty == null && props.barPlannedQty != null && (
            <p className="text-[11px] text-muted-foreground" data-testid={`${testIdPrefix}-bar-context`}>
              Bar planned total: {fmt(props.barPlannedQty, props.executedUom)} (whole bar, not per day)
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Received today</p>
          <p data-testid={`${testIdPrefix}-received-qty`}>
            {received.mixedUoms
              ? received.byUom.map((r) => `${r.qty} ${r.uom}`).join(" + ")
              : received.receivedQty != null
                ? `${fmt(received.receivedQty, received.receivedUom)} · ${received.tripCount} trip${received.tripCount === 1 ? "" : "s"}`
                : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Executed</p>
          <p data-testid={`${testIdPrefix}-executed-qty`}>{fmt(props.executedQty, props.executedUom)}</p>
        </div>
      </div>

      {comparison.comparable ? (
        <p className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-variance`}>
          {comparison.varianceToRequired != null && (
            <>Variance to requirement: {comparison.varianceToRequired > 0 ? "+" : ""}{comparison.varianceToRequired} {comparison.receivedUom} · </>
          )}
          {comparison.receivedLessExecuted != null && (
            <>Received less Executed: {comparison.receivedLessExecuted > 0 ? "+" : ""}{comparison.receivedLessExecuted} {comparison.receivedUom}</>
          )}
        </p>
      ) : (
        (received.tripCount > 0 || props.executedQty != null) && (
          <p className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-no-variance-note`}>{COMPARISON_BASES_DIFFER}</p>
        )
      )}

      {suggestedTrips.length > 0 && !readOnly && (
        <SuggestionBlock trips={suggestedTrips} ctx={ctx} testIdPrefix={testIdPrefix} />
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setViewOpen(true)} data-testid={`${testIdPrefix}-view-receipts`}>
          View Receipts{linkedTrips.length > 0 ? ` (${linkedTrips.length})` : ""}
        </Button>
        {!readOnly && relevance !== "none" && (
          <Button variant="outline" size="sm" onClick={() => setRecordOpen(true)} data-testid={`${testIdPrefix}-record-receipt`}>
            Record Receipt
          </Button>
        )}
      </div>

      <ViewReceiptsDialog open={viewOpen} onOpenChange={setViewOpen} trips={linkedTrips} testIdPrefix={testIdPrefix} />
      {!readOnly && (
        <RecordReceiptDialog
          open={recordOpen}
          onOpenChange={setRecordOpen}
          props={props}
          arrangement={arrangement}
          dailyOverride={dailyOverride}
          dailyMaterialName={dailyFulfilment?.materialName ?? null}
          received={received}
          uploadFile={uploadFile}
          toast={toast}
          testIdPrefix={testIdPrefix}
        />
      )}
    </div>
  );
}

function SuggestionBlock({ trips, ctx, testIdPrefix }: { trips: SiteMaterialTrip[]; ctx: any; testIdPrefix: string }) {
  const { toast } = useToast();
  const linkMutation = useMutation({
    mutationFn: async (tripId: number) => {
      const res = await apiRequest("PATCH", `/api/site-material-trips/${tripId}`, {
        boqProjectId: ctx.boqProjectId ?? undefined,
        boqItemId: ctx.boqItemId ?? undefined,
        programmeBarId: ctx.programmeBarId ?? undefined,
        earthworkArrangementId: ctx.earthworkArrangementId ?? undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-material-trips", ctx.siteName, ctx.date] });
      toast({ title: "Receipt linked", description: "The existing receipt is now linked to this activity." });
    },
    onError: (e: any) => toast({ title: "Could not link receipt", description: e?.message ?? "You may not have permission to edit receipts.", variant: "destructive" }),
  });
  return (
    <div className="rounded border border-dashed p-2 space-y-1" data-testid={`${testIdPrefix}-suggestions`}>
      <p className="text-xs font-medium">
        {trips.length} matching receipt{trips.length === 1 ? "" : "s"} already recorded today
      </p>
      {trips.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
          <span>{t.time ?? ""} · {t.material} · {t.quantity} {t.uom}{t.vehicleNumber ? ` · ${t.vehicleNumber}` : ""}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2" disabled={linkMutation.isPending} onClick={() => linkMutation.mutate(t.id)} data-testid={`${testIdPrefix}-link-trip-${t.id}`}>
            Link
          </Button>
        </div>
      ))}
    </div>
  );
}

function ViewReceiptsDialog({ open, onOpenChange, trips, testIdPrefix }: { open: boolean; onOpenChange: (v: boolean) => void; trips: SiteMaterialTrip[]; testIdPrefix: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Linked Site Receipts</DialogTitle></DialogHeader>
        {trips.length === 0 && <p className="text-sm text-muted-foreground">No receipts linked to this activity today.</p>}
        {trips.map((t) => (
          <div key={t.id} className="rounded border p-2 text-sm space-y-1" data-testid={`${testIdPrefix}-receipt-${t.id}`}>
            <div className="flex justify-between">
              <span className="font-medium">{t.material} · {t.quantity} {t.uom}</span>
              <span className="text-muted-foreground text-xs">{t.time ?? ""}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.supplier ?? "—"}{t.vehicleNumber ? ` · ${t.vehicleNumber}` : ""}{t.receiptNumber ? ` · Challan ${t.receiptNumber}` : ""}{t.location ? ` · ${t.location}` : ""}
            </p>
            <AttachmentGallery moduleType="site_material_trip" linkedRecordId={t.id} allowDelete={false} />
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}

function RecordReceiptDialog({ open, onOpenChange, props, arrangement, dailyOverride, received, uploadFile, toast, testIdPrefix }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  props: ActivityReceiptStripProps;
  arrangement: ArrangementRow | null;
  /** 06G: today's non-arrangement daily allocation (other_agency | hlc). */
  dailyOverride: { fulfilmentType?: string | null; agencyNameSnapshot?: string | null } | null;
  /** Material name from the matched daily-fulfilment requirement line —
   * fallback when no standing arrangement resolves a material label. */
  dailyMaterialName: string | null;
  /** Today's aggregate for this activity — running total inside the dialog. */
  received: ReturnType<typeof aggregateReceived>;
  uploadFile: (file: File) => Promise<{ objectPath: string } | null>;
  toast: any;
  testIdPrefix: string;
}) {
  const [form, setForm] = useState({
    time: format(new Date(), "HH:mm"),
    vehicleNumber: "",
    quantity: "",
    uom: arrangement?.uom || "Cum",
    receiptNumber: "",
    location: props.locationLabel ?? "",
    notes: "",
  });
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([]);
  const [sessionTrips, setSessionTrips] = useState(0);
  const vehicleRef = useRef<HTMLInputElement | null>(null);

  // Fresh time whenever the dialog opens; reset the session counter.
  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, time: format(new Date(), "HH:mm") }));
      setSessionTrips(0);
    }
  }, [open]);

  // 06G §4: today's operational supplier. Daily override governs display;
  // other_agency must NEVER carry the standing earthworkArrangementId.
  const supplierToday =
    dailyOverride?.fulfilmentType === "other_agency"
      ? (dailyOverride.agencyNameSnapshot ?? "")
      : dailyOverride?.fulfilmentType === "hlc"
        ? "HLC (Internal)"
        : arrangement?.arrangementType === "client_supplied"
          ? (arrangement?.agencyName ? `${arrangement.agencyName} (client supplied)` : "Client supplied")
          : arrangement?.agencyName ?? "";
  const arrangementIdForTrip = dailyOverride ? undefined : arrangement?.id ?? undefined;

  const createMutation = useMutation({
    mutationFn: async () => {
      // The EXISTING Site Material Trip transaction — prefilled context, the
      // engineer supplies only the actual evidence. No DPR-only duplicate.
      const res = await apiRequest("POST", "/api/site-material-trips", {
        date: props.date,
        time: form.time,
        site: props.siteName,
        material: arrangement?.materialLabel || dailyMaterialName || "",
        supplier: supplierToday,
        vehicleNumber: form.vehicleNumber,
        quantity: parseFloat(form.quantity) || 0,
        uom: form.uom,
        location: form.location,
        receiptNumber: form.receiptNumber,
        notes: form.notes,
        workType: "road",
        boqProjectId: props.boqProjectId,
        boqItemId: props.boqItemId,
        programmeBarId: props.programmeBarId ?? undefined,
        earthworkArrangementId: arrangementIdForTrip,
      });
      return res.json();
    },
    onSuccess: async (trip: any) => {
      for (const file of stagedPhotos) {
        const uploadResponse = await uploadFile(file);
        if (!uploadResponse) continue;
        try {
          await apiRequest("POST", "/api/attachments", {
            moduleType: "site_material_trip",
            linkedRecordId: trip.id,
            fileName: file.name,
            objectPath: uploadResponse.objectPath,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
          });
        } catch {
          toast({ title: "Some photos failed to attach", description: file.name, variant: "destructive" });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/site-material-trips", props.siteName, props.date] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-material-trips"] });
      // 06G rapid repeat-trip mode: the dialog STAYS OPEN. Keep all context;
      // clear only the truck-specific fields; refresh time; focus vehicle no.
      setStagedPhotos([]);
      setForm((f) => ({
        ...f,
        vehicleNumber: "",
        quantity: "",
        receiptNumber: "",
        notes: "",
        time: format(new Date(), "HH:mm"),
      }));
      setSessionTrips((n) => n + 1);
      toast({ title: "Trip added", description: "Saved and linked. Ready for the next truck." });
      setTimeout(() => vehicleRef.current?.focus(), 50);
    },
    onError: (e: any) => toast({ title: "Could not record receipt", description: e?.message ?? "Check your Site Materials permission.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Record Material Receipt</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground space-y-0.5" data-testid={`${testIdPrefix}-rr-context`}>
            <p><span className="font-medium text-foreground">{props.siteName}</span> · {props.date}</p>
            {props.locationLabel && <p>Reach: {props.locationLabel}</p>}
            {(arrangement?.materialLabel || dailyMaterialName) && <p>Material: {arrangement?.materialLabel || dailyMaterialName}</p>}
            {supplierToday && <p>Supplier today: <span className="font-medium text-foreground">{supplierToday}</span></p>}
            {dailyOverride ? (
              <p>Today's allocation: {dailyOverride.fulfilmentType === "hlc" ? "HLC / Internally Arranged" : "Other agency — daily exception"}{arrangement ? ` (standing: ${arrangement.agencyName ?? "arrangement"})` : ""}</p>
            ) : arrangement ? (
              <p>Execution Arrangement: {arrangement.agencyName ?? "—"}{arrangement.workDescription ? ` — ${arrangement.workDescription}` : ""}</p>
            ) : (
              <p>HLC / Main Contractor — no execution arrangement</p>
            )}
          </div>
          <p className="text-xs font-medium" data-testid={`${testIdPrefix}-rr-today-total`}>
            Today so far for this activity:{" "}
            {received.tripCount === 0
              ? "no trips yet"
              : received.mixedUoms
                ? `${received.tripCount} trips · ${received.byUom.map((r) => `${r.qty} ${r.uom}`).join(" + ")}`
                : `${received.tripCount} trip${received.tripCount === 1 ? "" : "s"} · ${received.receivedQty ?? 0} ${received.receivedUom ?? ""}`}
            {sessionTrips > 0 && <span className="text-muted-foreground"> ({sessionTrips} this session)</span>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Arrival time</Label>
              <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} data-testid={`${testIdPrefix}-rr-time`} />
            </div>
            <div>
              <Label className="text-xs">Vehicle number</Label>
              <Input ref={vehicleRef} value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value.toUpperCase() })} data-testid={`${testIdPrefix}-rr-vehicle`} />
            </div>
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input type="number" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-testid={`${testIdPrefix}-rr-quantity`} />
            </div>
            <div>
              <Label className="text-xs">UoM</Label>
              <Select value={form.uom} onValueChange={(v) => setForm({ ...form, uom: v })}>
                <SelectTrigger data-testid={`${testIdPrefix}-rr-uom`}><SelectValue /></SelectTrigger>
                <SelectContent>{UOM_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Challan / receipt no.</Label>
              <Input value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} data-testid={`${testIdPrefix}-rr-challan`} />
            </div>
            <div>
              <Label className="text-xs">Unloading location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} data-testid={`${testIdPrefix}-rr-location`} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid={`${testIdPrefix}-rr-notes`} />
          </div>
          <div>
            <Label className="text-xs">Photos / challan images</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {stagedPhotos.map((f, i) => (
                <div key={i} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button onClick={() => setStagedPhotos((p) => p.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                </div>
              ))}
              <label className="flex items-center gap-1 rounded border border-dashed px-2 py-1 text-xs cursor-pointer">
                <ImagePlus className="w-3.5 h-3.5" /> Add
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).filter((f) => f.size <= 15 * 1024 * 1024);
                    setStagedPhotos((p) => [...p, ...files]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid={`${testIdPrefix}-rr-done`}>
            {sessionTrips > 0 ? "Done / Close" : "Cancel"}
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.quantity || parseFloat(form.quantity) <= 0}
            data-testid={`${testIdPrefix}-rr-save`}
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Add Trip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
