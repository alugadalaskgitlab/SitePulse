export type WeightReceiptLine = { quantity: number | string | null; uom: string | null };

export type PhysicalBitumenReconciliation = {
  openingMT: number | null;
  receivedMT: number | null;
  closingMT: number | null;
  actualUsedMT: number | null;
  theoreticalMT: number;
  differenceMT: number | null;
  missing: string[];
};

export function calculateFuelMetrics(actualLitres: number | null, theoreticalLitres: number, productionMT: number) {
  return {
    differenceLitres: actualLitres == null ? null : Number((actualLitres - theoreticalLitres).toFixed(1)),
    litresPerMT: actualLitres != null && productionMT > 0 && actualLitres > 0
      ? Math.round((actualLitres / productionMT) * 1000) / 1000
      : null,
  };
}

export function calculateGeneratorLitresPerHour(consumedLitres: number | null, hoursRun: number | null) {
  return consumedLitres != null && hoursRun != null && hoursRun > 0
    ? Math.round((consumedLitres / hoursRun) * 100) / 100
    : null;
}

export function weightQuantityToMT(quantity: number | string | null, uom: string | null): number | null {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value < 0) return null;
  const unit = String(uom || "").trim().toUpperCase().replace(/[.\s]/g, "");
  if (["MT", "T", "TON", "TONS", "TONNE", "TONNES"].includes(unit)) return value;
  if (["KG", "KGS", "KILOGRAM", "KILOGRAMS"].includes(unit)) return value / 1000;
  return null;
}

export function calculatePhysicalBitumenReconciliation(input: {
  openingTankKg: [number | null, number | null];
  receiptLines: WeightReceiptLine[];
  closingTankKg: [number | null, number | null];
  theoreticalMT: number;
}): PhysicalBitumenReconciliation {
  const missing: string[] = [];
  const theoreticalMT = Number.isFinite(input.theoreticalMT) ? input.theoreticalMT : 0;
  const openingComplete = input.openingTankKg.every(value => value != null && Number.isFinite(value));
  const closingComplete = input.closingTankKg.every(value => value != null && Number.isFinite(value));
  input.openingTankKg.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) missing.push(`Bitumen tank ${index + 1} opening dip`);
  });
  input.closingTankKg.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) missing.push(`Bitumen tank ${index + 1} closing dip`);
  });

  let received = 0;
  let receiptsComplete = true;
  for (const line of input.receiptLines) {
    const converted = weightQuantityToMT(line.quantity, line.uom);
    if (converted == null) {
      receiptsComplete = false;
      missing.push(`Bitumen receipt unit ${line.uom || "(blank)"} needs a weight conversion`);
    } else {
      received += converted;
    }
  }

  const openingMT = openingComplete
    ? Number((input.openingTankKg.reduce<number>((sum, value) => sum + Number(value ?? 0), 0) / 1000).toFixed(3))
    : null;
  const closingMT = closingComplete
    ? Number((input.closingTankKg.reduce<number>((sum, value) => sum + Number(value ?? 0), 0) / 1000).toFixed(3))
    : null;
  const receivedMT = receiptsComplete ? Number(received.toFixed(3)) : null;
  const actualUsedMT = openingMT != null && closingMT != null && receivedMT != null
    ? Number((openingMT + receivedMT - closingMT).toFixed(3))
    : null;
  return {
    openingMT,
    receivedMT,
    closingMT,
    actualUsedMT,
    theoreticalMT,
    differenceMT: actualUsedMT == null ? null : Number((actualUsedMT - theoreticalMT).toFixed(3)),
    missing,
  };
}
