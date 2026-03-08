import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Loader2, Trash2, FileText, Printer, ArrowRight, Check, Circle, Info, Fuel, Settings, Copy, X } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { VendorBillWithItems, VendorAlias } from "@shared/schema";

type ViewMode = "list" | "form" | "detail";

interface LineItem {
  date: string;
  category: string;
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
  { value: "transport", label: "MIX TRANSPORT" },
  { value: "all", label: "ALL" },
  { value: "other", label: "OTHER / MISCELLANEOUS" },
];

const LINE_ITEM_UNITS = ["HRS", "DAYS", "TRIPS", "MT", "KL", "NOS", "KGS", "LITERS", "CFT", "CUM", "MONTHS"];

function getCategoryBadgeClass(category: string) {
  switch (category) {
    case "equipment": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300";
    case "material": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300";
    case "transport": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300";
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border-gray-300";
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case "equipment": return "EQUIP";
    case "material": return "MATL";
    case "transport": return "TRNS";
    default: return "OTHER";
  }
}

const ENTRY_TYPE_FILTERS = [
  { value: "all", label: "ALL ENTRY TYPES" },
  { value: "daily_hourly", label: "DAILY & HOURLY" },
  { value: "trip_based", label: "TRIP BASED" },
  { value: "monthly", label: "MONTHLY" },
];

function extractDiesel(description: string): number {
  const match = description.match(/DIESEL:\s*(\d+(?:\.\d+)?)L/i);
  return match ? parseFloat(match[1]) : 0;
}

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
  return BILL_TYPES.find(t => t.value === type.toLowerCase())?.label || type.toUpperCase();
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
    { date: "", category: "other", description: "", qty: 0, unit: "HRS", rate: 0, amount: 0, source: "manual", equipmentId: null },
  ]);

  const [entryTypeFilter, setEntryTypeFilter] = useState("all");
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pendingStatusAction, setPendingStatusAction] = useState<{ billId: number; status: string } | null>(null);
  const [showAliasDialog, setShowAliasDialog] = useState(false);
  const [showAliasPinAuth, setShowAliasPinAuth] = useState(false);
  const [aliasCanonical, setAliasCanonical] = useState("");
  const [aliasValue, setAliasValue] = useState("");

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

  const { data: vendorNamesData } = useQuery<string[]>({
    queryKey: ["/api/vendor-bills/vendor-names"],
  });

  const vendorNames = vendorNamesData || [];

  const { data: vendorAliasesData } = useQuery<VendorAlias[]>({
    queryKey: ["/api/vendor-aliases"],
  });

  const addAliasMutation = useMutation({
    mutationFn: (data: { canonicalName: string; alias: string }) =>
      apiRequest("POST", "/api/vendor-aliases", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-aliases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills/vendor-names"] });
      toast({ title: "Vendor alias added" });
      setAliasCanonical("");
      setAliasValue("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add alias", description: err.message, variant: "destructive" });
    },
  });

  const deleteAliasMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/vendor-aliases/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-aliases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills/vendor-names"] });
      toast({ title: "Alias removed" });
    },
  });

  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const vendorInputRef = useRef<HTMLInputElement>(null);

  const filteredVendorNames = useMemo(() => {
    if (!vendorSearch) return vendorNames;
    return vendorNames.filter(n => n.includes(vendorSearch.toUpperCase()));
  }, [vendorNames, vendorSearch]);

  const autoItemsUrl = vendorName && periodFrom && periodTo && billType !== "other"
    ? `/api/vendor-bills/auto-items?vendorName=${encodeURIComponent(vendorName)}&billType=${encodeURIComponent(billType)}&periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}${entryTypeFilter && entryTypeFilter !== "all" ? `&entryTypeFilter=${encodeURIComponent(entryTypeFilter)}` : ""}`
    : null;

  const { data: autoItems, isFetching: autoItemsLoading } = useQuery<any[]>({
    queryKey: ["/api/vendor-bills/auto-items", vendorName, billType, periodFrom, periodTo, entryTypeFilter],
    queryFn: () => autoItemsUrl ? fetch(autoItemsUrl).then(r => r.json()) : Promise.resolve([]),
    enabled: !!autoItemsUrl,
  });

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
    setEntryTypeFilter("all");
    setLineItems([{ date: "", category: "other", description: "", qty: 0, unit: "HRS", rate: 0, amount: 0, source: "manual", equipmentId: null }]);
    setEditingBillId(null);
    setVendorSearch("");
    setShowVendorDropdown(false);
  };

  const loadBillForEdit = (bill: VendorBillWithItems) => {
    setBillDate(bill.billDate);
    setBillNo(bill.billNo);
    setBillType(bill.billType.toLowerCase());
    setVendorName(bill.vendorName);
    setVendorSearch(bill.vendorName);
    setPeriodFrom(bill.periodFrom || "");
    setPeriodTo(bill.periodTo || "");
    setNotes(bill.notes || "");
    setLineItems(
      bill.items.map(item => ({
        date: item.date || "",
        category: item.category || "other",
        description: item.description,
        qty: item.qty || 0,
        unit: item.unit || "HRS",
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
        date: item.date || "",
        category: item.category || "other",
        description: item.description || "",
        qty: item.qty || 0,
        unit: item.unit || "HRS",
        rate: item.rate || 0,
        amount: (item.qty || 0) * (item.rate || 0),
        source: "auto",
        equipmentId: item.equipmentId || null,
      }));
      setLineItems(mapped);
      toast({ title: `${mapped.length} items auto-populated from records` });
    }
  };

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { date: "", category: "other", description: "", qty: 0, unit: "HRS", rate: 0, amount: 0, source: "manual", equipmentId: null },
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

  const applyRateToSimilar = (sourceIdx: number) => {
    const source = lineItems[sourceIdx];
    if (!source.rate || source.rate <= 0) return;
    const sourceEntryType = source.description.match(/- (HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER)/)?.[1] || "";
    let applied = 0;
    let skipped = 0;
    setLineItems(prev => {
      const updated = [...prev];
      for (let i = 0; i < updated.length; i++) {
        if (i === sourceIdx) continue;
        const itemEntryType = updated[i].description.match(/- (HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER)/)?.[1] || "";
        const sameEquipment = source.equipmentId && updated[i].equipmentId === source.equipmentId;
        const sameType = sourceEntryType && itemEntryType === sourceEntryType;
        if (sameEquipment && sameType) {
          if (!updated[i].rate || updated[i].rate === 0) {
            updated[i] = { ...updated[i], rate: source.rate, amount: (updated[i].qty || 0) * source.rate };
            applied++;
          } else {
            skipped++;
          }
        }
      }
      return updated;
    });
    toast({
      title: applied > 0 ? `Rate applied to ${applied} row${applied > 1 ? "s" : ""}` : "No matching rows to apply",
      description: skipped > 0 ? `${skipped} row${skipped > 1 ? "s" : ""} skipped (already have rates)` : undefined,
    });
  };

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
        date: item.date || null,
        category: item.category || null,
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
    const rows = bill.items.map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td>${item.date || "-"}</td>
        <td>${item.category ? getCategoryLabel(item.category).toUpperCase() : "-"}</td>
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
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
        th { background: #f59e0b; color: white; }
        .total { font-weight: bold; font-size: 13px; }
      </style></head><body>
      <h1>VENDOR BILL - ${bill.billNo}</h1>
      <p class="meta">Vendor: ${bill.vendorName} | Type: ${getBillTypeLabel(bill.billType)} | Date: ${bill.billDate}${bill.periodFrom && bill.periodTo ? ` | Period: ${bill.periodFrom} to ${bill.periodTo}` : ""}</p>
      <table><thead><tr><th>#</th><th>Date</th><th>Type</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total"><td colspan="7" style="text-align:right">TOTAL</td><td style="text-align:right">${formatCurrency(bill.totalAmount)}</td></tr></tfoot>
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
              <div className="relative">
                <Label className="text-xs uppercase">Vendor / Supplier Name</Label>
                <Input
                  value={vendorName || vendorSearch}
                  onChange={e => {
                    const v = e.target.value.toUpperCase();
                    setVendorSearch(v);
                    setVendorName("");
                    setShowVendorDropdown(true);
                  }}
                  onFocus={() => setShowVendorDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowVendorDropdown(false), 200);
                    if (!vendorName && vendorSearch.trim()) {
                      setVendorName(vendorSearch.trim().toUpperCase());
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !vendorName && vendorSearch.trim()) {
                      setVendorName(vendorSearch.trim().toUpperCase());
                      setShowVendorDropdown(false);
                    }
                  }}
                  placeholder="SEARCH VENDOR..."
                  className="uppercase"
                  data-testid="input-vendor-name"
                />
                {showVendorDropdown && filteredVendorNames.length > 0 && !vendorName && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-zinc-900 border rounded-md shadow-lg" data-testid="vendor-dropdown">
                    {filteredVendorNames.map(name => (
                      <button
                        key={name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 truncate"
                        onMouseDown={() => {
                          setVendorName(name);
                          setVendorSearch(name);
                          setShowVendorDropdown(false);
                        }}
                        data-testid={`vendor-option-${name}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
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
            {(billType === "equipment" || billType === "all") && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs uppercase">Entry Type Filter</Label>
                  <Select value={entryTypeFilter} onValueChange={setEntryTypeFilter}>
                    <SelectTrigger data-testid="select-entry-type-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTRY_TYPE_FILTERS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

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
              <div className="text-sm text-blue-800 dark:text-blue-200 flex flex-wrap items-center gap-2">
                <span>
                  {billType === "all"
                    ? `All billable records for ${vendorName} (${periodFrom} to ${periodTo}) — equipment, materials & transport.`
                    : billType === "equipment"
                    ? `Equipment usage for ${vendorName} (${periodFrom} to ${periodTo}) from DPR & Plant records.`
                    : billType === "material"
                    ? `Material receipts for ${vendorName} (${periodFrom} to ${periodTo}) from DPR & Plant records.`
                    : `Transport dispatches for ${vendorName} (${periodFrom} to ${periodTo}) from truck dispatch records.`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
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
            <table className="w-full text-sm" style={{ minWidth: 800 }}>
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="px-2 py-2 text-left w-8">#</th>
                  <th className="px-2 py-2 text-left w-28">Date</th>
                  <th className="px-2 py-2 text-center w-16">Type</th>
                  <th className="px-2 py-2 text-left">Description</th>
                  <th className="px-2 py-2 text-left w-20">Qty</th>
                  <th className="px-2 py-2 text-left w-20">Unit</th>
                  <th className="px-2 py-2 text-left w-24">Rate</th>
                  <th className="px-2 py-2 text-right w-28">Amount</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="px-2 py-1.5 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      {item.source === "auto" ? (
                        <span className="text-xs font-mono" data-testid={`text-item-date-${idx}`}>{item.date}</span>
                      ) : (
                        <Input
                          type="date"
                          value={item.date}
                          onChange={e => updateLineItem(idx, "date", e.target.value)}
                          className="text-xs h-8"
                          data-testid={`input-item-date-${idx}`}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {item.source === "auto" ? (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${getCategoryBadgeClass(item.category)} no-default-hover-elevate no-default-active-elevate`}
                          data-testid={`badge-category-${idx}`}
                        >
                          {getCategoryLabel(item.category)}
                        </Badge>
                      ) : (
                        <Select value={item.category} onValueChange={v => updateLineItem(idx, "category", v)}>
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-item-category-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equipment">EQUIP</SelectItem>
                            <SelectItem value="material">MATL</SelectItem>
                            <SelectItem value="transport">TRNS</SelectItem>
                            <SelectItem value="other">OTHER</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {item.source === "auto" ? (
                        <div className="space-y-1">
                          <span className="text-xs" data-testid={`text-item-desc-${idx}`}>{item.description}</span>
                          {extractDiesel(item.description) > 0 && (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-diesel-${idx}`}>
                                <Fuel className="w-3 h-3 mr-1" />
                                {extractDiesel(item.description)}L DIESEL
                              </Badge>
                            </div>
                          )}
                        </div>
                      ) : (
                        <Input
                          value={item.description}
                          onChange={e => updateLineItem(idx, "description", e.target.value.toUpperCase())}
                          placeholder="ENTER DESCRIPTION"
                          className="uppercase text-xs h-8"
                          data-testid={`input-item-desc-${idx}`}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        value={item.qty || ""}
                        onChange={e => updateLineItem(idx, "qty", parseFloat(e.target.value) || 0)}
                        className="text-xs h-8"
                        data-testid={`input-item-qty-${idx}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={item.unit} onValueChange={v => updateLineItem(idx, "unit", v)}>
                        <SelectTrigger className="h-8 text-xs" data-testid={`select-item-unit-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LINE_ITEM_UNITS.map(u => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={item.rate || ""}
                          onChange={e => updateLineItem(idx, "rate", parseFloat(e.target.value) || 0)}
                          className="text-xs h-8"
                          data-testid={`input-item-rate-${idx}`}
                        />
                        {item.rate > 0 && item.equipmentId && item.source === "auto" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0"
                            title="Apply rate to similar equipment rows"
                            onClick={() => applyRateToSimilar(idx)}
                            data-testid={`button-apply-rate-${idx}`}
                          >
                            <Copy className="w-3.5 h-3.5 text-blue-600" />
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold bg-amber-50 dark:bg-amber-900/20">
                      <span className="text-xs" data-testid={`text-item-amount-${idx}`}>{formatCurrency(item.amount)}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLineItem(idx)} data-testid={`button-remove-item-${idx}`}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                  <td colSpan={7} className="px-2 py-3 text-right font-bold text-base">TOTAL</td>
                  <td className="px-2 py-3 text-right font-bold text-base" data-testid="text-total-amount">{formatCurrency(totalAmount)}</td>
                  <td></td>
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
            targetRole="any"
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
            <table className="w-full text-sm" style={{ minWidth: 700 }}>
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="px-2 py-2 text-left w-8">#</th>
                  <th className="px-2 py-2 text-left w-24">Date</th>
                  <th className="px-2 py-2 text-center w-16">Type</th>
                  <th className="px-2 py-2 text-left">Description</th>
                  <th className="px-2 py-2 text-left w-16">Qty</th>
                  <th className="px-2 py-2 text-left w-16">Unit</th>
                  <th className="px-2 py-2 text-right w-24">Rate</th>
                  <th className="px-2 py-2 text-right w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((item, idx) => (
                  <tr key={item.id} className="border-b">
                    <td className="px-2 py-2 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="px-2 py-2 text-xs font-mono" data-testid={`text-detail-item-date-${idx}`}>{item.date || "-"}</td>
                    <td className="px-2 py-2 text-center">
                      {item.category ? (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${getCategoryBadgeClass(item.category)} no-default-hover-elevate no-default-active-elevate`}
                        >
                          {getCategoryLabel(item.category)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {item.source === "auto" ? "AUTO" : "-"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 font-medium text-xs" data-testid={`text-detail-item-desc-${idx}`}>
                      <div className="space-y-1">
                        <span>{item.description}</span>
                        {extractDiesel(item.description) > 0 && (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 no-default-hover-elevate no-default-active-elevate">
                              <Fuel className="w-3 h-3 mr-1" />
                              {extractDiesel(item.description)}L DIESEL
                            </Badge>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs">{item.qty}</td>
                    <td className="px-2 py-2 text-xs">{item.unit}</td>
                    <td className="px-2 py-2 text-right text-xs">{formatCurrency(item.rate)}</td>
                    <td className="px-2 py-2 text-right font-semibold bg-amber-50 dark:bg-amber-900/20 text-xs" data-testid={`text-detail-item-amount-${idx}`}>
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                  <td colSpan={6} className="px-2 py-3 text-right font-bold">TOTAL</td>
                  <td className="px-2 py-3 text-right font-bold text-base" colSpan={2}>{formatCurrency(bill.totalAmount)}</td>
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
            targetRole="any"
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
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setShowAliasPinAuth(true)} title="Vendor Aliases" data-testid="button-vendor-aliases">
            <Settings className="w-4 h-4" />
          </Button>
          <Button onClick={() => { resetForm(); setView("form"); }} data-testid="button-new-bill">
            <Plus className="w-4 h-4 mr-1" /> NEW BILL
          </Button>
        </div>
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

      {showAliasPinAuth && (
        <PinAuth
          targetRole="admin"
          onSuccess={() => {
            setShowAliasPinAuth(false);
            setShowAliasDialog(true);
          }}
          onClose={() => setShowAliasPinAuth(false)}
        />
      )}

      <Dialog open={showAliasDialog} onOpenChange={setShowAliasDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>VENDOR ALIASES</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Group vendor name spelling variations so billing pulls records from all variants.
          </p>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-5 gap-2 items-end">
              <div className="col-span-2">
                <Label className="text-xs uppercase">Canonical Name</Label>
                <Select value={aliasCanonical} onValueChange={setAliasCanonical}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-alias-canonical">
                    <SelectValue placeholder="SELECT VENDOR..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs uppercase">Alias (Alternate Spelling)</Label>
                <Input
                  value={aliasValue}
                  onChange={e => setAliasValue(e.target.value.toUpperCase())}
                  placeholder="ALTERNATE NAME"
                  className="text-xs h-8 uppercase"
                  data-testid="input-alias-value"
                />
              </div>
              <Button
                size="sm"
                className="h-8"
                disabled={!aliasCanonical || !aliasValue || addAliasMutation.isPending}
                onClick={() => addAliasMutation.mutate({ canonicalName: aliasCanonical, alias: aliasValue })}
                data-testid="button-add-alias"
              >
                {addAliasMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              </Button>
            </div>

            <div className="border rounded-md max-h-60 overflow-y-auto">
              {(!vendorAliasesData || vendorAliasesData.length === 0) ? (
                <p className="text-xs text-muted-foreground text-center py-4">No aliases configured</p>
              ) : (
                <div className="divide-y">
                  {vendorAliasesData.map(a => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div>
                        <span className="font-semibold">{a.canonicalName}</span>
                        <span className="text-muted-foreground mx-2">=</span>
                        <span className="text-amber-600 dark:text-amber-400">{a.alias}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => deleteAliasMutation.mutate(a.id)}
                        data-testid={`button-delete-alias-${a.id}`}
                      >
                        <X className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
