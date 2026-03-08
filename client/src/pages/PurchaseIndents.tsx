import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Loader2, Trash2, FileText, ClipboardCheck, ShoppingCart, ArrowRight, Check, X, AlertTriangle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { PurchaseIndentWithItems, PurchaseIndentItem } from "@shared/schema";

type ViewMode = "list" | "form" | "detail" | "purchase";

const PURPOSE_OPTIONS = [
  "DG SET", "PLANT", "OFFICE", "SITE", "EQUIPMENT REPAIR", "VEHICLE MAINTENANCE", "OTHER"
] as const;

const PRIORITY_OPTIONS = ["urgent", "normal", "low"] as const;

const UOM_ITEM_OPTIONS = ["NOS", "KG", "METERS", "LITERS", "SET", "PAIR", "BOX", "ROLLS", "PACKETS"] as const;

interface ItemRow {
  description: string;
  qty: number;
  uom: string;
  purpose: string;
  priority: string;
}

interface PurchaseUpdateData {
  purchaseStatus: string;
  qtyPurchased: string;
  vendor: string;
  billNo: string;
  rate: string;
  amount: string;
  purchaseRemarks: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" data-testid="badge-status-pending">PENDING APPROVAL</Badge>;
    case "approved":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700" data-testid="badge-status-approved">APPROVED</Badge>;
    case "completed":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700" data-testid="badge-status-completed">COMPLETED</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" data-testid="badge-status-rejected">REJECTED</Badge>;
    default:
      return <Badge variant="outline" data-testid="badge-status-unknown">{status.toUpperCase()}</Badge>;
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "urgent":
      return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">URGENT</Badge>;
    case "low":
      return <Badge variant="outline" className="bg-green-50 text-green-600 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">LOW</Badge>;
    default:
      return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600">NORMAL</Badge>;
  }
}

function getItemStatusBadge(status: string | null) {
  const s = (status || "").toLowerCase();
  switch (s) {
    case "purchased":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300">PURCHASED</Badge>;
    case "partial":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300">PARTIAL</Badge>;
    case "not_purchased":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300">NOT PURCHASED</Badge>;
    default:
      return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300">PENDING</Badge>;
  }
}

function StatusSteps({ status }: { status: string }) {
  const steps = [
    { key: "raised", label: "RAISED" },
    { key: "approved", label: "APPROVED" },
    { key: "purchasing", label: "PURCHASING" },
    { key: "completed", label: "COMPLETED" },
  ];

  const getStepState = (stepKey: string) => {
    if (status === "rejected") {
      return stepKey === "raised" ? "done" : stepKey === "approved" ? "rejected" : "pending";
    }
    const statusOrder = ["pending", "approved", "purchasing", "completed"];
    const currentIdx = statusOrder.indexOf(status === "pending" ? "pending" : status);
    const stepMap: Record<string, number> = { raised: 0, approved: 1, purchasing: 2, completed: 3 };
    const stepIdx = stepMap[stepKey];
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  };

  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid="status-steps">
      {steps.map((step, i) => {
        const state = getStepState(step.key);
        return (
          <div key={step.key} className="flex items-center gap-1">
            {i > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
            <span className={`text-xs font-semibold px-2 py-1 rounded-full border uppercase tracking-wide ${
              state === "done" ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700" :
              state === "active" ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" :
              state === "rejected" ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" :
              "border-muted text-muted-foreground"
            }`}>
              {state === "done" && <Check className="w-3 h-3 inline mr-1" />}
              {state === "rejected" && <X className="w-3 h-3 inline mr-1" />}
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PurchaseIndents() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/plant/dashboard");

  const [view, setView] = useState<ViewMode>("list");
  const [selectedIndentId, setSelectedIndentId] = useState<number | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formProposedBy, setFormProposedBy] = useState("");
  const [formRaisedBy, setFormRaisedBy] = useState("");
  const [formRemarks, setFormRemarks] = useState("");
  const [formItems, setFormItems] = useState<ItemRow[]>([
    { description: "", qty: 1, uom: "NOS", purpose: "PLANT", priority: "normal" },
  ]);

  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAction, setPinAction] = useState<"approve" | "reject" | null>(null);
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvedQtys, setApprovedQtys] = useState<Record<number, number>>({});
  const [savedPin, setSavedPin] = useState("");

  const [purchaseUpdates, setPurchaseUpdates] = useState<Record<number, PurchaseUpdateData>>({});

  const { data: indents, isLoading } = useQuery<PurchaseIndentWithItems[]>({
    queryKey: ["/api/purchase-indents"],
  });

  const { data: summary } = useQuery<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    completed: number;
  }>({
    queryKey: ["/api/purchase-indents/summary"],
  });

  const { data: selectedIndent, isLoading: isLoadingDetail } = useQuery<PurchaseIndentWithItems>({
    queryKey: ["/api/purchase-indents", selectedIndentId],
    enabled: !!selectedIndentId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/purchase-indents", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      toast({ title: "Indent submitted for approval" });
      resetForm();
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create indent", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/purchase-indents/${selectedIndentId}/approve`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      toast({ title: "Indent approved successfully" });
      setView("list");
      setSelectedIndentId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to approve indent", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/purchase-indents/${selectedIndentId}/reject`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      toast({ title: "Indent rejected" });
      setView("list");
      setSelectedIndentId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to reject indent", description: err.message, variant: "destructive" });
    },
  });

  const purchaseUpdateMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: any }) =>
      apiRequest("PATCH", `/api/purchase-indent-items/${itemId}/purchase-update`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      if (selectedIndentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
      }
      toast({ title: "Purchase status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update purchase status", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setFormProposedBy("");
    setFormRaisedBy("");
    setFormRemarks("");
    setFormItems([{ description: "", qty: 1, uom: "NOS", purpose: "PLANT", priority: "normal" }]);
  };

  const addItemRow = () => {
    setFormItems([...formItems, { description: "", qty: 1, uom: "NOS", purpose: "PLANT", priority: "normal" }]);
  };

  const removeItemRow = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemRow, value: string | number) => {
    const updated = [...formItems];
    (updated[index] as any)[field] = value;
    setFormItems(updated);
  };

  const handleSubmitIndent = () => {
    if (!formProposedBy.trim() || !formRaisedBy.trim()) {
      toast({ title: "Please fill in Proposed By and Raised By", variant: "destructive" });
      return;
    }
    const validItems = formItems.filter(item => item.description.trim());
    if (validItems.length === 0) {
      toast({ title: "Please add at least one item", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      date: formDate,
      indentNo: "",
      proposedBy: formProposedBy.toUpperCase(),
      raisedBy: formRaisedBy.toUpperCase(),
      remarks: formRemarks.toUpperCase() || null,
      status: "pending",
      items: validItems.map(item => ({
        description: item.description.toUpperCase(),
        qty: item.qty,
        uom: item.uom,
        purpose: item.purpose,
        priority: item.priority,
      })),
    });
  };

  const openDetail = (indent: PurchaseIndentWithItems) => {
    setSelectedIndentId(indent.id);
    if (indent.status === "pending") {
      const qtys: Record<number, number> = {};
      indent.items.forEach(item => { qtys[item.id] = item.qty; });
      setApprovedQtys(qtys);
      setApprovalRemarks("");
      setView("detail");
    } else if (indent.status === "approved" || indent.status === "completed") {
      setPurchaseUpdates({});
      setView("purchase");
    } else {
      setView("detail");
    }
  };

  const handlePinSuccess = (_role: "manager" | "admin", pin: string) => {
    setShowPinAuth(false);
    setSavedPin(pin);
    if (pinAction === "approve") {
      const approvedItems = Object.entries(approvedQtys).map(([itemId, qty]) => ({
        itemId: Number(itemId),
        approvedQty: qty,
      }));
      approveMutation.mutate({
        pin,
        approvedItems,
        remarks: approvalRemarks.toUpperCase() || null,
      });
    } else if (pinAction === "reject") {
      if (!rejectionReason.trim()) {
        toast({ title: "Please enter a rejection reason", variant: "destructive" });
        return;
      }
      rejectMutation.mutate({
        pin,
        reason: rejectionReason.toUpperCase(),
      });
    }
  };

  const handleSavePurchaseUpdate = (itemId: number) => {
    const update = purchaseUpdates[itemId];
    if (!update || !update.purchaseStatus) {
      toast({ title: "Please select a purchase status", variant: "destructive" });
      return;
    }
    purchaseUpdateMutation.mutate({
      itemId,
      data: {
        purchaseStatus: update.purchaseStatus,
        qtyPurchased: update.qtyPurchased ? parseFloat(update.qtyPurchased) : undefined,
        vendor: update.vendor.toUpperCase() || undefined,
        billNo: update.billNo.toUpperCase() || undefined,
        rate: update.rate ? parseFloat(update.rate) : undefined,
        amount: update.amount ? parseFloat(update.amount) : undefined,
        purchaseRemarks: update.purchaseRemarks.toUpperCase() || undefined,
      },
    });
  };

  const updatePurchaseField = (itemId: number, field: keyof PurchaseUpdateData, value: string) => {
    setPurchaseUpdates(prev => {
      const current = prev[itemId] || {
        purchaseStatus: "", qtyPurchased: "", vendor: "", billNo: "", rate: "", amount: "", purchaseRemarks: ""
      };
      const updated = { ...current, [field]: value };
      if (field === "rate" || field === "qtyPurchased") {
        const qty = field === "qtyPurchased" ? parseFloat(value) : parseFloat(updated.qtyPurchased);
        const rate = field === "rate" ? parseFloat(value) : parseFloat(updated.rate);
        if (!isNaN(qty) && !isNaN(rate)) {
          updated.amount = (qty * rate).toFixed(2);
        }
      }
      return { ...prev, [itemId]: updated };
    });
  };

  const filteredIndents = useMemo(() => {
    if (!indents) return [];
    return indents.filter(indent => {
      if (filterDateFrom && indent.date < filterDateFrom) return false;
      if (filterDateTo && indent.date > filterDateTo) return false;
      if (filterStatus !== "all" && indent.status !== filterStatus) return false;
      if (filterPriority !== "all") {
        const hasPriority = indent.items.some(item => item.priority === filterPriority);
        if (!hasPriority) return false;
      }
      return true;
    });
  }, [indents, filterDateFrom, filterDateTo, filterStatus, filterPriority]);

  const getIndentBorderColor = (status: string) => {
    switch (status) {
      case "pending": return "border-l-amber-500";
      case "approved": return "border-l-emerald-500";
      case "completed": return "border-l-blue-500";
      case "rejected": return "border-l-red-500";
      default: return "border-l-muted";
    }
  };

  const getItemPurchaseCount = (items: PurchaseIndentItem[]) => {
    const purchased = items.filter(i => (i.purchaseStatus || "").toLowerCase() === "purchased").length;
    return { purchased, total: items.length };
  };

  const getTotalAmount = (items: PurchaseIndentItem[]) => {
    return items.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      {showPinAuth && (
        <PinAuth
          targetRole="any"
          onSuccess={handlePinSuccess}
          onClose={() => setShowPinAuth(false)}
        />
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <FileText className="w-6 h-6 text-amber-500" />
            PURCHASE INDENTS
          </h1>
          <p className="text-sm text-muted-foreground">RAISE, APPROVE & TRACK PURCHASE REQUESTS</p>
        </div>
        {view === "list" && (
          <Button onClick={() => { resetForm(); setView("form"); }} data-testid="button-raise-indent">
            <Plus className="w-4 h-4 mr-1" /> RAISE INDENT
          </Button>
        )}
        {view !== "list" && (
          <Button variant="outline" onClick={() => { setView("list"); setSelectedIndentId(null); }} data-testid="button-back-to-list">
            BACK TO LIST
          </Button>
        )}
      </div>

      {view === "list" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card data-testid="card-summary-total">
              <CardContent className="p-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">TOTAL INDENTS</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-total-count">{summary?.total || 0}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-pending">
              <CardContent className="p-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">PENDING APPROVAL</p>
                <p className="text-2xl font-bold mt-1 text-amber-600" data-testid="text-pending-count">{summary?.pending || 0}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-approved">
              <CardContent className="p-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">APPROVED</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600" data-testid="text-approved-count">{summary?.approved || 0}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-completed">
              <CardContent className="p-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">COMPLETED</p>
                <p className="text-2xl font-bold mt-1 text-blue-600" data-testid="text-completed-count">{summary?.completed || 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs uppercase">DATE FROM</Label>
                  <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
                </div>
                <div>
                  <Label className="text-xs uppercase">DATE TO</Label>
                  <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
                </div>
                <div>
                  <Label className="text-xs uppercase">STATUS</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger data-testid="filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL STATUS</SelectItem>
                      <SelectItem value="pending">PENDING</SelectItem>
                      <SelectItem value="approved">APPROVED</SelectItem>
                      <SelectItem value="completed">COMPLETED</SelectItem>
                      <SelectItem value="rejected">REJECTED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase">PRIORITY</Label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger data-testid="filter-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL PRIORITY</SelectItem>
                      <SelectItem value="urgent">URGENT</SelectItem>
                      <SelectItem value="normal">NORMAL</SelectItem>
                      <SelectItem value="low">LOW</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredIndents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-semibold">NO INDENTS FOUND</p>
                <p className="text-sm mt-1">RAISE A NEW INDENT TO GET STARTED</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredIndents.map(indent => {
                const { purchased, total } = getItemPurchaseCount(indent.items);
                const totalAmt = getTotalAmount(indent.items);
                const priorities = Array.from(new Set(indent.items.map(i => i.priority)));
                const purposes = Array.from(new Set(indent.items.map(i => i.purpose)));

                return (
                  <Card
                    key={indent.id}
                    className={`border-l-4 ${getIndentBorderColor(indent.status)} cursor-pointer hover-elevate`}
                    onClick={() => openDetail(indent)}
                    data-testid={`card-indent-${indent.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-base uppercase" data-testid={`text-indent-no-${indent.id}`}>{indent.indentNo}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(indent.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                            {" \u2022 "}PROPOSED BY {indent.proposedBy}
                            {" \u2022 "}RAISED BY {indent.raisedBy}
                            {indent.approvedBy && ` \u2022 ${indent.status === "rejected" ? "REJECTED" : "APPROVED"} BY ${indent.approvedBy}`}
                            {totalAmt > 0 && ` \u2022 \u20B9 ${totalAmt.toLocaleString("en-IN")} PURCHASED`}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {priorities.map(p => (
                              <span key={p}>{getPriorityBadge(p)}</span>
                            ))}
                            <span className="text-xs text-muted-foreground pt-1">{purposes.join(" / ")}</span>
                          </div>
                          {indent.status === "rejected" && indent.rejectionReason && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                              REASON: {indent.rejectionReason}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-semibold" data-testid={`text-items-count-${indent.id}`}>
                              {indent.status === "approved" || indent.status === "completed"
                                ? `${purchased}/${total} PURCHASED`
                                : `${total} ITEMS`}
                            </p>
                            {indent.status === "approved" && purchased === 0 && (
                              <p className="text-xs text-emerald-600 mt-0.5">READY TO PURCHASE</p>
                            )}
                          </div>
                          {getStatusBadge(indent.status)}
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base uppercase">INDENT DETAILS</CardTitle>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300">NEW</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs uppercase">DATE</Label>
                  <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} data-testid="input-date" />
                </div>
                <div>
                  <Label className="text-xs uppercase">INDENT NO.</Label>
                  <Input value="AUTO-GENERATED" disabled className="bg-muted" data-testid="input-indent-no" />
                  <p className="text-xs text-muted-foreground mt-0.5">AUTO-GENERATED ON SAVE</p>
                </div>
                <div>
                  <Label className="text-xs uppercase">PROPOSED BY</Label>
                  <Input
                    value={formProposedBy}
                    onChange={(e) => setFormProposedBy(e.target.value.toUpperCase())}
                    placeholder="WHO PROPOSED THIS"
                    data-testid="input-proposed-by"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">PERSON WHO IDENTIFIED THE NEED</p>
                </div>
                <div>
                  <Label className="text-xs uppercase">RAISED BY</Label>
                  <Input
                    value={formRaisedBy}
                    onChange={(e) => setFormRaisedBy(e.target.value.toUpperCase())}
                    placeholder="WHO IS RAISING"
                    data-testid="input-raised-by"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">PERSON CREATING THIS INDENT</p>
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase">GENERAL REMARKS (OPTIONAL)</Label>
                <Textarea
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value.toUpperCase())}
                  placeholder="ANY GENERAL NOTES ABOUT THIS INDENT..."
                  data-testid="input-remarks"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base uppercase">ITEMS REQUIRED</CardTitle>
              <Button variant="outline" size="sm" onClick={addItemRow} data-testid="button-add-item">
                <Plus className="w-4 h-4 mr-1" /> ADD ITEM
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {formItems.map((item, index) => (
                <Card key={index} className="p-3" data-testid={`card-item-row-${index}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground font-medium mt-2 w-5 flex-shrink-0">{index + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <div>
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(index, "description", e.target.value.toUpperCase())}
                          placeholder="ITEM DESCRIPTION"
                          data-testid={`input-item-desc-${index}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs">QTY</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => updateItem(index, "qty", parseFloat(e.target.value) || 1)}
                            data-testid={`input-item-qty-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">UOM</Label>
                          <Select value={item.uom} onValueChange={(v) => updateItem(index, "uom", v)}>
                            <SelectTrigger data-testid={`select-item-uom-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UOM_ITEM_OPTIONS.map(u => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">PURPOSE</Label>
                          <Select value={item.purpose} onValueChange={(v) => updateItem(index, "purpose", v)}>
                            <SelectTrigger data-testid={`select-item-purpose-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PURPOSE_OPTIONS.map(p => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">PRIORITY</Label>
                          <Select value={item.priority} onValueChange={(v) => updateItem(index, "priority", v)}>
                            <SelectTrigger data-testid={`select-item-priority-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="urgent">URGENT</SelectItem>
                              <SelectItem value="normal">NORMAL</SelectItem>
                              <SelectItem value="low">LOW</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    {formItems.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItemRow(index)}
                        className="text-red-500 flex-shrink-0"
                        data-testid={`button-remove-item-${index}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => { resetForm(); setView("list"); }} data-testid="button-cancel">
                CANCEL
              </Button>
              <Button
                onClick={handleSubmitIndent}
                disabled={createMutation.isPending}
                data-testid="button-submit-indent"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                SUBMIT INDENT
              </Button>
            </div>
          </Card>
        </>
      )}

      {view === "detail" && (
        <>
          {isLoadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedIndent ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base uppercase" data-testid="text-detail-indent-no">{selectedIndent.indentNo}</CardTitle>
                  {getStatusBadge(selectedIndent.status)}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">DATE</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-date">
                        {format(new Date(selectedIndent.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">PROPOSED BY</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-proposed-by">{selectedIndent.proposedBy}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">RAISED BY</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-raised-by">{selectedIndent.raisedBy}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">TOTAL ITEMS</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-items-count">{selectedIndent.items.length} ITEMS</p>
                    </div>
                  </div>
                  {selectedIndent.remarks && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">REMARKS</p>
                      <p className="text-sm uppercase">{selectedIndent.remarks}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">WORKFLOW STATUS</p>
                    <StatusSteps status={selectedIndent.status} />
                  </div>
                </CardContent>
              </Card>

              {selectedIndent.status === "pending" ? (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-base uppercase">ITEMS - REVIEW & APPROVE QUANTITIES</CardTitle>
                    <p className="text-xs text-muted-foreground">ADMIN CAN REDUCE QTY PER ITEM IF NEEDED</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedIndent.items.map((item, index) => (
                      <Card key={item.id} className="p-4" data-testid={`card-approval-item-${item.id}`}>
                        <div className="flex justify-between items-start gap-2 flex-wrap">
                          <div>
                            <p className="font-bold uppercase">{index + 1}. {item.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">FOR: {item.purpose}</p>
                          </div>
                          {getPriorityBadge(item.priority)}
                        </div>
                        <div className="flex items-center gap-4 mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-md flex-wrap">
                          <div className="text-sm">
                            <span className="text-muted-foreground">INTENDED:</span>{" "}
                            <strong>{item.qty} {item.uom}</strong>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-emerald-600 font-semibold">APPROVE QTY:</span>
                            <Input
                              type="number"
                              min={0}
                              max={item.qty}
                              value={approvedQtys[item.id] ?? item.qty}
                              onChange={(e) => setApprovedQtys(prev => ({
                                ...prev,
                                [item.id]: parseFloat(e.target.value) || 0,
                              }))}
                              className="w-20 text-center font-bold text-emerald-600 border-emerald-300 bg-white dark:bg-emerald-900/40"
                              data-testid={`input-approve-qty-${item.id}`}
                            />
                            <span className="text-xs text-muted-foreground">{item.uom}</span>
                            {(approvedQtys[item.id] ?? item.qty) < item.qty && (
                              <span className="text-xs text-amber-600 font-semibold">(REDUCED FROM {item.qty})</span>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}

                    <div className="pt-2">
                      <Label className="text-xs uppercase">APPROVAL REMARKS (OPTIONAL)</Label>
                      <Textarea
                        value={approvalRemarks}
                        onChange={(e) => setApprovalRemarks(e.target.value.toUpperCase())}
                        placeholder="REASON FOR PARTIAL APPROVAL OR ANY NOTES..."
                        data-testid="input-approval-remarks"
                      />
                    </div>

                    <div className="pt-2">
                      <Label className="text-xs uppercase">REJECTION REASON (IF REJECTING)</Label>
                      <Textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value.toUpperCase())}
                        placeholder="REASON FOR REJECTION..."
                        data-testid="input-rejection-reason"
                      />
                    </div>
                  </CardContent>
                  <div className="flex justify-between items-center p-4 border-t flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-300"
                      onClick={() => { setPinAction("reject"); setShowPinAuth(true); }}
                      disabled={rejectMutation.isPending}
                      data-testid="button-reject"
                    >
                      {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <X className="w-4 h-4 mr-1" />}
                      REJECT
                    </Button>
                    <Button
                      className="bg-emerald-600 text-white"
                      onClick={() => { setPinAction("approve"); setShowPinAuth(true); }}
                      disabled={approveMutation.isPending}
                      data-testid="button-approve"
                    >
                      {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                      APPROVE INDENT
                    </Button>
                  </div>
                  <p className="text-xs text-center text-muted-foreground pb-3 italic">PIN REQUIRED TO APPROVE OR REJECT</p>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base uppercase">INDENT DETAILS</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedIndent.items.map((item, index) => (
                      <Card key={item.id} className="p-4" data-testid={`card-detail-item-${item.id}`}>
                        <div className="flex justify-between items-start gap-2 flex-wrap">
                          <div>
                            <p className="font-bold uppercase">{index + 1}. {item.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">FOR: {item.purpose}</p>
                          </div>
                          <div className="flex gap-1">
                            {getPriorityBadge(item.priority)}
                          </div>
                        </div>
                        <div className="text-sm mt-2">
                          <span className="text-muted-foreground">QTY:</span> <strong>{item.qty} {item.uom}</strong>
                          {item.approvedQty != null && (
                            <>
                              <span className="mx-2 text-muted-foreground">{"\u2192"}</span>
                              <span className="text-muted-foreground">APPROVED:</span>{" "}
                              <strong className="text-emerald-600">{item.approvedQty} {item.uom}</strong>
                              {item.approvedQty < item.qty && (
                                <span className="text-xs text-amber-600 ml-1">(REDUCED)</span>
                              )}
                            </>
                          )}
                        </div>
                      </Card>
                    ))}
                    {selectedIndent.status === "rejected" && selectedIndent.rejectionReason && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
                        <p className="text-sm text-red-700 dark:text-red-300">
                          <strong>REJECTION REASON:</strong> {selectedIndent.rejectionReason}
                        </p>
                      </div>
                    )}
                    {selectedIndent.approvalRemarks && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          <strong>APPROVAL REMARKS:</strong> {selectedIndent.approvalRemarks}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>INDENT NOT FOUND</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {view === "purchase" && (
        <>
          {isLoadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedIndent ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base uppercase" data-testid="text-purchase-indent-no">{selectedIndent.indentNo}</CardTitle>
                  {getStatusBadge(selectedIndent.status)}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">DATE</p>
                      <p className="font-semibold uppercase">{format(new Date(selectedIndent.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">PROPOSED BY</p>
                      <p className="font-semibold uppercase">{selectedIndent.proposedBy}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">RAISED BY</p>
                      <p className="font-semibold uppercase">{selectedIndent.raisedBy}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">APPROVED BY</p>
                      <p className="font-semibold uppercase">{selectedIndent.approvedBy || "-"} {selectedIndent.approvedAt ? `\u2022 ${selectedIndent.approvedAt}` : ""}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">WORKFLOW STATUS</p>
                    <StatusSteps status={selectedIndent.status} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base uppercase">ITEMS - PURCHASE STATUS</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {selectedIndent.items.filter(i => i.purchaseStatus).length} OF {selectedIndent.items.length} ITEMS UPDATED
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedIndent.items.map((item, index) => {
                    const itemStatus = (item.purchaseStatus || "").toLowerCase();
                    const isPending = !item.purchaseStatus;
                    const borderColor = itemStatus === "purchased" ? "border-l-emerald-500" :
                      itemStatus === "partial" ? "border-l-amber-500" :
                      itemStatus === "not_purchased" ? "border-l-red-500" :
                      "border-l-muted";
                    const update = purchaseUpdates[item.id];

                    return (
                      <Card key={item.id} className={`p-4 border-l-4 ${borderColor}`} data-testid={`card-purchase-item-${item.id}`}>
                        <div className="flex justify-between items-start gap-2 flex-wrap">
                          <div>
                            <p className="font-bold uppercase">{index + 1}. {item.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">FOR: {item.purpose}</p>
                          </div>
                          <div className="flex gap-1">
                            {getPriorityBadge(item.priority)}
                            {getItemStatusBadge(item.purchaseStatus)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm mt-2 flex-wrap">
                          <span>INTENDED: <strong>{item.qty} {item.uom}</strong></span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span>APPROVED: <strong className="text-emerald-600">{item.approvedQty ?? item.qty} {item.uom}</strong></span>
                          {item.approvedQty != null && item.approvedQty < item.qty && (
                            <span className="text-xs text-amber-600">(REDUCED)</span>
                          )}
                          {item.qtyPurchased != null && (
                            <>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <span>BOUGHT: <strong className={itemStatus === "purchased" ? "text-emerald-600" : "text-amber-600"}>{item.qtyPurchased} {item.uom}</strong></span>
                            </>
                          )}
                          {itemStatus === "not_purchased" && (
                            <>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <span className="text-red-600 font-semibold">NOT PURCHASED</span>
                            </>
                          )}
                        </div>

                        {item.purchaseStatus && itemStatus !== "not_purchased" && (item.vendor || item.billNo || item.rate || item.amount) && (
                          <div className={`mt-2 p-3 rounded-md ${
                            itemStatus === "purchased" ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-amber-50 dark:bg-amber-900/20"
                          }`}>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                              {item.vendor && <div><span className="text-muted-foreground">VENDOR:</span> <strong>{item.vendor}</strong></div>}
                              {item.billNo && <div><span className="text-muted-foreground">BILL NO:</span> <strong>{item.billNo}</strong></div>}
                              {item.rate != null && <div><span className="text-muted-foreground">RATE:</span> <strong>{"\u20B9"} {item.rate}</strong></div>}
                              {item.amount != null && <div><span className="text-muted-foreground">AMOUNT:</span> <strong>{"\u20B9"} {item.amount.toLocaleString("en-IN")}</strong></div>}
                            </div>
                            {item.purchaseRemarks && (
                              <p className="text-xs mt-2 text-amber-700 dark:text-amber-300">
                                <strong>REMARKS:</strong> {item.purchaseRemarks}
                              </p>
                            )}
                          </div>
                        )}

                        {itemStatus === "not_purchased" && item.purchaseRemarks && (
                          <div className="mt-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20">
                            <p className="text-xs text-red-700 dark:text-red-300">
                              <strong>REASON:</strong> {item.purchaseRemarks}
                            </p>
                          </div>
                        )}

                        {isPending && (
                          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                            <p className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-3">UPDATE PURCHASE STATUS</p>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <Label className="text-xs">PURCHASE STATUS</Label>
                                <Select
                                  value={update?.purchaseStatus || ""}
                                  onValueChange={(v) => updatePurchaseField(item.id, "purchaseStatus", v)}
                                >
                                  <SelectTrigger data-testid={`select-purchase-status-${item.id}`}>
                                    <SelectValue placeholder="SELECT..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="purchased">PURCHASED</SelectItem>
                                    <SelectItem value="partial">PARTIALLY PURCHASED</SelectItem>
                                    <SelectItem value="not_purchased">NOT PURCHASED</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">QTY PURCHASED</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max={item.approvedQty ?? item.qty}
                                  value={update?.qtyPurchased || ""}
                                  onChange={(e) => updatePurchaseField(item.id, "qtyPurchased", e.target.value)}
                                  placeholder="0"
                                  data-testid={`input-qty-purchased-${item.id}`}
                                />
                                <p className="text-xs text-muted-foreground mt-0.5">MAX APPROVED: {item.approvedQty ?? item.qty} {item.uom}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <Label className="text-xs">VENDOR / SUPPLIER</Label>
                                <Input
                                  value={update?.vendor || ""}
                                  onChange={(e) => updatePurchaseField(item.id, "vendor", e.target.value.toUpperCase())}
                                  placeholder="VENDOR NAME"
                                  data-testid={`input-vendor-${item.id}`}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">BILL NO.</Label>
                                <Input
                                  value={update?.billNo || ""}
                                  onChange={(e) => updatePurchaseField(item.id, "billNo", e.target.value.toUpperCase())}
                                  placeholder="BILL NUMBER"
                                  data-testid={`input-bill-no-${item.id}`}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <Label className="text-xs">RATE ({"\u20B9"})</Label>
                                <Input
                                  type="number"
                                  value={update?.rate || ""}
                                  onChange={(e) => updatePurchaseField(item.id, "rate", e.target.value)}
                                  placeholder="0.00"
                                  data-testid={`input-rate-${item.id}`}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">AMOUNT ({"\u20B9"})</Label>
                                <Input
                                  type="number"
                                  value={update?.amount || ""}
                                  disabled
                                  className="bg-muted"
                                  data-testid={`input-amount-${item.id}`}
                                />
                                <p className="text-xs text-muted-foreground mt-0.5">AUTO-CALCULATED: QTY x RATE</p>
                              </div>
                            </div>
                            <div className="mb-3">
                              <Label className="text-xs">REMARKS / REASON</Label>
                              <Textarea
                                value={update?.purchaseRemarks || ""}
                                onChange={(e) => updatePurchaseField(item.id, "purchaseRemarks", e.target.value.toUpperCase())}
                                placeholder="REASON IF NOT PURCHASED OR PARTIAL, OR ANY NOTES..."
                                data-testid={`input-purchase-remarks-${item.id}`}
                              />
                            </div>
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                onClick={() => handleSavePurchaseUpdate(item.id)}
                                disabled={purchaseUpdateMutation.isPending}
                                data-testid={`button-save-purchase-${item.id}`}
                              >
                                {purchaseUpdateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                SAVE UPDATE
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </CardContent>
                <div className="flex justify-between items-center p-4 border-t flex-wrap gap-2">
                  <div className="text-sm text-muted-foreground">
                    TOTAL PURCHASED: <strong className="text-foreground text-base">{"\u20B9"} {getTotalAmount(selectedIndent.items).toLocaleString("en-IN")}</strong>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>INDENT NOT FOUND</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
