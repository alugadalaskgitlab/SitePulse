/**
 * Batch 06J — Tomorrow Plan execution outcome + carry-forward seam.
 *
 * This is the ONLY module defining outcome/carry-forward rules for
 * site_requirements. Persistence is purely JSONB (allocationStatus) —
 * NO DB schema change:
 *
 *   allocationStatus.executionOutcome = {
 *     outcome: 'executed'|'partly_executed'|'deferred'|'cancelled',
 *     reason, remarks, updatedByName, updatedAt,
 *     carriedForwardTo: { requirementId, date } | null,
 *   }
 *   allocationStatus.carriedForwardFrom = { requirementId, date }   // new plan
 *   allocationStatus.previousAllocationReference = [...]            // marked reference,
 *     // NEVER treated as today's confirmed allocation.
 *
 * Non-goals (spec §20-22): never blocks DPR creation, never creates a DPR,
 * never mutates execution arrangements or programme allocations.
 */
import { newLineKey, type AllocationEntryLike, findAllocationEntry } from "./requirementFulfilment";
import { entryBoqCredit, type ReportEntry, type ReportBoqItem } from "./progressReport";
import { applyCarryToPlannedWork } from "./plannedWork";

/**
 * 06J-HF: the site operational day, NOT the UTC calendar date. The client
 * uses the browser's local date; the server must agree. Site operations run
 * on India time, so the business day is resolved in Asia/Kolkata.
 */
export function businessToday(tz: string = "Asia/Kolkata", at?: Date): string {
  // en-CA locale formats as YYYY-MM-DD. `at` is injectable for tests.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at ?? new Date());
}

export type ExecutionOutcome = "executed" | "partly_executed" | "deferred" | "cancelled";

export const OUTCOME_LABELS: Record<ExecutionOutcome, string> = {
  executed: "Executed",
  partly_executed: "Partly Executed",
  deferred: "Not Started / Deferred",
  cancelled: "Not Required / Cancelled",
};

export const DEFERRAL_REASONS = [
  "Rain / weather",
  "Site not available",
  "Vendor unavailable",
  "Equipment unavailable / breakdown",
  "Labour shortage",
  "Material not available",
  "Department / client instruction",
  "Access / traffic issue",
  "Other",
] as const;

export type CarryForwardMode = "tomorrow" | "date" | "none";

export interface OutcomeInput {
  outcome: ExecutionOutcome;
  reason?: string | null;
  remarks?: string | null;
  carryForward?: {
    mode: CarryForwardMode;
    targetDate?: string | null; // yyyy-MM-dd, required for mode 'date'
    carryQty?: number | null;   // optional plannedWork qty override
  } | null;
}

export type OutcomeValidation = { ok: true } | { ok: false; code: string; message: string };

const OUTCOME_VALUES: ExecutionOutcome[] = ["executed", "partly_executed", "deferred", "cancelled"];

/** Reasons are mandatory for deferred + cancelled (spec §3, §13). */
export function validateOutcomeInput(input: OutcomeInput, planDate: string, todayStr: string): OutcomeValidation {
  if (!OUTCOME_VALUES.includes(input.outcome)) {
    return { ok: false, code: "INVALID_OUTCOME", message: "Unknown outcome value." };
  }
  if ((input.outcome === "deferred" || input.outcome === "cancelled") && !input.reason?.trim()) {
    return { ok: false, code: "REASON_REQUIRED", message: "A reason is required for this outcome." };
  }
  const cf = input.carryForward;
  if (cf && cf.mode !== "none") {
    if (input.outcome === "executed") {
      return { ok: false, code: "CARRY_ON_EXECUTED", message: "An executed plan cannot be carried forward." };
    }
    if (cf.mode === "date" && !isValidDateStr(cf.targetDate ?? "")) {
      return { ok: false, code: "TARGET_DATE_REQUIRED", message: "Pick a valid target date." };
    }
    const target = cf.mode === "date" ? cf.targetDate! : addDaysStr(todayStr, 1);
    if (target <= planDate) {
      return { ok: false, code: "TARGET_NOT_AFTER_PLAN", message: "Target date must be after the original plan date." };
    }
    if (cf.carryQty != null && !(Number.isFinite(Number(cf.carryQty)) && Number(cf.carryQty) > 0)) {
      return { ok: false, code: "INVALID_CARRY_QTY", message: "Carry-forward quantity must be a finite number greater than zero." };
    }
  }
  return { ok: true };
}

export function resolveCarryTargetDate(cf: NonNullable<OutcomeInput["carryForward"]>, todayStr: string): string {
  return cf.mode === "date" ? cf.targetDate! : addDaysStr(todayStr, 1);
}

/** Real calendar date in YYYY-MM-DD (rejects e.g. 2026-02-31). */
export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` === s;
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Spec §16: repeated carry-forward is blocked — one live link per plan. */
export function alreadyCarriedForward(allocationStatus: any): { requirementId: number; date: string } | null {
  const link = allocationStatus?.executionOutcome?.carriedForwardTo;
  return link?.requirementId != null ? link : null;
}

// ---------- Planned vs executed comparison (spec §8-9) ----------

export interface ExecutedByUom { uom: string; qty: number; entryCount: number }

export interface ExecutionComparison {
  dprExists: boolean;
  billableEntryCount: number;
  executedByUom: ExecutedByUom[];
  /** true when a single suggested balance is safe to compute */
  comparable: boolean;
  plannedQty: number | null;
  plannedUom: string | null;
  executedQty: number | null;      // in planned UoM when comparable
  suggestedBalance: number | null; // planned − executed, floored at 0
}

const normUom = (u: string | null | undefined) => (u ?? "").trim().toLowerCase().replace(/\.+$/, "");

/**
 * 06J-HF: convert raw physical DPR entries into credited BOQ quantity using
 * the CANONICAL DPR→BOQ credit rule (shared/progressReport.entryBoqCredit —
 * "single rule, reused"). Never invents a conversion.
 *
 * Once credit is applied, the executed quantity is denominated in the BOQ
 * ITEM'S UNIT, so the returned uom is item.unit — NOT the physical entry uom.
 *
 * If the BOQ item (or its unit) cannot be established, credit cannot be
 * safely applied: returns creditApplied=false with raw-uom grouping, and the
 * comparison below treats that as non-comparable (manual confirmation) — it
 * never falls back to raw physical quantity just because the text matches.
 */
export function creditExecutedEntries(
  rows: Array<{ quantity: number | string | null; uom?: string | null; rowConversionFactor?: number | null }>,
  boqItem: Pick<ReportBoqItem, "id" | "unit" | "dprConversionFactor"> | null | undefined,
): { executedByUom: ExecutedByUom[]; creditApplied: boolean } {
  if (!boqItem || !boqItem.unit?.trim()) {
    // No safe credit basis — group by raw physical uom, flagged non-creditable.
    const byUom = new Map<string, ExecutedByUom>();
    for (const r of rows) {
      const key = normUom(r.uom);
      const cur = byUom.get(key) ?? { uom: (r.uom ?? "").trim(), qty: 0, entryCount: 0 };
      cur.qty += Number(r.quantity) || 0;
      cur.entryCount += 1;
      byUom.set(key, cur);
    }
    return { executedByUom: Array.from(byUom.values()), creditApplied: false };
  }
  let qty = 0;
  let count = 0;
  for (const r of rows) {
    const credit = entryBoqCredit(
      { quantity: r.quantity == null ? null : Number(r.quantity), rowConversionFactor: r.rowConversionFactor ?? null } as ReportEntry,
      boqItem as ReportBoqItem,
    );
    if (credit == null) continue;
    qty += credit;
    count += 1;
  }
  if (count === 0) return { executedByUom: [], creditApplied: true };
  return { executedByUom: [{ uom: boqItem.unit.trim(), qty, entryCount: count }], creditApplied: true };
}

/**
 * Strict comparability: planned qty > 0 with a UoM, and every executed entry
 * uses the SAME normalised UoM (or nothing executed at all). No conversion
 * factors are ever invented (spec §9).
 */
export function computeExecutionComparison(args: {
  plannedQty: number | null | undefined;
  plannedUom: string | null | undefined;
  executedByUom: ExecutedByUom[];
  dprExists: boolean;
  /**
   * 06J-HF: false when DPR→BOQ credit could not be safely established for
   * executed entries — forces manual confirmation even if raw uom text
   * happens to match the planned uom.
   */
  creditApplied?: boolean;
}): ExecutionComparison {
  const plannedQty = args.plannedQty != null && Number(args.plannedQty) > 0 ? Number(args.plannedQty) : null;
  const plannedUom = args.plannedUom?.trim() || null;
  const billableEntryCount = args.executedByUom.reduce((s, r) => s + r.entryCount, 0);
  const base: ExecutionComparison = {
    dprExists: args.dprExists,
    billableEntryCount,
    executedByUom: args.executedByUom,
    comparable: false,
    plannedQty,
    plannedUom,
    executedQty: null,
    suggestedBalance: null,
  };
  if (plannedQty == null || !plannedUom) return base;
  if (args.executedByUom.length === 0) {
    // Nothing executed — full planned quantity is the safe suggestion.
    return { ...base, comparable: true, executedQty: 0, suggestedBalance: plannedQty };
  }
  // Credit rule unavailable → never trust a textual uom match (06J-HF §1).
  if (args.creditApplied === false) return base;
  if (args.executedByUom.length === 1 && normUom(args.executedByUom[0].uom) === normUom(plannedUom)) {
    const executed = Number(args.executedByUom[0].qty) || 0;
    return { ...base, comparable: true, executedQty: executed, suggestedBalance: Math.max(0, plannedQty - executed) };
  }
  return base; // mixed or mismatched UoMs → manual confirmation required
}

// ---------- Carry-forward plan construction (spec §6-7) ----------

/**
 * Builds the NEW requirement row payload. Fresh plan semantics:
 * - fresh lineKeys on every requirement line (identities never collide);
 * - NO audit timestamps/statuses copied;
 * - previous day's fulfilment entries carried ONLY as a marked reference.
 */
export function buildCarryForwardPlan(oldReq: any, opts: {
  targetDate: string;
  carryQty?: number | null;
  createdByName: string | null;
  createdById?: number | null;
}): { create: any; allocationStatus: any } {
  const relabel = (lines: any[] | null | undefined) =>
    Array.isArray(lines) ? lines.map((l) => ({ ...l, lineKey: newLineKey() })) : null;

  // 06N: activity-#1 mirror sync lives in the plannedWork seam, not here.
  const plannedWork = oldReq.plannedWork
    ? (opts.carryQty != null
        ? applyCarryToPlannedWork(oldReq.plannedWork, opts.carryQty, `Balance carried forward from plan #${oldReq.id} (${oldReq.date})`)
        : { ...oldReq.plannedWork })
    : null;

  // Reference-only snapshot of the old plan's fulfilment decisions (§7):
  const oldEntries: AllocationEntryLike[] = oldReq.allocationStatus?.materialItems ?? [];
  const oldMats: any[] = Array.isArray(oldReq.materials) ? oldReq.materials : [];
  const reference = oldMats
    .map((m, i) => {
      const e = findAllocationEntry(oldEntries, m, i);
      return e?.fulfilmentType
        ? { materialName: m.materialName ?? null, fulfilmentType: e.fulfilmentType, arrangementId: e.arrangementId ?? null, agencyNameSnapshot: e.agencyNameSnapshot ?? null }
        : null;
    })
    .filter(Boolean);

  return {
    create: {
      date: opts.targetDate,
      siteId: oldReq.siteId ?? null,
      submittedBy: opts.createdById ?? null,
      submittedByName: opts.createdByName ?? null,
      plannedWork,
      materials: relabel(oldReq.materials),
      equipment: relabel(oldReq.equipment),
      labour: relabel(oldReq.labour),
      immediateRequirements: relabel(oldReq.immediateRequirements),
    },
    allocationStatus: {
      carriedForwardFrom: { requirementId: oldReq.id, date: oldReq.date },
      ...(reference.length > 0 ? { previousAllocationReference: reference } : {}),
    },
  };
}

/** Outcome object written onto the OLD plan's allocationStatus. */
export function buildOutcomeRecord(input: OutcomeInput, byName: string | null, atIso: string, carriedTo: { requirementId: number; date: string } | null) {
  return {
    outcome: input.outcome,
    reason: input.reason?.trim() || null,
    remarks: input.remarks?.trim() || null,
    updatedByName: byName,
    updatedAt: atIso,
    carriedForwardTo: carriedTo,
  };
}
