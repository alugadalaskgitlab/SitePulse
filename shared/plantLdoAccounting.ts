import { getLdoVolumeAtDepth } from "./ldo-dip-chart";

export type ProductionWindow = {
  date: string;
  plantStartTime: string | null;
  plantStopTime: string | null;
};

export type HeatingSessionWindow = {
  date: string;
  startTime?: string | null;
  endTime?: string | null;
};

const timeToMinutes = (value?: string | null): number | null => {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
};

const dateTimeMinutes = (date: string, time: string | null | undefined, defaultMinutes: number) => {
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(day)) return null;
  return Math.floor(day / 60_000) + (timeToMinutes(time) ?? defaultMinutes);
};

export function assignHeatingSessionsToProductionDays<
  T extends HeatingSessionWindow,
>(
  sessions: T[],
  productionWindows: ProductionWindow[],
): Array<T & { countsForDate: string | null }> {
  const windows = productionWindows
    .map((window) => {
      const start = dateTimeMinutes(window.date, window.plantStartTime, 0);
      if (start == null) return null;
      const stopTime = timeToMinutes(window.plantStopTime);
      let end = dateTimeMinutes(window.date, window.plantStopTime, 24 * 60 - 1);
      if (end == null) end = start + 24 * 60 - 1;
      if (end < start || stopTime == null) end = start + 24 * 60 - 1;
      return { date: window.date, start, end };
    })
    .filter((window): window is { date: string; start: number; end: number } => window !== null)
    .sort((a, b) => a.start - b.start);

  return sessions.map((session) => {
    const startOfSession = dateTimeMinutes(session.date, session.startTime, 0);
    const explicitEnd = timeToMinutes(session.endTime);
    if (explicitEnd == null) return { ...session, countsForDate: null };
    let endOfSession = dateTimeMinutes(
      session.date,
      session.endTime,
      24 * 60 - 1,
    );
    if (startOfSession == null || endOfSession == null) {
      return { ...session, countsForDate: null };
    }
    if (explicitEnd != null && session.startTime && explicitEnd < (timeToMinutes(session.startTime) ?? 0)) {
      endOfSession += 24 * 60;
    }

    // A session that overlaps a production shift belongs to that same day,
    // even when it ends after the plant's opening time.
    const overlapping = windows.find((window) =>
      window.date === session.date &&
      startOfSession < window.end &&
      endOfSession > window.start
    );
    if (overlapping) return { ...session, countsForDate: overlapping.date };

    const nextProduction = windows.find((window) => window.start >= endOfSession);
    return { ...session, countsForDate: nextProduction?.date ?? null };
  });
}

export type PlantLdoInput = {
  tank1OpeningDipCm?: number | null;
  tank1ClosingDipCm?: number | null;
  tank2OpeningDipCm?: number | null;
  tank2ClosingDipCm?: number | null;
  receiptsLitres?: number | null;
  dryerMeterOpening?: number | null;
  dryerMeterClosing?: number | null;
  boilerMeterOpening?: number | null;
  boilerMeterClosing?: number | null;
  boilerMeterLitres?: number | null;
  preheatLitres: number;
  preheatHours: number;
  preheatSessionCount: number;
  nightsCount: number;
  plantRunHours?: number | null;
  dispatchedMt?: number | null;
};

export function calculatePlantLdo(input: PlantLdoInput) {
  const tank1Drop =
    input.tank1OpeningDipCm != null && input.tank1ClosingDipCm != null
      ? getLdoVolumeAtDepth(1, input.tank1OpeningDipCm) -
        getLdoVolumeAtDepth(1, input.tank1ClosingDipCm)
      : null;
  const tank2Drop =
    input.tank2OpeningDipCm != null && input.tank2ClosingDipCm != null
      ? getLdoVolumeAtDepth(2, input.tank2OpeningDipCm) -
        getLdoVolumeAtDepth(2, input.tank2ClosingDipCm)
      : null;
  const hasDipData = tank1Drop != null || tank2Drop != null;
  const dipUsedLitres = hasDipData
    ? (tank1Drop ?? 0) + (tank2Drop ?? 0) + Number(input.receiptsLitres || 0)
    : null;
  const dryerLitres =
    input.dryerMeterOpening != null && input.dryerMeterClosing != null
      ? Math.max(0, input.dryerMeterClosing - input.dryerMeterOpening)
      : null;
  const hasBoilerMeter =
    (input.boilerMeterOpening != null && input.boilerMeterClosing != null) ||
    input.boilerMeterLitres != null;
  const boilerBeforeFloor = hasBoilerMeter
    ? input.boilerMeterLitres != null
      ? input.boilerMeterLitres
      : input.boilerMeterClosing! - input.boilerMeterOpening!
    : dipUsedLitres != null && dryerLitres != null
      ? dipUsedLitres - dryerLitres
      : null;
  const checkDipsOrDryerMeter = boilerBeforeFloor != null && boilerBeforeFloor < 0;
  const boilerDuringProductionLitres =
    boilerBeforeFloor == null ? null : Math.max(0, boilerBeforeFloor);
  const preheatLitres = Number(input.preheatLitres || 0);
  const totalBoilerLitres =
    boilerDuringProductionLitres == null
      ? (preheatLitres > 0 ? preheatLitres : null)
      : preheatLitres + boilerDuringProductionLitres;
  const totalLitres =
    totalBoilerLitres == null || dryerLitres == null
      ? null
      : totalBoilerLitres + dryerLitres;
  const mt = input.dispatchedMt != null && input.dispatchedMt > 0
    ? input.dispatchedMt
    : null;
  const runHours = input.plantRunHours != null && input.plantRunHours > 0
    ? input.plantRunHours
    : null;
  const preheatHours = input.preheatHours > 0 ? input.preheatHours : null;
  return {
    tank1DropLitres: tank1Drop,
    tank2DropLitres: tank2Drop,
    dipUsedLitres,
    dryerLitres,
    boilerMeterUsed: hasBoilerMeter,
    boilerBeforeFloor,
    checkDipsOrDryerMeter,
    preheatLitres,
    preheatHours,
    preheatSessionCount: input.preheatSessionCount,
    nightsCount: input.nightsCount,
    preheatLitresPerHour: preheatHours == null ? null : preheatLitres / preheatHours,
    boilerDuringProductionLitres,
    boilerDuringProductionLitresPerHour:
      boilerDuringProductionLitres == null || runHours == null
        ? null
        : boilerDuringProductionLitres / runHours,
    totalBoilerLitres,
    boilerLitresPerMt: totalBoilerLitres == null || mt == null ? null : totalBoilerLitres / mt,
    dryerLitresPerMt: dryerLitres == null || mt == null ? null : dryerLitres / mt,
    totalLitres,
    totalLitresPerMt: totalLitres == null || mt == null ? null : totalLitres / mt,
  };
}

export function formatStoppedTime(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function findLdoOpeningGaps(input: {
  previousAt: string;
  currentAt: string;
  tanks: Array<{
    tankNumber: 1 | 2;
    previousClosingLitres: number | null;
    currentOpeningLitres: number | null;
    receiptsLitres: number;
  }>;
  thresholdLitres?: number;
}) {
  const threshold = input.thresholdLitres ?? 40;
  return input.tanks.flatMap((tank) => {
    if (tank.previousClosingLitres == null || tank.currentOpeningLitres == null) return [];
    const deltaLitres =
      tank.currentOpeningLitres - tank.previousClosingLitres - tank.receiptsLitres;
    return Math.abs(deltaLitres) > threshold
      ? [{ tankNumber: tank.tankNumber, deltaLitres: Math.round(deltaLitres * 10) / 10 }]
      : [];
  });
}
