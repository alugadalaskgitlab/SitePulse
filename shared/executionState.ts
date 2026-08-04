/**
 * Instruction 027 — Execution-state derivation + edit classification.
 *
 * Single source of truth for:
 *  1. mapping raw arrangement workflow statuses onto the 7 compact operational
 *     execution states shown on the Gantt / Procurement / register (§1–2);
 *  2. classifying arrangement edits as OPERATIONAL vs MATERIAL/COMMERCIAL (§17–18).
 *
 * Pure functions only — used by client, server and tests.
 */

// ─── Execution states (§1) ────────────────────────────────────────────────────

export type ExecutionState =
  | "arrangement_required"
  | "hlc_inhouse"
  | "outsourcing_proposed"
  | "outsourcing_approved"
  | "partly_outsourced"
  | "client_supplied"
  | "on_hold";

export const EXECUTION_STATE_LABELS: Record<ExecutionState, string> = {
  arrangement_required: "Execution Arrangement Required",
  hlc_inhouse: "HLC In-house",
  outsourcing_proposed: "Outsourcing Proposed",
  outsourcing_approved: "Outsourcing Approved",
  partly_outsourced: "Partly Outsourced",
  client_supplied: "Client Supplied",
  on_hold: "On Hold",
};

/** Tailwind-ish colour tokens per state (badge bg/border/text). */
export const EXECUTION_STATE_COLORS: Record<ExecutionState, { bg: string; border: string; text: string }> = {
  arrangement_required: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700" },
  hlc_inhouse:          { bg: "bg-slate-100", border: "border-slate-300", text: "text-slate-700" },
  outsourcing_proposed: { bg: "bg-sky-50", border: "border-sky-300", text: "text-sky-700" },
  outsourcing_approved: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-700" },
  partly_outsourced:    { bg: "bg-teal-50", border: "border-teal-300", text: "text-teal-700" },
  client_supplied:      { bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-700" },
  on_hold:              { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-700" },
};

/** Statuses that mean "this arrangement is an operative approved decision". */
const EFFECTIVE_STATUSES = new Set(["approved", "mobilisation_pending", "in_progress", "completed"]);
/** Statuses that mean "a proposal exists but is not yet operationally approved". */
const PROPOSED_STATUSES = new Set(["draft", "submitted", "returned"]);
/** Statuses that no longer count at all. */
const INACTIVE_STATUSES = new Set(["cancelled", "rejected"]);

import {
  getCategoryDescriptor,
  significantComponentsFor,
  type WorkCategoryKey,
} from "./executionArrangementCategories";

/** Legacy earthwork sets kept as defaults (028 §12 — preserve all current earthwork type values). */
const OUTSOURCED_TYPES = getCategoryDescriptor("earthwork").outsourcedTypes;

/** Execution components that decide whether responsibility is "substantially agency" (earthwork default). */
const EXECUTION_COMPONENTS = getCategoryDescriptor("earthwork").significantComponents;

export interface ExecutionStateArrangement {
  id: number;
  status: string;
  arrangementType: string;
  /** Quantity of this arrangement relevant to the scope being evaluated (bar-linked qty for a bar, allocatedQty for an item). */
  qtyForScope: number;
  agencyName?: string | null;
  components?: Record<string, string> | null;
  pendingRevision?: unknown;
}

export interface ExecutionStateResult {
  state: ExecutionState;
  label: string;
  /** Compact badge text, e.g. "Outsourcing Approved · Narsimulu" or "Partly Outsourced · 3,000 / 5,092.6 CUM" */
  badge: string;
  agencyName: string | null;
  /** Effective (approved) outsourced quantity within scope. */
  effectiveOutsourcedQty: number;
  /** Proposed (not yet approved) quantity within scope. */
  proposedQty: number;
  pendingRevision: boolean;
  /** Exact internal statuses backing this state (for the detail panel). */
  internalStatuses: string[];
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

/**
 * True when the arrangement's responsibility is substantially assigned to the
 * Agency (§2). 028 §11: significant components come from the category registry
 * (earthwork defaults preserved; bituminous uses mix/spray-specific sets).
 */
export function isSubstantiallyAgency(
  components: Record<string, string> | null | undefined,
  category?: WorkCategoryKey | null,
  itemType?: string | null,
): boolean {
  if (!components) return true; // no matrix saved — trust the outsourced type
  const significant = category ? significantComponentsFor(category, itemType) : EXECUTION_COMPONENTS;
  const relevant = significant.filter(c => components[c] && components[c] !== "not_applicable" && components[c] !== "not_decided");
  if (relevant.length === 0) return true;
  return relevant.every(c => components[c] === "agency" || components[c] === "client");
}

/**
 * Derive the compact operational execution state for a scope (a programme bar
 * or a whole BOQ item / material row).
 *
 * `scopeQty`: the bar's planned quantity (bar scope) or the item demand (item scope).
 * `arrangements`: arrangements relevant to the scope with `qtyForScope` filled in.
 */
export function deriveExecutionState(
  scopeQty: number,
  arrangements: ExecutionStateArrangement[],
  opts?: { uom?: string; barOnHold?: boolean; category?: WorkCategoryKey | null; itemType?: string | null },
): ExecutionStateResult {
  const uom = opts?.uom ?? "CUM";
  // 028 §12 — outsourced/in-house/client semantics are category-driven.
  const cat = getCategoryDescriptor(opts?.category ?? "earthwork");
  const OUTSOURCED = cat.outsourcedTypes;
  const INHOUSE = cat.inhouseTypes;
  const CLIENT = cat.clientTypes;
  const active = arrangements.filter(a => !INACTIVE_STATUSES.has(a.status));
  const effective = active.filter(a => EFFECTIVE_STATUSES.has(a.status));
  const onHold = active.filter(a => a.status === "on_hold");
  const proposed = active.filter(a => PROPOSED_STATUSES.has(a.status));

  const pendingRevision = active.some(a => a.pendingRevision != null);
  const internalStatuses = Array.from(new Set(active.map(a => a.status)));

  // On-hold arrangements still represent an approved decision for coverage math.
  const effectiveAll = [...effective, ...onHold];
  const effQty = effectiveAll.reduce((s, a) => s + Math.max(0, a.qtyForScope), 0);
  const propQty = proposed.reduce((s, a) => s + Math.max(0, a.qtyForScope), 0);
  const agencyName =
    effectiveAll.find(a => OUTSOURCED.has(a.arrangementType) && a.agencyName)?.agencyName
    ?? proposed.find(a => OUTSOURCED.has(a.arrangementType) && a.agencyName)?.agencyName
    ?? null;

  const TOL = 0.001;
  const fullCoverage = scopeQty <= TOL ? effQty > TOL : effQty >= scopeQty - Math.max(TOL, scopeQty * 0.0005);

  const build = (state: ExecutionState, badge?: string): ExecutionStateResult => ({
    state,
    label: EXECUTION_STATE_LABELS[state],
    badge: badge ?? EXECUTION_STATE_LABELS[state],
    agencyName,
    effectiveOutsourcedQty: effectiveAll.filter(a => OUTSOURCED.has(a.arrangementType)).reduce((s, a) => s + Math.max(0, a.qtyForScope), 0),
    proposedQty: propQty,
    pendingRevision,
    internalStatuses,
  });

  // 1. On Hold — currently effective decision (or the bar itself) is paused.
  if (opts?.barOnHold || (onHold.length > 0 && effective.length === 0)) return build("on_hold");
  if (onHold.length > 0 && effective.length > 0) {
    // Mixed: some effective work continues; hold wins for visibility only if it covers everything.
    const effOnly = effective.reduce((s, a) => s + Math.max(0, a.qtyForScope), 0);
    if (effOnly <= TOL) return build("on_hold");
  }

  // 2. No active decision at all.
  if (active.length === 0 || (effQty <= TOL && propQty <= TOL)) return build("arrangement_required");

  // 3. Effective (approved) decisions drive the state.
  if (effQty > TOL) {
    const types = new Set(effectiveAll.filter(a => a.qtyForScope > TOL).map(a => a.arrangementType));
    const allClient = Array.from(types).every(t => CLIENT.has(t));
    const allInhouse = Array.from(types).every(t => INHOUSE.has(t));
    const anyOutsourced = Array.from(types).some(t => OUTSOURCED.has(t));

    if (fullCoverage && allClient) return build("client_supplied");
    if (fullCoverage && allInhouse) return build("hlc_inhouse");

    if (anyOutsourced) {
      const outsourcedEff = effectiveAll.filter(a => OUTSOURCED.has(a.arrangementType));
      const substantiallyAgency = outsourcedEff.every(a => isSubstantiallyAgency(a.components as Record<string, string> | null, opts?.category ?? null, opts?.itemType ?? null));
      if (fullCoverage && substantiallyAgency && outsourcedEff.reduce((s, a) => s + a.qtyForScope, 0) >= effQty - TOL) {
        return build("outsourcing_approved", agencyName ? `Outsourcing Approved · ${agencyName}` : undefined);
      }
      // Partial quantity or split responsibility (§2)
      const outQty = outsourcedEff.reduce((s, a) => s + Math.max(0, a.qtyForScope), 0);
      return build("partly_outsourced", scopeQty > TOL ? `Partly Outsourced · ${fmt(outQty)} / ${fmt(scopeQty)} ${uom}` : undefined);
    }

    // Mixed inhouse/client with partial coverage
    if (fullCoverage) return allClient ? build("client_supplied") : build("hlc_inhouse");
    return build("arrangement_required"); // partly decided, remainder needs a decision
  }

  // 4. Only proposals exist.
  const proposedOutsourced = proposed.some(a => OUTSOURCED.has(a.arrangementType));
  if (proposedOutsourced) return build("outsourcing_proposed");
  const proposedTypes = new Set(proposed.map(a => a.arrangementType));
  if (Array.from(proposedTypes).every(t => INHOUSE.has(t)) && proposedTypes.size > 0) {
    // An explicitly saved (but not approved) in-house decision still reads as In-house per §2
    return build("hlc_inhouse");
  }
  if (Array.from(proposedTypes).every(t => CLIENT.has(t)) && proposedTypes.size > 0) return build("outsourcing_proposed");
  return build("arrangement_required");
}

// ─── Edit classification (§17–18) ────────────────────────────────────────────

/** Fields PM/Admin may change directly on an approved arrangement (audited, immediate). */
export const OPERATIONAL_EDIT_FIELDS = [
  "notes",
  "workDescription",
  "reachLabel",
  "chainageFrom",
  "chainageTo",
  "mobilisationDate",
  "plannedStartDate",
  "actualStartDate",
  "targetCompletionDate",
  "plannedDailyOutput",
  "workingHoursPerShift",
  "numExcavators",
  "excavatorType",
  "numTippers",
  "tipperCapacityCum",
] as const;

/** Changes to these fields on an approved arrangement require a controlled revision. */
export const MATERIAL_REVISION_FIELDS = [
  "agencyName",
  "allocatedQty",
  "agreedRate",
  "arrangementType",
  "components",
  "dieselResponsibility",
  "boqItemAllocations",
  "boqItemId",
  "inclusions",
  "exclusions",
  "borrowSource",
  "avgLeadKm",
  "sourceExcavationBoqItemId",
] as const;

/** Operational fields whose change should carry a short reason (§17: dates/output). */
export const OPERATIONAL_REASON_FIELDS = new Set([
  "mobilisationDate", "plannedStartDate", "targetCompletionDate", "plannedDailyOutput",
]);

export interface EditClassification {
  operational: string[];
  material: string[];
  reasonRequired: boolean;
}

/** Classify a proposed set of field changes against the current arrangement values. */
export function classifyArrangementEdit(
  current: Record<string, unknown>,
  body: Record<string, unknown>,
): EditClassification {
  const changed = (f: string) =>
    f in body && JSON.stringify(body[f] ?? null) !== JSON.stringify(current[f] ?? null);
  const operational = OPERATIONAL_EDIT_FIELDS.filter(changed);
  const material = MATERIAL_REVISION_FIELDS.filter(changed);
  return {
    operational: [...operational],
    material: [...material],
    reasonRequired: operational.some(f => OPERATIONAL_REASON_FIELDS.has(f)),
  };
}
