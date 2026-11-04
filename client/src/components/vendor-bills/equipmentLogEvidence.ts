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
  "Start reading", "End reading", "Start time", "End time", "Trips",
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

function currentLogQuantity(row: ReadOnlyEquipmentRow): number {
  const log = row as any;
  const entryType = String(log.entryType ?? "").toLowerCase();
  if (entryType === "shifting") return 1;
  const trips = finite(log.numberOfTrips);
  if (entryType === "trip_based" && trips) return trips;
  if (entryType === "daily" || entryType === "monthly") return 1;

  const opening = finite(log.openingReading);
  const closing = finite(log.closingReading);
  if (opening != null && closing != null && closing > opening) {
    return Math.round((closing - opening) * 100) / 100;
  }
  const hoursWorked = finite(log.hoursWorked);
  if (hoursWorked != null && hoursWorked > 0) return hoursWorked;
  const hoursOrKmRun = finite(log.hoursOrKmRun);
  if (hoursOrKmRun != null && hoursOrKmRun > 0) return hoursOrKmRun;

  const startTime = String(log.startTime ?? "");
  const endTime = String(log.endTime ?? "");
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if ([sh, sm, eh, em].every(Number.isFinite)) {
      const difference = (eh * 60 + em - sh * 60 - sm) / 60;
      if (difference > 0) return Math.round(difference * 100) / 100;
    }
  }
  // A persisted row can be edited down to zero after its bill was saved.
  return 0;
}

/** One projection for Description facts and whole-bill exports. DPR builders
 * remain authoritative for runtime, tank fuel, norm conversion and flags. */
export function projectEquipmentLogEvidence(
  evidence?: EquipmentLogEvidence | null,
  billedQty?: number | null,
  billedUnit?: string | null,
) {
  const columns: Record<string, BillExportCell> = Object.fromEntries(EQUIPMENT_LOG_COLUMNS.map(key => [key, null]));
  if (!evidence?.log) return { columns, lines: [] as string[], consumption: null, mismatchNote: null as string | null };
  const row: ReadOnlyEquipmentRow = {
    ...evidence.log, startTime: evidence.log.startTime ?? undefined, endTime: evidence.log.endTime ?? undefined,
  };
  const log = row as any;
  const details = buildDprEquipmentTableDetails(row, evidence.equipment ?? undefined);
  const consumption = consumptionForReadOnlyRow(row, details);
  const opening = finite(row.openingReading);
  const closing = finite(row.closingReading);
  const runtime = finite(details.historicalUsage.runtime);
  const meterType = String(evidence.equipment?.meterType ?? "").toLowerCase();
  const distance = meterType === "odometer" || details.historicalUsage.efficiencyUnit === "L/km";
  const readingsComplete = opening != null && closing != null && closing >= opening;
  const meterRun = readingsComplete && closing! > opening!
    ? Math.round((closing! - opening!) * 100) / 100
    : runtime;
  const meterKnown = readingsComplete && meterRun != null &&
    (meterType === "hour_meter" || meterType === "odometer" ||
      details.preview.basis === "hour_meter" || details.preview.basis === "odometer");
  const stopped = row.usageStatus === "breakdown" || row.usageStatus === "idle_no_work" || row.usageStatus === "idle_no_operator";
  // Stored liability is distinct from dieselSource (purchase/tank provenance).
  const responsibility = evidence.equipment?.hireDieselResponsibility;
  const scope = responsibility?.trim().toLowerCase() === "hlc" ? "HLC"
    : responsibility?.trim().toLowerCase() === "vendor" ? "vendor" : null;
  const issued = finite(row.diesel);
  const lines: string[] = [];
  const startTime = row.startTime || null;
  const endTime = row.endTime || null;
  const trips = finite(log.numberOfTrips);
  const tripDistance = finite(log.tripDistance);
  const totalKm = finite(log.totalKm);
  columns["Opening reading"] = opening;
  columns["Closing reading"] = closing;
  columns["Meter hours/km"] = meterKnown ? `${number(runtime!)} ${distance ? "km" : "h"}` : null;
  columns["Start reading"] = opening;
  columns["End reading"] = closing;
  if (readingsComplete) {
    const meterLabel = meterType === "hour_meter" ? "HMR" : meterType === "odometer" ? "ODO" : "Meter";
    lines.push(`${meterLabel} ${number(opening)} → ${number(closing)}${meterKnown && meterRun != null ? ` = ${number(meterRun)} ${distance ? "km" : "hrs"}` : ""}`);
  }
  else {
    if (opening != null) lines.push(`Start reading: ${number(opening)}`);
    if (closing != null) lines.push(`End reading: ${number(closing)}`);
  }
  columns["Clock in"] = startTime;
  columns["Clock out"] = endTime;
  columns["Clock duration"] = details.clockHours == null ? null : `${number(details.clockHours)} h`;
  columns["Start time"] = startTime;
  columns["End time"] = endTime;
  columns["Trips"] = trips;
  if (startTime && endTime) lines.push(`${startTime} – ${endTime}${details.clockHours != null ? ` (${number(details.clockHours)} h)` : ""}`);
  else {
    if (startTime) lines.push(`Start time: ${startTime}`);
    if (endTime) lines.push(`End time: ${endTime}`);
  }
  if (String(log.entryType ?? "").toLowerCase() === "trip_based" || log.tripBasedEntry === true) {
    if (trips != null && tripDistance != null) {
      lines.push(`${number(trips, 2)} trips × ${number(tripDistance)} km × 2 = ${number(trips * tripDistance * 2)} km`);
    } else {
      if (trips != null) lines.push(`${number(trips, 2)} trips`);
      if (tripDistance != null) lines.push(`One-way distance: ${number(tripDistance)} km`);
      else if (totalKm != null) lines.push(`Total distance: ${number(totalKm)} km`);
    }
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
  const currentQty = currentLogQuantity(row);
  const savedQty = finite(billedQty);
  const mismatchNote = savedQty != null && Math.abs(currentQty - savedQty) >= 0.005
    ? `Log now shows ${number(currentQty, 2)}${billedUnit?.trim() ? ` ${billedUnit.trim()}` : ""}`
    : null;
  return { columns, lines, consumption: validConsumption ? consumption : null, mismatchNote };
}