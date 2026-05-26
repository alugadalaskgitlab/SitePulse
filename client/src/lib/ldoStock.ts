// Per-tank LDO usable-stock helpers backed by the ldo_flow_readings ledger.
// Boiler-meter rows (tankNumber=1) always debit Tank-1. Receipts and stock
// baselines stay on their physical tankNumber. Dryer-meter rows (tankNumber=2)
// debit whichever tank fed the dryer; the shift log records this via
// `dryerFedFrom`, with NULL treated as TANK_2 for legacy rows.

import type { LdoFlowReading } from "@shared/schema";

export type TankStockSummary = {
  stockL: number;
  date: string;
  time?: string;
  lastReadingDate?: string;
} | null;

export function effectiveStockTank(r: Pick<LdoFlowReading, "tankNumber" | "dryerFedFrom">): number {
  if (r.tankNumber === 2 && r.dryerFedFrom === "TANK_1") return 1;
  return r.tankNumber;
}

// Re-creates the per-tank stock balance starting from the most recent
// manual "stock" entry, then applying receipts and consumption that
// happened after it. Returns null when no stock baseline exists.
//
// Consumption pairing uses DATE-level grouping (first opening of the day,
// last closing of the day) — identical to how dailySummary computes
// consumption in the UI. Source-ID grouping was previously used but caused
// readings from different shift-log IDs (or mixed manual/auto rows) to
// never pair, leaving consumptionSince = 0 and the balance frozen at the
// baseline value.
export function computeTankStock(
  readings: LdoFlowReading[] | undefined | null,
  tankNum: number,
): TankStockSummary {
  if (!readings) return null;

  // Stock baselines are tied to the physical tank, not the consumption-routed
  // effective tank. Same for receipts (a fill that goes into Tank-1 always
  // raises Tank-1 stock, regardless of what the dryer is doing).
  const physicalTank = readings.filter(r => r.tankNumber === tankNum);
  const stockEntries = physicalTank
    .filter(r => r.readingType === "stock")
    .sort((a, b) => {
      const dc = b.date.localeCompare(a.date);
      return dc !== 0 ? dc : (b.time || "").localeCompare(a.time || "");
    });
  if (stockEntries.length === 0) return null;

  const latestStock = stockEntries[0];
  const stockL = latestStock.quantityLiters || 0;
  const stockDateTime = `${latestStock.date}T${latestStock.time || "00:00"}`;

  const receiptsSince = physicalTank
    .filter(r => r.readingType === "receipt" && `${r.date}T${r.time || "00:00"}` > stockDateTime)
    .reduce((s, r) => s + (r.quantityLiters || 0), 0);

  // ── Consumption: date-level pairing ──────────────────────────────────────
  // For each date after the baseline: take the FIRST opening (earliest time)
  // and the LAST closing (latest time) and compute closing − opening.
  // This matches exactly how dailySummary computes daily consumption shown
  // in the UI table, so the running stock balance and the table always agree.
  //
  // Dryer-source re-routing (dryerFedFrom) is applied via effectiveStockTank
  // so that dryer readings fed from Tank-1 debit Tank-1's balance.
  type DayPair = {
    openings: LdoFlowReading[];
    closings: LdoFlowReading[];
  };
  const byDate = new Map<string, DayPair>();

  for (const r of readings) {
    if (effectiveStockTank(r) !== tankNum) continue;
    if (r.readingType !== "opening" && r.readingType !== "closing") continue;
    if (r.date < latestStock.date) continue;
    if (r.date === latestStock.date && `${r.date}T${r.time || "00:00"}` <= stockDateTime) continue;

    let d = byDate.get(r.date);
    if (!d) {
      d = { openings: [], closings: [] };
      byDate.set(r.date, d);
    }
    if (r.readingType === "opening") d.openings.push(r);
    else d.closings.push(r);
  }

  let consumptionSince = 0;
  let lastReadingDate: string | undefined;

  byDate.forEach((day, date) => {
    if (day.openings.length === 0 || day.closings.length === 0) return;
    const firstOpen = day.openings.sort((a, b) =>
      (a.time || "").localeCompare(b.time || ""))[0];
    const lastClose = day.closings.sort((a, b) =>
      (b.time || "").localeCompare(a.time || ""))[0];
    const diff = lastClose.meterReading - firstOpen.meterReading;
    if (diff > 0) {
      consumptionSince += diff;
      if (!lastReadingDate || date > lastReadingDate) lastReadingDate = date;
    }
  });

  return {
    stockL: stockL + receiptsSince - consumptionSince,
    date: latestStock.date,
    time: latestStock.time || undefined,
    lastReadingDate,
  };
}

export type LdoTankBalances = {
  tank1L: number | null;
  tank2L: number | null;
  totalL: number | null;
  tank1AsOf?: { date: string; time?: string };
  tank2AsOf?: { date: string; time?: string };
};

export function computeLdoTankBalances(readings: LdoFlowReading[] | undefined | null): LdoTankBalances {
  const t1 = computeTankStock(readings, 1);
  const t2 = computeTankStock(readings, 2);
  const totalL =
    t1 == null && t2 == null ? null : (t1?.stockL || 0) + (t2?.stockL || 0);
  return {
    tank1L: t1?.stockL ?? null,
    tank2L: t2?.stockL ?? null,
    totalL,
    tank1AsOf: t1 ? { date: t1.date, time: t1.time } : undefined,
    tank2AsOf: t2 ? { date: t2.date, time: t2.time } : undefined,
  };
}
