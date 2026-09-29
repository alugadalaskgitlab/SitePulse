import { useState } from "react";
import { calculateEquipmentAllocationHours, calculateEquipmentClockDuration, computeEquipmentFuelSummary, computeEquipmentUsage, formatEquipmentDuration, formatEquipmentTime, resolveEquipmentAllocationParentDuration, resolveEquipmentConsumptionNormRate } from "./_shared/equipmentMath";
import "./_group.css";

// Field names, allocation structure and staged breakdown shape are isolated from
// DprEquipmentCompact, EquipmentActivityAllocationEditor and BreakdownStoppageEditor.
type Segment = { startTime: string; endTime: string; hoursWorked?: number; boqItems: { boqItemId: number; programmeBarId?: number | null }[] };
type Stoppage = { clientKey: string; fromTime: string; toTime: string; description: string; responsibility: "vendor" | "hlc" | ""; repairScope: "vendor" | "hlc" | ""; debitableToVendor: boolean; remarks: string; file?: File };
type Row = {
  equipmentId: number; machine: string; vehicleNo: string; operator: string; entryType: string;
  startTime: string; endTime: string; openingReading: number | null; closingReading: number | null;
  dieselSource: string; diesel: number | null; openingDiesel: number | null; dieselBalanceInTank: number | null;
  dieselBalanceConfirmed: boolean; expectedDiesel: number | null; task: string;
  usageStatus: "idle_no_work" | "idle_no_operator" | "breakdown" | null; usageStatusReason: string;
  activitySegments: Segment[]; breakdowns: Stoppage[];
  hoursWorked?: number | null; totalKm?: number | null;
};
type Machine = { id: number; name: string; registrationNumber: string; ownership: "hired" | "owned"; vendorName?: string; meterType: "hour_meter" | "odometer"; consumptionNorm: number; entryType: string; hireTerms?: string; dieselSource: string };
const machines: Machine[] = [
  { id: 41, name: "JCB 3DX Backhoe Loader", registrationNumber: "MH 12 QF 7832", ownership: "hired", vendorName: "Sahyadri Earthmovers", meterType: "hour_meter", consumptionNorm: 5.6, entryType: "hourly", hireTerms: "Hourly hire", dieselSource: "plant_stock" },
  { id: 58, name: "Tata Signa Tipper", registrationNumber: "MH 14 HG 5186", ownership: "owned", meterType: "odometer", consumptionNorm: 0.34, entryType: "time_meter", dieselSource: "direct_purchase" },
  { id: 63, name: "Dynapac Soil Compactor", registrationNumber: "MH 12 KY 2041", ownership: "hired", vendorName: "Kedar Plant Hire", meterType: "hour_meter", consumptionNorm: 6.8, entryType: "daily", hireTerms: "Daily hire", dieselSource: "contractor" },
];
const boqItems = [
  { id: 241, label: "3.02 · Excavation in ordinary soil" },
  { id: 242, label: "4.11 · Granular sub-base, 200 mm" },
  { id: 243, label: "6.04 · Embankment formation" },
  { id: 244, label: "8.01 · Bituminous base course" },
];
const sampleRows: Record<number, Row> = {
  41: { equipmentId: 41, machine: machines[0].name, vehicleNo: machines[0].registrationNumber, operator: "Prakash More", entryType: "hourly", startTime: "08:30", endTime: "17:15", openingReading: 1482.4, closingReading: 1490.1, dieselSource: "plant_stock", openingDiesel: 32.5, diesel: 44, dieselBalanceInTank: 33.2, dieselBalanceConfirmed: true, expectedDiesel: null, task: "Cleared access at culvert approach", usageStatus: null, usageStatusReason: "", activitySegments: [{ startTime: "08:30", endTime: "12:30", boqItems: [{ boqItemId: 241, programmeBarId: 301 }] }, { startTime: "13:15", endTime: "17:15", boqItems: [{ boqItemId: 243, programmeBarId: 303 }] }], breakdowns: [] },
  58: { equipmentId: 58, machine: machines[1].name, vehicleNo: machines[1].registrationNumber, operator: "Suresh Jadhav", entryType: "time_meter", startTime: "07:45", endTime: "16:30", openingReading: 38106.2, closingReading: 38194.7, dieselSource: "direct_purchase", openingDiesel: null, diesel: 29.5, dieselBalanceInTank: null, dieselBalanceConfirmed: false, expectedDiesel: null, task: "", usageStatus: null, usageStatusReason: "", activitySegments: [{ startTime: "07:45", endTime: "16:30", boqItems: [{ boqItemId: 242, programmeBarId: 302 }] }], breakdowns: [] },
  63: { equipmentId: 63, machine: machines[2].name, vehicleNo: machines[2].registrationNumber, operator: "Nilesh Patil", entryType: "daily", startTime: "09:00", endTime: "16:00", openingReading: 608.3, closingReading: 612.8, dieselSource: "contractor", openingDiesel: null, diesel: 31, dieselBalanceInTank: null, dieselBalanceConfirmed: false, expectedDiesel: null, task: "", usageStatus: null, usageStatusReason: "", activitySegments: [{ startTime: "09:00", endTime: "12:15", boqItems: [{ boqItemId: 243, programmeBarId: 303 }] }], breakdowns: [{ clientKey: "sample-1", fromTime: "12:15", toTime: "14:45", description: "Hydraulic hose leak", responsibility: "vendor", repairScope: "vendor", debitableToVendor: true, remarks: "Replaced on site" }] },
};
const statusLabel: Record<NonNullable<Row["usageStatus"]>, string> = { idle_no_work: "Idle · No Work Available", idle_no_operator: "Idle · Operator Unavailable", breakdown: "Breakdown" };
const sourceLabel: Record<string, string> = { plant_stock: "Plant stock", direct_purchase: "Direct purchase", contractor: "Contractor" };
const typeLabel: Record<string, string> = { time_meter: "Time / Meter Reading", hourly: "Hourly Hire", daily: "Daily Hire", trip_based: "Trip Based", monthly: "Monthly Hire" };
const fmt = (n: number | null | undefined, unit = "") => n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(2)}${unit}`;
const field = (label: string, value: string, mono = false) => <dl className="datum"><dt>{label}</dt><dd className={mono ? "mono" : ""}>{value}</dd></dl>;
const heading = (index: string, title: string, detail?: string) => <div className="group-head"><strong><span className="row-index">{index} / </span>{title}</strong>{detail && <span className="micro">{detail}</span>}</div>;
const newStagedBreakdown = (): Stoppage => ({ clientKey: crypto.randomUUID(), fromTime: "", toTime: "", description: "", responsibility: "", repairScope: "", debitableToVendor: false, remarks: "" });

function AllocationEditor({ row, onChange, editable }: { row: Row; onChange: (next: Segment[]) => void; editable: boolean }) {
  const value = row.activitySegments;
  const parentHours = resolveEquipmentAllocationParentDuration(row).hours;
  const allocated = value.reduce((sum, segment) => sum + (calculateEquipmentAllocationHours(segment.startTime, segment.endTime) ?? 0), 0);
  const patchSegment = (index: number, patch: Partial<Segment>) => onChange(value.map((item, i) => i === index ? { ...item, ...patch } : item));
  const patchBoqItem = (si: number, bi: number, id: number) => patchSegment(si, { boqItems: value[si].boqItems.map((item, i) => i === bi ? { boqItemId: id, programmeBarId: id ? id + 60 : null } : item) });
  if (!editable) return <div>
    {value.length ? value.map((segment, i) => <div className="allocation" key={i}>
      {segment.boqItems.map((item, j) => <div key={j} style={{ fontSize: 12, fontWeight: 700 }}>{boqItems.find(b => b.id === item.boqItemId)?.label ?? "BOQ activity unavailable"}</div>)}
      <div className="hint mono">{formatEquipmentTime(segment.startTime)} → {formatEquipmentTime(segment.endTime)} · {formatEquipmentDuration(segment.hoursWorked ?? calculateEquipmentAllocationHours(segment.startTime, segment.endTime))}</div>
    </div>) : <p className="hint">No BOQ item assigned to this machine day.</p>}
    <p className="hint">Assigned: {formatEquipmentDuration(allocated)} · Unassigned: {formatEquipmentDuration(parentHours == null ? null : Math.max(0, parentHours - allocated))} · Machine day: {formatEquipmentDuration(parentHours)}</p>
  </div>;
  return <div>
    <p className="hint" style={{ margin: "-4px 0 9px" }}>Physical work segments · BOQ only <span className="mono">· {formatEquipmentDuration(allocated)} assigned / {formatEquipmentDuration(parentHours)}</span></p>
    {value.map((segment, si) => {
      const warnings: string[] = [];
      if (!segment.startTime) warnings.push("Enter Start Time.");
      if (!segment.endTime) warnings.push("Enter End Time.");
      if (segment.startTime && segment.endTime && calculateEquipmentAllocationHours(segment.startTime, segment.endTime) == null) warnings.push("End Time must be later than Start Time.");
      if (row.startTime && segment.startTime && segment.startTime < row.startTime) warnings.push("Start Time cannot be before the machine-day Start Time.");
      if (row.endTime && segment.endTime && segment.endTime > row.endTime) warnings.push("End Time cannot be after the machine-day End Time.");
      if (allocated > (parentHours ?? Infinity)) warnings.push("Assigned time exceeds the machine-day Clock Duration.");
      if (value.some((other, i) => i !== si && segment.startTime && segment.endTime && other.startTime && other.endTime && segment.startTime < other.endTime && segment.endTime > other.startTime)) warnings.push("This time segment overlaps another segment.");
      if (segment.boqItems.some(item => !item.boqItemId)) warnings.push("Select a BOQ Item.");
      if (new Set(segment.boqItems.map(item => item.boqItemId).filter(Boolean)).size !== segment.boqItems.filter(item => item.boqItemId).length) warnings.push("The same BOQ Item is assigned more than once in this segment.");
      return <div className="allocation" key={si}>
        <div className="fields">
          <label className="field"><span>BOQ Item</span><select value={segment.boqItems[0]?.boqItemId || ""} onChange={e => patchBoqItem(si, 0, Number(e.target.value))}><option value="">Select BOQ Item</option>{boqItems.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="field"><span>Start Time</span><input type="time" value={segment.startTime} onChange={e => patchSegment(si, { startTime: e.target.value, hoursWorked: undefined })} /></label>
          <label className="field"><span>End Time</span><input type="time" value={segment.endTime} onChange={e => patchSegment(si, { endTime: e.target.value, hoursWorked: undefined })} /></label>
        </div>
        <p className="hint">Segment Duration <strong className="mono">{formatEquipmentDuration(calculateEquipmentAllocationHours(segment.startTime, segment.endTime))}</strong></p>
        {segment.boqItems.slice(1).map((item, additionalIndex) => <div key={additionalIndex} className="allocation-actions">
          <label className="field" style={{ flex: 1 }}><span>Additional BOQ Item</span><select value={item.boqItemId || ""} onChange={e => patchBoqItem(si, additionalIndex + 1, Number(e.target.value))}><option value="">Select BOQ Item</option>{boqItems.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <button type="button" aria-label="Remove additional BOQ item" onClick={() => patchSegment(si, { boqItems: segment.boqItems.filter((_, i) => i !== additionalIndex + 1) })}>Remove BOQ item</button>
        </div>)}
        <div className="allocation-actions"><button type="button" onClick={() => patchSegment(si, { boqItems: [...segment.boqItems, { boqItemId: 0, programmeBarId: null }] })}>+ Add BOQ Item</button><span className="spacer" /><button type="button" onClick={() => onChange(value.filter((_, i) => i !== si))}>Remove segment</button></div>
        {warnings.map((warning, i) => <p className="warning" key={i}>{warning}</p>)}
      </div>;
    })}
    <button type="button" className="minor" onClick={() => onChange([...value, { startTime: value.at(-1)?.endTime || (!value.length ? row.startTime : ""), endTime: !value.length ? row.endTime : "", boqItems: [{ boqItemId: 0, programmeBarId: null }] }])}>{value.length ? "+ Add Item" : "Assign Item"}</button>
    {!value.length && <p className="hint">No BOQ item assigned to this machine day.</p>}
  </div>;
}

function Stoppages({ value, onChange }: { value: Stoppage[]; onChange: (next: Stoppage[]) => void }) {
  const patch = (index: number, item: Partial<Stoppage>) => onChange(value.map((row, i) => i === index ? { ...row, ...item } : row));
  return <div>
    <button type="button" className="minor" onClick={() => onChange([...value, newStagedBreakdown()])}>+ Add stoppage</button>
    <p className="hint">Sample-only entry point from SiteEntry → BreakdownStoppageEditor. No draft save, upload, or maintenance-ledger action.</p>
    {value.map((s, index) => <div className="breakdown-line" key={s.clientKey}>
      <div className="fields four">
        <label className="field"><span>From time</span><input type="time" value={s.fromTime} onChange={e => patch(index, { fromTime: e.target.value })} /></label>
        <label className="field"><span>To time</span><input type="time" value={s.toTime} onChange={e => patch(index, { toTime: e.target.value })} /></label>
        {field("Duration", formatEquipmentDuration(calculateEquipmentAllocationHours(s.fromTime, s.toTime)))}
        <div style={{ alignSelf: "end" }}><button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove</button></div>
      </div>
      <div className="fields two" style={{ marginTop: 8 }}>
        <label className="field"><span>Reason</span><input value={s.description} onChange={e => patch(index, { description: e.target.value })} /></label>
        <label className="field"><span>Responsibility</span><select value={s.responsibility} onChange={e => patch(index, { responsibility: e.target.value as Stoppage["responsibility"] })}><option value="">Not specified</option><option value="vendor">Vendor</option><option value="hlc">HLC</option></select></label>
        <label className="field"><span>Repair/payment scope</span><select value={s.repairScope} onChange={e => patch(index, { repairScope: e.target.value as Stoppage["repairScope"] })}><option value="">Not specified</option><option value="vendor">Vendor's scope</option><option value="hlc">HLC's scope</option></select></label>
        <label className="field"><span>Photo/document · local sample only</span><input type="file" onChange={e => { if (e.target.files?.[0]) patch(index, { file: e.target.files[0] }); }} /></label>
      </div>
      {s.file && <p className="hint">Selected: {s.file.name} (not uploaded)</p>}
      <label className="tick"><input type="checkbox" checked={s.debitableToVendor} onChange={e => patch(index, { debitableToVendor: e.target.checked })} />Debitable to vendor</label>
      <label className="field"><span>Remarks</span><textarea value={s.remarks} onChange={e => patch(index, { remarks: e.target.value })} /></label>
    </div>)}
  </div>;
}

export function EquipmentRows() {
  const [selectedId, setSelectedId] = useState(41);
  const [rows, setRows] = useState<Record<number, Row>>(sampleRows);
  const [showStoppages, setShowStoppages] = useState(false);
  const machine = machines.find(item => item.id === selectedId)!;
  const row = rows[selectedId];
  const patch = (next: Partial<Row>) => setRows(current => ({ ...current, [selectedId]: { ...current[selectedId], ...next } }));
  const changeMachine = (id: number) => { setSelectedId(id); setShowStoppages(false); };
  const isPlant = row.dieselSource === "plant_stock";
  const usage = computeEquipmentUsage(machine, row);
  // DprEquipmentCompact read-side fallback: stored duration/distance is used
  // for historical display only when preview runtime is not available.
  const historicalUsage = row.totalKm != null ? { ...usage, runtime: row.totalKm, efficiencyUnit: "L/km" as const }
    : row.hoursWorked != null ? { ...usage, runtime: row.hoursWorked, efficiencyUnit: "L/hr" as const } : usage;
  const fuel = computeEquipmentFuelSummary(historicalUsage, { openingTank: isPlant ? row.openingDiesel : null, dieselIssued: row.diesel, closingTank: isPlant ? row.dieselBalanceInTank : null, expectedDiesel: row.expectedDiesel });
  const norm = resolveEquipmentConsumptionNormRate(machine, historicalUsage);
  const hasActualRate = row.dieselBalanceConfirmed === true && fuel.actualRate != null;
  const clock = calculateEquipmentClockDuration(row.startTime, row.endTime);
  const owner = machine.ownership === "hired" ? machine.vendorName || "Vendor not recorded" : "HLC own";
  const hasPositiveMeterDelta = typeof row.openingReading === "number" && Number.isFinite(row.openingReading)
    && typeof row.closingReading === "number" && Number.isFinite(row.closingReading)
    && row.closingReading > row.openingReading;
  const status = row.usageStatus
    ? statusLabel[row.usageStatus]
    : hasPositiveMeterDelta ? "Working" : "Not specified";
  const statusReasonRequired = row.usageStatus === "idle_no_work" || row.usageStatus === "breakdown";
  const statusReasonVisible = statusReasonRequired && row.usageStatusReason.trim().length > 0;
  const changeUsageStatus = (value: string) => {
    const usageStatus = (value || null) as Row["usageStatus"];
    patch({
      usageStatus,
      ...(usageStatus === null || usageStatus === "idle_no_operator" ? { usageStatusReason: "" } : {}),
    });
  };
  const numberInput = (label: string, key: "openingReading" | "closingReading" | "openingDiesel" | "diesel" | "dieselBalanceInTank") => <label className="field"><span>{label}</span><input type="number" step="0.1" value={row[key] ?? ""} placeholder="Not recorded" onChange={e => patch({ [key]: e.target.value === "" ? null : Number(e.target.value) })} /></label>;
  const tankKnown = isPlant && (row.openingDiesel != null || row.dieselBalanceInTank != null);
  return <main className="dpr17"><div className="wrap">
    <div className="mast"><div><div className="eyebrow">SitePulse / DPR form study · 17</div><h1>Equipment log · grouped rows</h1><p>One machine day, two perspectives. Change an entry on the left to review it on the right.</p></div><div className="sample">SAMPLE DATA ONLY · Interactive layout review. No API, upload, real save, submit or maintenance-ledger update.</div></div>
    <div className="columns">
      <section className="card" aria-label="Editable equipment card">
        <div className="card-header"><div><small>01 / Entry surface</small><h2>Edit machine day</h2></div><span className={`status ${row.usageStatus === "breakdown" ? "warn" : ""}`}>{status}</span></div>
        <div className="group">{heading("01", "Equipment picker")}<label className="field"><span>Equipment</span><select aria-label="Select equipment" value={selectedId} onChange={e => changeMachine(Number(e.target.value))}>{machines.map(item => <option key={item.id} value={item.id}>{item.name} ({item.registrationNumber}) — {item.ownership === "hired" ? `HIRED: ${item.vendorName}` : "HLC OWN"}</option>)}</select></label></div>
        <div className="group">{heading("02", "Owner / hire type", "Master-data context")}<div className="fields four">{field(machine.ownership === "hired" ? "Owner / vendor" : "Ownership", owner)}{machine.ownership === "hired" && field("Master default hire type", typeLabel[machine.entryType] || machine.entryType)}{field("Operator", row.operator || "—")}</div>
          {machine.ownership === "hired" && <div className="subarea fields two"><label className="field"><span>Hire type for this DPR row</span><select aria-label="Hire type for this DPR row" value={row.entryType} onChange={e => patch({ entryType: e.target.value })}>{["time_meter", "hourly", "daily", "trip_based", "monthly"].map(v => <option key={v} value={v}>{typeLabel[v]}</option>)}</select></label></div>}
          <div className="subarea">
            <label className="field"><span>Daily status</span><select value={row.usageStatus ?? ""} onChange={e => changeUsageStatus(e.target.value)}>
              <option value="">Not specified</option>
              <option value="idle_no_operator">{statusLabel.idle_no_operator}</option>
              <option value="idle_no_work">{statusLabel.idle_no_work}</option>
              <option value="breakdown">Breakdown · machine-day disposition</option>
            </select></label>
            {statusReasonRequired && <label className="field" style={{ marginTop: 9 }}><span>Reason <strong>(required)</strong></span><input value={row.usageStatusReason} aria-required="true" aria-invalid={!row.usageStatusReason.trim()} onChange={e => patch({ usageStatusReason: e.target.value })} placeholder={row.usageStatus === "breakdown" ? "Explain the machine-day breakdown disposition" : "Explain why no work was available"} /></label>}
            {statusReasonRequired && !row.usageStatusReason.trim() && <p className="warning">A reason is required for this status.</p>}
            <p className="hint">Breakdown here describes the machine day. Timed stoppages below record individual interruptions; a partial stoppage does not make the whole day a breakdown.</p>
          </div>
        </div>
        <div className="group">{heading("03", "Readings & times", `${formatEquipmentDuration(clock)} clock duration`)}<div className="fields four">{numberInput(machine.meterType === "odometer" ? "Opening odometer" : "Opening meter", "openingReading")}{numberInput(machine.meterType === "odometer" ? "Closing odometer" : "Closing meter", "closingReading")}<label className="field"><span>Start time</span><input type="time" value={row.startTime} onChange={e => patch({ startTime: e.target.value })} /></label><label className="field"><span>End time</span><input type="time" value={row.endTime} onChange={e => patch({ endTime: e.target.value })} /></label></div><p className="hint">{machine.meterType === "odometer" ? `Distance: ${fmt(usage.totalKm, " km")}` : `Meter working hours: ${usage.basis === "hour_meter" ? fmt(usage.hoursWorked, " h") : "—"}`} · Clock duration shown separately. {usage.warning}</p></div>
        <div className="group">{heading("04", "Diesel & tank", isPlant ? "Physical tank balance" : "Tank not applicable")}<div className="fields five"><div className="field"><span className="hint">Diesel source</span><span className="chip">{sourceLabel[row.dieselSource] ?? row.dieselSource}</span></div>{isPlant ? numberInput("Opening tank (L)", "openingDiesel") : field("Opening tank", "Not applicable")}{numberInput("Diesel issued / added (L)", "diesel")}{isPlant ? numberInput("Closing / physical dip (L)", "dieselBalanceInTank") : field("Closing tank", "Not applicable")}{isPlant ? <label className="tick"><input type="checkbox" checked={row.dieselBalanceConfirmed} onChange={e => patch({ dieselBalanceConfirmed: e.target.checked })} />Physical tank balance confirmed</label> : field("Confirmation", "Not applicable")}</div><p className="hint">Source follows the selected machine's sample row; tank readings only apply to plant stock. Issued fuel alone is not actual consumption.</p></div>
        <div className="group">{heading("05", "Breakdown / stoppage", row.breakdowns.length ? `${row.breakdowns.length} recorded` : "Timed interruption log")}<p className="hint">A separate timed log; it does not set the machine-day Daily status.</p><button type="button" onClick={() => setShowStoppages(v => !v)} aria-expanded={showStoppages}>{showStoppages ? "Hide breakdown / stoppage" : "Breakdown / Stoppage"}</button>{showStoppages && <Stoppages value={row.breakdowns} onChange={breakdowns => patch({ breakdowns })} />}</div>
        <div className="group">{heading("06", "Work / BOQ assignment")}<AllocationEditor row={row} onChange={activitySegments => patch({ activitySegments })} editable /><div className="subarea"><label className="field"><span>Non-BOQ / incidental work (optional)</span><textarea value={row.task} onChange={e => patch({ task: e.target.value })} placeholder="Describe work with no BOQ item" /></label><p className="hint">Only work with no BOQ item; not payable progress.</p></div></div>
      </section>
      <section className="card" aria-label="Read-only equipment card">
        <div className="card-header"><div><small>02 / Linked preview</small><h2>Read-only machine day</h2></div><span className={`status ${row.usageStatus === "breakdown" ? "warn" : ""}`}>{status}</span></div>
         <div className="group">{heading("01", "Equipment / owner / type")}<div className="fields four">{field("Equipment", row.machine)}{field(machine.ownership === "hired" ? "Owner / vendor" : "Ownership", owner)}{field("Effective hire / entry type", typeLabel[row.entryType] || row.entryType)}{field("Registration / equipment no.", row.vehicleNo)}</div><p className="hint">Operator: {row.operator || "—"} · Daily status: {status}{statusReasonVisible ? ` · ${row.usageStatusReason}` : ""}</p></div>
        <div className="group">{heading("02", "Readings & times")}<div className="fields four">{field(machine.meterType === "odometer" ? "Opening odometer" : "Opening meter", row.openingReading?.toString() ?? "—", true)}{field(machine.meterType === "odometer" ? "Closing odometer" : "Closing meter", row.closingReading?.toString() ?? "—", true)}{field("Start time", formatEquipmentTime(row.startTime), true)}{field("End time", formatEquipmentTime(row.endTime), true)}</div><p className="hint">{machine.meterType === "odometer" ? `Distance: ${fmt(usage.totalKm, " km")}` : `Meter working hours: ${usage.basis === "hour_meter" ? fmt(usage.hoursWorked, " h") : "—"}`} · Clock duration: {formatEquipmentDuration(clock)}. Clock duration is not labelled meter working time.</p></div>
        <div className="group">{heading("03", "Diesel & tank", isPlant ? undefined : "Tank not applicable")}<div className="fields five">{field("Diesel source", sourceLabel[row.dieselSource] ?? row.dieselSource)}{isPlant && field("Opening tank", fmt(row.openingDiesel, " L"), true)}{field("Issued / added", fmt(row.diesel, " L"), true)}{isPlant && field("Closing tank / dip", fmt(row.dieselBalanceInTank, " L"), true)}{isPlant && field("Confirmation", row.dieselBalanceConfirmed ? "Confirmed" : tankKnown ? "Pending confirmation" : "—")}</div>{tankKnown && !row.dieselBalanceConfirmed && <p className="warning">Physical tank balance has not been confirmed.</p>}</div>
        <div className="group">{heading("04", "Fuel performance", isPlant ? "Tank-based actual" : "Actual unavailable")}<div className="fields four">{field("Norm", fmt(norm.value, ` ${norm.unit}`), true)}{field("Expected", isPlant ? fmt(fuel.expectedDiesel, " L") : "—", true)}{field("Actual consumed", isPlant ? fuel.actualConsumed == null ? "Awaiting tank dip" : fmt(fuel.actualConsumed, " L") : "—", true)}{field(hasActualRate && isPlant ? "Actual consumption rate" : "Expected rate · norm only", isPlant ? hasActualRate ? fmt(fuel.actualRate, ` ${fuel.actualRateUnit}`) : fmt(norm.value, ` ${norm.unit}`) : "—", true)}</div><p className="hint">{isPlant ? "Actual = opening tank + issued − closing tank. The rate is actual only with a confirmed tank dip; otherwise norm is labelled expected." : "Direct-purchase and contractor issues are not machine tank movement. Actual consumption and rate cannot be inferred from issued liters."}</p></div>
        <div className="group">{heading("05", "Work / BOQ assignment")}<AllocationEditor row={row} onChange={() => {}} editable={false} />{row.task.trim() && <div className="subarea">{field("Non-BOQ / incidental work", row.task)}<p className="hint">Not a BOQ item — not payable progress.</p></div>}</div>
        {row.breakdowns.length > 0 && <div className="group">{heading("06", "Breakdown information")}{row.breakdowns.map(item => <div className="allocation" key={item.clientKey}><strong style={{ fontSize: 12 }}>{item.description || "Reason not entered"}</strong><p className="hint mono">{formatEquipmentTime(item.fromTime)} → {formatEquipmentTime(item.toTime)} · {formatEquipmentDuration(calculateEquipmentAllocationHours(item.fromTime, item.toTime))}</p><p className="hint">Responsibility: {item.responsibility || "Not specified"} · Repair/payment scope: {item.repairScope || "Not specified"} · Debitable to vendor: {item.debitableToVendor ? "Yes" : "No"}</p>{item.remarks && <p className="hint">Remarks: {item.remarks}</p>}{item.file && <p className="hint">Local selection: {item.file.name} (not uploaded)</p>}</div>)}</div>}
      </section>
    </div>
  </div></main>;
}