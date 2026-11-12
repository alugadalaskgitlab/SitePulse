import { canonicalizeMachineType } from "./canonicalize";

export type HireBasis = "monthly" | "daily" | "hourly" | "trip";

export interface HireTermsInput {
  ownership?: string | null;
  hireBillingBasis?: string | null;
  hireRate?: number | string | null;
  hireStartDate?: string | null;
  hireEndDate?: string | null;
}

export function derivedEquipmentType(name: string | null | undefined): string {
  return canonicalizeMachineType(String(name ?? "")).trim() || "Equipment";
}

export function normalizedDerivedEquipmentType(name: string | null | undefined): string {
  return derivedEquipmentType(name).toLocaleUpperCase();
}

export function equipmentTypeChange(oldName: string, newName: string) {
  const from = derivedEquipmentType(oldName);
  const to = derivedEquipmentType(newName);
  return {
    changed: normalizedDerivedEquipmentType(oldName) !== normalizedDerivedEquipmentType(newName),
    from,
    to,
  };
}

export function isGeneratorEquipmentName(name: string | null | undefined): boolean {
  return /\bgenerator\b/i.test(String(name ?? ""));
}

export function equipmentHireTermsError(input: HireTermsInput): string | null {
  if (input.ownership !== "hired") return null;
  const basis = input.hireBillingBasis ?? "";
  if (basis && !["monthly", "daily", "hourly", "trip"].includes(basis)) {
    return "Choose a valid hire basis.";
  }
  if (basis !== "monthly") return null;

  const rate = Number(input.hireRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return "Monthly hire rate must be greater than zero.";
  }
  if (!input.hireStartDate) {
    return "Start date is required for monthly hire.";
  }
  if (input.hireEndDate && input.hireEndDate < input.hireStartDate) {
    return "Hire end date cannot be before the start date.";
  }
  return null;
}

export function shouldShowMonthlyHireTerms(basis: string | null | undefined): boolean {
  return basis === "monthly";
}

export function displayHireBasis(basis: string | null | undefined): string | null {
  if (basis === "monthly" || basis === "daily" || basis === "hourly" || basis === "trip") {
    return `${basis[0].toUpperCase()}${basis.slice(1)} hire — rate set when billing`;
  }
  return null;
}
