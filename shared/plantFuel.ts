import { getLdoVolumeAtDepth } from "./ldo-dip-chart";

export interface DipsOnlyFuelInput {
  openingDipCm: number | null;
  closingDipCm: number | null;
  receiptLitres?: number | null;
  transferLitres?: number | null;
  dryerLitres: number | null;
  preheatLitres?: number | null;
  dispatchedMt: number | null;
}

export function calculateDipsOnlyFuel(input: DipsOnlyFuelInput) {
  const hasDips = input.openingDipCm != null && input.closingDipCm != null;
  const tank1UsedLitres = hasDips
    ? getLdoVolumeAtDepth(1, input.openingDipCm!) -
      getLdoVolumeAtDepth(1, input.closingDipCm!) +
      Number(input.receiptLitres || 0) +
      Number(input.transferLitres || 0)
    : null;
  const dryerLitres = input.dryerLitres;
  const preheatLitres = Number(input.preheatLitres || 0);
  const boilerBeforeFloor = tank1UsedLitres == null || dryerLitres == null
    ? null
    : tank1UsedLitres - dryerLitres - preheatLitres;
  const boilerLitres = boilerBeforeFloor == null ? null : Math.max(0, boilerBeforeFloor);
  const dispatchedMt = input.dispatchedMt;
  return {
    tank1UsedLitres,
    receiptLitres: Number(input.receiptLitres || 0),
    transferLitres: Number(input.transferLitres || 0),
    dryerLitres,
    preheatLitres,
    boilerLitres,
    boilerBeforeFloor,
    checkDipsOrDryerMeter: boilerBeforeFloor != null && boilerBeforeFloor < 0,
    boilerLitresPerMt: boilerLitres != null && dispatchedMt != null && dispatchedMt > 0
      ? boilerLitres / dispatchedMt
      : null,
    dryerLitresPerMt: dryerLitres != null && dispatchedMt != null && dispatchedMt > 0
      ? dryerLitres / dispatchedMt
      : null,
  };
}

export function parseProductionGeneratorIds(value: string | null | undefined): number[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? [...new Set(parsed.map(Number).filter(id => Number.isInteger(id) && id > 0))]
      : [];
  } catch {
    return [];
  }
}

export function selectedProductionGeneratorNames(
  configuredIds: string | null | undefined,
  equipment: Array<{ id: number; name: string; equipmentType?: string | null; isActive?: number | null }>,
): Set<string> {
  const selectedIds = new Set(parseProductionGeneratorIds(configuredIds));
  return new Set(
    equipment
      .filter((row) => selectedIds.has(row.id) &&
        (row.isActive == null || row.isActive === 1) &&
        (row.equipmentType || "").toLowerCase() === "generator")
      .map((row) => row.name),
  );
}

export function omitSelectedGeneratorUsage<T extends { equipmentId: number | null }>(
  rows: T[],
  selectedGeneratorIds: ReadonlySet<number>,
): T[] {
  return rows.filter((row) => row.equipmentId == null || !selectedGeneratorIds.has(row.equipmentId));
}
