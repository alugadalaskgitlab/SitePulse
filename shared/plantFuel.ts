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
