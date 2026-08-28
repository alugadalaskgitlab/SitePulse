import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, FileText, Fuel, ReceiptText } from "lucide-react";
import { useLocation } from "wouter";
import { HubShell } from "@/components/HubShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { locationLabel } from "@/components/LocationPicker";
import { deriveDieselRegisterStatus, dieselRegisterStatusClass } from "@/lib/dieselRegister";
import type { DieselRequirementWithItems, Attachment, PlantMaterial } from "@shared/schema";
import type { DieselReceiptState } from "@shared/dieselReceiptStatus";

type ReceiptEntry = DieselReceiptState & {
  receipts: Array<{ id: number; date: string; quantity: number; uom: string; challanNumber: string | null; receiptNo: string | null; isCancelled: boolean }>;
};

function Qty({ value }: { value: number | null | undefined }) {
  return <>{value == null ? "—" : `${value} L`}</>;
}

function RequirementRow({
  requirement, receipt, attachmentCount, canRecordReceipt,
  sites, dieselMaterial,
}: {
  requirement: DieselRequirementWithItems;
  receipt?: ReceiptEntry;
  attachmentCount?: number;
  canRecordReceipt: boolean;
  sites?: { id: number; name: string }[];
  dieselMaterial?: PlantMaterial;
}) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const { data: attachments = [] } = useQuery<Attachment[]>({
    queryKey: ["/api/attachments", "diesel_purchase", requirement.id],
    queryFn: async () => {
      const response = await fetch(`/api/attachments?moduleType=diesel_purchase&linkedRecordId=${requirement.id}`);
      if (!response.ok) throw new Error("Unable to load purchase documents");
      return response.json();
    },
    enabled: open && (attachmentCount || 0) > 0,
  });
  const qualifyingDocumentTypes = new Set(["bill", "invoice", "challan", "receipt", "dc"]);
  const purchaseDocuments = attachments.filter(a => !!a.docType && qualifyingDocumentTypes.has(a.docType));
  const status = deriveDieselRegisterStatus(requirement.status, receipt);
  const purchased = requirement.qtyPurchased;
  const received = receipt?.receivedQty;
  const balance = receipt?.pendingQty;
  const recordReceipt = () => {
    const params = new URLSearchParams({ autoOpen: "1", dieselReqId: String(requirement.id) });
    if (balance && balance > 0) params.set("qty", String(balance));
    if (requirement.supplier) params.set("supplier", requirement.supplier);
    if (dieselMaterial) {
      params.set("materialId", String(dieselMaterial.id));
      params.set("uom", dieselMaterial.defaultUom || "Liters");
    }
    navigate(`/plant/material-receipts?${params.toString()}`);
  };
  const documentStatus = attachmentCount && attachmentCount > 0 ? "Purchase document linked" : "Pending Document";
  const stockStatus = receipt?.receivedQty
    ? receipt.status === "fully_received" ? "Fully received into stock" : "Partly received into stock"
    : "Awaiting Stores receipt";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm" data-testid={`diesel-register-row-${requirement.id}`}>
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full p-4 text-left hover:bg-slate-50 rounded-xl">
        <div className="flex flex-wrap items-center gap-3">
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          <div className="flex-1 min-w-[180px]">
            <p className="font-semibold text-slate-800">Diesel requirement #{requirement.id}</p>
            <p className="text-sm text-slate-500">{requirement.date} · {locationLabel(requirement, sites)}</p>
          </div>
          <Badge variant="outline" className={dieselRegisterStatusClass(status)}>{status}</Badge>
          <span className="text-sm font-medium text-slate-700">Planned <Qty value={requirement.totalPlanned} /></span>
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div><p className="text-xs uppercase text-slate-500">Requirement date</p><p className="font-medium">{requirement.date}</p></div>
            <div><p className="text-xs uppercase text-slate-500">Location</p><p className="font-medium">{locationLabel(requirement, sites)}</p></div>
            <div><p className="text-xs uppercase text-slate-500">Planned / approved</p><p className="font-medium"><Qty value={requirement.totalPlanned} /> / <Qty value={requirement.totalApproved} /></p></div>
            <div><p className="text-xs uppercase text-slate-500">Purchased / received</p><p className="font-medium"><Qty value={purchased} /> / <Qty value={received} /></p></div>
            <div><p className="text-xs uppercase text-slate-500">Balance</p><p className="font-medium"><Qty value={balance} /></p></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-xs uppercase text-slate-500">Supplier</p><p className="font-medium">{requirement.supplier || "—"}</p></div>
            <div><p className="text-xs uppercase text-slate-500">Bill</p><p className="font-medium">{requirement.billNo || "—"}</p></div>
            <div><p className="text-xs uppercase text-slate-500">Purchase document</p>
              {purchaseDocuments.length ? purchaseDocuments.map(a => <a key={a.id} href={a.objectPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline mr-3"><FileText className="w-3 h-3" />{a.fileName}</a>) : <p className="font-medium">{attachmentCount && !attachments.length ? "Loading document…" : "—"}</p>}
            </div>
            <div><p className="text-xs uppercase text-slate-500">Document status</p><p className={attachmentCount ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>{documentStatus}</p></div>
            <div><p className="text-xs uppercase text-slate-500">Stock status</p><p className="font-medium">{stockStatus}</p></div>
            <div><p className="text-xs uppercase text-slate-500">Overall status</p><p className="font-medium">{status}</p></div>
          </div>
          {receipt?.receipts.length ? (
            <div className="text-sm">
              <p className="text-xs uppercase text-slate-500 mb-2">Prior receipts</p>
              <div className="space-y-1">{receipt.receipts.map(r => <p key={r.id} className={r.isCancelled ? "text-slate-400 line-through" : "text-slate-700"}>{r.date} · {r.quantity} {r.uom} · {r.challanNumber || r.receiptNo || `Receipt #${r.id}`}{r.isCancelled ? " (cancelled)" : ""}</p>)}</div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/plant/diesel-requirements?selectedId=${requirement.id}`)}><ExternalLink className="w-4 h-4 mr-1" />View details</Button>
            {canRecordReceipt && dieselMaterial && (status === "Purchased" || status === "Partly Received") && <Button size="sm" onClick={recordReceipt}><ReceiptText className="w-4 h-4 mr-1" />Record Receipt{balance ? ` (${balance} L)` : ""}</Button>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StoresDieselRegister() {
  const { sectionVisible, sectionCan, isAdmin } = useAuth();
  const canViewRegister = sectionVisible("diesel_req_view") || sectionVisible("site_diesel") || sectionVisible("stores_inventory");
  const canRecordReceipt = isAdmin || sectionCan("plant_materials", "create");
  const { data: requirements = [], isLoading } = useQuery<DieselRequirementWithItems[]>({ queryKey: ["/api/diesel-requirements"] });
  const { data: sites } = useQuery<{ id: number; name: string }[]>({ queryKey: ["/api/sites"] });
  const { data: materials = [] } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
    enabled: canRecordReceipt,
  });
  const dieselMaterial = materials.find(material => ["DIESEL", "HSD"].includes(material.name.trim().toUpperCase()));
  const purchasedIds = useMemo(() => requirements.filter(r => r.status === "purchased" && r.qtyPurchased).map(r => r.id), [requirements]);
  const ids = purchasedIds.join(",");
  const { data: receipts = {} } = useQuery<Record<number, ReceiptEntry>>({
    queryKey: ["/api/diesel-requirements/receipt-status", ids],
    queryFn: async () => {
      const response = await fetch(`/api/diesel-requirements/receipt-status?ids=${ids}`);
      if (!response.ok) throw new Error("Unable to load receipt status");
      return response.json();
    },
    enabled: canViewRegister && purchasedIds.length > 0,
  });
  const { data: attachmentCounts = {} } = useQuery<Record<number, number>>({
    queryKey: ["/api/attachments/counts", "diesel_purchase", ids],
    queryFn: async () => {
      const response = await fetch(`/api/attachments/counts?moduleType=diesel_purchase&ids=${ids}&docTypes=bill,invoice,challan,receipt,dc`);
      if (!response.ok) throw new Error("Unable to load document counts");
      return response.json();
    },
    enabled: purchasedIds.length > 0,
  });
  return <HubShell title="Diesel Purchase Register" subtitle="Requirement, purchase and physical receipt progress" backHref="/stores/hub" backLabel="Stores & Inventory">
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3"><div className="p-3 rounded-lg bg-amber-100"><Fuel className="w-5 h-5 text-amber-700" /></div><div><h2 className="font-semibold text-slate-800">Diesel Purchase Register</h2><p className="text-sm text-slate-500">Read-only register. Receipt progress is calculated from linked material receipts.</p></div></div>
       {isLoading ? <p className="text-sm text-slate-500">Loading requirements…</p> : requirements.length ? requirements.map(r => <RequirementRow key={r.id} requirement={r} receipt={receipts[r.id]} attachmentCount={attachmentCounts[r.id]} canRecordReceipt={canRecordReceipt} sites={sites} dieselMaterial={dieselMaterial} />) : <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No diesel requirements found.</p>}
    </div>
  </HubShell>;
}