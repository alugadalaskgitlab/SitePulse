import { Fragment, useState, type ComponentProps, type ReactNode } from "react";
import { buildDprEquipmentTableDetails, DprEquipmentTableDetails, DprEquipmentTableBreakdowns } from "@/components/DprEquipmentTableDetails";
import type { DprEquipmentFields } from "@/components/DprEquipmentCompact";
import type { DprActualEfficiency } from "@/lib/dprEquipmentEfficiency";
import { resolveDprRowConsumption } from "@shared/dprEquipmentConsumption";
import { resolveEquipmentBoqHours } from "@shared/equipmentActivityAllocations";
import { boqItemDisplayName } from "@shared/boqItemName";
import { formatEquipmentTime, formatEquipmentDuration } from "@shared/equipmentUsage";
import { breakdownDurationHours } from "@/components/BreakdownStoppageEditor";
import "@/components/dprEquipmentReadOnly.css";

type Details = ReturnType<typeof buildDprEquipmentTableDetails>;
type WorkProps = ComponentProps<typeof DprEquipmentTableDetails>;
export type ReadOnlyEquipmentRow = DprEquipmentFields & {
  id?: number; fuelStation?: string | null; billNumber?: string | null; amountPaid?: number | null;
};
type RowProps = {
  row: ReadOnlyEquipmentRow; equipment?: Parameters<typeof buildDprEquipmentTableDetails>[1];
  index: number; canonical?: DprActualEfficiency; lifecycleSlot?: ReactNode;
  linkedRows?: ComponentProps<typeof DprEquipmentTableBreakdowns>["linkedRows"];
  boqItems?: WorkProps["boqItems"]; programmeBars?: WorkProps["programmeBars"];
};
const finite = (value: unknown): number | null => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const n = (value: unknown, decimals = 1) => finite(value) == null ? "—" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fact = (value: unknown) => value == null || value === "" ? "—" : String(value);
const source = (value: unknown) => value === "direct_purchase" ? "Direct purchase" : value === "plant_stock" ? "Plant stock" : value === "contractor" ? "Contractor" : fact(value).replaceAll("_", " ");
const status = (row: ReadOnlyEquipmentRow) => row.usageStatus === "working" ? "Working"
  : row.usageStatus === "idle_no_work" ? "Idle · No work"
  : row.usageStatus === "idle_no_operator" ? "Idle · No operator"
  : row.usageStatus === "breakdown" ? "Breakdown" : "Not specified";
const hire: Record<string, string> = { hourly: "Hourly", daily: "Daily", monthly: "Monthly", trip_based: "Trip" };
function displayNorm(value: unknown, unit: string | null) {
  const rate = finite(value);
  if (rate == null) return "—";
  return unit === "L/km"
    ? rate > 0 ? `${n(1 / rate, 3)} km/L` : `Not convertible to km/L (saved raw norm ${n(rate, 3)})`
    : unit === "L/hr" ? `${n(rate, 3)} L/hr` : `${n(rate, 3)} (unit unavailable)`;
}
export function consumptionForReadOnlyRow(row: ReadOnlyEquipmentRow, details: Details, canonical?: DprActualEfficiency) {
  return resolveDprRowConsumption({
    runtime: details.historicalUsage.runtime, efficiencyUnit: details.historicalUsage.efficiencyUnit,
    dieselIssued: finite(row.diesel), actualConsumed: details.fuel.actualConsumed,
    dieselBalanceConfirmed: row.dieselBalanceConfirmed ?? null, norm: details.norm.value,
    savedNorm: finite(row.dieselNorm), canonical, openingReading: finite(row.openingReading),
    closingReading: finite(row.closingReading), dieselSource: row.dieselSource ?? null,
  });
}
function AuditFact({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}
export function DprEquipmentReadOnlyRow({ row, equipment, index, canonical, lifecycleSlot, linkedRows = [], boqItems = [], programmeBars }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const details = buildDprEquipmentTableDetails(row, equipment);
  const { historicalUsage, preview, fuel } = details;
  const consumption = consumptionForReadOnlyRow(row, details, canonical);
  const work = resolveEquipmentBoqHours(row as Parameters<typeof resolveEquipmentBoqHours>[0]);
  const distance = historicalUsage.efficiencyUnit === "L/km";
  const usageUnit = distance ? "km" : "h";
  const trip = row.entryType === "trip_based";
  const usage = trip
    ? `${n(row.numberOfTrips, 0)} trips × ${n(row.tripDistance)} km = ${n(historicalUsage.runtime)} km`
    : `${distance || preview.basis === "hour_meter" ? `${n(row.openingReading)} → ${n(row.closingReading)}` : `${formatEquipmentTime(row.startTime)} → ${formatEquipmentTime(row.endTime)}`} = ${n(historicalUsage.runtime)} ${usageUnit}`;
  const normUnit = historicalUsage.efficiencyUnit;
  const expected = finite(row.expectedDiesel);
  const issued = finite(row.diesel);
  const panelId = `equipment-audit-details-${index}`;
  return <Fragment>
    <tr className="equipment-summary-row" data-testid={`row-equipment-${index}`}>
      <td data-label="Machine">
        <strong>{row.machine || "Machine not recorded"}</strong>{row.vehicleNo && <span className="equipment-subtle"> {row.vehicleNo}</span>}
        <div className="equipment-subtle">{equipment?.ownership === "hired" ? `Hired · ${equipment.vendorName?.trim() || "Vendor not recorded"}` : equipment?.ownership === "owned" ? "Owned" : "Ownership not recorded"}{" "}
          {hire[row.entryType ?? ""] && <span className="equipment-tag">{hire[row.entryType ?? ""]}</span>}
        </div>
        <div className="equipment-subtle">Operator: {row.operator || "—"}</div>
        {row.usageStatus !== "working" && <div className="equipment-check">{status(row)}{row.usageStatusReason && ` · ${row.usageStatusReason}`}</div>}
      </td>
      <td data-label="Work">
        {work.length ? work.map((slice, i) => {
          const item = boqItems.find(item => item.id === slice.boqItemId);
          return <div key={i}>{item ? boqItemDisplayName(item) : `BOQ #${slice.boqItemId}`} <span className="equipment-subtle">{n(slice.hoursWorked)} h</span></div>;
        }) : row.resourceScope === "general" ? "General" : <span className="equipment-tag equipment-subtle">Not linked</span>}
        {row.task && <div className="equipment-subtle whitespace-pre-wrap">{row.task}</div>}
        {row.task?.trim() && !work.length && row.resourceScope !== "general" && <div className="equipment-check">Non-BOQ / Incidental Work — Not a BOQ item — not payable progress.</div>}
      </td>
      <td data-label="Usage" className="equipment-number">{usage}</td>
      <td data-label="Diesel">
        <strong className="equipment-number">{n(row.diesel)} L</strong>
        {details.isPlantStock && details.tankKnown && <div className="equipment-subtle">tank {n(row.openingDiesel)} → {n(row.dieselBalanceInTank)}{row.dieselBalanceConfirmed === true && " ✓"}</div>}
      </td>
      <td data-label="Consumption" data-testid={`equipment-consumption-${index}`}>
        {consumption.value != null ? <>
          <strong className="equipment-number">{n(consumption.value)} {consumption.displayUnit}</strong>{" "}
          <span className={`equipment-tag ${consumption.basis === "measured" ? "equipment-measured" : ""}`}>{consumption.basis === "measured" ? "measured ✓" : "issued"}</span>
          {consumption.norm != null && <div className="equipment-subtle">norm {n(consumption.norm)} {consumption.displayUnit}{" "}
            {consumption.flag === "ok" && <span className="equipment-ok" aria-label="Within 10% of norm">✓</span>}
            {consumption.flag === "worse" && <span className="equipment-worse">▲ {n(Math.abs(consumption.deviationPct ?? 0), 0)}%</span>}
            {consumption.flag === "better_check" && <span className="equipment-check">check ▼ {n(Math.abs(consumption.deviationPct ?? 0), 0)}%</span>}
          </div>}
        </> : <><strong>Incomplete</strong><div className="equipment-subtle">{consumption.reason}</div></>}
      </td>
      <td data-label="Notes">
          {(row.breakdowns ?? []).map((stop, i) => <div key={stop.clientKey ?? i}>{stop.description || "Stoppage"} · {formatEquipmentDuration(breakdownDurationHours(stop.fromTime ?? "", stop.toTime ?? "") ?? stop.downtimeHours)}</div>)}
        {row.dieselSource && <div>{source(row.dieselSource)}{row.dieselSource === "direct_purchase" && <>{row.fuelStation && ` · ${row.fuelStation}`}{row.billNumber && ` · bill ${row.billNumber}`}{row.amountPaid != null && ` · ₹${n(row.amountPaid, 2)}`}</>}</div>}
        {details.warning && <div className="equipment-check">{details.warning}</div>}
        <button type="button" className="equipment-details-toggle" aria-expanded={expanded} aria-controls={panelId} data-testid={`button-equipment-details-${index}`} onClick={() => setExpanded(value => !value)}>Details {expanded ? "▾" : "▸"}</button>
      </td>
      {lifecycleSlot !== undefined && <td className="equipment-lifecycle print:hidden" data-label="Lifecycle">{lifecycleSlot}</td>}
    </tr>
    <tr className="equipment-audit-row"><td colSpan={lifecycleSlot !== undefined ? 7 : 6} className="equipment-audit-cell">
      <div id={panelId} className="equipment-audit-panel" data-expanded={expanded} data-testid={`equipment-audit-details-${index}`}>
        <dl className="equipment-audit-grid">
          <AuditFact label="Machine day">{index + 1}</AuditFact>
          <AuditFact label="Entry / hire type">{fact(row.entryType).replaceAll("_", " ")}</AuditFact>
          <AuditFact label="Daily status">{row.usageStatus === "idle_no_work" ? "Idle · No Work Available" : row.usageStatus === "idle_no_operator" ? "Idle · Operator Unavailable" : status(row)}</AuditFact>
          <AuditFact label="Status reason">{fact(row.usageStatusReason)}</AuditFact>
          <AuditFact label="Breakdowns">{row.breakdowns?.length ?? 0}</AuditFact>
          <AuditFact label={distance ? "Opening / closing odometer" : "Opening / closing meter"}>{fact(row.openingReading)} / {fact(row.closingReading)}</AuditFact>
          <AuditFact label="Start / end time">{formatEquipmentTime(row.startTime)} / {formatEquipmentTime(row.endTime)}</AuditFact>
          <AuditFact label="Clock duration">{formatEquipmentDuration(details.clockHours)}</AuditFact>
          <AuditFact label="Saved operating quantity">{row.hoursWorked != null && `${n(row.hoursWorked, 3)} h`}{row.hoursWorked != null && row.totalKm != null && " · "}{row.totalKm != null && `${n(row.totalKm, 3)} km`}{row.hoursWorked == null && row.totalKm == null && "—"}</AuditFact>
          {(preview.runtime !== historicalUsage.runtime || preview.efficiencyUnit !== historicalUsage.efficiencyUnit) && <AuditFact label="Calculated preview quantity">{n(preview.runtime, 3)} {preview.efficiencyUnit === "L/km" ? "km" : "h"}</AuditFact>}
          <AuditFact label="Usage basis">{fact(preview.basis).replaceAll("_", " ")}</AuditFact>
          <AuditFact label="Trips / one-way distance">{fact(row.numberOfTrips)} / {n(row.tripDistance, 3)} km</AuditFact>
          <AuditFact label="Diesel issued">{n(row.diesel, 3)} L</AuditFact>
          <AuditFact label="Opening / closing tank">{n(row.openingDiesel, 3)} / {n(row.dieselBalanceInTank, 3)} L</AuditFact>
          <AuditFact label="Physical tank balance">{row.dieselBalanceConfirmed === true ? "Confirmed" : details.tankKnown ? "Pending confirmation" : "—"}</AuditFact>
          <AuditFact label="Saved expected diesel">{n(expected, 3)} L</AuditFact>
          <AuditFact label="Fuel-summary expected">{n(fuel.expectedDiesel, 3)} L</AuditFact>
          <AuditFact label="Issued − saved expected">{issued != null && expected != null ? `${n(issued - expected, 3)} L` : "—"}</AuditFact>
          <AuditFact label="Saved norm">{displayNorm(row.dieselNorm, normUnit)}</AuditFact>
          <AuditFact label="Current master norm (reference)">{displayNorm(details.norm.value, details.norm.unit)}</AuditFact>
          <AuditFact label="DPR snapshot consumed">{fuel.actualConsumed == null ? "Awaiting tank dip" : `${n(fuel.actualConsumed, 3)} L`}</AuditFact>
          <AuditFact label="DPR snapshot consumed − expected variance">{n(fuel.variance, 3)} L</AuditFact>
          <AuditFact label="Diesel source">{source(row.dieselSource)}</AuditFact>
          <AuditFact label="Fuel station / bill / amount">{fact(row.fuelStation)} / {fact(row.billNumber)} / {row.amountPaid == null ? "—" : `₹${n(row.amountPaid, 2)}`}</AuditFact>
          {canonical?.state === "available" && <AuditFact label="Canonical measured source">{canonical.provenance}</AuditFact>}
          <div className="equipment-audit-wide"><dt>Work assignments / segments</dt><dd>
            <DprEquipmentTableDetails section="work" row={row} details={details} index={index} boqItems={boqItems} programmeBars={programmeBars} showExplanations={false} />
          </dd></div>
          {!!row.activitySegments?.length && <div className="equipment-audit-wide"><dt>Saved segment links</dt><dd>
            {row.activitySegments.map((segment, segmentIndex) => <div key={segmentIndex}>
              Segment {segmentIndex + 1} · {formatEquipmentTime(segment.startTime)} → {formatEquipmentTime(segment.endTime)} · saved {n(segment.hoursWorked, 3)} h
              {segment.boqItems.map((link, linkIndex) => {
                const bar = programmeBars?.find(bar => bar.id === link.programmeBarId);
                return <div key={linkIndex}>BOQ #{link.boqItemId}{link.programmeBarId != null && ` · Programme #${link.programmeBarId}`}{bar?.reachLabel && ` · ${bar.reachLabel}`}{bar?.side && ` · ${bar.side}`}</div>;
              })}
            </div>)}
          </dd></div>}
          {!!row.activityAllocations?.length && <div className="equipment-audit-wide"><dt>Saved legacy allocations</dt><dd>
            {row.activityAllocations.map((allocation, allocationIndex) => <div key={allocationIndex}>BOQ #{allocation.boqItemId}{allocation.programmeBarId != null && ` · Programme #${allocation.programmeBarId}`} · {formatEquipmentTime(allocation.startTime)} → {formatEquipmentTime(allocation.endTime)} · saved {n(allocation.hoursWorked, 3)} h</div>)}
          </dd></div>}
          {row.boqItemId != null && <AuditFact label="Saved parent BOQ link">BOQ #{row.boqItemId}</AuditFact>}
          <div className="equipment-audit-wide"><dt>Breakdown / stoppage audit</dt><dd>
            <DprEquipmentTableBreakdowns stops={row.breakdowns ?? []} linkedRows={linkedRows} index={index} />
          </dd></div>
        </dl>
      </div>
    </td></tr>
  </Fragment>;
}
export function DprEquipmentReadOnlyTable({ children, rows, equipmentFor, canonicalFor, hasLifecycle = false }: {
  children: ReactNode; rows: ReadOnlyEquipmentRow[];
  equipmentFor: (row: ReadOnlyEquipmentRow) => RowProps["equipment"];
  canonicalFor?: (row: ReadOnlyEquipmentRow) => DprActualEfficiency;
  hasLifecycle?: boolean;
}) {
  const facts = rows.map(row => {
    const details = buildDprEquipmentTableDetails(row, equipmentFor(row));
    return { row, details, consumption: consumptionForReadOnlyRow(row, details, canonicalFor?.(row)) };
  });
  const sum = (values: (number | null)[]) => values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const quantities = (unit: string) => facts.filter(({ details }) => details.historicalUsage.efficiencyUnit === unit).map(({ details }) => finite(details.historicalUsage.runtime));
  const diesels = rows.map(row => finite(row.diesel));
  const expected = rows.map(row => finite(row.expectedDiesel));
  const differences = rows.map(row => finite(row.diesel) != null && finite(row.expectedDiesel) != null ? Number(row.diesel) - Number(row.expectedDiesel) : null);
  const incomplete = facts.some(({ consumption }) => consumption.basis === "incomplete");
  const total = (values: (number | null)[], unit: string) => `${n(sum(values), 3)} ${unit}${incomplete || values.some(value => value == null) ? " (incomplete)" : ""}`;
  return <div className="dpr-equipment-readonly">
    <table aria-label="Equipment Log"><thead><tr>{["Machine", "Work", "Usage", "Diesel", "Consumption", "Notes"].map(label => <th key={label} scope="col">{label}</th>)}{hasLifecycle && <th scope="col" className="equipment-lifecycle print:hidden">Lifecycle</th>}</tr></thead><tbody>{children}</tbody></table>
    <div className="equipment-totals" data-testid="equipment-totals">
      <span>Total · {rows.length} machine{rows.length === 1 ? "" : "s"}</span>
      <span>{total(quantities("L/hr"), "h")}</span><span>{total(quantities("L/km"), "km")}</span>
      <span>{total(diesels, "L")} issued</span><span>{total(expected, "L")} expected</span><span>{total(differences, "L")} issued − expected</span>
    </div>
    <p className="equipment-legend">Measured ✓ uses canonical confirmed performance when available, otherwise the confirmed DPR tank snapshot (opening + issued − closing). Issued uses diesel issued ÷ recorded usage; it can read high when the tank was topped up ahead. Vehicles use km/L. ✓ is within ±10% of norm; ▲ is more than 10% worse; amber check ▼ is more than 10% better — check diesel entries and readings. Clock duration and calculated previews are separate audit facts. Snapshot variance is consumed − expected; totals difference is issued − saved expected. Assignment validation uses machine-day clock duration; segments are clock times, and gaps and partial assignment are allowed. Meter working hours use opening/closing meter difference; vehicle distance uses odometer or recorded round trips.</p>
  </div>;
}