import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Loader2, Fuel, X, Check, ArrowRight, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { DieselRequirementWithItems, DieselRequirement, DieselRequirementItem, EquipmentMasterType } from "@shared/schema";

type ViewMode = "list" | "form" | "detail" | "update" | "report";

interface FormItem {
  equipmentId: number | null;
  equipmentName: string;
  purpose: string;
  estHours: string;
  norm: string;
  plannedQty: string;
}

interface ApprovalItem {
  itemId: number;
  approvedQty: number;
}

export default function DieselRequirements() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/plant/dashboard");

  const [view, setView] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formRaisedBy, setFormRaisedBy] = useState("");
  const [formRemarks, setFormRemarks] = useState("");
  const [formItems, setFormItems] = useState<FormItem[]>([
    { equipmentId: null, equipmentName: "", purpose: "", estHours: "", norm: "", plannedQty: "" },
  ]);

  const [editId, setEditId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [approvalItems, setApprovalItems] = useState<ApprovalItem[]>([]);
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAction, setPinAction] = useState<"approve" | "reject" | "edit" | "delete" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [storedPin, setStoredPin] = useState("");

  const [purchaseQty, setPurchaseQty] = useState("");
  const [purchaseSupplier, setPurchaseSupplier] = useState("");
  const [purchaseBillNo, setPurchaseBillNo] = useState("");
  const [purchaseRate, setPurchaseRate] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [purchaseRemarks, setPurchaseRemarks] = useState("");

  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [reportGenerated, setReportGenerated] = useState(false);

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const queryString = buildQueryString();
  const { data: requirements, isLoading } = useQuery<DieselRequirementWithItems[]>({
    queryKey: ["/api/diesel-requirements", queryString],
    queryFn: () => fetch(`/api/diesel-requirements${queryString}`).then(r => r.json()),
  });

  const { data: summary } = useQuery<{ total: number; pending: number; approved: number; rejected: number }>({
    queryKey: ["/api/diesel-requirements/summary"],
  });

  const { data: selectedRequirement, isLoading: detailLoading } = useQuery<DieselRequirementWithItems>({
    queryKey: ["/api/diesel-requirements", selectedId],
    enabled: !!selectedId,
  });

  const { data: equipment } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
  });

  const { data: comparisonReport, isLoading: reportLoading } = useQuery<any>({
    queryKey: ["/api/diesel-requirements/comparison?dateFrom=" + reportDateFrom + "&dateTo=" + reportDateTo],
    enabled: reportGenerated && !!reportDateFrom && !!reportDateTo,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/diesel-requirements", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements/summary"] });
      toast({ title: "Diesel requirement submitted for approval" });
      resetForm();
      setView("list");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (data: { id: number; pin: string; approvedItems: ApprovalItem[] }) =>
      apiRequest("PATCH", `/api/diesel-requirements/${data.id}/approve`, {
        pin: data.pin,
        approvedItems: data.approvedItems,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements/summary"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements", selectedId] });
      toast({ title: "Diesel requirement approved" });
      setView("list");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (data: { id: number; pin: string; reason: string }) =>
      apiRequest("PATCH", `/api/diesel-requirements/${data.id}/reject`, {
        pin: data.pin,
        reason: data.reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements/summary"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements", selectedId] });
      toast({ title: "Diesel requirement rejected" });
      setView("list");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: (data: { id: number; purchaseData: any }) =>
      apiRequest("PATCH", `/api/diesel-requirements/${data.id}/purchase-update`, data.purchaseData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements/summary"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements", selectedId] });
      toast({ title: "Purchase details updated" });
      setView("list");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/diesel-requirements/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements/summary"] });
      toast({ title: "Diesel requirement updated successfully" });
      resetForm();
      setEditId(null);
      setView("list");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, pin }: { id: number; pin: string }) =>
      apiRequest("DELETE", `/api/diesel-requirements/${id}`, { pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/diesel-requirements/summary"] });
      toast({ title: "Diesel requirement deleted successfully" });
      setShowDeleteConfirm(false);
      setSelectedId(null);
      setView("list");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setFormRaisedBy("");
    setFormRemarks("");
    setFormItems([{ equipmentId: null, equipmentName: "", purpose: "", estHours: "", norm: "", plannedQty: "" }]);
  };

  const addFormRow = () => {
    setFormItems([...formItems, { equipmentId: null, equipmentName: "", purpose: "", estHours: "", norm: "", plannedQty: "" }]);
  };

  const removeFormRow = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const updateFormItem = (index: number, field: keyof FormItem, value: any) => {
    const updated = [...formItems];
    (updated[index] as any)[field] = value;

    if (field === "equipmentId") {
      const eq = equipment?.find((e) => e.id === Number(value));
      if (eq) {
        updated[index].equipmentName = eq.name + (eq.registrationNumber ? ` (${eq.registrationNumber})` : "") + ` | ${(eq as any).ownership === "hired" ? `HIRED: ${(eq as any).vendorName || "—"}` : "HLC OWN"}`;
        updated[index].norm = String(eq.consumptionNorm || "");
        const hours = parseFloat(updated[index].estHours) || 0;
        const norm = eq.consumptionNorm || 0;
        updated[index].plannedQty = hours && norm ? String(Math.ceil(hours * norm)) : "";
      }
    }

    if (field === "estHours" || field === "norm") {
      const hours = parseFloat(field === "estHours" ? String(value) : updated[index].estHours) || 0;
      const norm = parseFloat(field === "norm" ? String(value) : updated[index].norm) || 0;
      updated[index].plannedQty = hours && norm ? String(Math.ceil(hours * norm)) : "";
    }

    setFormItems(updated);
  };

  const formTotal = useMemo(
    () => formItems.reduce((sum, item) => sum + (parseFloat(item.plannedQty) || 0), 0),
    [formItems]
  );

  const handleSubmit = () => {
    if (!formRaisedBy || formItems.every((i) => !i.equipmentName)) return;
    const items = formItems
      .filter((i) => i.equipmentName)
      .map((i) => ({
        equipmentId: i.equipmentId ? Number(i.equipmentId) : null,
        equipmentName: i.equipmentName.toUpperCase(),
        purpose: (i.purpose || "").toUpperCase() || null,
        estHours: parseFloat(i.estHours) || null,
        norm: parseFloat(i.norm) || null,
        plannedQty: parseFloat(i.plannedQty) || 0,
      }));
    const payload = {
      date: formDate,
      raisedBy: formRaisedBy.toUpperCase(),
      totalPlanned: formTotal,
      status: "pending",
      remarks: formRemarks.toUpperCase() || null,
      items,
    };

    if (editId) {
      editMutation.mutate({ id: editId, data: { ...payload, pin: storedPin } });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openDetail = (req: DieselRequirementWithItems) => {
    setSelectedId(req.id);
    if (req.status === "pending") {
      setApprovalItems(
        req.items.map((item) => ({ itemId: item.id, approvedQty: item.plannedQty }))
      );
      setView("detail");
    } else if (req.status === "approved") {
      setPurchaseQty(req.qtyPurchased ? String(req.qtyPurchased) : "");
      setPurchaseSupplier(req.supplier || "");
      setPurchaseBillNo(req.billNo || "");
      setPurchaseRate(req.rate ? String(req.rate) : "");
      setPurchaseAmount(req.amount ? String(req.amount) : "");
      setPurchasedAt(req.purchasedAt || "");
      setPurchaseRemarks(req.purchaseRemarks || "");
      setView("update");
    } else {
      setView("detail");
    }
  };

  const handlePinSuccess = (_role: "manager" | "admin", pin: string) => {
    setShowPinAuth(false);
    setStoredPin(pin);
    if (pinAction === "approve" && selectedId) {
      approveMutation.mutate({ id: selectedId, pin, approvedItems: approvalItems });
    } else if (pinAction === "reject" && selectedId) {
      if (!rejectionReason.trim()) {
        toast({ title: "Rejection reason is required", variant: "destructive" });
        return;
      }
      rejectMutation.mutate({ id: selectedId, pin, reason: rejectionReason.toUpperCase() });
    } else if (pinAction === "edit" && selectedId && selectedRequirement) {
      setEditId(selectedId);
      setFormDate(selectedRequirement.date);
      setFormRaisedBy(selectedRequirement.raisedBy);
      setFormRemarks(selectedRequirement.remarks || "");
      setFormItems(selectedRequirement.items.map(item => ({
        equipmentId: item.equipmentId,
        equipmentName: item.equipmentName,
        purpose: item.purpose || "",
        estHours: item.estHours != null ? String(item.estHours) : "",
        norm: item.norm != null ? String(item.norm) : "",
        plannedQty: String(item.plannedQty),
      })));
      setView("form");
    } else if (pinAction === "delete" && selectedId) {
      deleteMutation.mutate({ id: selectedId, pin });
    }
    setPinAction(null);
  };

  const handlePurchaseSubmit = () => {
    if (!selectedId) return;
    const qty = parseFloat(purchaseQty);
    const rate = parseFloat(purchaseRate);
    const computedAmount = qty && rate ? Math.round(qty * rate * 100) / 100 : parseFloat(purchaseAmount) || undefined;
    purchaseMutation.mutate({
      id: selectedId,
      purchaseData: {
        qtyPurchased: qty || undefined,
        supplier: purchaseSupplier.toUpperCase() || undefined,
        billNo: purchaseBillNo.toUpperCase() || undefined,
        rate: rate || undefined,
        amount: computedAmount,
        purchasedAt: purchasedAt || undefined,
        purchaseRemarks: purchaseRemarks.toUpperCase() || undefined,
      },
    });
  };

  const approvalTotal = useMemo(
    () => approvalItems.reduce((sum, i) => sum + (i.approvedQty || 0), 0),
    [approvalItems]
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300 dark:border-amber-700" data-testid={`badge-status-${status}`}>PENDING</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-300 dark:border-green-700" data-testid={`badge-status-${status}`}>APPROVED</Badge>;
      case "purchased":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-300 dark:border-blue-700" data-testid={`badge-status-${status}`}>PURCHASED</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-300 dark:border-red-700" data-testid={`badge-status-${status}`}>REJECTED</Badge>;
      default:
        return <Badge variant="outline">{status.toUpperCase()}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return format(d, "dd-MMM-yyyy").toUpperCase();
    } catch {
      return dateStr;
    }
  };

  const StatusSteps = ({ status }: { status: string }) => {
    const steps = [
      { key: "raised", label: "RAISED" },
      { key: "approved", label: "APPROVED" },
      { key: "purchased", label: "PURCHASED" },
    ];
    const statusOrder: Record<string, number> = { pending: 0, approved: 1, purchased: 2, rejected: -1 };
    const currentStep = statusOrder[status] ?? -1;

    if (status === "rejected") {
      return (
        <div className="flex items-center gap-2 flex-wrap" data-testid="status-steps">
          <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700">
            <Check className="w-3 h-3 mr-1" /> RAISED
          </Badge>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700">
            <X className="w-3 h-3 mr-1" /> REJECTED
          </Badge>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 flex-wrap" data-testid="status-steps">
        {steps.map((step, i) => {
          const isDone = i < currentStep + 1;
          const isActive = i === currentStep + 1 || (i === 0 && currentStep === 0);
          return (
            <span key={step.key} className="contents">
              {i > 0 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
              <Badge
                variant="outline"
                className={
                  isDone
                    ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700"
                    : isActive
                      ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                      : "text-muted-foreground"
                }
              >
                {isDone ? <Check className="w-3 h-3 mr-1" /> : null}
                {step.label}
              </Badge>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      {showPinAuth && (
        <PinAuth
          targetRole={pinAction === "delete" ? "admin" : (pinAction === "edit" && selectedRequirement && selectedRequirement.status !== "pending") ? "admin" : "any"}
          onSuccess={handlePinSuccess}
          onClose={() => { setShowPinAuth(false); setPinAction(null); }}
        />
      )}

      {showDeleteConfirm && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <p className="font-bold text-red-600 uppercase">DELETE DIESEL REQUIREMENT</p>
            </div>
            <p className="text-sm text-muted-foreground">THIS WILL PERMANENTLY DELETE THE DIESEL REQUIREMENT AND ALL ITS ITEMS. THIS ACTION CANNOT BE UNDONE.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} data-testid="button-delete-dismiss">
                CANCEL
              </Button>
              <Button
                variant="outline"
                className="text-red-600 border-red-300"
                disabled={deleteMutation.isPending}
                onClick={() => { setPinAction("delete"); setShowPinAuth(true); }}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                DELETE PERMANENTLY
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground italic">ADMIN PIN REQUIRED</p>
          </CardContent>
        </Card>
      )}

      {view === "list" && (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href={backLink}>
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
                  <Fuel className="w-5 h-5 text-amber-600" />
                  DAILY DIESEL REQUIREMENT
                </h1>
                <p className="text-xs text-muted-foreground">Plan, approve, and track daily diesel purchases</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setView("report"); setReportGenerated(false); }} data-testid="button-comparison-report">
                COMPARISON REPORT
              </Button>
              <Button size="sm" className="gap-1" onClick={() => { resetForm(); setView("form"); }} data-testid="button-raise-requirement">
                <Plus className="w-4 h-4" /> RAISE REQUIREMENT
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card data-testid="card-summary-total">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">THIS MONTH</p>
                <p className="text-2xl font-bold mt-1">{summary?.total ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">Requirements raised</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-planned">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">TOTAL PLANNED</p>
                <p className="text-2xl font-bold mt-1 text-amber-600">
                  {requirements ? Math.round(requirements.reduce((s, r) => s + (r.totalPlanned || 0), 0)).toLocaleString() : 0} L
                </p>
                <p className="text-[11px] text-muted-foreground">Diesel required</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-purchased">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">TOTAL PURCHASED</p>
                <p className="text-2xl font-bold mt-1 text-blue-600">
                  {requirements ? Math.round(requirements.reduce((s, r) => s + (r.qtyPurchased || 0), 0)).toLocaleString() : 0} L
                </p>
                <p className="text-[11px] text-muted-foreground">Actually bought</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-pending">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">PENDING</p>
                <p className="text-2xl font-bold mt-1 text-amber-500">{summary?.pending ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">Awaiting approval</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">DATE FROM</Label>
                  <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
                </div>
                <div>
                  <Label className="text-xs">DATE TO</Label>
                  <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
                </div>
                <div>
                  <Label className="text-xs">STATUS</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger data-testid="filter-status">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL STATUS</SelectItem>
                      <SelectItem value="pending">PENDING</SelectItem>
                      <SelectItem value="approved">APPROVED</SelectItem>
                      <SelectItem value="purchased">PURCHASED</SelectItem>
                      <SelectItem value="rejected">REJECTED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !requirements?.length ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No diesel requirements found. Raise a new requirement to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {requirements.map((req) => {
                const borderColor =
                  req.status === "approved" ? "border-l-green-500" :
                    req.status === "purchased" ? "border-l-blue-500" :
                      req.status === "rejected" ? "border-l-red-500" :
                        "border-l-amber-500";
                const isToday = req.date === format(new Date(), "yyyy-MM-dd");
                return (
                  <Card
                    key={req.id}
                    className={`border-l-4 ${borderColor} cursor-pointer hover-elevate`}
                    onClick={() => openDetail(req)}
                    data-testid={`card-requirement-${req.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div>
                          <p className="font-bold text-sm" data-testid={`text-date-${req.id}`}>
                            {formatDate(req.date)} {isToday && "(TODAY)"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Raised by {req.raisedBy}
                            {req.items && ` \u2022 ${req.items.length} equipment/DGs`}
                            {req.approvedBy && ` \u2022 Approved by ${req.approvedBy}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`font-bold text-lg ${req.status === "purchased" ? "text-blue-600" : req.status === "approved" ? "text-green-600" : "text-amber-600"}`} data-testid={`text-qty-${req.id}`}>
                              {Math.round(req.totalPlanned)} L
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {req.status === "purchased" && req.qtyPurchased
                                ? `Planned: ${Math.round(req.totalPlanned)} L \u2022 Bought: ${Math.round(req.qtyPurchased)} L`
                                : req.status === "approved" && !req.qtyPurchased
                                  ? "Approved, not yet bought"
                                  : "Planned"}
                            </p>
                          </div>
                          {getStatusBadge(req.status)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === "form" && (
        <>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setView("list"); setEditId(null); }} data-testid="button-back-form">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-xl font-bold" data-testid="text-form-title">{editId ? "EDIT DIESEL REQUIREMENT" : "RAISE DIESEL REQUIREMENT"}</h2>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">REQUIREMENT DETAILS</CardTitle>
              {editId ? (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-300 dark:border-blue-700">EDITING</Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300 dark:border-amber-700">NEW</Badge>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">DATE</Label>
                  <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} data-testid="input-form-date" />
                </div>
                <div>
                  <Label className="text-xs">RAISED BY</Label>
                  <Input value={formRaisedBy} onChange={(e) => setFormRaisedBy(e.target.value.toUpperCase())} placeholder="E.G., RAJU" data-testid="input-form-raised-by" />
                </div>
                <div>
                  <Label className="text-xs">REMARKS</Label>
                  <Input value={formRemarks} onChange={(e) => setFormRemarks(e.target.value.toUpperCase())} placeholder="E.G., HEAVY WORK DAY" data-testid="input-form-remarks" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">EQUIPMENT / DG — DIESEL REQUIRED</CardTitle>
              <Button variant="outline" size="sm" onClick={addFormRow} data-testid="button-add-row">
                <Plus className="w-4 h-4 mr-1" /> ADD ROW
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-equipment-form">
                <thead>
                  <tr className="border-b">
                    <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2 w-[5%]">#</th>
                    <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2 w-[30%]">EQUIPMENT / DG</th>
                    <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2 w-[18%]">PURPOSE</th>
                    <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2 w-[12%]">EST. HOURS</th>
                    <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2 w-[10%]">NORM (L/HR)</th>
                    <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2 w-[14%]">DIESEL REQ (L)</th>
                    <th className="p-2 w-[5%]"></th>
                  </tr>
                </thead>
                <tbody>
                  {formItems.map((item, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2">
                        <Select
                          value={item.equipmentId ? String(item.equipmentId) : ""}
                          onValueChange={(val) => updateFormItem(i, "equipmentId", Number(val))}
                        >
                          <SelectTrigger data-testid={`select-equipment-${i}`}>
                            <SelectValue placeholder="Select equipment" />
                          </SelectTrigger>
                          <SelectContent>
                            {equipment?.filter(e => e.isActive === 1).map((eq) => (
                              <SelectItem key={eq.id} value={String(eq.id)}>
                                {eq.name}{eq.registrationNumber ? ` (${eq.registrationNumber})` : ""} | {(eq as any).ownership === "hired" ? `HIRED: ${(eq as any).vendorName || "—"}` : "HLC OWN"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          value={item.purpose}
                          onChange={(e) => updateFormItem(i, "purpose", e.target.value.toUpperCase())}
                          placeholder="PURPOSE"
                          data-testid={`input-purpose-${i}`}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.estHours}
                          onChange={(e) => updateFormItem(i, "estHours", e.target.value)}
                          placeholder="0"
                          data-testid={`input-hours-${i}`}
                        />
                      </td>
                      <td className="p-2 text-center text-muted-foreground">
                        {item.norm || "\u2014"}
                      </td>
                      <td className="p-2 text-right font-bold bg-amber-50 dark:bg-amber-900/10" data-testid={`text-planned-qty-${i}`}>
                        {item.plannedQty || 0}
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFormRow(i)}
                          disabled={formItems.length <= 1}
                          data-testid={`button-remove-row-${i}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-50 dark:bg-amber-900/10 border-t-2 border-amber-500">
                    <td colSpan={5} className="p-3 text-right font-bold text-sm">TOTAL DIESEL REQUIRED</td>
                    <td className="p-3 text-right font-extrabold text-lg text-amber-600" data-testid="text-form-total">
                      {Math.round(formTotal * 100) / 100} L
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => { setView("list"); setEditId(null); }} data-testid="button-cancel">CANCEL</Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || editMutation.isPending || !formRaisedBy || formItems.every((i) => !i.equipmentName)}
                data-testid="button-submit"
              >
                {(createMutation.isPending || editMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editId ? "UPDATE REQUIREMENT" : "SUBMIT FOR APPROVAL"}
              </Button>
            </div>
          </Card>
        </>
      )}

      {view === "detail" && (
        <>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setView("list")} data-testid="button-back-detail">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-xl font-bold" data-testid="text-detail-title">
              {selectedRequirement?.status === "pending" ? "APPROVAL" : "REQUIREMENT DETAILS"}
            </h2>
          </div>

          {detailLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : selectedRequirement ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">{formatDate(selectedRequirement.date)} — DIESEL REQUIREMENT</CardTitle>
                  <div className="flex items-center gap-2">
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-blue-600 border-blue-300"
                        onClick={() => { setPinAction("edit"); setShowPinAuth(true); }}
                        data-testid="button-edit-requirement"
                      >
                        <Pencil className="w-3 h-3 mr-1" /> EDIT
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-300"
                        onClick={() => setShowDeleteConfirm(true)}
                        data-testid="button-delete-requirement"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> DELETE
                      </Button>
                    </>
                    {getStatusBadge(selectedRequirement.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">DATE</p>
                      <p className="font-semibold mt-1" data-testid="text-detail-date">{formatDate(selectedRequirement.date)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">RAISED BY</p>
                      <p className="font-semibold mt-1" data-testid="text-detail-raised-by">{selectedRequirement.raisedBy}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">EQUIPMENT</p>
                      <p className="font-semibold mt-1">{selectedRequirement.items?.length || 0} ITEMS</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">TOTAL REQUIRED</p>
                      <p className="font-semibold mt-1 text-amber-600" data-testid="text-detail-total">{Math.round(selectedRequirement.totalPlanned)} L</p>
                    </div>
                  </div>
                  {selectedRequirement.remarks && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">REMARKS</p>
                      <p className="mt-1 text-sm">{selectedRequirement.remarks}</p>
                    </div>
                  )}
                  {selectedRequirement.rejectionReason && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">REJECTION REASON</p>
                      <p className="mt-1 text-sm text-red-600">{selectedRequirement.rejectionReason}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">WORKFLOW STATUS</p>
                    <StatusSteps status={selectedRequirement.status} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {selectedRequirement.status === "pending" ? "EQUIPMENT BREAKDOWN — APPROVE QUANTITIES" : "EQUIPMENT BREAKDOWN"}
                  </CardTitle>
                  {selectedRequirement.status === "pending" && (
                    <p className="text-[11px] text-muted-foreground">Admin can reduce diesel qty per equipment</p>
                  )}
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-equipment-detail">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2">#</th>
                        <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2">EQUIPMENT / DG</th>
                        <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2">PURPOSE</th>
                        <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2">EST. HOURS</th>
                        <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2">NORM (L/HR)</th>
                        <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2">PLANNED (L)</th>
                        {(selectedRequirement.status === "pending" || selectedRequirement.status === "approved" || selectedRequirement.status === "purchased") && (
                          <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2">
                            {selectedRequirement.status === "pending" ? "APPROVE (L)" : "APPROVED (L)"}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRequirement.items?.map((item, i) => {
                        const approvalItem = approvalItems.find((a) => a.itemId === item.id);
                        const isReduced = approvalItem && approvalItem.approvedQty < item.plannedQty;
                        return (
                          <tr key={item.id} className="border-b last:border-b-0">
                            <td className="p-2 text-muted-foreground">{i + 1}</td>
                            <td className="p-2 font-semibold" data-testid={`text-equip-name-${item.id}`}>{item.equipmentName}</td>
                            <td className="p-2">{item.purpose || "\u2014"}</td>
                            <td className="p-2">{item.estHours ?? "\u2014"}</td>
                            <td className="p-2">{item.norm ?? "\u2014"}</td>
                            <td className="p-2 text-right text-muted-foreground">{Math.round(item.plannedQty)}</td>
                            {selectedRequirement.status === "pending" ? (
                              <td className="p-2 text-right">
                                <Input
                                  type="number"
                                  className={`w-20 text-center inline-block font-bold ${isReduced ? "border-amber-400 text-amber-600 bg-amber-50 dark:bg-amber-900/20" : "border-green-300 text-green-600 bg-green-50 dark:bg-green-900/20"}`}
                                  value={approvalItem?.approvedQty ?? item.plannedQty}
                                  min={0}
                                  max={item.plannedQty}
                                  onChange={(e) => {
                                    const val = Math.min(parseFloat(e.target.value) || 0, item.plannedQty);
                                    setApprovalItems(
                                      approvalItems.map((a) => a.itemId === item.id ? { ...a, approvedQty: val } : a)
                                    );
                                  }}
                                  data-testid={`input-approve-qty-${item.id}`}
                                />
                                {isReduced && (
                                  <p className="text-[10px] text-amber-600 font-semibold mt-1">Reduced from {Math.round(item.plannedQty)}</p>
                                )}
                              </td>
                            ) : (selectedRequirement.status === "approved" || selectedRequirement.status === "purchased") ? (
                              <td className="p-2 text-right font-bold text-green-600" data-testid={`text-approved-qty-${item.id}`}>
                                {item.approvedQty != null ? Math.round(item.approvedQty) : "\u2014"}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-amber-50 dark:bg-amber-900/10 border-t-2 border-amber-500">
                        <td colSpan={5} className="p-3 text-right font-bold">TOTAL PLANNED</td>
                        <td className="p-3 text-right text-muted-foreground font-bold">
                          {Math.round(selectedRequirement.totalPlanned)} L
                        </td>
                        {(selectedRequirement.status === "pending" || selectedRequirement.status === "approved" || selectedRequirement.status === "purchased") && (
                          <td className="p-3 text-right font-extrabold text-green-600 text-lg" data-testid="text-approval-total">
                            {selectedRequirement.status === "pending"
                              ? `${Math.round(approvalTotal)} L`
                              : selectedRequirement.totalApproved != null
                                ? `${Math.round(selectedRequirement.totalApproved)} L`
                                : "\u2014"
                            }
                          </td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>

                {selectedRequirement.status === "pending" && (
                  <div className="flex justify-between items-center gap-4 p-4 border-t bg-muted/30 flex-wrap">
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="REJECTION REASON"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value.toUpperCase())}
                        className="w-48"
                        data-testid="input-rejection-reason"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => { setPinAction("reject"); setShowPinAuth(true); }}
                        disabled={rejectMutation.isPending}
                        data-testid="button-reject"
                      >
                        {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <X className="w-4 h-4 mr-1" />}
                        REJECT
                      </Button>
                    </div>
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                      onClick={() => { setPinAction("approve"); setShowPinAuth(true); }}
                      disabled={approveMutation.isPending}
                      data-testid="button-approve"
                    >
                      {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                      APPROVE
                    </Button>
                  </div>
                )}
              </Card>

              <p className="text-center text-xs text-muted-foreground italic">
                {selectedRequirement.status === "pending" ? "PIN required to approve or reject" : ""}
              </p>
            </>
          ) : (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Requirement not found</CardContent></Card>
          )}
        </>
      )}

      {view === "update" && (
        <>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setView("list")} data-testid="button-back-update">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-xl font-bold" data-testid="text-update-title">
              PURCHASE UPDATE {selectedRequirement ? `\u2014 ${formatDate(selectedRequirement.date)}` : ""}
            </h2>
          </div>

          {detailLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : selectedRequirement ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">{formatDate(selectedRequirement.date)} — DIESEL REQUIREMENT</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-blue-600 border-blue-300"
                      onClick={() => { setPinAction("edit"); setShowPinAuth(true); }}
                      data-testid="button-edit-requirement-update"
                    >
                      <Pencil className="w-3 h-3 mr-1" /> EDIT
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-300"
                      onClick={() => setShowDeleteConfirm(true)}
                      data-testid="button-delete-requirement-update"
                    >
                      <Trash2 className="w-3 h-3 mr-1" /> DELETE
                    </Button>
                    {getStatusBadge(selectedRequirement.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">TOTAL PLANNED</p>
                      <p className="font-semibold mt-1 text-amber-600">{Math.round(selectedRequirement.totalPlanned)} L</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">RAISED BY</p>
                      <p className="font-semibold mt-1">{selectedRequirement.raisedBy}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">APPROVED BY</p>
                      <p className="font-semibold mt-1">{selectedRequirement.approvedBy || "\u2014"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">STATUS</p>
                      <p className="font-semibold mt-1 text-green-600">{selectedRequirement.status.toUpperCase()}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">WORKFLOW STATUS</p>
                    <StatusSteps status={selectedRequirement.status} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">UPDATE PURCHASE DETAILS</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">QTY PURCHASED (LITERS)</Label>
                      <Input
                        type="number"
                        value={purchaseQty}
                        onChange={(e) => {
                          setPurchaseQty(e.target.value);
                          const qty = parseFloat(e.target.value) || 0;
                          const rate = parseFloat(purchaseRate) || 0;
                          if (qty && rate) setPurchaseAmount(String(Math.round(qty * rate * 100) / 100));
                        }}
                        className="text-lg font-bold text-center"
                        data-testid="input-purchase-qty"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">Planned: {Math.round(selectedRequirement.totalPlanned)} L</p>
                    </div>
                    <div>
                      <Label className="text-xs">FUEL STATION / SUPPLIER</Label>
                      <Input value={purchaseSupplier} onChange={(e) => setPurchaseSupplier(e.target.value.toUpperCase())} placeholder="HP PETROL PUMP, KURNOOL" data-testid="input-purchase-supplier" />
                    </div>
                    <div>
                      <Label className="text-xs">BILL NO.</Label>
                      <Input value={purchaseBillNo} onChange={(e) => setPurchaseBillNo(e.target.value.toUpperCase())} placeholder="HP/KNL/28456" data-testid="input-purchase-bill" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">RATE PER LITER</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={purchaseRate}
                        onChange={(e) => {
                          setPurchaseRate(e.target.value);
                          const qty = parseFloat(purchaseQty) || 0;
                          const rate = parseFloat(e.target.value) || 0;
                          if (qty && rate) setPurchaseAmount(String(Math.round(qty * rate * 100) / 100));
                        }}
                        data-testid="input-purchase-rate"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">TOTAL AMOUNT</Label>
                      <Input
                        type="number"
                        value={purchaseAmount}
                        disabled
                        className="bg-muted font-bold"
                        data-testid="text-purchase-amount"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {purchaseQty && purchaseRate ? `Auto: ${purchaseQty} x ${purchaseRate}` : ""}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs">PURCHASED AT</Label>
                      <Input type="time" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} data-testid="input-purchased-at" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">REMARKS</Label>
                    <Textarea
                      value={purchaseRemarks}
                      onChange={(e) => setPurchaseRemarks(e.target.value.toUpperCase())}
                      placeholder="REASON IF LESS OR MORE THAN PLANNED..."
                      className="resize-none"
                      data-testid="input-purchase-remarks"
                    />
                  </div>
                </CardContent>
                <div className="flex justify-end gap-2 p-4 border-t">
                  <Button variant="outline" onClick={() => setView("list")} data-testid="button-cancel-purchase">CANCEL</Button>
                  <Button
                    onClick={handlePurchaseSubmit}
                    disabled={purchaseMutation.isPending}
                    data-testid="button-save-purchase"
                  >
                    {purchaseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    SAVE PURCHASE UPDATE
                  </Button>
                </div>
              </Card>
            </>
          ) : null}
        </>
      )}

      {view === "report" && (
        <>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setView("list")} data-testid="button-back-report">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-xl font-bold" data-testid="text-report-title">DIESEL — PLANNED VS PURCHASED VS ACTUAL</h2>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">DATE FROM</Label>
                  <Input type="date" value={reportDateFrom} onChange={(e) => { setReportDateFrom(e.target.value); setReportGenerated(false); }} data-testid="input-report-date-from" />
                </div>
                <div>
                  <Label className="text-xs">DATE TO</Label>
                  <Input type="date" value={reportDateTo} onChange={(e) => { setReportDateTo(e.target.value); setReportGenerated(false); }} data-testid="input-report-date-to" />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setReportGenerated(true)}
                    disabled={!reportDateFrom || !reportDateTo}
                    data-testid="button-generate-report"
                  >
                    GENERATE REPORT
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {reportLoading && reportGenerated ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : comparisonReport && reportGenerated ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card data-testid="card-report-planned">
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">TOTAL PLANNED</p>
                    <p className="text-2xl font-bold mt-1 text-amber-600">{Math.round(comparisonReport.totals?.totalPlanned || 0).toLocaleString()} L</p>
                    <p className="text-[11px] text-muted-foreground">{comparisonReport.dateWise?.length || 0} days</p>
                  </CardContent>
                </Card>
                <Card data-testid="card-report-purchased">
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">TOTAL PURCHASED</p>
                    <p className="text-2xl font-bold mt-1 text-blue-600">{Math.round(comparisonReport.totals?.totalPurchased || 0).toLocaleString()} L</p>
                    <p className="text-[11px] text-muted-foreground">
                      {comparisonReport.totals?.totalPlanned
                        ? `${((comparisonReport.totals.totalPurchased / comparisonReport.totals.totalPlanned) * 100).toFixed(1)}% of planned`
                        : "\u2014"}
                    </p>
                  </CardContent>
                </Card>
                <Card data-testid="card-report-actual">
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">TOTAL ACTUAL ISSUED</p>
                    <p className="text-2xl font-bold mt-1 text-green-600">{Math.round(comparisonReport.totals?.totalActual || 0).toLocaleString()} L</p>
                    <p className="text-[11px] text-muted-foreground">From equipment logs</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">DATE-WISE COMPARISON</CardTitle>
                  <p className="text-[11px] text-muted-foreground">Actual issued = sum of diesel from DPR + Plant equipment</p>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-report-datewise">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2">DATE</th>
                        <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2">PLANNED (L)</th>
                        <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2">PURCHASED (L)</th>
                        <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2">ACTUAL ISSUED (L)</th>
                        <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2">PLANNED VS PURCHASED</th>
                        <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2">PURCHASED VS ISSUED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(comparisonReport.dateWise || []).map((row: any) => {
                        const pvp = row.purchased != null ? row.purchased - row.planned : null;
                        const pvi = row.purchased != null && row.actual != null ? row.purchased - row.actual : null;
                        return (
                          <tr key={row.date} className="border-b last:border-b-0">
                            <td className="p-2 font-semibold">{formatDate(row.date)}</td>
                            <td className="p-2 text-right">{Math.round(row.planned)}</td>
                            <td className="p-2 text-right">{row.purchased != null ? Math.round(row.purchased) : "\u2014"}</td>
                            <td className="p-2 text-right">{row.actual != null ? Math.round(row.actual) : "\u2014"}</td>
                            <td className={`p-2 text-right ${pvp == null ? "text-muted-foreground" : pvp >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {pvp == null ? "Pending" : pvp === 0 ? "0 (exact)" : pvp > 0 ? `+${Math.round(pvp)} L` : `${Math.round(pvp)} L`}
                            </td>
                            <td className={`p-2 text-right ${pvi == null ? "text-muted-foreground" : pvi >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {pvi == null ? "\u2014" : pvi === 0 ? "0 (exact)" : pvi > 0 ? `+${Math.round(pvi)} L surplus` : `${Math.round(pvi)} L deficit`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {comparisonReport.totals && (
                      <tfoot>
                        <tr className="bg-amber-50 dark:bg-amber-900/10 border-t-2 border-amber-500">
                          <td className="p-3 font-bold">TOTAL</td>
                          <td className="p-3 text-right font-bold text-amber-600">{Math.round(comparisonReport.totals.totalPlanned)}</td>
                          <td className="p-3 text-right font-bold text-blue-600">{Math.round(comparisonReport.totals.totalPurchased)}</td>
                          <td className="p-3 text-right font-bold text-green-600">{Math.round(comparisonReport.totals.totalActual)}</td>
                          <td className={`p-3 text-right font-bold ${(comparisonReport.totals.totalPurchased - comparisonReport.totals.totalPlanned) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {Math.round(comparisonReport.totals.totalPurchased - comparisonReport.totals.totalPlanned)} L
                          </td>
                          <td className={`p-3 text-right font-bold ${(comparisonReport.totals.totalPurchased - comparisonReport.totals.totalActual) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {Math.round(comparisonReport.totals.totalPurchased - comparisonReport.totals.totalActual)} L
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </CardContent>
              </Card>

              {comparisonReport.equipmentWise && comparisonReport.equipmentWise.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-base">EQUIPMENT-WISE DIESEL BREAKDOWN</CardTitle>
                    <p className="text-[11px] text-muted-foreground">Aggregated for the selected period</p>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-report-equipment">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left text-[10px] font-bold text-muted-foreground uppercase p-2">EQUIPMENT / DG</th>
                          <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2">PLANNED (L)</th>
                          <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2">ACTUAL ISSUED (L)</th>
                          <th className="text-right text-[10px] font-bold text-muted-foreground uppercase p-2">VARIANCE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonReport.equipmentWise.map((eq: any, i: number) => {
                          const variance = (eq.actual || 0) - (eq.planned || 0);
                          return (
                            <tr key={i} className="border-b last:border-b-0">
                              <td className="p-2 font-semibold">{eq.equipmentName || eq.name}</td>
                              <td className="p-2 text-right">{Math.round(eq.planned || 0)}</td>
                              <td className="p-2 text-right">{Math.round(eq.actual || 0)}</td>
                              <td className={`p-2 text-right ${variance <= 0 ? "text-green-600" : "text-red-600"}`}>
                                {variance === 0 ? "0" : variance > 0 ? `+${Math.round(variance)} (used more)` : `${Math.round(variance)} (used less)`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </>
          ) : reportGenerated ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No comparison data available for the selected period
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
