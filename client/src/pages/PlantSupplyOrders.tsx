import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClipboardCheck, History, PackagePlus, Pencil, Settings2, Trash2 } from "lucide-react";
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
import { formatSupplyOrderVersionTime } from "@shared/plantSupplyOrderVersions";
import { formatPackedUnitLabel } from "@shared/packedStock";

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
  parties: Array<{
    id: number; name: string; dispatchProSiteId: string | null;
    contactPerson: string | null; mobile: string | null; gstNo: string | null; address: string | null;
  }>;
  sites: Array<{
    id: number; name: string; partyId: number | null;
    workName: string | null; clientDepartment: string | null; division: string | null; mandal: string | null;
    district: string | null; agreementEstimateRef: string | null; estimateSorYear: string | null; mtPerCumFactor: string | null;
  }>;
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

const ORDER_WORK_DETAIL_FIELDS = [
  { key: "workName", label: "Work name" },
  { key: "clientDepartment", label: "Client / department" },
  { key: "division", label: "Division" },
  { key: "mandal", label: "Mandal" },
  { key: "district", label: "District" },
  { key: "agreementEstimateRef", label: "Agreement / estimate ref" },
  { key: "estimateSorYear", label: "SOR year" },
] as const;

function workDetailEntries(source: Record<string, unknown> | null | undefined): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const field of ORDER_WORK_DETAIL_FIELDS) {
    const value = typeof source?.[field.key] === "string" ? (source[field.key] as string).trim() : "";
    if (value) entries.push([field.label, value]);
  }
  return entries;
}

function localDateTimeInput(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function istDateTimeInputToDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? new Date(`${value}:00+05:30`)
    : new Date(Number.NaN);
}

function istDateTimeInputToIso(value: string) {
  const date = istDateTimeInputToDate(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid effective date and time.");
  return date.toISOString();
}

export default function PlantSupplyOrders() {
  const { sectionVisible, isOwner } = useAuth();
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
  const [mtPerCumFactor, setMtPerCumFactor] = useState("2.356");
  const [remarks, setRemarks] = useState("");
  const [estimatePdf, setEstimatePdf] = useState<File | null>(null);
  const [mixInstruction, setMixInstruction] = useState<File | null>(null);
  const [otherFile, setOtherFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState<"estimate_pdf" | "mix_instruction" | "other" | null>(null);
  const [lines, setLines] = useState<MixLine[]>([{ mixTemplateId: "", enteredQuantity: "", enteredUnit: "MT", plannedMtPerDay: "", orderMix: null }]);
  const [replacementBorrowingId, setReplacementBorrowingId] = useState<number | null>(null);
  const [replacementReceiptId, setReplacementReceiptId] = useState("");
  const [replacementQty, setReplacementQty] = useState("");
  const [decisionBorrowingId, setDecisionBorrowingId] = useState<number | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [editLines, setEditLines] = useState<Array<any>>([]);
  const [mixChangeLineId, setMixChangeLineId] = useState<number | null>(null);
  const [mixChangeBitumen, setMixChangeBitumen] = useState("");
  const [mixChangeComponents, setMixChangeComponents] = useState<Array<{ materialId: string; aggregateSharePercent: string }>>([]);
  const [mixChangeAt, setMixChangeAt] = useState("");
  const [mixChangeReason, setMixChangeReason] = useState("");
  const [mixChangeFile, setMixChangeFile] = useState<File | null>(null);
  const [copySiteDetailsOpen, setCopySiteDetailsOpen] = useState(false);
  const [overwriteSiteDetails, setOverwriteSiteDetails] = useState(false);
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
  const createSiteAttachmentsQuery = useQuery<any[]>({
    queryKey: ["/api/attachments", "site", siteId],
    queryFn: () => fetchJson(`/api/attachments?moduleType=site&linkedRecordId=${encodeURIComponent(siteId)}`),
    enabled: Boolean(siteId),
  });
  const orderSiteAttachmentsQuery = useQuery<any[]>({
    queryKey: ["/api/attachments", "site", orderQuery.data?.siteId],
    queryFn: () => fetchJson(`/api/attachments?moduleType=site&linkedRecordId=${encodeURIComponent(String(orderQuery.data?.siteId ?? ""))}`),
    enabled: Boolean(orderQuery.data?.siteId),
  });
  const replacementQuery = useQuery<any>({
    queryKey: ["/api/plant-module/supply-orders", selectedId, "replacement", replacementBorrowingId],
    queryFn: () => fetchJson(`/api/plant-module/supply-orders/${selectedId}/borrowings/${replacementBorrowingId}/receipts`),
    enabled: selectedId != null && replacementBorrowingId != null,
  });
  const activeOrders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const options = optionsQuery.data;
  const order = orderQuery.data;
  useEffect(() => {
    const requestedSection = new URLSearchParams(search).get("section");
    if (requestedSection !== "material-status" || !order || order.id !== selectedId) return;
    const timer = window.setTimeout(() => {
      document.getElementById("order-material-status")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [order?.id, search, selectedId]);
  const siteWorkEntriesForOrder = workDetailEntries(order?.siteWorkDetails);
  const savedOrderWorkEntries = workDetailEntries(order ? {
    workName: order.workName,
    division: order.division,
    mandal: order.mandal,
    district: order.district,
    agreementEstimateRef: order.agreementEstimateRef,
    estimateSorYear: order.estimateSorYear,
  } : null);
  const visibleWorkEntries = order?.siteId
    ? siteWorkEntriesForOrder
    : savedOrderWorkEntries;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/supply-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/supply-orders", selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] }),
    ]);
  };

  const uploadOrderFile = async (orderId: number, file: File, docType: "estimate_pdf" | "mix_instruction" | "other") => {
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
  const attachToExistingOrder = async (file: File | null, docType: "estimate_pdf" | "mix_instruction" | "other") => {
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
  const isBlankMixLine = (line: MixLine) =>
    !line.mixTemplateId && !line.enteredQuantity.trim() && !line.plannedMtPerDay.trim();

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        partyId: Number(partyId),
        siteId: siteId ? Number(siteId) : null,
        periodFrom,
        periodTo,
        orderNo: orderNo.trim() || null,
        mtPerCumFactor: Number(mtPerCumFactor),
        remarks: remarks.trim() || null,
        lines: lines.filter(line => !isBlankMixLine(line)).map(line => ({
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
      setMtPerCumFactor("2.356");
      setRemarks("");
      const files = [
        ...(estimatePdf ? [{ file: estimatePdf, docType: "estimate_pdf" as const }] : []),
        ...(mixInstruction ? [{ file: mixInstruction, docType: "mix_instruction" as const }] : []),
        ...(otherFile ? [{ file: otherFile, docType: "other" as const }] : []),
      ];
      setEstimatePdf(null);
      setMixInstruction(null);
      setOtherFile(null);
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

  const copyWorkDetailsToSiteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/plant-module/supply-orders/${selectedId}/copy-work-details-to-site`, {
        overwrite: overwriteSiteDetails,
      });
      return response.json();
    },
    onSuccess: async (result: any) => {
      setCopySiteDetailsOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/plant-module/supply-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/plant-module/supply-orders", selectedId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/plant-module/supply-orders/options"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/sites"] }),
      ]);
      toast({
        title: "Site master updated",
        description: result.updatedFields?.length
          ? `Copied: ${result.updatedFields.join(", ")}`
          : "No site fields needed updating.",
      });
    },
    onError: error => toast({ title: "Could not copy work details", description: errorText(error), variant: "destructive" }),
  });

  const editOrderMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...editForm,
        orderNo: editForm.orderNo?.trim() || null,
        workName: editForm.workName?.trim() || null,
        division: editForm.division?.trim() || null,
        mandal: editForm.mandal?.trim() || null,
        district: editForm.district?.trim() || null,
        agreementEstimateRef: editForm.agreementEstimateRef?.trim() || null,
        estimateSorYear: editForm.estimateSorYear?.trim() || null,
        remarks: editForm.remarks?.trim() || null,
        mtPerCumFactor: Number(editForm.mtPerCumFactor),
        lines: editLines.filter(line => !isBlankMixLine(line)).map(line => ({
          ...(line.id ? { id: line.id } : {}),
          mixTemplateId: Number(line.mixTemplateId),
          enteredQuantity: Number(line.enteredQuantity),
          enteredUnit: line.enteredUnit,
          plannedMtPerDay: line.plannedMtPerDay.trim() ? Number(line.plannedMtPerDay) : null,
        })),
      };
      const response = await apiRequest("PATCH", `/api/plant-module/supply-orders/${selectedId}`, payload);
      return response.json();
    },
    onSuccess: async () => {
      setEditOpen(false);
      await invalidate();
      toast({ title: "Supply order updated" });
    },
    onError: error => toast({ title: "Could not update supply order", description: errorText(error), variant: "destructive" }),
  });

  const mixVersionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || mixChangeLineId == null) throw new Error("Choose an order mix line.");
      const response = await apiRequest(
        "POST",
        `/api/plant-module/supply-orders/${selectedId}/lines/${mixChangeLineId}/mix-versions`,
        {
          bitumenPercent: Number(mixChangeBitumen),
          components: mixChangeComponents.map(component => ({
            materialId: Number(component.materialId),
            aggregateSharePercent: Number(component.aggregateSharePercent),
          })),
          effectiveAt: istDateTimeInputToIso(mixChangeAt),
          reason: mixChangeReason.trim(),
        },
      );
      const result = await response.json();
      if (mixChangeFile) {
        const uploaded = await uploadFile(mixChangeFile);
        if (!uploaded) throw new Error("The mix was saved, but the instruction file could not be uploaded.");
        await apiRequest("POST", "/api/attachments", {
          moduleType: "plant_supply_order_mix_version",
          linkedRecordId: result.versionId,
          fileName: mixChangeFile.name,
          objectPath: uploaded.objectPath,
          mimeType: mixChangeFile.type || (mixChangeFile.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
          fileSize: mixChangeFile.size,
          docType: "mix_instruction",
        });
      }
      return result;
    },
    onSuccess: async () => {
      setMixChangeLineId(null);
      setMixChangeFile(null);
      setMixChangeReason("");
      await invalidate();
      toast({ title: "New mix version saved" });
    },
    onError: error => toast({ title: "Could not change order mix", description: errorText(error), variant: "destructive" }),
  });

  const removeOrderMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/plant-module/supply-orders/${selectedId}`),
    onSuccess: async () => {
      setSelectedId(null);
      await invalidate();
      toast({ title: "Supply order removed" });
    },
    onError: error => toast({ title: "Could not remove order", description: errorText(error), variant: "destructive" }),
  });

  const removeAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) => apiRequest("DELETE", `/api/attachments/${attachmentId}`),
    onSuccess: async () => { await invalidate(); toast({ title: "File removed" }); },
    onError: error => toast({ title: "Could not remove file", description: errorText(error), variant: "destructive" }),
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
  const selectedSite = siteOptions.find(row => row.id === Number(siteId));
  const siteWorkEntries = selectedSite ? workDetailEntries({
    workName: selectedSite.workName,
    clientDepartment: selectedSite.clientDepartment,
    division: selectedSite.division,
    mandal: selectedSite.mandal,
    district: selectedSite.district,
    agreementEstimateRef: selectedSite.agreementEstimateRef,
    estimateSorYear: selectedSite.estimateSorYear,
  }) : [];
  const siteFactorSet = Number(selectedSite?.mtPerCumFactor) > 0;
  const mixOptions = options?.mixes.filter(row => !row.partyId || row.partyId === Number(partyId)) ?? [];

  const emptyMixLine = (): MixLine => ({
    mixTemplateId: "",
    enteredQuantity: "",
    enteredUnit: "MT",
    plannedMtPerDay: "",
    orderMix: null,
  });
  const addLine = () => setLines(current => [...current, emptyMixLine()]);
  const removeLine = (index: number) => setLines(current => current.filter((_, i) => i !== index));
  const openOrderEdit = () => {
    if (!order) return;
    setEditForm({
      orderNo: order.orderNo ?? "",
      periodFrom: order.periodFrom,
      periodTo: order.periodTo,
      workName: order.workName ?? "",
      division: order.division ?? "",
      mandal: order.mandal ?? "",
      district: order.district ?? "",
      agreementEstimateRef: order.agreementEstimateRef ?? "",
      estimateSorYear: order.estimateSorYear ?? "",
      mtPerCumFactor: String(order.mtPerCumFactor || 2.356),
      remarks: order.remarks ?? "",
    });
    setEditLines(order.lines.map((line: any) => ({
      id: line.id,
      mixTemplateId: String(line.mixTemplateId),
      enteredQuantity: String(line.enteredQuantity ?? line.orderedMt),
      enteredUnit: line.enteredUnit === "cum" ? "cum" : "MT",
      plannedMtPerDay: line.plannedMtPerDay == null ? "" : String(line.plannedMtPerDay),
      dispatchedMt: Number(line.dispatchedMt) || 0,
    })));
    setEditOpen(true);
  };
  const openMixChange = (line: any) => {
    const templateComponents = options?.mixComponents.filter(component => component.templateId === line.mixTemplateId) ?? [];
    const total = templateComponents.reduce((sum, component) => sum + Math.max(0, Number(component.percent) || 0), 0);
    const components = line.orderMix?.components?.length
      ? line.orderMix.components.map((component: any) => ({
          materialId: String(component.materialId),
          aggregateSharePercent: String(component.aggregateSharePercent),
        }))
      : templateComponents.map(component => ({
          materialId: String(component.materialId),
          aggregateSharePercent: String(total > 0 ? (Number(component.percent) || 0) * 100 / total : 0),
        }));
    setMixChangeLineId(line.id);
    setMixChangeBitumen(String(line.orderMix?.bitumenPercent ?? options?.mixes.find(mix => mix.id === line.mixTemplateId)?.bitumenPercent ?? ""));
    setMixChangeComponents(components);
    setMixChangeAt(localDateTimeInput(new Date()));
    setMixChangeReason("");
    setMixChangeFile(null);
  };
  const editLineBlank = (line: any) =>
    !line.mixTemplateId && !String(line.enteredQuantity ?? "").trim() && !String(line.plannedMtPerDay ?? "").trim();
  const updateEditLine = (index: number, field: "mixTemplateId" | "enteredQuantity" | "enteredUnit" | "plannedMtPerDay", value: string) =>
    setEditLines(current => current.map((line, i) => i === index ? { ...line, [field]: value } : line));
  const addEditLine = () => setEditLines(current => [...current, {
    mixTemplateId: "",
    enteredQuantity: "",
    enteredUnit: "MT",
    plannedMtPerDay: "",
    dispatchedMt: 0,
  }]);
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
      {order && (
        <>
          <style>{`@media print { body * { visibility: hidden !important; } #supply-order-print, #supply-order-print * { visibility: visible !important; } #supply-order-print { display: block !important; position: absolute; inset: 0; width: 100%; padding: 24px; color: #111; background: #fff; font: 12pt Arial, sans-serif; } }`}</style>
          <div id="supply-order-print" className="hidden print:block">
            <h1>{order.orderNo} · {order.partyName}</h1>
            <p>{order.periodFrom} – {order.periodTo}{order.siteName ? ` · ${order.siteName}` : ""}</p>
            {[order.partyContactPerson, order.partyMobile, order.partyGstNo, order.partyAddress].filter(Boolean).length > 0 && (
              <p>{[order.partyContactPerson, order.partyMobile, order.partyGstNo, order.partyAddress].filter(Boolean).join(" · ")}</p>
            )}
            {visibleWorkEntries.map(([label, value]) => <p key={label}>{label}: {value}</p>)}
            <p>MT per cum factor: {Number(order.siteWorkDetails?.mtPerCumFactor || order.mtPerCumFactor || 2.356).toFixed(3)}</p>
            <h2>Mixes</h2>
            <table className="w-full border-collapse">
              <thead><tr><th className="border p-2 text-left">Mix</th><th className="border p-2 text-right">Ordered MT</th><th className="border p-2 text-right">Dispatched MT</th><th className="border p-2 text-right">Balance MT</th></tr></thead>
              <tbody>{order.lines.map((line: any) => <tr key={line.id}>
                <td className="border p-2">{line.mixName}</td>
                <td className="border p-2 text-right">{Number(line.orderedMt).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                <td className="border p-2 text-right">{Number(line.dispatchedMt).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                <td className="border p-2 text-right">{Number(line.balanceMt).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
              </tr>)}</tbody>
            </table>
            <h2>Material status</h2>
            <table className="w-full border-collapse">
              <thead><tr><th className="border p-2 text-left">Material</th><th className="border p-2 text-right">Need</th><th className="border p-2 text-right">Short</th></tr></thead>
              <tbody>{order.materials.map((material: any) => <tr key={material.materialId}>
                <td className="border p-2">{material.materialName}</td>
                <td className="border p-2 text-right">{Number(material.need).toLocaleString("en-IN", { maximumFractionDigits: 2 })} {material.uom}</td>
                <td className="border p-2 text-right">{Number(material.shortage).toLocaleString("en-IN", { maximumFractionDigits: 2 })} {material.uom}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>
      )}
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
                    {(row.siteId ? row.siteWorkDetails?.workName : row.workName) && (
                      <span className="block text-sm text-slate-700">
                        {row.siteId ? row.siteWorkDetails?.workName : row.workName}
                      </span>
                    )}
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
                        {visibleWorkEntries.map(([label, value]) => (
                          <p key={label} className={label === "Work name" ? "mt-1 font-medium text-slate-800" : "text-sm text-slate-600"}>
                            {label === "Work name" ? value : `${label}: ${value}`}
                          </p>
                        ))}
                        <p className="mt-1 text-sm text-slate-600">
                          {order.periodFrom} – {order.periodTo}
                          {order.siteName ? ` · ${order.siteName}` : order.dispatchProSiteId ? " · DispatchPro site linked" : ""}
                          {order.status === "closed" ? " · Closed" : " · Open"}
                        </p>
                        {order.siteId && !siteWorkEntriesForOrder.length && (
                          <p className="mt-1 text-sm text-amber-800" data-testid="order-no-site-master-details">
                            No work details in Site master. <Link className="underline" href="/plant/dashboard#site-master">Edit Site master</Link>
                          </p>
                        )}
                        <p className="text-xs text-slate-500">
                          Quantity conversion: {Number(order.siteWorkDetails?.mtPerCumFactor || order.mtPerCumFactor || 2.356).toFixed(3)} MT/cum
                          {Number(order.siteWorkDetails?.mtPerCumFactor) > 0 ? " · from Site master" : ""}
                        </p>
                        {(order.partyContactPerson || order.partyMobile || order.partyGstNo || order.partyAddress) && (
                          <p className="mt-1 text-sm text-slate-600" data-testid="order-party-master-details">
                            {[order.partyContactPerson, order.partyMobile, order.partyGstNo, order.partyAddress].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {order.remarks && <p className="mt-2 text-sm text-slate-600">{order.remarks}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => window.print()} data-testid="button-print-supply-order">Print order</Button>
                        {isOwner && order.siteId && savedOrderWorkEntries.length > 0 && (
                          <Button size="sm" variant="outline" onClick={() => { setOverwriteSiteDetails(false); setCopySiteDetailsOpen(true); }}>
                            Copy work details to Site master
                          </Button>
                        )}
                        {options?.canManageLifecycle && order.status === "open" && (
                          <Button size="sm" variant="outline" onClick={openOrderEdit}>
                            <Pencil className="mr-2 h-4 w-4" />Edit order
                          </Button>
                        )}
                        {options?.canManageLifecycle && (
                          <Button
                            size="sm"
                            variant={order.status === "open" ? "outline" : "default"}
                            onClick={() => statusMutation.mutate(order.status === "open" ? "closed" : "open")}
                          >
                            {order.status === "open" ? "Close order" : "Reopen order"}
                          </Button>
                        )}
                        {isOwner && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={removeOrderMutation.isPending}
                            onClick={() => {
                              if (window.confirm("Remove this supply order? Orders with linked trucks cannot be removed.")) {
                                removeOrderMutation.mutate();
                              }
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />Remove order
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {(orderSiteAttachmentsQuery.data ?? []).length > 0 && (
                        <section data-testid="order-site-attachments">
                          <h2 className="mb-2 font-semibold">Site master documents</h2>
                          <div className="flex flex-wrap gap-3 text-sm">
                            {(orderSiteAttachmentsQuery.data ?? []).map((attachment: any) => (
                              <a key={attachment.id} className="underline" href={attachment.objectPath} target="_blank" rel="noreferrer">
                                {attachment.fileName}
                              </a>
                            ))}
                          </div>
                        </section>
                      )}
                      <section id="order-material-status" className="scroll-mt-4">
                        <h2 className="mb-2 font-semibold">Material status</h2>
                        <div className="space-y-2">
                          {order.materials.map((material: any) => (
                            <div key={material.materialId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                              <span className="font-medium">{material.materialName}</span>
                              <span>Need {Number(material.need).toLocaleString("en-IN", { maximumFractionDigits: 2 })} {material.uom}</span>
                              <span>Dispatched {Number(material.dispatched ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} {material.uom}</span>
                              <span>Short {Number(material.shortage ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} {material.uom}</span>
                            </div>
                          ))}
                        </div>
                      </section>
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
                              {options?.canManageLifecycle && order.status === "open" && (
                                <span className="col-span-2 sm:col-span-4">
                                  <Button size="sm" variant="outline" onClick={() => openMixChange(line)}>Change mix from a date and time</Button>
                                </span>
                              )}
                              {line.mixVersions?.length > 0 && (
                                <div className="col-span-2 space-y-2 border-t pt-2 sm:col-span-4" data-testid={`order-mix-timeline-${line.id}`}>
                                  <p className="text-xs font-semibold text-slate-700">Mix versions</p>
                                  {line.mixVersions.map((version: any, versionIndex: number) => (
                                    <div key={version.versionId ?? `base-${line.id}`} className="rounded border bg-white p-2 text-xs">
                                      <p className="font-medium">
                                        {version.versionId == null ? "Original order mix" : `Version ${versionIndex}`}
                                        {" · "}{formatSupplyOrderVersionTime(version.effectiveAt)}
                                        {version.effectiveUntil ? ` – ${formatSupplyOrderVersionTime(version.effectiveUntil)}` : " – current"}
                                      </p>
                                      <p>Bitumen {Number(version.bitumenPercent).toFixed(2)}% · {Number(version.dispatchedMt).toFixed(3)} MT dispatched</p>
                                      {version.reason && <p>Reason: {version.reason}</p>}
                                      <p>{version.instructionAttached ? "Mix instruction attached" : "No mix instruction attached"} · Added by {version.createdByName || "Unknown"}</p>
                                      {version.components?.length > 0 && <p>{version.components.map((component: any) =>
                                        `${component.materialName ?? options?.materials.find((material: any) => material.id === component.materialId)?.name ?? `Material #${component.materialId}`} ${Number(component.aggregateSharePercent).toFixed(2)}%`
                                      ).join(" · ")}</p>}
                                      <div className="mt-1 space-y-0.5">
                                        {version.materialUsage?.map((usage: any) => (
                                          <p key={usage.materialId}>
                                            {usage.materialName}: allowance {Number(usage.allowance).toFixed(3)} {usage.uom} · actual {Number(usage.actual).toFixed(3)} {usage.uom}
                                          </p>
                                        ))}
                                      </div>
                                      {version.attachments?.map((attachment: any) => (
                                        <p key={attachment.id}>
                                          <a className="underline" href={attachment.objectPath}>{attachment.fileName}</a>
                                          {isOwner && <Button
                                            size="sm"
                                            variant="ghost"
                                            className="ml-2 h-6 px-2 text-red-700"
                                            disabled={removeAttachmentMutation.isPending}
                                            onClick={() => {
                                              if (window.confirm(`Remove ${attachment.fileName}?`)) removeAttachmentMutation.mutate(attachment.id);
                                            }}
                                          >Remove</Button>}
                                        </p>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {(() => {
                          const lowerBitumenLine = order.lines.find((line: any) => line.orderMix &&
                            Number(line.orderMix.bitumenPercent) < Number(line.orderMix.sourceBitumenPercent));
                          if (!lowerBitumenLine) return null;
                          const latestVersion = lowerBitumenLine.mixVersions?.at(-1);
                          const instructionAttached = latestVersion?.instructionAttached ||
                            order.attachments?.some((attachment: any) => attachment.docType === "mix_instruction");
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
                                <span>
                                  Stock available: {material.stockAvailable.toFixed(3)} {material.stockUom}
                                  {material.packedStockCount > 0 && ` (incl. ${Number(material.packedStockCount).toLocaleString()} in ${formatPackedUnitLabel(material.packedUnitName, Number(material.packedStockCount))})`}
                                </span>
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
                            {isOwner && <Button
                              size="sm"
                              variant="ghost"
                              className="ml-2 h-6 px-2 text-red-700"
                              disabled={removeAttachmentMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`Remove ${attachment.fileName}?`)) removeAttachmentMutation.mutate(attachment.id);
                              }}
                            >Remove</Button>}
                          </p>
                        ))}
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="space-y-1 text-xs text-slate-600">
                            Add estimate PDF
                            <Input type="file" accept="application/pdf,.pdf" disabled={uploadingAttachment === "estimate_pdf"} onChange={event => { void attachToExistingOrder(event.target.files?.[0] ?? null, "estimate_pdf"); event.currentTarget.value = ""; }} />
                          </label>
                          <label className="space-y-1 text-xs text-slate-600">
                            Add party mix instruction
                            <Input type="file" accept="image/*,application/pdf,.pdf" disabled={uploadingAttachment === "mix_instruction"} onChange={event => { void attachToExistingOrder(event.target.files?.[0] ?? null, "mix_instruction"); event.currentTarget.value = ""; }} />
                          </label>
                          <label className="space-y-1 text-xs text-slate-600">
                            Add other document
                            <Input type="file" accept="image/*,application/pdf,.pdf" disabled={uploadingAttachment === "other"} onChange={event => { void attachToExistingOrder(event.target.files?.[0] ?? null, "other"); event.currentTarget.value = ""; }} />
                          </label>
                        </div>
                      </section>
                      <details className="rounded-md border p-3">
                        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
                          <History className="h-4 w-4" />Order history ({order.history?.length ?? 0})
                        </summary>
                        <div className="mt-3 space-y-2 border-t pt-3 text-xs">
                          {order.history?.map((entry: any) => {
                            const oldValue = entry.oldValues && typeof entry.oldValues === "object" ? entry.oldValues : null;
                            const newValue = entry.newValues && typeof entry.newValues === "object" ? entry.newValues : null;
                            const field = oldValue?.field ?? newValue?.field ?? entry.action.replaceAll("_", " ");
                            const before = oldValue && "value" in oldValue ? oldValue.value : oldValue;
                            const after = newValue && "value" in newValue ? newValue.value : newValue;
                            const display = (value: unknown) => value == null ? "—"
                              : typeof value === "string" || typeof value === "number" ? String(value)
                              : JSON.stringify(value);
                            return (
                              <p key={entry.id} className="break-words">
                                {entry.createdAt ? format(new Date(entry.createdAt), "dd MMM yyyy, h:mm a") : ""}
                                {" · "}{entry.userName || "User"}{" · "}{field}
                                {before != null || after != null ? ` · ${display(before)} → ${display(after)}` : ""}
                                {entry.reason ? ` · ${entry.reason}` : ""}
                              </p>
                            );
                          })}
                          {!order.history?.length && <p className="text-slate-500">No changes recorded.</p>}
                        </div>
                      </details>
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Edit open supply order</DialogTitle></DialogHeader>
          {editForm && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2"><Label>Order number</Label><Input value={editForm.orderNo} onChange={event => setEditForm((current: any) => ({ ...current, orderNo: event.target.value }))} /></div>
                <div className="space-y-2"><Label>MT per cum factor</Label><Input type="number" min="0.001" step="0.001" value={editForm.mtPerCumFactor} onChange={event => setEditForm((current: any) => ({ ...current, mtPerCumFactor: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Period from</Label><Input type="date" value={editForm.periodFrom} onChange={event => setEditForm((current: any) => ({ ...current, periodFrom: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Period to</Label><Input type="date" value={editForm.periodTo} onChange={event => setEditForm((current: any) => ({ ...current, periodTo: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Work details</Label><Input value={editForm.workName} onChange={event => setEditForm((current: any) => ({ ...current, workName: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Division</Label><Input value={editForm.division} onChange={event => setEditForm((current: any) => ({ ...current, division: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Mandal</Label><Input value={editForm.mandal} onChange={event => setEditForm((current: any) => ({ ...current, mandal: event.target.value }))} /></div>
                <div className="space-y-2"><Label>District</Label><Input value={editForm.district} onChange={event => setEditForm((current: any) => ({ ...current, district: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Agreement / estimate reference</Label><Input value={editForm.agreementEstimateRef} onChange={event => setEditForm((current: any) => ({ ...current, agreementEstimateRef: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Estimate SOR year</Label><Input value={editForm.estimateSorYear} onChange={event => setEditForm((current: any) => ({ ...current, estimateSorYear: event.target.value }))} /></div>
              </div>
              {order?.dispatches?.length > 0 && (() => {
                const outside = order.dispatches.filter((dispatch: any) =>
                  dispatch.date < editForm.periodFrom || dispatch.date > editForm.periodTo,
                );
                return outside.length > 0 ? (
                  <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
                    {outside.length} trucks already linked on {outside.map((dispatch: any) => dispatch.date).sort().join(", ")}. The order period must include every linked truck.
                  </p>
                ) : null;
              })()}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Mix lines</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addEditLine}>Add mix line</Button>
                </div>
                {editLines.map((line, index) => {
                  const orderedMt = Number(line.enteredQuantity) * (line.enteredUnit === "cum" ? Number(editForm.mtPerCumFactor) : 1);
                  const belowUsed = Number.isFinite(orderedMt) && orderedMt + 0.000001 < Number(line.dispatchedMt || 0);
                  return (
                    <div key={line.id ?? `new-${index}`} className="space-y-2 rounded-md border p-3">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_100px_130px_auto]">
                        <Select value={line.mixTemplateId} onValueChange={value => updateEditLine(index, "mixTemplateId", value)} disabled={!!line.id}>
                          <SelectTrigger><SelectValue placeholder="Choose mix" /></SelectTrigger>
                          <SelectContent>{mixOptions.map(mix => <SelectItem key={mix.id} value={String(mix.id)}>{mix.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input aria-label={`Mix line ${index + 1} quantity`} type="number" min="0" step="0.001" value={line.enteredQuantity} onChange={event => updateEditLine(index, "enteredQuantity", event.target.value)} placeholder="Quantity" />
                        <Select value={line.enteredUnit} onValueChange={(value: "MT" | "cum") => updateEditLine(index, "enteredUnit", value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MT">MT</SelectItem><SelectItem value="cum">cum</SelectItem></SelectContent>
                        </Select>
                        <Input aria-label={`Mix line ${index + 1} planned MT per day`} type="number" min="0" step="0.001" value={line.plannedMtPerDay} onChange={event => updateEditLine(index, "plannedMtPerDay", event.target.value)} placeholder="MT / day" />
                        <Button type="button" size="icon" variant="ghost" aria-label={`Remove mix line ${index + 1}`} disabled={Number(line.dispatchedMt) > 0} onClick={() => setEditLines(current => current.filter((_, i) => i !== index))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {Number(line.dispatchedMt) > 0 && <p className="text-xs text-slate-600">{Number(line.dispatchedMt).toFixed(3)} MT already dispatched; this line cannot be removed or reduced below that amount.</p>}
                      {belowUsed && <p className="text-xs text-red-700">Ordered quantity cannot be below {Number(line.dispatchedMt).toFixed(3)} MT already dispatched.</p>}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2"><Label>Remarks</Label><Textarea value={editForm.remarks} onChange={event => setEditForm((current: any) => ({ ...current, remarks: event.target.value }))} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              disabled={editOrderMutation.isPending || !editForm || !editLines.some(line => !editLineBlank(line)) ||
                editLines.some(line => !editLineBlank(line) && (!line.mixTemplateId || Number(line.enteredQuantity) <= 0 ||
                  Number(line.plannedMtPerDay) < 0 ||
                  (line.plannedMtPerDay !== "" && Number(line.plannedMtPerDay) <= 0))) ||
                editLines.some(line => !editLineBlank(line) && Number(line.dispatchedMt) > 0 &&
                  Number(line.enteredQuantity) * (line.enteredUnit === "cum" ? Number(editForm?.mtPerCumFactor) : 1) + 0.000001 < Number(line.dispatchedMt)) ||
                (order?.dispatches ?? []).some((dispatch: any) => dispatch.date < (editForm?.periodFrom ?? "") || dispatch.date > (editForm?.periodTo ?? ""))}
              onClick={() => editOrderMutation.mutate()}
            >{editOrderMutation.isPending ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mixChangeLineId != null} onOpenChange={open => { if (!open) setMixChangeLineId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Change order mix</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">This saves a new mix version. Past truck figures and stock entries are not changed.</p>
            <div className="space-y-2">
              <Label>Effective from (IST)</Label>
              <Input type="datetime-local" value={mixChangeAt} onChange={event => setMixChangeAt(event.target.value)} />
              {order?.dispatches?.some((dispatch: any) => {
                const line = order.lines.find((candidate: any) => candidate.id === mixChangeLineId);
                if (!line || dispatch.mixTemplateId !== line.mixTemplateId) return false;
                const effective = istDateTimeInputToDate(mixChangeAt).getTime();
                const dispatchAt = new Date(`${dispatch.date}T${dispatch.time || "00:00"}+05:30`).getTime();
                return Number.isFinite(effective) && effective < dispatchAt;
              }) && <p className="text-xs text-red-700">Effective time cannot be earlier than the latest truck already linked to this mix.</p>}
            </div>
            <div className="space-y-2"><Label>Bitumen %</Label><Input type="number" min="0" max="99.9999" step="0.01" value={mixChangeBitumen} onChange={event => setMixChangeBitumen(event.target.value)} /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Aggregate shares</Label><Button type="button" size="sm" variant="outline" onClick={() => setMixChangeComponents(current => [...current, { materialId: "", aggregateSharePercent: "" }])}>Add material</Button></div>
              {mixChangeComponents.map((component, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
                  <Select value={component.materialId} onValueChange={value => setMixChangeComponents(current => current.map((row, i) => i === index ? { ...row, materialId: value } : row))}>
                    <SelectTrigger><SelectValue placeholder="Choose aggregate" /></SelectTrigger>
                    <SelectContent>{options?.materials.filter(material => !/bitumen|^\s*LDO\s*$/i.test(material.name)).map(material => (
                      <SelectItem key={material.id} value={String(material.id)}>{material.name}</SelectItem>
                    ))}</SelectContent>
                  </Select>
                  <Input aria-label={`Aggregate share ${index + 1}`} type="number" min="0" max="100" step="0.01" value={component.aggregateSharePercent} onChange={event => setMixChangeComponents(current => current.map((row, i) => i === index ? { ...row, aggregateSharePercent: event.target.value } : row))} placeholder="Share %" />
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove aggregate ${index + 1}`} disabled={mixChangeComponents.length <= 1} onClick={() => setMixChangeComponents(current => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <p className={`text-xs ${Math.abs(mixChangeComponents.reduce((sum, row) => sum + (Number(row.aggregateSharePercent) || 0), 0) - 100) <= 0.01 ? "text-slate-500" : "text-amber-700"}`}>
                Shares total {mixChangeComponents.reduce((sum, row) => sum + (Number(row.aggregateSharePercent) || 0), 0).toFixed(2)}%; they must total 100%.
              </p>
            </div>
            <div className="space-y-2"><Label>Reason (required)</Label><Textarea value={mixChangeReason} onChange={event => setMixChangeReason(event.target.value)} /></div>
            <div className="space-y-2"><Label>Mix instruction attachment (optional)</Label><Input type="file" accept="image/*,application/pdf,.pdf" onChange={event => setMixChangeFile(event.target.files?.[0] ?? null)} />{mixChangeFile && <p className="text-xs text-slate-500">{mixChangeFile.name}</p>}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMixChangeLineId(null)}>Cancel</Button>
            <Button
              disabled={mixVersionMutation.isPending || !mixChangeAt || !mixChangeReason.trim() ||
                !Number.isFinite(Number(mixChangeBitumen)) || Number(mixChangeBitumen) < 0 || Number(mixChangeBitumen) >= 100 ||
                !mixChangeComponents.length || mixChangeComponents.some(row => !row.materialId || !Number.isFinite(Number(row.aggregateSharePercent)) || Number(row.aggregateSharePercent) < 0) ||
                Math.abs(mixChangeComponents.reduce((sum, row) => sum + (Number(row.aggregateSharePercent) || 0), 0) - 100) > 0.01 ||
                order?.dispatches?.some((dispatch: any) => {
                  const line = order.lines.find((candidate: any) => candidate.id === mixChangeLineId);
                  return !!line && dispatch.mixTemplateId === line.mixTemplateId &&
                    istDateTimeInputToDate(mixChangeAt).getTime() < new Date(`${dispatch.date}T${dispatch.time || "00:00"}+05:30`).getTime();
                })}
              onClick={() => mixVersionMutation.mutate()}
            >{mixVersionMutation.isPending ? "Saving…" : "Save new version"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>New plant supply order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2"><Label>Party / job</Label>
                <Select value={partyId} onValueChange={value => { setPartyId(value); setSiteId(""); setMtPerCumFactor("2.356"); }}>
                  <SelectTrigger><SelectValue placeholder="Choose party" /></SelectTrigger>
                  <SelectContent>{options?.parties.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                {chosenParty?.dispatchProSiteId && <p className="text-xs text-slate-500">DispatchPro site linked</p>}
                {(chosenParty?.contactPerson || chosenParty?.mobile || chosenParty?.gstNo || chosenParty?.address) && (
                  <p className="text-xs text-slate-600" data-testid="order-party-contact">
                    {[chosenParty.contactPerson, chosenParty.mobile, chosenParty.gstNo, chosenParty.address].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="space-y-2"><Label>Site (optional)</Label>
                <Select value={siteId || "none"} onValueChange={value => {
                  const nextSiteId = value === "none" ? "" : value;
                  const nextSite = siteOptions.find(site => site.id === Number(nextSiteId));
                  setSiteId(nextSiteId);
                  setMtPerCumFactor(nextSite?.mtPerCumFactor ? String(nextSite.mtPerCumFactor) : "2.356");
                }}>
                  <SelectTrigger><SelectValue placeholder="No site selected" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No site selected</SelectItem>
                    {siteOptions.map(site => <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {siteId && (
              <div className="rounded-md border bg-slate-50 p-3" data-testid="order-site-work-details">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Work details from Site master</h3>
                  <Link href="/plant/dashboard#site-master" className="text-sm underline">Edit in Site master</Link>
                </div>
                {siteWorkEntries.length ? (
                  <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    {siteWorkEntries.map(([label, value]) => <div key={label}><dt className="inline text-slate-500">{label}: </dt><dd className="inline">{value}</dd></div>)}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-slate-600" data-testid="order-no-site-work-details">No work details in Site master.</p>
                )}
                {(createSiteAttachmentsQuery.data ?? []).length > 0 && (
                  <div className="mt-2 text-sm">
                    <p className="font-medium">Site attachments</p>
                    {(createSiteAttachmentsQuery.data ?? []).map((attachment: any) => (
                      <p key={attachment.id}><a className="underline" href={attachment.objectPath}>{attachment.fileName}</a></p>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Period from</Label><Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} /></div>
              <div className="space-y-2"><Label>Period to</Label><Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Order number (optional)</Label><Input value={orderNo} onChange={e => setOrderNo(e.target.value)} placeholder="Auto-number if blank" /></div>
              <div className="space-y-2">
                <Label>MT per cum factor</Label>
                <Input type="number" min="0.001" step="0.001" value={mtPerCumFactor} readOnly={siteFactorSet} onChange={e => setMtPerCumFactor(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Used only for quantities entered in cum. {siteFactorSet ? "From the Site master." : "Fallback: 2.356; editable for this order."}
                </p>
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
              <div className="space-y-2">
                <Label>Other document (optional)</Label>
                <Input type="file" accept="image/*,application/pdf,.pdf" onChange={e => setOtherFile(e.target.files?.[0] ?? null)} />
                {otherFile && <p className="text-xs text-muted-foreground">{otherFile.name}</p>}
              </div>
            </div>
            <div className="space-y-2"><Label>Remarks</Label><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><Label>Mix lines</Label><Button type="button" variant="outline" size="sm" onClick={addLine}>Add mix line</Button></div>
              {lines.map((line, index) => (
                <div key={index} className="space-y-3 rounded-lg border p-3">
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeLine(index)} aria-label={`Remove mix line ${index + 1}`}>
                      <Trash2 className="mr-1 h-4 w-4" />Remove line
                    </Button>
                  </div>
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
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={createMutation.isPending || !partyId || !Number.isFinite(Number(mtPerCumFactor)) || Number(mtPerCumFactor) <= 0 || !lines.some(line => !isBlankMixLine(line)) || lines.some(line => !isBlankMixLine(line) && (!line.mixTemplateId || !Number(line.enteredQuantity) || toOrderedMt(line) <= 0 || !lineHasValidOrderMix(line)))} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "Saving…" : "Save order"}</Button></DialogFooter>
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

      <Dialog open={copySiteDetailsOpen} onOpenChange={setCopySiteDetailsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Copy work details to Site master</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">Review each field before saving. Blank Site master fields are filled; existing values stay unchanged unless overwrite is selected.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={overwriteSiteDetails} onChange={event => setOverwriteSiteDetails(event.target.checked)} />
            Overwrite existing Site master values
          </label>
          <div className="space-y-2">
            {ORDER_WORK_DETAIL_FIELDS.filter(field => field.key !== "clientDepartment").map(field => {
              const sourceValue = field.key === "workName" ? order?.workName
                : field.key === "division" ? order?.division
                : field.key === "mandal" ? order?.mandal
                : field.key === "district" ? order?.district
                : field.key === "agreementEstimateRef" ? order?.agreementEstimateRef
                : order?.estimateSorYear;
              const currentValue = order?.siteWorkDetails?.[field.key];
              const willCopy = Boolean(sourceValue?.trim()) && (overwriteSiteDetails || !String(currentValue ?? "").trim());
              return (
                <div key={field.key} className="grid gap-1 rounded border p-2 text-sm sm:grid-cols-[150px_1fr_1fr]">
                  <strong>{field.label}</strong>
                  <span>Site: {currentValue || "—"}</span>
                  <span>Order: {sourceValue || "—"} · {willCopy ? (currentValue ? "will replace" : "will fill") : "will stay unchanged"}</span>
                </div>
              );
            })}
            <div className="grid gap-1 rounded border p-2 text-sm sm:grid-cols-[150px_1fr_1fr]">
              <strong>MT per cum factor</strong>
              <span>Site: {order?.siteWorkDetails?.mtPerCumFactor || "—"}</span>
              <span>Order: {order?.mtPerCumFactor || "—"} · {overwriteSiteDetails || !Number(order?.siteWorkDetails?.mtPerCumFactor) ? "will copy" : "will stay unchanged"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopySiteDetailsOpen(false)}>Cancel</Button>
            <Button disabled={copyWorkDetailsToSiteMutation.isPending} onClick={() => copyWorkDetailsToSiteMutation.mutate()}>
              {copyWorkDetailsToSiteMutation.isPending ? "Copying…" : "Apply reviewed copy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HubShell>
  );
}
