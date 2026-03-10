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
import { Link, useSearch } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Loader2, Trash2, FileText, Printer, ArrowRight, Check, Circle, Info, Fuel, Settings, Copy, X, Download, Search, Edit, PlusCircle, DollarSign } from "lucide-react";
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
  leadDistance: number | null;
}

const BILL_TYPES = [
  { value: "equipment", label: "EQUIPMENT HIRE" },
  { value: "material", label: "MATERIAL SUPPLY" },
  { value: "transport", label: "TRANSPORT" },
  { value: "all", label: "All Types (Combined)" },
  { value: "other", label: "OTHER / MISCELLANEOUS" },
];

const LINE_ITEM_UNITS = ["HRS", "DAYS", "TRIP", "TRIPS", "MT", "KL", "NOS", "KGS", "LITERS", "CFT", "CUM", "MONTHS", "KM"];

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
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString || window.location.search);
  const urlTab = urlParams.get("tab");
  const urlRole = urlParams.get("role");
  const backLink = appendOrigin(`/plant/dashboard${urlTab ? `?tab=${urlTab}${urlRole ? `&role=${urlRole}` : ""}` : ""}`);

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
    { date: "", category: "equipment", description: "", qty: 0, unit: "HRS", rate: 0, amount: 0, source: "manual", equipmentId: null, leadDistance: null },
  ]);
  const [adjustmentLabel, setAdjustmentLabel] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(0);

  const [entryTypeFilter, setEntryTypeFilter] = useState("all");
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pendingStatusAction, setPendingStatusAction] = useState<{ billId: number; status: string } | null>(null);
  const [pendingEditAction, setPendingEditAction] = useState<{ bill: VendorBillWithItems } | null>(null);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{ billId: number } | null>(null);
  const [showEditPinAuth, setShowEditPinAuth] = useState(false);
  const [showDeletePinAuth, setShowDeletePinAuth] = useState(false);
  const [adminPinForUpdate, setAdminPinForUpdate] = useState<string | null>(null);
  const [showAliasDialog, setShowAliasDialog] = useState(false);
  const [showAliasPinAuth, setShowAliasPinAuth] = useState(false);
  const [aliasCanonical, setAliasCanonical] = useState("");
  const [aliasValue, setAliasValue] = useState("");
  const [showSetRatesDialog, setShowSetRatesDialog] = useState(false);
  const [bulkRates, setBulkRates] = useState<Record<string, { rate: number; leadDistance: number }>>({});

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

  const [showVendorDiscovery, setShowVendorDiscovery] = useState(false);

  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const vendorInputRef = useRef<HTMLInputElement>(null);

  const filteredVendorNames = useMemo(() => {
    if (!vendorSearch) return vendorNames;
    return vendorNames.filter(n => n.includes(vendorSearch.toUpperCase()));
  }, [vendorNames, vendorSearch]);

  interface DiscoveredVendor {
    vendorName: string;
    recordCount: number;
    categories: string[];
    existingBill: { id: number; billNo: string; status: string } | null;
  }

  const discoverUrl = periodFrom && periodTo && billType !== "other"
    ? `/api/vendor-bills/discover-vendors?billType=${encodeURIComponent(billType)}&periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}`
    : null;

  const { data: discoveredVendors, isFetching: discoveryLoading } = useQuery<DiscoveredVendor[]>({
    queryKey: ["/api/vendor-bills/discover-vendors", billType, periodFrom, periodTo],
    queryFn: () => discoverUrl ? fetch(discoverUrl).then(r => r.json()) : Promise.resolve([]),
    enabled: !!discoverUrl && showVendorDiscovery,
  });

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
    mutationFn: ({ id, data, pin }: { id: number; data: any; pin?: string | null }) => apiRequest("PUT", `/api/vendor-bills/${id}`, pin ? { ...data, pin } : data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Vendor bill updated successfully" });
      resetForm();
      setEditingBillId(null);
      setAdminPinForUpdate(null);
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
    mutationFn: ({ id, pin }: { id: number; pin?: string }) => apiRequest("DELETE", `/api/vendor-bills/${id}`, pin ? { pin } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Bill deleted" });
      setSelectedBillId(null);
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
    setLineItems([{ date: "", category: "equipment", description: "", qty: 0, unit: "HRS", rate: 0, amount: 0, source: "manual", equipmentId: null, leadDistance: null }]);
    setAdjustmentLabel("");
    setAdjustmentAmount(0);
    setEditingBillId(null);
    setAdminPinForUpdate(null);
    setVendorSearch("");
    setShowVendorDropdown(false);
    setShowVendorDiscovery(false);
  };

  const handleSelectDiscoveredVendor = (vendor: DiscoveredVendor) => {
    setVendorName(vendor.vendorName);
    setVendorSearch(vendor.vendorName);
    setShowVendorDiscovery(false);
  };

  const handleEditExistingBill = (billId: number) => {
    const bill = bills?.find(b => b.id === billId);
    if (bill) {
      loadBillForEdit(bill);
      setShowVendorDiscovery(false);
    } else {
      setSelectedBillId(billId);
      setView("detail");
      setShowVendorDiscovery(false);
    }
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
        leadDistance: item.leadDistance ?? null,
      }))
    );
    setAdjustmentLabel((bill as any).adjustmentLabel || "");
    setAdjustmentAmount((bill as any).adjustmentAmount || 0);
    setEditingBillId(bill.id);
    setView("form");
  };

  const handleAutoPopulate = async () => {
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
        leadDistance: item.leadDistance ?? null,
      }));

      try {
        const res = await fetch(`/api/vendor-bills/previous-rates?vendorName=${encodeURIComponent(vendorName)}`);
        if (res.ok) {
          const previousRates: Record<string, { rate: number; leadDistance?: number }> = await res.json();
          let appliedCount = 0;
          for (let i = 0; i < mapped.length; i++) {
            const item = mapped[i];
            if (item.rate === 0 && item.equipmentId) {
              const entryTypeMatch = item.description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/);
              const entryType = entryTypeMatch ? entryTypeMatch[1].replace(/\s+/g, "_").replace(/\//g, "_") : "OTHER";
              const key = `${item.equipmentId}_${entryType}`;
              const prev = previousRates[key];
              if (prev && prev.rate > 0) {
                mapped[i] = { ...item, rate: prev.rate, leadDistance: prev.leadDistance ?? item.leadDistance };
                mapped[i].amount = calcAmount(mapped[i]);
                appliedCount++;
              }
            }
          }
          if (appliedCount > 0) {
            toast({ title: `Applied rates from previous bill for ${appliedCount} items` });
          }
        }
      } catch (_e) {
      }

      setLineItems(mapped);
      toast({ title: `${mapped.length} items auto-populated from records` });
    }
  };

  const getDefaultCategory = () => {
    if (billType === "transport" || billType === "equipment" || billType === "material") return billType;
    return "other";
  };

  const getDefaultUnit = () => {
    if (billType === "transport") return "TRIP";
    return "HRS";
  };

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { date: "", category: getDefaultCategory(), description: "", qty: 0, unit: getDefaultUnit(), rate: 0, amount: 0, source: "manual", equipmentId: null, leadDistance: null },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const calcAmount = (item: LineItem) => {
    if (item.category === "transport" && item.leadDistance && item.leadDistance > 0) {
      return item.leadDistance * 2 * (item.rate || 0);
    }
    return (item.qty || 0) * (item.rate || 0);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "category" && value !== "transport") {
        updated[index].leadDistance = null;
      }
      if (field === "qty" || field === "rate" || field === "leadDistance" || field === "category") {
        updated[index].amount = calcAmount(updated[index]);
      }
      return updated;
    });
  };

  const totalAmount = useMemo(() => lineItems.reduce((sum, item) => sum + (item.amount || 0), 0), [lineItems]);
  const netTotal = useMemo(() => totalAmount + (adjustmentAmount || 0), [totalAmount, adjustmentAmount]);

  const computeCategorySubTotals = (items: { category?: string | null; amount?: number | null }[]) => {
    const cats: Record<string, number> = {};
    items.forEach(item => {
      const cat = item.category || "other";
      cats[cat] = (cats[cat] || 0) + (item.amount || 0);
    });
    return Object.entries(cats).filter(([, amt]) => amt !== 0).sort(([a], [b]) => a.localeCompare(b));
  };

  const applyRateToSimilar = (sourceIdx: number) => {
    const source = lineItems[sourceIdx];
    if (!source.rate || source.rate <= 0) return;
    const sourceEntryType = source.description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/)?.[1] || "";
    let applied = 0;
    let skipped = 0;
    setLineItems(prev => {
      const updated = [...prev];
      for (let i = 0; i < updated.length; i++) {
        if (i === sourceIdx) continue;
        const itemEntryType = updated[i].description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/)?.[1] || "";
        const sameEquipment = source.equipmentId && updated[i].equipmentId === source.equipmentId;
        const sameType = sourceEntryType && itemEntryType === sourceEntryType;
        if (sameEquipment && sameType) {
          if (!updated[i].rate || updated[i].rate === 0) {
            const newItem = { ...updated[i], rate: source.rate };
            newItem.amount = calcAmount(newItem);
            updated[i] = newItem;
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

  const uniqueEquipmentGroups = useMemo(() => {
    const groups: Record<string, { equipmentId: number; equipmentName: string; entryType: string; category: string; count: number }> = {};
    lineItems.forEach(item => {
      if (!item.equipmentId) return;
      const entryTypeMatch = item.description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/);
      const entryType = entryTypeMatch ? entryTypeMatch[1] : "OTHER";
      const key = `${item.equipmentId}_${entryType}`;
      if (!groups[key]) {
        const nameMatch = item.description.match(/^(.+?)\s*(?:-\s*)?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/);
        const equipmentName = nameMatch ? nameMatch[1].trim() : item.description.split(" - ")[0] || item.description;
        groups[key] = { equipmentId: item.equipmentId, equipmentName, entryType, category: item.category, count: 0 };
      }
      groups[key].count++;
    });
    return Object.entries(groups).map(([key, val]) => ({ key, ...val }));
  }, [lineItems]);

  const openSetRatesDialog = () => {
    const initialRates: Record<string, { rate: number; leadDistance: number }> = {};
    uniqueEquipmentGroups.forEach(group => {
      const existing = lineItems.find(item => item.equipmentId === group.equipmentId && item.description.includes(group.entryType) && item.rate > 0);
      initialRates[group.key] = {
        rate: existing?.rate || 0,
        leadDistance: existing?.leadDistance || 0,
      };
    });
    setBulkRates(initialRates);
    setShowSetRatesDialog(true);
  };

  const applyBulkRates = () => {
    let applied = 0;
    setLineItems(prev => {
      const updated = [...prev];
      for (let i = 0; i < updated.length; i++) {
        const item = updated[i];
        if (!item.equipmentId) continue;
        const entryTypeMatch = item.description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/);
        const entryType = entryTypeMatch ? entryTypeMatch[1] : "OTHER";
        const key = `${item.equipmentId}_${entryType}`;
        const rateData = bulkRates[key];
        if (rateData && rateData.rate > 0) {
          const newItem = { ...item, rate: rateData.rate };
          if (item.category === "transport" && rateData.leadDistance > 0) {
            newItem.leadDistance = rateData.leadDistance;
          }
          newItem.amount = calcAmount(newItem);
          updated[i] = newItem;
          applied++;
        }
      }
      return updated;
    });
    setShowSetRatesDialog(false);
    toast({ title: `Rates applied to ${applied} item${applied !== 1 ? "s" : ""}` });
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
      adjustmentLabel: adjustmentLabel || null,
      adjustmentAmount: adjustmentAmount || 0,
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
        leadDistance: item.leadDistance,
      })),
    };

    if (editingBillId) {
      updateMutation.mutate({ id: editingBillId, data, pin: adminPinForUpdate });
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

  const handleEditPinSuccess = (_role: "manager" | "admin", _pin: string) => {
    setShowEditPinAuth(false);
    if (pendingEditAction) {
      setAdminPinForUpdate(_pin);
      loadBillForEdit(pendingEditAction.bill);
      setPendingEditAction(null);
    }
  };

  const handleDeletePinSuccess = (_role: "manager" | "admin", _pin: string) => {
    setShowDeletePinAuth(false);
    if (pendingDeleteAction) {
      deleteMutation.mutate({ id: pendingDeleteAction.billId, pin: _pin });
      setPendingDeleteAction(null);
    }
  };

  const handleEditBill = (bill: VendorBillWithItems) => {
    if (bill.status === "verified" || bill.status === "approved") {
      setPendingEditAction({ bill });
      setShowEditPinAuth(true);
    } else {
      loadBillForEdit(bill);
    }
  };

  const handleDeleteBill = (bill: VendorBillWithItems) => {
    if (bill.status === "verified" || bill.status === "approved") {
      setPendingDeleteAction({ billId: bill.id });
      setShowDeletePinAuth(true);
    } else {
      deleteMutation.mutate({ id: bill.id });
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

  const escHtml = (str: string) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };

  const handlePrint = (bill: VendorBillWithItems) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "Please allow pop-ups to print", variant: "destructive" });
      return;
    }
    const hasLeadDistance = bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0);
    const rows = bill.items.map((item: any, i: number) => `
      <tr class="${i % 2 === 0 ? "even" : "odd"}">
        <td style="text-align:center">${i + 1}</td>
        <td>${escHtml(item.date || "-")}</td>
        <td style="text-align:center">${item.category ? escHtml(getCategoryLabel(item.category).toUpperCase()) : "-"}</td>
        <td>${escHtml(item.description)}</td>
        <td style="text-align:center">${item.qty || 0}</td>
        <td style="text-align:center">${item.unit || ""}</td>
        ${hasLeadDistance ? `<td style="text-align:center">${item.leadDistance ? `${item.leadDistance} (RT: ${item.leadDistance * 2})` : "-"}</td>` : ""}
        <td style="text-align:right">${formatCurrency(item.rate)}</td>
        <td style="text-align:right">${formatCurrency(item.amount)}</td>
      </tr>
    `).join("");

    const totalQty = bill.items.reduce((s: number, it: any) => s + (it.qty || 0), 0);
    const totalItems = bill.items.length;

    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Vendor Bill - ${bill.billNo}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 24px; color: #000; }
        .header { text-align: center; margin-bottom: 16px; border-bottom: 3px solid #d97706; padding-bottom: 12px; }
        .header h1 { font-size: 22px; letter-spacing: 2px; margin-bottom: 4px; color: #000; }
        .header .subtitle { font-size: 14px; color: #333; text-transform: uppercase; letter-spacing: 1px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .meta-grid .item { padding: 4px 0; }
        .meta-grid .label { color: #333; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; font-weight: bold; }
        .meta-grid .value { font-weight: bold; font-size: 13px; color: #000; }
        .status-badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; background: #d97706; color: white; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; font-size: 12px; color: #000; }
        th { background: #d97706; color: white; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        tr.odd { background: #f9f9f9; }
        .summary-row td { font-weight: bold; font-size: 12px; background: #f5f5f5; color: #000; border-color: #999; }
        .total-row { background: #d97706 !important; }
        .total-row td { color: white; font-weight: bold; font-size: 13px; border-color: #b45309; }
        .notes { margin-top: 16px; padding: 10px 14px; background: #fffbeb; border-left: 3px solid #d97706; font-size: 12px; color: #000; }
        .notes strong { font-size: 11px; text-transform: uppercase; color: #92400e; }
        .signatures { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-start; page-break-inside: avoid; }
        .sig-block { width: 220px; text-align: center; }
        .sig-block.vendor { margin-top: 30px; }
        .sig-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 6px; font-size: 11px; color: #000; }
        .sig-label { font-size: 11px; font-weight: bold; color: #000; }
        .footer { margin-top: 30px; font-size: 10px; color: #555; text-align: center; border-top: 1px solid #ccc; padding-top: 8px; }
        @media print { body { padding: 12px; } .signatures { page-break-inside: avoid; } }
      </style></head><body>
      <div class="header">
        <h1>HIGH LANE CONSTRUCTIONS</h1>
        <div class="subtitle">Vendor Bill</div>
      </div>
      <div class="meta-grid">
        <div class="item"><div class="label">Bill Number</div><div class="value">${escHtml(bill.billNo)}</div></div>
        <div class="item"><div class="label">Bill Date</div><div class="value">${escHtml(bill.billDate)}</div></div>
        <div class="item"><div class="label">Vendor</div><div class="value">${escHtml(bill.vendorName)}</div></div>
        <div class="item"><div class="label">Bill Type</div><div class="value">${escHtml(getBillTypeLabel(bill.billType))}</div></div>
        ${bill.periodFrom && bill.periodTo ? `<div class="item"><div class="label">Period</div><div class="value">${escHtml(bill.periodFrom)} to ${escHtml(bill.periodTo)}</div></div>` : ""}
        <div class="item"><div class="label">Status</div><div class="value"><span class="status-badge">${escHtml(bill.status.toUpperCase())}</span></div></div>
      </div>
      <table><thead><tr><th>#</th><th>Date</th><th>Type</th><th>Description</th><th>Qty</th><th>Unit</th>${hasLeadDistance ? "<th>Lead (KM)</th>" : ""}<th style="text-align:right">Rate (₹)</th><th style="text-align:right">Amount (₹)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="summary-row"><td colspan="${hasLeadDistance ? 5 : 4}" style="text-align:right">TOTAL ITEMS: ${totalItems}</td><td style="text-align:center">${totalQty}</td><td colspan="${hasLeadDistance ? 4 : 3}"></td></tr>
        ${(() => {
          const catSubs = computeCategorySubTotals(bill.items);
          if (catSubs.length <= 1) return "";
          return catSubs.map(([cat, amt]: [string, number]) => `
            <tr class="summary-row"><td colspan="${hasLeadDistance ? 8 : 7}" style="text-align:right">${cat === "equipment" ? "Equipment" : cat === "material" ? "Material" : cat === "transport" ? "Transport" : "Other"} Sub-total</td><td style="text-align:right">Rs. ${formatCurrency(amt)}</td></tr>
          `).join("");
        })()}
        <tr class="total-row"><td colspan="${hasLeadDistance ? 8 : 7}" style="text-align:right">TOTAL AMOUNT</td><td style="text-align:right">Rs. ${formatCurrency(bill.totalAmount)}</td></tr>
        ${(bill as any).adjustmentAmount && (bill as any).adjustmentAmount !== 0 ? `
          <tr class="summary-row"><td colspan="${hasLeadDistance ? 8 : 7}" style="text-align:right">${escHtml((bill as any).adjustmentLabel || "ADJUSTMENT")}</td><td style="text-align:right">Rs. ${formatCurrency((bill as any).adjustmentAmount)}</td></tr>
          <tr class="total-row"><td colspan="${hasLeadDistance ? 8 : 7}" style="text-align:right">NET TOTAL</td><td style="text-align:right">Rs. ${formatCurrency((bill.totalAmount || 0) + ((bill as any).adjustmentAmount || 0))}</td></tr>
        ` : ""}
      </tfoot>
      </table>
      ${bill.notes ? `<div class="notes"><strong>Notes / Remarks:</strong><br/>${escHtml(bill.notes)}</div>` : ""}
      <div class="signatures">
        <div class="sig-block vendor">
          <div class="sig-label">Vendor Acknowledgement</div>
          <div class="sig-line">${escHtml(bill.vendorName)}</div>
        </div>
        <div class="sig-block">
          <div class="sig-label">For HIGH LANE CONSTRUCTIONS</div>
          <div class="sig-line">Authorized Signatory</div>
        </div>
      </div>
      <div class="footer">Generated on ${new Date().toLocaleString("en-IN")} | HIGH LANE CONSTRUCTIONS</div>
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
                <Select value={billType} onValueChange={(val) => {
                  setBillType(val);
                  const newCat = (val === "transport" || val === "equipment" || val === "material") ? val : "other";
                  const newUnit = val === "transport" ? "TRIP" : undefined;
                  setLineItems(prev => prev.map(item => {
                    if (item.source === "manual") {
                      const updated = { ...item, category: newCat };
                      if (newUnit) updated.unit = newUnit;
                      if (newCat !== "transport") updated.leadDistance = null;
                      updated.amount = calcAmount(updated);
                      return updated;
                    }
                    return item;
                  }));
                }}>
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

            {periodFrom && periodTo && billType !== "other" && !vendorName && (
              <div className="border-t pt-4">
                <Button
                  variant="default"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => setShowVendorDiscovery(true)}
                  disabled={discoveryLoading}
                  data-testid="button-show-vendors"
                >
                  {discoveryLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  SHOW AVAILABLE VENDORS
                </Button>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Bill Status</p>
              {renderStatusSteps("draft")}
            </div>
          </CardContent>
        </Card>

        {showVendorDiscovery && periodFrom && periodTo && billType !== "other" && (
          <Card data-testid="card-vendor-discovery">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">AVAILABLE VENDORS</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowVendorDiscovery(false)} data-testid="button-close-discovery">
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {discoveryLoading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                  <span className="text-sm text-muted-foreground">Scanning records...</span>
                </div>
              ) : !discoveredVendors || discoveredVendors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-vendors">
                  No records found for this type and period
                </div>
              ) : (
                <div className="space-y-2">
                  {discoveredVendors.map((vendor) => (
                    <div
                      key={vendor.vendorName}
                      className="flex items-center justify-between gap-3 p-3 border rounded-md flex-wrap"
                      data-testid={`row-vendor-${vendor.vendorName}`}
                    >
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <span className="font-semibold text-sm truncate" data-testid={`text-vendor-name-${vendor.vendorName}`}>
                          {vendor.vendorName}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground" data-testid={`text-record-count-${vendor.vendorName}`}>
                            {vendor.recordCount} record{vendor.recordCount !== 1 ? "s" : ""}
                          </span>
                          {vendor.categories.map(cat => (
                            <Badge
                              key={cat}
                              variant="outline"
                              className={`text-[10px] ${getCategoryBadgeClass(cat)} no-default-hover-elevate no-default-active-elevate`}
                              data-testid={`badge-cat-${vendor.vendorName}-${cat}`}
                            >
                              {getCategoryLabel(cat)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {vendor.existingBill ? (
                          <>
                            <Badge
                              variant={getStatusBadgeVariant(vendor.existingBill.status)}
                              className={`text-xs uppercase ${getStatusColor(vendor.existingBill.status)}`}
                              data-testid={`badge-bill-status-${vendor.vendorName}`}
                            >
                              {vendor.existingBill.status} - {vendor.existingBill.billNo}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditExistingBill(vendor.existingBill!.id)}
                              data-testid={`button-edit-bill-${vendor.vendorName}`}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              EDIT
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-muted-foreground">NO BILL</span>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleSelectDiscoveredVendor(vendor)}
                              data-testid={`button-select-vendor-${vendor.vendorName}`}
                            >
                              <PlusCircle className="w-3 h-3 mr-1" />
                              SELECT &amp; CREATE
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
            <div className="flex gap-2 flex-wrap">
              {uniqueEquipmentGroups.length > 0 && (
                <Button variant="outline" size="sm" onClick={openSetRatesDialog} data-testid="button-set-rates">
                  <DollarSign className="w-4 h-4 mr-1" /> SET RATES
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={addLineItem} data-testid="button-add-item">
                <Plus className="w-4 h-4 mr-1" /> ADD ITEM
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 800 }}>
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="px-2 py-2 text-left w-8">#</th>
                  <th className="px-2 py-2 text-left w-28">Date</th>
                  <th className="px-2 py-2 text-center w-16">Type</th>
                  <th className="px-2 py-2 text-left">Description</th>
                  <th className="px-2 py-2 text-left w-24">Qty</th>
                  <th className="px-2 py-2 text-left w-20">Unit</th>
                  {(billType === "transport" || lineItems.some(i => i.leadDistance !== null)) && (
                    <th className="px-2 py-2 text-left w-24">Lead (KM)</th>
                  )}
                  <th className="px-2 py-2 text-left w-24">Rate</th>
                  <th className="px-2 py-2 text-right w-32">Amount</th>
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
                    {(billType === "transport" || lineItems.some(i => i.leadDistance !== null)) && (
                      <td className="px-2 py-1.5">
                        {item.category === "transport" ? (
                          <div className="space-y-0.5">
                            <Input
                              type="number"
                              value={item.leadDistance || ""}
                              onChange={e => updateLineItem(idx, "leadDistance", parseFloat(e.target.value) || 0)}
                              placeholder="ONE-WAY KM"
                              className="text-xs h-8"
                              data-testid={`input-item-lead-${idx}`}
                            />
                            {item.leadDistance && item.leadDistance > 0 && (
                              <span className="text-[10px] text-muted-foreground">RT: {item.leadDistance * 2} KM</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    )}
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
                {computeCategorySubTotals(lineItems).length > 1 && computeCategorySubTotals(lineItems).map(([cat, amt]) => (
                  <tr key={cat} className="border-t bg-muted/30">
                    <td colSpan={(billType === "transport" || lineItems.some(i => i.leadDistance !== null)) ? 8 : 7} className="px-2 py-2 text-right text-xs font-semibold uppercase" data-testid={`text-subtotal-label-${cat}`}>
                      {cat === "equipment" ? "Equipment" : cat === "material" ? "Material" : cat === "transport" ? "Transport" : "Other"} Sub-total
                    </td>
                    <td className="px-2 py-2 text-right text-xs font-semibold" data-testid={`text-subtotal-amount-${cat}`}>Rs. {formatCurrency(amt)}</td>
                    <td></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                  <td colSpan={(billType === "transport" || lineItems.some(i => i.leadDistance !== null)) ? 8 : 7} className="px-2 py-3 text-right font-bold text-base">TOTAL</td>
                  <td className="px-2 py-3 text-right font-bold text-base" data-testid="text-total-amount">Rs. {formatCurrency(totalAmount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Adjustments</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="md:col-span-2">
                  <Label className="text-xs uppercase">Adjustment Description</Label>
                  <Input
                    value={adjustmentLabel}
                    onChange={e => setAdjustmentLabel(e.target.value.toUpperCase())}
                    placeholder="e.g., ADVANCE DEDUCTION, TDS, SECURITY DEPOSIT"
                    className="uppercase"
                    data-testid="input-adjustment-label"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase">Adjustment Amount</Label>
                  <Input
                    type="number"
                    value={adjustmentAmount || ""}
                    onChange={e => setAdjustmentAmount(parseFloat(e.target.value) || 0)}
                    placeholder="Negative for deduction"
                    data-testid="input-adjustment-amount"
                  />
                </div>
              </div>
              {adjustmentAmount !== 0 && (
                <div className="flex justify-between items-center p-3 rounded-md bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700">
                  <span className="text-sm font-semibold uppercase">{adjustmentLabel || "ADJUSTMENT"}: Rs. {formatCurrency(adjustmentAmount)}</span>
                  <span className="text-base font-bold" data-testid="text-net-total">NET TOTAL: Rs. {formatCurrency(netTotal)}</span>
                </div>
              )}
            </div>
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

        <Dialog open={showSetRatesDialog} onOpenChange={setShowSetRatesDialog}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>SET RATES FOR EQUIPMENT</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {uniqueEquipmentGroups.map(group => (
                <div key={group.key} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold" data-testid={`text-rate-equip-${group.key}`}>{group.equipmentName}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${getCategoryBadgeClass(group.category)} no-default-hover-elevate no-default-active-elevate`}>
                          {getCategoryLabel(group.category)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{group.entryType}</span>
                        <span className="text-xs text-muted-foreground">({group.count} rows)</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[120px]">
                      <Label className="text-xs uppercase">Rate</Label>
                      <Input
                        type="number"
                        value={bulkRates[group.key]?.rate || ""}
                        onChange={e => setBulkRates(prev => ({ ...prev, [group.key]: { ...prev[group.key], rate: parseFloat(e.target.value) || 0 } }))}
                        placeholder="0"
                        data-testid={`input-bulk-rate-${group.key}`}
                      />
                    </div>
                    {group.category === "transport" && (
                      <div className="flex-1 min-w-[120px]">
                        <Label className="text-xs uppercase">Lead Distance (KM)</Label>
                        <Input
                          type="number"
                          value={bulkRates[group.key]?.leadDistance || ""}
                          onChange={e => setBulkRates(prev => ({ ...prev, [group.key]: { ...prev[group.key], leadDistance: parseFloat(e.target.value) || 0 } }))}
                          placeholder="0"
                          data-testid={`input-bulk-lead-${group.key}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2 flex-wrap">
                <Button variant="outline" onClick={() => setShowSetRatesDialog(false)} data-testid="button-cancel-rates">
                  CANCEL
                </Button>
                <Button onClick={applyBulkRates} data-testid="button-apply-rates">
                  <Check className="w-4 h-4 mr-1" /> APPLY RATES
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
            {["verified", "approved", "paid"].includes(bill.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = `/api/vendor-bills/${bill.id}/pdf`;
                  link.download = `VendorBill-${bill.billNo}.pdf`;
                  link.click();
                }}
                data-testid="button-export-pdf"
              >
                <Download className="w-4 h-4 mr-1" /> EXPORT PDF
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => handlePrint(bill)} data-testid="button-print">
              <Printer className="w-4 h-4 mr-1" /> PRINT
            </Button>
            {bill.status !== "paid" && (
              <Button size="sm" onClick={() => handleEditBill(bill)} data-testid="button-edit-bill">
                <Edit className="w-4 h-4 mr-1" /> EDIT
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
                {bill.status !== "paid" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDeleteBill(bill)}
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete-bill"
                  >
                    {deleteMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                    <Trash2 className="w-3 h-3 mr-1" /> DELETE BILL
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
                  <th className="px-2 py-2 text-left w-24">Qty</th>
                  <th className="px-2 py-2 text-left w-16">Unit</th>
                  {bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0) && (
                    <th className="px-2 py-2 text-left w-24">Lead (KM)</th>
                  )}
                  <th className="px-2 py-2 text-right w-24">Rate</th>
                  <th className="px-2 py-2 text-right w-32">Amount</th>
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
                    {bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0) && (
                      <td className="px-2 py-2 text-xs">
                        {item.leadDistance && item.leadDistance > 0 ? (
                          <span>{item.leadDistance} <span className="text-muted-foreground">(RT: {item.leadDistance * 2})</span></span>
                        ) : "-"}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right text-xs">{formatCurrency(item.rate)}</td>
                    <td className="px-2 py-2 text-right font-semibold bg-amber-50 dark:bg-amber-900/20 text-xs" data-testid={`text-detail-item-amount-${idx}`}>
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {computeCategorySubTotals(bill.items).length > 1 && computeCategorySubTotals(bill.items).map(([cat, amt]) => (
                  <tr key={cat} className="border-t bg-muted/30">
                    <td colSpan={bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0) ? 7 : 6} className="px-2 py-2 text-right text-xs font-semibold uppercase">
                      {cat === "equipment" ? "Equipment" : cat === "material" ? "Material" : cat === "transport" ? "Transport" : "Other"} Sub-total
                    </td>
                    <td className="px-2 py-2 text-right text-xs font-semibold" colSpan={2}>Rs. {formatCurrency(amt)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                  <td colSpan={bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0) ? 7 : 6} className="px-2 py-3 text-right font-bold">TOTAL</td>
                  <td className="px-2 py-3 text-right font-bold text-base" colSpan={2}>Rs. {formatCurrency(bill.totalAmount)}</td>
                </tr>
                {(bill as any).adjustmentAmount && (bill as any).adjustmentAmount !== 0 && (
                  <>
                    <tr className="bg-muted/20">
                      <td colSpan={bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0) ? 7 : 6} className="px-2 py-2 text-right text-sm font-semibold uppercase">
                        {(bill as any).adjustmentLabel || "ADJUSTMENT"}
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-semibold" colSpan={2}>Rs. {formatCurrency((bill as any).adjustmentAmount)}</td>
                    </tr>
                    <tr className="border-t-2 border-amber-600 bg-amber-100 dark:bg-amber-900/30">
                      <td colSpan={bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0) ? 7 : 6} className="px-2 py-3 text-right font-bold text-base">NET TOTAL</td>
                      <td className="px-2 py-3 text-right font-bold text-base" colSpan={2}>Rs. {formatCurrency((bill.totalAmount || 0) + ((bill as any).adjustmentAmount || 0))}</td>
                    </tr>
                  </>
                )}
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

        {showEditPinAuth && (
          <PinAuth
            targetRole="admin"
            onSuccess={handleEditPinSuccess}
            onClose={() => { setShowEditPinAuth(false); setPendingEditAction(null); }}
          />
        )}

        {showDeletePinAuth && (
          <PinAuth
            targetRole="admin"
            onSuccess={handleDeletePinSuccess}
            onClose={() => { setShowDeletePinAuth(false); setPendingDeleteAction(null); }}
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
              <div className="relative">
                <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
                {filterDateFrom && (
                  <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-full w-8" onClick={() => setFilterDateFrom("")} data-testid="button-clear-date-from">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase">Date To</Label>
              <div className="relative">
                <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
                {filterDateTo && (
                  <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-full w-8" onClick={() => setFilterDateTo("")} data-testid="button-clear-date-to">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase">Vendor</Label>
              <div className="flex items-center gap-1">
                <Select value={filterVendor} onValueChange={setFilterVendor}>
                  <SelectTrigger data-testid="filter-vendor" className="flex-1">
                    <SelectValue placeholder="ALL VENDORS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL VENDORS</SelectItem>
                    {vendorNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filterVendor !== "all" && (
                  <Button size="icon" variant="ghost" onClick={() => setFilterVendor("all")} data-testid="button-clear-vendor">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase">Status</Label>
              <div className="flex items-center gap-1">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger data-testid="filter-status" className="flex-1">
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
                {filterStatus !== "all" && (
                  <Button size="icon" variant="ghost" onClick={() => setFilterStatus("all")} data-testid="button-clear-status">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {(filterDateFrom || filterDateTo || filterVendor !== "all" || filterStatus !== "all") && (
            <div className="flex justify-end mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setFilterVendor("all"); setFilterStatus("all"); }}
                data-testid="button-clear-all-filters"
              >
                <X className="w-3 h-3 mr-1" />
                CLEAR FILTERS
              </Button>
            </div>
          )}
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
