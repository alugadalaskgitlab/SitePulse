export type PlantNormActualDay = {
  date: string;
  bitumenNormMt: number;
  bitumenActualMt: number | null;
  ldoNormL: number;
  ldoActualL: number | null;
};

export type PartyOrderNorm = {
  partyName: string;
  orderNo: string | null;
  mixName: string;
  bitumenNormMt: number;
  ldoNormL: number;
};

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function normVariance(norm: number, actual: number | null, digits = 3) {
  if (actual == null || !Number.isFinite(actual)) {
    return { saved: null, label: "actual unavailable" as const };
  }
  const saved = round(norm - actual, digits);
  return { saved, label: saved >= 0 ? "saved" as const : "excess" as const };
}

export function summarizePlantNormActual(days: PlantNormActualDay[]) {
  const bitumenNormMt = round(days.reduce((sum, day) => sum + day.bitumenNormMt, 0), 3);
  const ldoNormL = round(days.reduce((sum, day) => sum + day.ldoNormL, 0), 1);
  const bitumenMeasured = days.filter(day => day.bitumenActualMt != null && Number.isFinite(day.bitumenActualMt));
  const ldoMeasured = days.filter(day => day.ldoActualL != null && Number.isFinite(day.ldoActualL));
  const bitumenActualMt = bitumenMeasured.length
    ? round(bitumenMeasured.reduce((sum, day) => sum + Number(day.bitumenActualMt), 0), 3)
    : null;
  const ldoActualL = ldoMeasured.length
    ? round(ldoMeasured.reduce((sum, day) => sum + Number(day.ldoActualL), 0), 1)
    : null;
  const normDays = days.length;
  const bitumenComplete = bitumenMeasured.length === normDays;
  const ldoComplete = ldoMeasured.length === normDays;
  return {
    bitumenNormMt,
    bitumenActualMt,
    bitumenVariance: bitumenComplete ? normVariance(bitumenNormMt, bitumenActualMt) : { saved: null, label: "actual unavailable" as const },
    bitumenMeasuredDays: bitumenMeasured.length,
    ldoNormL,
    ldoActualL,
    ldoVariance: ldoComplete ? normVariance(ldoNormL, ldoActualL, 1) : { saved: null, label: "actual unavailable" as const },
    ldoMeasuredDays: ldoMeasured.length,
    normDays,
  };
}

export function groupPartyOrderNorms(rows: PartyOrderNorm[]) {
  const groups = new Map<string, PartyOrderNorm>();
  for (const row of rows) {
    const key = `${row.partyName}\u0000${row.orderNo ?? ""}\u0000${row.mixName}`;
    const current = groups.get(key);
    if (current) {
      current.bitumenNormMt += row.bitumenNormMt;
      current.ldoNormL += row.ldoNormL;
    } else {
      groups.set(key, { ...row });
    }
  }
  return [...groups.values()]
    .map(row => ({ ...row, bitumenNormMt: round(row.bitumenNormMt, 3), ldoNormL: round(row.ldoNormL, 1) }))
    .sort((a, b) => a.partyName.localeCompare(b.partyName) ||
      String(a.orderNo ?? "").localeCompare(String(b.orderNo ?? "")) ||
      a.mixName.localeCompare(b.mixName));
}

export function enforceBitumenCorrectionParty(
  materialName: string,
  requestedPartyId: number,
  companyPartyId: number | null,
): number {
  if (!/bitumen/i.test(materialName)) return requestedPartyId;
  if (companyPartyId == null) throw new Error("Select the company party in Admin Settings before correcting bitumen stock.");
  if (requestedPartyId !== companyPartyId) {
    throw new Error("Bitumen dip corrections must be posted to the HLC company party.");
  }
  return companyPartyId;
}

export function calculateHlcBitumenCorrectionTarget(input: {
  physicalTotalMt: number;
  allPartyBookMt: number;
  hlcBookMt: number;
}): { adjustmentMt: number; targetHlcMt: number } {
  const adjustmentMt = round(input.physicalTotalMt - input.allPartyBookMt, 6);
  return {
    adjustmentMt,
    targetHlcMt: round(input.hlcBookMt + adjustmentMt, 6),
  };
}
