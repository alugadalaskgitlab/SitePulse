import { buildDprEquipmentTableDetails } from "@/components/DprEquipmentTableDetails";
import { consumptionForReadOnlyRow, type ReadOnlyEquipmentRow } from "@/components/DprEquipmentReadOnlyRow";
import { mapAutoBillItem } from "@shared/vendorBillCandidates";
import type { BillExportCell } from "./wholeBillSnapshot";

/** Transient server-derived evidence. Never part of the bill save payload. */
export type EquipmentLogEvidence = {
  log: Omit<ReadOnlyEquipmentRow, "startTime" | "endTime"> & {
    startTime?: string | null; endTime?: string | null;
  };
  equipment: (NonNullable<Parameters<typeof buildDprEquipmentTableDetails>[1]> & {
    hireDieselResponsibility?: string | null;
  }) | null;
};
export const EQUIPMENT_LOG_COLUMNS = [
  "Opening reading", "Closing reading", "Meter hours/km", "Clock in", "Clock out",
  "Clock duration", "Diesel scope", "Diesel issued L", "Consumption", "Norm", "Deviation %",
] as const;
const finite = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const number = (value: number, decimals = 1) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: decimals });
const consumptionNumber = (value: number) =>
  value.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Retain enrichment when the existing shared candidate mapper copies a row.
 * Pricing, source identities and quantities still come exclusively from it. */
export function mapAutoBillItemWithEvidence(item: Parameters<typeof mapAutoBillItem>[0]) {
  return { ...mapAutoBillItem(item), equipmentLogEvidence: item.equipmentLogEvidence as EquipmentLogEvidence | null | undefined };
}

/** One projection for Description facts and whole-bill exports. DPR builders
 * remain authoritative for runtime, tank fuel, norm conversion and flags. */
export function projectEquipmentLogEvidence(evidence?: EquipmentLogEvidence | null) {
  const columns: Record<string, BillExportCell> = Object.fromEntries(EQUIPMENT_LOG_COLUMNS.map(key => [key, null]));
  if (!evidence?.log) return { columns, lines: [] as string[], consumption: null };
  const row: ReadOnlyEquipmentRow = {
    ...evidence.log, startTime: evidence.log.startTime ?? undefined, endTime: evidence.log.endTime ?? undefined,
  };
  const details = buildDprEquipmentTableDetails(row, evidence.equipment ?? undefined);
  const consumption = consumptionForReadOnlyRow(row, details);
  const opening = finite(row.openingReading);
  const closing = finite(row.closingReading);
  const runtime = finite(details.historicalUsage.runtime);
  const distance = details.historicalUsage.efficiencyUnit === "L/km";
  const readingsComplete = opening != null && closing != null && closing >= opening;
  const meterKnown = readingsComplete && runtime != null &&
    (details.preview.basis === "hour_meter" || details.preview.basis === "odometer");
  const stopped = row.usageStatus === "breakdown" || row.usageStatus === "idle_no_work" || row.usageStatus === "idle_no_operator";
  // Stored liability is distinct from dieselSource (purchase/tank provenance).
  const responsibility = evidence.equipment?.hireDieselResponsibility;
  const scope = responsibility?.trim().toLowerCase() === "hlc" ? "HLC"
    : responsibility?.trim().toLowerCase() === "vendor" ? "vendor" : null;
  const issued = finite(row.diesel);
  const lines: string[] = [];
  columns["Opening reading"] = opening;
  columns["Closing reading"] = closing;
  columns["Meter hours/km"] = meterKnown ? `${number(runtime)} ${distance ? "km" : "h"}` : null;
  if (meterKnown) lines.push(`${number(runtime)} ${distance ? "km" : "h meter"} (${number(opening)} → ${number(closing)})`);
  else {
    if (opening != null) lines.push(`Opening reading: ${number(opening)}`);
    if (closing != null) lines.push(`Closing reading: ${number(closing)}`);
  }
  columns["Clock in"] = row.startTime || null;
  columns["Clock out"] = row.endTime || null;
  columns["Clock duration"] = details.clockHours == null ? null : `${number(details.clockHours)} h`;
  if (row.startTime && row.endTime) lines.push(`${row.startTime} – ${row.endTime}${details.clockHours != null ? ` (${number(details.clockHours)} h)` : ""}`);
  else {
    if (row.startTime) lines.push(`Clock in: ${row.startTime}`);
    if (row.endTime) lines.push(`Clock out: ${row.endTime}`);
  }
  columns["Diesel scope"] = scope;
  columns["Diesel issued L"] = issued;
  if (scope) lines.push(`Diesel: ${scope}`);
  if (issued != null) lines.push(`${number(issued)} L`);
  // Unlike the general DPR audit view, the bill must omit consumption without
  // a norm or complete readings; stored hours alone cannot fill missing meters.
  const validConsumption = !stopped && readingsComplete && consumption.value != null && consumption.norm != null
    && consumption.reason == null;
  if (validConsumption) {
    columns["Consumption"] = `${consumptionNumber(consumption.value!)} ${consumption.displayUnit}`;
    columns["Norm"] = consumptionNumber(consumption.norm!);
    columns["Deviation %"] = consumption.deviationPct;
  }
  if (stopped) {
    const status = row.usageStatus === "breakdown" ? "Breakdown" : "Idle";
    const reason = row.usageStatusReason?.trim() || null;
    columns["Status"] = status;
    columns["Status reason"] = reason;
    lines.push(`${status}${reason ? ` — ${reason}` : ""}`);
  }
  return { columns, lines, consumption: validConsumption ? consumption : null };
}