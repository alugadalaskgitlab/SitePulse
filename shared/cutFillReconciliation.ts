import { z } from "zod";

/**
 * Cut/fill is a physical-material ledger only.  It deliberately does not
 * participate in BOQ credit, billing, or percentage-complete calculations.
 */
export const excavationMaterialOutcomes = [
  "fully_reusable",
  "partly_reusable",
  "unsuitable",
] as const;
export type ExcavationMaterialOutcome = typeof excavationMaterialOutcomes[number];

const EPSILON = 0.0001;

export function validateExcavationMaterialOutcome(
  quantity: unknown,
  materialOutcome: unknown,
  reusableQty: unknown,
): string | null {
  if (materialOutcome == null && reusableQty == null) return null;
  if (!excavationMaterialOutcomes.includes(materialOutcome as ExcavationMaterialOutcome)) {
    return "materialOutcome must be fully_reusable, partly_reusable, or unsuitable.";
  }
  if (quantity == null || (typeof quantity === "string" && quantity.trim() === "")) {
    return "A non-negative progress quantity is required when recording material outcome.";
  }
  if (reusableQty == null || (typeof reusableQty === "string" && reusableQty.trim() === "")) {
    return "reusableQty is required when recording material outcome.";
  }
  const total = Number(quantity);
  const reusable = Number(reusableQty);
  if (!Number.isFinite(total) || total < 0) {
    return "A non-negative progress quantity is required when recording material outcome.";
  }
  if (!Number.isFinite(reusable) || reusable < 0 || reusable > total + EPSILON) {
    return "reusableQty must be between zero and the reported quantity.";
  }
  if (materialOutcome === "fully_reusable" && Math.abs(reusable - total) > EPSILON) {
    return "A fully reusable excavation outcome must have reusableQty equal to the reported quantity.";
  }
  if (materialOutcome === "partly_reusable" && (reusable <= EPSILON || reusable >= total - EPSILON)) {
    return "A partly reusable excavation outcome must have reusableQty greater than zero and less than the reported quantity.";
  }
  if (materialOutcome === "unsuitable" && reusable > EPSILON) {
    return "An unsuitable excavation outcome must have reusableQty of zero.";
  }
  return null;
}

export const cutFillConsumptionSchema = z.object({
  /** Stable across draft replacement/versioning; never use progress_entries.id. */
  fillEntryKey: z.string().min(1),
  sourceEntryKey: z.string().min(1).nullable().optional(),
  openingBalanceId: z.number().int().positive().nullable().optional(),
  quantity: z.number().finite().positive(),
}).superRefine((value, ctx) => {
  const sources = Number(Boolean(value.sourceEntryKey)) + Number(Boolean(value.openingBalanceId));
  if (sources !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each material consumption must reference exactly one excavation row or opening balance." });
  }
});
export type CutFillConsumptionInput = z.infer<typeof cutFillConsumptionSchema>;

export interface CutFillAvailability {
  availableQty: number;
  consumedQty: number;
  reusableQty: number;
}

export function cutFillAvailability(reusableQty: unknown, consumedQty: unknown): CutFillAvailability {
  const reusable = Number(reusableQty);
  const consumed = Number(consumedQty);
  const safeReusable = Number.isFinite(reusable) && reusable > 0 ? reusable : 0;
  const safeConsumed = Number.isFinite(consumed) && consumed > 0 ? consumed : 0;
  return {
    reusableQty: safeReusable,
    consumedQty: safeConsumed,
    availableQty: Math.max(0, safeReusable - safeConsumed),
  };
}

export function insufficientCutFillMessage(availableQty: number, alreadyUsedQty: number): string {
  const n = Number.isFinite(availableQty) ? availableQty : 0;
  const m = Number.isFinite(alreadyUsedQty) ? alreadyUsedQty : 0;
  return `Only ${n} Cum of this excavated material is still available — another report has already used ${m} Cum of it.`;
}

/** Authoritative ledger comparison, kept pure so storage paths share semantics. */
export function cutFillCapacityExceeded(producedQty: unknown, usedQty: unknown): {
  exceeded: boolean; availableQty: number; usedQty: number;
} {
  const produced = Number.isFinite(Number(producedQty)) ? Math.max(0, Number(producedQty)) : 0;
  const used = Number.isFinite(Number(usedQty)) ? Math.max(0, Number(usedQty)) : 0;
  return { exceeded: used > produced + EPSILON, availableQty: Math.max(0, produced - used), usedQty: used };
}