/**
 * shared/dprSubmitReadiness.ts — Batch 04: the ONE submit-readiness rule for
 * DPR Final Submit, consumed identically by:
 *  - Guided DPR (client pre-submit panel)
 *  - Detailed DPR / SiteEntry (client pre-submit panel)
 *  - SiteEdit draft-completion (client pre-submit panel)
 *  - server POST /api/dprs (non-draft) and POST /api/dprs/:id/submit
 *
 * DESIGN RULES (see Batch 04 risk note):
 *  - Draft save is NEVER gated by this module — callers simply don't run it
 *    for drafts. Drafts are intentionally incomplete.
 *  - MANDATORY issues are conservative: only unambiguous incompleteness on a
 *    row the engineer deliberately created (opening reading without closing,
 *    start time without end time, selected activity with no quantity, labour
 *    with category but no count, material with no quantity/UOM).
 *  - Ambiguous cases without a valid resolution path are ADVISORY only. In
 *    particular a machine selected with NO usage evidence at all stays
 *    advisory until a proper "Not used / Released" outcome workflow exists.
 *  - Fully blank placeholder rows are ignored entirely (no false positives).
 */

export type DprReadinessSection = "activities" | "equipment" | "labour" | "materials";

export type DprReadinessIssue = {
  section: DprReadinessSection;
  /** short row label, e.g. the activity or machine name */
  label: string;
  message: string;
  /**
   * 06X: zero-based index of the row within its section array (activities,
   * equipment, labour, or materials). Populated by evaluateDprSubmitReadiness
   * for every mandatory issue so the client can highlight the exact row.
   * Optional — absent on issues produced outside this function (e.g. chainage
   * overlap issues from chainageOverlapReadinessIssues).
   */
  rowIndex?: number;
  /**
   * Stable row reference emitted by validators that already own their own row
   * identity (currently the chainage-overlap guard). Numeric keys can be used
   * as a rowIndex fallback by DPR forms.
   */
  rowKey?: string | number;
};

export type DprReadinessResult = {
  ready: boolean;
  mandatory: DprReadinessIssue[];
  advisories: DprReadinessIssue[];
};

type ProgressRowLike = {
  activity?: string | null;
  boqItemId?: number | null;
  noSiteWork?: boolean | null;
  noSiteWorkDescription?: string | null;
  isIncidental?: boolean | null;
  incidentalDescription?: string | null;
  chainageFrom?: string | null;
  chainageTo?: string | null;
  quantity?: number | null;
};

type EquipmentRowLike = {
  machine?: string | null;
  entryType?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  openingReading?: number | null;
  closingReading?: number | null;
  numberOfTrips?: number | null;
  tripDistance?: number | null;
  totalKm?: number | null;
  hoursWorked?: number | null;
  diesel?: number | null;
  /** water tankers record delivery volume instead of trips/meter readings */
  waterQuantity?: number | null;
};

type LabourRowLike = {
  category?: string | null;
  count?: number | null;
  task?: string | null;
  contractor?: string | null;
};

type MaterialRowLike = {
  material?: string | null;
  quantity?: number | null;
  uom?: string | null;
};

export type DprReadinessInput = {
  workType?: string | null;
  progress?: ProgressRowLike[] | null;
  equipment?: EquipmentRowLike[] | null;
  labour?: LabourRowLike[] | null;
  materials?: MaterialRowLike[] | null;
};

const pos = (v: unknown): boolean => v != null && Number.isFinite(Number(v)) && Number(v) > 0;
const hasText = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

/** Any evidence the machine was actually used today. */
export function equipmentHasUsage(e: EquipmentRowLike): boolean {
  return (
    e.openingReading != null ||
    e.closingReading != null ||
    hasText(e.startTime) ||
    hasText(e.endTime) ||
    pos(e.numberOfTrips) ||
    pos(e.tripDistance) ||
    pos(e.totalKm) ||
    pos(e.hoursWorked) ||
    pos(e.diesel) ||
    pos(e.waterQuantity)
  );
}

export function evaluateDprSubmitReadiness(input: DprReadinessInput): DprReadinessResult {
  const mandatory: DprReadinessIssue[] = [];
  const advisories: DprReadinessIssue[] = [];

  // A — selected/added activities must carry an outcome.
  for (let i = 0; i < (input.progress ?? []).length; i++) {
    const p = (input.progress ?? [])[i];
    if (p?.noSiteWork) {
      const label = (p.activity || "No Site Work").toString().trim();
      if (!hasText(p.noSiteWorkDescription)) {
        mandatory.push({ section: "activities", label, message: "reason required for No Site Work", rowIndex: i });
      }
      continue;
    }
    const selected = hasText(p?.activity) || p?.boqItemId != null;
    if (!selected) continue; // blank placeholder row — ignore
    const label = (p.activity || `BOQ item ${p.boqItemId}`).toString().trim();
    if (p.isIncidental && !hasText(p.incidentalDescription)) {
      mandatory.push({
        section: "activities",
        label,
        message: "description required for Incidental / Non-BOQ Work",
        rowIndex: i,
      });
    }
    if (!pos(p.quantity)) {
      mandatory.push({
        section: "activities",
        label,
        message: "quantity missing — enter the measured quantity (or remove the activity if no work was done)",
        rowIndex: i,
      });
    }
    // Half-filled chainage is unambiguous incompleteness; both blank is left
    // to the existing screen-specific rules (structure DPRs have no chainage).
    const hasFrom = hasText(p.chainageFrom);
    const hasTo = hasText(p.chainageTo);
    if (hasFrom !== hasTo) {
      mandatory.push({ section: "activities", label, message: "chainage is incomplete — enter both From and To", rowIndex: i });
    }
  }

  // B — equipment closure.
  for (let i = 0; i < (input.equipment ?? []).length; i++) {
    const e = (input.equipment ?? [])[i];
    if (!hasText(e?.machine)) continue; // blank placeholder row
    const label = (e.machine as string).trim();
    const usage = equipmentHasUsage(e);
    if (e.openingReading != null && e.closingReading == null) {
      mandatory.push({ section: "equipment", label, message: "closing meter reading required", rowIndex: i });
    } else if (e.closingReading != null && e.openingReading == null) {
      mandatory.push({ section: "equipment", label, message: "opening meter reading missing", rowIndex: i });
    }
    if (hasText(e.startTime) && !hasText(e.endTime)) {
      mandatory.push({ section: "equipment", label, message: "end time required", rowIndex: i });
    } else if (hasText(e.endTime) && !hasText(e.startTime)) {
      mandatory.push({ section: "equipment", label, message: "start time missing", rowIndex: i });
    }
    // Water tankers legitimately record only a delivered water quantity —
    // never force the trip pair on them (false-positive guard).
    if (e.entryType === "trip_based" && !pos(e.waterQuantity) && (pos(e.numberOfTrips) !== pos(e.tripDistance))) {
      mandatory.push({ section: "equipment", label, message: "trip entry incomplete — enter both number of trips and trip distance", rowIndex: i });
    }
    if (!usage) {
      // No explicit "Not used" outcome exists yet — advisory only (Batch 04
      // risk rule). Do NOT hard-block or invent zero hours.
      advisories.push({
        section: "equipment",
        label,
        message: `${label} is selected but no usage was recorded — confirm whether it was not used`,
      });
    }
  }

  // C — labour rows must not masquerade as completed records.
  for (let i = 0; i < (input.labour ?? []).length; i++) {
    const l = (input.labour ?? [])[i];
    const touched = hasText(l?.category) || pos(l?.count) || hasText(l?.task) || hasText(l?.contractor);
    if (!touched) continue; // blank placeholder row
    const label = hasText(l.category) ? (l.category as string).trim() : "Labour row";
    if (!hasText(l.category)) {
      mandatory.push({ section: "labour", label, message: "labour category missing", rowIndex: i });
    }
    if (!pos(l.count)) {
      mandatory.push({ section: "labour", label, message: "labour count must be a positive number", rowIndex: i });
    }
  }

  // D — material rows.
  for (let i = 0; i < (input.materials ?? []).length; i++) {
    const m = (input.materials ?? [])[i];
    if (!hasText(m?.material)) continue; // blank placeholder row
    const label = (m.material as string).trim();
    if (!pos(m.quantity)) mandatory.push({ section: "materials", label, message: "material quantity missing", rowIndex: i });
    // UOM is not reliably enforced by existing material conventions —
    // missing UOM stays ADVISORY (false-positive guard).
    if (!hasText(m.uom)) advisories.push({ section: "materials", label, message: `${label}: UOM not specified — consider adding it` });
  }

  return { ready: mandatory.length === 0, mandatory, advisories };
}
