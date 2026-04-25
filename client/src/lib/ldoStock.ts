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
} | null;

export function effectiveStockTank(r: Pick<LdoFlowReading, "tankNumber" | "dryerFedFrom">): number {
  if (r.tankNumber === 2 && r.dryerFedFrom === "TANK_1") return 1;
  return r.tankNumber;
}

// Re-creates the per-tank stock balance starting from the most recent
// manual "stock" entry, then applying receipts and consumption that
// happened after it. Returns null when no stock baseline exists.
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

  // Consumption is grouped by *effective* stock tank (with dryer routing
  // applied), then matched per-(date, sourceShiftLogId, sourceHeatingSessionId)
  // so each meter pair is netted independently. Two shifts on the same day
  // each contribute their own (closing − opening) instead of being collapsed
  // into one min/max pair across both shifts.
  type Pair = {
    openings: LdoFlowReading[];
    closings: LdoFlowReading[];
  };
  const pairs = new Map<string, Pair>();
  for (const r of readings) {
    if (effectiveStockTank(r) !== tankNum) continue;
    if (r.readingType !== "opening" && r.readingType !== "closing") continue;
    if (r.date < latestStock.date) continue;
    if (r.date === latestStock.date && `${r.date}T${r.time || "00:00"}` <= stockDateTime) continue;

    // Group by source row when present (one shift log = one pair). This keeps
    // multi-shift days from collapsing across each other. Manual entries with
    // no source default to date+tank grouping.
    const groupKey = r.sourceShiftLogId != null
      ? `S${r.sourceShiftLogId}::${r.tankNumber}`
      : r.sourceHeatingSessionId != null
        ? `H${r.sourceHeatingSessionId}::${r.tankNumber}`
        : `D${r.date}::${r.tankNumber}`;
    let p = pairs.get(groupKey);
    if (!p) {
      p = { openings: [], closings: [] };
      pairs.set(groupKey, p);
    }
    if (r.readingType === "opening") p.openings.push(r);
    else p.closings.push(r);
  }

  let consumptionSince = 0;
  pairs.forEach((p) => {
    if (p.openings.length === 0 || p.closings.length === 0) return;
    const openVal = p.openings.sort((a: LdoFlowReading, b: LdoFlowReading) =>
      (a.time || "").localeCompare(b.time || ""))[0].meterReading;
    const closeVal = p.closings.sort((a: LdoFlowReading, b: LdoFlowReading) =>
      (b.time || "").localeCompare(a.time || ""))[0].meterReading;
    const diff = closeVal - openVal;
    if (diff > 0) consumptionSince += diff;
  });

  return {
    stockL: stockL + receiptsSince - consumptionSince,
    date: latestStock.date,
    time: latestStock.time || undefined,
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
