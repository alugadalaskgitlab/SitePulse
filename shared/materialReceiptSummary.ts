// ============================================================
// Batch 06E — Material Receipt ↔ Arrangement ↔ DPR linkage seam
// ============================================================
// Single shared brain for:
//   1. which Execution Arrangements apply to a DPR activity (prefill rules);
//   2. "Required Today" source priority (NO prorating, NO invented factors);
//   3. Received aggregation from active site_material_trips (mixed-UoM safe);
//   4. Required / Received / Executed comparison with comparability gate.
//
// Guided DPR, Detailed DPR and future reports must all use these helpers —
// do not scatter separate formulas (spec 06E §24).
//
// Executed quantity is NOT computed here: callers pass the existing DPR
// BOQ-credit value (physical × conversion factor — shared/dprGeometry.ts /
// shared/progressReport.ts semantics). This module never invents another
// execution formula.

// ---------- Arrangement types ----------

export type ArrangementType =
  | "fully_outsourced_composite"
  | "vendor_material_delivered"
  | "hlc_source_outsourced_execution"
  | "hlc_in_house"
  | "client_supplied"
  | "reused_excavated"
  | "not_decided";

/** How relevant an external material receipt is for each arrangement type. */
export type ReceiptRelevance =
  | "primary" // vendor delivery receipt is the key evidence
  | "evidence" // delivery evidence useful, but payment basis likely executed work
  | "context" // receipts may exist (client supplied) but are NOT an HLC payable
  | "none"; // do not prompt for an external supplier receipt

export function receiptRelevanceForType(type: string | null | undefined): ReceiptRelevance {
  switch (type) {
    case "vendor_material_delivered":
      return "primary";
    case "fully_outsourced_composite":
    case "hlc_source_outsourced_execution":
      return "evidence";
    case "client_supplied":
      return "context";
    case "reused_excavated":
      return "none";
    case "hlc_in_house":
    case "not_decided":
    default:
      return "evidence";
  }
}

/** Likely FUTURE billing evidence basis per arrangement type (analysis only —
 * no bill calculation is performed anywhere in this batch). */
export function likelyBillingBasisForType(type: string | null | undefined): string {
  switch (type) {
    case "vendor_material_delivered":
      return "delivered-material";
    case "fully_outsourced_composite":
      return "executed-work (composite/manual measurement possible)";
    case "hlc_source_outsourced_execution":
      return "executed-work";
    case "hlc_in_house":
      return "hourly/equipment (not vendor-billed)";
    case "client_supplied":
      return "no HLC vendor payable";
    case "reused_excavated":
      return "no external supplier receipt";
    default:
      return "undetermined";
  }
}

// ---------- Arrangement resolution ----------

/** Statuses in which an arrangement is operationally applicable to receipts. */
export const APPLICABLE_ARRANGEMENT_STATUSES = [
  "approved",
  "mobilisation_pending",
  "in_progress",
] as const;

export interface ApplicableArrangementInput {
  id: number;
  status: string;
  arrangementType?: string | null;
  boqProjectId: number;
  boqItemId?: number | null;
  boqItemAllocations?: Array<{ boqItemId?: number | null }> | null;
  agencyName?: string | null;
  materialLabel?: string | null;
}

export interface ArrangementBarAllocation {
  arrangementId: number;
  programmeBarId: number;
  boqItemId?: number | null;
  allocatedQty?: number | null;
}

export interface ArrangementResolution<T extends ApplicableArrangementInput> {
  /** All applicable arrangements for the activity context. */
  applicable: T[];
  /** Prefill this one iff exactly one applies. Never guess between vendors. */
  prefill: T | null;
  /** Multiple applicable — a controlled selector is required. */
  requiresSelection: boolean;
  /** None applicable — receipt still allowed, show "No execution arrangement linked". */
  none: boolean;
}

function arrangementCoversItem(a: ApplicableArrangementInput, boqItemId: number): boolean {
  if (a.boqItemId != null) return a.boqItemId === boqItemId;
  const allocs = Array.isArray(a.boqItemAllocations) ? a.boqItemAllocations : [];
  if (allocs.length === 0) return false; // multi-item arrangement with no allocations: don't guess
  return allocs.some((al) => Number(al?.boqItemId) === boqItemId);
}

/**
 * Conservative resolution: same project + covers the BOQ item + applicable
 * status. When a programmeBarId is given AND bar allocations narrow the set,
 * prefer arrangements explicitly allocated to that bar.
 */
export function resolveApplicableArrangements<T extends ApplicableArrangementInput>(
  arrangements: T[],
  ctx: { boqProjectId: number; boqItemId: number; programmeBarId?: number | null },
  barAllocations?: ArrangementBarAllocation[],
): ArrangementResolution<T> {
  let applicable = arrangements.filter(
    (a) =>
      a.boqProjectId === ctx.boqProjectId &&
      (APPLICABLE_ARRANGEMENT_STATUSES as readonly string[]).includes(a.status) &&
      arrangementCoversItem(a, ctx.boqItemId),
  );
  if (ctx.programmeBarId != null && barAllocations && barAllocations.length > 0) {
    const allocatedIds = new Set(
      barAllocations.filter((al) => al.programmeBarId === ctx.programmeBarId).map((al) => al.arrangementId),
    );
    const narrowed = applicable.filter((a) => allocatedIds.has(a.id));
    if (narrowed.length > 0) applicable = narrowed;
  }
  return {
    applicable,
    prefill: applicable.length === 1 ? applicable[0] : null,
    requiresSelection: applicable.length > 1,
    none: applicable.length === 0,
  };
}

// ---------- Required Today ----------

export type RequiredSource =
  | "arrangement_allocation"
  | "day_programme"
  | "bom_requirement"
  | "not_determined";

export interface RequiredTodayInput {
  /** Arrangement programme allocation qty for THIS bar/activity, if one exists. */
  arrangementAllocationQty?: number | null;
  /** A genuinely day-specific programme quantity, if SitePulse already has one. */
  dayProgrammeQty?: number | null;
  /** A reliable material requirement from an existing BOM/demand resolver. */
  bomRequirementQty?: number | null;
  /** UoM accompanying whichever source supplied the qty. */
  uom?: string | null;
}

export interface RequiredTodayResult {
  requiredQty: number | null;
  requiredUom: string | null;
  requiredSource: RequiredSource;
}

/**
 * Approved priority (06E correction): allocation → day-specific programme →
 * BOM requirement → Not determined. A multi-day bar's total plannedQty must
 * NEVER be divided by days here — if that's all that exists, it is shown by
 * the UI as bar context only, not as Required Today.
 */
export function resolveRequiredToday(input: RequiredTodayInput): RequiredTodayResult {
  const pick = (qty: number | null | undefined, source: RequiredSource): RequiredTodayResult | null =>
    qty != null && Number.isFinite(qty) && qty > 0
      ? { requiredQty: qty, requiredUom: input.uom ?? null, requiredSource: source }
      : null;
  return (
    pick(input.arrangementAllocationQty, "arrangement_allocation") ??
    pick(input.dayProgrammeQty, "day_programme") ??
    pick(input.bomRequirementQty, "bom_requirement") ?? {
      requiredQty: null,
      requiredUom: null,
      requiredSource: "not_determined",
    }
  );
}

// ---------- Received aggregation ----------

export interface ReceiptTripLike {
  quantity: number;
  uom: string;
  isCancelled?: boolean | null;
  isDeleted?: boolean | null;
}

export interface ReceivedAggregate {
  /** Trips counted (active only). */
  tripCount: number;
  /** Single-UoM total, or null when UoMs are mixed (never silently combined). */
  receivedQty: number | null;
  receivedUom: string | null;
  /** Per-UoM breakdown — always populated; the only view when mixed. */
  byUom: Array<{ uom: string; qty: number; trips: number }>;
  mixedUoms: boolean;
}

export function normaliseUom(uom: string | null | undefined): string {
  return String(uom ?? "").trim().toUpperCase();
}

export function aggregateReceived(trips: ReceiptTripLike[]): ReceivedAggregate {
  const active = trips.filter((t) => !t.isCancelled && !t.isDeleted);
  const byUomMap = new Map<string, { uom: string; qty: number; trips: number }>();
  for (const t of active) {
    const key = normaliseUom(t.uom);
    const row = byUomMap.get(key) ?? { uom: t.uom?.trim() || key, qty: 0, trips: 0 };
    row.qty += Number(t.quantity) || 0;
    row.trips += 1;
    byUomMap.set(key, row);
  }
  const byUom = Array.from(byUomMap.values());
  const mixedUoms = byUom.length > 1;
  return {
    tripCount: active.length,
    receivedQty: byUom.length === 1 ? byUom[0].qty : null,
    receivedUom: byUom.length === 1 ? byUom[0].uom : null,
    byUom,
    mixedUoms,
  };
}

// ---------- Required / Received / Executed summary ----------

export interface ReceiptComparisonInput extends RequiredTodayResult {
  received: ReceivedAggregate;
  /** Executed BOQ qty from the EXISTING DPR credit semantics (physical × factor). */
  executedQty: number | null;
  executedUom: string | null;
}

export interface ReceiptComparison {
  requiredQty: number | null;
  requiredUom: string | null;
  requiredSource: RequiredSource;
  receivedQty: number | null;
  receivedUom: string | null;
  executedQty: number | null;
  executedUom: string | null;
  comparable: boolean;
  comparisonReason: string;
  /** Only set when comparable: receivedQty − requiredQty. */
  varianceToRequired: number | null;
  /** Only set when comparable: receivedQty − executedQty ("Received less Executed"). */
  receivedLessExecuted: number | null;
}

export const COMPARISON_BASES_DIFFER =
  "Comparison only — receipt and BOQ measurement bases differ.";

/**
 * Numerical variance is calculated ONLY when every present quantity shares one
 * UoM. Mixed receipt UoMs, or a receipt UoM differing from the BOQ UoM, show
 * quantities separately with no variance (no invented conversions — 06E §8).
 */
export function buildReceiptComparison(input: ReceiptComparisonInput): ReceiptComparison {
  const { received } = input;
  const base = {
    requiredQty: input.requiredQty,
    requiredUom: input.requiredUom,
    requiredSource: input.requiredSource,
    receivedQty: received.receivedQty,
    receivedUom: received.receivedUom,
    executedQty: input.executedQty,
    executedUom: input.executedUom,
  };
  if (received.mixedUoms) {
    return { ...base, comparable: false, comparisonReason: "Receipts use mixed UoMs — quantities shown separately.", varianceToRequired: null, receivedLessExecuted: null };
  }
  const uoms = [input.requiredUom, received.receivedUom, input.executedUom]
    .filter((u): u is string => u != null && u !== "")
    .map(normaliseUom);
  const present = [input.requiredQty, received.receivedQty, input.executedQty].filter((q) => q != null);
  if (present.length < 2 || uoms.length < 2) {
    return { ...base, comparable: false, comparisonReason: "Not enough comparable quantities.", varianceToRequired: null, receivedLessExecuted: null };
  }
  const allSame = uoms.every((u) => u === uoms[0]);
  if (!allSame) {
    return { ...base, comparable: false, comparisonReason: COMPARISON_BASES_DIFFER, varianceToRequired: null, receivedLessExecuted: null };
  }
  const varianceToRequired =
    received.receivedQty != null && input.requiredQty != null
      ? Number((received.receivedQty - input.requiredQty).toFixed(3))
      : null;
  const receivedLessExecuted =
    received.receivedQty != null && input.executedQty != null
      ? Number((received.receivedQty - input.executedQty).toFixed(3))
      : null;
  return { ...base, comparable: true, comparisonReason: "Same measurement basis.", varianceToRequired, receivedLessExecuted };
}

// ---------- Existing-receipt suggestion ----------

export interface SuggestableTrip extends ReceiptTripLike {
  id: number;
  date: string;
  site: string;
  material: string;
  supplier?: string | null;
  boqProjectId?: number | null;
  boqItemId?: number | null;
  programmeBarId?: number | null;
  earthworkArrangementId?: number | null;
}

export interface ReceiptMatchContext {
  siteName: string;
  date: string;
  boqProjectId?: number | null;
  boqItemId?: number | null;
  programmeBarId?: number | null;
  earthworkArrangementId?: number | null;
  materialLabel?: string | null;
}

export type ReceiptMatchStrength = "linked" | "suggested";

/**
 * Conservative matching (06E §13):
 * - "linked": stable IDs already prove the relationship (same arrangement, or
 *   same BOQ item — and bar when both sides have one) → safe to display as
 *   authoritative for the activity.
 * - "suggested": same site + date + material only → shown as a suggestion the
 *   user must confirm. NEVER auto-linked from supplier/material text alone.
 */
export function classifyReceiptMatch(trip: SuggestableTrip, ctx: ReceiptMatchContext): ReceiptMatchStrength | null {
  if (trip.isCancelled || trip.isDeleted) return null;
  if (trip.site !== ctx.siteName || trip.date !== ctx.date) return null;
  const idLinked =
    (ctx.earthworkArrangementId != null && trip.earthworkArrangementId === ctx.earthworkArrangementId) ||
    (ctx.boqItemId != null &&
      trip.boqItemId === ctx.boqItemId &&
      (ctx.programmeBarId == null || trip.programmeBarId == null || trip.programmeBarId === ctx.programmeBarId));
  if (idLinked) return "linked";
  const materialMatches =
    ctx.materialLabel != null &&
    trip.material.trim().toLowerCase() === ctx.materialLabel.trim().toLowerCase();
  if (materialMatches && trip.boqItemId == null && trip.earthworkArrangementId == null) return "suggested";
  return null;
}
