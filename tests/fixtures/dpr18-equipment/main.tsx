import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DprEquipmentCompact, type DprEquipmentFields } from "../../../client/src/components/DprEquipmentCompact";
import { BreakdownStoppageEditor, type StagedBreakdown } from "../../../client/src/components/BreakdownStoppageEditor";
import { Label } from "../../../client/src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../client/src/components/ui/select";
import "../../../client/src/index.css";

// Deliberately synthetic machine days. No application route, auth, or customer API is loaded.
const base: DprEquipmentFields = {
  machine: "FIXTURE EXCAVATOR", vehicleNo: "DPR18-001", operator: "Fixture Operator",
  equipmentId: null, plantUsageId: null, entryType: "time_meter",
  openingReading: 100, closingReading: 106, startTime: "08:00", endTime: "16:00",
  dieselSource: "plant_stock", diesel: 20, openingDiesel: 40,
  dieselBalanceInTank: 20, dieselBalanceConfirmed: true,
  task: "", breakdowns: [], activitySegments: [],
};
const master = { meterType: "hour_meter", consumptionNorm: 3, ownership: "owned", entryType: "daily" };
const staged: DprEquipmentFields = {
  ...base, machine: "FIXTURE ROLLER", vehicleNo: "DPR18-002",
  usageStatus: "breakdown", usageStatusReason: "Hydraulic line leak",
  breakdowns: [{
    clientKey: "fixture-staged-stop", fromTime: "10:00", toTime: "11:30",
    description: "Hydraulic hose", responsibility: "vendor", repairScope: "hlc",
    debitableToVendor: true, remarks: "Repaired at site",
    attachment: { fileName: "repair.pdf", objectPath: "/fixture/repair.pdf" },
  }],
};
const submitted: DprEquipmentFields = {
  ...staged, machine: "FIXTURE SUBMITTED ROLLER",
  breakdowns: [{ ...staged.breakdowns![0], clientKey: undefined, id: 42 }],
};

function EditableCard({ row, index, onPatch }: {
  row: DprEquipmentFields; index: number; onPatch: (patch: Partial<DprEquipmentFields>) => void;
}) {
  return <DprEquipmentCompact row={row} equipment={master} index={index} sectionPresentation onChange={onPatch}
    equipmentPickerSlot={<div className="max-w-sm" data-fixture-slot="picker">
      <Label htmlFor={`fixture-equipment-${index}`}>Choose equipment</Label>
      <Select value={row.machine === "FIXTURE LEGACY LOADER" ? "loader" : "excavator"} onValueChange={value => onPatch(value === "loader"
        ? { machine: "FIXTURE LEGACY LOADER", vehicleNo: "DPR18-LEGACY" }
        : { machine: "FIXTURE EXCAVATOR", vehicleNo: "DPR18-001" })}>
        <SelectTrigger id={`fixture-equipment-${index}`} className="mt-1 w-full" data-testid={`fixture-picker-${index}`}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="excavator">FIXTURE EXCAVATOR · DPR18-001</SelectItem><SelectItem value="loader">FIXTURE LEGACY LOADER · DPR18-LEGACY</SelectItem></SelectContent>
      </Select>
    </div>}
    ownerTypeSlot={<div className="max-w-sm" data-fixture-slot="owner">
      <Label htmlFor={`fixture-hire-${index}`}>Daily hire override</Label>
      <Select value={row.entryType ?? "daily"} onValueChange={entryType => onPatch({ entryType })}>
        <SelectTrigger id={`fixture-hire-${index}`} className="mt-1 w-full" data-testid={`fixture-hire-${index}`}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="daily">Daily hire</SelectItem><SelectItem value="monthly">Monthly hire</SelectItem></SelectContent>
      </Select>
    </div>}
    dieselSourceSlot={<div className="max-w-sm" data-fixture-slot="diesel">
      <Label htmlFor={`fixture-source-${index}`}>Diesel source</Label>
      <Select value={row.dieselSource ?? "plant_stock"} onValueChange={dieselSource => onPatch({ dieselSource })}>
        <SelectTrigger id={`fixture-source-${index}`} className="mt-1 w-full" data-testid={`fixture-source-${index}`}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="plant_stock">Plant stock</SelectItem><SelectItem value="contractor">Contractor supply</SelectItem></SelectContent>
      </Select>
    </div>}
    stoppageSlot={<BreakdownStoppageEditor draftOnly value={(row.breakdowns ?? []) as StagedBreakdown[]}
      onChange={breakdowns => onPatch({ breakdowns })} testId={`fixture-stoppage-${index}`} />}
  />;
}

declare global {
  interface Window {
    __Dpr18Fixture: {
      rows: () => { working: DprEquipmentFields; legacy: DprEquipmentFields };
      patches: () => Array<{ row: string; patch: Partial<DprEquipmentFields> }>;
      reset: () => void;
    };
  }
}

function App() {
  const [working, setWorking] = useState<DprEquipmentFields>({ ...base, usageStatus: "working" });
  const [legacy, setLegacy] = useState<DprEquipmentFields>({ ...base, machine: "FIXTURE LEGACY LOADER", vehicleNo: "DPR18-LEGACY", usageStatus: null });
  const [patches, setPatches] = useState<Array<{ row: string; patch: Partial<DprEquipmentFields> }>>([]);
  const [revision, setRevision] = useState(0);
  window.__Dpr18Fixture = {
    rows: () => ({ working, legacy }), patches: () => patches,
    reset: () => {
      setWorking({ ...base, usageStatus: "working" });
      setLegacy({ ...base, machine: "FIXTURE LEGACY LOADER", vehicleNo: "DPR18-LEGACY", usageStatus: null });
      setPatches([]);
      setRevision(value => value + 1);
    },
  };
  const onPatch = (row: "working" | "legacy", patch: Partial<DprEquipmentFields>) => {
    setPatches(previous => [...previous, { row, patch }]);
    (row === "working" ? setWorking : setLegacy)(previous => ({ ...previous, ...patch }));
  };
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-slate-950">
    <h1 className="text-2xl font-bold">DPR18 equipment · isolated component fixture</h1>
    <button type="button" className="rounded border px-3 py-2" onClick={() => window.__Dpr18Fixture.reset()}>Reset fixture</button>
    <section data-fixture="working"><h2 className="mb-2 font-semibold">Draft · stored Working</h2>
      <EditableCard key={`working-${revision}`} row={working} index={0} onPatch={patch => onPatch("working", patch)} />
    </section>
    <section data-fixture="legacy"><h2 className="mb-2 font-semibold">Draft · legacy null status</h2>
      <EditableCard key={`legacy-${revision}`} row={legacy} index={1} onPatch={patch => onPatch("legacy", patch)} />
    </section>
    <section data-fixture="readonly-empty"><h2 className="mb-2 font-semibold">Read-only · no breakdown</h2>
      <DprEquipmentCompact row={base} equipment={master} editable={false} index={2} />
    </section>
    <section data-fixture="staged"><h2 className="mb-2 font-semibold">Read-only · staged breakdown</h2>
      <DprEquipmentCompact row={staged} equipment={master} editable={false} index={3} />
    </section>
    <section data-fixture="submitted"><h2 className="mb-2 font-semibold">Read-only · submitted breakdown</h2>
      <DprEquipmentCompact row={submitted} equipment={master} editable={false} index={4} />
    </section>
  </main>;
}

// Abort rather than allow any fetch to reach the real application API.
window.fetch = async (input) => {
  throw new Error(`Unexpected fixture network request: ${String(input)}`);
};

createRoot(document.getElementById("root")!).render(<App />);