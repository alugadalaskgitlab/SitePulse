import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EquipmentMasterType } from "@shared/schema";
import { EquipmentMasterRows } from "@/components/EquipmentMasterRows";
import { EquipmentMasterCreateDialog } from "@/components/EquipmentMasterCreateDialog";
import { Button } from "@/components/ui/button";
import "@/index.css";

const vendors = [
  { id: 301, name: "NARASIMHULU CONTRACTORS", isActive: true, aliases: ["NARASIMHULU"] },
  { id: 302, name: "SRI LAKSHMI TRANSPORT", isActive: true, aliases: ["SLT"] },
];

const equipment = [
  {
    id: 101, name: "JCB-2 SITE", registrationNumber: "AP21AA1111", ownership: "owned", vendorName: null,
    equipmentType: "Legacy wrong type", meterType: "hour_meter", consumptionNorm: 12, plantName: "HMP-1",
    isActive: 1, hireBillingBasis: null, hireRate: null,
  },
  {
    id: 102, name: "TIPPER-3 SITE", registrationNumber: "TS15UF7763", ownership: "hired",
    vendorName: "NARASIMHULU", equipmentType: "Legacy wrong type", meterType: "odometer",
    consumptionNorm: 4, plantName: null, isActive: 1, hireBillingBasis: "daily",
    hireRate: 5000, hireStartDate: "2026-01-01", hireEndDate: "2026-12-31",
  },
  {
    id: 103, name: "TANDEM ROLLER-1 SITE", registrationNumber: "TS15UF3333", ownership: "hired",
    vendorName: "SRI LAKSHMI TRANSPORT", equipmentType: "Legacy wrong type", meterType: "hour_meter",
    consumptionNorm: 8, plantName: "HMP-1", isActive: 1, hireBillingBasis: "monthly",
    hireRate: 18000, hireStartDate: "2026-01-01", hireEndDate: null, hireMonthlyDivisorType: "30",
    hireDieselResponsibility: "vendor", hireOperatorResponsibility: "hlc",
    hireBreakdownDeductionEnabled: true, hireAgreementRemarks: "As per monthly agreement",
  },
  {
    id: 104, name: "600 KVA GENERATOR", registrationNumber: "GEN-04", ownership: "owned",
    vendorName: null, equipmentType: "Legacy wrong type", meterType: "hour_meter", consumptionNorm: 8,
    plantName: "HMP-1", isActive: 1, hireBillingBasis: null, hireRate: null,
  },
  {
    id: 105, name: "OLD ROLLER", registrationNumber: "OLD-105", ownership: "owned",
    vendorName: null, equipmentType: "Wrong", meterType: "hour_meter", consumptionNorm: 7,
    plantName: null, isActive: 0, hireBillingBasis: null, hireRate: null,
  },
] as unknown as EquipmentMasterType[];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      queryFn: async ({ queryKey }) => {
        const response = await fetch(String(queryKey[0]));
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response.json();
      },
    },
  },
});

window.fetch = async (input, init) => {
  const url = String(input);
  if (url === "/api/plant-module/plant-settings") return Response.json([{ id: 1, plantName: "HMP-1", siteName: null }]);
  if (url === "/api/plant-module/equipment-vendors") return Response.json(vendors);
  if (url.startsWith("/api/plant-module/equipment") && init?.method === "POST") {
    return Response.json({ id: 999, ...JSON.parse(String(init.body)) }, { status: 201 });
  }
  return Response.json([]);
};

function Fixture() {
  const [showInactive, setShowInactive] = useState(false);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6" data-testid="equipment-master-fixture">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Component fixture · no live records</p>
        <h1 className="text-2xl font-semibold">Equipment Master</h1>
        <p className="text-sm text-muted-foreground">Owned and hired records, with display values derived from the name.</p>
      </header>
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div><h2 className="font-medium">Equipment</h2><p className="text-sm text-muted-foreground">Filter, expand, and edit fixture rows.</p></div>
        <EquipmentMasterCreateDialog trigger={<Button data-testid="button-open-create">Add equipment</Button>} />
      </div>
      <EquipmentMasterRows
        equipment={equipment}
        showInactive={showInactive}
        onShowInactiveChange={setShowInactive}
        vendorMasterNames={vendors.map(vendor => vendor.name)}
        canEdit
        canDelete={false}
        onEdit={() => undefined}
        onToggleActive={() => undefined}
        onDelete={() => undefined}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><Fixture /></QueryClientProvider>,
);
