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
import { ChevronLeft, Plus, Loader2, Trash2, FileText, Printer, Download, ArrowRight, Check, Circle, Info } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { VendorBill, VendorBillItem, VendorBillWithItems, EquipmentMasterType } from "@shared/schema";

type ViewMode = "list" | "form" | "detail";

interface LineItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  source: string;
  equipmentId: number | null;
}

const BILL_TYPES = [
  { value: "equipment", label: "EQUIPMENT HIRE" },
  { value: "material", label: "MATERIAL SUPPLY" },
  { value: "other", label: "OTHER / MISCELLANEOUS" },
];

const LINE_ITEM_UNITS = ["HOURS", "DAYS", "TRIPS", "TONS", "KL", "NOS", "KGS", "LITERS"];

const STATUS_ORDER = ["draft", "verified", "approved", "paid"] as const;

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "draft": return "secondary";
    case "verified": return "default";
    case "approved": return "default";
    case "paid": return "default";
    default: return "secondary";
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "draft": return "text-amber-600 dark:text-amber-400";
    case "verified": return "text-emerald-600 dark:text-emerald-400";
    case "approved": return "text-indigo-600 dark:text-indigo-400";
    case "paid": return "text-blue-600 dark:text-blue-400";
    default: return "";
  }
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return "0";
  return amount.toLocaleString("en-IN");
}

function getBillTypeLabel(type: string) {
  return BILL_TYPES.find(t => t.value === type)?.label || type.toUpperCase();
}

export default function VendorBills() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/plant/dashboard");

  const [view, setView] = useState<ViewMode>("list");
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [editingBillId, setEditingBillId] = useState<number | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterVendor, setFilterVendor] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const [billDate, setBillDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [billNo, setBillNo] = useState("");
  const [billType, setBillType] = useState("equipment");
  const [vendorName, setVendorName] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", qty: 0, unit: "HOURS", rate: 0, amount: 0, source: "manual", equipmentId: null },
  ]);

  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pendingStatusAction, setPendingStatusAction] = useState<{ billId: number; status: string } | null>(null);

  const { data: bills, isLoading } = useQuery<VendorBillWithItems[]>({
    queryKey: ["/api/vendor-bills"],
  });

  const { data: billSummary } = useQuery<{
    total: number;
    totalAmount: number;
    draft: number;
    draftAmount: number;
    verified: number;
    verifiedAmount: number;
    approved: number;
    approvedAmount: number;
    paid: number;
    paidAmount: number;
  }>({
    queryKey: ["/api/vendor-bills/summary"],
  });

  const { data: billDetail } = useQuery<VendorBillWithItems>({
    queryKey: ["/api/vendor-bills", selectedBillId],
    enabled: !!selectedBillId,
  });

  const { data: equipment } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
  });

  const autoItemsUrl = vendorName && periodFrom && periodTo && billType !== "other"
    ? `/api/vendor-bills/auto-items?vendorName=${encodeURIComponent(vendorName)}&billType=${encodeURIComponent(billType)}&periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}`
    : null;

  const { data: autoItems, isFetching: autoItemsLoading } = useQuery<any[]>({
    queryKey: ["/api/vendor-bills/auto-items", vendorName, billType, periodFrom, periodTo],
    queryFn: () => autoItemsUrl ? fetch(autoItemsUrl).then(r => r.json()) : Promise.resolve([]),
    enabled: !!autoItemsUrl,
  });

  const vendorNames = useMemo(() => {
    const names = new Set<string>();
    if (equipment) {
      equipment.forEach(e => {
        if (e.vendorName) names.add(e.vendorName.toUpperCase());
      });
    }
    if (bills) {
      bills.forEach(b => names.add(b.vendorName.toUpperCase()));
    }
    return Array.from(names).sort();
  }, [equipment, bills]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/vendor-bills", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Vendor bill created successfully" });
      resetForm();
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create bill", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/vendor-bills/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Vendor bill updated successfully" });
      resetForm();
      setEditingBillId(null);
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update bill", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, actor, pin }: { id: number; status: string; actor: string; pin?: string }) =>
      apiRequest("PATCH", `/api/vendor-bills/${id}/status`, { status, actor, pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      if (selectedBillId) {
        queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills", selectedBillId] });
      }
      toast({ title: "Bill status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/vendor-bills/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Bill deleted" });
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete bill", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setBillDate(format(new Date(), "yyyy-MM-dd"));
    setBillNo("");
    setBillType("equipment");
    setVendorName("");
    setPeriodFrom("");
    setPeriodTo("");
    setNotes("");
    setLineItems([{ description: "", qty: 0, unit: "HOURS", rate: 0, amount: 0, source: "manual", equipmentId: null }]);
    setEditingBillId(null);
  };

  const loadBillForEdit = (bill: VendorBillWithItems) => {
    setBillDate(bill.billDate);
    setBillNo(bill.billNo);
    setBillType(bill.billType);
    setVendorName(bill.vendorName);
    setPeriodFrom(bill.periodFrom || "");
    setPeriodTo(bill.periodTo || "");
    setNotes(bill.notes || "");
    setLineItems(
      bill.items.map(item => ({
        description: item.description,
        qty: item.qty || 0,
        unit: item.unit || "HOURS",
        rate: item.rate || 0,
        amount: item.amount || 0,
        source: item.source || "manual",
        equipmentId: item.equipmentId || null,
      }))
    );
    setEditingBillId(bill.id);
    setView("form");
  };

  const handleAutoPopulate = () => {
    if (autoItems && autoItems.length > 0) {
      const mapped: LineItem[] = autoItems.map((item: any) => ({
        description: item.description || "",
        qty: item.qty || 0,
        unit: item.unit || "HOURS",
        rate: item.rate || 0,
        amount: (item.qty || 0) * (item.rate || 0),
        source: "auto",
        equipmentId: item.equipmentId || null,
      }));
      setLineItems(mapped);
      toast({ title: `${mapped.length} items auto-populated` });
    }
  };

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { description: "", qty: 0, unit: "HOURS", rate: 0, amount: 0, source: "manual", equipmentId: null },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "qty" || field === "rate") {
        updated[index].amount = (updated[index].qty || 0) * (updated[index].rate || 0);
      }
      return updated;
    });
  };

  const totalAmount = useMemo(() => lineItems.reduce((sum, item) => sum + (item.amount || 0), 0), [lineItems]);

  const handleSubmit = () => {
    if (!vendorName || !billDate) {
      toast({ title: "Please fill vendor name and bill date", variant: "destructive" });
      return;
    }
    if (lineItems.length === 0 || lineItems.every(i => !i.description)) {
      toast({ title: "Please add at least one line item", variant: "destructive" });
      return;
    }

    const data = {
      billDate,
      billNo: billNo || `AUTO-${Date.now()}`,
      billType,
      vendorName: vendorName.toUpperCase(),
      periodFrom: periodFrom || null,
      periodTo: periodTo || null,
      status: "draft",
      notes: notes ? notes.toUpperCase() : null,
      totalAmount,
      items: lineItems.filter(i => i.description).map(item => ({
        description: item.description.toUpperCase(),
        qty: item.qty,
        unit: item.unit,
        rate: item.rate,
        amount: item.amount,
        source: item.source,
        equipmentId: item.equipmentId,
      })),
    };

    if (editingBillId) {
      updateMutation.mutate({ id: editingBillId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openBillDetail = (bill: VendorBillWithItems) => {
    setSelectedBillId(bill.id);
    setView("detail");
  };

  const handleStatusChange = (billId: number, newStatus: string) => {
    if (newStatus === "verified" || newStatus === "approved") {
      setPendingStatusAction({ billId, status: newStatus });
      setShowPinAuth(true);
    } else {
      statusMutation.mutate({ id: billId, status: newStatus, actor: "SYSTEM" });
    }
  };

  const handlePinSuccess = (_role: "manager" | "admin", _pin: string) => {
    setShowPinAuth(false);
    if (pendingStatusAction) {
      statusMutation.mutate({
        id: pendingStatusAction.billId,
        status: pendingStatusAction.status,
        actor: _role.toUpperCase(),
        pin: _pin,
      });
      setPendingStatusAction(null);
    }
  };

  const filteredBills = useMemo(() => {
    if (!bills) return [];
    return bills.filter(bill => {
      if (filterDateFrom && bill.billDate < filterDateFrom) return false;
      if (filterDateTo && bill.billDate > filterDateTo) return false;
      if (filterVendor !== "all" && bill.vendorName.toUpperCase() !== filterVendor) return false;
      if (filterStatus !== "all" && bill.status !== filterStatus) return false;
      return true;
    });
  }, [bills, filterDateFrom, filterDateTo, filterVendor, filterStatus]);

  const handlePrint = (bill: VendorBillWithItems) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "Please allow pop-ups to print", variant: "destructive" });
      return;
    }
    const rows = bill.items.map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${item.description}</td>
        <td>${item.qty || 0}</td>
        <td>${item.unit || ""}</td>
        <td style="text-align:right">${formatCurrency(item.rate)}</td>
        <td style="text-align:right">${formatCurrency(item.amount)}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Vendor Bill - ${bill.billNo}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { font-size: 18px; } .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
        th { background: #f59e0b; color: white; }
        .total { font-weight: bold; font-size: 14px; }
      </style></head><body>
      <h1>VENDOR BILL - ${bill.billNo}</h1>
      <p class="meta">Vendor: ${bill.vendorName} | Type: ${getBillTypeLabel(bill.billType)} | Date: ${bill.billDate}</p>
      <table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total"><td colspan="5" style="text-align:right">TOTAL</td><td style="text-align:right">${formatCurrency(bill.totalAmount)}</td></tr></tfoot>
      </table>
      ${bill.notes ? `<p style="margin-top:16px"><strong>Notes:</strong> ${bill.notes}</p>` : ""}
      </body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); printWindow.close(); }, 250);
  };

  const renderStatusSteps = (currentStatus: string) => {
    const currentIdx = STATUS_ORDER.indexOf(currentStatus as any);
    return (
      <div className="flex items-center gap-1 flex-wrap" data-testid="status-steps">
        {STATUS_ORDER.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          return (
            <div key={step} className="flex items-center gap-1">
              {idx > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
              <Badge
                variant={isDone ? "default" : isActive ? "secondary" : "outline"}
                className={`text-xs uppercase ${isDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate" : ""}`}
                data-testid={`status-step-${step}`}
              >
                {isDone && <Check className="w-3 h-3 mr-1" />}
                {isActive && <Circle className="w-2 h-2 mr-1 fill-current" />}
                {step}
              </Badge>
            </div>
          );
        })}
      </div>
    );
  };

  if (view === "form") {
    return (
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => { resetForm(); setView("list"); }} data-testid="button-back-form">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-form-title">
            {editingBillId ? "EDIT VENDOR BILL" : "NEW VENDOR BILL"}
          </h1>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">BILL DETAILS</CardTitle>
            <Badge variant="secondary" className="uppercase" data-testid="badge-status-draft">DRAFT</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs uppercase">Bill Date</Label>
                <Input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} data-testid="input-bill-date" />
              </div>
              <div>
                <Label className="text-xs uppercase">Bill Number</Label>
                <Input value={billNo} onChange={e => setBillNo(e.target.value.toUpperCase())} placeholder="AUTO-GENERATED" data-testid="input-bill-no" />
              </div>
              <div>
                <Label className="text-xs uppercase">Bill Type</Label>
                <Select value={billType} onValueChange={setBillType}>
                  <SelectTrigger data-testid="select-bill-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILL_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs uppercase">Vendor / Supplier Name</Label>
                <Input
                  value={vendorName}
                  onChange={e => setVendorName(e.target.value.toUpperCase())}
                  placeholder="ENTER VENDOR NAME"
                  list="vendor-names-list"
                  data-testid="input-vendor-name"
                />
                <datalist id="vendor-names-list">
                  {vendorNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label className="text-xs uppercase">Period From</Label>
                <Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} data-testid="input-period-from" />
              </div>
              <div>
                <Label className="text-xs uppercase">Period To</Label>
                <Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} data-testid="input-period-to" />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Bill Status</p>
              {renderStatusSteps("draft")}
            </div>
          </CardContent>
        </Card>

        {vendorName && periodFrom && periodTo && billType !== "other" && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="py-3 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <span>
                  {billType === "equipment"
                    ? `Equipment usage data for ${vendorName} from ${periodFrom} to ${periodTo} can be auto-populated from DPR and Plant Equipment Usage records.`
                    : `Material receipts from ${vendorName} between ${periodFrom} and ${periodTo} can be auto-populated.`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  onClick={handleAutoPopulate}
                  disabled={autoItemsLoading || !autoItems?.length}
                  data-testid="button-auto-populate"
                >
                  {autoItemsLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  {autoItems?.length ? `PULL ${autoItems.length} ITEMS` : "NO ITEMS FOUND"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">LINE ITEMS</CardTitle>
            <Button variant="outline" size="sm" onClick={addLineItem} data-testid="button-add-item">
              <Plus className="w-4 h-4 mr-1" /> ADD ITEM
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left">Description / Equipment</th>
                  <th className="px-3 py-2 text-left w-20">Qty</th>
                  <th className="px-3 py-2 text-left w-24">Unit</th>
                  <th className="px-3 py-2 text-left w-24">Rate</th>
                  <th className="px-3 py-2 text-right w-28">Amount</th>
                  <th className="px-3 py-2 text-center w-16">Source</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <Input
                        value={item.description}
                        onChange={e => updateLineItem(idx, "description", e.target.value.toUpperCase())}
                        placeholder="ENTER DESCRIPTION"
                        className="uppercase"
                        data-testid={`input-item-desc-${idx}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={item.qty || ""}
                        onChange={e => updateLineItem(idx, "qty", parseFloat(e.target.value) || 0)}
                        data-testid={`input-item-qty-${idx}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select value={item.unit} onValueChange={v => updateLineItem(idx, "unit", v)}>
                        <SelectTrigger data-testid={`select-item-unit-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LINE_ITEM_UNITS.map(u => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={item.rate || ""}
                        onChange={e => updateLineItem(idx, "rate", parseFloat(e.target.value) || 0)}
                        data-testid={`input-item-rate-${idx}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold bg-amber-50 dark:bg-amber-900/20">
                      <span data-testid={`text-item-amount-${idx}`}>{formatCurrency(item.amount)}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${item.source === "auto" ? "text-blue-700 dark:text-blue-300 border-blue-300" : "text-muted-foreground"}`}
                        data-testid={`badge-source-${idx}`}
                      >
                        {item.source === "auto" ? "AUTO" : "MANUAL"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {lineItems.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeLineItem(idx)} data-testid={`button-remove-item-${idx}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                  <td colSpan={5} className="px-3 py-3 text-right font-bold text-base">TOTAL</td>
                  <td className="px-3 py-3 text-right font-bold text-base" data-testid="text-total-amount">{formatCurrency(totalAmount)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 space-y-4">
            <div>
              <Label className="text-xs uppercase">Notes / Remarks</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value.toUpperCase())}
                placeholder="ENTER NOTES OR REMARKS"
                className="uppercase"
                data-testid="input-notes"
              />
            </div>
            <div className="flex justify-end gap-2 flex-wrap">
              <Button variant="outline" onClick={() => { resetForm(); setView("list"); }} data-testid="button-cancel">
                CANCEL
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-bill"
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {editingBillId ? "UPDATE BILL" : "SAVE BILL"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {showPinAuth && (
          <PinAuth
            targetRole="admin"
            onSuccess={handlePinSuccess}
            onClose={() => { setShowPinAuth(false); setPendingStatusAction(null); }}
          />
        )}
      </div>
    );
  }

  if (view === "detail" && (billDetail || selectedBillId)) {
    const bill = billDetail;
    if (!bill) {
      return (
        <div className="max-w-5xl mx-auto p-4 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      );
    }

    const currentStatusIdx = STATUS_ORDER.indexOf(bill.status as any);
    const nextStatus = currentStatusIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentStatusIdx + 1] : null;

    return (
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedBillId(null); setView("list"); }} data-testid="button-back-detail">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold" data-testid="text-detail-title">BILL DETAIL</h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => handlePrint(bill)} data-testid="button-print">
              <Printer className="w-4 h-4 mr-1" /> PRINT
            </Button>
            {bill.status === "draft" && (
              <Button size="sm" onClick={() => loadBillForEdit(bill)} data-testid="button-edit-bill">
                EDIT
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="flex justify-between items-start flex-wrap gap-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Vendor</p>
                <p className="text-xl font-bold" data-testid="text-vendor-name">{bill.vendorName}</p>
              </div>
              <Badge variant={getStatusBadgeVariant(bill.status)} className="uppercase text-sm" data-testid="badge-bill-status">
                {bill.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Bill Number</p>
                <p className="text-sm font-semibold" data-testid="text-bill-no">{bill.billNo}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Bill Date</p>
                <p className="text-sm font-semibold" data-testid="text-bill-date">{bill.billDate}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Bill Type</p>
                <p className="text-sm font-semibold" data-testid="text-bill-type">{getBillTypeLabel(bill.billType)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Period</p>
                <p className="text-sm font-semibold" data-testid="text-period">
                  {bill.periodFrom && bill.periodTo ? `${bill.periodFrom} to ${bill.periodTo}` : "-"}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Status Progress</p>
              {renderStatusSteps(bill.status)}
            </div>

            {nextStatus && (
              <div className="flex gap-2 pt-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => handleStatusChange(bill.id, nextStatus)}
                  disabled={statusMutation.isPending}
                  data-testid="button-advance-status"
                >
                  {statusMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                  MARK AS {nextStatus.toUpperCase()}
                </Button>
                {bill.status === "draft" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => deleteMutation.mutate(bill.id)}
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete-bill"
                  >
                    {deleteMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                    DELETE BILL
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">LINE ITEMS</CardTitle>
            <span className="font-bold text-amber-600 dark:text-amber-400" data-testid="text-detail-total">
              TOTAL: {formatCurrency(bill.totalAmount)}
            </span>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left w-16">Qty</th>
                  <th className="px-3 py-2 text-left w-16">Unit</th>
                  <th className="px-3 py-2 text-right w-24">Rate</th>
                  <th className="px-3 py-2 text-right w-28">Amount</th>
                  <th className="px-3 py-2 text-center w-16">Source</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((item, idx) => (
                  <tr key={item.id} className="border-b">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium" data-testid={`text-detail-item-desc-${idx}`}>{item.description}</td>
                    <td className="px-3 py-2">{item.qty}</td>
                    <td className="px-3 py-2">{item.unit}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(item.rate)}</td>
                    <td className="px-3 py-2 text-right font-semibold bg-amber-50 dark:bg-amber-900/20" data-testid={`text-detail-item-amount-${idx}`}>
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${item.source === "auto" ? "text-blue-700 dark:text-blue-300 border-blue-300" : "text-muted-foreground"}`}
                      >
                        {item.source === "auto" ? "AUTO" : "MANUAL"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                  <td colSpan={5} className="px-3 py-3 text-right font-bold">TOTAL</td>
                  <td className="px-3 py-3 text-right font-bold text-base">{formatCurrency(bill.totalAmount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {bill.notes && (
          <Card>
            <CardContent className="py-4">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Notes</p>
              <p className="text-sm text-muted-foreground" data-testid="text-notes">{bill.notes}</p>
            </CardContent>
          </Card>
        )}

        {showPinAuth && (
          <PinAuth
            targetRole="admin"
            onSuccess={handlePinSuccess}
            onClose={() => { setShowPinAuth(false); setPendingStatusAction(null); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <FileText className="w-5 h-5 text-amber-500" />
              VENDOR BILLS
            </h1>
            <p className="text-xs text-muted-foreground">Manage vendor/supplier billing and payments</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setView("form"); }} data-testid="button-new-bill">
          <Plus className="w-4 h-4 mr-1" /> NEW BILL
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase" data-testid="label-total">Total Bills</p>
            <p className="text-xl font-bold" data-testid="text-summary-total">{billSummary?.total || 0}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(billSummary?.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase" data-testid="label-draft">Draft</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-summary-draft">{billSummary?.draft || 0}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(billSummary?.draftAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase" data-testid="label-verified">Verified</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="text-summary-verified">{billSummary?.verified || 0}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(billSummary?.verifiedAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase" data-testid="label-paid">Paid</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-summary-paid">{billSummary?.paid || 0}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(billSummary?.paidAmount)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs uppercase">Date From</Label>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
            </div>
            <div>
              <Label className="text-xs uppercase">Date To</Label>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
            </div>
            <div>
              <Label className="text-xs uppercase">Vendor</Label>
              <Select value={filterVendor} onValueChange={setFilterVendor}>
                <SelectTrigger data-testid="filter-vendor">
                  <SelectValue placeholder="ALL VENDORS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL VENDORS</SelectItem>
                  {vendorNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="filter-status">
                  <SelectValue placeholder="ALL STATUS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL STATUS</SelectItem>
                  <SelectItem value="draft">DRAFT</SelectItem>
                  <SelectItem value="verified">VERIFIED</SelectItem>
                  <SelectItem value="approved">APPROVED</SelectItem>
                  <SelectItem value="paid">PAID</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filteredBills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground" data-testid="text-empty">No vendor bills found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredBills.map(bill => (
            <Card
              key={bill.id}
              className="hover-elevate cursor-pointer"
              onClick={() => openBillDetail(bill)}
              data-testid={`card-bill-${bill.id}`}
            >
              <CardContent className="py-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm uppercase truncate" data-testid={`text-bill-vendor-${bill.id}`}>{bill.vendorName}</p>
                    <p className="text-xs text-muted-foreground" data-testid={`text-bill-meta-${bill.id}`}>
                      {bill.billNo} &bull; {getBillTypeLabel(bill.billType)}
                      {bill.periodFrom && bill.periodTo && ` \u2022 ${bill.periodFrom} to ${bill.periodTo}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`font-bold text-base ${getStatusColor(bill.status)}`} data-testid={`text-bill-amount-${bill.id}`}>
                        {formatCurrency(bill.totalAmount)}
                      </p>
                      <p className="text-xs text-muted-foreground">{bill.items?.length || 0} line items</p>
                    </div>
                    <Badge variant={getStatusBadgeVariant(bill.status)} className="uppercase" data-testid={`badge-bill-status-${bill.id}`}>
                      {bill.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showPinAuth && (
        <PinAuth
          targetRole="admin"
          onSuccess={handlePinSuccess}
          onClose={() => { setShowPinAuth(false); setPendingStatusAction(null); }}
        />
      )}
    </div>
  );
}
