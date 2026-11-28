import { calculateVolumeAtDepth, getTankMaxDepth, type SingleTankConfig } from "./tank-calibration";
import { DEFAULT_DEAD_STOCK_DEPTH } from "./bitumen-dip-chart";

export type TankKind = "bitumen" | "ldo";
export type DipWatchSettings = {
  bitumenAllowedDifferenceMt: number; ldoAllowedDifferenceL: number;
  firstReminder: string; repeatHours: number; lastReminder: string;
};
export const DEFAULT_DIP_WATCH: Readonly<DipWatchSettings> = {
  bitumenAllowedDifferenceMt: 0.2, ldoAllowedDifferenceL: 50,
  firstReminder: "08:00", repeatHours: 2, lastReminder: "18:00",
};
export type TankPlantSettings = {
  tankConfig?: string | null; bitumenDensityKgPerL?: number | null;
  bitumenTank1LitresPerCm?: number | null; bitumenTank2LitresPerCm?: number | null;
};
export function tankConfigObject(json: string | null | undefined): Record<string, any> {
  try {
    const value = JSON.parse(json || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function preserveDipWatchConfig(incoming: string | null | undefined, existing: string | null | undefined): string | null {
  const current = tankConfigObject(existing).dipWatch;
  let next = tankConfigObject(incoming);
  if (current === undefined && !Object.prototype.hasOwnProperty.call(next, "dipWatch")) return incoming ?? null;
  if (incoming) {
    next = JSON.parse(incoming);
    if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error("Invalid tank configuration.");
  }
  if (current !== undefined) next.dipWatch = current; else delete next.dipWatch;
  return Object.keys(next).length ? JSON.stringify(next) : null;
}
export function dipWatchSettings(settings?: TankPlantSettings | null): DipWatchSettings {
  const raw = tankConfigObject(settings?.tankConfig).dipWatch ?? {};
  return {
    bitumenAllowedDifferenceMt: finite(raw.bitumenAllowedDifferenceMt) && raw.bitumenAllowedDifferenceMt >= 0 ? raw.bitumenAllowedDifferenceMt : 0.2,
    ldoAllowedDifferenceL: finite(raw.ldoAllowedDifferenceL) && raw.ldoAllowedDifferenceL >= 0 ? raw.ldoAllowedDifferenceL : 50,
    firstReminder: validTime(raw.firstReminder) ? raw.firstReminder : "08:00",
    repeatHours: Number.isInteger(raw.repeatHours) && raw.repeatHours >= 1 && raw.repeatHours <= 10 ? raw.repeatHours : 2,
    lastReminder: validTime(raw.lastReminder) ? raw.lastReminder : "18:00",
  };
}
export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const validTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function calibration(settings: TankPlantSettings | null | undefined, kind: TankKind, tank: 1 | 2) {
  const cfg = tankConfigObject(settings?.tankConfig)[`${kind}${tank}`] as SingleTankConfig | undefined;
  const density = kind === "bitumen" ? settings?.bitumenDensityKgPerL : 1;
  if (!positive(density)) return null;
  const factor = kind === "bitumen" ? density / 1000 : 1;
  if (cfg) {
    if (!positive(cfg.diameterCm)) return null;
    const valid = cfg.shape === "horizontal_cylinder" ? positive(cfg.lengthCm) :
      cfg.shape === "vertical_cylinder" ? positive(cfg.heightCm) :
      cfg.shape === "vertical_cone_top" && positive(cfg.cylinderHeightCm) && positive(cfg.coneHeightCm);
    if (!valid) return null;
    const maxDepth = getTankMaxDepth(cfg);
    const deadDepth = cfg.deadStockDepthCm ?? 0;
    if (!finite(deadDepth) || deadDepth < 0 || deadDepth > maxDepth) return null;
    const at = (cm: number) => calculateVolumeAtDepth(cfg, cm) * factor;
    return { at, maxDepth, capacity: at(maxDepth), deadStock: at(deadDepth) };
  }
  // Retain explicitly configured legacy linear calibration, but never invent
  // a calibration or a bitumen density from the shared fallback chart.
  const rate = tank === 1 ? settings?.bitumenTank1LitresPerCm : settings?.bitumenTank2LitresPerCm;
  if (kind === "bitumen" && positive(rate)) {
    return { at: (cm: number) => cm * rate * factor, maxDepth: Infinity, capacity: Infinity, deadStock: DEFAULT_DEAD_STOCK_DEPTH * rate * factor };
  }
  return null;
}
export function tankStockAtDip(settings: TankPlantSettings | null | undefined, kind: TankKind, tank: 1 | 2, cm: number): number | null {
  const cfg = calibration(settings, kind, tank);
  return cfg && finite(cm) && cm >= 0 && cm <= cfg.maxDepth ? cfg.at(cm) : null;
}
export type TankPositionRow = {
  materialName: string; partyName: string; partyId: number | null;
  tank1Mt?: number | null; tank2Mt?: number | null; tank1L?: number | null; tank2L?: number | null;
};
export type TankDipRow = {
  id?: number; date: string; time?: string | null; plantName?: string | null;
  tankNumber: number; depthCm: number; volumeLiters: number; weightKg?: number | null; readingType?: string;
};
export function tankBookStock(input: {
  kind: TankKind; tank: 1 | 2; positions?: TankPositionRow[]; readings?: TankDipRow[];
  settings?: TankPlantSettings | null; plantName: string; defaultPlantName: string;
}) {
  const { kind, tank, settings } = input;
  const matches = (name: string) => kind === "ldo" ? name.trim().toLowerCase() === "ldo" : /bitumen/i.test(name) && !/emulsion/i.test(name);
  const key = `tank${tank}${kind === "ldo" ? "L" : "Mt"}` as "tank1L" | "tank2L" | "tank1Mt" | "tank2Mt";
  const parties = (input.positions ?? []).filter(row => matches(row.materialName)).map(row => ({
    partyId: row.partyId, partyName: row.partyName, stock: finite(row[key]) ? row[key]! : null,
  }));
  const book = !input.positions || parties.some(row => row.stock == null) ? null : parties.reduce((sum, row) => sum + row.stock!, 0);
  const cfg = calibration(settings, kind, tank);
  let expectedDip: number | null = null;
  if (cfg && book != null && book >= 0 && book <= cfg.capacity) {
    if (cfg.maxDepth === Infinity) expectedDip = book / cfg.at(1);
    else {
      let low = 0, high = cfg.maxDepth;
      for (let i = 0; i < 60; i++) {
        const mid = (low + high) / 2;
        if (cfg.at(mid) < book) low = mid; else high = mid;
      }
      expectedDip = (low + high) / 2;
    }
  }
  const latest = (input.readings ?? []).filter(row =>
    row.tankNumber === tank && (row.plantName || input.defaultPlantName) === input.plantName,
  ).sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || "") || (b.id ?? 0) - (a.id ?? 0))[0] ?? null;
  const actualStock = latest ? kind === "ldo" ? (finite(latest.volumeLiters) ? latest.volumeLiters : null) :
    finite(latest.weightKg) ? latest.weightKg / 1000 : null : null;
  const difference = actualStock != null && book != null ? actualStock - book : null;
  const limit = kind === "ldo" ? dipWatchSettings(settings).ldoAllowedDifferenceL : dipWatchSettings(settings).bitumenAllowedDifferenceMt;
  return {
    book, parties, expectedDip, calibrationNeeded: !cfg,
    deadStock: cfg?.deadStock ?? null,
    usable: cfg && book != null ? Math.max(0, book - cfg.deadStock) : null,
    latest, actualStock, difference,
    overLimit: difference != null && Math.abs(difference) > limit + 1e-9,
  };
}
