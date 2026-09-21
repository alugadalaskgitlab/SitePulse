import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DprEquipmentCompact,
  type DprEquipmentFields,
} from "@/components/DprEquipmentCompact";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
const requestedSource = params.get("source");
const dieselSource = requestedSource === "plant_stock" || requestedSource === "direct_purchase"
  ? requestedSource
  : "contractor";
const editable = params.get("mode") !== "readonly";

const sourceLabels: Record<string, string> = {
  contractor: "Contractor",
  direct_purchase: "Direct Site Purchase",
  plant_stock: "Plant Stock",
};

const initialRow: DprEquipmentFields = {
  machine: "TANDEM ROLLER",
  vehicleNo: "HLC-EQ-017",
  operator: "IMRAN",
  equipmentId: 17,
  entryType: "time_meter",
  dieselSource,
  diesel: 12,
  startTime: "08:00",
  endTime: "17:00",
  openingReading: 100,
  closingReading: 102,
  openingDiesel: 100,
  dieselBalanceInTank: 85,
  dieselBalanceConfirmed: true,
  expectedDiesel: 8,
  activitySegments: [],
};

function Fixture() {
  const [row, setRow] = useState(initialRow);

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <h1 className="text-xl font-bold text-slate-950">DPR-11 Fuel Visibility Evidence</h1>
        <p className="mt-1 text-sm font-medium text-slate-700">
          Diesel Source: {sourceLabels[dieselSource]} · View: {editable ? "Editable" : "Read-only"}
        </p>
      </header>
      <DprEquipmentCompact
        row={row}
        equipment={{ meterType: "hour_meter", consumptionNorm: 4 }}
        editable={editable}
        onChange={editable ? patch => setRow(current => ({ ...current, ...patch })) : undefined}
        boqItems={[]}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);