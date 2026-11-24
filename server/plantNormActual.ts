import {
  groupPartyOrderNorms,
  summarizePlantNormActual,
  type PartyOrderNorm,
  type PlantNormActualDay,
} from "@shared/plantNormVsActual";

type NormActualStorage = {
  getTruckDispatches(filters?: { dateFrom?: string; dateTo?: string }): Promise<Array<any>>;
  getParties(): Promise<Array<any>>;
  getMixTemplates(): Promise<Array<any>>;
  getBitumenDipReadings(filters?: { dateFrom?: string; dateTo?: string; plantName?: string }): Promise<Array<any>>;
  getLdoDipReadings(filters?: { dateFrom?: string; dateTo?: string; plant?: string }): Promise<Array<any>>;
  getPlantShiftLogs(filters?: { dateFrom?: string; dateTo?: string }): Promise<Array<any>>;
  getHeatingSessionsWithProductionDate(filters?: { dateFrom?: string; dateTo?: string; plantName?: string }): Promise<Array<any>>;
  getDailyPlantSummary(date: string, plantName: string): Promise<any>;
};

function finite(value: unknown): number | null {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number) ? null : number;
}

export async function buildPlantNormActualReport(
  storage: NormActualStorage,
  input: { from: string; to: string; plantName: string },
) {
  const [dispatchRows, parties, mixes, bitumenDips, ldoDips, shiftLogs, heatingSessions] = await Promise.all([
    storage.getTruckDispatches({ dateFrom: input.from, dateTo: input.to }),
    storage.getParties(),
    storage.getMixTemplates(),
    storage.getBitumenDipReadings({ dateFrom: input.from, dateTo: input.to, plantName: input.plantName }),
    storage.getLdoDipReadings({ dateFrom: input.from, dateTo: input.to, plant: input.plantName }),
    storage.getPlantShiftLogs({ dateFrom: input.from, dateTo: input.to }),
    storage.getHeatingSessionsWithProductionDate({ dateFrom: input.from, dateTo: input.to, plantName: input.plantName }),
  ]);
  const partyById = new Map(parties.map(party => [Number(party.id), party.name]));
  const mixById = new Map(mixes.map(mix => [Number(mix.id), mix]));
  const dispatches = dispatchRows
    .filter(row => row.plantName === input.plantName);
  const normRows: PartyOrderNorm[] = [];
  const dailyNorms = new Map<string, { bitumen: number; ldo: number }>();
  const dispatchDates = new Set<string>();

  for (const dispatch of dispatches) {
    const weight = finite(dispatch.loadWeight) ?? 0;
    const mix = mixById.get(Number(dispatch.mixTemplateId));
    const bitumenPct = finite(dispatch.theoreticalBitumenPercent) ?? finite(mix?.bitumenPercent);
    const bitumenNorm = finite(dispatch.theoreticalBitumenQty) ??
      (bitumenPct == null ? 0 : weight * bitumenPct / 100);
    const ldoNorm = finite(dispatch.theoreticalLdoQty) ?? weight * 6;
    const day = dailyNorms.get(dispatch.date) ?? { bitumen: 0, ldo: 0 };
    day.bitumen += bitumenNorm;
    day.ldo += ldoNorm;
    dailyNorms.set(dispatch.date, day);
    dispatchDates.add(dispatch.date);
    normRows.push({
      partyName: partyById.get(Number(dispatch.partyId)) ?? `Party #${dispatch.partyId}`,
      orderNo: dispatch.supplyOrderNo,
      mixName: dispatch.supplyOrderMixName ?? mix?.name ?? `Mix #${dispatch.mixTemplateId}`,
      bitumenNormMt: bitumenNorm,
      ldoNormL: ldoNorm,
    });
  }

  // Include days with physical readings even if no dispatch was recorded.
  const dates = new Set<string>([
    ...Array.from(dispatchDates),
    ...bitumenDips.map(row => row.date),
    ...ldoDips.map(row => row.date),
    ...shiftLogs.filter(row => row.plantName === input.plantName).map(row => row.date),
    ...heatingSessions.map(row => row.countsForDate).filter((date): date is string => typeof date === "string"),
  ]);
  const daily: PlantNormActualDay[] = [];
  for (const date of Array.from(dates).filter(date => date >= input.from && date <= input.to).sort()) {
    const summary = await storage.getDailyPlantSummary(date, input.plantName);
    const norms = dailyNorms.get(date) ?? { bitumen: 0, ldo: 0 };
    daily.push({
      date,
      bitumenNormMt: norms.bitumen,
      bitumenActualMt: finite(summary?.reconciliation?.bitumen?.actualUsedMT),
      ldoNormL: norms.ldo,
      ldoActualL: finite(summary?.ldo?.consumedTotalL),
      hasNorm: dispatchDates.has(date),
    });
  }
  const totals = summarizePlantNormActual(daily);
  return {
    from: input.from,
    to: input.to,
    plantName: input.plantName,
    daily,
    groups: groupPartyOrderNorms(normRows),
    totals,
    actualAttribution: "Shared tank actuals are shown only in the HLC plant total; they are not apportioned to parties or orders.",
  };
}

export function validPlantNormActualRange(from: string, to: string): boolean {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(from) || !date.test(to) || from > to) return false;
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const isCanonicalDate = (value: string, time: number) => new Date(time).toISOString().slice(0, 10) === value;
  return Number.isFinite(fromMs) && Number.isFinite(toMs) &&
    isCanonicalDate(from, fromMs) && isCanonicalDate(to, toMs) &&
    Math.floor((toMs - fromMs) / 86_400_000) <= 366;
}
