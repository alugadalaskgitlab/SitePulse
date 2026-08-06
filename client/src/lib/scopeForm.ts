/**
 * Project Scope record form state — extracted from ScopeSetup.tsx so the
 * pencil-edit hydration and quick-add blank-form behaviour are unit-testable.
 *
 * Rules (Scope edit-fix batch, Part A):
 * - openEdit must load EVERY saved field of the selected record — segment
 *   type, label, chainage from/to, side, reason, applicability, category IDs,
 *   BOQ item IDs, effective date, department reference, withdrawal reference,
 *   notes. It must never present a blank "new reach" form.
 * - quick-add after cancelling an edit must produce a genuinely blank form
 *   with no leaked state.
 */
import type { ScopeSegmentType } from "@shared/projectScope";

export interface SegFormState {
  segmentType: ScopeSegmentType;
  label: string;
  chainageFrom: string;
  chainageTo: string;
  side: string;
  reason: string;
  applicability: "all_linear" | "categories" | "items";
  categoryIds: number[];
  itemIds: number[];
  effectiveFrom: string;
  deptReference: string;
  withdrawalOrderRef: string;
  notes: string;
}

export const emptyScopeForm = (t: ScopeSegmentType): SegFormState => ({
  segmentType: t, label: "", chainageFrom: "", chainageTo: "", side: "",
  reason: "", applicability: "all_linear", categoryIds: [], itemIds: [],
  effectiveFrom: "", deptReference: "", withdrawalOrderRef: "", notes: "",
});

/** Malformed JSON-text id lists degrade to [] rather than crashing the page. */
export const safeParseIds = (v: string | null | undefined): number[] => {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.filter(x => x != null).map(Number).filter(Number.isFinite) : [];
  } catch { return []; }
};

/** ISO timestamps ("2026-08-01T00:00:00.000Z") → date-input value ("2026-08-01"). */
const dateInputValue = (v: unknown): string => {
  if (v == null || v === "") return "";
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
};

/** Hydrate the form from a saved scope record — every field, never blank. */
export function scopeFormFromSegment(s: any): SegFormState {
  return {
    segmentType: s.segmentType as ScopeSegmentType,
    label: s.label ?? "",
    chainageFrom: s.chainageFrom != null ? String(s.chainageFrom) : "",
    chainageTo: s.chainageTo != null ? String(s.chainageTo) : "",
    side: s.side ?? "",
    reason: s.reason ?? "",
    applicability: (s.applicability as any) ?? "all_linear",
    categoryIds: safeParseIds(s.categoryIds),
    itemIds: safeParseIds(s.itemIds),
    effectiveFrom: dateInputValue(s.effectiveFrom),
    deptReference: s.deptReference ?? "",
    withdrawalOrderRef: s.withdrawalOrderRef ?? "",
    notes: s.notes ?? "",
  };
}
