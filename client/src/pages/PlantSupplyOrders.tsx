import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClipboardCheck, PackagePlus, Settings2 } from "lucide-react";
import { Link, useSearch } from "wouter";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type OrderMixDraft = {
  mixName: string;
  bitumenPercent: string;
  components: Array<{ materialId: string; aggregateSharePercent: string }>;
};
type MixLine = {
  mixTemplateId: string;
  enteredQuantity: string;
  enteredUnit: "MT" | "cum";
  plannedMtPerDay: string;
  orderMix: OrderMixDraft | null;
};
type OrderOptions = {
  parties: Array<{ id: number; name: string; dispatchProSiteId: string | null }>;
  sites: Array<{ id: number; name: string; partyId: number | null }>;
  mixes: Array<{ id: number; name: string; mixType: string; partyId: number | null; bitumenPercent: number | null; ldoNorm: number | null }>;
  materials: Array<{ id: number; name: string; defaultUom: string | null }>;
  mixComponents: Array<{ templateId: number; materialId: number; materialName: string; percent: number | null; moistureContent: number | null; wastageFactor: number | null }>;
  canManageLifecycle: boolean;
};

const today = format(new Date(), "yyyy-MM-dd");

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error((await response.text()) || response.statusText);
  return response.json();
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.replace(/^\d+:\s*/, "") : "Could not complete this action.";
}

export default function PlantSupplyOrders() {
  const { sectionVisible } = useAuth();
  const { toast } = useToast();
  const { uploadFile } = useUpload();
  const queryClient = useQueryClient();
  const search = useSearch();
  const canSettings = sectionVisible("plant_supply_alert_settings");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [periodFrom, setPeriodFrom] = useState(today);
  const [periodTo, setPeriodTo] = useState(today);
  const [orderNo, setOrderNo] = useState("");
  const [workName, setWorkName] = useState("");
  const [division, setDivision] = useState("");
  const [mandal, setMandal] = useState("");
  const [district, setDistrict] = useState("");
  const [agreementEstimateRef, setAgreementEstimateRef] = useState("");
  const [estimateSorYear, setEstimateSorYear] = useState("");
  const [mtPerCumFactor, setMtPerCumFactor] = useState("2.356");
  const [remarks, setRemarks] = useState("");
  const [estimatePdf, setEstimatePdf] = useState<File | null>(null);
  const [mixInstruction, setMixInstruction] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState<"estimate_pdf" | "mix_instruction" | null>(null);
  const [lines, setLines] = useState<MixLine[]>([{ mixTemplateId: "", enteredQuantity: "", enteredUnit: "MT", plannedMtPerDay: "", orderMix: null }]);
  const [replacementBorrowingId, setReplacementBorrowingId] = useState<number | null>(null);
  const [replacementReceiptId, setReplacementReceiptId] = useState("");
  const [replacementQty, setReplacementQty] = useState("");
  const [decisionBorrowingId, setDecisionBorrowingId] = useState<number | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  useEffect(() => {
    const requestedId = Number(new URLSearchParams(search).get("orderId"));
    if (Number.isInteger(requestedId) && requestedId > 0) setSelectedId(requestedId);
  }, [search]);

  const optionsQuery = useQuery<OrderOptions>({
    queryKey: ["/api/plant-module/supply-orders/options"],
    queryFn: () => fetchJson("/api/plant-module/supply-orders/options"),
  });
  const ordersQuery = useQuery<any[]>({
    queryKey: ["/api/plant-module/supply-orders"],
    queryFn: () => fetchJson("/api/plant-module/supply-orders"),
  });
  const orderQuery = useQuery<any>({
    queryKey: ["/api/plant-module/supply-orders", selectedId],
    queryFn: () => fetchJson(`/api/plant-module/supply-orders/${selectedId}`),
    enabled: selectedId != null,
  });
  const replacementQuery = useQuery<any>({
    queryKey: ["/api/plant-module/supply-orders", selectedId, "replacement", replacementBorrowingId],
    queryFn: () => fetchJson(`/api/plant-module/supply-orders/${selectedId}/borrowings/${replacementBorrowingId}/receipts`),
    enabled: selectedId != null && replacementBorrowingId != null,
  });
  const activeOrders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const options = optionsQuery.data;
  const order = orderQuery.data;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/supply-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/supply-orders", selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] }),
    ]);
  };

  const uploadOrderFile = async (orderId: number, file: File, docType: "estimate_pdf" | "mix_instruction") => {
    const uploaded = await uploadFile(file);
    if (!uploaded) throw new Error(`Could not upload ${file.name}.`);
    const extensionMime = file.name.toLowerCase().endsWith(".pdf") ? "application/pdf"
      : file.name.toLowerCase().endsWith(".png") ? "image/png"
      : file.name.toLowerCase().endsWith(".webp") ? "image/webp"
      : file.name.toLowerCase().endsWith(".gif") ? "image/gif"
      : "image/jpeg";
    await apiRequest("POST", "/api/attachments", {
      moduleType: "plant_supply_order",
      linkedRecordId: orderId,
      fileName: file.name,
      objectPath: uploaded.objectPath,
      mimeType: file.type || extensionMime,
      fileSize: file.size,
      docType,
    });
  };
  const attachToExistingOrder = async (file: File | null, docType: "estimate_pdf" | "mix_instruction") => {
    if (!file || !order?.id) return;
    setUploadingAttachment(docType);
    try {
      await uploadOrderFile(order.id, file, docType);
      await invalidate();
      toast({ title: "File attached" });
    } catch (error) {
      toast({ title: "Could not attach file", description: errorText(error), variant: "destructive" });
    } finally {
      setUploadingAttachment(null);
    }
  };

  const toOrderedMt = (line: MixLine) => {
    const quantity = Number(line.enteredQuantity);
    const factor = Number(mtPerCumFactor);
    if (!Number.isFinite(quantity) || quantity <= 0) return 0;
    return line.enteredUnit === "cum" ? quantity * factor : quantity;
  };
  const toEquivalentCum = (line: MixLine) => {
    const factor = Number(mtPerCumFactor);
    if (!Number.isFinite(factor) || factor <= 0) return 0;
    return line.enteredUnit === "cum" ? Number(line.enteredQuantity) || 0 : toOrderedMt(line) / factor;
  };
  const lineHasValidOrderMix = (line: MixLine) => {
    if (!line.orderMix) return true;
    const bitumen = Number(line.orderMix.bitumenPercent);
    const shares = line.orderMix.components.map(component => Number(component.aggregateSharePercent));
    const shareTotal = shares.reduce((sum, share) => sum + (Number.isFinite(share) ? share : 0), 0);
    return Number.isFinite(bitumen) && bitumen >= 0 && bitumen < 100 &&
      line.orderMix.components.length > 0 &&
      line.orderMix.components.every(component => Number(component.materialId) > 0 && Number(component.aggregateSharePercent) >= 0) &&
      Math.abs(shareTotal - 100) <= 0.01;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        partyId: Number(partyId),
        siteId: siteId ? Number(siteId) : null,
        periodFrom,
        periodTo,
        orderNo: orderNo.trim() || null,
        workName: workName.trim() || null,
        division: division.trim() || null,
        mandal: mandal.trim() || null,
        district: district.trim() || null,
        agreementEstimateRef: agreementEstimateRef.trim() || null,
        estimateSorYear: estimateSorYear.trim() || null,
        mtPerCumFactor: Number(mtPerCumFactor),
        remarks: remarks.trim() || null,
        lines: lines.map(line => ({
          mixTemplateId: Number(line.mixTemplateId),
          enteredQuantity: Number(line.enteredQuantity),
          enteredUnit: line.enteredUnit,
          plannedMtPerDay: line.plannedMtPerDay ? Number(line.plannedMtPerDay) : null,
          orderMix: line.orderMix ? {
            mixName: line.orderMix.mixName.trim() || null,
            bitumenPercent: Number(line.orderMix.bitumenPercent),
            components: line.orderMix.components.map(component => ({
              materialId: Number(component.materialId),
              aggregateSharePercent: Number(component.aggregateSharePercent),
            })),
          } : null,
        })),
      };
      return apiRequest("POST", "/api/plant-module/supply-orders", payload);
    },
    onSuccess: async (response: any) => {
      const created = await response.json();
      setSelectedId(created.id);
      setCreateOpen(false);
      setLines([{ mixTemplateId: "", enteredQuantity: "", enteredUnit: "MT", plannedMtPerDay: "", orderMix: null }]);
      setOrderNo("");
      setWorkName("");
      setDivision("");
      setMandal("");
      setDistrict("");
      setAgreementEstimateRef("");
      setEstimateSorYear("");
      setMtPerCumFactor("2.356");
      setRemarks("");
      const files = [
        ...(estimatePdf ? [{ file: estimatePdf, docType: "estimate_pdf" as const }] : []),
        ...(mixInstruction ? [{ file: mixInstruction, docType: "mix_instruction" as const }] : []),
      ];
      setEstimatePdf(null);
      setMixInstruction(null);
      for (const item of files) {
        try {
          await uploadOrderFile(created.id, item.file, item.docType);
        } catch {
          toast({ title: "Order saved, but a file could not be attached", description: item.file.name, variant: "destructive" });
        }
      }
      await invalidate();
      toast({ title: "Supply order saved" });
    },
    onError: error => toast({ title: "Could not save supply order", description: errorText(error), variant: "destructive" }),
  });

  const scopeMutation = useMutation({
    mutationFn: ({ materialId, scope }: { materialId: number; scope: "hlc" | "party" }) =>
      apiRequest("PATCH", `/api/plant-module/supply-orders/${selectedId}/material-scope`, { materialId, scope }),
    onSuccess: async () => { await invalidate(); },
    onError: error => toast({ title: "Could not change material supply", description: errorText(error), variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "open" | "closed") =>
      apiRequest("PATCH", `/api/plant-module/supply-orders/${selectedId}/status`, { status }),
    onSuccess: async () => { await invalidate(); },
    onError: error => toast({ title: "Could not update order", description: errorText(error), variant: "destructive" }),
  });

  const decisionMutation = useMutation({
    mutationFn: ({ id, decision, note }: { id: number; decision: "approved" | "party_will_replace"; note?: string }) =>
      apiRequest("POST", `/api/plant-module/supply-orders/borrowings/${id}/decision`, { decision, note }),
    onSuccess: async () => { setDecisionBorrowingId(null); setDecisionNote(""); await invalidate(); },
    onError: error => toast({ title: "Could not save borrowing decision", description: errorText(error), variant: "destructive" }),
  });

  const replacementMutation = useMutation({
    mutationFn: () => apiRequest(
      "POST",
      `/api/plant-module/supply-orders/${selectedId}/borrowings/${replacementBorrowingId}/replacements`,
      { receiptId: Number(replacementReceiptId), quantity: Number(replacementQty) },
    ),
    onSuccess: async () => {
      setReplacementBorrowingId(null);
      setReplacementReceiptId("");
      setReplacementQty("");
      await invalidate();
      toast({ title: "Receipt linked to borrowed material" });
    },
    onError: error => toast({ title: "Could not link receipt", description: errorText(error), variant: "destructive" }),
  });

  const chosenParty = options?.parties.find(row => row.id === Number(partyId));
  const siteOptions = options?.sites.filter(row => !row.partyId || row.partyId === Number(partyId)) ?? [];
  const mixOptions = options?.mixes.filter(row => !row.partyId || row.partyId === Number(partyId)) ?? [];

  const emptyMixLine = (): MixLine => ({
    mixTemplateId: "",
    enteredQuantity: "",
    enteredUnit: "MT",
    plannedMtPerDay: "",
    orderMix: null,
  });
  const addLine = () => setLines(current => [...current, emptyMixLine()]);
  const updateLine = (index: number, key: "mixTemplateId" | "enteredQuantity" | "enteredUnit" | "plannedMtPerDay", value: string) =>
    setLines(current => current.map((line, i) => i === index ? { ...line, [key]: value } : line));
  const setLineTemplate = (index: number, value: string) => {
    setLines(current => current.map((line, i) => i === index ? { ...line, mixTemplateId: value, orderMix: null } : line));
  };
  const copyAsOrderMix = (index: number) => setLines(current => current.map((line, i) => {
    if (i !== index) return line;
    const template = options?.mixes.find(mix => mix.id === Number(line.mixTemplateId));
    if (!template) return line;
    const sourceComponents = options?.mixComponents.filter(component => component.templateId === template.id) ?? [];
    const total = sourceComponents.reduce((sum, component) => sum + Math.max(0, Number(component.percent) || 0), 0);
    return {
      ...line,
      orderMix: {
        mixName: `${template.name} — order mix`,
        bitumenPercent: String(template.bitumenPercent ?? 0),
        components: sourceComponents.map(component => ({
          materialId: String(component.materialId),
          aggregateSharePercent: String(total > 0 ? (Number(component.percent) || 0) * 100 / total : 0),
        })),
      },
    };
  }));
  const updateOrderMix = (index: number, key: "mixName" | "bitumenPercent", value: string) =>
    setLines(current => current.map((line, i) => line.orderMix && i === index
      ? { ...line, orderMix: { ...line.orderMix, [key]: value } }
      : line));
  const updateOrderMixComponent = (lineIndex: number, componentIndex: number, key: "materialId" | "aggregateSharePercent", value: string) =>
    setLines(current => current.map((line, i) => line.orderMix && i === lineIndex
      ? {
          ...line,
          orderMix: {
            ...line.orderMix,
            components: line.orderMix.components.map((component, j) =>
              j === componentIndex ? { ...component, [key]: value } : component),
          },
        }
      : line));
  const addOrderMixComponent = (lineIndex: number) => setLines(current => current.map((line, i) => line.orderMix && i === lineIndex
    ? { ...line, orderMix: { ...line.orderMix, components: [...line.orderMix.components, { materialId: "", aggregateSharePercent: "" }] } }
    : line));

  return (
    <HubShell title="Plant supply orders" subtitle="Planned mixes, material supply and borrowing" backHref="/plant/hub" backLabel="HMP Operations">
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Plant supply orders</h1>
            <p className="text-sm text-slate-500">Default plant: Main Plant · Dispatches in an open order period link automatically.</p>
          </div>
          <div className="flex gap-2">
            {canSettings && <Link href="/plant/supply-orders/alerts"><Button variant="outline" size="sm"><Settings2 className="mr-2 h-4 w-4" />Alert recipients</Button></Link>}
            <Button onClick={() => setCreateOpen(true)}><PackagePlus className="mr-2 h-4 w-4" />New order</Button>
          </div>
        </div>

        {ordersQuery.isLoading ? <p className="text-sm text-slate-500">Loading orders…</p> : activeOrders.length === 0 ? (
          <Card><CardContent className="py-8 text-sm text-slate-500">No supply orders yet. Dispatches continue to save as “No order” until an order is created.</CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <Card className="h-fit">
              <CardHeader className="pb-2"><CardTitle className="text-base">Orders</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {activeOrders.map(row => (
                  <button
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left ${selectedId === row.id ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <span className="block font-medium">{row.orderNo}</span>
                    {row.workName && <span className="block text-sm text-slate-700">{row.workName}</span>}
                    <span className="block text-sm text-slate-600">{row.partyName}</span>
                    <span className="block text-xs text-slate-500">{row.periodFrom} – {row.periodTo} · {row.status}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
            <div className="space-y-4">
              {!selectedId ? (
                <Card><CardContent className="py-10 text-center text-slate-500"><ClipboardCheck className="mx-auto mb-2 h-8 w-8" />Choose an order to review its balance.</CardContent></Card>
              ) : orderQuery.isLoading ? <p className="text-sm text-slate-500">Loading order…</p> : order ? (
                <>
                  <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div>
                        <CardTitle>{order.orderNo} · {order.partyName}</CardTitle>
                        {order.workName && <p className="mt-1 font-medium text-slate-800">{order.workName}</p>}
                        <p className="mt-1 text-sm text-slate-600">
                          {order.periodFrom} – {order.periodTo}
                          {order.siteName ? ` · ${order.siteName}` : order.dispatchProSiteId ? " · DispatchPro site linked" : ""}
                          {order.status === "closed" ? " · Closed" : " · Open"}
                        </p>
                        <p className="text-xs text-slate-500">Quantity conversion: {Number(order.mtPerCumFactor || 2.356).toFixed(3)} MT/cum</p>
                        {(order.division || order.mandal || order.district) && (
                          <p className="mt-1 text-sm text-slate-600">{[order.division, order.mandal, order.district].filter(Boolean).join(" · ")}</p>
                        )}
                        {order.agreementEstimateRef && <p className="text-sm text-slate-600">Agreement / estimate: {order.agreementEstimateRef}</p>}
                        {order.estimateSorYear && <p className="text-sm text-slate-600">Estimate SOR: {order.estimateSorYear}</p>}
                        {order.remarks && <p className="mt-2 text-sm text-slate-600">{order.remarks}</p>}
                      </div>
                      {options?.canManageLifecycle && (
                        <Button
                          size="sm"
                          variant={order.status === "open" ? "outline" : "default"}
                          onClick={() => statusMutation.mutate(order.status === "open" ? "closed" : "open")}
                        >
                          {order.status === "open" ? "Close order" : "Reopen order"}
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <section>
                        <h2 className="mb-2 font-semibold">Mix balance</h2>
                        <div className="space-y-2">
                          {order.lines.map((line: any) => (
                            <div key={line.id} className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-4">
                              <span className="font-medium">{line.mixName}</span>
                              <span>Ordered: {line.orderedMt.toFixed(1)} MT · {Number(line.equivalentCum).toFixed(3)} cum</span>
                              <span>Dispatched: {line.dispatchedMt.toFixed(3)} MT</span>
                              <span className="font-semibold">Balance: {line.balanceMt.toFixed(3)} MT</span>
                              {line.orderMix && (
                                <span className="col-span-2 text-xs text-slate-600 sm:col-span-4">
                                  Bitumen {Number(line.orderMix.bitumenPercent).toFixed(2)}% · {line.orderMix.components.map((component: any) => {
                                    const material = options?.materials.find(row => row.id === component.materialId);
                                    return `${material?.name ?? `Material #${component.materialId}`} ${Number(component.aggregateSharePercent).toFixed(2)}%`;
                                  }).join(" · ")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        {(() => {
                          const lowerBitumenLine = order.lines.find((line: any) => line.orderMix &&
                            Number(line.orderMix.bitumenPercent) < Number(line.orderMix.sourceBitumenPercent));
                          if (!lowerBitumenLine) return null;
                          const instructionAttached = order.attachments?.some((attachment: any) => attachment.docType === "mix_instruction");
                          return <p className="mt-2 text-xs text-amber-700" data-testid="order-bitumen-instruction-note">
                            Bitumen {Number(lowerBitumenLine.orderMix.bitumenPercent).toFixed(2)}% as instructed by party — instruction {instructionAttached ? "attached" : "not attached"}.
                          </p>;
                        })()}
                      </section>
                      <section>
                        <h2 className="mb-2 font-semibold">Material supply for remaining mix</h2>
                        <div className="space-y-2">
                          {order.materials.map((material: any) => (
                            <div key={material.materialId} className="rounded-lg border p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium">{material.materialName}</p>
                                  <p className="text-xs text-slate-600">
                                    Need for balance: {material.need.toFixed(3)} {material.uom}
                                    {material.dailyNeed > 0 && ` · Daily need: ${material.dailyNeed.toFixed(3)} ${material.uom}`}
                                  </p>
                                </div>
                                <Select
                                  value={material.scope}
                                  onValueChange={(scope: "hlc" | "party") => scopeMutation.mutate({ materialId: material.materialId, scope })}
                                  disabled={scopeMutation.isPending || order.status !== "open"}
                                >
                                  <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="hlc">HLC supplies</SelectItem>
                                    <SelectItem value="party">{order.partyName} supplies</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                                <span>Stock available: {material.stockAvailable.toFixed(3)} {material.stockUom}</span>
                                {material.shortage > 0 && material.scope === "hlc" && (
                                  <span className="text-amber-700">
                                    Short: {material.shortage.toFixed(3)} {material.uom} ·{" "}
                                    <a
                                      className="font-medium underline"
                                      href={`/plant/purchase-indents?returnTo=/plant/supply-orders&context=hmp&from=hmp&materialId=${material.materialId}&material=${encodeURIComponent(material.materialName)}&qty=${material.shortage.toFixed(3)}&uom=${encodeURIComponent(material.uom)}`}
                                    >Raise indent</a>
                                  </span>
                                )}
                                {material.shortage > 0 && material.scope === "party" && (
                                  <span className="font-medium text-amber-700">Party to supply {material.shortage.toFixed(3)} {material.uom}</span>
                                )}
                                {material.runningLow && <span className="font-medium text-orange-700">Running low — less than one production day</span>}
                              </div>
                            </div>
                          ))}
                          {!order.materials.length && <p className="text-sm text-slate-500">No material need remains for the ordered mix.</p>}
                        </div>
                      </section>
                      <section>
                        <h2 className="mb-2 font-semibold">Material allowance and actual use</h2>
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full min-w-[620px] text-left text-sm">
                            <thead className="border-b bg-slate-50 text-xs text-slate-600">
                              <tr><th className="p-2">Material</th><th className="p-2">Supply</th><th className="p-2">Allowance</th><th className="p-2">Actually used</th><th className="p-2">Difference</th></tr>
                            </thead>
                            <tbody>
                              {order.materialUsage?.map((row: any) => (
                                <tr key={row.materialId} className="border-b last:border-0">
                                  <td className="p-2 font-medium">{row.materialName}</td>
                                  <td className="p-2">{row.scope === "party" ? order.partyName : "HLC"}</td>
                                  <td className="p-2">{Number(row.allowance).toFixed(3)} {row.uom}</td>
                                  <td className="p-2">{Number(row.actual).toFixed(3)} {row.uom}{row.plantAllocatedLdo > 0 ? ` (includes ${Number(row.plantAllocatedLdo).toFixed(1)} L plant pre-heat / boiler)` : ""}</td>
                                  <td className="p-2">{row.variance > 0 ? "+" : ""}{Number(row.variance).toFixed(3)} {row.uom}</td>
                                </tr>
                              ))}
                              {!order.materialUsage?.length && <tr><td className="p-3 text-slate-500" colSpan={5}>No dispatch usage recorded yet.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </section>
                      <section className="space-y-2 border-t pt-4">
                        <h2 className="font-semibold">Work documents</h2>
                        {order.attachments?.map((attachment: any) => (
                          <p key={attachment.id} className="text-sm">
                            <a className="underline" href={attachment.objectPath}>{attachment.fileName}</a>
                            <span className="ml-2 text-xs text-slate-500">{attachment.docType === "estimate_pdf" ? "Estimate PDF" : attachment.docType === "mix_instruction" ? "Party mix instruction" : "Document"}</span>
                          </p>
                        ))}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1 text-xs text-slate-600">
                            Add estimate PDF
                            <Input type="file" accept="application/pdf,.pdf" disabled={uploadingAttachment === "estimate_pdf"} onChange={event => { void attachToExistingOrder(event.target.files?.[0] ?? null, "estimate_pdf"); event.currentTarget.value = ""; }} />
                          </label>
                          <label className="space-y-1 text-xs text-slate-600">
                            Add party mix instruction
                            <Input type="file" accept="image/*,application/pdf,.pdf" disabled={uploadingAttachment === "mix_instruction"} onChange={event => { void attachToExistingOrder(event.target.files?.[0] ?? null, "mix_instruction"); event.currentTarget.value = ""; }} />
                          </label>
                        </div>
                      </section>
                    </CardContent>
                  </Card>

                  {order.alerts?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-base">Supply alerts</CardTitle></CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        {order.alerts.map((alert: any) => (
                          <p key={alert.dedupeKey}>{alert.message}</p>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader><CardTitle className="text-base">Borrowed from HLC</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {order.borrowings.map((borrowing: any) => (
                        <div key={borrowing.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{borrowing.materialName}: {borrowing.quantity.toFixed(3)} {borrowing.uom}</p>
                              <p className="text-xs text-slate-600">
                                Truck #{borrowing.dispatchId} · {borrowing.borrowedAt ? format(new Date(borrowing.borrowedAt), "dd MMM yyyy HH:mm") : ""}
                                · {borrowing.status.replaceAll("_", " ")}
                              </p>
                              <p className="mt-1 text-sm">Owed: {borrowing.owed.toFixed(3)} {borrowing.uom} · Replaced: {borrowing.replaced.toFixed(3)} {borrowing.uom}</p>
                              {borrowing.decisionNote && <p className="text-sm text-slate-600">{borrowing.decisionNote}</p>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {borrowing.status === "pending" && options?.canManageLifecycle && <>
                                <Button size="sm" variant="outline" onClick={() => decisionMutation.mutate({ id: borrowing.id, decision: "approved" })}>Approve</Button>
                                <Button size="sm" variant="outline" onClick={() => { setDecisionBorrowingId(borrowing.id); setDecisionNote(""); }}>Party will replace</Button>
                              </>}
                              {borrowing.owed > 0 && (
                                <Button size="sm" variant="outline" onClick={() => { setReplacementBorrowingId(borrowing.id); setReplacementReceiptId(""); setReplacementQty(String(borrowing.owed)); }}>
                                  Mark receipt as replacement
                                </Button>
                              )}
                            </div>
                          </div>
                          {borrowing.events?.length > 0 && (
                            <ul className="mt-2 border-t pt-2 text-xs text-slate-500">
                              {borrowing.events.map((event: any) => <li key={event.id}>{event.createdAt ? format(new Date(event.createdAt), "dd MMM yyyy HH:mm") : ""} · {event.actorName || "User"} · {event.action.replaceAll("_", " ")}{event.note ? ` · ${event.note}` : ""}</li>)}
                            </ul>
                          )}
                        </div>
                      ))}
                      {!order.borrowings.length && <p className="text-sm text-slate-500">No borrowing recorded for this order.</p>}
                    </CardContent>
                  </Card>
                </>
              ) : <Card><CardContent className="py-8 text-sm text-red-600">Could not load this order.</CardContent></Card>}
            </div>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>New plant supply order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Party / job</Label>
                <Select value={partyId} onValueChange={value => { setPartyId(value); setSiteId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Choose party" /></SelectTrigger>
                  <SelectContent>{options?.parties.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                {chosenParty?.dispatchProSiteId && <p className="text-xs text-slate-500">DispatchPro site linked</p>}
              </div>
              <div className="space-y-2"><Label>Site (optional)</Label>
                <Select value={siteId || "none"} onValueChange={value => setSiteId(value === "none" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="No site selected" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No site selected</SelectItem>
                    {siteOptions.map(site => <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Period from</Label><Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} /></div>
              <div className="space-y-2"><Label>Period to</Label><Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Order number (optional)</Label><Input value={orderNo} onChange={e => setOrderNo(e.target.value)} placeholder="Auto-number if blank" /></div>
              <div className="space-y-2"><Label>Work name</Label><Input value={workName} onChange={e => setWorkName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Division</Label><Input value={division} onChange={e => setDivision(e.target.value)} /></div>
              <div className="space-y-2"><Label>Mandal</Label><Input value={mandal} onChange={e => setMandal(e.target.value)} /></div>
              <div className="space-y-2"><Label>District</Label><Input value={district} onChange={e => setDistrict(e.target.value)} /></div>
              <div className="space-y-2"><Label>Agreement / estimate reference</Label><Input value={agreementEstimateRef} onChange={e => setAgreementEstimateRef(e.target.value)} /></div>
              <div className="space-y-2"><Label>Estimate SOR year</Label><Input value={estimateSorYear} onChange={e => setEstimateSorYear(e.target.value)} placeholder="e.g. 2025–26" /></div>
              <div className="space-y-2">
                <Label>MT per cum factor</Label>
                <Input type="number" min="0.001" step="0.001" value={mtPerCumFactor} onChange={e => setMtPerCumFactor(e.target.value)} />
                <p className="text-xs text-muted-foreground">Used only when an order quantity is entered in cum. Default: 2.356.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Estimate PDF (optional)</Label>
                <Input type="file" accept="application/pdf,.pdf" onChange={e => setEstimatePdf(e.target.files?.[0] ?? null)} />
                {estimatePdf && <p className="text-xs text-muted-foreground">{estimatePdf.name}</p>}
              </div>
              <div className="space-y-2">
                <Label>Party mix instruction (optional)</Label>
                <Input type="file" accept="image/*,application/pdf,.pdf" onChange={e => setMixInstruction(e.target.files?.[0] ?? null)} />
                {mixInstruction && <p className="text-xs text-muted-foreground">{mixInstruction.name}</p>}
              </div>
            </div>
            <div className="space-y-2"><Label>Remarks</Label><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><Label>Mix lines</Label><Button type="button" variant="outline" size="sm" onClick={addLine}>Add mix</Button></div>
              {lines.map((line, index) => (
                <div key={index} className="space-y-3 rounded-lg border p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_120px_150px]">
                    <Select value={line.mixTemplateId} onValueChange={value => setLineTemplate(index, value)}>
                      <SelectTrigger><SelectValue placeholder="Choose mix template" /></SelectTrigger>
                      <SelectContent>{mixOptions.map(mix => <SelectItem key={mix.id} value={String(mix.id)}>{mix.name} · {mix.mixType}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input aria-label="Order quantity" type="number" min="0" step="0.001" value={line.enteredQuantity} onChange={e => updateLine(index, "enteredQuantity", e.target.value)} placeholder="Quantity" />
                    <Select value={line.enteredUnit} onValueChange={(value: "MT" | "cum") => updateLine(index, "enteredUnit", value)}>
                      <SelectTrigger aria-label="Order quantity unit"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="MT">MT</SelectItem><SelectItem value="cum">cum</SelectItem></SelectContent>
                    </Select>
                    <Input aria-label="Planned MT per day" type="number" min="0" step="0.001" value={line.plannedMtPerDay} onChange={e => updateLine(index, "plannedMtPerDay", e.target.value)} placeholder="Planned MT / day" />
                  </div>
                  {line.enteredQuantity && Number(mtPerCumFactor) > 0 && (
                    <p className="text-xs text-muted-foreground" data-testid={`order-quantity-conversion-${index}`}>
                      {toOrderedMt(line).toFixed(1)} MT · {toEquivalentCum(line).toFixed(3)} cum
                      {line.enteredUnit === "cum" ? ` at ${Number(mtPerCumFactor).toFixed(3)} MT/cum` : ""}
                    </p>
                  )}
                  {line.mixTemplateId && !line.orderMix && (
                    <Button type="button" size="sm" variant="outline" onClick={() => copyAsOrderMix(index)}>Copy as order mix</Button>
                  )}
                  {line.orderMix && (
                    <div className="space-y-3 rounded-md bg-slate-50 p-3" data-testid={`order-mix-editor-${index}`}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1"><Label className="text-xs">Order mix name</Label><Input value={line.orderMix.mixName} onChange={e => updateOrderMix(index, "mixName", e.target.value)} /></div>
                        <div className="space-y-1"><Label className="text-xs">Bitumen %</Label><Input type="number" min="0" max="99.999" step="0.01" value={line.orderMix.bitumenPercent} onChange={e => updateOrderMix(index, "bitumenPercent", e.target.value)} /></div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs">Aggregate shares</Label>
                        <Button type="button" size="sm" variant="outline" onClick={() => addOrderMixComponent(index)}>Add material</Button>
                      </div>
                      {line.orderMix.components.map((component, componentIndex) => (
                        <div key={componentIndex} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
                          <Select value={component.materialId} onValueChange={value => updateOrderMixComponent(index, componentIndex, "materialId", value)}>
                            <SelectTrigger><SelectValue placeholder="Choose aggregate" /></SelectTrigger>
                            <SelectContent>{options?.materials.filter(material => !/bitumen|^\s*LDO\s*$/i.test(material.name)).map(material => <SelectItem key={material.id} value={String(material.id)}>{material.name}</SelectItem>)}</SelectContent>
                          </Select>
                          <Input aria-label={`Aggregate share ${componentIndex + 1}`} type="number" min="0" max="100" step="0.01" value={component.aggregateSharePercent} onChange={e => updateOrderMixComponent(index, componentIndex, "aggregateSharePercent", e.target.value)} placeholder="Share %" />
                        </div>
                      ))}
                      <p className={`text-xs ${lineHasValidOrderMix(line) ? "text-muted-foreground" : "text-amber-700"}`}>
                        Aggregate shares total {line.orderMix.components.reduce((sum, component) => sum + (Number(component.aggregateSharePercent) || 0), 0).toFixed(2)}%. They must total 100%.
                      </p>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setLines(current => current.map((currentLine, i) => i === index ? { ...currentLine, orderMix: null } : currentLine))}>Use standard template mix</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={createMutation.isPending || !partyId || !Number.isFinite(Number(mtPerCumFactor)) || Number(mtPerCumFactor) <= 0 || lines.some(line => !line.mixTemplateId || !Number(line.enteredQuantity) || toOrderedMt(line) <= 0 || !lineHasValidOrderMix(line))} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "Saving…" : "Save order"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={replacementBorrowingId != null} onOpenChange={open => { if (!open) setReplacementBorrowingId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark receipt as replacement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Matching receipt</Label>
              <Select value={replacementReceiptId} onValueChange={setReplacementReceiptId}>
                <SelectTrigger><SelectValue placeholder="Choose receipt" /></SelectTrigger>
                <SelectContent>{replacementQuery.data?.receipts?.map((receipt: any) => <SelectItem key={receipt.id} value={String(receipt.id)}>
                  {receipt.date} · {receipt.receiptNo || receipt.challanNumber || `Receipt #${receipt.id}`} · {Number(receipt.quantity).toFixed(3)} {receipt.uom}
                </SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Replacement quantity ({order?.borrowings.find((row: any) => row.id === replacementBorrowingId)?.uom})</Label>
              <Input type="number" min="0" step="0.001" value={replacementQty} onChange={e => setReplacementQty(e.target.value)} />
            </div>
            {replacementQuery.data?.borrowings?.length > 0 && <p className="text-xs text-slate-500">Available outstanding borrowings are shown in the order history.</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setReplacementBorrowingId(null)}>Cancel</Button><Button disabled={!replacementReceiptId || !replacementQty || replacementMutation.isPending} onClick={() => replacementMutation.mutate()}>Save replacement</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={decisionBorrowingId != null} onOpenChange={open => { if (!open) setDecisionBorrowingId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Party will replace</DialogTitle></DialogHeader>
          <div className="space-y-2"><Label>Note (required)</Label><Textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setDecisionBorrowingId(null)}>Cancel</Button><Button disabled={!decisionNote.trim() || decisionMutation.isPending} onClick={() => decisionBorrowingId && decisionMutation.mutate({ id: decisionBorrowingId, decision: "party_will_replace", note: decisionNote })}>Save decision</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </HubShell>
  );
}
