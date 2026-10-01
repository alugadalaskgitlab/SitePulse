import { useState, type ComponentProps, type ReactNode } from "react";
import type { DprEquipmentFields } from "@/components/DprEquipmentCompact";
import { computeEquipmentUsage } from "@/lib/equipmentUsage";
import {
  calculateEquipmentClockDuration, computeEquipmentFuelSummary,
  formatEquipmentDuration, formatEquipmentTime, resolveEquipmentConsumptionNormRate,
} from "@shared/equipmentUsage";
import { groupLegacyEquipmentActivityAllocations, resolveEquipmentAllocationParentDuration } from "@shared/equipmentActivityAllocations";
import { EquipmentActivityAllocationEditor } from "@/components/EquipmentActivityAllocationEditor";
import { breakdownDurationHours } from "@/components/BreakdownStoppageEditor";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { Badge } from "@/components/ui/badge";
import type { Attachment } from "@shared/schema";

type Equipment = ComponentProps<typeof import("@/components/DprEquipmentCompact").DprEquipmentCompact>["equipment"];
type AllocationProps = ComponentProps<typeof EquipmentActivityAllocationEditor>;
const dash = (value: unknown) => value == null || value === "" ? "—" : String(value);
const number = (value: number | null | undefined, decimals = 2) =>
  value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(decimals);

/** Presentation parity with the removed read-only cards, not a new management
 * efficiency calculation. Saved audit values remain separately in SiteReport. */
export function buildDprEquipmentTableDetails(row: DprEquipmentFields, equipment?: Equipment) {
  const preview = computeEquipmentUsage(equipment, row);
  const storedKm = row.totalKm == null ? null : Number(row.totalKm);
  const storedHours = row.hoursWorked == null ? null : Number(row.hoursWorked);
  // Match the compact read-only path's historical quantity precedence exactly.
  const historicalUsage = storedKm != null && Number.isFinite(storedKm) && storedKm >= 0
    ? { ...preview, runtime: storedKm, efficiencyUnit: "L/km" as const }
    : storedHours != null && Number.isFinite(storedHours) && storedHours >= 0
      ? { ...preview, runtime: storedHours, efficiencyUnit: "L/hr" as const }
      : preview;
  const isPlantStock = row.dieselSource === "plant_stock";
  const fuel = computeEquipmentFuelSummary(historicalUsage, {
    openingTank: isPlantStock ? row.openingDiesel : null,
    dieselIssued: row.diesel,
    closingTank: isPlantStock ? row.dieselBalanceInTank : null,
    expectedDiesel: row.expectedDiesel,
  });
  return {
    preview, fuel, isPlantStock,
    norm: resolveEquipmentConsumptionNormRate(equipment, historicalUsage),
    confirmedRate: row.dieselBalanceConfirmed === true && fuel.actualRate != null,
    tankKnown: isPlantStock && (row.openingDiesel != null || row.dieselBalanceInTank != null),
    clockHours: calculateEquipmentClockDuration(row.startTime, row.endTime),
    odometer: equipment?.meterType === "odometer",
    vendor: equipment?.ownership === "hired" ? `Hired: ${equipment.vendorName?.trim() || "Vendor not recorded"}` : null,
    warning: row.usageStatus === "idle_no_work" || row.usageStatus === "idle_no_operator" ? null : preview.warning,
    allocationParent: resolveEquipmentAllocationParentDuration({ startTime: row.startTime, endTime: row.endTime }),
    usingLegacyAssignment: !row.activitySegments?.length && !!row.activityAllocations?.length,
    activitySegments: Array.isArray(row.activitySegments) && (row.activitySegments.length > 0 || !row.activityAllocations?.length)
      ? row.activitySegments : groupLegacyEquipmentActivityAllocations(row.activityAllocations),
  };
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div><span className="font-medium">{label}: </span>{children}</div>;
}

type Details = ReturnType<typeof buildDprEquipmentTableDetails>;
export function DprEquipmentTableDetails({ section, row, details, index, boqItems, programmeBars, showLegacyRate = true }: {
  section: "identity" | "readings" | "quantity" | "tank" | "expected" | "performance" | "work";
  row: DprEquipmentFields; details: Details; index: number;
  boqItems?: AllocationProps["boqItems"]; programmeBars?: AllocationProps["programmeBars"];
  showLegacyRate?: boolean;
}) {
  const { preview, fuel } = details;
  let content: ReactNode;
  switch (section) {
    case "identity": {
      const status = row.usageStatus === "working" ? "Working"
        : row.usageStatus === "idle_no_work" ? "Idle · No Work Available"
        : row.usageStatus === "idle_no_operator" ? "Idle · Operator Unavailable"
        : row.usageStatus === "breakdown" ? "Breakdown" : "Not specified";
      content = <>
        <Line label="Machine day">{index + 1}</Line>
        {details.vendor && <Line label="Owner / vendor">{details.vendor}</Line>}
        <Line label="Entry / Hire Type">{dash(row.entryType).replaceAll("_", " ")}</Line>
        <Line label="Daily Status">{status}</Line>
        {row.usageStatusReason && <Line label="Status Reason">{row.usageStatusReason}</Line>}
        {!!row.breakdowns?.length && <Line label="Breakdowns">{row.breakdowns.length}</Line>}
        {details.warning && <div className="text-amber-800 dark:text-amber-300">Usage warning: {details.warning}</div>}
      </>;
      break;
    }
    case "readings":
      content = <>
        <Line label={details.odometer ? "Opening Odometer" : "Opening Meter"}>{dash(row.openingReading)}</Line>
        <Line label={details.odometer ? "Closing Odometer" : "Closing Meter"}>{dash(row.closingReading)}</Line>
        <Line label="Start Time">{formatEquipmentTime(row.startTime)}</Line>
        <Line label="End Time">{formatEquipmentTime(row.endTime)}</Line>
        <Line label="Clock Duration">{formatEquipmentDuration(details.clockHours)}</Line>
        <p className="text-muted-foreground">{details.odometer
          ? "Distance comes from the odometer or trip calculation. Clock duration is shown separately."
          : preview.basis === "hour_meter"
            ? "Meter Working Hours come from the opening and closing meter difference. Clock duration is shown separately."
            : "No hour-meter difference is available. Clock duration is shown separately and is not labelled as meter working time."}</p>
      </>;
      break;
    case "quantity":
      content = details.odometer || preview.totalKm != null
        ? <Line label="Calculated Distance">{preview.totalKm == null ? "—" : `${number(preview.totalKm)} km`}</Line>
        : <Line label="Meter Working Hours">{preview.basis === "hour_meter" && preview.hoursWorked != null ? `${number(preview.hoursWorked)} h` : "—"}</Line>;
      break;
    case "tank":
      content = <>
        <Line label="Diesel Issued / Added">{number(row.diesel)} L</Line>
        {details.isPlantStock && <>
          <Line label="Opening Tank (L)">{number(row.openingDiesel)} L</Line>
          <Line label="Closing Tank / Physical Dip (L)">{number(row.dieselBalanceInTank)} L</Line>
          <Line label="Physical Tank Balance">{row.dieselBalanceConfirmed ? "Confirmed" : details.tankKnown ? "Pending confirmation" : "—"}</Line>
          {details.tankKnown && !row.dieselBalanceConfirmed && <p className="text-amber-800 dark:text-amber-300">Physical tank balance has not been confirmed.</p>}
        </>}
      </>;
      break;
    case "expected":
      content = details.isPlantStock && <Line label="Fuel-summary expected">{fuel.expectedDiesel == null ? "—" : `${number(fuel.expectedDiesel)} L`}</Line>;
      break;
    case "performance":
      content = details.isPlantStock && <>
        <Line label={showLegacyRate ? "Actual Consumed" : "DPR snapshot consumed"}>{fuel.actualConsumed == null ? "Awaiting tank dip" : `${number(fuel.actualConsumed)} L`}</Line>
        <Line label={showLegacyRate ? "Consumed − expected variance" : "DPR snapshot consumed − expected variance"}>{fuel.variance == null ? "—" : `${fuel.variance > 0 ? "+" : ""}${number(fuel.variance)} L`}</Line>
        {showLegacyRate && <Line label={details.confirmedRate ? "Actual Consumption Rate · from confirmed tank dip" : "Expected Consumption Rate · from norm, actual unavailable"}>
          {details.confirmedRate ? `${number(fuel.actualRate)} ${fuel.actualRateUnit}` : details.norm.value == null ? "—" : `${number(details.norm.value)} ${details.norm.unit}`}
        </Line>}
        {!showLegacyRate && !details.confirmedRate && details.norm.value != null && <Line label="Current master norm (reference)">
          {number(details.norm.value)} {details.norm.unit}
        </Line>}
        <p className="text-muted-foreground">{showLegacyRate ? "Variance is actual consumed minus expected" : "These fuel facts use the saved DPR snapshot, not the canonical performance record"}; a positive variance means more fuel was consumed than expected.</p>
      </>;
      break;
    case "work":
      content = <>
        {row.task?.trim() && <p className="text-amber-800 dark:text-amber-300">Non-BOQ / Incidental Work — Not a BOQ item — not payable progress.</p>}
        <EquipmentActivityAllocationEditor value={details.activitySegments} editable={false}
          parentHours={details.allocationParent.hours} parentStartTime={row.startTime} parentEndTime={row.endTime}
          boqItems={boqItems} programmeBars={programmeBars} preserveInitialValueUntilChange={details.usingLegacyAssignment} />
      </>;
      break;
  }
  return content ? <div className="mt-2 space-y-1 whitespace-normal text-xs font-normal" data-testid={`equipment-table-${section}-${index}`}>{content}</div> : null;
}

type Stop = NonNullable<DprEquipmentFields["breakdowns"]>[number] & { maintenanceLogId?: number };
type Maintenance = {
  id: number; status?: string; fromTime?: string | null; toTime?: string | null; downtimeHours?: number | null;
  description?: string; responsibility?: string | null;
};

// Keep the same viewer eligibility as the compact read-only renderer.
function isViewableAttachment(value: unknown): value is Attachment {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "number" && Number.isInteger(item.id) && item.id > 0
    && typeof item.moduleType === "string" && !!item.moduleType
    && typeof item.linkedRecordId === "number" && Number.isInteger(item.linkedRecordId)
    && typeof item.fileName === "string" && !!item.fileName
    && typeof item.objectPath === "string" && !!item.objectPath;
}

/** Enriched DPR stops remain authoritative, including an explicitly empty
 * list. Independently fetched maintenance facts retain their own status. */
export function DprEquipmentTableBreakdowns({ stops, linkedRows, index }: {
  stops: Stop[]; linkedRows: Maintenance[]; index: number;
}) {
  const [viewedAttachment, setViewedAttachment] = useState<Attachment | null>(null);
  const matched = new Set<number>();
  const linkedFor = (stop: Stop) => {
    const maintenanceId = stop.maintenanceLogId
      ?? (stop.clientKey?.startsWith("maintenance-") ? Number(stop.clientKey.slice("maintenance-".length)) : stop.id);
    const match = linkedRows.find(log => !matched.has(log.id) && (maintenanceId != null
      ? log.id === maintenanceId
      : !!stop.description && log.description === stop.description
        && (log.fromTime ?? "") === (stop.fromTime ?? "") && (log.toTime ?? "") === (stop.toTime ?? "")));
    if (match) matched.add(match.id);
    return match;
  };
  return <div className="space-y-3 whitespace-normal" data-testid={`equipment-table-breakdowns-${index}`}>
    {stops.map((stop, stopIndex) => {
      const duration = breakdownDurationHours(stop.fromTime ?? "", stop.toTime ?? "") ?? stop.downtimeHours;
      const log = linkedFor(stop);
      const savedAttachment = stop.attachment;
      return <div key={stop.clientKey ?? stop.id ?? stopIndex} className="space-y-1" data-testid={`equipment-table-stop-${index}-${stopIndex}`}>
        <p className="font-semibold">{dash(stop.description)}</p>
        <p>{formatEquipmentTime(stop.fromTime)}–{formatEquipmentTime(stop.toTime)} · {formatEquipmentDuration(duration)}</p>
        <p>Responsibility: {dash(stop.responsibility)} · Repair/payment scope: {dash(stop.repairScope)} · Debitable to vendor: {stop.debitableToVendor ? "Yes" : "No"}</p>
        {!!stop.remarks && <p className="whitespace-pre-wrap">Remarks: {stop.remarks}</p>}
        {log && <div className="text-xs text-muted-foreground">
          <Badge variant={log.status === "resolved" ? "outline" : "secondary"}>{log.status}</Badge>
          <span className="ml-1">Linked maintenance: {log.fromTime && log.toTime ? `${log.fromTime}–${log.toTime} (${log.downtimeHours ?? "-"} h)` : `${log.downtimeHours ?? "-"} h`}</span>
          {log.description !== stop.description && <div>{log.description}</div>}
          {log.responsibility && log.responsibility !== stop.responsibility && <div>Linked responsibility: {String(log.responsibility).toUpperCase()}</div>}
        </div>}
        {stop.file && <p>Selected: {stop.file.name} (not uploaded)</p>}
        {!stop.file && savedAttachment && (isViewableAttachment(savedAttachment)
          ? <button type="button" className="text-amber-700 underline" onClick={() => setViewedAttachment(savedAttachment)}>View attachment: {savedAttachment.fileName}</button>
          : typeof savedAttachment.fileName === "string" ? <p>Saved attachment: {savedAttachment.fileName}</p> : null)}
      </div>;
    })}
    {linkedRows.filter(log => !matched.has(log.id)).map(log => <div key={log.id} className="text-xs" data-testid={`equipment-table-linked-maintenance-${log.id}`}>
      <p className="text-muted-foreground">Linked maintenance record</p>
      <Badge variant={log.status === "resolved" ? "outline" : "secondary"}>{log.status}</Badge>
      <span className="ml-1">{log.fromTime && log.toTime ? `${log.fromTime}–${log.toTime} (${log.downtimeHours ?? "-"} h)` : `${log.downtimeHours ?? "-"} h`}</span>
      <div className="text-muted-foreground">{log.description}{log.responsibility ? ` · ${String(log.responsibility).toUpperCase()}` : ""}</div>
    </div>)}
    {stops.length === 0 && linkedRows.length === 0 && "—"}
    <AttachmentViewer attachment={viewedAttachment} onClose={() => setViewedAttachment(null)} />
  </div>;
}